/**
 * tests/stage4-gitops-argocd-fluxcd.test.js
 * Subphase 4.1.1 Verification: Domain 16 (GitOps), Domain 17 (ArgoCD) & Domain 18 (FluxCD)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * pull-based reconciliation, out-of-band drift healing, ExternalSecrets declarative secret patterns,
 * ArgoCD Application CRDs and sync waves, and FluxCD GitRepository, Kustomization, and HelmRelease.
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

describe('Subphase 4.1.1 — Domain 16 (GitOps), Domain 17 (ArgoCD) & Domain 18 (FluxCD)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 16, 17, and 18 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain16 = pluginManager.getDomain('gitops-delivery');
    assert.ok(domain16, 'Domain 16 (gitops-delivery) must exist');
    assert.equal(domain16.category, 'GitOps & Delivery');
    assert.equal(domain16.trackId, 'track-k8s-admin');
    assert.equal(domain16.labs.length, 2);
    assert.equal(domain16.assessmentQuestions.length, 2);

    const domain17 = pluginManager.getDomain('argocd-gitops');
    assert.ok(domain17, 'Domain 17 (argocd-gitops) must exist');
    assert.equal(domain17.category, 'GitOps & Delivery');
    assert.equal(domain17.trackId, 'track-k8s-admin');
    assert.equal(domain17.labs.length, 2);
    assert.equal(domain17.assessmentQuestions.length, 2);

    const domain18 = pluginManager.getDomain('fluxcd-gitops');
    assert.ok(domain18, 'Domain 18 (fluxcd-gitops) must exist');
    assert.equal(domain18.category, 'GitOps & Delivery');
    assert.equal(domain18.trackId, 'track-k8s-admin');
    assert.equal(domain18.labs.length, 2);
    assert.equal(domain18.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 6 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-gitops-01-pull-reconciliation',
      'lab-gitops-02-secrets-management',
      'lab-argo-01-app-declarative-sync',
      'lab-argo-02-sync-waves-phased-rollout',
      'lab-flux-01-gitrepository-kustomization',
      'lab-flux-02-helmrelease-reconciliation'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 6, 'Must find all 6 subphase labs');

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

  it('3. Deterministic Solver: All 6 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-gitops-01-pull-reconciliation',
      'lab-gitops-02-secrets-management',
      'lab-argo-01-app-declarative-sync',
      'lab-argo-02-sync-waves-phased-rollout',
      'lab-flux-01-gitrepository-kustomization',
      'lab-flux-02-helmrelease-reconciliation'
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

  it('4. Engine Parity: Domain 16 GitOps Pull-Based Reconciliation & ExternalSecrets', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /gitops');
    terminal.execute('cat << \'EOF\' > /gitops/payment-service.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payment-service\n  namespace: gitops-apps\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n        - name: payment\n          image: payment:v1.2.0\nEOF');
    terminal.execute('kubectl apply -f /gitops/payment-service.yaml');

    const dep = cluster.getResource('Deployment', 'payment-service', 'gitops-apps');
    assert.ok(dep, 'Deployment payment-service must exist');
    assert.equal(dep.spec.replicas, 2);

    // Apply ExternalSecret and synced Secret
    terminal.execute('kubectl create namespace gitops-apps');
    terminal.execute('cat << \'EOF\' > /gitops/ext-sec.yaml\napiVersion: external-secrets.io/v1beta1\nkind: ExternalSecret\nmetadata:\n  name: vault-db-credentials\n  namespace: gitops-apps\nspec:\n  secretStoreRef:\n    name: vault-backend\nEOF');
    terminal.execute('kubectl apply -f /gitops/ext-sec.yaml');
    terminal.execute('kubectl create secret generic db-credentials -n gitops-apps --from-literal=username=dbadmin --from-literal=password=vault-secure-pass');

    const extSec = cluster.getResource('ExternalSecret', 'vault-db-credentials', 'gitops-apps');
    assert.ok(extSec, 'ExternalSecret must exist');
    const sec = cluster.getResource('Secret', 'db-credentials', 'gitops-apps');
    assert.ok(sec, 'Secret db-credentials must exist');
  });

  it('5. Engine Parity: Domain 17 ArgoCD Application Sync & Sync Waves', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    // Sync waves
    terminal.execute('cat << \'EOF\' > /gitops/waves.yaml\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: backend-config\n  namespace: production\n  annotations:\n    argocd.argoproj.io/sync-wave: "0"\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: backend-api\n  namespace: production\n  annotations:\n    argocd.argoproj.io/sync-wave: "1"\nspec:\n  replicas: 2\nEOF');
    terminal.execute('kubectl apply -f /gitops/waves.yaml');

    const cm = cluster.getResource('ConfigMap', 'backend-config', 'production');
    assert.ok(cm, 'ConfigMap backend-config must exist');
    assert.equal(getFieldByPath(cm, "metadata.annotations['argocd.argoproj.io/sync-wave']"), '0');

    const dep = cluster.getResource('Deployment', 'backend-api', 'production');
    assert.ok(dep, 'Deployment backend-api must exist');
    assert.equal(getFieldByPath(dep, "metadata.annotations['argocd.argoproj.io/sync-wave']"), '1');

    // ArgoCD app sync creates deployment and marks Synced/Healthy
    const syncRes = terminal.execute('argocd app sync frontend-portal');
    assert.equal(syncRes.exitCode, 0);

    const report = validationEngine.evaluate(
      [{ id: 'r1', description: 'Argo app synced', type: 'argocd_app_synced', name: 'frontend-portal' }],
      { cluster, vfs, commandHistory: terminal.history }
    );
    assert.equal(report.score, 100);
    assert.equal(report.passed, true);
  });

  it('6. Engine Parity: Domain 18 FluxCD GitRepository, Kustomization & HelmRelease', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('flux check');
    const fluxCheck = terminal.execute('flux --version');
    assert.equal(fluxCheck.exitCode, 0);

    terminal.execute('cat << \'EOF\' > /gitops/flux.yaml\napiVersion: source.toolkit.fluxcd.io/v1\nkind: GitRepository\nmetadata:\n  name: fleet-infra\n  namespace: flux-system\nspec:\n  url: https://github.com/kubelabs/fleet-infra.git\n---\napiVersion: kustomize.toolkit.fluxcd.io/v1\nkind: Kustomization\nmetadata:\n  name: app-stack\n  namespace: flux-system\nspec:\n  path: ./clusters/staging\n  prune: true\nEOF');
    terminal.execute('kubectl apply -f /gitops/flux.yaml');

    const gitRepo = cluster.getResource('GitRepository', 'fleet-infra', 'flux-system');
    assert.ok(gitRepo, 'GitRepository must exist in flux-system');

    const kustomization = cluster.getResource('Kustomization', 'app-stack', 'flux-system');
    assert.ok(kustomization, 'Kustomization must exist in flux-system');

    const reconcileRes = terminal.execute('flux reconcile kustomization app-stack');
    assert.equal(reconcileRes.exitCode, 0);

    // HelmRelease
    terminal.execute('kubectl create namespace cache-tier');
    terminal.execute('cat << \'EOF\' > /gitops/hr.yaml\napiVersion: helm.toolkit.fluxcd.io/v2beta1\nkind: HelmRelease\nmetadata:\n  name: redis-cache\n  namespace: flux-system\nspec:\n  targetNamespace: cache-tier\n  chart:\n    spec:\n      chart: redis\nEOF');
    terminal.execute('kubectl apply -f /gitops/hr.yaml');

    const hr = cluster.getResource('HelmRelease', 'redis-cache', 'flux-system');
    assert.ok(hr, 'HelmRelease redis-cache must exist');
    assert.equal(hr.spec.targetNamespace, 'cache-tier');
  });
});
