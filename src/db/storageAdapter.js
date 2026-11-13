'use strict';

/**
 * KubeLabs Isomorphic Storage Adapter & Vector-Clock / HLC CRDT State Synchronizer
 * 
 * Supports:
 * 1. Node.js / Desktop (Windows, macOS, Linux): native node:sqlite (WAL mode, parameterized statements, migrations)
 * 2. Browser / Mobile (PWA, Android, iOS): IndexedDB + OPFS (Origin Private File System) snapshot persistence
 * 3. Hybrid Logical Clocks (HLC): Causality tracking, physical-time bounded monotonic ordering, and conflict-free sync
 * 4. CRDT State Merger: Deterministic entity resolution (completed wins, highest score wins, HLC tie-breaking)
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

/**
 * Hybrid Logical Clock (HLC)
 * Provides monotonic physical-time bounded logical timestamps (l, c, nodeId)
 * that preserve causality: e1 -> e2 implies HLC(e1) < HLC(e2).
 * Guarantees total ordering across distributed offline nodes.
 */
class HybridLogicalClock {
  /**
   * @param {Object} [options]
   * @param {number} [options.l] Physical millisecond timestamp
   * @param {number} [options.c] Logical counter within the same millisecond
   * @param {string} [options.nodeId] Unique node identifier
   */
  constructor(options = {}) {
    this.nodeId = String(options.nodeId || `node-${Math.random().toString(36).slice(2, 10)}`);
    this.l = typeof options.l === 'number' && !isNaN(options.l) ? Math.floor(options.l) : Date.now();
    this.c = typeof options.c === 'number' && !isNaN(options.c) ? Math.floor(options.c) : 0;
  }

  /**
   * Generates the next monotonic tick based on physical time.
   * Invariant: (l, c) is strictly monotonically increasing.
   */
  now(physicalTime = Date.now()) {
    const pt = typeof physicalTime === 'number' && !isNaN(physicalTime) ? Math.floor(physicalTime) : Date.now();
    const lOld = this.l;
    this.l = Math.max(lOld, pt);
    if (this.l === lOld) {
      this.c += 1;
    } else {
      this.c = 0;
    }
    return this.clone();
  }

  /**
   * Updates this clock upon receiving a remote HLC.
   * Preserves causality: receiver HLC > max(local, remote).
   */
  update(remote, physicalTime = Date.now()) {
    if (!remote) return this.clone();
    const pt = typeof physicalTime === 'number' && !isNaN(physicalTime) ? Math.floor(physicalTime) : Date.now();
    const r = remote instanceof HybridLogicalClock ? remote : HybridLogicalClock.from(remote);
    const lOld = this.l;
    this.l = Math.max(lOld, r.l, pt);

    if (this.l === lOld && this.l === r.l) {
      this.c = Math.max(this.c, r.c) + 1;
    } else if (this.l === lOld) {
      this.c = this.c + 1;
    } else if (this.l === r.l) {
      this.c = r.c + 1;
    } else {
      this.c = 0;
    }
    return this.clone();
  }

  /**
   * Total ordering comparison.
   * Returns:
   *  -1 if this < other
   *   0 if this === other
   *   1 if this > other
   */
  compare(other) {
    if (!other) return 1;
    const r = other instanceof HybridLogicalClock ? other : HybridLogicalClock.from(other);
    if (this.l !== r.l) return this.l < r.l ? -1 : 1;
    if (this.c !== r.c) return this.c < r.c ? -1 : 1;
    if (this.nodeId !== r.nodeId) return this.nodeId < r.nodeId ? -1 : (this.nodeId > r.nodeId ? 1 : 0);
    return 0;
  }

  isBefore(other) {
    return this.compare(other) < 0;
  }

  isAfter(other) {
    return this.compare(other) > 0;
  }

  isEqual(other) {
    return this.compare(other) === 0;
  }

  clone() {
    return new HybridLogicalClock({
      l: this.l,
      c: this.c,
      nodeId: this.nodeId
    });
  }

  toString() {
    return `${this.l}:${this.c}:${this.nodeId}`;
  }

  toISOString() {
    return `${new Date(this.l).toISOString()}_${String(this.c).padStart(6, '0')}_${this.nodeId}`;
  }

  toJSON() {
    return {
      l: this.l,
      c: this.c,
      nodeId: this.nodeId,
      hlc: this.toString()
    };
  }

