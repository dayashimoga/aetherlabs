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

  function switchView(viewId) {
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === viewId);
    });
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    if (viewId === 'view-workbench' && state.activeLab) {
      const sel = document.getElementById('wb-lab-selector');
      if (sel && sel.value !== state.activeLab.id) {
        sel.value = state.activeLab.id;
      }
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
    document.getElementById('wb-manifest-editor').value = data.lab.starterManifest || '';

    const stepsContainer = document.getElementById('wb-steps-list');
    stepsContainer.innerHTML = (data.lab.steps || [])
      .map(
        (s) => `
        <div class="step-card">
          <div style="font-size:0.83rem; font-weight:700;">Step ${s.stepNumber}: ${s.title}</div>
          <div style="font-size:0.79rem; color:var(--text-secondary); margin-top:0.2rem;">${s.instruction}</div>
          <code class="step-cmd" data-cmd="${s.commandHint.replace(/"/g, '&quot;')}" title="Click to execute command in terminal">$ ${s.commandHint}</code>
        </div>
      `
      )
      .join('');

    stepsContainer.querySelectorAll('.step-cmd').forEach((codeEl) => {
      codeEl.addEventListener('click', () => executeTerminalCommand(codeEl.dataset.cmd));
    });

    renderPendingValidation(data.lab);
    renderClusterTopology(data.clusterState);
    appendTerminalLine(`--- Initialized Lab: ${data.lab.title} ---`);
    switchView('view-workbench');
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

  function initArchitectureDesigner() {
    const select = document.getElementById('arch-blueprint-select');
    if (!select || !state.overview) return;
    const refs = state.overview.referenceArchitectures || [];
    select.innerHTML = refs.map((r) => `<option value="${r.id}">${r.name} (${r.category})</option>`).join('');

    if (refs.length > 0) {
      loadReferenceBlueprint(refs[0].id);
    }

    select.onchange = () => loadReferenceBlueprint(select.value);

    document.querySelectorAll('.arch-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = `n-${Date.now().toString().slice(-4)}`;
        const newNode = {
          id,
          type: btn.dataset.type,
          label: btn.dataset.label,
          namespace: 'production',
          replicas: 2
        };
        if (state.activeArch.nodes.length > 0) {
          const prev = state.activeArch.nodes[state.activeArch.nodes.length - 1];
          state.activeArch.edges.push({ from: prev.id, to: id, protocol: 'TCP/mTLS' });
        }
        state.activeArch.nodes.push(newNode);
        refreshArchitectureAnalysis();
      });
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
    document.getElementById('arch-current-title').textContent = found.name;
    refreshArchitectureAnalysis();
  }

  async function refreshArchitectureAnalysis() {
    const canvas = document.getElementById('arch-nodes-canvas');
    if (canvas) {
      canvas.innerHTML = state.activeArch.nodes
        .map(
          (n) => `
          <div class="arch-node">
            <div style="font-size:0.7rem; text-transform:uppercase; color:var(--accent-blue); font-weight:700;">${n.type}</div>
            <div style="font-weight:700; margin:0.2rem 0;">${n.label}</div>
            <div style="font-size:0.74rem; color:var(--text-muted);">ns: ${n.namespace || 'production'} | replicas: ${n.replicas || 1}</div>
          </div>
        `
        )
        .join('');
    }

    const res = await apiCall('/api/architectures/analyze', {
      method: 'POST',
      body: { nodes: state.activeArch.nodes, edges: state.activeArch.edges }
    });

    document.getElementById('arch-yaml-out').value = res.kubernetesYaml || '';
    document.getElementById('arch-hcl-out').value = res.opentofuHcl || '';

    const a = res.analysis;
    document.getElementById('arch-score-badge').textContent =
      `Well-Architected Score: ${a.overallScore}/100 | Est. $${a.estimatedMonthlyCostUsd}/mo`;

    const findingsEl = document.getElementById('arch-review-findings');
    findingsEl.innerHTML = `
      <div><strong>Pillar Scores:</strong> Reliability ${a.pillars.reliability}% | Security ${a.pillars.security}% | Observability ${a.pillars.observability}% | Ops Excellence ${a.pillars.operationalExcellence}%</div>
      ${a.spofs.length > 0 ? `<div style="color:#fca5a5; margin-top:0.25rem;">${a.spofs.join(' | ')}</div>` : '<div style="color:var(--accent-green); margin-top:0.25rem;">Zero Single Points of Failure (SPOFs) detected.</div>'}
    `;
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
    const report = await apiCall('/api/agents/audit');
    const summaryEl = document.getElementById('agent-audit-summary');
    const gridEl = document.getElementById('agent-audit-grid');
    summaryEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
        <div>
          <span class="badge ${report.passed ? 'completed' : 'sev1'}">${report.passed ? 'ALL 11 AGENTS GREEN' : 'AUDIT WARNING'}</span>
          <strong style="margin-left:0.5rem;">${report.summary}</strong>
        </div>
        <span style="font-size:0.8rem; color:var(--text-muted);">Execution: ${report.durationMs}ms | Memory RSS: ${report.memoryRssMB} MB</span>
      </div>
    `;

    gridEl.innerHTML = (report.agents || [])
      .map(
        (a) => `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${a.role}</span>
            <span class="badge ${a.status === 'PASS' ? 'completed' : 'sev1'}">${a.status}</span>
          </div>
          <div>
            ${a.checks
              .map(
                (c) => `
                <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.3rem;">
                  <span class="status-dot ${c.passed ? 'healthy' : 'broken'}"></span>${c.name}
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      `
      )
      .join('');
  }

  function setupResizableWorkbench() {
    const layout = document.getElementById('workbench-layout');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');
    if (!layout || !resizerLeft || !resizerRight) return;

    // Restore saved widths from localStorage
    const savedLeft = localStorage.getItem('kubelabs_pane_left_width');
    const savedRight = localStorage.getItem('kubelabs_pane_right_width');
    if (savedLeft) layout.style.setProperty('--wb-left-width', `${savedLeft}px`);
    if (savedRight) layout.style.setProperty('--wb-right-width', `${savedRight}px`);

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
            localStorage.setItem('kubelabs_pane_left_width', newWidth);
          } else {
            const newWidth = Math.max(240, Math.min(650, rect.right - currentX));
            layout.style.setProperty('--wb-right-width', `${newWidth}px`);
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
              const res = ContextAwareQuickKeyEngine.insertToken(
                state.terminalView.lineBuffer,
                state.terminalView.cursorPos,
                toInsert
              );
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
            const start = termInput.selectionStart || termInput.value.length;
            const res = ContextAwareQuickKeyEngine.insertToken(
              termInput.value,
              start,
              toInsert
            );
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

  async function init() {
    // Register offline Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    setupResizableWorkbench();
    setupMobileQuickKeybar();
    setupMobilePaneSwitcher();

    // Navigation tab switching
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        if (btn.dataset.view === 'view-governance') {
          runLiveAgentAudit();
        }
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
    document.getElementById('btn-run-agent-audit').addEventListener('click', runLiveAgentAudit);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

