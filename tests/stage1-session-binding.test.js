'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SessionManager } = require('../src/core/sessionManager');
const { ValidationEngine } = require('../src/core/validationEngine');
const { PluginManager } = require('../src/plugins/pluginManager');
const { ProjectEngine } = require('../src/core/projectEngine');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');
const { ApiRouter } = require('../src/api/router');

const rootDir = path.join(__dirname, '..');
const pluginManager = new PluginManager(
  path.join(rootDir, 'plugins'),
  path.join(rootDir, 'schemas', 'plugin.schema.json')
);
const validationEngine = new ValidationEngine();
const projectEngine = new ProjectEngine(validationEngine);
const incidentEngine = new IncidentEngine(validationEngine);

test('Subphase 1.1.2: SessionManager.bindLab atomically isolates state and seeds VFS starter manifests', () => {
  const sessionManager = new SessionManager();
  const labK8s01 = pluginManager.getLab('lab-k8s-01');
  const labSre01 = pluginManager.getLab('lab-sre-01');
  assert.ok(labK8s01, 'lab-k8s-01 must exist in curriculum');
  assert.ok(labSre01, 'lab-sre-01 must exist in curriculum');

  // 1. Bind to initial lab
  const bound1 = sessionManager.bindLab('test-sess-1', labK8s01);
  assert.equal(bound1.activeLabId, 'lab-k8s-01');
  assert.equal(bound1.session.activeLabId, 'lab-k8s-01');
  assert.equal(bound1.session.activeIncidentId, null);
  assert.equal(bound1.session.activeProjectId, null);

  // Pollute cluster and VFS with custom state
  bound1.session.cluster.applyResource({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'stale-leftover-config', namespace: 'default' },
    data: { key: 'polluted' }
  });
  bound1.session.vfs.writeFile('/home/learner/dirty.txt', 'dirty-state');
  bound1.session.terminal.commandHistory.push('kubectl get pods');
  sessionManager.setValidationReport('test-sess-1', { score: 100, passed: true, results: [{ id: 'stale-assertion' }] });

  assert.ok(bound1.session.cluster.getResource('ConfigMap', 'stale-leftover-config', 'default'));
  assert.equal(sessionManager.getValidationReport('test-sess-1').score, 100);

  // 2. Atomically switch to lab-sre-01
  const bound2 = sessionManager.bindLab('test-sess-1', labSre01);
  assert.equal(bound2.activeLabId, 'lab-sre-01');
  assert.equal(bound2.session.activeLabId, 'lab-sre-01');
  assert.equal(bound2.session.activeIncidentId, null);
  assert.equal(bound2.session.activeProjectId, null);

  // Verify atomic cleanup of polluted cluster, VFS, command history, and stale validation reports
  assert.equal(bound2.session.cluster.getResource('ConfigMap', 'stale-leftover-config', 'default'), null);
  assert.equal(bound2.session.vfs.exists('/home/learner/dirty.txt'), false);
  assert.equal(bound2.session.terminal.commandHistory.length, 0);
  assert.equal(sessionManager.getValidationReport('test-sess-1'), null);

  // Verify starterManifest was seeded into VFS
  assert.equal(bound2.session.vfs.exists('/home/learner/manifest.yaml'), true);
  const vfsContent = bound2.session.vfs.readFile('/home/learner/manifest.yaml');
  assert.ok(vfsContent.includes('order-processor') || vfsContent.length > 0);
});

test('Subphase 1.1.2: Cross-Capstone to Lab State Isolation (Fixes commerce-sa bleeding into order-processor)', () => {
  const sessionManager = new SessionManager();
  const projCommerce = projectEngine.getProject('proj-02-gitops-ha-commerce');
  const labSre01 = pluginManager.getLab('lab-sre-01');
  assert.ok(projCommerce, 'proj-02-gitops-ha-commerce must exist');
  assert.ok(labSre01, 'lab-sre-01 must exist');

  // 1. User builds/solves Capstone 2 (Commerce Platform)
  sessionManager.bindProject('learner-sess-42', projCommerce, projectEngine);
  const session = sessionManager.getSession('learner-sess-42');
  for (const cmd of projCommerce.solutionCommands) {
    session.terminal.execute(cmd);
  }
  const capstoneReport = projectEngine.validateProject(projCommerce.id, session.cluster, session.terminal.commandHistory);
  assert.equal(capstoneReport.passed, true);
  assert.ok(session.cluster.getResource('ServiceAccount', 'commerce-sa', 'production'), 'commerce-sa exists in capstone');

  // 2. User switches to Workbench to practice SRE Lab
  sessionManager.bindLab('learner-sess-42', labSre01);

  // Cluster MUST NOT have commerce-sa anymore
  assert.equal(
    session.cluster.getResource('ServiceAccount', 'commerce-sa', 'production'),
    null,
    'commerce-sa MUST NOT bleed into lab-sre-01'
  );
  assert.equal(
    session.cluster.getResource('Role', 'commerce-role', 'production'),
    null,
    'commerce-role MUST NOT bleed into lab-sre-01'
  );

  // Validation report evaluated against current lab MUST have ZERO mentions of commerce-sa
  const labReport = validationEngine.evaluate(
    labSre01.validationRules,
    session.cluster,
    session.terminal.commandHistory,
    { labId: 'lab-sre-01' }
  );

  assert.equal(labReport.labId, 'lab-sre-01');
  assert.equal(labReport.passed, false, 'Unsolved lab must fail initial validation');

  const hasStaleCommerceAssertions = labReport.results.some(
    (r) => r.description.includes('commerce-sa') || r.description.includes('commerce-role')
  );
  assert.equal(hasStaleCommerceAssertions, false, 'Validation results must not contain stale capstone assertions');
});

