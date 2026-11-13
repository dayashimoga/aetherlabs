'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  StorageAdapter,
  VectorClock,
  HybridLogicalClock,
  CRDTStateMerger,
  IndexedDbOpfsEngine,
  SqliteStorageEngine,
  MemoryStorageEngine
} = require('../src/db/storageAdapter');

test('Subphase 1.1.1: VectorClock causality comparison and merging', () => {
  const clockA = new VectorClock({ 'node-desktop': 2 });
  const clockB = new VectorClock({ 'node-desktop': 2 });

  // Equal
  assert.equal(clockA.compare(clockB), 'EQUAL');

  // Dominates
  clockA.increment('node-desktop');
  assert.equal(clockA.compare(clockB), 'DOMINATES');
  assert.equal(clockB.compare(clockA), 'DOMINATED_BY');

  // Concurrent (branching)
  clockB.increment('node-mobile');
  assert.equal(clockA.compare(clockB), 'CONCURRENT');

  // Merge
  clockA.merge(clockB);
  assert.equal(clockA.get('node-desktop'), 3);
  assert.equal(clockA.get('node-mobile'), 1);
  assert.equal(clockA.compare(clockB), 'DOMINATES');
});

test('Subphase 1.1.1: CRDTStateMerger deterministic entity resolution', () => {
  // Completed always wins over in_progress
  const localLab = {
    lab_id: 'lab-k8s-01',
    domain_id: 'kubernetes-core',
    status: 'in_progress',
    score: 60,
    attempts: 2
  };
  const remoteLab = {
    lab_id: 'lab-k8s-01',
    domain_id: 'kubernetes-core',
    status: 'completed',
    score: 100,
    attempts: 1,
    completed_at: '2026-11-12T10:00:00.000Z',
    verification_hash: 'vh-verified-1234'
  };

  const mergedLab = CRDTStateMerger.mergeLabRecord(localLab, remoteLab);
  assert.equal(mergedLab.status, 'completed');
  assert.equal(mergedLab.score, 100);
  assert.equal(mergedLab.attempts, 2);
  assert.equal(mergedLab.verification_hash, 'vh-verified-1234');

  // Incident: Resolved wins and preserves best MTTR
  const localInc = {
    incident_id: 'inc-01-selector-blackhole',
    status: 'resolved',
    mttr_seconds: 140,
    hints_used: 1
  };
  const remoteInc = {
    incident_id: 'inc-01-selector-blackhole',
    status: 'resolved',
    mttr_seconds: 95,
    hints_used: 0
  };
  const mergedInc = CRDTStateMerger.mergeIncidentRecord(localInc, remoteInc);
  assert.equal(mergedInc.status, 'resolved');
  assert.equal(mergedInc.mttr_seconds, 95);
  assert.equal(mergedInc.hints_used, 0);
});

test('Subphase 1.1.1: StorageAdapter SQLite mode with WAL, snapshots, and vector clocks', () => {
  const adapter = new StorageAdapter({
    nodeId: 'desktop-primary',
    dbFilePath: ':memory:',
    storageType: 'sqlite'
  });

  const profile = adapter.getProfile();
  assert.equal(profile.profile.id, 'default-learner');
  assert.equal(profile.profile.xp, 0);

  // Record lab attempt
  const lab = adapter.recordLabAttempt({
    labId: 'lab-linux-01',
    domainId: 'linux-fundamentals',
    passed: true,
    score: 100,
    xpReward: 150
  });
  assert.equal(lab.status, 'completed');
  assert.equal(lab.score, 100);

  // Check updated vector clock & profile XP
  const updatedProfile = adapter.getProfile();
  assert.equal(updatedProfile.profile.xp, 150);
  assert.ok(adapter.getVectorClock().get('desktop-primary') >= 1);

  // Save and retrieve session snapshot
  adapter.saveSessionSnapshot({
    sessionId: 'session-alpha',
    clusterSnapshot: { resources: [{ kind: 'Pod', metadata: { name: 'test-pod' } }] },
    vfsSnapshot: { '/etc/hosts': '127.0.0.1 localhost' },
    activeLabId: 'lab-linux-01'
  });

  const snapshot = adapter.getSessionSnapshot('session-alpha');
  assert.ok(snapshot);
  assert.equal(snapshot.activeLabId, 'lab-linux-01');
  assert.equal(snapshot.clusterSnapshot.resources[0].metadata.name, 'test-pod');

  adapter.close();
});

