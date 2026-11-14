/**
 * tests/stage3-docker-cri.test.js
 * Subphase 3.2.1 Verification: Domain 05 (Docker) & Domain 06 (Container Runtime & CRI)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * multi-stage distroless builds, non-root execution context, OverlayFS storage drivers,
 * crictl node diagnostics, and gVisor sandboxed RuntimeClass pod isolation.
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

describe('Subphase 3.2.1 — Domain 05 (Docker) & Domain 06 (Container Runtime & CRI)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 05 and Domain 06 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain05 = pluginManager.getDomain('docker-containers');
    assert.ok(domain05, 'Domain 05 (docker-containers) must exist');
    assert.equal(domain05.id, 'docker-containers');
    assert.equal(domain05.category, 'Containers & Packaging');
    assert.equal(domain05.trackId, 'track-foundations');
    assert.ok(domain05.learningObjectives.length >= 3);
    assert.ok(domain05.curriculumModules.length >= 2);
    assert.equal(domain05.labs.length, 2);
    assert.equal(domain05.assessmentQuestions.length, 2);

    const domain06 = pluginManager.getDomain('container-runtime-cri');
    assert.ok(domain06, 'Domain 06 (container-runtime-cri) must exist');
    assert.equal(domain06.id, 'container-runtime-cri');
    assert.equal(domain06.category, 'Containers & Packaging');
    assert.equal(domain06.trackId, 'track-foundations');
    assert.deepEqual(domain06.prerequisites, ['docker-containers', 'linux-admin']);
    assert.ok(domain06.learningObjectives.length >= 3);
    assert.ok(domain06.curriculumModules.length >= 2);
    assert.equal(domain06.labs.length, 2);
    assert.equal(domain06.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 container labs fail before solution commands (0% score)', () => {
    const containerLabs = pluginManager.getAllLabs().filter(
      (l) => l.id.startsWith('lab-docker-') || l.id.startsWith('lab-cri-')
    );

    assert.equal(containerLabs.length, 4, 'Must have exactly 4 labs across Domains 05 and 06');

    for (const lab of containerLabs) {
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

  it('3. Deterministic Solver: All 4 container labs achieve 100% score after canonical solution replay', () => {
    const containerLabs = pluginManager.getAllLabs().filter(
      (l) => l.id.startsWith('lab-docker-') || l.id.startsWith('lab-cri-')
    );

    for (const lab of containerLabs) {
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

  it('4. Docker Engine Parity: Distroless inspect, OverlayFS storage, diff and prune', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    // Build distroless image
    const buildRes = term.execute('docker build -t payment-api:distroless .');
    assert.equal(buildRes.exitCode, 0);
    assert.match(buildRes.output, /payment-api:distroless/);

    // Run container
    const runRes = term.execute('docker run -d --name secure-api -p 8080:8080 payment-api:distroless');
    assert.equal(runRes.exitCode, 0);

    // Inspect container metadata
    const inspectRes = term.execute('docker inspect secure-api');
    assert.equal(inspectRes.exitCode, 0);
    const inspectJson = JSON.parse(inspectRes.output);
    assert.ok(Array.isArray(inspectJson));
    assert.equal(inspectJson[0].Config.User, '65532:65532');
    assert.equal(inspectJson[0].GraphDriver.Name, 'overlay2');
    assert.ok(inspectJson[0].GraphDriver.Data.LowerDir.includes('/var/lib/docker/overlay2/'));

    // Filesystem diff
    const diffRes = term.execute('docker diff secure-api');
    assert.equal(diffRes.exitCode, 0);
    assert.match(diffRes.output, /C \/app/);

    // Image prune
    const pruneRes = term.execute('docker image prune -f');
    assert.equal(pruneRes.exitCode, 0);
    assert.match(pruneRes.output, /Total reclaimed space/);
  });

  it('5. CRI & Sandboxed Runtimes Parity: crictl diagnostics & gVisor RuntimeClass', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    const term = new TerminalEngine(cluster, vfs);

    // crictl pods & ps & stats
    const podsRes = term.execute('crictl pods');
    assert.equal(podsRes.exitCode, 0);
    assert.match(podsRes.output, /POD ID/);

    const psRes = term.execute('crictl ps');
    assert.equal(psRes.exitCode, 0);
    assert.match(psRes.output, /CONTAINER/);

    const statsRes = term.execute('crictl stats');
    assert.equal(statsRes.exitCode, 0);
    assert.match(statsRes.output, /CPU %/);

    // crictl info
    const infoRes = term.execute('crictl info');
    assert.equal(infoRes.exitCode, 0);
    const infoJson = JSON.parse(infoRes.output);
    assert.equal(infoJson.config.containerd.runtimes.runsc.runtimeType, 'io.containerd.runsc.v1');

    // Register RuntimeClass gvisor
    const rcHeredoc = `cat <<EOF | kubectl apply -f -
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
EOF`;
    const rcRes = term.execute(rcHeredoc);
    assert.equal(rcRes.exitCode, 0);
    assert.ok(cluster.getResource('RuntimeClass', 'gvisor'));

    // Deploy sandboxed Pod
    const podHeredoc = `cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: untrusted-sandbox
  namespace: default
spec:
  runtimeClassName: gvisor
  containers:
  - name: sandbox-app
    image: nginx:1.27-alpine
EOF`;
    const podRes = term.execute(podHeredoc);
    assert.equal(podRes.exitCode, 0);

    const pod = cluster.getResource('Pod', 'untrusted-sandbox', 'default');
    assert.ok(pod);
    assert.equal(pod.status.phase, 'Running');
    assert.equal(pod.spec.runtimeClassName, 'gvisor');
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domain05 = pluginManager.getDomain('docker-containers');
    for (const q of domain05.assessmentQuestions) {
      assert.ok(q.question.length > 20);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation.length > 30);
    }

    const domain06 = pluginManager.getDomain('container-runtime-cri');
    for (const q of domain06.assessmentQuestions) {
      assert.ok(q.question.length > 20);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation.length > 30);
    }
  });
});