test('Subphase 1.1.2: SessionManager.bindIncident isolates cluster and sets activeIncidentId', () => {
  const sessionManager = new SessionManager();
  const inc = incidentEngine.getIncident('inc-01-dns-failure') || incidentEngine.scenarios[0];
  assert.ok(inc, 'Incident must exist');

  const bound = sessionManager.bindIncident('inc-sess', inc, incidentEngine);
  assert.equal(bound.activeIncidentId, inc.id);
  assert.equal(bound.session.activeIncidentId, inc.id);
  assert.equal(bound.session.activeLabId, null);
  assert.equal(bound.session.activeProjectId, null);
  assert.equal(bound.session.terminal.commandHistory.length, 0);
});

test('Subphase 1.1.2: ValidationEngine.bindLab binds active rules and tags reports with labId', () => {
  const valEngine = new ValidationEngine();
  const lab = pluginManager.getLab('lab-k8s-01');
  valEngine.bindLab(lab.id, lab.validationRules);

  const cluster = sessionManagerStubCluster();
  const report = valEngine.evaluate(null, cluster, []);
  assert.equal(report.labId, 'lab-k8s-01');
  assert.equal(report.contextType, 'lab');
  assert.equal(report.totalCount, lab.validationRules.length);
});

test('Subphase 1.1.2: Router API atomic session binding and isolation', async () => {
  const mockDb = {
    getProfile: () => ({ profile: { id: 'default-learner', xp: 500 }, completedLabs: [], projects: [], incidents: [] }),
    updateProfileFields: () => {},
    recordLabAttempt: (rec) => ({ ...rec, verificationHash: 'sha256-verified-mock' }),
    recordTerminalCommand: () => {},
    recordProjectAttempt: (rec) => ({ ...rec }),
    startIncidentRun: () => ({ id: 'run-1' }),
    resolveIncidentRun: () => ({ id: 'run-1', status: 'resolved' })
  };

  const sessionManager = new SessionManager();
  const certificationEngine = new CertificationEngine(pluginManager, mockDb);
  const router = new ApiRouter({
    database: mockDb,
    pluginManager,
    sessionManager,
    validationEngine,
    incidentEngine,
    projectEngine,
    certificationEngine
  });

  // Helper to invoke router
  async function makeReq(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
      let responseBody = '';
      let statusCode = 200;
      let respHeaders = {};
      const req = {
        method,
        url: path,
        headers: { 'x-kubelabs-session': 'api-isolation-test', ...headers },
        socket: { remoteAddress: '127.0.0.1' },
        on: (ev, cb) => {
          if (ev === 'data' && body) cb(Buffer.from(JSON.stringify(body)));
          if (ev === 'end') cb();
        }
      };
      const res = {
        setHeader: (k, v) => { respHeaders[k] = v; },
        on: (ev, cb) => { if (ev === 'finish') cb(); },
        end: (data) => {
          if (data) responseBody = data;
          resolve({ statusCode: res.statusCode || statusCode, body: responseBody ? JSON.parse(responseBody) : null });
        }
      };
      Object.defineProperty(res, 'statusCode', {
        get: () => statusCode,
        set: (v) => { statusCode = v; }
      });
      router.handle(req, res);
    });
  }

  // 1. Solve Capstone 2 on this session
  const projRes = await makeReq('POST', '/api/projects/proj-02-gitops-ha-commerce/solve');
  assert.equal(projRes.statusCode, 200);
  assert.equal(projRes.body.isProject, true);
  assert.equal(projRes.body.projectId, 'proj-02-gitops-ha-commerce');

  // Verify session cluster contains commerce-sa
  const session = sessionManager.getSession('api-isolation-test');
  assert.ok(session.cluster.getResource('ServiceAccount', 'commerce-sa', 'production'));

  // 2. Start SRE lab on this session
  const labStartRes = await makeReq('POST', '/api/labs/lab-sre-01/start');
  assert.equal(labStartRes.statusCode, 200);
  assert.equal(labStartRes.body.activeLabId, 'lab-sre-01');

  // Verify cluster no longer contains commerce-sa
  assert.equal(session.cluster.getResource('ServiceAccount', 'commerce-sa', 'production'), null);

  // 3. Validate SRE lab on this session
  const labValidateRes = await makeReq('POST', '/api/labs/lab-sre-01/validate');
  assert.equal(labValidateRes.statusCode, 200);
  assert.equal(labValidateRes.body.labId, 'lab-sre-01');
  assert.equal(labValidateRes.body.contextType, 'lab');

  // Assertions must NOT contain commerce-sa
  const hasCommerce = labValidateRes.body.results.some((r) => r.description.includes('commerce-sa'));
  assert.equal(hasCommerce, false);
});

function sessionManagerStubCluster() {
  const { VirtualCluster } = require('../src/core/virtualCluster');
  return new VirtualCluster();
}
