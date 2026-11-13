'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IncidentEngine,
  INCIDENT_SCENARIOS,
  CATEGORY_WEBSITE_DOWN,
  CATEGORY_POD_RESTARTING,
  CATEGORY_SLOW_APP,
  CATEGORY_DNS_OUTAGE,
  CATEGORY_IAM_OUTAGE,
  CATEGORY_STORAGE_OUTAGE,
  CATEGORY_NETWORKING_OUTAGE,
  CATEGORY_NODE_OUTAGE,
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_METADATA
} = require('../src/core/incidentEngine');

const { VirtualCluster } = require('../src/core/virtualCluster');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ValidationEngine } = require('../src/core/validationEngine');
const { SessionManager } = require('../src/core/sessionManager');

test('Subphase 4.2.1: IncidentEngine imports and 8 Outage Category Constants', () => {
  assert.equal(typeof IncidentEngine, 'function');
  assert.equal(INCIDENT_CATEGORIES.length, 8);
  assert.deepEqual(INCIDENT_CATEGORIES, [
    CATEGORY_WEBSITE_DOWN,
    CATEGORY_POD_RESTARTING,
    CATEGORY_SLOW_APP,
    CATEGORY_DNS_OUTAGE,
    CATEGORY_IAM_OUTAGE,
    CATEGORY_STORAGE_OUTAGE,
    CATEGORY_NETWORKING_OUTAGE,
    CATEGORY_NODE_OUTAGE
  ]);

  for (const cat of INCIDENT_CATEGORIES) {
    const meta = INCIDENT_CATEGORY_METADATA[cat];
    assert.ok(meta, `Category ${cat} should have metadata`);
    assert.equal(meta.id, cat);
    assert.ok(meta.name.length > 0);
    assert.ok(meta.description.length > 0);
  }
});

test('Subphase 4.2.1: All 15 production incidents mapped to 8 outage classes with zero unassigned', () => {
  const engine = new IncidentEngine();
  assert.equal(engine.scenarios.length, 15);

  const categoryCounts = {};
  for (const inc of engine.scenarios) {
    assert.ok(inc.id, 'Scenario must have an id');
    assert.ok(inc.title, 'Scenario must have a title');
    assert.ok(inc.category, `Scenario ${inc.id} must have a category`);
    assert.ok(
      INCIDENT_CATEGORIES.includes(inc.category),
      `Scenario ${inc.id} has invalid category ${inc.category}`
    );
    categoryCounts[inc.category] = (categoryCounts[inc.category] || 0) + 1;
  }

  // Verify all 8 categories are represented
  for (const cat of INCIDENT_CATEGORIES) {
    assert.ok(
      (categoryCounts[cat] || 0) >= 1,
      `Category "${cat}" must have at least 1 incident scenario assigned`
    );
  }

  const categoryList = engine.getIncidentCategories();
  assert.equal(categoryList.length, 8);
  for (const catItem of categoryList) {
    assert.ok(catItem.count >= 1);
    assert.equal(catItem.count, categoryCounts[catItem.id]);
  }
});

test('Subphase 4.2.1: Incident filtering, category retrieval, and MTTR Stopwatch lifecycle', async () => {
  const engine = new IncidentEngine();

  // 1. List all incidents
  const allSummaries = engine.listIncidents();
  assert.equal(allSummaries.length, 15);

  // 2. Filter by category
  const webDownIncidents = engine.listIncidents(CATEGORY_WEBSITE_DOWN);
  assert.equal(webDownIncidents.length, 3);
  assert.ok(webDownIncidents.every((i) => i.category === CATEGORY_WEBSITE_DOWN));

  // 3. Case-insensitive category filtering with constant string format
  const filteredCaseInsensitive = engine.listIncidents('CATEGORY_DNS_OUTAGE');
  assert.equal(filteredCaseInsensitive.length, 1);
  assert.equal(filteredCaseInsensitive[0].id, 'inc-11-coredns-loop-crash');

  // 4. getIncidentsByCategory
  const nodeIncidents = engine.getIncidentsByCategory(CATEGORY_NODE_OUTAGE);
  assert.equal(nodeIncidents.length, 3);
  assert.ok(nodeIncidents.some((i) => i.id === 'inc-09-etcd-quorum-loss'));
  assert.ok(nodeIncidents.some((i) => i.id === 'inc-15-node-notready-kubelet-down'));

  // 5. Stopwatch lifecycle
  const swStart = engine.startStopwatch('inc-01-selector-blackhole');
  assert.equal(swStart.incidentId, 'inc-01-selector-blackhole');
  assert.equal(swStart.active, true);

  const swStatus = engine.getStopwatch('inc-01-selector-blackhole');
  assert.equal(swStatus.active, true);
  assert.ok(typeof swStatus.elapsedFormatted === 'string');

  const swStop = engine.stopStopwatch('inc-01-selector-blackhole');
  assert.equal(swStop.incidentId, 'inc-01-selector-blackhole');
  assert.equal(swStop.achievedMttr, true);
  assert.ok(swStop.elapsedMs >= 0);
});

