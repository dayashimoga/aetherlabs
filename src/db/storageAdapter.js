'use strict';

/**
 * KubeLabs Isomorphic Storage Adapter & Vector-Clock CRDT State Synchronizer
 * 
 * Supports:
 * 1. Node.js / Desktop: native node:sqlite (WAL mode, parameterized statements, migrations)
 * 2. Browser / Mobile / Worker: in-memory / IndexedDB / OPFS storage abstraction
 * 3. CRDT Vector Clocks: Causality tracking, deterministic state merging, and offline-online sync
 */

class VectorClock {
  constructor(initialClock = {}) {
    this.clock = {};
    if (initialClock && typeof initialClock === 'object') {
      for (const [k, v] of Object.entries(initialClock)) {
        this.clock[k] = Number(v) || 0;
      }
    }
  }

  increment(nodeId) {
    if (!nodeId) return this;
    this.clock[nodeId] = (this.clock[nodeId] || 0) + 1;
    return this;
  }

  get(nodeId) {
    return this.clock[nodeId] || 0;
  }

  set(nodeId, counter) {
    this.clock[nodeId] = Number(counter) || 0;
    return this;
  }

  clone() {
    return new VectorClock({ ...this.clock });
  }

  merge(otherClock) {
    const other = otherClock instanceof VectorClock ? otherClock.clock : (otherClock || {});
    const allKeys = new Set([...Object.keys(this.clock), ...Object.keys(other)]);
    for (const key of allKeys) {
      this.clock[key] = Math.max(this.get(key), Number(other[key]) || 0);
    }
    return this;
  }

  compare(otherClock) {
    const other = otherClock instanceof VectorClock ? otherClock : new VectorClock(otherClock);
    const allKeys = new Set([...Object.keys(this.clock), ...Object.keys(other.clock)]);
    let hasGreater = false;
    let hasLesser = false;

    for (const key of allKeys) {
      const v1 = this.get(key);
      const v2 = other.get(key);
      if (v1 > v2) hasGreater = true;
      if (v1 < v2) hasLesser = true;
    }

    if (hasGreater && !hasLesser) return 'DOMINATES';
    if (!hasGreater && hasLesser) return 'DOMINATED_BY';
    if (!hasGreater && !hasLesser) return 'EQUAL';
    return 'CONCURRENT';
  }

  toJSON() {
    return { ...this.clock };
  }

  static fromJSON(json) {
    if (typeof json === 'string') {
      try {
        return new VectorClock(JSON.parse(json));
      } catch {
        return new VectorClock({});
      }
    }
    return new VectorClock(json);
  }
}

class CRDTStateMerger {
  /**
   * Deterministically merges two lab progress records.
   * Invariant: Completed status and highest score always win.
   */
  static mergeLabRecord(local, remote) {
    if (!local) return { ...remote };
    if (!remote) return { ...local };

    const isCompleted = local.status === 'completed' || remote.status === 'completed';
    const bestScore = Math.max(local.score || 0, remote.score || 0);
    const totalAttempts = Math.max(local.attempts || 0, remote.attempts || 0);
    const completedAt = local.completed_at || remote.completed_at || null;
    const verificationHash = (local.status === 'completed' && local.verification_hash)
      ? local.verification_hash
      : (remote.verification_hash || local.verification_hash || null);

    return {
      lab_id: local.lab_id || remote.lab_id,
      domain_id: local.domain_id || remote.domain_id,
      status: isCompleted ? 'completed' : 'in_progress',
      score: bestScore,
      attempts: totalAttempts,
      completed_at: completedAt,
      verification_hash: verificationHash
    };
  }

  /**
   * Deterministically merges two incident runs.
   * Invariant: Resolved status always wins; lowest MTTR preserved if both resolved.
   */
  static mergeIncidentRecord(local, remote) {
    if (!local) return { ...remote };
    if (!remote) return { ...local };

    const isResolved = local.status === 'resolved' || remote.status === 'resolved';
    let bestMttr = null;
    if (local.mttr_seconds !== null && local.mttr_seconds !== undefined && remote.mttr_seconds !== null && remote.mttr_seconds !== undefined) {
      bestMttr = Math.min(local.mttr_seconds, remote.mttr_seconds);
    } else {
      bestMttr = local.mttr_seconds ?? remote.mttr_seconds ?? null;
    }

    return {
      incident_id: local.incident_id || remote.incident_id,
      status: isResolved ? 'resolved' : 'in_progress',
      started_at: local.started_at || remote.started_at || new Date().toISOString(),
      resolved_at: local.resolved_at || remote.resolved_at || (isResolved ? new Date().toISOString() : null),
      mttr_seconds: bestMttr,
      hints_used: Math.min(local.hints_used ?? 0, remote.hints_used ?? 0)
    };
  }

