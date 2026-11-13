'use strict';

/**
 * KubeLabs v4.0 - Bi-Directional VFS, Editor & Topology Sync Coordinator
 * Subphase 1.3.3
 *
 * Provides real-time, low-latency (< 50ms) bi-directional synchronization between:
 * 1. POSIX Virtual File System (/home/learner/workspace/)
 * 2. Workbench Code/Manifest Editor (Monaco/ACE/Textarea)
 * 3. Live Cluster State Graph & Interactive SVG Topology
 * 4. Deterministic Background Validation Evaluator
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let yamlParser = {};
    try {
      yamlParser = require('./yamlParser');
    } catch {
      yamlParser = (typeof globalThis !== 'undefined' && globalThis.yamlParser) || {};
    }
    module.exports = factory(yamlParser);
  } else {
    root.SyncCoordinator = factory(root.yamlParser || {});
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (yamlParser) {

  function normalizePath(p) {
    if (!p) return '/';
    let s = String(p).replace(/\\/g, '/');
    while (s.includes('//')) s = s.replace(/\/\//g, '/');
    return s;
  }

  function getResourceKey(r) {
    if (!r) return '';
    const kind = r.kind || 'Resource';
    const ns = r.metadata?.namespace || r.namespace || 'default';
    const name = r.metadata?.name || r.name || 'unnamed';
    return `${kind}:${ns}:${name}`;
  }

  class SyncCoordinator {
    /**
     * @param {Object} options
     * @param {Object} [options.vfs] VirtualFileSystem instance
     * @param {Object} [options.cluster] VirtualCluster instance
     * @param {Object} [options.graph] ResourceGraph instance
     * @param {Object} [options.validator] ValidationEngine instance
     * @param {string} [options.activeFilePath='/home/learner/workspace/manifest.yaml']
     * @param {number} [options.debounceMs=50] Debounce interval for editor writes (<100ms)
     */
    constructor(options = {}) {
      this.vfs = options.vfs || null;
      this.cluster = options.cluster || null;
      this.graph = options.graph || null;
      this.validator = options.validator || null;
      this.activeFilePath = normalizePath(options.activeFilePath || '/home/learner/workspace/manifest.yaml');
      this.debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 50;

      this.listeners = new Map();
      this.isSyncing = false; // re-entrancy prevention guard
      this.unwatchFns = [];
      this.debounceTimer = null;
      this.lastEditorContent = '';
      this.lastTopologySnapshot = null;

      this._init();
    }

    _init() {
      if (this.vfs) {
        this.bindVfs(this.vfs);
      }
      if (this.cluster) {
        this.bindCluster(this.cluster);
      }
      if (this.graph) {
        this.bindGraph(this.graph);
      }
    }

    // -------------------------------------------------------------------------
    // Event Bus (on, off, emit)
    // -------------------------------------------------------------------------

    on(event, callback) {
      if (typeof callback !== 'function') return () => {};
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      const bucket = this.listeners.get(event);
      bucket.add(callback);
      return () => bucket.delete(callback);
    }

    off(event, callback) {
      if (!this.listeners.has(event)) return;
      this.listeners.get(event).delete(callback);
    }

    emit(event, ...args) {
      if (!this.listeners.has(event)) return;
      for (const cb of this.listeners.get(event)) {
        try {
          cb(...args);
        } catch (err) {
          console.error(`Error in SyncCoordinator listener for '${event}':`, err);
        }
      }
    }

    // -------------------------------------------------------------------------
    // VFS Binding & Event Listening
    // -------------------------------------------------------------------------

    bindVfs(vfs) {
      if (!vfs) return;
      this.vfs = vfs;

      // Ensure standard workspace directory structure exists
      try {
        if (typeof this.vfs.mkdir === 'function') {
          this.vfs.mkdir('/home/learner/workspace', { recursive: true });
        }
      } catch {}

      if (typeof this.vfs.watch === 'function') {
        // Watch workspace root
        const unsubWorkspace = this.vfs.watch('/home/learner/workspace', (eventType, targetPath, content) => {
          this.onVfsEvent(eventType, targetPath, content);
        });
        this.unwatchFns.push(unsubWorkspace);

        // Also watch /home/learner for root manifest.yaml modifications
        const unsubHome = this.vfs.watch('/home/learner', (eventType, targetPath, content) => {
          this.onVfsEvent(eventType, targetPath, content);
        });
        this.unwatchFns.push(unsubHome);
      }
    }

    isMatchingActiveFile(targetPath) {
      if (!targetPath) return false;
      const cleanTarget = normalizePath(targetPath);
      const cleanActive = normalizePath(this.activeFilePath);
      if (cleanTarget === cleanActive) return true;

      // Handle common alias: /home/learner/manifest.yaml <-> /home/learner/workspace/manifest.yaml
      const targetBase = cleanTarget.split('/').pop();
      const activeBase = cleanActive.split('/').pop();
      if (targetBase === activeBase && (targetBase === 'manifest.yaml' || targetBase === 'main.tf' || targetBase === 'values.yaml')) {
        return true;
      }
      return false;
    }

    onVfsEvent(eventType, targetPath, content) {
      if (this.isSyncing) return; // Prevent re-entrancy loops from editor writes

      const cleanPath = normalizePath(targetPath);
      const isTargetActive = this.isMatchingActiveFile(cleanPath);

      if (isTargetActive) {
        this.isSyncing = true;
        try {
          let newContent = content;
          if (newContent === null && typeof this.vfs.readFile === 'function') {
            try {
              newContent = this.vfs.readFile(cleanPath);
            } catch {
              newContent = '';
            }
          }
          this.lastEditorContent = newContent || '';
          this.emit('editor:sync', {
            path: cleanPath,
            content: this.lastEditorContent,
            source: 'vfs',
            timestamp: Date.now()
          });

          // Run schema lint on updated external file
          this.lintSchema(this.lastEditorContent);
        } finally {
          this.isSyncing = false;
        }
      }

      this.emit('vfs:change', {
        path: cleanPath,
        content,
        eventType,
        source: 'cli',
        timestamp: Date.now()
      });
    }

    // -------------------------------------------------------------------------
    // Editor Input & Synchronization (< 50ms Debounced)
    // -------------------------------------------------------------------------

    onEditorInput(content, filePath = this.activeFilePath) {
      if (this.isSyncing) return;
      const text = typeof content === 'string' ? content : String(content || '');
      this.lastEditorContent = text;
      const targetPath = normalizePath(filePath || this.activeFilePath);

      // 1. Instant schema linting (< 5ms)
      this.lintSchema(text);

      // 2. Debounced VFS Write (< 50ms)
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.flushEditorToVfs(text, targetPath);
      }, this.debounceMs);
    }

    flushEditorToVfs(text = this.lastEditorContent, targetPath = this.activeFilePath) {
      if (!this.vfs || typeof this.vfs.writeFile !== 'function') return;

      this.isSyncing = true;
      try {
        const dir = targetPath.slice(0, targetPath.lastIndexOf('/')) || '/';
        try {
          if (typeof this.vfs.mkdir === 'function') {
            this.vfs.mkdir(dir, { recursive: true });
          }
        } catch {}

        this.vfs.writeFile(targetPath, text);

        // Also sync alias file (/home/learner/manifest.yaml) if active is in workspace
        if (targetPath.endsWith('manifest.yaml') && targetPath !== '/home/learner/manifest.yaml') {
          try {
            this.vfs.writeFile('/home/learner/manifest.yaml', text);
          } catch {}
        }

        this.emit('vfs:change', {
          path: targetPath,
          content: text,
          eventType: 'change',
          source: 'editor',
          timestamp: Date.now()
        });

        // Trigger live validation reconciliation if validator is bound
        this.reconcileValidation();
      } catch (err) {
        console.error('SyncCoordinator: Failed to write editor content to VFS:', err);
      } finally {
        this.isSyncing = false;
      }
    }

    lintSchema(content) {
      let valid = true;
      const errors = [];
      let parsed = null;

      if (!content || !content.trim()) {
        this.emit('schema:lint', { valid: true, errors: [], docs: [] });
        return { valid: true, errors: [] };
      }

      try {
        if (typeof yamlParser.parseYaml === 'function') {
          parsed = yamlParser.parseYaml(content);
        } else if (this.cluster && typeof this.cluster.parseManifests === 'function') {
          parsed = this.cluster.parseManifests(content);
        }
      } catch (err) {
        valid = false;
        errors.push({
          line: 1,
          message: err.message || 'YAML parsing error'
        });
      }

      // Check basic Kubernetes schema (kind & metadata.name)
      if (parsed) {
        const docs = Array.isArray(parsed) ? parsed : [parsed];
        for (let i = 0; i < docs.length; i++) {
          const doc = docs[i];
          if (doc && typeof doc === 'object') {
            if (!doc.kind) {
              errors.push({ line: i + 1, message: `Document ${i + 1} is missing required 'kind' field` });
              valid = false;
            }
            if (!doc.metadata || !doc.metadata.name) {
              errors.push({ line: i + 1, message: `Document ${i + 1} (${doc.kind || 'unknown'}) is missing 'metadata.name'` });
              valid = false;
            }
          }
        }
      }

      const report = { valid, errors, docs: parsed };
      this.emit('schema:lint', report);
      return report;
    }

    // -------------------------------------------------------------------------
    // Cluster & ResourceGraph Binding
    // -------------------------------------------------------------------------

    bindCluster(cluster) {
      if (!cluster) return;
      this.cluster = cluster;
      if (this.cluster.state) {
        this.lastTopologySnapshot = JSON.parse(JSON.stringify(this.cluster.state));
      }

      if (typeof this.cluster.on === 'function') {
        const unsubChange = this.cluster.on('change', () => this.onClusterStateChanged());
        const unsubReconcile = this.cluster.on('reconcile', () => this.onClusterStateChanged());
        this.unwatchFns.push(unsubChange, unsubReconcile);
      }
    }

    bindGraph(graph) {
      if (!graph) return;
      this.graph = graph;

      if (typeof this.graph.on === 'function') {
        const u1 = this.graph.on('Added', () => this.onClusterStateChanged());
        const u2 = this.graph.on('Modified', () => this.onClusterStateChanged());
        const u3 = this.graph.on('Deleted', () => this.onClusterStateChanged());
        this.unwatchFns.push(u1, u2, u3);
      }
    }

    onClusterStateChanged() {
      const currentState = this.cluster ? this.cluster.state : (this.graph ? { resources: this.graph.list({}) } : null);
      if (!currentState) return;

      const delta = this.computeTopologyDelta(currentState);
      const svg = this.renderTopologySvg(currentState);

      this.emit('topology:sync', {
        clusterState: currentState,
        delta,
        svg,
        timestamp: Date.now()
      });

      this.reconcileValidation();
    }

    computeTopologyDelta(newState) {
      const delta = {
        added: [],
        modified: [],
        deleted: []
      };

      const oldMap = new Map();
      if (this.lastTopologySnapshot && Array.isArray(this.lastTopologySnapshot.resources)) {
        for (const r of this.lastTopologySnapshot.resources) {
          oldMap.set(getResourceKey(r), r);
        }
      }

      const newMap = new Map();
      if (newState && Array.isArray(newState.resources)) {
        for (const r of newState.resources) {
          const key = getResourceKey(r);
          newMap.set(key, r);
          if (!oldMap.has(key)) {
            delta.added.push(r);
          } else {
            const oldR = oldMap.get(key);
            const oldPhase = oldR.status?.phase || oldR.status?.reason || '';
            const newPhase = r.status?.phase || r.status?.reason || '';
            const isDifferent = oldPhase !== newPhase
              || oldR.metadata?.resourceVersion !== r.metadata?.resourceVersion
              || JSON.stringify(oldR.spec) !== JSON.stringify(r.spec)
              || JSON.stringify(oldR.metadata?.labels) !== JSON.stringify(r.metadata?.labels)
              || JSON.stringify(oldR.status) !== JSON.stringify(r.status);
            if (isDifferent) {
              delta.modified.push(r);
            }
          }
        }
      }

      for (const [key, oldR] of oldMap.entries()) {
        if (!newMap.has(key)) {
          delta.deleted.push(oldR);
        }
      }

      this.lastTopologySnapshot = JSON.parse(JSON.stringify(newState));
      return delta;
    }

    // -------------------------------------------------------------------------
    // Manifest Application Pipeline (Editor -> VFS -> Cluster -> Topology)
    // -------------------------------------------------------------------------

    applyEditorManifest(manifestContent = null) {
      const text = manifestContent !== null ? manifestContent : this.lastEditorContent;
      if (!text || !text.trim()) {
        throw new Error('Manifest is empty');
      }

      // 1. Sync VFS immediately
      this.flushEditorToVfs(text, this.activeFilePath);

      // 2. Apply to Cluster
      let results = [];
      if (this.cluster && typeof this.cluster.applyManifest === 'function') {
        results = this.cluster.applyManifest(text);
      }

      // 3. Apply to ResourceGraph if present
      if (this.graph && typeof this.graph.set === 'function') {
        let docs = [];
        try {
          if (typeof yamlParser.parseAllYaml === 'function') {
            docs = yamlParser.parseAllYaml(text);
          } else if (typeof yamlParser.parseYaml === 'function') {
            const parsed = yamlParser.parseYaml(text);
            docs = Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch {}
        if (!Array.isArray(docs)) docs = [docs];
        for (const d of docs) {
          if (d && d.kind && d.metadata?.name) {
            this.graph.set(d);
          }
        }
      }

      // 4. Trigger Topology Sync & Live Validation
      this.onClusterStateChanged();

      return {
        applied: results,
        clusterState: this.cluster ? this.cluster.state : null,
        timestamp: Date.now()
      };
    }

    // -------------------------------------------------------------------------
    // Live Background Validation Reconciliation
    // -------------------------------------------------------------------------

    reconcileValidation() {
      if (!this.validator || typeof this.validator.evaluate !== 'function') return;

      try {
        const report = this.validator.evaluate(null, this.cluster || this.graph);
        this.emit('validation:sync', {
          report,
          passed: report.passed,
          score: report.score,
          timestamp: Date.now()
        });
      } catch (err) {
        console.error('SyncCoordinator: Error reconciling validation:', err);
      }
    }

    // -------------------------------------------------------------------------
    // Isomorphic Topology SVG Generator
    // -------------------------------------------------------------------------

    renderTopologySvg(clusterState) {
      if (!clusterState) return '';
      const resources = clusterState.resources || [];
      const ingresses = resources.filter((r) => r.kind === 'Ingress');
      const services = resources.filter((r) => r.kind === 'Service');
      const pods = resources.filter((r) => r.kind === 'Pod');
      const nodes = resources.filter((r) => r.kind === 'Node' || r.kind === 'PersistentVolumeClaim');

      const colX = { ing: 50, svc: 175, pod: 320, node: 470 };
      let svg = `
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
          </marker>
        </defs>
        <text x="${colX.ing}" y="18" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">INGRESS</text>
        <text x="${colX.svc}" y="18" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">SERVICE</text>
        <text x="${colX.pod}" y="18" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">PODS</text>
        <text x="${colX.node}" y="18" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">HOST / PVC</text>
      `;

      const ingY = ingresses.slice(0, 4).map((_, i) => 45 + i * 44);
      const svcY = services.slice(0, 4).map((_, i) => 38 + i * 38);
      const podY = pods.slice(0, 6).map((_, i) => 32 + i * 28);
      const nodeY = nodes.slice(0, 4).map((_, i) => 45 + i * 44);

      // Connecting links
      for (let i = 0; i < Math.min(ingresses.length, services.length); i++) {
        svg += `<line x1="${colX.ing + 24}" y1="${ingY[i]}" x2="${colX.svc - 24}" y2="${svcY[i]}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
      }
      for (let i = 0; i < Math.min(services.length, pods.length); i++) {
        svg += `<line x1="${colX.svc + 24}" y1="${svcY[i]}" x2="${colX.pod - 20}" y2="${podY[i]}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
      }
      for (let i = 0; i < Math.min(pods.length, nodes.length); i++) {
        svg += `<line x1="${colX.pod + 20}" y1="${podY[i]}" x2="${colX.node - 24}" y2="${nodeY[i]}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
      }

      // Render Nodes
      ingresses.slice(0, 4).forEach((r, i) => {
        const y = ingY[i];
        const name = r.metadata?.name || r.name;
        const boxWidth = Math.max(68, name.length * 7 + 16);
        svg += `
          <g class="topology-node" data-kind="Ingress" data-name="${name}">
            <rect x="${colX.ing - boxWidth / 2}" y="${y - 12}" width="${boxWidth}" height="24" rx="4" fill="#111827" stroke="#38bdf8" stroke-width="1.2" />
            <text x="${colX.ing}" y="${y + 3}" fill="#38bdf8" font-size="9" font-family="monospace" text-anchor="middle">${name}</text>
          </g>
        `;
      });

      services.slice(0, 4).forEach((r, i) => {
        const y = svcY[i];
        const name = r.metadata?.name || r.name;
        const hasEps = r.status && r.status.endpointCount > 0;
        const stroke = hasEps ? '#10b981' : '#f59e0b';
        const boxWidth = Math.max(64, name.length * 7 + 16);
        svg += `
          <g class="topology-node" data-kind="Service" data-name="${name}">
            <rect x="${colX.svc - boxWidth / 2}" y="${y - 12}" width="${boxWidth}" height="24" rx="4" fill="#111827" stroke="${stroke}" stroke-width="1.2" />
            <text x="${colX.svc}" y="${y + 3}" fill="${stroke}" font-size="9" font-family="monospace" text-anchor="middle">${name}</text>
          </g>
        `;
      });

      pods.slice(0, 6).forEach((r, i) => {
        const y = podY[i];
        const name = r.metadata?.name || r.name;
        const phase = (r.status && (r.status.phase || r.status.reason)) || 'Pending';
        const isHealthy = phase === 'Running';
        const isPending = phase.includes('Pending') || phase.includes('Creating');
        const stroke = isHealthy ? '#10b981' : isPending ? '#f59e0b' : '#ef4444';
        svg += `
          <g class="topology-node" data-kind="Pod" data-name="${name}">
            <circle cx="${colX.pod}" cy="${y}" r="10" fill="#111827" stroke="${stroke}" stroke-width="1.5" />
            <text x="${colX.pod}" y="${y + 3}" fill="${stroke}" font-size="8" font-family="monospace" text-anchor="middle">${isHealthy ? '●' : '!'}</text>
            <text x="${colX.pod + 16}" y="${y + 3}" fill="#cbd5e1" font-size="8.5" font-family="monospace">${name}</text>
          </g>
        `;
      });

      nodes.slice(0, 4).forEach((r, i) => {
        const y = nodeY[i];
        const name = r.metadata?.name || r.name;
        const boxWidth = Math.max(68, name.length * 7 + 16);
        svg += `
          <g class="topology-node" data-kind="${r.kind}" data-name="${name}">
            <rect x="${colX.node - boxWidth / 2}" y="${y - 12}" width="${boxWidth}" height="24" rx="4" fill="#111827" stroke="#a855f7" stroke-width="1.2" />
            <text x="${colX.node}" y="${y + 3}" fill="#c084fc" font-size="9" font-family="monospace" text-anchor="middle">${name}</text>
          </g>
        `;
      });

      return svg;
    }

    // -------------------------------------------------------------------------
    // Lifecycle & Cleanup
    // -------------------------------------------------------------------------

    destroy() {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      for (const unsub of this.unwatchFns) {
        try {
          if (typeof unsub === 'function') unsub();
        } catch {}
      }
      this.unwatchFns = [];
      this.listeners.clear();
    }
  }

  return SyncCoordinator;
});
