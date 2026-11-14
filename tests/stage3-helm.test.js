/**
 * tests/stage3-helm.test.js
 * Subphase 3.2.2 Verification: Domain 07 (Helm)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * chart scaffolding (helm create), linting, templating, packaging, release lifecycle,
 * helm test, history auditing, and rollback.
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

describe('Subphase 3.2.2 — Domain 07 (Helm)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 07 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain07 = pluginManager.getDomain('helm-packaging');
    assert.ok(domain07, 'Domain 07 (helm-packaging) must exist');
    assert.equal(domain07.id, 'helm-packaging');
    assert.equal(domain07.category, 'Containers & Packaging');
    assert.equal(domain07.trackId, 'track-k8s-admin');
    assert.deepEqual(domain07.prerequisites, ['docker-containers', 'container-runtime-cri']);
    assert.ok(domain07.learningObjectives.length >= 3);
    assert.ok(domain07.curriculumModules.length >= 2);
    assert.equal(domain07.labs.length, 2);
    assert.equal(domain07.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both Helm labs fail before solution commands (0% score)', () => {
    const helmLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-helm-'));
    assert.equal(helmLabs.length, 2, 'Must have exactly 2 labs in Domain 07');

    for (const lab of helmLabs) {
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

  it('3. Deterministic Solver: Both Helm labs achieve 100% score after canonical solution replay', () => {
    const helmLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-helm-'));

    for (const lab of helmLabs) {
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

  it('4. Helm Chart Authoring Parity: create, lint, template, and package', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    // 1. helm create
    const createRes = term.execute('helm create billing-service');
    assert.equal(createRes.exitCode, 0);
    assert.match(createRes.output, /Creating billing-service/);
    assert.ok(vfs.exists('/home/learner/billing-service/Chart.yaml'));
    assert.ok(vfs.exists('/home/learner/billing-service/values.yaml'));
    assert.ok(vfs.exists('/home/learner/billing-service/templates/_helpers.tpl'));
    assert.ok(vfs.exists('/home/learner/billing-service/templates/deployment.yaml'));
    assert.ok(vfs.exists('/home/learner/billing-service/templates/tests/test-connection.yaml'));

    // 2. helm lint
    const lintRes = term.execute('helm lint billing-service');
    assert.equal(lintRes.exitCode, 0);
    assert.match(lintRes.output, /0 chart\(s\) failed/);

    // 3. helm template
    const templateRes = term.execute('helm template billing-release billing-service');
    assert.equal(templateRes.exitCode, 0);
    assert.match(templateRes.output, /kind: Deployment/);
    assert.match(templateRes.output, /kind: Service/);

    // 4. helm package
    const packageRes = term.execute('helm package billing-service');
    assert.equal(packageRes.exitCode, 0);
    assert.match(packageRes.output, /Successfully packaged chart/);
    assert.ok(vfs.exists('/home/learner/billing-service-0.1.0.tgz'));
  });

  it('5. Helm Release Lifecycle Parity: install, test, upgrade, history, and rollback', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    // 1. helm install
    const installRes = term.execute('helm install orders-api bitnami/nginx -n production');
    assert.equal(installRes.exitCode, 0);
    assert.match(installRes.output, /STATUS: deployed/);
    const rel = cluster.state.helmReleases.find((r) => r.name === 'orders-api');
    assert.ok(rel);
    assert.equal(rel.namespace, 'production');
    assert.equal(rel.revision, 1);

    // 2. helm test
    const testRes = term.execute('helm test orders-api -n production');
    assert.equal(testRes.exitCode, 0);
    assert.match(testRes.output, /TEST STATUS:\s+SUCCESS/);

    // 3. helm upgrade
    const upgradeRes = term.execute('helm upgrade orders-api bitnami/nginx -n production');
    assert.equal(upgradeRes.exitCode, 0);
    assert.match(upgradeRes.output, /REVISION: 2/);
    assert.equal(rel.revision, 2);

    // 4. helm history
    const historyRes = term.execute('helm history orders-api -n production');
    assert.equal(historyRes.exitCode, 0);
    assert.match(historyRes.output, /REVISION/);
    assert.match(historyRes.output, /Upgrade complete/);

    // 5. helm rollback
    const rollbackRes = term.execute('helm rollback orders-api 1 -n production');
    assert.equal(rollbackRes.exitCode, 0);
    assert.match(rollbackRes.output, /Rollback was a success/);
    assert.equal(rel.revision, 1);
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domain07 = pluginManager.getDomain('helm-packaging');
    assert.ok(domain07.assessmentQuestions.length >= 2);
    for (const q of domain07.assessmentQuestions) {
      assert.ok(q.question.length > 20);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation.length > 30);
    }
  });
});
