'use strict';

(function () {
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function announceAria(message) {
    try {
      const announcer = document.getElementById('aria-live-announcer');
      if (announcer && message) {
        announcer.textContent = '';
        setTimeout(() => {
          announcer.textContent = String(message);
        }, 50);
      }
    } catch {
      // safe fallback
    }
  }

  const state = {
    overview: null,
    activeLab: null,
    activeIncident: null,
    activeArch: {
      name: 'Multi-AZ Amazon EKS GitOps Production Platform',
      nodes: [],
      edges: []
    },
    activeExam: null,
    lastClusterState: null,
    commandHistory: [],
    historyIndex: -1,
    currentTheme: localStorage.getItem('kubelabs_theme') || 'dark',
    sessionId: (function () {
      try {
        let sid = sessionStorage.getItem('kubelabs_session_id');
        if (!sid) {
          sid = 'sess-' + Math.random().toString(36).slice(2, 10);
          sessionStorage.setItem('kubelabs_session_id', sid);
        }
        return sid;
      } catch {
        return 'default';
      }
    })()
  };

  async function apiCall(path, options = {}) {
    try {
      const res = await fetch(path, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-kubelabs-session': state.sessionId
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      if (window.KubeLabsOfflineEngine) {
        const modeEl = document.getElementById('header-runtime-mode');
        if (modeEl) modeEl.textContent = 'Offline Engine (Active)';
        return handleOfflineRequest(path, options);
      }
      throw err;
    }
  }

  function handleOfflineRequest(path, options) {
    const oe = window.KubeLabsOfflineEngine;
    if (path === '/api/overview') {
      const prog = oe.getProgress();
      return {
        learner: { profile: { xp: prog.xp }, completedLabs: (prog.completedLabs || []).map((id) => ({ lab_id: id, status: 'completed' })) },
        tracks: state.overview ? state.overview.tracks : [],
        domains: state.overview ? state.overview.domains : [],
        labs: state.overview ? state.overview.labs : [],
        projects: state.overview ? state.overview.projects : []
      };
    }
    const labStart = path.match(/\/api\/labs\/([a-z0-9-]+)\/start/);
    if (labStart) {
      const labId = labStart[1];
      const lab = (state.overview?.labs || []).find((l) => l.id === labId);
      if (typeof oe.resetCluster === 'function') oe.resetCluster();
      return {
        lab,
        activeLabId: labId,
        clusterState: oe.getClusterState(),
        message: `Initialized virtual cluster for lab "${lab?.title || labId}"`
      };
    }
    if (path === '/api/terminal/exec') {
      const cmd = options.body ? options.body.command : '';
      const res = oe.executeCommand(cmd);
      return {
        exitCode: res.exitCode,
        output: res.output,
        clusterState: oe.getClusterState()
      };
    }
    const labValidate = path.match(/\/api\/labs\/([a-z0-9-]+)\/validate/);
    if (labValidate) {
      const labId = labValidate[1];
      const lab = (state.overview?.labs || []).find((l) => l.id === labId) || state.activeLab;
      const rules = (lab && lab.validationRules) || [];
      const report = oe.evaluateRules(rules, { labId });
      if (report.passed && lab) {
        oe.recordProgress({ labId: lab.id, xpReward: lab.xpReward });
      }
      return {
        labId,
        activeLabId: labId,
        contextType: 'lab',
        ...report,
        clusterState: oe.getClusterState()
      };
    }
    if (path.includes('/validate')) {
      const rules = (state.activeLab && state.activeLab.validationRules) || [];
      const report = oe.evaluateRules(rules);
      if (report.passed && state.activeLab) {
        oe.recordProgress({ labId: state.activeLab.id, xpReward: state.activeLab.xpReward });
      }
      return {
        ...report,
        clusterState: oe.getClusterState()
      };
    }
    return { exitCode: 0, clusterState: oe.getClusterState() };
  }

  const VIEW_NAMES = {
    'view-paths': 'Learning Paths & Catalog',
    'view-workbench': 'Interactive Lab Workbench',
    'view-incidents': 'Incident Response War Room',
    'view-architect': 'Interactive Architecture Studio',
    'view-certs': 'Certifications & Skill Profile'
  };

  function switchView(viewId) {
    document.body.classList.toggle('workbench-open', viewId === 'view-workbench');
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === viewId);
    });
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    const viewNameEl = document.getElementById('header-active-view-name');
    if (viewNameEl) {
      viewNameEl.textContent = VIEW_NAMES[viewId] || 'Workspace';
    }
    if (viewId === 'view-workbench' && state.activeLab) {
      const sel = document.getElementById('wb-lab-selector');
      if (sel && sel.value !== state.activeLab.id) {
        sel.value = state.activeLab.id;
      }
      updateEditorGutter();
    }
  }

  function openLabArchModal() {
    const modal = document.getElementById('lab-arch-modal');
    if (!modal) return;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    if (state.activeLab) {
      renderLabArchDiagram(state.activeLab);
    }
    const closeBtn = document.getElementById('btn-close-lab-arch');
    if (closeBtn) closeBtn.focus();
  }

  function closeLabArchModal() {
    const modal = document.getElementById('lab-arch-modal');
    if (!modal) return;
    document.body.classList.remove('modal-open');
    modal.style.display = 'none';
  }

  function openDiagnosticsModal() {
    const modal = document.getElementById('diagnostics-modal');
    if (!modal) return;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    runLiveAgentAudit();
    const closeBtn = document.getElementById('btn-close-diagnostics');
    if (closeBtn) closeBtn.focus();
  }

  function closeDiagnosticsModal() {
    const modal = document.getElementById('diagnostics-modal');
    if (!modal) return;
    document.body.classList.remove('modal-open');
    modal.style.display = 'none';
    if (window.location.hash === '#admin-diagnostics') {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  }

  // Command Palette Controller (Ctrl+K / Cmd+K)
  let cmdPaletteSelectedIndex = 0;
  let cmdPaletteItems = [];

  function getAvailableCommands() {
    const commands = [
      {
        id: 'nav-paths',
        title: '1. Learning Paths & Catalog',
        subtitle: 'Navigate to curriculum catalog, career tracks, and capstones',
        badge: 'View',
        icon: '📚',
        action: () => switchView('view-paths')
      },
      {
        id: 'nav-workbench',
        title: '2. Interactive Lab Workbench',
        subtitle: 'Open 3-pane split IDE with terminal, editor & SVG topology',
        badge: 'View',
        icon: '⚡',
        action: () => switchView('view-workbench')
      },
      {
        id: 'nav-incidents',
        title: '3. Incident Response War Room',
        subtitle: 'Active production outages, MTTR timer & simulated alerts',
        badge: 'View',
        icon: '🚨',
        action: () => switchView('view-incidents')
      },
      {
        id: 'nav-architect',
        title: '4. Interactive Architecture Studio',
        subtitle: 'Design blueprints and compile to Kubernetes YAML & OpenTofu HCL',
        badge: 'View',
        icon: '📐',
        action: () => switchView('view-architect')
      },
      {
        id: 'nav-certs',
        title: '5. Certifications & Skill Profile',
        subtitle: 'Role-based exam drills, skill radar, and Ed25519 credentials',
        badge: 'View',
        icon: '🎓',
        action: () => switchView('view-certs')
      },
      {
        id: 'cmd-diagnostics',
        title: 'Open 11-Agent Diagnostics & Self-Audit (Ctrl+Shift+D)',
        subtitle: 'Run 53-gate production readiness and memory budget audit',
        badge: 'Tool',
        icon: '🛡️',
        action: () => openDiagnosticsModal()
      },
      {
        id: 'cmd-theme',
        title: 'Toggle Theme (Dark / Light / High Contrast)',
        subtitle: 'Cycle through futuristic dark-first and accessibility themes',
        badge: 'Setting',
        icon: '🌓',
        action: () => {
          const next = state.currentTheme === 'dark' ? 'light' : state.currentTheme === 'light' ? 'high-contrast' : 'dark';
          setTheme(next);
        }
      },
      {
        id: 'cmd-reset-lab',
        title: 'Reset Active Lab Cluster State',
        subtitle: 'Restore virtual cluster to fresh initial state',
        badge: 'Cluster',
        icon: '🔄',
        action: () => {
          switchView('view-workbench');
          const btn = document.getElementById('btn-reset-lab');
          if (btn) btn.click();
        }
      },
      {
        id: 'cmd-validate-lab',
        title: 'Validate Active Lab Objectives',
        subtitle: 'Run deterministic assertion engine against virtual cluster',
        badge: 'Cluster',
        icon: '✅',
        action: () => {
          switchView('view-workbench');
          const btn = document.getElementById('btn-validate-lab');
          if (btn) btn.click();
        }
      },
      {
        id: 'cmd-solve-lab',
        title: 'Run Guided Lab Canonical Solution',
        subtitle: 'Automatically apply valid configuration to complete objectives',
        badge: 'Cluster',
        icon: '✨',
        action: () => {
          switchView('view-workbench');
          const btn = document.getElementById('btn-solve-lab');
          if (btn) btn.click();
        }
      }
    ];

    if (state.overview && state.overview.domains) {
      state.overview.domains.forEach((d) => {
        if (d.labs) {
          d.labs.forEach((l) => {
            commands.push({
              id: `lab-${l.id}`,
              title: `Lab: ${l.title}`,
              subtitle: `${d.name || d.id} • ${l.difficulty || 'Intermediate'} • ${l.estimatedMinutes || 15} mins`,
              badge: 'Lab',
              icon: '🧪',
              action: async () => {
                await startLab(l.id);
                switchView('view-workbench');
              }
            });
          });
        }
      });
    }

    return commands;
  }

  function openCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    if (!modal) return;
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    const input = document.getElementById('cmd-palette-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    cmdPaletteSelectedIndex = 0;
    renderCommandPaletteResults('');
  }

  function closeCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    if (!modal) return;
    document.body.classList.remove('modal-open');
    modal.style.display = 'none';
  }

  function renderCommandPaletteResults(query = '') {
    const container = document.getElementById('cmd-palette-results');
    if (!container) return;

    const allCommands = getAvailableCommands();
    const q = (query || '').toLowerCase().trim();

    cmdPaletteItems = allCommands.filter((c) => {
      if (!q) return true;
      return c.title.toLowerCase().includes(q) ||
             c.subtitle.toLowerCase().includes(q) ||
             c.badge.toLowerCase().includes(q);
    }).slice(0, 12);

    if (cmdPaletteSelectedIndex >= cmdPaletteItems.length) {
      cmdPaletteSelectedIndex = Math.max(0, cmdPaletteItems.length - 1);
    }

    if (cmdPaletteItems.length === 0) {
      container.innerHTML = `
        <div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.85rem;">
          No matching commands or labs found for "<strong>${escapeHtml(query)}</strong>"
        </div>
      `;
      return;
    }

    container.innerHTML = cmdPaletteItems.map((item, idx) => `
      <button class="cmd-result-item ${idx === cmdPaletteSelectedIndex ? 'selected' : ''}" data-index="${idx}" type="button" role="option" aria-selected="${idx === cmdPaletteSelectedIndex}">
        <span class="cmd-result-icon">${item.icon}</span>
        <span class="cmd-result-info">
          <span class="cmd-result-title">${escapeHtml(item.title)}</span>
          <span class="cmd-result-subtitle">${escapeHtml(item.subtitle)}</span>
        </span>
        <span class="cmd-result-badge">${escapeHtml(item.badge)}</span>
      </button>
    `).join('');

    container.querySelectorAll('.cmd-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        executeCommandPaletteItem(idx);
      });
      el.addEventListener('mouseenter', () => {
        cmdPaletteSelectedIndex = parseInt(el.dataset.index, 10);
        updateCommandPaletteSelection();
      });
    });
  }

  function updateCommandPaletteSelection() {
    const container = document.getElementById('cmd-palette-results');
    if (!container) return;
    container.querySelectorAll('.cmd-result-item').forEach((el, idx) => {
      const isSel = idx === cmdPaletteSelectedIndex;
      el.classList.toggle('selected', isSel);
      el.setAttribute('aria-selected', isSel ? 'true' : 'false');
      if (isSel) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function executeCommandPaletteItem(idx) {
    if (cmdPaletteItems[idx]) {
      closeCommandPalette();
      cmdPaletteItems[idx].action();
    }
  }

  function appendTerminalLine(text, isCommand = false) {
    if (state.terminalView) {
      state.terminalView.writeLine(text, isCommand ? 'command' : 'output');
      return;
    }
    const out = document.getElementById('terminal-output');
    if (!out) return;
    const div = document.createElement('div');
    div.style.marginBottom = '0.45rem';
    if (isCommand) {
      div.style.color = '#38bdf8';
      div.textContent = `learner@kubelabs:~$ ${text}`;
    } else {
      div.textContent = text;
    }
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }

  function updateHeaderTelemetry() {
    if (!state.overview) return;
    const learner = state.overview.learner || {};
    const profile = learner.profile || { xp: 0 };
    const completedLabs = (learner.completedLabs || []).filter((l) => l.status === 'completed');
    const totalLabs = (state.overview.labs || []).length || 52;

    const xpEl = document.getElementById('header-xp');
    const labsEl = document.getElementById('header-labs-completed');
    if (xpEl) xpEl.textContent = `${profile.xp || 0} XP`;
    if (labsEl) labsEl.textContent = `${completedLabs.length}/${totalLabs} Labs Completed`;
  }

  function renderSvgTopology(clusterState) {
    const svg = document.getElementById('cluster-topology-svg');
    if (!svg || !clusterState) return;

    const resources = clusterState.resources || [];
    const ingresses = resources.filter((r) => r.kind === 'Ingress');
    const services = resources.filter((r) => r.kind === 'Service');
    const pods = resources.filter((r) => r.kind === 'Pod');
    const nodes = resources.filter((r) => r.kind === 'Node' || r.kind === 'PersistentVolumeClaim');

    const colX = { ing: 45, svc: 165, pod: 310, node: 455 };
    let svgContent = `
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

    const ingY = ingresses.slice(0, 3).map((_, i) => 45 + i * 42);
    const svcY = services.slice(0, 4).map((_, i) => 38 + i * 36);
    const podY = pods.slice(0, 5).map((_, i) => 32 + i * 27);
    const nodeY = nodes.slice(0, 3).map((_, i) => 45 + i * 42);

    for (let i = 0; i < Math.min(ingresses.length, services.length); i++) {
      const y1 = ingY[i] || 45;
      const y2 = svcY[i] || 38;
      svgContent += `<line x1="${colX.ing + 20}" y1="${y1}" x2="${colX.svc - 20}" y2="${y2}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
    }
    for (let i = 0; i < Math.min(services.length, pods.length); i++) {
      const y1 = svcY[i] || 38;
      const y2 = podY[i] || 32;
      svgContent += `<line x1="${colX.svc + 20}" y1="${y1}" x2="${colX.pod - 20}" y2="${y2}" stroke="#10b981" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
    }
    for (let i = 0; i < Math.min(pods.length, nodes.length); i++) {
      const y1 = podY[i] || 32;
      const y2 = nodeY[i] || 45;
      svgContent += `<line x1="${colX.pod + 20}" y1="${y1}" x2="${colX.node - 20}" y2="${y2}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrow)" />`;
    }

    ingresses.slice(0, 3).forEach((r, i) => {
      const y = ingY[i];
      svgContent += `
        <g class="topology-node">
          <rect x="${colX.ing - 32}" y="${y - 12}" width="64" height="24" rx="4" fill="#1e293b" stroke="#38bdf8" stroke-width="1.2" />
          <text x="${colX.ing}" y="${y + 3}" fill="#38bdf8" font-size="9" font-family="monospace" text-anchor="middle">${escapeHtml(r.metadata.name.slice(0, 9))}</text>
        </g>
      `;
    });

    services.slice(0, 4).forEach((r, i) => {
      const y = svcY[i];
      const hasEps = r.status && r.status.endpointCount > 0;
      const stroke = hasEps ? '#10b981' : '#f59e0b';
      svgContent += `
        <g class="topology-node">
          <rect x="${colX.svc - 30}" y="${y - 12}" width="60" height="24" rx="4" fill="#1e293b" stroke="${stroke}" stroke-width="1.2" />
          <text x="${colX.svc}" y="${y + 3}" fill="${stroke}" font-size="9" font-family="monospace" text-anchor="middle">${escapeHtml(r.metadata.name.slice(0, 8))}</text>
        </g>
      `;
    });

    pods.slice(0, 5).forEach((r, i) => {
      const y = podY[i];
      const phase = (r.status && (r.status.phase || r.status.reason)) || 'Pending';
      const isHealthy = phase === 'Running';
      const isPending = phase.includes('Pending') || phase.includes('Creating');
      const stroke = isHealthy ? '#10b981' : isPending ? '#f59e0b' : '#ef4444';
      svgContent += `
        <g class="topology-node">
          <circle cx="${colX.pod}" cy="${y}" r="10" fill="#1e293b" stroke="${stroke}" stroke-width="1.5" />
          <text x="${colX.pod}" y="${y + 3}" fill="${stroke}" font-size="8" font-family="monospace" text-anchor="middle">${isHealthy ? '●' : '!'}</text>
          <text x="${colX.pod + 15}" y="${y + 3}" fill="#cbd5e1" font-size="8" font-family="monospace">${escapeHtml(r.metadata.name.slice(0, 11))}</text>
        </g>
      `;
    });

    nodes.slice(0, 3).forEach((r, i) => {
      const y = nodeY[i];
      svgContent += `
        <g class="topology-node">
          <rect x="${colX.node - 32}" y="${y - 12}" width="64" height="24" rx="4" fill="#1e293b" stroke="#a855f7" stroke-width="1.2" />
          <text x="${colX.node}" y="${y + 3}" fill="#c084fc" font-size="9" font-family="monospace" text-anchor="middle">${escapeHtml(r.metadata.name.slice(0, 9))}</text>
        </g>
      `;
    });

    svg.innerHTML = svgContent;
  }

  function renderClusterTopology(clusterState) {
    state.lastClusterState = clusterState;
    renderSvgTopology(clusterState);

    const container = document.getElementById('cluster-topology-view');
    const countBadge = document.getElementById('cluster-resource-count');
    if (!container || !clusterState) return;

    const resources = clusterState.resources || [];
    if (countBadge) countBadge.textContent = `${resources.length} Objects`;

    container.innerHTML = resources
      .filter((r) => r.kind !== 'Namespace')
      .map((r) => {
        const ns = r.metadata.namespace ? `${escapeHtml(r.metadata.namespace)}/` : '';
        let statusText = (r.status && (r.status.reason || r.status.phase)) || 'Active';
        if (r.kind === 'Service') {
          statusText = `${(r.status && r.status.endpointCount) || 0} endpoints`;
        } else if (r.kind === 'Deployment' || r.kind === 'StatefulSet' || r.kind === 'Rollout') {
          statusText = `${(r.status && r.status.readyReplicas) || 0}/${(r.spec && r.spec.replicas) || 1} Ready`;
        }
        const isBroken =
          statusText.includes('BackOff') ||
          statusText.includes('Pending') ||
          statusText.includes('OOM') ||
          statusText.includes('Error') ||
          statusText === '0 endpoints';
        return `
          <div class="resource-chip">
            <div>
              <span class="status-dot ${isBroken ? 'broken' : 'healthy'}"></span>
              <strong>${escapeHtml(r.kind)}</strong>: ${ns}${escapeHtml(r.metadata.name)}
            </div>
            <span class="badge ${isBroken ? 'sev1' : ''}">${escapeHtml(statusText)}</span>
          </div>
        `;
      })
      .join('');
  }

  function renderPathsAndDomains(filterText = '') {
    if (!state.overview) return;
    const q = filterText.trim().toLowerCase();
    const completedSet = new Set(
      ((state.overview.learner && state.overview.learner.completedLabs) || [])
        .filter((l) => l.status === 'completed')
        .map((l) => l.lab_id)
    );

    const tracksContainer = document.getElementById('tracks-container');
    if (tracksContainer) {
      tracksContainer.innerHTML = (state.overview.tracks || [])
        .map(
          (t) => `
          <div class="card">
            <div class="card-header">
              <span class="card-title">${escapeHtml(t.title)}</span>
              <span class="badge">${t.labsCount} Labs | ${t.totalHours}h</span>
            </div>
            <p style="font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(t.summary)}</p>
            <div style="font-size:0.76rem; color:var(--accent-blue); margin-top:auto;">
              Certification: ${escapeHtml(t.certificationTitle)}
            </div>
          </div>
        `
        )
        .join('');
    }

    const projectsContainer = document.getElementById('projects-container');
    if (projectsContainer) {
      const doneProjects = new Set(
        ((state.overview.learner && state.overview.learner.projects) || [])
          .filter((p) => p.status === 'completed')
          .map((p) => p.project_id)
      );
      projectsContainer.innerHTML = (state.overview.projects || [])
        .map((proj) => {
          const isDone = doneProjects.has(proj.id);
          const milestonesHtml = (proj.milestones || [])
            .map(
              (m) => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:0.35rem 0.6rem; border-radius:4px; margin-top:0.3rem;">
                <span style="font-size:0.75rem;">• M${m.milestoneNumber}: ${escapeHtml(m.title)}</span>
                <button class="btn btn-primary validate-milestone-btn" data-proj-id="${proj.id}" data-m-num="${m.milestoneNumber}" type="button" style="padding:0.15rem 0.45rem; font-size:0.7rem;">Validate</button>
              </div>
            `
            )
            .join('');

          return `
            <div class="card">
              <div class="card-header">
                <span class="card-title">${escapeHtml(proj.title)}</span>
                ${isDone ? '<span class="badge completed">Completed</span>' : `<span class="badge">+${proj.xpReward} XP</span>`}
              </div>
              <p style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(proj.summary)}</p>
              <div class="milestone-stepper">${milestonesHtml}</div>
              <div style="margin-top:auto; padding-top:0.5rem;">
                <button class="btn btn-success solve-project-btn" data-proj-id="${proj.id}" type="button" style="width:100%;">Build &amp; Validate Full Capstone</button>
              </div>
            </div>
          `;
        })
        .join('');

      projectsContainer.querySelectorAll('.validate-milestone-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pId = btn.dataset.projId;
          const mNum = btn.dataset.mNum;
          try {
            const res = await apiCall(`/api/projects/${pId}/milestones/${mNum}/validate`, { method: 'POST' });
            if (res.passed) {
              btn.classList.remove('btn-primary', 'btn-danger');
              btn.classList.add('btn-success');
              btn.textContent = `M${mNum} Pass ✓`;
            } else {
              btn.classList.remove('btn-primary', 'btn-success');
              btn.classList.add('btn-danger');
              btn.textContent = `M${mNum} Fail ✗`;
            }
            if (res.clusterState) renderClusterTopology(res.clusterState);
          } catch (err) {
            btn.textContent = 'Error';
          }
        });
      });

      projectsContainer.querySelectorAll('.solve-project-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const pId = btn.dataset.projId;
          const origText = btn.textContent;
          btn.textContent = 'Building & Validating...';
          btn.disabled = true;
          try {
            const res = await apiCall(`/api/projects/${pId}/solve`, { method: 'POST' });
            btn.textContent = 'Completed ✓';
            btn.classList.remove('btn-success');
            btn.classList.add('completed');
            if (res.learner) {
              state.overview.learner = res.learner;
              updateHeaderTelemetry();
              renderPathsAndDomains();
            }
            announceAria(`Capstone project ${pId} built and validated 100% successfully.`);
          } catch (err) {
            btn.textContent = origText || 'Solve Failed';
            btn.disabled = false;
          }
        });
      });
    }

    const domainsContainer = document.getElementById('domains-container');
    if (domainsContainer) {
      const filteredDomains = (state.overview.domains || []).filter((d) => {
        if (!q) return true;
        return (
          d.title.toLowerCase().includes(q) ||
          d.summary.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          (d.labs || []).some((l) => l.title.toLowerCase().includes(q))
        );
      });

      domainsContainer.innerHTML = filteredDomains
        .map((d) => {
          const labsHtml = (d.labs || [])
            .map((lab) => {
              const isDone = completedSet.has(lab.id);
              return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:0.55rem 0.75rem; border-radius:6px; border:1px solid var(--border-subtle); margin-top:0.4rem;">
                  <div>
                    <div style="font-size:0.84rem; font-weight:600;">${lab.title}</div>
                    <div style="font-size:0.74rem; color:var(--text-muted);">${lab.difficulty} • ${lab.durationMinutes}m • +${lab.xpReward} XP</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.4rem;">
                    ${isDone ? '<span class="badge completed">Completed</span>' : ''}
                    <button class="btn btn-primary launch-lab-btn" data-lab-id="${lab.id}" type="button" style="padding:0.32rem 0.65rem; font-size:0.76rem;">Launch Lab</button>
                  </div>
                </div>
              `;
            })
            .join('');

          const modulesHtml = (d.curriculumModules || [])
            .map(
              (m) => `
              <div style="font-size:0.78rem; color:var(--text-secondary); background:rgba(30,41,59,0.5); padding:0.45rem 0.65rem; border-radius:5px; margin-top:0.35rem;">
                <strong>${m.title}:</strong> ${m.conceptSummary}
              </div>
            `
            )
            .join('');

          return `
            <div class="card">
              <div class="card-header">
                <div>
                  <span class="badge">${d.category}</span>
                  <h3 class="card-title" style="margin-top:0.3rem;">${d.title}</h3>
                </div>
                <span class="badge">${d.difficulty} (${d.estimatedHours}h)</span>
              </div>
              <p style="font-size:0.82rem; color:var(--text-secondary);">${d.summary}</p>
              <div>${modulesHtml}</div>
              <div style="margin-top:0.35rem;">${labsHtml}</div>
            </div>
          `;
        })
        .join('');

      domainsContainer.querySelectorAll('.launch-lab-btn').forEach((btn) => {
        btn.addEventListener('click', () => startLab(btn.dataset.labId));
      });
    }
  }

  function populateLabSelector() {
    const sel = document.getElementById('wb-lab-selector');
    if (!sel || !state.overview) return;
    sel.innerHTML = (state.overview.labs || [])
      .map((l) => `<option value="${l.id}">[${l.domainTitle}] ${l.title}</option>`)
      .join('');
    sel.onchange = () => startLab(sel.value);
  }

  async function startLab(labId) {
    const data = await apiCall(`/api/labs/${labId}/start`, { method: 'POST' });
    state.activeLab = data.lab;
    const sel = document.getElementById('wb-lab-selector');
    if (sel) sel.value = labId;

    document.getElementById('wb-domain-badge').textContent = data.lab.domainTitle || data.lab.domainId;
    document.getElementById('workbench-heading').textContent = data.lab.title;
    document.getElementById('wb-scenario').textContent = data.lab.scenario;
    document.getElementById('wb-prod-context').textContent = `Production Pattern: ${data.lab.productionContext}`;
    document.getElementById('wb-troubleshooting').textContent = data.lab.troubleshootingGuide;

    const socraticEl = document.getElementById('wb-socratic-clue');
    if (socraticEl) {
      socraticEl.textContent = `Scenario Clue: Inspect cluster events and container logs before applying manifest fixes. What does kubectl describe indicate?`;
    }

    const stepsBadge = document.getElementById('wb-steps-progress-badge');
    if (stepsBadge) {
      stepsBadge.textContent = `${(data.lab.steps || []).length} Steps`;
    }

    const editor = document.getElementById('wb-manifest-editor');
    if (editor) {
      editor.value = data.lab.starterManifest || '';
      updateEditorGutter();
    }

    const stepsContainer = document.getElementById('wb-steps-list');
    if (stepsContainer) {
      stepsContainer.innerHTML = (data.lab.steps || [])
        .map(
          (s) => `
          <div class="step-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-size:0.83rem; font-weight:700;">Step ${s.stepNumber}: ${escapeHtml(s.title)}</div>
              <span class="step-status-badge" style="font-size:0.72rem; color:var(--text-muted);">&#x25CB; Pending</span>
            </div>
            <div style="font-size:0.79rem; color:var(--text-secondary); margin-top:0.2rem;">${escapeHtml(s.instruction)}</div>
            <code class="step-cmd" data-cmd="${escapeHtml(s.commandHint)}" title="Click to execute command in terminal">$ ${escapeHtml(s.commandHint)}</code>
            <div class="step-actions">
              <button type="button" class="btn-run-step" data-cmd="${escapeHtml(s.commandHint)}" title="Execute command directly in terminal">&#x25B6; Run in Terminal</button>
              <button type="button" class="btn-copy-step" data-cmd="${escapeHtml(s.commandHint)}" title="Copy command to clipboard">&#x1F4CB; Copy</button>
            </div>
          </div>
        `
        )
        .join('');

      stepsContainer.querySelectorAll('.step-cmd').forEach((codeEl) => {
        codeEl.addEventListener('click', () => executeTerminalCommand(codeEl.dataset.cmd));
      });

      stepsContainer.querySelectorAll('.btn-run-step').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cmd = btn.dataset.cmd;
          const card = btn.closest('.step-card');
          const badge = card ? card.querySelector('.step-status-badge') : null;
          if (badge) {
            badge.textContent = '✓ Executed';
            badge.style.color = 'var(--accent-green)';
          }
          await executeTerminalCommand(cmd);
        });
      });

      stepsContainer.querySelectorAll('.btn-copy-step').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cmd = btn.dataset.cmd;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(cmd);
              const origText = btn.textContent;
              btn.textContent = '✓ Copied!';
              setTimeout(() => { btn.textContent = origText; }, 1500);
            } catch {}
          }
        });
      });
    }

    renderPendingValidation(data.lab);
    renderClusterTopology(data.clusterState);
    renderCisChecklist(data.lab, data.clusterState);
    seedObservability(data.lab, data.clusterState);
    appendTerminalLine(`--- Initialized Lab: ${data.lab.title} ---`);
    switchView('view-workbench');
  }

  function updateEditorGutter() {
    const editor = document.getElementById('wb-manifest-editor');
    const gutter = document.getElementById('manifest-line-gutter');
    if (!editor || !gutter) return;
    const lines = (editor.value || '').split('\n').length;
    let numbers = '';
    for (let i = 1; i <= Math.max(lines, 1); i++) {
      numbers += (i === 1 ? '1' : '\n' + i);
    }
    gutter.textContent = numbers;
    gutter.scrollTop = editor.scrollTop;
  }

  function computeSimpleDiff(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    const diffLines = [];
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        diffLines.push({ type: 'unchanged', text: '  ' + oldLines[i] });
        i++;
        j++;
      } else if (j < newLines.length && (!oldLines.includes(newLines[j]) || (i >= oldLines.length))) {
        diffLines.push({ type: 'added', text: '+ ' + newLines[j] });
        j++;
      } else if (i < oldLines.length) {
        diffLines.push({ type: 'removed', text: '- ' + oldLines[i] });
        i++;
      } else {
        break;
      }
    }
    return diffLines;
  }

  function drawPromqlChart(metricName = 'rate(http_requests_total[5m])') {
    const canvas = document.getElementById('promql-chart-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background & grid
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let y = 15; y < h - 15; y += 25) {
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.lineTo(35, h - 20);
    ctx.lineTo(w - 10, h - 20);
    ctx.stroke();

    // Deterministic wave points
    const points = [];
    const numPoints = 20;
    const stepX = (w - 55) / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
      const x = 40 + i * stepX;
      const factor = metricName.includes('memory') ? 0.4 : metricName.includes('cpu') ? 0.6 : 0.75;
      const wave = Math.sin(i * 0.5) * 18 * factor + Math.cos(i * 0.35) * 12 * factor;
      const y = (h - 35) - (wave + 30 * factor);
      points.push({ x, y: Math.max(15, Math.min(h - 22, y)) });
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, h - 20);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h - 20);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = '#38bdf8';
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('100%', 5, 20);
    ctx.fillText('50%', 10, (h - 20) / 2);
    ctx.fillText('0%', 15, h - 20);
    ctx.fillText('-15m', 40, h - 6);
    ctx.fillText('-5m', w / 2 - 10, h - 6);
    ctx.fillText('now', w - 30, h - 6);
  }

  function seedObservability(lab, clusterState) {
    const input = document.getElementById('promql-query-input');
    drawPromqlChart(input ? input.value : 'rate(http_requests_total[5m])');

    const lokiEl = document.getElementById('loki-log-tailer');
    if (lokiEl) {
      const now = new Date().toISOString();
      const podName = (clusterState && clusterState.pods && clusterState.pods[0]) ? clusterState.pods[0].metadata.name : 'order-processor-7dbd8';
      lokiEl.innerHTML = `
        <div style="color:#94a3b8; margin-bottom:0.2rem;"><span style="color:#64748b;">${now}</span> [INFO] [cluster.kubelabs.local] Initialized kubelet on node kubelabs-worker-01</div>
        <div style="color:#38bdf8; margin-bottom:0.2rem;"><span style="color:#64748b;">${now}</span> [INFO] [${podName}] Container entrypoint started</div>
        <div style="color:#fbbf24; margin-bottom:0.2rem;"><span style="color:#64748b;">${now}</span> [WARN] [ingress-controller] Service endpoint probe latency 42ms</div>
        <div style="color:#94a3b8;"><span style="color:#64748b;">${now}</span> [INFO] [prometheus-operator] Scraped metrics targets (26 active jobs, 0 scrape errors)</div>
      `;
    }

    const jaegerEl = document.getElementById('jaeger-trace-waterfall');
    if (jaegerEl) {
      jaegerEl.innerHTML = `
        <div class="trace-span-row">
          <span class="trace-span-name">GET /api/v1/orders</span>
          <div class="trace-span-bar-wrap"><div class="trace-span-bar" style="width:100%; background:#38bdf8;"></div></div>
          <span class="trace-span-time">68ms</span>
        </div>
        <div class="trace-span-row" style="padding-left:1rem;">
          <span class="trace-span-name">ingress-gateway</span>
          <div class="trace-span-bar-wrap"><div class="trace-span-bar" style="margin-left:5%; width:30%; background:#818cf8;"></div></div>
          <span class="trace-span-time">18ms</span>
        </div>
        <div class="trace-span-row" style="padding-left:2rem;">
          <span class="trace-span-name">order-processor</span>
          <div class="trace-span-bar-wrap"><div class="trace-span-bar" style="margin-left:35%; width:50%; background:#34d399;"></div></div>
          <span class="trace-span-time">35ms</span>
        </div>
        <div class="trace-span-row" style="padding-left:3rem;">
          <span class="trace-span-name">postgres-db query</span>
          <div class="trace-span-bar-wrap"><div class="trace-span-bar" style="margin-left:55%; width:25%; background:#f59e0b;"></div></div>
          <span class="trace-span-time">15ms</span>
        </div>
      `;
    }
  }

  function renderCisChecklist(lab, clusterState) {
    const listEl = document.getElementById('wb-cis-security-checklist');
    if (!listEl) return;
    const checks = [
      { id: 'CIS-5.1.1', desc: 'Pod Security Admission restricted profile enforced', status: 'PASS' },
      { id: 'CIS-5.2.1', desc: 'Minimize admission of privileged containers', status: 'PASS' },
      { id: 'CIS-5.3.1', desc: 'NetworkPolicies defined for tenant namespaces', status: 'PASS' },
      { id: 'CIS-5.4.1', desc: 'Containers run as non-root user (runAsNonRoot)', status: 'PASS' },
      { id: 'CIS-5.5.1', desc: 'Memory and CPU limits defined on all containers', status: 'PASS' }
    ];
    listEl.innerHTML = checks
      .map(
        (c) => `
        <div class="cis-item">
          <div><strong style="color:var(--accent-blue);">${c.id}:</strong> ${c.desc}</div>
          <span class="badge" style="background:#064e3b; color:#6ee7b7; font-size:0.68rem;">${c.status}</span>
        </div>
      `
      )
      .join('');
  }

  function renderLabArchDiagram(lab) {
    const svg = document.getElementById('lab-arch-svg');
    const details = document.getElementById('lab-arch-details');
    if (!svg || !lab) return;

    const titleEl = document.getElementById('lab-arch-title');
    if (titleEl) titleEl.textContent = `${lab.title} — Production Architecture`;

    const domain = lab.domainTitle || lab.domainId || 'Kubernetes';
    svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
        </marker>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>

      <!-- Client / Ingress Tier -->
      <rect x="30" y="50" width="120" height="70" rx="8" fill="url(#cardGrad)" stroke="#38bdf8" stroke-width="1.5" />
      <text x="90" y="80" fill="#38bdf8" font-size="12" font-weight="bold" text-anchor="middle">Ingress Gateway</text>
      <text x="90" y="100" fill="#94a3b8" font-size="10" text-anchor="middle">Port 80/443 (TLS)</text>

      <!-- Arrow 1 -->
      <line x1="150" y1="85" x2="220" y2="85" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)" />

      <!-- Service Tier -->
      <rect x="220" y="50" width="130" height="70" rx="8" fill="url(#cardGrad)" stroke="#818cf8" stroke-width="1.5" />
      <text x="285" y="80" fill="#818cf8" font-size="12" font-weight="bold" text-anchor="middle">ClusterIP Service</text>
      <text x="285" y="100" fill="#94a3b8" font-size="10" text-anchor="middle">10.96.0.0/12</text>

      <!-- Arrow 2 -->
      <line x1="350" y1="85" x2="420" y2="85" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)" />

      <!-- Pod Replica Tier -->
      <rect x="420" y="30" width="140" height="110" rx="8" fill="url(#cardGrad)" stroke="#34d399" stroke-width="1.5" />
      <text x="490" y="55" fill="#34d399" font-size="12" font-weight="bold" text-anchor="middle">Deployment Pods</text>
      <text x="490" y="75" fill="#94a3b8" font-size="10" text-anchor="middle">Replicas: 3</text>
      <rect x="435" y="85" width="110" height="42" rx="4" fill="#070b14" stroke="#334155" />
      <text x="490" y="102" fill="#e2e8f0" font-size="9" text-anchor="middle">Container: App</text>
      <text x="490" y="118" fill="#a5f3fc" font-size="9" text-anchor="middle">Cilium eBPF Net</text>

      <!-- Arrow 3 to Data/Config -->
      <line x1="490" y1="140" x2="490" y2="190" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrow)" />

      <!-- Data / Storage Tier -->
      <rect x="420" y="190" width="140" height="70" rx="8" fill="url(#cardGrad)" stroke="#f59e0b" stroke-width="1.5" />
      <text x="490" y="218" fill="#f59e0b" font-size="12" font-weight="bold" text-anchor="middle">Config &amp; Storage</text>
      <text x="490" y="238" fill="#94a3b8" font-size="10" text-anchor="middle">ConfigMap / Secret / CSI</text>

      <!-- Node Boundary Box -->
      <rect x="20" y="15" width="560" height="260" rx="12" fill="none" stroke="#334155" stroke-dasharray="4 4" />
      <text x="35" y="32" fill="#64748b" font-size="10">Worker Node: kubelabs-worker-01</text>
    `;

    if (details) {
      details.innerHTML = `
        <div style="background:var(--bg-secondary); border:1px solid var(--border-subtle); border-radius:6px; padding:0.65rem;">
          <strong>Target Topology Pattern:</strong> ${escapeHtml(lab.productionContext || 'Standard Cloud-Native Deployment')}
          <div style="margin-top:0.35rem; color:var(--text-muted); font-size:0.76rem;">Domain: ${escapeHtml(domain)} &bull; Validation Assertions: ${(lab.validationRules || []).length} active</div>
        </div>
      `;
    }
  }

  function renderPendingValidation(lab) {
    const container = document.getElementById('wb-validation-results');
    if (!container || !lab) return;
    const rules = lab.validationRules || [];
    container.innerHTML = `
      <div style="margin-bottom:0.5rem; font-size:0.84rem; font-weight:700; color:var(--text-secondary);">
        Pending Verification (0/${rules.length} Assertions Passed)
      </div>
      ${rules
        .map(
          (r) => `
        <div class="validation-item">
          <div><strong>[Pending]:</strong> ${escapeHtml(r.description || r.type)}</div>
          <div style="font-size:0.74rem; color:var(--text-muted); margin-top:0.2rem;">Expected: ${escapeHtml(r.expectedValue || r.kind || 'Compliant')}</div>
        </div>
      `
        )
        .join('')}
    `;
  }

  async function executeTerminalCommand(cmd) {
    if (!cmd || !cmd.trim()) return;
    state.commandHistory.push(cmd);
    state.historyIndex = -1;
    if (state.terminalView) {
      await state.terminalView.executeRaw(cmd);
      return;
    }
    appendTerminalLine(cmd, true);
    const manifestEditor = document.getElementById('wb-manifest-editor');
    const manifestText = manifestEditor ? manifestEditor.value : '';
    const res = await apiCall('/api/terminal/exec', {
      method: 'POST',
      body: { command: cmd, manifestText }
    });
    if (res.clearScreen) {
      document.getElementById('terminal-output').innerHTML = '';
    } else if (res.output) {
      appendTerminalLine(res.output, false);
    }
    if (res.clusterState) {
      renderClusterTopology(res.clusterState);
    }
  }

  function computeTabCompletion(line, pos = line.length) {
    if (state.offlineEngine && typeof state.offlineEngine.autocomplete === 'function') {
      try {
        const res = state.offlineEngine.autocomplete(line, pos);
        if (res && res.completions && res.completions.length > 0) return res;
      } catch {}
    }

    // Client-side context-sensitive autocompletion against state.lastClusterState
    const textBefore = line.slice(0, pos);
    const textAfter = line.slice(pos);
    const isTrailingSpace = textBefore.endsWith(' ');
    const rawTokens = textBefore.trimStart().split(/\s+/);
    const currentToken = isTrailingSpace ? '' : (rawTokens[rawTokens.length - 1] || '');

    const calcLCP = (arr) => {
      if (!arr || arr.length === 0) return '';
      if (arr.length === 1) return arr[0];
      let p = arr[0];
      for (let i = 1; i < arr.length; i++) {
        while (!arr[i].startsWith(p)) {
          p = p.slice(0, -1);
          if (!p) return '';
        }
      }
      return p;
    };

    const makeResult = (prefix, matches, isComplete = false) => {
      const sorted = Array.from(new Set(matches)).sort();
      let newLine = line;
      let newCursor = pos;
      if (sorted.length === 1) {
        const match = sorted[0];
        const tokenReplacement = match + (isComplete ? ' ' : '');
        const beforeToken = textBefore.slice(0, textBefore.length - prefix.length);
        newLine = beforeToken + tokenReplacement + textAfter;
        newCursor = beforeToken.length + tokenReplacement.length;
      } else if (sorted.length > 1) {
        const common = calcLCP(sorted);
        if (common.length > prefix.length) {
          const beforeToken = textBefore.slice(0, textBefore.length - prefix.length);
          newLine = beforeToken + common + textAfter;
          newCursor = beforeToken.length + common.length;
        }
      }
      return { prefix, completions: sorted, line: newLine, cursor: newCursor };
    };

    if (rawTokens.length <= 1 && !isTrailingSpace) {
      const cmds = ['kubectl', 'k', 'helm', 'docker', 'argocd', 'istioctl', 'tofu', 'terraform', 'aws', 'az', 'gcloud', 'trivy', 'aiops', 'etcdctl', 'cat', 'ls', 'grep', 'clear'];
      return makeResult(currentToken, cmds.filter(c => c.startsWith(currentToken)), true);
    }

    const bin = rawTokens[0];
    let specifiedNs = null;
    const positional = [];
    const prevTok = rawTokens[rawTokens.length - (currentToken ? 2 : 1)] || '';

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (tok === '-n' || tok === '--namespace') {
        if (i + 1 < rawTokens.length) { specifiedNs = rawTokens[i + 1]; i++; }
      } else if (tok.startsWith('--namespace=')) {
        specifiedNs = tok.slice(12);
      } else if (!tok.startsWith('-') || tok === '--') {
        positional.push(tok);
      }
    }

    // Flags
    if (currentToken.startsWith('-') && !currentToken.startsWith('--namespace=') && !currentToken.startsWith('--output=')) {
      const flags = ['-n', '--namespace', '-A', '--all-namespaces', '-o', '--output', '-l', '--selector', '-f', '--filename', '-w', '--watch'];
      return makeResult(currentToken, flags.filter(f => f.startsWith(currentToken)), true);
    }

    // Namespaces
    if (prevTok === '-n' || prevTok === '--namespace' || currentToken.startsWith('--namespace=')) {
      const prefix = currentToken.startsWith('--namespace=') ? currentToken.slice(12) : currentToken;
      const namespaces = new Set(['default', 'kube-system', 'production', 'monitoring', 'argocd', 'istio-system', 'security']);
      if (state.lastClusterState && Array.isArray(state.lastClusterState.resources)) {
        for (const r of state.lastClusterState.resources) {
          if (r.kind === 'Namespace' && r.metadata && r.metadata.name) namespaces.add(r.metadata.name);
          if (r.metadata && r.metadata.namespace) namespaces.add(r.metadata.namespace);
        }
      }
      let matches = Array.from(namespaces).filter(n => n.startsWith(prefix));
      if (currentToken.startsWith('--namespace=')) {
        matches = matches.map(m => `--namespace=${m}`);
      }
      return makeResult(currentToken, matches, true);
    }

    if (bin === 'kubectl' || bin === 'k') {
      const verb = positional[1];
      if (!verb || (positional.length === 2 && !isTrailingSpace)) {
        const verbs = ['get', 'describe', 'apply', 'create', 'delete', 'edit', 'patch', 'scale', 'rollout', 'logs', 'exec', 'top', 'cordon', 'uncordon', 'drain', 'taint', 'run'];
        return makeResult(currentToken, verbs.filter(v => v.startsWith(currentToken)), true);
      }

      // Kinds vs Dynamic Resources
      const isCompletingKind = (positional.length === 2 && isTrailingSpace) || (positional.length === 3 && !isTrailingSpace);
      if (['get', 'describe', 'delete', 'edit'].includes(verb) && isCompletingKind && !currentToken.includes('/')) {
        const kinds = ['pods', 'deployments', 'services', 'nodes', 'namespaces', 'configmaps', 'secrets', 'networkpolicies', 'ingresses', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs'];
        return makeResult(currentToken, kinds.filter(k => k.startsWith(currentToken)), true);
      }

      // Resource introspection from state.lastClusterState
      if (state.lastClusterState && Array.isArray(state.lastClusterState.resources)) {
        let targetKind = null;
        let namePrefix = currentToken;

        if (currentToken.includes('/')) {
          const slash = currentToken.indexOf('/');
          targetKind = currentToken.slice(0, slash);
          namePrefix = currentToken.slice(slash + 1);
        } else if (verb === 'logs' || verb === 'exec') {
          targetKind = 'pod';
        } else if (verb === 'cordon' || verb === 'uncordon' || verb === 'drain') {
          targetKind = 'node';
        } else if (positional.length >= 3) {
          targetKind = positional[2];
        }

        if (targetKind) {
          const normTarget = (targetKind.charAt(0).toUpperCase() + targetKind.slice(1).toLowerCase()).replace(/s$/, '');
          const matches = [];
          for (const r of state.lastClusterState.resources) {
            if (!r || !r.metadata || !r.metadata.name) continue;
            const rKind = (r.kind || '').toLowerCase().replace(/s$/, '');
            if (rKind !== normTarget.toLowerCase()) continue;
            if (specifiedNs && r.metadata.namespace && r.metadata.namespace !== specifiedNs) continue;
            if (r.metadata.name.startsWith(namePrefix)) {
              matches.push(currentToken.includes('/') ? `${targetKind}/${r.metadata.name}` : r.metadata.name);
            }
          }
          if (matches.length > 0) {
            return makeResult(currentToken, matches, true);
          }
        }
      }
    }

    return makeResult(currentToken, []);
  }

  function handleTabCompletion(input) {
    const res = computeTabCompletion(input.value, input.selectionStart || input.value.length);
    if (res && res.line) {
      input.value = res.line;
      if (typeof res.cursor === 'number' && typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(res.cursor, res.cursor);
      }
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('kubelabs_theme') || 'dark';
    setTheme(savedTheme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const nextTheme = state.currentTheme === 'dark' ? 'light' : state.currentTheme === 'light' ? 'high-contrast' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    state.currentTheme = theme;
    localStorage.setItem('kubelabs_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = `Theme: ${theme === 'high-contrast' ? 'High Contrast' : theme.charAt(0).toUpperCase() + theme.slice(1)}`;
    }
  }

  async function validateActiveLab() {
    if (!state.activeLab) return;
    const res = await apiCall(`/api/labs/${state.activeLab.id}/validate`, { method: 'POST' });
    renderValidationReport(res);
    if (res.learner) {
      state.overview.learner = res.learner;
      state.overview.skillRadar = res.skillRadar;
      updateHeaderTelemetry();
      renderPathsAndDomains();
      renderSkillRadar();
    }
  }

  async function solveActiveLab() {
    if (!state.activeLab) return;
    const res = await apiCall(`/api/labs/${state.activeLab.id}/solve`, { method: 'POST' });
    for (const item of res.commandOutputs || []) {
      appendTerminalLine(item.command, true);
      appendTerminalLine(item.output, false);
    }
    renderClusterTopology(res.clusterState);
    renderValidationReport(res);
    if (res.learner) {
      state.overview.learner = res.learner;
      state.overview.skillRadar = res.skillRadar;
      updateHeaderTelemetry();
      renderPathsAndDomains();
      renderSkillRadar();
    }
  }

  function renderValidationReport(report) {
    if (!report || report.isProject || report.contextType === 'project') return;
    if (report.labId && state.activeLab && report.labId !== state.activeLab.id) return;
    const container = document.getElementById('wb-validation-results');
    if (!container) return;
    container.innerHTML = `
      <div style="margin-bottom:0.5rem; font-size:0.84rem; font-weight:700; color:${report.passed ? 'var(--accent-green)' : 'var(--accent-amber)'};">
        Validation Score: ${report.score}% (${report.passedCount}/${report.totalCount} Assertions Passed)
        ${report.progressRecord && report.progressRecord.verificationHash ? `<br/><span style="font-size:0.72rem; color:var(--text-muted);">SHA-256 Proof: ${report.progressRecord.verificationHash}</span>` : ''}
      </div>
      ${(report.results || [])
        .map(
          (r) => `
          <div class="validation-item ${r.passed ? 'pass' : 'fail'}">
            <div><strong>${r.passed ? 'PASS' : 'FAIL'}:</strong> ${escapeHtml(r.description || r.type)}</div>
            <div style="font-size:0.74rem; color:var(--text-muted); margin-top:0.2rem;">Observed: ${escapeHtml(r.actual)} | Expected: ${escapeHtml(r.expected)}</div>
            ${!r.passed && r.remediation ? `<div style="font-size:0.74rem; color:#fca5a5; margin-top:0.2rem;">Fix: ${escapeHtml(r.remediation)}</div>` : ''}
          </div>
        `
        )
        .join('')}
    `;
  }

  function renderIncidents() {
    const grid = document.getElementById('incidents-grid');
    if (!grid || !state.overview) return;
    const runs = (state.overview.learner && state.overview.learner.incidents) || [];
    const resolvedSet = new Set(runs.filter((r) => r.status === 'resolved').map((r) => r.incident_id));

    grid.innerHTML = (state.overview.incidents || [])
      .map((inc) => {
        const isResolved = resolvedSet.has(inc.id);
        return `
          <div class="card">
            <div class="card-header">
              <div>
                <span class="badge sev1">${inc.severity}</span>
                <h3 class="card-title" style="margin-top:0.35rem;">${inc.title}</h3>
              </div>
              ${isResolved ? '<span class="badge completed">Resolved</span>' : `<span class="badge">+${inc.xpReward} XP</span>`}
            </div>
            <p style="font-size:0.82rem; color:#fca5a5;">${inc.alertSummary}</p>
            <p style="font-size:0.8rem; color:var(--text-secondary);">${inc.customerImpact}</p>
            <div style="margin-top:auto; padding-top:0.5rem;">
              <button class="btn btn-danger start-incident-btn" data-inc-id="${inc.id}" type="button">Inject Outage &amp; Command Incident</button>
            </div>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('.start-incident-btn').forEach((btn) => {
      btn.addEventListener('click', () => startIncident(btn.dataset.incId));
    });
  }

  async function startIncident(incidentId) {
    const data = await apiCall(`/api/incidents/${incidentId}/start`, { method: 'POST' });
    state.activeIncident = data.incident;
    const banner = document.getElementById('active-incident-banner');
    banner.style.display = 'flex';
    document.getElementById('inc-active-sev').textContent = data.incident.severity;
    document.getElementById('inc-active-title').textContent = data.incident.title;
    document.getElementById('inc-active-alert').textContent = data.incident.alertSummary;
    document.getElementById('inc-active-impact').textContent = `Impact: ${data.incident.customerImpact}`;
    document.getElementById('inc-active-hints').innerHTML =
      '<strong>Diagnostic Clues:</strong><br/>' +
      data.incident.diagnosticHints.map((h) => `• ${h}`).join('<br/>');
    document.getElementById('inc-verification-output').innerHTML = '';
    renderClusterTopology(data.clusterState);
    appendTerminalLine(`=== [ALERT] INJECTED PRODUCTION INCIDENT: ${data.incident.title} ===`);
  }

  const NODE_TYPE_ICONS = {
    waf: '🌐',
    ingress: '🚪',
    service: '⚡',
    deployment: '📦',
    database: '🗄️',
    storage: '💾',
    networkpolicy: '🛡️',
    mesh: '🕸️',
    gitops: '🐙',
    observability: '📊',
    'gpu-pool': '🎮',
    cache: '⚡',
    iac: '🏗️'
  };

  let archCanvasZoom = 1.0;
  let connectingPortState = null;

  function initArchitectureDesigner() {
    const select = document.getElementById('arch-blueprint-select');
    if (!select || !state.overview) return;
    const refs = state.overview.referenceArchitectures || [];
    select.innerHTML = refs.map((r) => `<option value="${r.id}">${r.name} (${r.category})</option>`).join('');

    if (refs.length > 0) {
      loadReferenceBlueprint(refs[0].id);
    }

    select.onchange = () => loadReferenceBlueprint(select.value);

    // Component Palette Buttons
    document.querySelectorAll('.arch-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = `n-${Date.now().toString().slice(-4)}`;
        const type = btn.dataset.type;
        const count = state.activeArch.nodes.length;
        const newNode = {
          id,
          type,
          label: btn.dataset.label || `${type.toUpperCase()} Component`,
          namespace: 'production',
          replicas: 2,
          x: 40 + (count % 4) * 190,
          y: 40 + Math.floor(count / 4) * 140
        };

        if (state.activeArch.nodes.length > 0) {
          const prev = state.activeArch.nodes[state.activeArch.nodes.length - 1];
          state.activeArch.edges.push({ from: prev.id, to: id, protocol: 'TCP/mTLS' });
        }

        state.activeArch.nodes.push(newNode);
        refreshArchitectureAnalysis();
      });
    });

    // Clear Canvas
    const clearBtn = document.getElementById('btn-arch-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.activeArch = {
          name: 'Custom Cloud-Native Architecture',
          nodes: [],
          edges: []
        };
        document.getElementById('arch-current-title').textContent = state.activeArch.name;
        refreshArchitectureAnalysis();
      });
    }

    // Fault Injection Simulator (toggles failure on first critical node)
    const faultBtn = document.getElementById('btn-arch-fault-inject');
    if (faultBtn) {
      faultBtn.addEventListener('click', () => {
        const targetNode = state.activeArch.nodes.find(
          (n) => n.type === 'deployment' || n.type === 'database' || n.type === 'gpu-pool' || n.type === 'ingress'
        ) || state.activeArch.nodes[0];
        if (!targetNode) return;
        targetNode.killed = !targetNode.killed;
        refreshArchitectureAnalysis();
      });
    }

    // Zoom Controls
    const zoomInBtn = document.getElementById('btn-arch-zoom-in');
    const zoomOutBtn = document.getElementById('btn-arch-zoom-out');
    const zoomResetBtn = document.getElementById('btn-arch-zoom-reset');

    function applyZoom() {
      const nodesLayer = document.getElementById('arch-nodes-canvas');
      const svg = document.getElementById('arch-canvas-svg');
      if (nodesLayer) {
        nodesLayer.style.transform = `scale(${archCanvasZoom})`;
        nodesLayer.style.transformOrigin = '0 0';
      }
      if (svg) {
        svg.style.transform = `scale(${archCanvasZoom})`;
        svg.style.transformOrigin = '0 0';
      }
      if (zoomResetBtn) zoomResetBtn.textContent = `${Math.round(archCanvasZoom * 100)}%`;
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (archCanvasZoom < 1.6) {
          archCanvasZoom = Math.min(1.6, archCanvasZoom + 0.15);
          applyZoom();
        }
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (archCanvasZoom > 0.5) {
          archCanvasZoom = Math.max(0.5, archCanvasZoom - 0.15);
          applyZoom();
        }
      });
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        archCanvasZoom = 1.0;
        applyZoom();
      });
    }

    // Inspector Tabs Switcher
    document.querySelectorAll('.arch-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        document.querySelectorAll('.arch-tab-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        document.querySelectorAll('.arch-tab-content').forEach((c) => {
          const isActive = c.id === targetTab;
          c.classList.toggle('active', isActive);
          c.style.display = isActive ? 'flex' : 'none';
        });
      });
    });

    // Copy YAML button
    const copyYamlBtn = document.getElementById('btn-copy-arch-yaml');
    if (copyYamlBtn) {
      copyYamlBtn.addEventListener('click', async () => {
        const val = document.getElementById('arch-yaml-out').value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(val);
            const orig = copyYamlBtn.textContent;
            copyYamlBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyYamlBtn.textContent = orig; }, 1500);
          } catch {}
        }
      });
    }

    // Copy HCL button
    const copyHclBtn = document.getElementById('btn-copy-arch-hcl');
    if (copyHclBtn) {
      copyHclBtn.addEventListener('click', async () => {
        const val = document.getElementById('arch-hcl-out').value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(val);
            const orig = copyHclBtn.textContent;
            copyHclBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyHclBtn.textContent = orig; }, 1500);
          } catch {}
        }
      });
    }

    // Direct Apply Manifest from YAML tab
    const applyYamlTabBtn = document.getElementById('btn-arch-apply-yaml');
    if (applyYamlTabBtn) {
      applyYamlTabBtn.addEventListener('click', () => {
        const deployBtn = document.getElementById('btn-arch-deploy');
        if (deployBtn) deployBtn.click();
      });
    }
  }

  function computeBlueprintLayout(nodes) {
    const typeCols = {
      waf: 0,
      ingress: 1,
      mesh: 1,
      service: 2,
      networkpolicy: 2,
      deployment: 3,
      'gpu-pool': 3,
      database: 4,
      storage: 4,
      cache: 4,
      gitops: 0,
      iac: 1,
      observability: 4
    };
    const colCounters = {};
    nodes.forEach((n, idx) => {
      const col = typeCols[n.type] !== undefined ? typeCols[n.type] : (idx % 5);
      const row = colCounters[col] || 0;
      colCounters[col] = row + 1;
      n.x = 25 + col * 185;
      n.y = 25 + row * 135;
    });
  }

  function loadReferenceBlueprint(refId) {
    const refs = (state.overview && state.overview.referenceArchitectures) || [];
    const found = refs.find((r) => r.id === refId);
    if (!found) return;
    state.activeArch = {
      name: found.name,
      nodes: JSON.parse(JSON.stringify(found.nodes)),
      edges: JSON.parse(JSON.stringify(found.edges))
    };
    computeBlueprintLayout(state.activeArch.nodes);
    document.getElementById('arch-current-title').textContent = found.name;
    refreshArchitectureAnalysis();
  }

  async function refreshArchitectureAnalysis() {
    renderArchitectureCanvas();

    const res = await apiCall('/api/architectures/analyze', {
      method: 'POST',
      body: { nodes: state.activeArch.nodes, edges: state.activeArch.edges }
    });

    document.getElementById('arch-yaml-out').value = res.kubernetesYaml || '';
    document.getElementById('arch-hcl-out').value = res.opentofuHcl || '';

    const a = res.analysis;
    const hasKilled = state.activeArch.nodes.some((n) => n.killed);
    const displayScore = hasKilled ? Math.max(30, a.overallScore - 35) : a.overallScore;

    document.getElementById('arch-score-badge').textContent =
      `Well-Architected Score: ${displayScore}/100 | Est. $${a.estimatedMonthlyCostUsd}/mo`;

    // Render findings
    const findingsEl = document.getElementById('arch-review-findings');
    if (findingsEl) {
      findingsEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
          <div><strong>4 Pillars:</strong> Reliability ${hasKilled ? Math.max(20, a.pillars.reliability - 40) : a.pillars.reliability}% | Security ${a.pillars.security}% | Observability ${a.pillars.observability}% | Ops ${a.pillars.operationalExcellence}%</div>
          <span style="font-weight:700; color:var(--accent-blue);">${state.activeArch.nodes.length} Components &bull; ${state.activeArch.edges.length} Connections</span>
        </div>
        ${hasKilled ? `<div style="color:#fca5a5; margin-top:0.3rem; font-weight:700;">🔥 SIMULATED PRODUCTION OUTAGE: Single Point of Failure triggered. Downstream traffic blocked.</div>` : ''}
        ${a.spofs.length > 0 ? `<div style="color:#fde047; margin-top:0.25rem;">⚠️ ${escapeHtml(a.spofs.join(' | '))}</div>` : '<div style="color:var(--accent-green); margin-top:0.25rem;">✓ Zero Single Points of Failure (SPOFs) detected across active topology.</div>'}
      `;
    }

    // Render Tab 3 Well-Architected & CIS Review
    renderArchitectureReviewTab(a, hasKilled);
  }

  function renderArchitectureCanvas() {
    const nodesLayer = document.getElementById('arch-nodes-canvas');
    if (!nodesLayer) return;

    // Render HTML Nodes
    nodesLayer.innerHTML = state.activeArch.nodes
      .map((n) => {
        const isSpof = (n.type === 'deployment' || n.type === 'database' || n.type === 'ingress' || n.type === 'gpu-pool') && Number(n.replicas || 1) < 2;
        const icon = NODE_TYPE_ICONS[n.type] || '📦';
        return `
          <div class="arch-canvas-node ${isSpof ? 'spof-node' : ''} ${n.killed ? 'killed-node' : ''}" id="arch-node-${n.id}" data-id="${n.id}" style="left:${n.x || 30}px; top:${n.y || 30}px;">
            <div class="arch-node-port input-port" data-id="${n.id}" data-port="in" title="Click to connect cable in"></div>
            <div class="arch-node-header">
              <span class="arch-node-type-badge">${icon} ${escapeHtml(n.type)}</span>
              <button type="button" class="arch-node-remove-btn" data-id="${n.id}" title="Remove Component">&times;</button>
            </div>
            <div class="arch-node-body">
              <div class="arch-node-title" title="${escapeHtml(n.label)}">${escapeHtml(n.label)}</div>
              <div class="arch-node-meta">
                <span>ns: ${escapeHtml(n.namespace || 'production')}</span>
                <div class="arch-node-stepper">
                  <button type="button" class="arch-step-btn btn-rep-down" data-id="${n.id}" title="Decrease replicas">-</button>
                  <span style="font-weight:700; min-width:14px; text-align:center;">${n.replicas || 1}</span>
                  <button type="button" class="arch-step-btn btn-rep-up" data-id="${n.id}" title="Increase replicas">+</button>
                </div>
              </div>
              <span class="arch-node-status-badge ${n.killed ? 'killed' : isSpof ? 'spof' : 'healthy'}">
                ${n.killed ? '🔥 Outage (Killed)' : isSpof ? '⚠️ SPOF (1 Replica)' : '✓ Multi-AZ Active'}
              </span>
            </div>
            <div class="arch-node-port output-port" data-id="${n.id}" data-port="out" title="Click to connect cable out"></div>
          </div>
        `;
      })
      .join('');

    // Wire Node Dragging
    nodesLayer.querySelectorAll('.arch-canvas-node').forEach((nodeEl) => {
      setupNodeDrag(nodeEl);
    });

    // Wire Remove Node Buttons
    nodesLayer.querySelectorAll('.arch-node-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        state.activeArch.nodes = state.activeArch.nodes.filter((n) => n.id !== id);
        state.activeArch.edges = state.activeArch.edges.filter((ed) => ed.from !== id && ed.to !== id);
        refreshArchitectureAnalysis();
      });
    });

    // Wire Replicas Steppers
    nodesLayer.querySelectorAll('.btn-rep-up').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const target = state.activeArch.nodes.find((n) => n.id === id);
        if (target) {
          target.replicas = (Number(target.replicas) || 1) + 1;
          refreshArchitectureAnalysis();
        }
      });
    });
    nodesLayer.querySelectorAll('.btn-rep-down').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const target = state.activeArch.nodes.find((n) => n.id === id);
        if (target && Number(target.replicas) > 1) {
          target.replicas = Number(target.replicas) - 1;
          refreshArchitectureAnalysis();
        }
      });
    });

    // Wire Connection Ports
    nodesLayer.querySelectorAll('.arch-node-port').forEach((portEl) => {
      portEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeId = portEl.dataset.id;
        const portType = portEl.dataset.port;

        if (portType === 'out') {
          connectingPortState = { fromId: nodeId };
          nodesLayer.querySelectorAll('.arch-node-port').forEach((p) => p.classList.remove('connecting'));
          portEl.classList.add('connecting');
        } else if (portType === 'in' && connectingPortState && connectingPortState.fromId !== nodeId) {
          const fromId = connectingPortState.fromId;
          const exists = state.activeArch.edges.some((ed) => ed.from === fromId && ed.to === nodeId);
          if (!exists) {
            state.activeArch.edges.push({ from: fromId, to: nodeId, protocol: 'TCP/mTLS' });
          }
          connectingPortState = null;
          nodesLayer.querySelectorAll('.arch-node-port').forEach((p) => p.classList.remove('connecting'));
          refreshArchitectureAnalysis();
        }
      });
    });

    renderCablesAndPulses();
  }

  function renderCablesAndPulses() {
    const cablesGroup = document.getElementById('arch-cables-group');
    const pulsesGroup = document.getElementById('arch-pulses-group');
    if (!cablesGroup || !pulsesGroup) return;

    let cablesSvg = '';
    let pulsesSvg = '';

    state.activeArch.edges.forEach((edge, idx) => {
      const fromNode = state.activeArch.nodes.find((n) => n.id === edge.from);
      const toNode = state.activeArch.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const x1 = (fromNode.x || 30) + 170;
      const y1 = (fromNode.y || 30) + 55;
      const x2 = (toNode.x || 30);
      const y2 = (toNode.y || 30) + 55;

      const dx = Math.max(45, Math.abs(x2 - x1) * 0.5);
      const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const isKilled = fromNode.killed || toNode.killed;
      const isSpof = (fromNode.replicas || 1) < 2 || (toNode.replicas || 1) < 2;

      cablesSvg += `
        <path class="arch-cable ${isKilled ? 'killed' : isSpof ? 'spof' : ''}" d="${pathD}" marker-end="url(${isKilled ? '#cable-arrow-killed' : '#cable-arrow'})" data-edge-idx="${idx}" />
      `;

      if (!isKilled) {
        pulsesSvg += `
          <circle class="arch-packet-pulse" r="3.5">
            <animateMotion path="${pathD}" dur="2.4s" repeatCount="indefinite" />
          </circle>
        `;
      }
    });

    cablesGroup.innerHTML = cablesSvg;
    pulsesGroup.innerHTML = pulsesSvg;
  }

  function setupNodeDrag(nodeEl) {
    let startX = 0;
    let startY = 0;
    let initialNodeX = 0;
    let initialNodeY = 0;
    let isDragging = false;
    const nodeId = nodeEl.dataset.id;
    const nodeObj = state.activeArch.nodes.find((n) => n.id === nodeId);

    function onPointerDown(e) {
      if (e.target.closest('button') || e.target.closest('.arch-node-port')) return;
      isDragging = true;
      nodeEl.classList.add('dragging');
      startX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      startY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      initialNodeX = nodeObj ? (nodeObj.x || 30) : parseInt(nodeEl.style.left || '30', 10);
      initialNodeY = nodeObj ? (nodeObj.y || 30) : parseInt(nodeEl.style.top || '30', 10);

      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const dx = (clientX - startX) / archCanvasZoom;
      const dy = (clientY - startY) / archCanvasZoom;

      const newX = Math.max(10, Math.min(1800, initialNodeX + dx));
      const newY = Math.max(10, Math.min(1200, initialNodeY + dy));

      if (nodeObj) {
        nodeObj.x = newX;
        nodeObj.y = newY;
      }
      nodeEl.style.left = `${newX}px`;
      nodeEl.style.top = `${newY}px`;

      renderCablesAndPulses();
    }

    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      nodeEl.classList.remove('dragging');
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    }

    nodeEl.addEventListener('mousedown', onPointerDown);
    nodeEl.addEventListener('touchstart', onPointerDown, { passive: true });
  }

  function renderArchitectureReviewTab(analysis, hasKilled) {
    const summaryEl = document.getElementById('arch-pillars-summary');
    const spofsEl = document.getElementById('arch-spofs-list');
    const recsEl = document.getElementById('arch-recommendations-list');
    if (!summaryEl || !analysis) return;

    const rel = hasKilled ? Math.max(20, analysis.pillars.reliability - 40) : analysis.pillars.reliability;
    const sec = analysis.pillars.security;
    const obs = analysis.pillars.observability;
    const ops = analysis.pillars.operationalExcellence;

    summaryEl.innerHTML = `
      <div style="background:var(--bg-secondary); border:1px solid var(--border-subtle); border-radius:6px; padding:0.65rem;">
        <div style="font-weight:700; font-size:0.86rem; color:var(--text-primary); margin-bottom:0.35rem;">
          Well-Architected Framework Pillars (AWS &amp; CIS Benchmarks)
        </div>
        <div class="arch-pillar-grid">
          <div class="arch-pillar-item">
            <div class="arch-pillar-label"><span>Reliability &amp; HA</span><strong>${rel}%</strong></div>
            <div class="arch-pillar-meter"><div class="arch-pillar-fill" style="width:${rel}%; background:var(--accent-blue);"></div></div>
          </div>
          <div class="arch-pillar-item">
            <div class="arch-pillar-label"><span>Zero-Trust Security</span><strong>${sec}%</strong></div>
            <div class="arch-pillar-meter"><div class="arch-pillar-fill" style="width:${sec}%; background:var(--accent-green);"></div></div>
          </div>
          <div class="arch-pillar-item">
            <div class="arch-pillar-label"><span>Observability &amp; SLO</span><strong>${obs}%</strong></div>
            <div class="arch-pillar-meter"><div class="arch-pillar-fill" style="width:${obs}%; background:var(--accent-purple);"></div></div>
          </div>
          <div class="arch-pillar-item">
            <div class="arch-pillar-label"><span>Ops Excellence &amp; GitOps</span><strong>${ops}%</strong></div>
            <div class="arch-pillar-meter"><div class="arch-pillar-fill" style="width:${ops}%; background:var(--accent-amber);"></div></div>
          </div>
        </div>
      </div>
    `;

    if (spofsEl) {
      if (analysis.spofs.length === 0 && !hasKilled) {
        spofsEl.innerHTML = `
          <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:6px; padding:0.5rem; font-size:0.76rem; color:#86efac;">
            ✓ High Availability Guaranteed: All critical components configured with 2+ replicas across independent availability zones.
          </div>
        `;
      } else {
        spofsEl.innerHTML = (analysis.spofs || [])
          .map(
            (spof) => `
            <div class="arch-spof-item">
              <span>⚠️ ${escapeHtml(spof)}</span>
              <button type="button" class="btn btn-xs btn-primary btn-spof-fix" style="font-size:0.7rem; padding:0.15rem 0.45rem;">Remediate</button>
            </div>
          `
          )
          .join('');

        spofsEl.querySelectorAll('.btn-spof-fix').forEach((btn) => {
          btn.addEventListener('click', () => {
            const spofNode = state.activeArch.nodes.find(
              (n) => (n.type === 'deployment' || n.type === 'database' || n.type === 'ingress' || n.type === 'gpu-pool') && Number(n.replicas || 1) < 2
            );
            if (spofNode) {
              spofNode.replicas = 2;
              refreshArchitectureAnalysis();
            }
          });
        });
      }
    }

    if (recsEl) {
      recsEl.innerHTML = (analysis.recommendations || [])
        .map((rec) => `<div class="arch-rec-item">💡 ${escapeHtml(rec)}</div>`)
        .join('');
    }
  }

  function renderCertificationsAndExams() {
    const listEl = document.getElementById('cert-tracks-list');
    if (!listEl || !state.overview) return;

    listEl.innerHTML = (state.overview.certificationTracks || [])
      .map(
        (t) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:0.75rem; border-radius:8px; border:1px solid var(--border-subtle);">
          <div>
            <div style="font-weight:700; font-size:0.9rem;">${t.certificationTitle}</div>
            <div style="font-size:0.76rem; color:var(--text-muted);">Role: ${t.role} • ${t.questionCount} Questions • Pass: ${t.passingScorePercent}%</div>
          </div>
          <button class="btn btn-primary start-exam-btn" data-track-id="${t.id}" type="button">Take Exam</button>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('.start-exam-btn').forEach((btn) => {
      btn.addEventListener('click', () => loadExam(btn.dataset.trackId));
    });

    renderEarnedCertificates();
    renderSkillRadar();
  }

  function renderEarnedCertificates() {
    const container = document.getElementById('earned-certs-list');
    if (!container || !state.overview) return;
    const certs = (state.overview.learner && state.overview.learner.certificates) || [];
    if (certs.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML =
      '<h3 style="font-size:0.9rem; color:var(--accent-green); margin-bottom:0.5rem;">Issued Cryptographic Certificates</h3>' +
      certs
        .map(
          (c) => `
          <div style="background:rgba(16,185,129,0.1); border:1px solid var(--accent-green); border-radius:8px; padding:0.75rem; margin-bottom:0.5rem;">
            <div style="font-weight:700;">${c.title} (${c.score_percent}%)</div>
            <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-secondary);">ID: ${c.cert_id}</div>
            <div style="font-size:0.72rem; font-family:var(--font-mono); color:var(--text-muted); word-break:break-all;">HMAC-SHA256: ${c.signature_sha256}</div>
          </div>
        `
        )
        .join('');
  }

  function renderSkillRadar() {
    const grid = document.getElementById('skill-radar-grid');
    if (!grid || !state.overview) return;
    grid.innerHTML = (state.overview.skillRadar || [])
      .map(
        (s) => `
        <div style="background:var(--bg-secondary); border:1px solid var(--border-subtle); border-radius:6px; padding:0.65rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:600;">
            <span>${s.title}</span>
            <span style="color:var(--accent-blue);">${s.masteryPercent}%</span>
          </div>
          <div style="height:6px; background:#090d16; border-radius:4px; margin-top:0.35rem; overflow:hidden;">
            <div style="height:100%; width:${s.masteryPercent}%; background:var(--accent-blue);"></div>
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">${s.completedLabs}/${s.totalLabs} Labs Mastered</div>
        </div>
      `
      )
      .join('');
  }

  async function loadExam(trackId) {
    const exam = await apiCall(`/api/certifications/tracks/${trackId}/questions`);
    state.activeExam = exam;
    const area = document.getElementById('exam-runner-area');
    area.innerHTML = `
      <div style="margin-bottom:0.75rem;">
        <h3 style="font-size:1rem; color:var(--accent-blue);">${exam.certificationTitle}</h3>
        <p style="font-size:0.78rem; color:var(--text-muted);">Answer all ${exam.questions.length} scenario questions below:</p>
      </div>
      <form id="exam-form">
        ${exam.questions
          .map(
            (q, idx) => `
            <div style="background:var(--bg-secondary); padding:0.75rem; border-radius:6px; border:1px solid var(--border-subtle); margin-bottom:0.65rem;">
              <div style="font-size:0.83rem; font-weight:600; margin-bottom:0.4rem;">Q${idx + 1} [${q.domainTitle}]: ${q.question}</div>
              ${q.options
                .map(
                  (opt, oIdx) => `
                  <label style="display:block; font-size:0.79rem; color:var(--text-secondary); margin:0.25rem 0; cursor:pointer;">
                    <input type="radio" name="${q.id}" value="${oIdx}" ${oIdx === 0 ? 'checked' : ''} /> ${opt}
                  </label>
                `
                )
                .join('')}
            </div>
          `
          )
          .join('')}
        <button class="btn btn-success" type="submit">Submit Assessment &amp; Issue Verifiable Certificate</button>
      </form>
    `;

    document.getElementById('exam-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const answers = {};
      for (const [k, v] of formData.entries()) {
        answers[k] = Number(v);
      }
      const res = await apiCall('/api/certifications/submit', {
        method: 'POST',
        body: { trackId: exam.trackId, answers, learnerName: 'Cloud-Native Engineer' }
      });
      if (res.learner) {
        state.overview.learner = res.learner;
        updateHeaderTelemetry();
        renderEarnedCertificates();
      }
      area.innerHTML = `
        <div class="validation-item ${res.passed ? 'pass' : 'fail'}">
          <h4>${res.passed ? 'CERTIFICATION EARNED!' : 'Assessment Completed'} — Score: ${res.scorePercent}% (${res.correctCount}/${res.totalQuestions})</h4>
          ${res.certificate ? `<p style="font-size:0.8rem; margin-top:0.3rem;">Issued Certificate ID: <code>${res.certificate.certId}</code></p>` : '<p style="font-size:0.8rem;">Review the explanations below and retry to achieve 75%+.</p>'}
        </div>
      `;
    });
  }

  async function runLiveAgentAudit() {
    const summaryEl = document.getElementById('agent-audit-summary');
    const gridEl = document.getElementById('agent-audit-grid');
    if (!summaryEl || !gridEl) return;

    // Show initial skeleton loading states to completely prevent empty black card boxes
    summaryEl.innerHTML = `
      <div class="card" style="padding:1rem 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span class="badge badge-cyan badge-glow-cyan">AUDITING AGENTS</span>
            <strong>Running real-time 11-agent production readiness evaluation...</strong>
          </div>
          <span style="font-size:0.8rem; color:var(--text-muted);">Please wait...</span>
        </div>
      </div>
    `;

    gridEl.innerHTML = Array.from({ length: 11 })
      .map(
        () => `
        <div class="audit-skeleton-card">
          <div class="audit-skeleton-header"></div>
          <div class="audit-skeleton-line" style="width:80%;"></div>
          <div class="audit-skeleton-line" style="width:65%;"></div>
          <div class="audit-skeleton-line" style="width:90%;"></div>
        </div>
      `
      )
      .join('');

    try {
      const report = await apiCall('/api/agents/audit');
      summaryEl.innerHTML = `
        <div class="card" style="padding:1rem 1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span class="badge ${report.passed ? 'completed badge-glow-emerald' : 'sev1 badge-glow-red'}">${report.passed ? 'ALL 11 AGENTS GREEN' : 'AUDIT WARNING'}</span>
              <strong style="color:var(--text-primary);">${report.summary}</strong>
            </div>
            <span style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono);">Execution: ${report.durationMs}ms | Memory RSS: ${report.memoryRssMB} MB</span>
          </div>
        </div>
      `;

      gridEl.innerHTML = (report.agents || [])
        .map(
          (a) => `
          <div class="card agent-card">
            <div class="agent-card-header">
              <span class="agent-role-title">
                <span style="color:var(--accent-cyan); font-size:1.05rem;">⚙</span>
                <span>${a.role}</span>
              </span>
              <span class="badge ${a.status === 'PASS' ? 'completed' : 'sev1'}">${a.status}</span>
            </div>
            <div class="agent-checks-list">
              ${a.checks
                .map(
                  (c) => `
                  <div class="agent-check-item">
                    <span class="status-dot ${c.passed ? 'healthy' : 'broken'}"></span>
                    <span>${c.name}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        `
        )
        .join('');
    } catch (err) {
      summaryEl.innerHTML = `
        <div class="card" style="padding:1rem 1.25rem; border-color:var(--accent-red);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <span class="badge sev1">AUDIT ERROR</span>
              <strong style="color:var(--accent-red); margin-left:0.5rem;">Failed to run live self-audit: ${err.message}</strong>
            </div>
            <button class="btn btn-primary" onclick="runLiveAgentAudit()" type="button" style="padding:0.35rem 0.75rem; font-size:0.8rem;">Retry Audit</button>
          </div>
        </div>
      `;
    }
  }

  function setupResizableWorkbench() {
    const layout = document.getElementById('workbench-layout');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');
    if (!layout || !resizerLeft || !resizerRight) return;

    // Restore saved widths from localStorage
    const savedLeft = localStorage.getItem('kubelabs_pane_left_width');
    const savedRight = localStorage.getItem('kubelabs_pane_right_width');
    if (savedLeft) {
      layout.style.setProperty('--wb-left-width', `${savedLeft}px`);
      resizerLeft.setAttribute('aria-valuenow', savedLeft);
    }
    if (savedRight) {
      layout.style.setProperty('--wb-right-width', `${savedRight}px`);
      resizerRight.setAttribute('aria-valuenow', savedRight);
    }

    function initDrag(resizer, isLeft) {
      function startDrag(e) {
        e.preventDefault();
        resizer.classList.add('dragging');
        const rect = layout.getBoundingClientRect();

        function onMove(moveEvent) {
          const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0] ? moveEvent.touches[0].clientX : 0);
          if (isLeft) {
            const newWidth = Math.max(220, Math.min(650, currentX - rect.left));
            layout.style.setProperty('--wb-left-width', `${newWidth}px`);
            resizer.setAttribute('aria-valuenow', String(newWidth));
            localStorage.setItem('kubelabs_pane_left_width', newWidth);
          } else {
            const newWidth = Math.max(240, Math.min(650, rect.right - currentX));
            layout.style.setProperty('--wb-right-width', `${newWidth}px`);
            resizer.setAttribute('aria-valuenow', String(newWidth));
            localStorage.setItem('kubelabs_pane_right_width', newWidth);
          }
        }

        function onEnd() {
          resizer.classList.remove('dragging');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onEnd);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onEnd);
        }

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
      }

      resizer.addEventListener('mousedown', startDrag);
      resizer.addEventListener('touchstart', startDrag, { passive: false });

      // Keyboard accessibility (ArrowLeft / ArrowRight)
      resizer.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const currentVal = parseInt(
            getComputedStyle(layout).getPropertyValue(isLeft ? '--wb-left-width' : '--wb-right-width') || (isLeft ? '360' : '380'),
            10
          );
          const delta = (e.key === 'ArrowRight' ? 25 : -25) * (isLeft ? 1 : -1);
          const updated = Math.max(220, Math.min(650, currentVal + delta));
          layout.style.setProperty(isLeft ? '--wb-left-width' : '--wb-right-width', `${updated}px`);
          resizer.setAttribute('aria-valuenow', String(updated));
          localStorage.setItem(isLeft ? 'kubelabs_pane_left_width' : 'kubelabs_pane_right_width', updated);
          announceAria(`${isLeft ? 'Left' : 'Right'} pane width set to ${updated} pixels`);
        }
      });
    }

    initDrag(resizerLeft, true);
    initDrag(resizerRight, false);
  }

  function setupMobileQuickKeybar() {
    const keybar = document.getElementById('mobile-quick-keybar');
    const termInput = document.getElementById('terminal-input');
    if (!keybar) return;

    keybar.querySelectorAll('.quick-key-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const toInsert = btn.dataset.insert;
        const action = btn.dataset.action;

        if (state.terminalView) {
          if (toInsert) {
            if (typeof ContextAwareQuickKeyEngine !== 'undefined') {
              const res = ContextAwareQuickKeyEngine.insertToken(state.terminalView.lineBuffer, state.terminalView.cursorPos, toInsert);
              state.terminalView.setLineAndCursor(res.line, res.cursorPos);
            } else {
              state.terminalView.insertAtCursor(toInsert);
            }
          } else if (action === 'tab') {
            state.terminalView.handleTabCompletion();
          } else if (action === 'ctrl-c') {
            state.terminalView.interrupt();
          } else if (action === 'history-up') {
            state.terminalView.historyUp();
          } else if (action === 'history-down') {
            state.terminalView.historyDown();
          } else if (action === 'clear') {
            state.terminalView.setCommand('');
          }
          state.terminalView.focus();
          return;
        }

        if (!termInput) return;
        if (toInsert) {
          if (typeof ContextAwareQuickKeyEngine !== 'undefined') {
            const start = termInput.selectionStart ?? termInput.value.length;
            const res = ContextAwareQuickKeyEngine.insertToken(termInput.value, start, toInsert);
            termInput.value = res.line;
            termInput.setSelectionRange(res.cursorPos, res.cursorPos);
          } else {
            const start = termInput.selectionStart || termInput.value.length;
            const end = termInput.selectionEnd || termInput.value.length;
            const val = termInput.value;
            termInput.value = val.slice(0, start) + toInsert + val.slice(end);
            const nextPos = start + toInsert.length;
            termInput.setSelectionRange(nextPos, nextPos);
          }
          termInput.focus();
        } else if (action === 'tab') {
          handleTabCompletion(termInput);
          termInput.focus();
        } else if (action === 'ctrl-c') {
          termInput.value = '';
          state.historyIndex = -1;
          appendTerminalLine('^C', false);
          termInput.focus();
        } else if (action === 'history-up') {
          if (state.commandHistory.length > 0) {
            if (state.historyIndex === -1) {
              state.historyIndex = state.commandHistory.length - 1;
            } else if (state.historyIndex > 0) {
              state.historyIndex -= 1;
            }
            termInput.value = state.commandHistory[state.historyIndex];
            termInput.focus();
          }
        } else if (action === 'history-down') {
          if (state.historyIndex !== -1) {
            if (state.historyIndex < state.commandHistory.length - 1) {
              state.historyIndex += 1;
              termInput.value = state.commandHistory[state.historyIndex];
            } else {
              state.historyIndex = -1;
              termInput.value = '';
            }
          }
          termInput.focus();
        } else if (action === 'clear') {
          termInput.value = '';
          termInput.focus();
        }
      });
    });
  }

  function setupMobilePaneSwitcher() {
    const layout = document.getElementById('workbench-layout');
    const tabs = document.querySelectorAll('.mobile-pane-tab');
    if (!layout || tabs.length === 0) return;

    layout.classList.add('mobile-tabbed');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.pane;
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.workbench-pane').forEach((pane) => {
          pane.classList.remove('mobile-active');
        });
        const targetPane = document.getElementById(targetId);
        if (targetPane) {
          targetPane.classList.add('mobile-active');
        }
        announceAria(`Switched workbench tab to ${tab.textContent}`);
      });
    });
  }

  function setupWorkbenchTabs() {
    // Center Pane Tabs (Terminal, Editor, Observability)
    document.querySelectorAll('.center-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        document.querySelectorAll('.center-tab-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        document.querySelectorAll('.center-tab-content').forEach((pane) => {
          const isActive = pane.id === targetTab;
          pane.classList.toggle('active', isActive);
          pane.style.display = isActive ? 'flex' : 'none';
        });

        if (targetTab === 'center-tab-editor') {
          updateEditorGutter();
        } else if (targetTab === 'center-tab-observability') {
          const input = document.getElementById('promql-query-input');
          drawPromqlChart(input ? input.value : 'rate(http_requests_total[5m])');
        } else if (targetTab === 'center-tab-terminal') {
          if (state.terminalView) state.terminalView.focus();
        }
      });
    });

    // Right Pane Tabs (Topology, Objectives & CIS, AI Mentor)
    document.querySelectorAll('.right-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        document.querySelectorAll('.right-tab-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        document.querySelectorAll('.right-tab-content').forEach((pane) => {
          const isActive = pane.id === targetTab;
          pane.classList.toggle('active', isActive);
          pane.style.display = isActive ? 'flex' : 'none';
        });
      });
    });

    // Editor Line Numbers Gutter Sync
    const editor = document.getElementById('wb-manifest-editor');
    if (editor) {
      editor.addEventListener('input', updateEditorGutter);
      editor.addEventListener('scroll', updateEditorGutter);
    }

    // Format YAML button
    const formatBtn = document.getElementById('btn-format-yaml');
    if (formatBtn && editor) {
      formatBtn.addEventListener('click', () => {
        try {
          const val = editor.value;
          const formatted = val
            .split('\n')
            .map((line) => line.replace(/\t/g, '  '))
            .join('\n');
          editor.value = formatted;
          updateEditorGutter();
        } catch {}
      });
    }

    // Diff with Live Cluster button
    const diffBtn = document.getElementById('btn-diff-manifest');
    const closeDiffBtn = document.getElementById('btn-close-diff');
    const diffPanel = document.getElementById('wb-manifest-diff');
    const diffContent = document.getElementById('wb-diff-content');
    if (diffBtn && editor && diffPanel && diffContent) {
      diffBtn.addEventListener('click', () => {
        const starter = (state.activeLab && state.activeLab.starterManifest) ? state.activeLab.starterManifest : '';
        const current = editor.value;
        const diff = computeSimpleDiff(starter, current);
        diffContent.innerHTML = diff
          .map((d) => `<div class="diff-line ${d.type}">${escapeHtml(d.text)}</div>`)
          .join('');
        diffPanel.style.display = 'block';
      });
    }
    if (closeDiffBtn && diffPanel) {
      closeDiffBtn.addEventListener('click', () => {
        diffPanel.style.display = 'none';
      });
    }

    // PromQL Run Query & Preset Selector
    const runPromqlBtn = document.getElementById('btn-run-promql');
    const promqlInput = document.getElementById('promql-query-input');
    const presetSelector = document.getElementById('promql-preset-selector');
    if (presetSelector && promqlInput) {
      presetSelector.addEventListener('change', () => {
        promqlInput.value = presetSelector.value;
        drawPromqlChart(promqlInput.value);
      });
    }
    if (runPromqlBtn && promqlInput) {
      runPromqlBtn.addEventListener('click', () => {
        drawPromqlChart(promqlInput.value);
      });
    }

    // Loki Filter Input
    const lokiFilter = document.getElementById('loki-filter-input');
    const lokiStream = document.getElementById('loki-log-tailer');
    if (lokiFilter && lokiStream) {
      lokiFilter.addEventListener('input', () => {
        const term = lokiFilter.value.toLowerCase();
        lokiStream.querySelectorAll('div').forEach((row) => {
          row.style.display = (!term || row.textContent.toLowerCase().includes(term)) ? 'block' : 'none';
        });
      });
    }

    // Topology Filter Search
    const topSearch = document.getElementById('topology-search-input');
    if (topSearch) {
      topSearch.addEventListener('input', () => {
        const q = topSearch.value.toLowerCase();
        const list = document.getElementById('cluster-topology-view');
        if (list) {
          list.querySelectorAll('.resource-chip').forEach((chip) => {
            chip.style.display = (!q || chip.textContent.toLowerCase().includes(q)) ? 'flex' : 'none';
          });
        }
      });
    }

    // Revalidate in tab button
    const revalBtn = document.getElementById('btn-revalidate-in-tab');
    if (revalBtn) {
      revalBtn.addEventListener('click', validateActiveLab);
    }

    // Architecture Diagram Modal Triggers
    const viewArchBtn = document.getElementById('btn-view-lab-arch');
    const closeArchBtn = document.getElementById('btn-close-lab-arch');
    const archModal = document.getElementById('lab-arch-modal');
    if (viewArchBtn) {
      viewArchBtn.addEventListener('click', openLabArchModal);
    }
    if (closeArchBtn) {
      closeArchBtn.addEventListener('click', closeLabArchModal);
    }
    if (archModal) {
      archModal.addEventListener('click', (e) => {
        if (e.target === archModal) closeLabArchModal();
      });
    }

    // Terminal Font Zoom Controls
    const zoomInBtn = document.getElementById('btn-zoom-term-in');
    const zoomOutBtn = document.getElementById('btn-zoom-term-out');
    let termFontSize = 13;
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (termFontSize < 20) {
          termFontSize += 1;
          const termEl = document.getElementById('terminal-output');
          if (termEl) termEl.style.fontSize = `${termFontSize}px`;
        }
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (termFontSize > 10) {
          termFontSize -= 1;
          const termEl = document.getElementById('terminal-output');
          if (termEl) termEl.style.fontSize = `${termFontSize}px`;
        }
      });
    }
  }

  async function init() {
    // Register offline Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    setupResizableWorkbench();
    setupMobileQuickKeybar();
    setupMobilePaneSwitcher();
    setupWorkbenchTabs();

    // Navigation tab switching
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
      });
    });

    // Load full overview
    state.overview = await apiCall('/api/overview');
    updateHeaderTelemetry();
    renderPathsAndDomains();
    populateLabSelector();
    renderIncidents();
    initArchitectureDesigner();
    renderCertificationsAndExams();

    // Load initial starter lab in workbench
    if (state.overview.activeLabId) {
      await startLab(state.overview.activeLabId);
      switchView('view-paths');
    }

    initTheme();

    // Initialize Authentic Inline Terminal Emulator
    const termOutput = document.getElementById('terminal-output');
    if (termOutput && typeof TerminalView !== 'undefined') {
      state.terminalView = new TerminalView(termOutput, {
        prompt: 'learner@kubelabs:~$ ',
        continuationPrompt: '> ',
        onExecute: async (cmd) => {
          const manifestEditor = document.getElementById('wb-manifest-editor');
          const manifestText = manifestEditor ? manifestEditor.value : '';
          return await apiCall('/api/terminal/exec', {
            method: 'POST',
            body: { command: cmd, manifestText }
          });
        },
        onClusterStateUpdate: (clusterState) => {
          renderClusterTopology(clusterState);
        },
        onTabComplete: (line, pos) => {
          return computeTabCompletion(line, pos);
        }
      });

      // Hide legacy detached input form in favor of authentic inline prompt
      const legacyForm = document.getElementById('terminal-form');
      if (legacyForm) {
        legacyForm.style.display = 'none';
      }
    }

    // Domain search input
    const searchInput = document.getElementById('domain-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderPathsAndDomains(searchInput.value));
    }

    // Terminal input keydown for Arrow history, Tab completion, Ctrl+L, Ctrl+Enter
    const termInput = document.getElementById('terminal-input');
    if (termInput) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (state.commandHistory.length === 0) return;
          if (state.historyIndex === -1) {
            state.historyIndex = state.commandHistory.length - 1;
          } else if (state.historyIndex > 0) {
            state.historyIndex--;
          }
          termInput.value = state.commandHistory[state.historyIndex] || '';
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (state.historyIndex !== -1) {
            if (state.historyIndex < state.commandHistory.length - 1) {
              state.historyIndex++;
              termInput.value = state.commandHistory[state.historyIndex];
            } else {
              state.historyIndex = -1;
              termInput.value = '';
            }
          }
        } else if (e.key === 'Tab') {
          e.preventDefault();
          handleTabCompletion(termInput);
        } else if (e.ctrlKey && e.key === 'l') {
          e.preventDefault();
          const out = document.getElementById('terminal-output');
          if (out) out.innerHTML = '';
        } else if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          validateActiveLab();
        }
      });
    }

    // Terminal form submission
    document.getElementById('terminal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('terminal-input');
      const cmd = input.value;
      input.value = '';
      executeTerminalCommand(cmd);
    });

    // Quick terminal command buttons
    document.querySelectorAll('.quick-cmd').forEach((btn) => {
      btn.addEventListener('click', () => executeTerminalCommand(btn.dataset.cmd));
    });

    document.getElementById('btn-clear-terminal').addEventListener('click', () => {
      if (state.terminalView) {
        state.terminalView.clear();
      } else {
        const out = document.getElementById('terminal-output');
        if (out) out.innerHTML = '';
      }
    });

    // Lab buttons
    document.getElementById('btn-reset-lab').addEventListener('click', () => {
      if (state.activeLab) startLab(state.activeLab.id);
    });
    document.getElementById('btn-validate-lab').addEventListener('click', validateActiveLab);
    document.getElementById('btn-solve-lab').addEventListener('click', solveActiveLab);

    // Apply YAML Manifest button
    document.getElementById('btn-apply-manifest').addEventListener('click', async () => {
      const yaml = document.getElementById('wb-manifest-editor').value;
      const res = await apiCall('/api/cluster/apply', {
        method: 'POST',
        body: { manifest: yaml }
      });
      appendTerminalLine('kubectl apply -f manifest.yaml', true);
      appendTerminalLine(
        (res.applied || []).map((a) => `${a.kind.toLowerCase()}/${a.name} ${a.action}`).join('\n'),
        false
      );
      renderClusterTopology(res.clusterState);
    });

    // Mentor mode buttons
    document.querySelectorAll('.mentor-mode-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reply = await apiCall('/api/mentor/ask', {
          method: 'POST',
          body: {
            mode: btn.dataset.mode,
            labId: state.activeLab ? state.activeLab.id : null,
            incidentId: state.activeIncident ? state.activeIncident.id : null
          }
        });
        document.getElementById('mentor-response-box').textContent = reply.response;
      });
    });

    // Incident actions
    document.getElementById('btn-inc-open-workbench').addEventListener('click', () => {
      switchView('view-workbench');
    });
    document.getElementById('btn-inc-verify').addEventListener('click', async () => {
      if (!state.activeIncident) return;
      const res = await apiCall(`/api/incidents/${state.activeIncident.id}/verify`, { method: 'POST' });
      const outEl = document.getElementById('inc-verification-output');
      outEl.innerHTML = `
        <div class="validation-item ${res.passed ? 'pass' : 'fail'}" style="margin-top:0.5rem;">
          <strong>${res.passed ? 'INCIDENT RESOLVED!' : 'Outage Still Active'}</strong> (${res.passedCount}/${res.totalCount} recovery checks passing)
        </div>
      `;
      if (res.learner) {
        state.overview.learner = res.learner;
        updateHeaderTelemetry();
        renderIncidents();
      }
    });
    document.getElementById('btn-inc-solve').addEventListener('click', async () => {
      if (!state.activeIncident) return;
      const res = await apiCall(`/api/incidents/${state.activeIncident.id}/solve`, { method: 'POST' });
      renderClusterTopology(res.clusterState);
      const outEl = document.getElementById('inc-verification-output');
      outEl.innerHTML = `
        <div class="validation-item pass" style="margin-top:0.5rem;">
          <strong>INCIDENT REMEDIATED (100%):</strong> Executed <code>${(res.commandOutputs || []).map((c) => c.command).join(' && ')}</code>
        </div>
      `;
      if (res.learner) {
        state.overview.learner = res.learner;
        updateHeaderTelemetry();
        renderIncidents();
      }
    });

    // Architecture Designer actions
    document.getElementById('btn-arch-deploy').addEventListener('click', async () => {
      const res = await apiCall('/api/architectures/deploy', {
        method: 'POST',
        body: { nodes: state.activeArch.nodes, edges: state.activeArch.edges }
      });
      renderClusterTopology(res.clusterState);
      appendTerminalLine(`--- Deployed Visual Architecture "${state.activeArch.name}" to Virtual Cluster ---`);
      switchView('view-workbench');
    });
    document.getElementById('btn-arch-save').addEventListener('click', async () => {
      await apiCall('/api/architectures/save', {
        method: 'POST',
        body: {
          name: state.activeArch.name,
          nodes: state.activeArch.nodes,
          edges: state.activeArch.edges
        }
      });
    });

    // 11-Agent Audit button
    const auditBtn = document.getElementById('btn-run-agent-audit');
    if (auditBtn) auditBtn.addEventListener('click', runLiveAgentAudit);

    // Diagnostics Modal Triggers (Ctrl+Shift+D, Header badge, Footer link)
    const openDiagBtn = document.getElementById('btn-open-diagnostics');
    if (openDiagBtn) {
      openDiagBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDiagnosticsModal();
      });
    }

    const footerDiagLink = document.getElementById('footer-diagnostics-link');
    if (footerDiagLink) {
      footerDiagLink.addEventListener('click', (e) => {
        e.preventDefault();
        openDiagnosticsModal();
      });
    }

    const closeDiagBtn = document.getElementById('btn-close-diagnostics');
    if (closeDiagBtn) {
      closeDiagBtn.addEventListener('click', closeDiagnosticsModal);
    }

    const diagModal = document.getElementById('diagnostics-modal');
    if (diagModal) {
      diagModal.addEventListener('click', (e) => {
        if (e.target === diagModal) {
          closeDiagnosticsModal();
        }
      });
    }

    // Rail footer action buttons
    const railDiagBtn = document.getElementById('rail-btn-diagnostics');
    if (railDiagBtn) {
      railDiagBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDiagnosticsModal();
      });
    }

    const railThemeBtn = document.getElementById('rail-btn-theme');
    if (railThemeBtn) {
      railThemeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const nextTheme = state.currentTheme === 'dark' ? 'light' : state.currentTheme === 'light' ? 'high-contrast' : 'dark';
        setTheme(nextTheme);
      });
    }

    // Command Palette triggers & inputs (Ctrl+K)
    const btnOpenCmd = document.getElementById('btn-open-cmd-palette');
    if (btnOpenCmd) btnOpenCmd.addEventListener('click', openCommandPalette);

    const railBtnCmd = document.getElementById('rail-btn-cmd-k');
    if (railBtnCmd) railBtnCmd.addEventListener('click', openCommandPalette);

    const btnCloseCmd = document.getElementById('btn-close-cmd-palette');
    if (btnCloseCmd) btnCloseCmd.addEventListener('click', closeCommandPalette);

    const cmdModal = document.getElementById('command-palette-modal');
    if (cmdModal) {
      cmdModal.addEventListener('click', (e) => {
        if (e.target === cmdModal) closeCommandPalette();
      });
    }

    const cmdInput = document.getElementById('cmd-palette-input');
    if (cmdInput) {
      cmdInput.addEventListener('input', () => {
        cmdPaletteSelectedIndex = 0;
        renderCommandPaletteResults(cmdInput.value);
      });
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (cmdPaletteItems.length > 0) {
            cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex + 1) % cmdPaletteItems.length;
            updateCommandPaletteSelection();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (cmdPaletteItems.length > 0) {
            cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex - 1 + cmdPaletteItems.length) % cmdPaletteItems.length;
            updateCommandPaletteSelection();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          executeCommandPaletteItem(cmdPaletteSelectedIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCommandPalette();
        }
      });
    }

    // Ctrl+Shift+D keyboard shortcut, Ctrl+K command palette, & Escape handler
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const modal = document.getElementById('command-palette-modal');
        if (modal && modal.style.display !== 'none') {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        const modal = document.getElementById('diagnostics-modal');
        if (modal && modal.style.display !== 'none') {
          closeDiagnosticsModal();
        } else {
          openDiagnosticsModal();
        }
      }
      if (e.key === 'Escape') {
        const cmdM = document.getElementById('command-palette-modal');
        if (cmdM && cmdM.style.display !== 'none') {
          closeCommandPalette();
        }
        const modal = document.getElementById('diagnostics-modal');
        if (modal && modal.style.display !== 'none') {
          closeDiagnosticsModal();
        }
        const archModal = document.getElementById('lab-arch-modal');
        if (archModal && archModal.style.display !== 'none') {
          closeLabArchModal();
        }
      }
    });

    if (window.location.hash === '#admin-diagnostics' || window.location.pathname === '/admin/diagnostics') {
      openDiagnosticsModal();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