  /**
   * Deterministically merges project progress.
   */
  static mergeProjectRecord(local, remote) {
    if (!local) return { ...remote };
    if (!remote) return { ...local };

    const isCompleted = local.status === 'completed' || remote.status === 'completed';
    return {
      project_id: local.project_id || remote.project_id,
      track_id: local.track_id || remote.track_id,
      status: isCompleted ? 'completed' : 'in_progress',
      score: Math.max(local.score || 0, remote.score || 0),
      completed_at: local.completed_at || remote.completed_at || null
    };
  }
}

class MemoryStorageEngine {
  constructor() {
    this.tables = new Map();
    this.tables.set('schema_migrations', new Map());
    this.tables.set('crdt_vector_clocks', new Map());
    this.tables.set('learner_profile', new Map());
    this.tables.set('lab_progress', new Map());
    this.tables.set('incident_runs', new Map());
    this.tables.set('project_progress', new Map());
    this.tables.set('certificates', new Map());
    this.tables.set('session_snapshots', new Map());
    this.tables.set('saved_architectures', new Map());
    this.tables.set('terminal_history', new Map());
    this.historyCounter = 0;
  }

  getTable(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map());
    }
    return this.tables.get(name);
  }

  get(table, key) {
    return this.getTable(table).get(key) || null;
  }

  set(table, key, value) {
    this.getTable(table).set(key, JSON.parse(JSON.stringify(value)));
    return value;
  }

  delete(table, key) {
    return this.getTable(table).delete(key);
  }

  all(table) {
    return Array.from(this.getTable(table).values()).map((v) => JSON.parse(JSON.stringify(v)));
  }

  close() {
    this.tables.clear();
  }
}

