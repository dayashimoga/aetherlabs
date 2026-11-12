'use strict';

/**
 * KubeLabs v3.0 - Multi-Cloud, GitOps, Service Mesh & IaC State Extensions
 * Features:
 *  1. HelmReleaseManager: Full Helm v3 release lifecycle (install, upgrade, rollback, uninstall, values merge)
 *  2. ArgoCDController: GitOps Application reconciliation (Synced/OutOfSync, Healthy/Degraded, self-heal)
 *  3. IstioMeshEngine: VirtualService traffic routing, canary splitting, DestinationRule circuit breaking, PeerAuthentication mTLS
 *  4. OpenTofuStateGraph: Standard .tfstate v4 state graph, resource dependency tracking & drift detection
 *  5. MultiCloudRegistry: AWS, Azure & GCP cloud infrastructure resource catalog
 * Pure ES2024 module with zero external dependencies.
 */

// Helper: Deep merge values objects
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const output = { ...(target || {}) };
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      output[key] = deepMerge(output[key] || {}, val);
    } else {
      output[key] = val;
    }
  }
  return output;
}

// -----------------------------------------------------------------------------
// 1. Helm v3 Release Manager
// -----------------------------------------------------------------------------
class HelmReleaseManager {
  constructor(resourceGraph) {
    this.graph = resourceGraph;
    this.releases = new Map(); // "namespace/name" -> Array<ReleaseRevision>
  }

  _key(namespace, name) {
    return `${namespace || 'default'}/${name}`;
  }

  install(releaseName, chart, values = {}, options = {}) {
    const ns = options.namespace || 'default';
    const key = this._key(ns, releaseName);

    if (this.releases.has(key)) {
      const active = this.getActiveRelease(releaseName, ns);
      if (active && active.status === 'deployed') {
        throw new Error(`cannot re-use a name that is still in use: release "${releaseName}" already exists in namespace "${ns}"`);
      }
    }

    const revision = 1;
    const mergedValues = deepMerge(options.defaultValues || {}, values);

    // Render chart template manifests into ResourceGraph
    const renderedManifests = this._renderChartManifests(releaseName, ns, chart, mergedValues);
    for (const m of renderedManifests) {
      this.graph.set(m);
    }

    const record = {
      name: releaseName,
      namespace: ns,
      revision,
      status: 'deployed',
      chart: chart || 'generic/chart',
      appVersion: options.appVersion || '1.0.0',
      values: mergedValues,
      manifests: renderedManifests,
      updatedAt: new Date().toISOString()
    };

    if (!this.releases.has(key)) {
      this.releases.set(key, []);
    }
    this.releases.get(key).push(record);

    return record;
  }

  upgrade(releaseName, chart, values = {}, options = {}) {
    const ns = options.namespace || 'default';
    const key = this._key(ns, releaseName);
    const history = this.releases.get(key);

    if (!history || history.length === 0) {
      if (options.install) {
        return this.install(releaseName, chart, values, options);
      }
      throw new Error(`release: not found for "${releaseName}" in namespace "${ns}"`);
    }

    const current = history[history.length - 1];
    const newRevision = current.revision + 1;
    const mergedValues = deepMerge(current.values, values);

    // Render new manifests and apply to ResourceGraph
    const renderedManifests = this._renderChartManifests(releaseName, ns, chart || current.chart, mergedValues);
    for (const m of renderedManifests) {
      this.graph.set(m);
    }

    current.status = 'superseded';

    const newRecord = {
      name: releaseName,
      namespace: ns,
      revision: newRevision,
      status: 'deployed',
      chart: chart || current.chart,
      appVersion: options.appVersion || current.appVersion || '1.0.0',
      values: mergedValues,
      manifests: renderedManifests,
      updatedAt: new Date().toISOString()
    };

    history.push(newRecord);
    return newRecord;
  }

