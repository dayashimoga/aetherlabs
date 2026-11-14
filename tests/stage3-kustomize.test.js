/**
 * tests/stage3-kustomize.test.js
 * Subphase 3.2.3 Verification: Domain 08 (Kustomize)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * base/overlay composition, strategic merge patches, configMapGenerator and secretGenerator hash suffixes,
 * and kubectl apply -k integration.
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

describe('Subphase 3.2.3 — Domain 08 (Kustomize)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 08 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain08 = pluginManager.getDomain('kustomize-manifests');
    assert.ok(domain08, 'Domain 08 (kustomize-manifests) must exist');
    assert.equal(domain08.id, 'kustomize-manifests');
    assert.equal(domain08.category, 'Containers & Packaging');
    assert.equal(domain08.trackId, 'track-k8s-admin');
    assert.deepEqual(domain08.prerequisites, ['helm-packaging', 'docker-containers']);
    assert.ok(domain08.learningObjectives.length >= 3);
    assert.ok(domain08.curriculumModules.length >= 2);
    assert.equal(domain08.labs.length, 2);
    assert.equal(domain08.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both Kustomize labs fail before solution commands (0% score)', () => {
    const kustLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-kust-'));
    assert.equal(kustLabs.length, 2, 'Must have exactly 2 labs in Domain 08');

    for (const lab of kustLabs) {
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

  it('3. Deterministic Solver: Both Kustomize labs achieve 100% score after canonical solution replay', () => {
    const kustLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-kust-'));

    for (const lab of kustLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;
      const term = new TerminalEngine(cluster, vfs);

      // Replay all solution commands sequentially
      for (const cmd of lab.solutionCommands) {
        const res = term.execute(cmd, { manifestText: lab.starterManifest, vfs });
        assert.equal(
          res.exitCode,
          0,
          `Lab ${lab.id} solution command "${cmd}" failed with code ${res.exitCode}: ${res.output || res.stderr}`
        );
      }

      // Evaluate validation rules with live cluster context, VFS and command history
      const afterReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        term.commandHistory,
        { vfs, cluster }
      );

      assert.equal(
        afterReport.passed,
        true,
        `Lab ${lab.id} failed after solution. Details: ${JSON.stringify(afterReport.results)}`
      );
      assert.equal(
        afterReport.score,
        100,
        `Lab ${lab.id} did not achieve 100% score after solution. Got ${afterReport.score}%`
      );
    }
  });

  it('4. Kustomize Overlay & Strategic Merge Patching Parity: base/overlay & kubectl apply -k', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    // Create base
    vfs.mkdir('/home/learner/app-base');
    vfs.writeFile('/home/learner/app-base/deployment.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-api
  template:
    metadata:
      labels:
        app: web-api
    spec:
      containers:
      - name: api
        image: nginx:1.27-alpine
`);
    vfs.writeFile('/home/learner/app-base/kustomization.yaml', `resources:
- deployment.yaml
`);

    // Create production overlay
    vfs.mkdir('/home/learner/app-overlays');
    vfs.mkdir('/home/learner/app-overlays/production');
    vfs.writeFile('/home/learner/app-overlays/production/kustomization.yaml', `resources:
- ../../app-base
namespace: prod
namePrefix: live-
commonLabels:
  tier: frontend
patchesStrategicMerge:
- patch.yaml
`);
    vfs.writeFile('/home/learner/app-overlays/production/patch.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-api
spec:
  replicas: 5
`);

    // kustomize build
    const buildRes = term.execute('kustomize build app-overlays/production');
    assert.equal(buildRes.exitCode, 0);
    assert.match(buildRes.output, /live-web-api/);
    assert.match(buildRes.output, /namespace: prod/);
    assert.match(buildRes.output, /replicas: 5/);

    // kubectl apply -k
    const applyRes = term.execute('kubectl apply -k app-overlays/production');
    assert.equal(applyRes.exitCode, 0);

    const dep = cluster.getResource('Deployment', 'live-web-api', 'prod');
    assert.ok(dep, 'Deployment live-web-api must exist in namespace prod');
    assert.equal(dep.spec.replicas, 5, 'Strategic patch must have set replicas to 5');
    assert.equal(dep.metadata.labels.tier, 'frontend', 'commonLabels must be applied');
  });

  it('5. Kustomize Generator Parity: configMapGenerator and secretGenerator with hash suffixes', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    vfs.mkdir('/home/learner/gen-test');
    vfs.writeFile('/home/learner/gen-test/kustomization.yaml', `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
configMapGenerator:
- name: service-cfg
  literals:
  - CACHE_TTL=3600
secretGenerator:
- name: service-auth
  literals:
  - API_KEY=TopSecret999
`);

    // kustomize build
    const buildRes = term.execute('kustomize build gen-test');
    assert.equal(buildRes.exitCode, 0);
    assert.match(buildRes.output, /service-cfg-7m8f9b2c4k/);
    assert.match(buildRes.output, /service-auth-4d9a1b2e3f/);

    // kubectl apply -k
    const applyRes = term.execute('kubectl apply -k gen-test');
    assert.equal(applyRes.exitCode, 0);

    const cm = cluster.getResource('ConfigMap', 'service-cfg-7m8f9b2c4k', 'default');
    assert.ok(cm, 'Hashed ConfigMap must exist in default namespace');
    assert.equal(cm.data.CACHE_TTL, '3600');

    const sec = cluster.getResource('Secret', 'service-auth-4d9a1b2e3f', 'default');
    assert.ok(sec, 'Hashed Secret must exist in default namespace');
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domain08 = pluginManager.getDomain('kustomize-manifests');
    assert.ok(domain08.assessmentQuestions.length >= 2);
    for (const q of domain08.assessmentQuestions) {
      assert.ok(q.question.length > 20);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation.length > 30);
    }
  });
});