test('Subphase 4.2.1: Authentic etcd Quorum Loss remediation (inc-09-etcd-quorum-loss)', () => {
  const validationEngine = new ValidationEngine();
  const engine = new IncidentEngine(validationEngine);
  const cluster = new VirtualCluster();
  const vfs = new VirtualFileSystem();

  const inc = engine.injectIncident('inc-09-etcd-quorum-loss', cluster, vfs);
  assert.equal(inc.id, 'inc-09-etcd-quorum-loss');

  // Verify initial VFS state has snapshot backup and static pod manifests
  assert.equal(vfs.exists('/backup/etcd-snapshot.db'), true);
  assert.equal(vfs.exists('/etc/kubernetes/manifests/etcd.yaml'), true);
  const snapshotData = vfs.readFile('/backup/etcd-snapshot.db');
  assert.ok(snapshotData.includes('ETCD-SNAPSHOT'));

  const terminal = new TerminalEngine(cluster, vfs);

  // Before solution: must fail
  const initialCheck = engine.verifyIncidentResolution('inc-09-etcd-quorum-loss', cluster, terminal.commandHistory, vfs);
  assert.equal(initialCheck.passed, false);

  // Execute canonical recovery command
  for (const cmd of inc.solutionCommands) {
    const res = terminal.execute(cmd);
    assert.equal(res.exitCode, 0, `Command ${cmd} failed: ${res.output}`);
  }

  // After solution: must pass
  const finalCheck = engine.verifyIncidentResolution('inc-09-etcd-quorum-loss', cluster, terminal.commandHistory, vfs);
  assert.equal(finalCheck.passed, true);
  assert.equal(finalCheck.stopwatch.achievedMttr, true);
});

test('Subphase 4.1.2: Deterministic Outage Resolution Proof across ALL 15 Production Incidents', () => {
  const validationEngine = new ValidationEngine();
  const engine = new IncidentEngine(validationEngine);

  assert.equal(engine.scenarios.length, 15);

  for (const inc of engine.scenarios) {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    cluster.vfs = vfs;

    // Inject incident fault into cluster & VFS
    engine.injectIncident(inc.id, cluster, vfs);
    const terminal = new TerminalEngine(cluster, vfs);

    // Initial check: MUST fail
    const before = engine.verifyIncidentResolution(inc.id, cluster, [], vfs);
    assert.equal(
      before.passed,
      false,
      `Incident ${inc.id} (${inc.category}) should fail validation before remediation`
    );

    // Execute canonical remediation commands
    for (const cmd of inc.solutionCommands) {
      const res = terminal.execute(cmd);
      assert.equal(
        res.exitCode,
        0,
        `Remediation command "${cmd}" for incident ${inc.id} failed: ${res.output}`
      );
    }

    // Post-remediation check: MUST pass 100%
    const after = engine.verifyIncidentResolution(inc.id, cluster, terminal.commandHistory, vfs);
    assert.equal(
      after.passed,
      true,
      `Incident ${inc.id} failed recovery verification: ${JSON.stringify(after.results)}`
    );
    assert.equal(after.score, 100);
    assert.ok(after.xpReward > 0);
    assert.ok(after.stopwatch);
    assert.equal(after.stopwatch.achievedMttr, true);
    assert.ok(typeof after.stopwatch.elapsedFormatted === 'string');
  }
});

test('Subphase 4.1.2: SessionManager.bindIncident integration with VFS injection and cluster isolation', () => {
  const sessionManager = new SessionManager();
  const session = sessionManager.getSession('incident-test-session');
  const engine = new IncidentEngine();

  const incident = engine.getIncident('inc-09-etcd-quorum-loss');
  assert.ok(incident);

  const bound = sessionManager.bindIncident(session.sessionId, incident, engine);
  assert.equal(bound.activeIncidentId, 'inc-09-etcd-quorum-loss');
  assert.equal(session.activeIncidentId, 'inc-09-etcd-quorum-loss');
  assert.equal(session.activeContextType, 'incident');

  // Verify that session.vfs was populated with snapshot and static pod manifests
  assert.equal(session.vfs.exists('/backup/etcd-snapshot.db'), true);
  assert.equal(session.vfs.exists('/etc/kubernetes/manifests/etcd.yaml'), true);

  // Execute remediation in session terminal
  for (const cmd of incident.solutionCommands) {
    const res = session.terminal.execute(cmd);
    assert.equal(res.exitCode, 0);
  }

  // Verify resolution
  const res = engine.verifyIncidentResolution(incident.id, session.cluster, session.terminal.commandHistory, session.vfs);
  assert.equal(res.passed, true);
});