  rollback(releaseName, targetRevision, options = {}) {
    const ns = options.namespace || 'default';
    const key = this._key(ns, releaseName);
    const history = this.releases.get(key);

    if (!history || history.length === 0) {
      throw new Error(`release: not found for "${releaseName}" in namespace "${ns}"`);
    }

    const target = history.find((r) => r.revision === Number(targetRevision));
    if (!target) {
      throw new Error(`release: "${releaseName}" has no revision ${targetRevision}`);
    }

    const current = history[history.length - 1];
    const newRevision = current.revision + 1;

    // Apply target manifests back to cluster
    for (const m of target.manifests) {
      this.graph.set(m);
    }

    current.status = 'superseded';

    const rollbackRecord = {
      name: releaseName,
      namespace: ns,
      revision: newRevision,
      status: 'deployed',
      chart: target.chart,
      appVersion: target.appVersion,
      values: structuredClone ? structuredClone(target.values) : JSON.parse(JSON.stringify(target.values)),
      manifests: target.manifests,
      updatedAt: new Date().toISOString()
    };

    history.push(rollbackRecord);
    return rollbackRecord;
  }

  uninstall(releaseName, options = {}) {
    const ns = options.namespace || 'default';
    const key = this._key(ns, releaseName);
    const history = this.releases.get(key);

    if (!history || history.length === 0) {
      throw new Error(`release: not found for "${releaseName}" in namespace "${ns}"`);
    }

    const current = history[history.length - 1];
    // Remove manifests from ResourceGraph
    for (const m of current.manifests) {
      this.graph.delete(m.kind, m.metadata.namespace || ns, m.metadata.name);
    }

    current.status = 'uninstalled';
    current.updatedAt = new Date().toISOString();
    return current;
  }

  list(namespace = null) {
    const results = [];
    for (const history of this.releases.values()) {
      if (history.length > 0) {
        const active = history[history.length - 1];
        if (!namespace || active.namespace === namespace) {
          results.push(active);
        }
      }
    }
    return results;
  }

  getActiveRelease(releaseName, namespace = 'default') {
    const key = this._key(namespace, releaseName);
    const history = this.releases.get(key);
    return (history && history.length > 0) ? history[history.length - 1] : null;
  }

  _renderChartManifests(name, ns, chart, values) {
    const replicas = (values && values.replicaCount) || (values && values.replicas) || 1;
    const image = (values && values.image && values.image.repository)
      ? `${values.image.repository}:${values.image.tag || 'latest'}`
      : 'nginx:1.27-alpine';
    const port = (values && values.service && values.service.port) || 80;

    return [
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name,
          namespace: ns,
          labels: {
            'app.kubernetes.io/name': name,
            'app.kubernetes.io/instance': name,
            'app.kubernetes.io/managed-by': 'Helm'
          }
        },
        spec: {
          replicas: Number(replicas),
          selector: { matchLabels: { 'app.kubernetes.io/instance': name } },
          template: {
            metadata: { labels: { 'app.kubernetes.io/instance': name } },
            spec: { containers: [{ name, image }] }
          }
        }
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name,
          namespace: ns,
          labels: { 'app.kubernetes.io/instance': name, 'app.kubernetes.io/managed-by': 'Helm' }
        },
        spec: {
          type: (values && values.service && values.service.type) || 'ClusterIP',
          selector: { 'app.kubernetes.io/instance': name },
          ports: [{ port: Number(port), targetPort: Number(port) }]
        }
      }
    ];
  }
}

// -----------------------------------------------------------------------------
// 2. ArgoCD Application Controller
// -----------------------------------------------------------------------------
class ArgoCDController {
  constructor(resourceGraph) {
    this.graph = resourceGraph;
    this.apps = new Map(); // name -> appState
  }

  reconcile(appResource) {
    if (!appResource || appResource.kind !== 'Application') return null;

    const name = appResource.metadata.name;
    const spec = appResource.spec || {};
    const destNs = (spec.destination && spec.destination.namespace) || 'default';
    const source = spec.source || {};

    // Check drift against live ResourceGraph
    const expectedLabels = { 'app.kubernetes.io/instance': name };
    const liveDeployments = this.graph.list({ kind: 'Deployment', namespace: destNs, labelSelector: 'app.kubernetes.io/instance=' + name });

    let syncStatus = 'Synced';
    let healthStatus = 'Healthy';

    if (liveDeployments.length === 0) {
      syncStatus = 'OutOfSync';
      healthStatus = 'Missing';
    } else {
      const dep = liveDeployments[0];
      const readyReplicas = (dep.status && dep.status.readyReplicas) || 0;
      const desired = dep.spec && dep.spec.replicas !== undefined ? dep.spec.replicas : 1;
      if (readyReplicas < desired) {
        healthStatus = 'Progressing';
      }
    }

    // Automated self-heal if configured
    const selfHeal = spec.syncPolicy && spec.syncPolicy.automated && spec.syncPolicy.automated.selfHeal;
    if (syncStatus === 'OutOfSync' && selfHeal) {
      // Re-provision missing deployment
      this.graph.set({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace: destNs, labels: expectedLabels },
        spec: {
          replicas: 2,
          selector: { matchLabels: expectedLabels },
          template: {
            metadata: { labels: expectedLabels },
            spec: { containers: [{ name, image: 'nginx:1.27-alpine' }] }
          }
        }
      });
      syncStatus = 'Synced';
      healthStatus = 'Healthy';
    }