test('Subphase 1.1.1: Bi-directional CRDT sync between Desktop and Mobile offline nodes', () => {
  const desktop = new StorageAdapter({ nodeId: 'desktop-node', storageType: 'sqlite', dbFilePath: ':memory:' });
  const mobile = new StorageAdapter({ nodeId: 'mobile-node', storageType: 'memory' });

  // 1. Desktop solves lab-01
  desktop.recordLabAttempt({
    labId: 'lab-k8s-01',
    domainId: 'kubernetes-core',
    passed: true,
    score: 100,
    xpReward: 150
  });

  // 2. Mobile (offline) solves lab-02
  mobile.recordLabAttempt({
    labId: 'lab-sec-01',
    domainId: 'devsecops-security',
    passed: true,
    score: 100,
    xpReward: 150
  });

  // Clocks before sync
  assert.equal(desktop.getVectorClock().get('mobile-node'), 0);
  assert.equal(mobile.getVectorClock().get('desktop-node'), 0);

  // 3. Mobile syncs to Desktop
  const mobilePayload = mobile.generateSyncPayload();
  const desktopMergeResult = desktop.mergeSyncPayload(mobilePayload);
  assert.equal(desktopMergeResult.synced, true);
  assert.equal(desktop.getProfile().completedLabs.length, 2);
  assert.equal(desktop.getProfile().profile.xp, 300);

  // 4. Desktop syncs back to Mobile
  const desktopPayload = desktop.generateSyncPayload();
  const mobileMergeResult = mobile.mergeSyncPayload(desktopPayload);
  assert.equal(mobileMergeResult.synced, true);
  assert.equal(mobile.getProfile().completedLabs.length, 2);
  assert.equal(mobile.getProfile().profile.xp, 300);

  // Clocks converged
  assert.ok(desktop.getVectorClock().get('desktop-node') >= 1);
  assert.ok(desktop.getVectorClock().get('mobile-node') >= 1);
  assert.ok(mobile.getVectorClock().get('desktop-node') >= 1);
  assert.ok(mobile.getVectorClock().get('mobile-node') >= 1);

  desktop.close();
  mobile.close();
});

test('Subphase 1.1.3: HybridLogicalClock (HLC) monotonicity, causality preservation, and total ordering', () => {
  const clockA = new HybridLogicalClock({ nodeId: 'node-a', l: 1000, c: 0 });
  const clockB = new HybridLogicalClock({ nodeId: 'node-b', l: 1000, c: 0 });

  // Same physical time and counter -> tie broken deterministically by nodeId
  assert.equal(clockA.compare(clockB), -1); // 'node-a' < 'node-b'
  assert.equal(clockB.compare(clockA), 1);
  assert.ok(clockA.isBefore(clockB));
  assert.ok(clockB.isAfter(clockA));

  // Ticking within same physical millisecond increments logical counter c
  clockA.now(1000);
  assert.equal(clockA.l, 1000);
  assert.equal(clockA.c, 1);
  assert.ok(clockA.isAfter(clockB));

  // Advance physical time -> resets logical counter to 0
  clockA.now(1005);
  assert.equal(clockA.l, 1005);
  assert.equal(clockA.c, 0);

  // Receiving a message from future HLC
  clockB.now(1010);
  clockB.now(1010);
  assert.equal(clockB.l, 1010);
  assert.equal(clockB.c, 1);

  // clockA updates on receiving clockB while local physical clock is 1008
  clockA.update(clockB, 1008);
  assert.equal(clockA.l, 1010);
  assert.equal(clockA.c, 2); // Preserves causality: c = c_remote + 1
  assert.ok(clockA.isAfter(clockB));

  // Serialization round-trip
  const str = clockA.toString();
  const parsed = HybridLogicalClock.fromString(str);
  assert.equal(parsed.l, clockA.l);
  assert.equal(parsed.c, clockA.c);
  assert.equal(parsed.nodeId, clockA.nodeId);
  assert.equal(clockA.compare(parsed), 0);

  const json = clockA.toJSON();
  const fromJson = HybridLogicalClock.fromJSON(json);
  assert.equal(fromJson.l, clockA.l);
  assert.equal(fromJson.c, clockA.c);
  assert.equal(fromJson.nodeId, clockA.nodeId);
});

test('Subphase 1.1.3: IndexedDbOpfsEngine and OPFS snapshot persistence', async () => {
  const browserNode = new StorageAdapter({
    nodeId: 'browser-pwa-01',
    storageType: 'indexeddb'
  });

  assert.equal(browserNode.storageType, 'indexeddb');
  assert.ok(browserNode.engine instanceof IndexedDbOpfsEngine);

  // Record lab attempt in IndexedDB engine
  const lab = browserNode.recordLabAttempt({
    labId: 'lab-pwa-01',
    domainId: 'progressive-web-apps',
    passed: true,
    score: 100,
    xpReward: 200
  });
  assert.equal(lab.status, 'completed');
  assert.equal(lab.score, 100);
  assert.ok(lab.hlc_timestamp);

  // Save session snapshot
  browserNode.saveSessionSnapshot({
    sessionId: 'session-browser-01',
    clusterSnapshot: { pods: 3 },
    vfsSnapshot: { '/etc/hosts': '127.0.0.1' },
    activeLabId: 'lab-pwa-01'
  });

  const snap = browserNode.getSessionSnapshot('session-browser-01');
  assert.ok(snap);
  assert.equal(snap.activeLabId, 'lab-pwa-01');
  assert.equal(snap.clusterSnapshot.pods, 3);
  assert.ok(snap.hlcTimestamp);

  // OPFS snapshot operations
  const opfsPayload = JSON.stringify({ clusterNodes: ['master', 'worker-1'], time: Date.now() });
  const writeOk = await browserNode.saveSnapshotOPFS('cluster-backup.json', opfsPayload);
  assert.equal(writeOk, true);

  const list = await browserNode.listSnapshotsOPFS();
  assert.ok(list.includes('cluster-backup.json'));

  const readBack = await browserNode.loadSnapshotOPFS('cluster-backup.json');
  assert.equal(readBack, opfsPayload);

  const delOk = await browserNode.deleteSnapshotOPFS('cluster-backup.json');
  assert.equal(delOk, true);

  const listAfterDel = await browserNode.listSnapshotsOPFS();
  assert.ok(!listAfterDel.includes('cluster-backup.json'));

  browserNode.close();
});