  static fromString(str) {
    if (typeof str !== 'string') return new HybridLogicalClock();
    const parts = str.split(':');
    if (parts.length >= 3) {
      const l = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      const nodeId = parts.slice(2).join(':');
      if (!isNaN(l) && !isNaN(c)) {
        return new HybridLogicalClock({ l, c, nodeId });
      }
    }
    return new HybridLogicalClock();
  }

  static fromJSON(val) {
    if (!val) return new HybridLogicalClock();
    if (typeof val === 'string') return HybridLogicalClock.fromString(val);
    if (typeof val === 'object') {
      if (val.hlc && typeof val.hlc === 'string') {
        return HybridLogicalClock.fromString(val.hlc);
      }
      return new HybridLogicalClock({
        l: val.l,
        c: val.c,
        nodeId: val.nodeId
      });
    }
    return new HybridLogicalClock();
  }

  static from(val) {
    if (val instanceof HybridLogicalClock) return val;
    if (typeof val === 'string') return HybridLogicalClock.fromString(val);
    return HybridLogicalClock.fromJSON(val);
  }
}

class CRDTStateMerger {
  /**
   * Helper to compare HLC timestamps between two entity records.
   */
  static compareHlc(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const hlcA = HybridLogicalClock.from(a.hlc_timestamp || a.hlc || a.updated_at);
    const hlcB = HybridLogicalClock.from(b.hlc_timestamp || b.hlc || b.updated_at);
    return hlcA.compare(hlcB);
  }

  /**
   * Deterministically merges two lab progress records.
   * Invariants:
   * 1. Completed status always wins over in_progress.
   * 2. Highest score always wins.
   * 3. Total attempts are monotonic max.
   * 4. HLC timestamp is monotonically preserved from winning write.
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

    const winner = this.compareHlc(local, remote) >= 0 ? local : remote;
    const hlcTimestamp = winner.hlc_timestamp || remote.hlc_timestamp || local.hlc_timestamp || null;

    return {
      lab_id: local.lab_id || remote.lab_id,
      domain_id: local.domain_id || remote.domain_id,
      status: isCompleted ? 'completed' : 'in_progress',
      score: bestScore,
      attempts: totalAttempts,
      completed_at: completedAt,
      verification_hash: verificationHash,
      hlc_timestamp: hlcTimestamp
    };
  }

  /**
   * Deterministically merges two incident runs.
   * Invariants:
   * 1. Resolved status always wins.
   * 2. Lowest MTTR preserved if both resolved.
   * 3. Lowest hint usage preserved.
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

    const winner = this.compareHlc(local, remote) >= 0 ? local : remote;
    const hlcTimestamp = winner.hlc_timestamp || remote.hlc_timestamp || local.hlc_timestamp || null;

    return {
      incident_id: local.incident_id || remote.incident_id,
      status: isResolved ? 'resolved' : 'in_progress',
      started_at: local.started_at || remote.started_at || new Date().toISOString(),
      resolved_at: local.resolved_at || remote.resolved_at || (isResolved ? new Date().toISOString() : null),
      mttr_seconds: bestMttr,
      hints_used: Math.min(local.hints_used ?? 0, remote.hints_used ?? 0),
      hlc_timestamp: hlcTimestamp
    };
  }

  /**
   * Deterministically merges project progress.
   */
  static mergeProjectRecord(local, remote) {
    if (!local) return { ...remote };
    if (!remote) return { ...local };

    const isCompleted = local.status === 'completed' || remote.status === 'completed';
    const winner = this.compareHlc(local, remote) >= 0 ? local : remote;
    const hlcTimestamp = winner.hlc_timestamp || remote.hlc_timestamp || local.hlc_timestamp || null;

    return {
      project_id: local.project_id || remote.project_id,
      track_id: local.track_id || remote.track_id,
      status: isCompleted ? 'completed' : 'in_progress',
      score: Math.max(local.score || 0, remote.score || 0),
      completed_at: local.completed_at || remote.completed_at || null,
      hlc_timestamp: hlcTimestamp
    };
  }

  /**
   * Generic Last-Write-Wins (LWW) entity merger using Hybrid Logical Clock.
   */
  static mergeGenericRecord(local, remote) {
    if (!local) return { ...remote };
    if (!remote) return { ...local };
    return this.compareHlc(local, remote) >= 0 ? { ...remote, ...local } : { ...local, ...remote };
  }
}

