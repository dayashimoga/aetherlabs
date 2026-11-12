'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StorageAdapter, VectorClock, CRDTStateMerger } = require('../src/db/storageAdapter');

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

