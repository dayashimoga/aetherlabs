'use strict';

(function () {
  const state = {
    overview: null,
    activeLab: null,
    activeIncident: null,
    activeArch: {
      name: 'Multi-AZ Amazon EKS GitOps Production Platform',
      nodes: [],
      edges: []
    },
    activeExam: null
  };

  async function apiCall(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    }
    return data;
  }

  function switchView(viewId) {
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === viewId);
    });
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });
  }

  function appendTerminalLine(text, isCommand = false) {
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
    const totalLabs = (state.overview.labs || []).length;

    const xpEl = document.getElementById('header-xp');
    const labsEl = document.getElementById('header-labs-completed');
    if (xpEl) xpEl.textContent = `${profile.xp || 0} XP`;
    if (labsEl) labsEl.textContent = `${completedLabs.length}/${totalLabs} Labs Completed`;
  }

  function renderClusterTopology(clusterState) {
    const container = document.getElementById('cluster-topology-view');
    const countBadge = document.getElementById('cluster-resource-count');
    if (!container || !clusterState) return;

    const resources = clusterState.resources || [];
    if (countBadge) countBadge.textContent = `${resources.length} Objects`;

    container.innerHTML = resources
      .filter((r) => r.kind !== 'Namespace')
      .map((r) => {
        const ns = r.metadata.namespace ? `${r.metadata.namespace}/` : '';
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
              <strong>${r.kind}</strong>: ${ns}${r.metadata.name}
            </div>
            <span class="badge ${isBroken ? 'sev1' : ''}">${statusText}</span>
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
              <span class="card-title">${t.title}</span>
              <span class="badge">${t.labsCount} Labs | ${t.totalHours}h</span>
            </div>
            <p style="font-size:0.82rem; color:var(--text-secondary);">${t.summary}</p>
            <div style="font-size:0.76rem; color:var(--accent-blue); margin-top:auto;">
              Certification: ${t.certificationTitle}
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
          return `
            <div class="card">
              <div class="card-header">
                <span class="card-title">${proj.title}</span>
                ${isDone ? '<span class="badge completed">Completed</span>' : `<span class="badge">+${proj.xpReward} XP</span>`}
              </div>
              <p style="font-size:0.8rem; color:var(--text-secondary);">${proj.summary}</p>
              <div style="font-size:0.76rem; color:var(--text-muted);">
                ${(proj.milestones || []).map((m) => `<div>• M${m.milestoneNumber}: ${m.title}</div>`).join('')}
              </div>
              <div style="margin-top:auto; padding-top:0.4rem;">
                <button class="btn btn-success solve-project-btn" data-proj-id="${proj.id}" type="button" style="width:100%;">Build &amp; Validate Capstone Project</button>
              </div>
            </div>
          `;
        })
        .join('');

      projectsContainer.querySelectorAll('.solve-project-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const res = await apiCall(`/api/projects/${btn.dataset.projId}/solve`, { method: 'POST' });
          for (const item of res.commandOutputs || []) {
            appendTerminalLine(item.command, true);
            appendTerminalLine(item.output, false);
          }
          renderClusterTopology(res.clusterState);
          renderValidationReport(res);
          if (res.learner) {
            state.overview.learner = res.learner;
            updateHeaderTelemetry();
            renderPathsAndDomains();
          }
          switchView('view-workbench');
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

    const validationContainer = document.getElementById('wb-validation-results');
    validationContainer.innerHTML = (data.lab.validationRules || [])
      .map(
        (r) => `
        <div class="validation-item">
          <strong>[Pending Verification]</strong> ${r.description}
        </div>
      `
      )
      .join('');

    renderClusterTopology(data.clusterState);
    appendTerminalLine(`--- Initialized Lab: ${data.lab.title} ---`);
    switchView('view-workbench');
  }

  async function executeTerminalCommand(cmd) {
    if (!cmd || !cmd.trim()) return;
    appendTerminalLine(cmd, true);
    const manifestText = document.getElementById('wb-manifest-editor').value;
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
            <div><strong>${r.passed ? 'PASS' : 'FAIL'}:</strong> ${r.description}</div>
            <div style="font-size:0.74rem; color:var(--text-muted); margin-top:0.2rem;">Observed: ${r.actual} | Expected: ${r.expected}</div>
            ${!r.passed && r.remediation ? `<div style="font-size:0.74rem; color:#fca5a5; margin-top:0.2rem;">Fix: ${r.remediation}</div>` : ''}
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

  async function init() {
    // Register offline Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

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

    // Domain search input
    const searchInput = document.getElementById('domain-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderPathsAndDomains(searchInput.value));
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
      document.getElementById('terminal-output').innerHTML = '';
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