class MemoryStorageEngine {
  constructor() {
    this.tables = new Map();
    const tableNames = [
      'schema_migrations',
      'crdt_vector_clocks',
      'crdt_hlc_clocks',
      'learner_profile',
      'lab_progress',
      'incident_runs',
      'project_progress',
      'certificates',
      'session_snapshots',
      'saved_architectures',
      'terminal_history'
    ];
    for (const name of tableNames) {
      this.tables.set(name, new Map());
    }
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

/**
 * Cross-platform Browser & Mobile Storage Engine
 * Backed by IndexedDB tables with OPFS (Origin Private File System) snapshot streaming.
 * Provides transparent synchronous memory mapping with asynchronous persistence mirroring.
 */
class IndexedDbOpfsEngine {
  constructor(options = {}) {
    this.dbName = options.dbName || 'kubelabs_idb';
    this.version = options.version || 2;
    this.tables = new Map();

    const tableNames = [
      'schema_migrations',
      'crdt_vector_clocks',
      'crdt_hlc_clocks',
      'session_snapshots',
      'learner_profile',
      'lab_progress',
      'incident_runs',
      'project_progress',
      'certificates',
      'saved_architectures',
      'terminal_history'
    ];
    for (const tbl of tableNames) {
      this.tables.set(tbl, new Map());
    }

    // In-memory OPFS virtual file mapping
    this.opfsFiles = new Map();

    // Default learner profile initialization
    this.set('learner_profile', 'default-learner', {
      id: 'default-learner',
      display_name: 'Cloud-Native Learner',
      xp: 0,
      streak_days: 1,
      updated_at: new Date().toISOString()
    });

    this._idb = null;
    this._initIndexedDb();
  }

  _getKeyPath(tbl) {
    const keyFieldMap = {
      crdt_vector_clocks: 'node_id',
      crdt_hlc_clocks: 'node_id',
      session_snapshots: 'session_id',
      learner_profile: 'id',
      lab_progress: 'lab_id',
      incident_runs: 'incident_id',
      project_progress: 'project_id',
      certificates: 'cert_id',
      saved_architectures: 'arch_id',
      terminal_history: 'id'
    };
    return keyFieldMap[tbl] || 'id';
  }

  _initIndexedDb() {
    if (typeof indexedDB === 'undefined') return;
    try {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const tbl of this.tables.keys()) {
          if (!db.objectStoreNames.contains(tbl)) {
            db.createObjectStore(tbl, { keyPath: this._getKeyPath(tbl) });
          }
        }
      };
      req.onsuccess = (e) => {
        this._idb = e.target.result;
      };
    } catch {}
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
    const val = JSON.parse(JSON.stringify(value));
    this.getTable(table).set(key, val);
    if (this._idb) {
      try {
        const tx = this._idb.transaction(table, 'readwrite');
        tx.objectStore(table).put(val);
      } catch {}
    }
    return val;
  }

  delete(table, key) {
    const res = this.getTable(table).delete(key);
    if (this._idb) {
      try {
        const tx = this._idb.transaction(table, 'readwrite');
        tx.objectStore(table).delete(key);
      } catch {}
    }
    return res;
  }

  all(table) {
    return Array.from(this.getTable(table).values()).map((v) => JSON.parse(JSON.stringify(v)));
  }