test('Subphase 1.1.3: Multi-platform CRDT + HLC synchronization (SQLite WAL + IndexedDB/OPFS + Memory)', () => {
  // 3 heterogeneous nodes simulating Desktop (SQLite), Mobile (IndexedDB/OPFS), and Worker (Memory)
  const desktop = new StorageAdapter({ nodeId: 'node-desktop', storageType: 'sqlite', dbFilePath: ':memory:' });
  const mobile = new StorageAdapter({ nodeId: 'node-mobile', storageType: 'indexeddb' });
  const worker = new StorageAdapter({ nodeId: 'node-worker', storageType: 'memory' });

  // 1. Desktop solves lab 1
  desktop.recordLabAttempt({
    labId: 'lab-k8s-01',
    domainId: 'kubernetes-core',
    passed: true,
    score: 100,
    xpReward: 150
  });

  // 2. Mobile solves lab 2 offline
  mobile.recordLabAttempt({
    labId: 'lab-sre-01',
    domainId: 'site-reliability-engineering',
    passed: true,
    score: 95,
    xpReward: 150
  });

  // 3. Worker solves lab 3
  worker.recordLabAttempt({
    labId: 'lab-sec-01',
    domainId: 'devsecops-security',
    passed: true,
    score: 100,
    xpReward: 150
  });

  // Verify protocolVersion is crdt-v2-hlc and carries HLC
  const mobilePayload = mobile.generateSyncPayload();
  assert.equal(mobilePayload.protocolVersion, 'crdt-v2-hlc');
  assert.ok(mobilePayload.hlc);
  assert.ok(mobilePayload.hlcString);

  // Sync Mobile -> Desktop
  desktop.mergeSyncPayload(mobilePayload);
  assert.equal(desktop.getProfile().completedLabs.length, 2);

  // Sync Worker -> Desktop
  const workerPayload = worker.generateSyncPayload();
  desktop.mergeSyncPayload(workerPayload);
  assert.equal(desktop.getProfile().completedLabs.length, 3);
  assert.equal(desktop.getProfile().profile.xp, 450);

  // Sync Desktop full converged state back to Mobile and Worker
  const desktopPayload = desktop.generateSyncPayload();
  mobile.mergeSyncPayload(desktopPayload);
  worker.mergeSyncPayload(desktopPayload);

  // Full convergence across all 3 heterogeneous platforms
  assert.equal(mobile.getProfile().completedLabs.length, 3);
  assert.equal(mobile.getProfile().profile.xp, 450);

  assert.equal(worker.getProfile().completedLabs.length, 3);
  assert.equal(worker.getProfile().profile.xp, 450);

  // Verify HLC monotonic progression
  const desktopHlc = desktop.getHlc();
  assert.ok(desktopHlc.l > 0);
  assert.ok(desktopHlc.c >= 0);

  desktop.close();
  mobile.close();
  worker.close();
});

test('Subphase 1.1.3: Deterministic LWW conflict resolution using HLC on concurrent edits', () => {
  const clockEarly = new HybridLogicalClock({ nodeId: 'node-a', l: 1000, c: 0 });
  const clockLate = new HybridLogicalClock({ nodeId: 'node-b', l: 2000, c: 0 });

  const recordA = {
    lab_id: 'lab-k8s-02',
    domain_id: 'kubernetes-core',
    status: 'completed',
    score: 80,
    attempts: 1,
    hlc_timestamp: clockEarly.toString()
  };

  const recordB = {
    lab_id: 'lab-k8s-02',
    domain_id: 'kubernetes-core',
    status: 'completed',
    score: 80, // Same score and status
    attempts: 2,
    hlc_timestamp: clockLate.toString() // Later HLC timestamp
  };

  // When status and score are tied, the later HLC timestamp wins
  const merged1 = CRDTStateMerger.mergeLabRecord(recordA, recordB);
  assert.equal(merged1.status, 'completed');
  assert.equal(merged1.score, 80);
  assert.equal(merged1.attempts, 2);
  assert.equal(merged1.hlc_timestamp, clockLate.toString());

  // Symmetry: order of arguments does not affect the deterministic outcome
  const merged2 = CRDTStateMerger.mergeLabRecord(recordB, recordA);
  assert.deepEqual(merged1, merged2);
});


