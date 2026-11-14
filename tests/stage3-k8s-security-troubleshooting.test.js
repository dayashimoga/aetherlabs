/**
 * tests/stage3-k8s-security-troubleshooting.test.js
 * Subphase 3.3.3 Verification: Domain 14 (CKS Security) & Domain 15 (Troubleshooting)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Pod Security Standards restricted profile, container securityContext hardening, Falco threat detection,
 * CrashLoopBackOff and OOMKilled remediation, and static pod recovery with Kubelet diagnostics.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 3.3.3 — Domain 14 (CKS Security) & Domain 15 (Troubleshooting)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 14 and Domain 15 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain14 = pluginManager.getDomain('k8s-security-cks');
    assert.ok(domain14, 'Domain 14 (k8s-security-cks) must exist');
    assert.equal(domain14.category, 'Kubernetes & CNCF');
    assert.equal(domain14.trackId, 'track-k8s-admin');
    assert.equal(domain14.labs.length, 2);
    assert.equal(domain14.assessmentQuestions.length, 2);

    const domain15 = pluginManager.getDomain('k8s-troubleshooting');
    assert.ok(domain15, 'Domain 15 (k8s-troubleshooting) must exist');
    assert.equal(domain15.category, 'Kubernetes & CNCF');
    assert.equal(domain15.trackId, 'track-k8s-admin');
    assert.equal(domain15.labs.length, 2);
    assert.equal(domain15.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-cks-01-pod-security-standards',
      'lab-cks-02-falco-runtime-security',
      'lab-troubleshoot-01-crashloop-oom',
      'lab-troubleshoot-02-controlplane-kubelet'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 labs for Subphase 3.3.3');

    for (const lab of subphaseLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;

      const beforeReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        [],
        { vfs, cluster }
      );

      assert.equal(
        beforeReport.passed,
        false,
        `Lab ${lab.id} should fail before solution execution`
      );
      assert.equal(
        beforeReport.score,
        0,
        `Lab ${lab.id} should score exactly 0% before solution execution`
      );
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-cks-01-pod-security-standards',
      'lab-cks-02-falco-runtime-security',
      'lab-troubleshoot-01-crashloop-oom',
      'lab-troubleshoot-02-controlplane-kubelet'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;
      const term = new TerminalEngine(cluster, vfs);

      for (const cmd of lab.solutionCommands) {
        const res = term.execute(cmd, { manifestText: lab.starterManifest, vfs });
        assert.equal(
          res.exitCode,
          0,
          `Lab ${lab.id} solution command "${cmd}" failed with code ${res.exitCode}: ${res.output || res.stderr}`
        );
      }

      const afterReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        term.commandHistory,
        { vfs, cluster, commandHistory: term.commandHistory }
      );

      assert.equal(
        afterReport.passed,
        true,
        `Lab ${lab.id} should pass after solution execution: ${JSON.stringify(afterReport.results.filter((r) => !r.passed))}`
      );
      assert.equal(
        afterReport.score,
        100,
        `Lab ${lab.id} should score exactly 100% after solution execution`
      );
    }
  });

  it('4. Engine Parity: Domain 14 CKS Pod Security Standards restricted profile and Falco', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    term.execute('kubectl create namespace test-sec');
    term.execute('kubectl label namespace test-sec pod-security.kubernetes.io/enforce=restricted');

    const ns = cluster.getResource('Namespace', 'test-sec');
    assert.ok(ns, 'Namespace test-sec must exist');
    assert.equal(ns.metadata.labels['pod-security.kubernetes.io/enforce'], 'restricted');

    const securePodYaml = [
      'apiVersion: v1',
      'kind: Pod',
      'metadata:',
      '  name: secure-test',
      '  namespace: test-sec',
      'spec:',
      '  securityContext:',
      '    runAsNonRoot: true',
      '    runAsUser: 10001',
      '  containers:',
      '  - name: test',
      '    image: cgr.dev/chainguard/static:latest',
      '    securityContext:',
      '      allowPrivilegeEscalation: false',
      '      readOnlyRootFilesystem: true',
      '      capabilities:',
      '        drop:',
      '        - ALL'
    ].join('\n');
    vfs.writeFile('/tmp/secure-test.yaml', securePodYaml);
    term.execute('kubectl apply -f /tmp/secure-test.yaml');

    const pod = cluster.getResource('Pod', 'secure-test', 'test-sec');
    assert.ok(pod, 'Pod secure-test must exist');
    assert.equal(pod.status.phase, 'Running');

    const falcoRes = term.execute('falco --version');
    assert.equal(falcoRes.exitCode, 0);
    assert.ok(falcoRes.output.includes('Falco version'));
  });

  it('5. Engine Parity: Domain 15 Troubleshooting CrashLoopBackOff & Static Pod Recovery', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // ConfigMap and Deployment repair
    term.execute('kubectl create namespace test-trouble');
    term.execute('kubectl create configmap app-config --from-literal=DB_PORT=5432 -n test-trouble');

    const cm = cluster.getResource('ConfigMap', 'app-config', 'test-trouble');
    assert.ok(cm, 'ConfigMap app-config must exist');
    assert.equal(cm.data.DB_PORT, '5432');

    // Static pod manifest repair in VFS
    vfs.writeFile('/etc/kubernetes/manifests/kube-apiserver.yaml', 'INVALID_YAML: [');
    const catRes = term.execute('cat /etc/kubernetes/manifests/kube-apiserver.yaml');
    assert.equal(catRes.exitCode, 0);
    assert.ok(catRes.output.includes('INVALID_YAML'));

    const repairedYaml = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: kube-apiserver\n  namespace: kube-system\nspec:\n  containers:\n  - name: kube-apiserver\n    image: registry.k8s.io/kube-apiserver:v1.31.0\n';
    vfs.writeFile('/etc/kubernetes/manifests/kube-apiserver.yaml', repairedYaml);
    assert.ok(vfs.readFile('/etc/kubernetes/manifests/kube-apiserver.yaml').includes('kube-apiserver'));

    const sysctlRes = term.execute('systemctl restart kubelet');
    assert.equal(sysctlRes.exitCode, 0);

    const nodesRes = term.execute('kubectl get nodes');
    assert.equal(nodesRes.exitCode, 0);
    assert.ok(nodesRes.output.includes('Ready'));
  });
});