    const statusObj = {
      sync: { status: syncStatus, revision: source.targetRevision || 'main' },
      health: { status: healthStatus },
      observedAt: new Date().toISOString()
    };

    appResource.status = statusObj;
    this.apps.set(name, appResource);
    return appResource;
  }
}

// -----------------------------------------------------------------------------
// 3. Istio Service Mesh State Engine
// -----------------------------------------------------------------------------
class IstioMeshEngine {
  constructor(resourceGraph) {
    this.graph = resourceGraph;
  }

  /**
   * Evaluates VirtualService routing rules and weighted canary traffic splits
   */
  resolveRoute(virtualServiceName, namespace, request = { uri: '/', headers: {} }) {
    const vs = this.graph.get('VirtualService', namespace, virtualServiceName);
    if (!vs || !vs.spec || !Array.isArray(vs.spec.http)) {
      return { destination: null, subset: null, fault: null };
    }

    for (const routeRule of vs.spec.http) {
      // 1. Check match criteria
      let matches = true;
      if (Array.isArray(routeRule.match)) {
        matches = routeRule.match.some((m) => {
          if (m.uri) {
            if (m.uri.exact && request.uri !== m.uri.exact) return false;
            if (m.uri.prefix && !request.uri.startsWith(m.uri.prefix)) return false;
          }
          if (m.headers) {
            for (const [k, v] of Object.entries(m.headers)) {
              const reqVal = request.headers[k.toLowerCase()];
              if (v.exact && reqVal !== v.exact) return false;
            }
          }
          return true;
        });
      }

      if (!matches) continue;

      // 2. Check Fault Injection
      let fault = null;
      if (routeRule.fault) {
        if (routeRule.fault.abort) {
          fault = { type: 'abort', httpStatus: routeRule.fault.abort.httpStatus || 500 };
        } else if (routeRule.fault.delay) {
          fault = { type: 'delay', duration: routeRule.fault.delay.fixedDelay || '5s' };
        }
      }

      // 3. Weighted Route Splitting
      const destinations = routeRule.route || [];
      if (destinations.length === 0) continue;

      let totalWeight = destinations.reduce((sum, d) => sum + (d.weight || 0), 0);
      if (totalWeight === 0) totalWeight = 100;

      // Deterministic selection based on weight
      const randomRoll = (request.random !== undefined ? request.random : 0.5) * totalWeight;
      let cumulative = 0;
      let selectedDest = destinations[0];

      for (const dest of destinations) {
        cumulative += (dest.weight !== undefined ? dest.weight : totalWeight);
        if (randomRoll <= cumulative) {
          selectedDest = dest;
          break;
        }
      }

      return {
        host: selectedDest.destination && selectedDest.destination.host,
        subset: selectedDest.destination && selectedDest.destination.subset,
        port: selectedDest.destination && selectedDest.destination.port && selectedDest.destination.port.number,
        fault
      };
    }

    return { destination: null, subset: null, fault: null };
  }

  /**
   * Evaluates PeerAuthentication mTLS requirements
   */
  checkMTLS(namespace, hasClientTLS = false) {
    const pas = this.graph.list({ kind: 'PeerAuthentication', namespace });
    if (pas.length === 0) {
      return { allowed: true, mode: 'PERMISSIVE' };
    }

    const pa = pas[0];
    const mode = (pa.spec && pa.spec.mtls && pa.spec.mtls.mode) || 'PERMISSIVE';

    if (mode === 'STRICT' && !hasClientTLS) {
      return {
        allowed: false,
        mode: 'STRICT',
        reason: 'mTLS STRICT rejected plaintext connection'
      };
    }

    return { allowed: true, mode };
  }
}

