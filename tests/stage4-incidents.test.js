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

const { VirtualCluster } = require('../src/engine/virtualCluster');
const { TerminalEngine } = require('../src/engine/terminalEngine');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ValidationEngine } = require('../src/core/validationEngine');

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

test('Subphase 4.2.1: Outage resolution proof across all 8 incident categories', () => {
  const validationEngine = new ValidationEngine();
  const engine = new IncidentEngine(validationEngine);

  // One representative scenario for each of the 8 outage categories
  const testMatrix = [
    { category: CATEGORY_WEBSITE_DOWN, id: 'inc-01-selector-blackhole' },
    { category: CATEGORY_POD_RESTARTING, id: 'inc-02-bad-image-rollout' },
    { category: CATEGORY_SLOW_APP, id: 'inc-13-slow-app-cpu-throttling' },
    { category: CATEGORY_DNS_OUTAGE, id: 'inc-11-coredns-loop-crash' },
    { category: CATEGORY_IAM_OUTAGE, id: 'inc-14-iam-irsa-access-denied' },
    { category: CATEGORY_STORAGE_OUTAGE, id: 'inc-12-pvc-storageclass-pending' },
    { category: CATEGORY_NETWORKING_OUTAGE, id: 'inc-08-zero-trust-db-exposure' },
    { category: CATEGORY_NODE_OUTAGE, id: 'inc-15-node-notready-kubelet-down' }
  ];

  for (const { category, id } of testMatrix) {
    const cluster = new VirtualCluster();
    const inc = engine.injectIncident(id, cluster);
    assert.equal(inc.category, category, `Incident ${id} should be category ${category}`);

    const terminal = new TerminalEngine(cluster);

    const before = engine.verifyIncidentResolution(id, cluster, []);
    assert.equal(before.passed, false, `Incident ${id} (${category}) should fail before remediation`);

    for (const cmd of inc.solutionCommands) {
      const res = terminal.execute(cmd);
      assert.equal(res.exitCode, 0, `Command "${cmd}" for incident ${id} failed: ${res.output}`);
    }

    const after = engine.verifyIncidentResolution(id, cluster, terminal.commandHistory);
    assert.equal(after.passed, true, `Incident ${id} (${category}) failed recovery verification: ${JSON.stringify(after.results)}`);
    assert.ok(after.xpReward > 0);
  }
});
