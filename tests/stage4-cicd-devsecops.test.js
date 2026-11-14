/**
 * tests/stage4-cicd-devsecops.test.js
 * Subphase 4.1.2 Verification: Domain 19 (CI/CD Pipelines) & Domain 20 (DevSecOps Pipelines)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Tekton Tasks, Pipelines, and Workspaces, GitHub Actions workflow caching and DORA engineering,
 * Trivy container vulnerability scanning and SBOM generation, and Kyverno ClusterPolicy admission control.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine, getFieldByPath } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.1.2 — Domain 19 (CI/CD) & Domain 20 (DevSecOps)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 19 and Domain 20 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain19 = pluginManager.getDomain('cicd-pipelines');
    assert.ok(domain19, 'Domain 19 (cicd-pipelines) must exist');
    assert.equal(domain19.category, 'CI/CD & DevSecOps');
    assert.equal(domain19.trackId, 'track-k8s-admin');
    assert.equal(domain19.labs.length, 2);
    assert.equal(domain19.assessmentQuestions.length, 2);

    const domain20 = pluginManager.getDomain('devsecops-pipeline');
    assert.ok(domain20, 'Domain 20 (devsecops-pipeline) must exist');
    assert.equal(domain20.category, 'CI/CD & DevSecOps');
    assert.equal(domain20.trackId, 'track-devsecops');
    assert.equal(domain20.labs.length, 2);
    assert.equal(domain20.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-cicd-01-tekton-pipeline',
      'lab-cicd-02-github-actions-caching',
      'lab-secops-01-trivy-sbom-scan',
      'lab-secops-02-kyverno-admission-policy'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 subphase labs');

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} pre-score must be 0%, but got ${report.score}%. Report: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, false, `Lab ${lab.id} must not pass before solution`);
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-cicd-01-tekton-pipeline',
      'lab-cicd-02-github-actions-caching',
      'lab-secops-01-trivy-sbom-scan',
      'lab-secops-02-kyverno-admission-policy'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands
      for (const cmd of lab.solutionCommands) {
        terminal.execute(cmd);
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} post-score must be 100%, but got ${report.score}%. Rules: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, true, `Lab ${lab.id} must pass after canonical solution`);
    }
  });

  it('4. Engine Parity: Domain 19 Tekton Tasks, Pipelines & GitHub Actions Caching', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('kubectl create namespace tekton-pipelines');
    terminal.execute('cat << \'EOF\' > /ci/task.yaml\napiVersion: tekton.dev/v1\nkind: Task\nmetadata:\n  name: build-image\n  namespace: tekton-pipelines\nspec:\n  steps:\n    - name: build\n      image: crictl:latest\nEOF');
    terminal.execute('kubectl apply -f /ci/task.yaml');

    const task = cluster.getResource('Task', 'build-image', 'tekton-pipelines');
    assert.ok(task, 'Tekton Task must exist in tekton-pipelines namespace');

    terminal.execute('mkdir -p .github/workflows');
    terminal.execute('cat << \'EOF\' > .github/workflows/ci.yml\nname: CI\njobs:\n  test:\n    steps:\n      - uses: actions/cache@v4\n      - run: npm test\nEOF');

    assert.ok(vfs.exists('.github/workflows/ci.yml'), 'Workflow file must exist in VFS');
    const content = vfs.readFile('.github/workflows/ci.yml');
    assert.ok(content.includes('actions/cache@v4'), 'Workflow must include cache action');
    assert.ok(content.includes('npm test'), 'Workflow must execute tests');
  });

  it('5. Engine Parity: Domain 20 Trivy Vulnerability Audit & Kyverno Admission Governance', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /security');
    const trivyRes = terminal.execute('trivy image nginx:1.27-alpine > /security/trivy-report.txt');
    assert.equal(trivyRes.exitCode, 0);
    assert.ok(vfs.exists('/security/trivy-report.txt'), 'Trivy report must be persisted in VFS');
    const reportText = vfs.readFile('/security/trivy-report.txt');
    assert.ok(reportText.includes('Scan Target: nginx:1.27-alpine'), 'Trivy report must contain scan summary');

    // Kyverno ClusterPolicy
    terminal.execute('cat << \'EOF\' > /security/policy.yaml\napiVersion: kyverno.io/v1\nkind: ClusterPolicy\nmetadata:\n  name: disallow-root-user\nspec:\n  validationFailureAction: Enforce\nEOF');
    terminal.execute('kubectl apply -f /security/policy.yaml');

    const policy = cluster.getResource('ClusterPolicy', 'disallow-root-user');
    assert.ok(policy, 'ClusterPolicy disallow-root-user must exist in cluster');
    assert.equal(policy.spec.validationFailureAction, 'Enforce');

    const kyvernoTest = terminal.execute('kyverno apply /security/policy.yaml');
    assert.equal(kyvernoTest.exitCode, 0);
    assert.ok(kyvernoTest.output.includes('Policies validated successfully'), 'Kyverno CLI must validate policy');
  });
});