// -----------------------------------------------------------------------------
// 4. OpenTofu / Terraform State Graph (.tfstate schema v4)
// -----------------------------------------------------------------------------
class OpenTofuStateGraph {
  constructor() {
    this.version = 4;
    this.terraformVersion = '1.8.5';
    this.serial = 1;
    this.lineage = 'opentofu-state-lineage-uuid-1234';
    this.resources = new Map(); // "type.name" -> resourceObj
    this.outputs = {};
  }

  applyResource(type, name, provider, attributes, dependencies = []) {
    const key = `${type}.${name}`;
    this.serial++;

    const resRecord = {
      mode: 'managed',
      type,
      name,
      provider: provider || 'provider["registry.opentofu.org/hashicorp/aws"]',
      instances: [
        {
          schema_version: 1,
          attributes: { ...(attributes || {}), id: attributes.id || `${name}-id` },
          dependencies: dependencies || []
        }
      ]
    };

    this.resources.set(key, resRecord);
    return resRecord;
  }

  getResource(type, name) {
    return this.resources.get(`${type}.${name}`) || null;
  }

  detectDrift(declaredPlan) {
    const drifts = [];
    if (!Array.isArray(declaredPlan)) return drifts;

    for (const declared of declaredPlan) {
      const live = this.getResource(declared.type, declared.name);
      if (!live) {
        drifts.push({ type: declared.type, name: declared.name, change: 'missing' });
      } else {
        const liveAttrs = live.instances[0].attributes;
        for (const [k, v] of Object.entries(declared.attributes || {})) {
          if (liveAttrs[k] !== v) {
            drifts.push({
              type: declared.type,
              name: declared.name,
              attribute: k,
              expected: v,
              actual: liveAttrs[k]
            });
          }
        }
      }
    }
    return drifts;
  }

  exportState() {
    return {
      version: this.version,
      terraform_version: this.terraformVersion,
      serial: this.serial,
      lineage: this.lineage,
      outputs: this.outputs,
      resources: Array.from(this.resources.values())
    };
  }

  importState(stateData) {
    const data = typeof stateData === 'string' ? JSON.parse(stateData) : stateData;
    this.version = data.version || 4;
    this.serial = data.serial || 1;
    this.lineage = data.lineage || this.lineage;
    this.outputs = data.outputs || {};
    this.resources.clear();

    if (Array.isArray(data.resources)) {
      for (const r of data.resources) {
        this.resources.set(`${r.type}.${r.name}`, r);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 5. Multi-Cloud Resource Registry (AWS, Azure, GCP)
// -----------------------------------------------------------------------------
class MultiCloudRegistry {
  constructor() {
    this.cloudResources = new Map(); // id -> resource
  }

  register(provider, type, name, attributes = {}) {
    const id = `${provider}-${type}-${name}`;
    const record = {
      id,
      provider: provider.toLowerCase(),
      type,
      name,
      attributes,
      status: 'AVAILABLE',
      createdAt: new Date().toISOString()
    };
    this.cloudResources.set(id, record);
    return record;
  }

  get(id) {
    return this.cloudResources.get(id) || null;
  }

  list(provider = null, type = null) {
    let results = Array.from(this.cloudResources.values());
    if (provider) {
      results = results.filter((r) => r.provider === provider.toLowerCase());
    }
    if (type) {
      results = results.filter((r) => r.type.toLowerCase() === type.toLowerCase());
    }
    return results;
  }

  delete(id) {
    return this.cloudResources.delete(id);
  }
}

// Dual CommonJS & Browser export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HelmReleaseManager,
    ArgoCDController,
    IstioMeshEngine,
    OpenTofuStateGraph,
    MultiCloudRegistry
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.HelmReleaseManager = HelmReleaseManager;
  globalThis.ArgoCDController = ArgoCDController;
  globalThis.IstioMeshEngine = IstioMeshEngine;
  globalThis.OpenTofuStateGraph = OpenTofuStateGraph;
  globalThis.MultiCloudRegistry = MultiCloudRegistry;
}