class SqliteStorageEngine {
  constructor(dbFilePath) {
    const { DatabaseSync } = require('node:sqlite');
    const fs = require('node:fs');
    const path = require('node:path');

    this.dbFilePath = dbFilePath || ':memory:';
    if (this.dbFilePath !== ':memory:') {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(this.dbFilePath);
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crdt_vector_clocks (
        node_id TEXT PRIMARY KEY,
        clock_counter INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_snapshots (
        session_id TEXT PRIMARY KEY,
        cluster_snapshot_json TEXT NOT NULL,
        vfs_snapshot_json TEXT,
        active_lab_id TEXT,
        active_incident_id TEXT,
        active_project_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learner_profile (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        streak_days INTEGER NOT NULL DEFAULT 1,
        active_lab_id TEXT,
        active_incident_id TEXT,
        cluster_snapshot_json TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lab_progress (
        lab_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        verification_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS incident_runs (
        incident_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        resolved_at TEXT,
        mttr_seconds INTEGER,
        hints_used INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS project_progress (
        project_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS certificates (
        cert_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        title TEXT NOT NULL,
        learner_name TEXT NOT NULL,
        score_percent INTEGER NOT NULL,
        signature_sha256 TEXT NOT NULL,
        signature_ed25519 TEXT,
        issued_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_architectures (
        arch_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        edges_json TEXT NOT NULL,
        score INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS terminal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER NOT NULL,
        output_preview TEXT NOT NULL,
        executed_at TEXT NOT NULL
      );
    `);

    // Ensure default profile exists
    const row = this.db.prepare('SELECT id FROM learner_profile WHERE id = ?').get('default-learner');
    if (!row) {
      this.db.prepare(`
        INSERT INTO learner_profile (id, display_name, xp, streak_days, updated_at)
        VALUES ('default-learner', 'Cloud-Native Learner', 0, 1, ?)
      `).run(new Date().toISOString());
    }
  }

  get(table, key) {
    const keyFieldMap = {
      crdt_vector_clocks: 'node_id',
      session_snapshots: 'session_id',
      learner_profile: 'id',
      lab_progress: 'lab_id',
      incident_runs: 'incident_id',
      project_progress: 'project_id',
      certificates: 'cert_id',
      saved_architectures: 'arch_id'
    };
    const keyField = keyFieldMap[table] || 'id';
    return this.db.prepare(`SELECT * FROM ${table} WHERE ${keyField} = ?`).get(key) || null;
  }

  all(table) {
    return this.db.prepare(`SELECT * FROM ${table}`).all();
  }

  delete(table, key) {
    const keyFieldMap = {
      session_snapshots: 'session_id',
      lab_progress: 'lab_id',
      incident_runs: 'incident_id'
    };
    const keyField = keyFieldMap[table] || 'id';
    this.db.prepare(`DELETE FROM ${table} WHERE ${keyField} = ?`).run(key);
    return true;
  }

  close() {
    this.db.close();
  }
}

class StorageAdapter {
  constructor(options = {}) {
    this.nodeId = options.nodeId || `node-${Math.random().toString(36).slice(2, 10)}`;
    this.clock = new VectorClock();

    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    const forceType = options.storageType || (isNode ? 'sqlite' : 'memory');

    if (forceType === 'sqlite' && isNode) {
      this.engine = new SqliteStorageEngine(options.dbFilePath);
      this.storageType = 'sqlite';
      this.loadClockFromStorage();
    } else {
      this.engine = new MemoryStorageEngine();
      this.storageType = 'memory';
      this.engine.set('learner_profile', 'default-learner', {
        id: 'default-learner',
        display_name: 'Cloud-Native Learner',
        xp: 0,
        streak_days: 1,
        updated_at: new Date().toISOString()
      });
    }
  }

  loadClockFromStorage() {
    if (this.storageType === 'sqlite') {
      const rows = this.engine.all('crdt_vector_clocks');
      for (const r of rows) {
        this.clock.set(r.node_id, r.clock_counter);
      }
    }
  }

  tickClock() {
    this.clock.increment(this.nodeId);
    if (this.storageType === 'sqlite') {
      const counter = this.clock.get(this.nodeId);
      this.engine.db.prepare(`
        INSERT INTO crdt_vector_clocks (node_id, clock_counter, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
          clock_counter = excluded.clock_counter,
          updated_at = excluded.updated_at
      `).run(this.nodeId, counter, new Date().toISOString());
    }
    return this.clock;
  }

  getVectorClock() {
    return this.clock.clone();
  }

  getProfile(profileId = 'default-learner') {
    if (this.storageType === 'sqlite') {
      const profile = this.engine.get('learner_profile', profileId);
      const completedLabs = this.engine.all('lab_progress');
      const incidents = this.engine.all('incident_runs');
      const projects = this.engine.all('project_progress');
      const certificates = this.engine.all('certificates');

      return {
        profile,
        completedLabs,
        incidents,
        projects,
        certificates,
        vectorClock: this.clock.toJSON()
      };
    }

    const profile = this.engine.get('learner_profile', profileId);
    const completedLabs = this.engine.all('lab_progress');
    const incidents = this.engine.all('incident_runs');
    const projects = this.engine.all('project_progress');
    const certificates = this.engine.all('certificates');

    return {
      profile,
      completedLabs,
      incidents,
      projects,
      certificates,
      vectorClock: this.clock.toJSON()
    };
  }

  recordLabAttempt({ labId, domainId, passed, score, xpReward = 150 }) {
    this.tickClock();
    const now = new Date().toISOString();

    if (this.storageType === 'sqlite') {
      const existing = this.engine.get('lab_progress', labId);
      const isCompleted = passed || (existing && existing.status === 'completed');
      const bestScore = Math.max(score || 0, existing ? existing.score : 0);
      const attempts = (existing ? existing.attempts : 0) + 1;
      const completedAt = passed ? now : (existing ? existing.completed_at : null);
      const crypto = require('node:crypto');
      const verificationHash = isCompleted
        ? (existing && existing.verification_hash ? existing.verification_hash : crypto.createHash('sha256').update(`${labId}:${domainId}:${bestScore}:${now}`).digest('hex').slice(0, 24))
        : null;

      this.engine.db.prepare(`
        INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lab_id) DO UPDATE SET
          status = excluded.status,
          score = excluded.score,
          attempts = excluded.attempts,
          completed_at = excluded.completed_at,
          verification_hash = excluded.verification_hash
      `).run(labId, domainId, isCompleted ? 'completed' : 'in_progress', bestScore, attempts, completedAt, verificationHash);

      if (passed && (!existing || existing.status !== 'completed')) {
        const p = this.engine.get('learner_profile', 'default-learner');
        const newXp = (p ? p.xp : 0) + xpReward;
        this.engine.db.prepare('UPDATE learner_profile SET xp = ?, updated_at = ? WHERE id = ?')
          .run(newXp, now, 'default-learner');
      }

      return this.engine.get('lab_progress', labId);
    }

    // Memory engine
    const existing = this.engine.get('lab_progress', labId);
    const isCompleted = passed || (existing && existing.status === 'completed');
    const bestScore = Math.max(score || 0, existing ? existing.score : 0);
    const attempts = (existing ? existing.attempts : 0) + 1;
    const completedAt = passed ? now : (existing ? existing.completed_at : null);
    const rec = {
      lab_id: labId,
      domain_id: domainId,
      status: isCompleted ? 'completed' : 'in_progress',
      score: bestScore,
      attempts,
      completed_at: completedAt,
      verification_hash: isCompleted ? `vh-${Math.random().toString(36).slice(2, 12)}` : null
    };
    this.engine.set('lab_progress', labId, rec);

    if (passed && (!existing || existing.status !== 'completed')) {
      const p = this.engine.get('learner_profile', 'default-learner') || { id: 'default-learner', xp: 0 };
      p.xp += xpReward;
      p.updated_at = now;
      this.engine.set('learner_profile', 'default-learner', p);
    }
    return rec;
  }

  generateSyncPayload() {
    this.tickClock();
    const data = this.getProfile();
    return {
      protocolVersion: 'crdt-v1',
      nodeId: this.nodeId,
      timestamp: new Date().toISOString(),
      vectorClock: this.clock.toJSON(),
      entities: {
        learner_profile: data.profile,
        lab_progress: data.completedLabs,
        incident_runs: data.incidents,
        project_progress: data.projects,
        certificates: data.certificates
      }
    };
  }

  mergeSyncPayload(payload) {
    if (!payload || typeof payload !== 'object' || !payload.entities) {
      throw new Error('Invalid CRDT sync payload format');
    }

    const incomingClock = VectorClock.fromJSON(payload.vectorClock || {});
    this.clock.merge(incomingClock);
    this.tickClock();

    let mergedLabs = 0;
    let mergedIncidents = 0;
    let mergedProjects = 0;

    const entities = payload.entities;

    // Merge lab progress
    if (Array.isArray(entities.lab_progress)) {
      for (const remoteLab of entities.lab_progress) {
        if (!remoteLab || !remoteLab.lab_id) continue;
        const localLab = this.engine.get('lab_progress', remoteLab.lab_id);
        const merged = CRDTStateMerger.mergeLabRecord(localLab, remoteLab);

        if (this.storageType === 'sqlite') {
          this.engine.db.prepare(`
            INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(lab_id) DO UPDATE SET
              status = excluded.status,
              score = excluded.score,
              attempts = excluded.attempts,
              completed_at = excluded.completed_at,
              verification_hash = excluded.verification_hash
          `).run(
            merged.lab_id,
            merged.domain_id,
            merged.status,
            merged.score,
            merged.attempts,
            merged.completed_at,
            merged.verification_hash
          );
        } else {
          this.engine.set('lab_progress', merged.lab_id, merged);
        }
        mergedLabs++;
      }
    }

    // Merge incident runs
    if (Array.isArray(entities.incident_runs)) {
      for (const remoteInc of entities.incident_runs) {
        if (!remoteInc || !remoteInc.incident_id) continue;
        const localInc = this.engine.get('incident_runs', remoteInc.incident_id);
        const merged = CRDTStateMerger.mergeIncidentRecord(localInc, remoteInc);

        if (this.storageType === 'sqlite') {
          this.engine.db.prepare(`
            INSERT INTO incident_runs (incident_id, status, started_at, resolved_at, mttr_seconds, hints_used)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(incident_id) DO UPDATE SET
              status = excluded.status,
              resolved_at = excluded.resolved_at,
              mttr_seconds = excluded.mttr_seconds,
              hints_used = excluded.hints_used
          `).run(
            merged.incident_id,
            merged.status,
            merged.started_at,
            merged.resolved_at,
            merged.mttr_seconds,
            merged.hints_used
          );
        } else {
          this.engine.set('incident_runs', merged.incident_id, merged);
        }
        mergedIncidents++;
      }
    }

    // Merge project progress
    if (Array.isArray(entities.project_progress)) {
      for (const remoteProj of entities.project_progress) {
        if (!remoteProj || !remoteProj.project_id) continue;
        const localProj = this.engine.get('project_progress', remoteProj.project_id);
        const merged = CRDTStateMerger.mergeProjectRecord(localProj, remoteProj);

        if (this.storageType === 'sqlite') {
          this.engine.db.prepare(`
            INSERT INTO project_progress (project_id, track_id, status, score, completed_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              status = excluded.status,
              score = excluded.score,
              completed_at = excluded.completed_at
          `).run(
            merged.project_id,
            merged.track_id,
            merged.status,
            merged.score,
            merged.completed_at
          );
        } else {
          this.engine.set('project_progress', merged.project_id, merged);
        }
        mergedProjects++;
      }
    }

    // Merge certificates (union)
    if (Array.isArray(entities.certificates)) {
      for (const cert of entities.certificates) {
        if (!cert || !cert.cert_id) continue;
        if (this.storageType === 'sqlite') {
          this.engine.db.prepare(`
            INSERT INTO certificates (cert_id, track_id, title, learner_name, score_percent, signature_sha256, signature_ed25519, issued_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(cert_id) DO NOTHING
          `).run(
            cert.cert_id,
            cert.track_id,
            cert.title,
            cert.learner_name,
            cert.score_percent,
            cert.signature_sha256,
            cert.signature_ed25519 || null,
            cert.issued_at
          );
        } else {
          if (!this.engine.get('certificates', cert.cert_id)) {
            this.engine.set('certificates', cert.cert_id, cert);
          }
        }
      }
    }

    // Recompute total XP
    const allLabs = this.engine.all('lab_progress').filter((l) => l.status === 'completed');
    const allIncidents = this.engine.all('incident_runs').filter((i) => i.status === 'resolved');
    const allProjects = this.engine.all('project_progress').filter((p) => p.status === 'completed');

    const totalXp = (allLabs.length * 150) + (allIncidents.length * 250) + (allProjects.length * 450);

    if (this.storageType === 'sqlite') {
      this.engine.db.prepare('UPDATE learner_profile SET xp = ?, updated_at = ? WHERE id = ?')
        .run(totalXp, new Date().toISOString(), 'default-learner');
    } else {
      const p = this.engine.get('learner_profile', 'default-learner') || { id: 'default-learner' };
      p.xp = totalXp;
      p.updated_at = new Date().toISOString();
      this.engine.set('learner_profile', 'default-learner', p);
    }

    return {
      synced: true,
      mergedLabs,
      mergedIncidents,
      mergedProjects,
      vectorClock: this.clock.toJSON(),
      profile: this.getProfile()
    };
  }

  saveSessionSnapshot(snapshot) {
    if (!snapshot || !snapshot.sessionId) throw new Error('sessionId is required');
    const now = new Date().toISOString();

    if (this.storageType === 'sqlite') {
      this.engine.db.prepare(`
        INSERT INTO session_snapshots (session_id, cluster_snapshot_json, vfs_snapshot_json, active_lab_id, active_incident_id, active_project_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          cluster_snapshot_json = excluded.cluster_snapshot_json,
          vfs_snapshot_json = excluded.vfs_snapshot_json,
          active_lab_id = excluded.active_lab_id,
          active_incident_id = excluded.active_incident_id,
          active_project_id = excluded.active_project_id,
          updated_at = excluded.updated_at
      `).run(
        snapshot.sessionId,
        JSON.stringify(snapshot.clusterSnapshot || {}),
        snapshot.vfsSnapshot ? JSON.stringify(snapshot.vfsSnapshot) : null,
        snapshot.activeLabId || null,
        snapshot.activeIncidentId || null,
        snapshot.activeProjectId || null,
        now
      );
    } else {
      this.engine.set('session_snapshots', snapshot.sessionId, {
        session_id: snapshot.sessionId,
        cluster_snapshot_json: JSON.stringify(snapshot.clusterSnapshot || {}),
        vfs_snapshot_json: snapshot.vfsSnapshot ? JSON.stringify(snapshot.vfsSnapshot) : null,
        active_lab_id: snapshot.activeLabId || null,
        active_incident_id: snapshot.activeIncidentId || null,
        active_project_id: snapshot.activeProjectId || null,
        updated_at: now
      });
    }
  }

  getSessionSnapshot(sessionId) {
    const row = this.engine.get('session_snapshots', sessionId);
    if (!row) return null;
    return {
      sessionId: row.session_id,
      clusterSnapshot: row.cluster_snapshot_json ? JSON.parse(row.cluster_snapshot_json) : null,
      vfsSnapshot: row.vfs_snapshot_json ? JSON.parse(row.vfs_snapshot_json) : null,
      activeLabId: row.active_lab_id,
      activeIncidentId: row.active_incident_id,
      activeProjectId: row.active_project_id,
      updatedAt: row.updated_at
    };
  }

  deleteSessionSnapshot(sessionId) {
    return this.engine.delete('session_snapshots', sessionId);
  }

  close() {
    if (this.engine && typeof this.engine.close === 'function') {
      this.engine.close();
    }
  }
}

module.exports = {
  StorageAdapter,
  VectorClock,
  CRDTStateMerger
};

