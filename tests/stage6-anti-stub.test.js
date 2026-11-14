'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ProjectEngine } = require('../src/core/projectEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');

const FORBIDDEN_STUB_PATTERNS = [
  /TODO:/i,
  /FIXME:/i,
  /PLACEHOLDER_IMPLEMENTATION/i,
  /COMING_SOON_STUB/i,
  /\bnot implemented\b/i,
  /\bunimplemented\b/i,
  /\[mock\]/i,
  /\[stub\]/i,
  /\[object Object\]/,
  /\bundefined\b/,
  /\bNaN\b/
];

function assertNoStubs(output, contextMsg = '') {
  const str = String(output || '');
  for (const pat of FORBIDDEN_STUB_PATTERNS) {
    assert.equal(
      pat.test(str),
      false,
      `Forbidden stub marker ${pat} found in output: ${str.slice(0, 120)} (${contextMsg})`
    );
  }
}

test('Subphase 6.1.3 — Anti-Stub Terminal Output Audit', async (t) => {
  const rootDir = path.join(__dirname, '..');
  const curriculumDir = path.join(rootDir, 'src', 'curriculum', 'domains');
  const pluginsDir = path.join(rootDir, 'plugins');

  await t.test('1. Static Anti-Stub Audit: Source Files & Curriculum Datasets Contain Zero Forbidden Markers', () => {
    const filesToScan = [];

    // Scan src/core and src/engine
    const scanDirs = [
      path.join(rootDir, 'src', 'core'),
      path.join(rootDir, 'src', 'engine'),
      path.join(rootDir, 'src', 'curriculum', 'domains')
    ];

    for (const d of scanDirs) {
      if (fs.existsSync(d)) {
        const entries = fs.readdirSync(d);
        for (const e of entries) {
          if (e.endsWith('.js') || e.endsWith('.json')) {
            filesToScan.push(path.join(d, e));
          }
        }
      }
    }

    const staticForbidden = ['TODO:', 'FIXME:', 'PLACEHOLDER_IMPLEMENTATION', 'COMING_SOON_STUB'];
    const violations = [];

    for (const file of filesToScan) {
      const content = fs.readFileSync(file, 'utf8');
      for (const marker of staticForbidden) {
        if (content.includes(marker)) {
          violations.push({ file: path.basename(file), marker });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Detected ${violations.length} forbidden stub markers in source code: ${JSON.stringify(violations)}`
    );

    // Verify all 45 domain JSON files have complete structure
    const domainFiles = fs.readdirSync(curriculumDir).filter((f) => f.endsWith('.json'));
    assert.equal(domainFiles.length, 45, 'Must contain exactly 45 curriculum domain files');

    for (const file of domainFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(curriculumDir, file), 'utf8'));
      assert.ok(data.id, `Domain file ${file} must have an id`);
      assert.ok(data.title, `Domain file ${file} must have a title`);
      assert.ok(Array.isArray(data.labs) && data.labs.length >= 2, `Domain ${data.id} must have at least 2 labs`);
      for (const lab of data.labs) {
        assert.ok(lab.id, `Lab in ${data.id} must have an id`);
        assert.ok(lab.title, `Lab ${lab.id} must have a title`);
        assert.ok(Array.isArray(lab.solutionCommands) && lab.solutionCommands.length > 0, `Lab ${lab.id} must have solutionCommands`);
      }
    }
  });

  await t.test('2. Authentic Multi-CLI Diagnostic Output Audit: 57 Core Cloud-Native & Linux CLI Commands', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine(cluster, { vfs });

    // Initialize git repository in working directory
    const gitInitRes = terminal.execute('git init');
    assert.equal(gitInitRes.exitCode, 0);

    const cliDiagnosticCommands = [
      // Kubernetes CLI
      { cli: 'kubectl', cmd: 'kubectl get nodes -o wide', minLines: 2 },
      { cli: 'kubectl', cmd: 'kubectl get pods -A', minLines: 2 },
      { cli: 'kubectl', cmd: 'kubectl cluster-info', minLines: 2 },
      { cli: 'kubectl', cmd: 'kubectl version', minLines: 2 },
      { cli: 'kubectl', cmd: 'kubectl api-resources', minLines: 5 },
      { cli: 'kubectl', cmd: 'kubectl explain pod.spec', minLines: 3 },
      { cli: 'kubectl', cmd: 'kubectl auth can-i create pods', minLines: 1 },

      // Package & GitOps CLIs
      { cli: 'helm', cmd: 'helm version', minLines: 1 },
      { cli: 'helm', cmd: 'helm list -A', minLines: 1 },
      { cli: 'kustomize', cmd: 'kustomize version', minLines: 1 },
      { cli: 'git', cmd: 'git status', minLines: 3 },
      { cli: 'git', cmd: 'git branch', minLines: 1 },
      { cli: 'argocd', cmd: 'argocd version', minLines: 2 },
      { cli: 'argocd', cmd: 'argocd app list', minLines: 1 },
      { cli: 'flux', cmd: 'flux check', minLines: 4 },

      // Container Runtimes
      { cli: 'docker', cmd: 'docker version', minLines: 1 },
      { cli: 'docker', cmd: 'docker ps', minLines: 2 },
      { cli: 'docker', cmd: 'docker images', minLines: 2 },
      { cli: 'crictl', cmd: 'crictl version', minLines: 1 },
      { cli: 'crictl', cmd: 'crictl pods', minLines: 2 },
      { cli: 'crictl', cmd: 'crictl ps', minLines: 2 },

      // Service Mesh
      { cli: 'istioctl', cmd: 'istioctl version', minLines: 2 },
      { cli: 'istioctl', cmd: 'istioctl proxy-status', minLines: 2 },
      { cli: 'linkerd', cmd: 'linkerd check', minLines: 5 },

      // IaC & Cloud Providers
      { cli: 'tofu', cmd: 'tofu version', minLines: 2 },
      { cli: 'tofu', cmd: 'tofu plan', minLines: 5 },
      { cli: 'terraform', cmd: 'terraform version', minLines: 2 },
      { cli: 'aws', cmd: 'aws sts get-caller-identity', minLines: 3 },
      { cli: 'az', cmd: 'az version', minLines: 1 },
      { cli: 'gcloud', cmd: 'gcloud version', minLines: 1 },

      // Security & Compliance
      { cli: 'trivy', cmd: 'trivy version', minLines: 1 },
      { cli: 'falco', cmd: 'falco --version', minLines: 2 },
      { cli: 'cosign', cmd: 'cosign version', minLines: 1 },

      // AI-Ops, etcd & Reliability
      { cli: 'k8sgpt', cmd: 'k8sgpt analyze', minLines: 2 },
      { cli: 'aiops', cmd: 'aiops analyze', minLines: 2 },
      { cli: 'etcdctl', cmd: 'etcdctl endpoint health', minLines: 1 },
      { cli: 'kubeadm', cmd: 'kubeadm version', minLines: 1 },
      { cli: 'cilium', cmd: 'cilium status', minLines: 3 },
      { cli: 'velero', cmd: 'velero version', minLines: 1 },
      { cli: 'vcluster', cmd: 'vcluster --version', minLines: 1 },

      // Observability & Telemetry
      { cli: 'promtool', cmd: 'promtool --version', minLines: 1 },
      { cli: 'otelcol', cmd: 'otelcol --version', minLines: 1 },

      // Linux & Networking Diagnostics
      { cli: 'curl', cmd: 'curl -I http://localhost', minLines: 3 },
      { cli: 'dig', cmd: 'dig localhost', minLines: 4 },
      { cli: 'nslookup', cmd: 'nslookup kubernetes.default', minLines: 3 },
      { cli: 'ip', cmd: 'ip addr', minLines: 5 },
      { cli: 'ip', cmd: 'ip route', minLines: 2 },
      { cli: 'iptables', cmd: 'iptables -L', minLines: 5 },
      { cli: 'ss', cmd: 'ss -tulpn', minLines: 3 },
      { cli: 'ping', cmd: 'ping -c 1 127.0.0.1', minLines: 3 },
      { cli: 'ps', cmd: 'ps aux', minLines: 3 },
      { cli: 'systemctl', cmd: 'systemctl status kubelet', minLines: 5 },
      { cli: 'journalctl', cmd: 'journalctl -u kubelet -n 5', minLines: 3 },
      { cli: 'sysctl', cmd: 'sysctl net.ipv4.ip_forward', minLines: 1 },
      { cli: 'df', cmd: 'df -h', minLines: 3 },
      { cli: 'free', cmd: 'free -m', minLines: 3 },
      { cli: 'uname', cmd: 'uname -a', minLines: 1 }
    ];

    for (const item of cliDiagnosticCommands) {
      const res = terminal.execute(item.cmd);
      const code = res.exitCode !== undefined ? res.exitCode : res.code;
      assert.equal(code, 0, `Command "${item.cmd}" must succeed with exit code 0`);
      assert.ok(res.output && res.output.trim().length > 0, `Command "${item.cmd}" must produce output`);
      const lineCount = res.output.trim().split('\n').length;
      assert.ok(
        lineCount >= item.minLines,
        `Command "${item.cmd}" produced ${lineCount} lines, expected >= ${item.minLines}`
      );
      assertNoStubs(res.output, `Command "${item.cmd}"`);
    }
  });

  await t.test('3. Anti-Stub Audit of Canonical Solution Commands: All 90 Labs across Domains 01–45', () => {
    const domainFiles = fs.readdirSync(curriculumDir).filter((f) => f.endsWith('.json'));
    let totalCommandsAudited = 0;

    for (const file of domainFiles) {
      const domain = JSON.parse(fs.readFileSync(path.join(curriculumDir, file), 'utf8'));
      for (const lab of domain.labs) {
        const cluster = new VirtualCluster();
        const vfs = new VirtualFileSystem();
        const terminal = new TerminalEngine(cluster, { vfs });

        for (const cmd of lab.solutionCommands) {
          totalCommandsAudited++;
          const res = terminal.execute(cmd);
          assertNoStubs(res.output, `Domain ${domain.id} / Lab ${lab.id} -> ${cmd}`);
          assert.notEqual(
            res.exitCode,
            127,
            `Command "${cmd}" in lab ${lab.id} exited with 127 (command not found)`
          );
        }
      }
    }

    assert.ok(totalCommandsAudited >= 180, `Must audit at least 180 solution commands across 90 labs (audited ${totalCommandsAudited})`);
  });

  await t.test('4. Anti-Stub Audit of Legacy Plugins Solution Commands: All 52 Labs across 26 Plugins', () => {
    const pluginFiles = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.json'));
    assert.equal(pluginFiles.length, 26, 'Must contain exactly 26 legacy plugin files');
    let totalLegacyCommandsAudited = 0;

    for (const file of pluginFiles) {
      const plugin = JSON.parse(fs.readFileSync(path.join(pluginsDir, file), 'utf8'));
      for (const lab of plugin.labs) {
        const cluster = new VirtualCluster();
        const vfs = new VirtualFileSystem();
        const terminal = new TerminalEngine(cluster, { vfs });

        for (const cmd of lab.solutionCommands) {
          totalLegacyCommandsAudited++;
          const res = terminal.execute(cmd);
          assertNoStubs(res.output, `Plugin ${plugin.id} / Lab ${lab.id} -> ${cmd}`);
          assert.notEqual(
            res.exitCode,
            127,
            `Command "${cmd}" in legacy lab ${lab.id} exited with 127 (command not found)`
          );
        }
      }
    }

    assert.ok(totalLegacyCommandsAudited >= 90, `Must audit at least 90 legacy commands (audited ${totalLegacyCommandsAudited})`);
  });

  await t.test('5. Anti-Stub Audit of Chaos Incident Remediation Commands: All 25 War Room Incidents', () => {
    const incidentEngine = new IncidentEngine();
    const warRoomScenarios = incidentEngine.getWarRoomScenarios();
    assert.equal(warRoomScenarios.length, 25, 'Must audit all 25 Chaos War Room incidents');
    let incidentCommandsAudited = 0;

    for (const inc of warRoomScenarios) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      incidentEngine.injectIncident(inc.id, cluster, vfs);
      const terminal = new TerminalEngine(cluster, { vfs });

      for (const cmd of inc.solutionCommands) {
        incidentCommandsAudited++;
        const res = terminal.execute(cmd);
        assertNoStubs(res.output, `Incident ${inc.id} -> ${cmd}`);
        assert.notEqual(
          res.exitCode,
          127,
          `Remediation command "${cmd}" in incident ${inc.id} exited with 127`
        );
      }
    }

    assert.ok(incidentCommandsAudited >= 25, `Must audit incident commands (audited ${incidentCommandsAudited})`);
  });

  await t.test('6. Anti-Stub Audit of Capstones & Performance Exam Solutions: 8 Capstones & 6 Performance Certs', () => {
    const projectEngine = new ProjectEngine();
    const projects = projectEngine.listProjects();
    assert.equal(projects.length, 8, 'Must audit all 8 Capstone projects');
    let capstoneCommandsAudited = 0;

    for (const proj of projects) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine(cluster, { vfs });

      for (const cmd of proj.solutionCommands || []) {
        capstoneCommandsAudited++;
        const res = terminal.execute(cmd);
        assertNoStubs(res.output, `Capstone ${proj.id} -> ${cmd}`);
        assert.notEqual(
          res.exitCode,
          127,
          `Capstone command "${cmd}" exited with 127`
        );
      }
    }

    const pluginManager = new PluginManager(pluginsDir, path.join(rootDir, 'schemas', 'plugin.schema.json'));
    const certEngine = new CertificationEngine(pluginManager);
    const exams = certEngine.listPerformanceExams();
    assert.equal(exams.length, 6, 'Must audit all 6 Performance Exams');
    let examCommandsAudited = 0;

    for (const examInfo of exams) {
      const fullExam = certEngine.getPerformanceExam(examInfo.id);
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      certEngine.startPerformanceExam(examInfo.id, cluster, vfs);
      const terminal = new TerminalEngine(cluster, { vfs });

      for (const t of fullExam.tasks) {
        for (const cmd of t.solutionCommands) {
          examCommandsAudited++;
          const res = terminal.execute(cmd);
          assertNoStubs(res.output, `Exam ${examInfo.id} / Task ${t.id} -> ${cmd}`);
          assert.notEqual(
            res.exitCode,
            127,
            `Exam command "${cmd}" exited with 127`
          );
        }
      }
    }

    assert.ok(capstoneCommandsAudited >= 26, `Must audit capstone commands (audited ${capstoneCommandsAudited})`);
    assert.ok(examCommandsAudited >= 26, `Must audit exam commands (audited ${examCommandsAudited})`);
  });
});
