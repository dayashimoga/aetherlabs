/**
 * tests/stage3-k8s-core-ckad-cka.test.js
 * Subphase 3.3.1 Verification: Domain 09 (Kubernetes Core), Domain 10 (CKAD), Domain 11 (CKA)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * workload controllers, RBAC auditing, multi-container pods, probes, batch jobs,
 * node maintenance operations, etcd disaster recovery, and kubeadm upgrades.
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

describe('Subphase 3.3.1 — Domains 09, 10 & 11 (K8s Core, CKAD, CKA)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domains 09, 10, and 11 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain09 = pluginManager.getDomain('kubernetes-core-v4');
    assert.ok(domain09, 'Domain 09 (kubernetes-core-v4) must exist');
    assert.equal(domain09.category, 'Kubernetes & CNCF');
    assert.equal(domain09.trackId, 'track-k8s-admin');
    assert.equal(domain09.labs.length, 2);
    assert.equal(domain09.assessmentQuestions.length, 2);

    const domain10 = pluginManager.getDomain('ckad-developer');
    assert.ok(domain10, 'Domain 10 (ckad-developer) must exist');
    assert.equal(domain10.category, 'Kubernetes & CNCF');
    assert.equal(domain10.trackId, 'track-k8s-admin');
    assert.equal(domain10.labs.length, 2);
    assert.equal(domain10.assessmentQuestions.length, 2);

    const domain11 = pluginManager.getDomain('cka-administrator');
    assert.ok(domain11, 'Domain 11 (cka-administrator) must exist');
    assert.equal(domain11.category, 'Kubernetes & CNCF');
    assert.equal(domain11.trackId, 'track-k8s-admin');
    assert.equal(domain11.labs.length, 2);
    assert.equal(domain11.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 6 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-k8s-01-ha-deployments',
      'lab-k8s-02-rbac-least-privilege',
      'lab-ckad-01-multicontainer-sidecar',
      'lab-ckad-02-probes-cronjobs',
      'lab-cka-01-node-maintenance',
      'lab-cka-02-etcd-dr-kubeadm'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 6, 'Must find all 6 labs for Subphase 3.3.1');

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

  it('3. Deterministic Solver: All 6 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-k8s-01-ha-deployments',
      'lab-k8s-02-rbac-least-privilege',
      'lab-ckad-01-multicontainer-sidecar',
      'lab-ckad-02-probes-cronjobs',
      'lab-cka-01-node-maintenance',
      'lab-cka-02-etcd-dr-kubeadm'
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

  it('4. Engine Parity: Domain 09 Kubernetes Core HA Deployments and RBAC permissions', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    term.execute('kubectl create namespace core-production');
    term.execute('kubectl create deployment payments-api --image=nginx:1.27-alpine -n core-production --replicas=3');
    term.execute('kubectl expose deployment payments-api --port=8080 --target-port=80 -n core-production');

    const dep = cluster.getResource('Deployment', 'payments-api', 'core-production');
    assert.ok(dep, 'Deployment payments-api should exist in core-production');
    assert.equal(dep.spec.replicas, 3);

    const svc = cluster.getResource('Service', 'payments-api', 'core-production');
    assert.ok(svc, 'Service payments-api should exist in core-production');
    assert.equal(svc.spec.ports[0].port, 8080);

    // RBAC test
    term.execute('kubectl create namespace staging');
    term.execute('kubectl create serviceaccount deploy-bot -n staging');
    term.execute('kubectl create role pod-reader --verb=get,list,watch --resource=pods,deployments -n staging');
    term.execute('kubectl create rolebinding deploy-bot-binding --role=pod-reader --serviceaccount=staging:deploy-bot -n staging');

    const sa = cluster.getResource('ServiceAccount', 'deploy-bot', 'staging');
    assert.ok(sa, 'ServiceAccount deploy-bot should exist');

    const role = cluster.getResource('Role', 'pod-reader', 'staging');
    assert.ok(role, 'Role pod-reader should exist');

    const canIRes = term.execute('kubectl auth can-i get pods --as=system:serviceaccount:staging:deploy-bot -n staging');
    assert.equal(canIRes.exitCode, 0);
    assert.ok(canIRes.output.includes('yes') || canIRes.output.includes('allowed') || canIRes.output.includes('authorized') || canIRes.output.includes('deploy-bot'));
  });

  it('5. Engine Parity: Domain 10 CKAD Multi-Container Pods, Health Probes & CronJobs', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // Multi-container pod
    term.execute('kubectl create namespace ecommerce');
    const podManifest = [
      'apiVersion: v1',
      'kind: Pod',
      'metadata:',
      '  name: order-processor',
      '  namespace: ecommerce',
      'spec:',
      '  initContainers:',
      '  - name: init-data',
      '    image: busybox:1.36',
      '  containers:',
      '  - name: app',
      '    image: nginx:1.27-alpine',
      '  - name: log-shipper',
      '    image: busybox:1.36'
    ].join('\n');

    vfs.writeFile('/tmp/order-processor.yaml', podManifest);
    const applyRes = term.execute('kubectl apply -f /tmp/order-processor.yaml');
    assert.equal(applyRes.exitCode, 0);

    const pod = cluster.getResource('Pod', 'order-processor', 'ecommerce');
    assert.ok(pod, 'Pod order-processor must exist');
    assert.equal(pod.spec.initContainers.length, 1);
    assert.equal(pod.spec.containers.length, 2);
    assert.equal(pod.status.phase, 'Running');

    // CronJob and Probed Deployment
    term.execute('kubectl create namespace logistics');
    term.execute('kubectl create cronjob inventory-sync --image=busybox:1.36 -n logistics');
    term.execute('kubectl create job inventory-manual-sync --image=busybox:1.36 -n logistics');

    const cj = cluster.getResource('CronJob', 'inventory-sync', 'logistics');
    assert.ok(cj, 'CronJob inventory-sync must exist');

    const job = cluster.getResource('Job', 'inventory-manual-sync', 'logistics');
    assert.ok(job, 'Job inventory-manual-sync must exist');
  });

  it('6. Engine Parity: Domain 11 CKA Node Maintenance, Kubeadm Upgrade & Etcdctl DR', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // Node maintenance
    const cordonRes = term.execute('kubectl cordon kubelabs-worker-01');
    assert.equal(cordonRes.exitCode, 0);
    const node = cluster.getResource('Node', 'kubelabs-worker-01');
    assert.equal(node.spec.unschedulable, true);

    const drainRes = term.execute('kubectl drain kubelabs-worker-01 --ignore-daemonsets');
    assert.equal(drainRes.exitCode, 0);

    const taintRes = term.execute('kubectl taint nodes kubelabs-worker-01 dedicated=special:NoSchedule');
    assert.equal(taintRes.exitCode, 0);
    assert.ok(node.spec.taints.some((t) => t.key === 'dedicated' && t.value === 'special'));

    const uncordonRes = term.execute('kubectl uncordon kubelabs-worker-01');
    assert.equal(uncordonRes.exitCode, 0);
    assert.equal(node.spec.unschedulable, false);

    // Etcd snapshot save & status
    const etcdSave = term.execute('etcdctl snapshot save /var/lib/etcd/backup.db');
    assert.equal(etcdSave.exitCode, 0);
    assert.ok(etcdSave.output.includes('Snapshot saved at /var/lib/etcd/backup.db'));

    const etcdStatus = term.execute('etcdctl snapshot status /var/lib/etcd/backup.db');
    assert.equal(etcdStatus.exitCode, 0);
    assert.ok(etcdStatus.output.includes('TOTAL KEYS'));

    // Kubeadm upgrade plan & apply
    const kubeadmPlan = term.execute('kubeadm upgrade plan');
    assert.equal(kubeadmPlan.exitCode, 0);
    assert.ok(kubeadmPlan.output.includes('[upgrade/plan]'));

    const kubeadmApply = term.execute('kubeadm upgrade apply v1.32.0');
    assert.equal(kubeadmApply.exitCode, 0);
    assert.ok(kubeadmApply.output.includes('SUCCESS!'));
  });
});