  // OPFS (Origin Private File System) snapshot streaming methods
  async writeOPFS(filename, content) {
    const dataStr = typeof content === 'string' ? content : JSON.stringify(content);
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        this.opfsFiles.set(filename, dataStr);
        return true;
      } catch {}
    }
    this.opfsFiles.set(filename, dataStr);
    return true;
  }

  writeOPFSSync(filename, content) {
    const dataStr = typeof content === 'string' ? content : JSON.stringify(content);
    this.opfsFiles.set(filename, dataStr);
    return true;
  }

  async readOPFS(filename) {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(filename);
        const file = await handle.getFile();
        return await file.text();
      } catch {}
    }
    return this.opfsFiles.get(filename) || null;
  }

  readOPFSSync(filename) {
    return this.opfsFiles.get(filename) || null;
  }

  async listOPFS() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        const names = [];
        for await (const name of root.keys()) {
          names.push(name);
        }
        return names;
      } catch {}
    }
    return Array.from(this.opfsFiles.keys());
  }

  listOPFSSync() {
    return Array.from(this.opfsFiles.keys());
  }

  async deleteOPFS(filename) {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(filename);
      } catch {}
    }
    return this.opfsFiles.delete(filename);
  }

  deleteOPFSSync(filename) {
    return this.opfsFiles.delete(filename);
  }

  close() {
    this.tables.clear();
    this.opfsFiles.clear();
    if (this._idb) {
      try { this._idb.close(); } catch {}
      this._idb = null;
    }
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

      CREATE TABLE IF NOT EXISTS crdt_hlc_clocks (
        node_id TEXT PRIMARY KEY,
        l INTEGER NOT NULL,
        c INTEGER NOT NULL,
        hlc_timestamp TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_snapshots (
        session_id TEXT PRIMARY KEY,
        cluster_snapshot_json TEXT NOT NULL,
        vfs_snapshot_json TEXT,
        active_lab_id TEXT,
        active_incident_id TEXT,
        active_project_id TEXT,
        hlc_timestamp TEXT,
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
        hlc_timestamp TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lab_progress (
        lab_id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        verification_hash TEXT,
        hlc_timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS incident_runs (
        incident_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        resolved_at TEXT,
        mttr_seconds INTEGER,
        hints_used INTEGER NOT NULL DEFAULT 0,
        hlc_timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS project_progress (
        project_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        hlc_timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS certificates (
        cert_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        title TEXT NOT NULL,
        learner_name TEXT NOT NULL,
        score_percent INTEGER NOT NULL,
        signature_sha256 TEXT NOT NULL,
        signature_ed25519 TEXT,
        hlc_timestamp TEXT,
        issued_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_architectures (
        arch_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        edges_json TEXT NOT NULL,
        score INTEGER NOT NULL,
        hlc_timestamp TEXT,
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

    // Ensure hlc_timestamp columns exist in previously-created tables
    const tablesToMigrate = ['lab_progress', 'incident_runs', 'project_progress', 'session_snapshots', 'certificates', 'saved_architectures', 'learner_profile'];
    for (const tbl of tablesToMigrate) {
      try {
        const info = this.db.prepare(`PRAGMA table_info(${tbl})`).all();
        const hasHlc = info.some((col) => col.name === 'hlc_timestamp');
        if (!hasHlc) {
          this.db.exec(`ALTER TABLE ${tbl} ADD COLUMN hlc_timestamp TEXT;`);
        }
      } catch {}
    }

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
      crdt_hlc_clocks: 'node_id',
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
    this.hlc = new HybridLogicalClock({ nodeId: this.nodeId });

    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    const forceType = options.storageType || (isNode ? 'sqlite' : 'memory');

    if (forceType === 'sqlite' && isNode) {
      this.engine = new SqliteStorageEngine(options.dbFilePath);
      this.storageType = 'sqlite';
      this.loadClockFromStorage();
    } else if (forceType === 'indexeddb' || forceType === 'opfs') {
      this.engine = new IndexedDbOpfsEngine(options);
      this.storageType = forceType;
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
      const hlcRows = this.engine.all('crdt_hlc_clocks');
      for (const r of hlcRows) {
        if (r.node_id === this.nodeId) {
          this.hlc.l = r.l;
          this.hlc.c = r.c;
        }
      }
    } else if (this.storageType === 'indexeddb' || this.storageType === 'opfs') {
      const hlcRow = this.engine.get('crdt_hlc_clocks', this.nodeId);
      if (hlcRow) {
        this.hlc.l = hlcRow.l;
        this.hlc.c = hlcRow.c;
      }
      const vRows = this.engine.all('crdt_vector_clocks');
      for (const r of vRows) {
        this.clock.set(r.node_id, r.clock_counter);
      }
    }
  }

  /**
   * Monotonically ticks both the VectorClock and the HybridLogicalClock (HLC).
   */
  tickClock(physicalTime = Date.now()) {
    this.clock.increment(this.nodeId);
    this.hlc.now(physicalTime);
    const nowIso = new Date().toISOString();

    if (this.storageType === 'sqlite') {
      const counter = this.clock.get(this.nodeId);
      this.engine.db.prepare(`
        INSERT INTO crdt_vector_clocks (node_id, clock_counter, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
          clock_counter = excluded.clock_counter,
          updated_at = excluded.updated_at
      `).run(this.nodeId, counter, nowIso);

      this.engine.db.prepare(`
        INSERT INTO crdt_hlc_clocks (node_id, l, c, hlc_timestamp, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
          l = excluded.l,
          c = excluded.c,
          hlc_timestamp = excluded.hlc_timestamp,
          updated_at = excluded.updated_at
      `).run(this.nodeId, this.hlc.l, this.hlc.c, this.hlc.toString(), nowIso);
    } else {
      this.engine.set('crdt_vector_clocks', this.nodeId, {
        node_id: this.nodeId,
        clock_counter: this.clock.get(this.nodeId),
        updated_at: nowIso
      });
      this.engine.set('crdt_hlc_clocks', this.nodeId, {
        node_id: this.nodeId,
        l: this.hlc.l,
        c: this.hlc.c,
        hlc_timestamp: this.hlc.toString(),
        updated_at: nowIso
      });
    }
    return { vectorClock: this.clock, hlc: this.hlc };
  }

  getVectorClock() {
    return this.clock.clone();
  }

  getHlc() {
    return this.hlc.clone();
  }

  getProfile(profileId = 'default-learner') {
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
      vectorClock: this.clock.toJSON(),
      hlc: this.hlc.toJSON(),
      hlcString: this.hlc.toString()
    };
  }

  recordLabAttempt({ labId, domainId, passed, score, xpReward = 150 }) {
    this.tickClock();
    const now = new Date().toISOString();
    const hlcTs = this.hlc.toString();

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
        INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash, hlc_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lab_id) DO UPDATE SET
          status = excluded.status,
          score = excluded.score,
          attempts = excluded.attempts,
          completed_at = excluded.completed_at,
          verification_hash = excluded.verification_hash,
          hlc_timestamp = excluded.hlc_timestamp
      `).run(labId, domainId, isCompleted ? 'completed' : 'in_progress', bestScore, attempts, completedAt, verificationHash, hlcTs);

      if (passed && (!existing || existing.status !== 'completed')) {
        const p = this.engine.get('learner_profile', 'default-learner');
        const newXp = (p ? p.xp : 0) + xpReward;
        this.engine.db.prepare('UPDATE learner_profile SET xp = ?, updated_at = ?, hlc_timestamp = ? WHERE id = ?')
          .run(newXp, now, hlcTs, 'default-learner');
      }

      return this.engine.get('lab_progress', labId);
    }

    // Memory or IndexedDb/OPFS engine
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
      verification_hash: isCompleted ? (existing && existing.verification_hash ? existing.verification_hash : `vh-${Math.random().toString(36).slice(2, 12)}`) : null,
      hlc_timestamp: hlcTs
    };
    this.engine.set('lab_progress', labId, rec);

    if (passed && (!existing || existing.status !== 'completed')) {
      const p = this.engine.get('learner_profile', 'default-learner') || { id: 'default-learner', xp: 0 };
      p.xp += xpReward;
      p.updated_at = now;
      p.hlc_timestamp = hlcTs;
      this.engine.set('learner_profile', 'default-learner', p);
    }
    return rec;
  }

  saveSessionSnapshot(snapshot) {
    if (!snapshot || !snapshot.sessionId) throw new Error('sessionId is required');
    this.tickClock();
    const now = new Date().toISOString();
    const hlcTs = this.hlc.toString();

    if (this.storageType === 'sqlite') {
      this.engine.db.prepare(`
        INSERT INTO session_snapshots (session_id, cluster_snapshot_json, vfs_snapshot_json, active_lab_id, active_incident_id, active_project_id, hlc_timestamp, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          cluster_snapshot_json = excluded.cluster_snapshot_json,
          vfs_snapshot_json = excluded.vfs_snapshot_json,
          active_lab_id = excluded.active_lab_id,
          active_incident_id = excluded.active_incident_id,
          active_project_id = excluded.active_project_id,
          hlc_timestamp = excluded.hlc_timestamp,
          updated_at = excluded.updated_at
      `).run(
        snapshot.sessionId,
        JSON.stringify(snapshot.clusterSnapshot || {}),
        snapshot.vfsSnapshot ? JSON.stringify(snapshot.vfsSnapshot) : null,
        snapshot.activeLabId || null,
        snapshot.activeIncidentId || null,
        snapshot.activeProjectId || null,
        hlcTs,
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
        hlc_timestamp: hlcTs,
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
      hlcTimestamp: row.hlc_timestamp || null,
      updatedAt: row.updated_at
    };
  }

  deleteSessionSnapshot(sessionId) {
    return this.engine.delete('session_snapshots', sessionId);
  }

  // OPFS snapshot operations
  async saveSnapshotOPFS(filename, data) {
    if (this.engine && typeof this.engine.writeOPFS === 'function') {
      return this.engine.writeOPFS(filename, data);
    }
    return false;
  }

  async loadSnapshotOPFS(filename) {
    if (this.engine && typeof this.engine.readOPFS === 'function') {
      return this.engine.readOPFS(filename);
    }
    return null;
  }

  async listSnapshotsOPFS() {
    if (this.engine && typeof this.engine.listOPFS === 'function') {
      return this.engine.listOPFS();
    }
    return [];
  }

  async deleteSnapshotOPFS(filename) {
    if (this.engine && typeof this.engine.deleteOPFS === 'function') {
      return this.engine.deleteOPFS(filename);
    }
    return false;
  }

  generateSyncPayload() {
    this.tickClock();
    const data = this.getProfile();
    return {
      protocolVersion: 'crdt-v2-hlc',
      nodeId: this.nodeId,
      timestamp: new Date().toISOString(),
      vectorClock: this.clock.toJSON(),
      hlc: this.hlc.toJSON(),
      hlcString: this.hlc.toString(),
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

    // Merge vector clock
    const incomingClock = VectorClock.fromJSON(payload.vectorClock || {});
    this.clock.merge(incomingClock);

    // Update HLC
    if (payload.hlc || payload.hlcString) {
      this.hlc.update(payload.hlc || payload.hlcString);
    }
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
            INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash, hlc_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(lab_id) DO UPDATE SET
              status = excluded.status,
              score = excluded.score,
              attempts = excluded.attempts,
              completed_at = excluded.completed_at,
              verification_hash = excluded.verification_hash,
              hlc_timestamp = excluded.hlc_timestamp
          `).run(
            merged.lab_id,
            merged.domain_id,
            merged.status,
            merged.score,
            merged.attempts,
            merged.completed_at,
            merged.verification_hash,
            merged.hlc_timestamp
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
            INSERT INTO incident_runs (incident_id, status, started_at, resolved_at, mttr_seconds, hints_used, hlc_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(incident_id) DO UPDATE SET
              status = excluded.status,
              resolved_at = excluded.resolved_at,
              mttr_seconds = excluded.mttr_seconds,
              hints_used = excluded.hints_used,
              hlc_timestamp = excluded.hlc_timestamp
          `).run(
            merged.incident_id,
            merged.status,
            merged.started_at,
            merged.resolved_at,
            merged.mttr_seconds,
            merged.hints_used,
            merged.hlc_timestamp
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
            INSERT INTO project_progress (project_id, track_id, status, score, completed_at, hlc_timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              status = excluded.status,
              score = excluded.score,
              completed_at = excluded.completed_at,
              hlc_timestamp = excluded.hlc_timestamp
          `).run(
            merged.project_id,
            merged.track_id,
            merged.status,
            merged.score,
            merged.completed_at,
            merged.hlc_timestamp
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
            INSERT INTO certificates (cert_id, track_id, title, learner_name, score_percent, signature_sha256, signature_ed25519, hlc_timestamp, issued_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(cert_id) DO NOTHING
          `).run(
            cert.cert_id,
            cert.track_id,
            cert.title,
            cert.learner_name,
            cert.score_percent,
            cert.signature_sha256,
            cert.signature_ed25519 || null,
            cert.hlc_timestamp || null,
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
      this.engine.db.prepare('UPDATE learner_profile SET xp = ?, updated_at = ?, hlc_timestamp = ? WHERE id = ?')
        .run(totalXp, new Date().toISOString(), this.hlc.toString(), 'default-learner');
    } else {
      const p = this.engine.get('learner_profile', 'default-learner') || { id: 'default-learner' };
      p.xp = totalXp;
      p.updated_at = new Date().toISOString();
      p.hlc_timestamp = this.hlc.toString();
      this.engine.set('learner_profile', 'default-learner', p);
    }

    return {
      synced: true,
      mergedLabs,
      mergedIncidents,
      mergedProjects,
      vectorClock: this.clock.toJSON(),
      hlc: this.hlc.toJSON(),
      hlcString: this.hlc.toString(),
      profile: this.getProfile()
    };
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
  HybridLogicalClock,
  CRDTStateMerger,
  IndexedDbOpfsEngine,
  MemoryStorageEngine,
  SqliteStorageEngine
};
