'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

class KubeLabsDatabase {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath || path.join(__dirname, '..', '..', 'data', 'kubelabs.sqlite');
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

      CREATE TABLE IF NOT EXISTS assessment_attempts (
        attempt_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        score_percent INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        domain_breakdown_json TEXT NOT NULL,
        created_at TEXT NOT NULL
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

      CREATE TABLE IF NOT EXISTS project_progress (
        project_id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS platform_keys (
        key_id TEXT PRIMARY KEY,
        algorithm TEXT NOT NULL,
        public_key_pem TEXT NOT NULL,
        private_key_pem TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec('ALTER TABLE certificates ADD COLUMN signature_ed25519 TEXT;');
    } catch (_) {
      // column already exists
    }

    const existing = this.db
      .prepare('SELECT id FROM learner_profile WHERE id = ?')
      .get('default-learner');

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO learner_profile (id, display_name, xp, streak_days, active_lab_id, active_incident_id, cluster_snapshot_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'default-learner',
          'Cloud-Native Engineer',
          0,
          1,
          'lab-k8s-01',
          null,
          null,
          new Date().toISOString()
        );
    }

    const migration = this.db
      .prepare('SELECT version FROM schema_migrations WHERE version = 1')
      .get();
    if (!migration) {
      this.db
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'v2_session_snapshots_and_multitenancy', new Date().toISOString());
    }
  }

  getProfile() {
    const profile = this.db
      .prepare('SELECT * FROM learner_profile WHERE id = ?')
      .get('default-learner');
    const completedLabs = this.db
      .prepare('SELECT * FROM lab_progress ORDER BY completed_at DESC')
      .all();
    const incidents = this.db
      .prepare('SELECT * FROM incident_runs ORDER BY started_at DESC')
      .all();
    const certificates = this.db
      .prepare('SELECT * FROM certificates ORDER BY issued_at DESC')
      .all();
    const assessments = this.db
      .prepare('SELECT * FROM assessment_attempts ORDER BY created_at DESC LIMIT 20')
      .all();
    const projects = this.db
      .prepare('SELECT * FROM project_progress ORDER BY completed_at DESC')
      .all();

    return {
      profile,
      completedLabs,
      incidents,
      certificates,
      assessments,
      projects
    };
  }

  updateProfileFields(updates) {
    const current = this.db
      .prepare('SELECT * FROM learner_profile WHERE id = ?')
      .get('default-learner');
    const displayName = updates.displayName !== undefined ? updates.displayName : current.display_name;
    const xp = updates.xp !== undefined ? updates.xp : current.xp;
    const activeLabId = updates.activeLabId !== undefined ? updates.activeLabId : current.active_lab_id;
    const activeIncidentId = updates.activeIncidentId !== undefined ? updates.activeIncidentId : current.active_incident_id;
    const snapshot = updates.clusterSnapshotJson !== undefined ? updates.clusterSnapshotJson : current.cluster_snapshot_json;

    this.db
      .prepare(
        `UPDATE learner_profile
         SET display_name = ?, xp = ?, active_lab_id = ?, active_incident_id = ?, cluster_snapshot_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        displayName,
        xp,
        activeLabId,
        activeIncidentId,
        snapshot,
        new Date().toISOString(),
        'default-learner'
      );

    return {
      synced: true,
      ...this.getProfile()
    };
  }

  recordLabAttempt({ labId, domainId, passed, score, xpReward }) {
    const existing = this.db
      .prepare('SELECT * FROM lab_progress WHERE lab_id = ?')
      .get(labId);

    const now = new Date().toISOString();
    const verificationHash = passed
      ? crypto.createHash('sha256').update(`${labId}:${domainId}:${score}:${now}`).digest('hex').slice(0, 24)
      : (existing ? existing.verification_hash : null);

    const status = passed ? 'completed' : (existing && existing.status === 'completed' ? 'completed' : 'in_progress');
    const attempts = (existing ? existing.attempts : 0) + 1;
    const completedAt = passed ? now : (existing ? existing.completed_at : null);
    const bestScore = Math.max(score, existing ? existing.score : 0);

    this.db
      .prepare(
        `INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(lab_id) DO UPDATE SET
           status = excluded.status,
           score = excluded.score,
           attempts = excluded.attempts,
           completed_at = excluded.completed_at,
           verification_hash = excluded.verification_hash`
      )
      .run(labId, domainId, status, bestScore, attempts, completedAt, verificationHash);

    if (passed && (!existing || existing.status !== 'completed')) {
      const profile = this.db
        .prepare('SELECT xp FROM learner_profile WHERE id = ?')
        .get('default-learner');
      this.updateProfileFields({ xp: (profile ? profile.xp : 0) + (xpReward || 150) });
    }

    return {
      labId,
      domainId,
      status,
      score: bestScore,
      attempts,
      completedAt,
      verificationHash
    };
  }

  startIncidentRun(incidentId) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO incident_runs (incident_id, status, started_at, resolved_at, mttr_seconds, hints_used)
         VALUES (?, ?, ?, NULL, NULL, 0)
         ON CONFLICT(incident_id) DO UPDATE SET
           status = 'active',
           started_at = excluded.started_at,
           resolved_at = NULL,
           mttr_seconds = NULL,
           hints_used = 0`
      )
      .run(incidentId, 'active', now);

    this.updateProfileFields({ activeIncidentId: incidentId });
    return this.db.prepare('SELECT * FROM incident_runs WHERE incident_id = ?').get(incidentId);
  }

  resolveIncidentRun(incidentId, xpReward = 250) {
    const existing = this.db
      .prepare('SELECT * FROM incident_runs WHERE incident_id = ?')
      .get(incidentId);
    const now = new Date();
    const started = existing && existing.started_at ? new Date(existing.started_at) : new Date(now.getTime() - 45000);
    const mttrSeconds = Math.max(5, Math.round((now.getTime() - started.getTime()) / 1000));

    this.db
      .prepare(
        `INSERT INTO incident_runs (incident_id, status, started_at, resolved_at, mttr_seconds, hints_used)
         VALUES (?, 'resolved', ?, ?, ?, 0)
         ON CONFLICT(incident_id) DO UPDATE SET
           status = 'resolved',
           resolved_at = excluded.resolved_at,
           mttr_seconds = excluded.mttr_seconds`
      )
      .run(incidentId, started.toISOString(), now.toISOString(), mttrSeconds);

    if (!existing || existing.status !== 'resolved') {
      const profile = this.db.prepare('SELECT xp FROM learner_profile WHERE id = ?').get('default-learner');
      this.updateProfileFields({ xp: (profile ? profile.xp : 0) + xpReward });
    }

    return this.db.prepare('SELECT * FROM incident_runs WHERE incident_id = ?').get(incidentId);
  }

  recordTerminalCommand(contextId, command, exitCode, outputPreview) {
    this.db
      .prepare(
        `INSERT INTO terminal_history (context_id, command, exit_code, output_preview, executed_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        contextId || 'global',
        String(command).slice(0, 500),
        Number(exitCode) || 0,
        String(outputPreview || '').slice(0, 400),
        new Date().toISOString()
      );
  }

  getTerminalHistory(contextId, limit = 50) {
    if (contextId) {
      return this.db
        .prepare('SELECT * FROM terminal_history WHERE context_id = ? ORDER BY id DESC LIMIT ?')
        .all(contextId, limit)
        .reverse();
    }
    return this.db
      .prepare('SELECT * FROM terminal_history ORDER BY id DESC LIMIT ?')
      .all(limit)
      .reverse();
  }

  clearTerminalHistory(contextId) {
    if (contextId) {
      this.db.prepare('DELETE FROM terminal_history WHERE context_id = ?').run(contextId);
    } else {
      this.db.prepare('DELETE FROM terminal_history').run();
    }
  }

  saveAssessmentAttempt({ attemptId, trackId, scorePercent, passed, domainBreakdown }) {
    this.db
      .prepare(
        `INSERT INTO assessment_attempts (attempt_id, track_id, score_percent, passed, domain_breakdown_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        attemptId,
        trackId,
        scorePercent,
        passed ? 1 : 0,
        JSON.stringify(domainBreakdown || {}),
        new Date().toISOString()
      );
  }

  saveCertificate({ certId, trackId, title, learnerName, scorePercent, signatureSha256, signatureEd25519, issuedAt }) {
    this.db
      .prepare(
        `INSERT INTO certificates (cert_id, track_id, title, learner_name, score_percent, signature_sha256, signature_ed25519, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cert_id) DO UPDATE SET
           score_percent = excluded.score_percent,
           signature_sha256 = excluded.signature_sha256,
           signature_ed25519 = excluded.signature_ed25519`
      )
      .run(certId, trackId, title, learnerName, scorePercent, signatureSha256, signatureEd25519 || null, issuedAt);
    return this.db.prepare('SELECT * FROM certificates WHERE cert_id = ?').get(certId);
  }

  getCertificate(certId) {
    return this.db.prepare('SELECT * FROM certificates WHERE cert_id = ?').get(certId);
  }

  saveArchitecture({ archId, name, description, nodes, edges, score }) {
    const id = archId || `arch-${Date.now()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO saved_architectures (arch_id, name, description, nodes_json, edges_json, score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(arch_id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           nodes_json = excluded.nodes_json,
           edges_json = excluded.edges_json,
           score = excluded.score,
           updated_at = excluded.updated_at`
      )
      .run(id, name, description || '', JSON.stringify(nodes), JSON.stringify(edges), score || 0, now);
    return this.db.prepare('SELECT * FROM saved_architectures WHERE arch_id = ?').get(id);
  }

  listSavedArchitectures() {
    return this.db
      .prepare('SELECT * FROM saved_architectures ORDER BY updated_at DESC')
      .all()
      .map((row) => ({
        archId: row.arch_id,
        name: row.name,
        description: row.description,
        nodes: JSON.parse(row.nodes_json),
        edges: JSON.parse(row.edges_json),
        score: row.score,
        updatedAt: row.updated_at
      }));
  }

  recordProjectAttempt({ projectId, trackId, passed, score, xpReward = 450 }) {
    const existing = this.db
      .prepare('SELECT * FROM project_progress WHERE project_id = ?')
      .get(projectId);
    const now = new Date().toISOString();
    const status = passed ? 'completed' : (existing && existing.status === 'completed' ? 'completed' : 'in_progress');
    const bestScore = Math.max(score || 0, existing ? existing.score : 0);
    const completedAt = passed ? now : (existing ? existing.completed_at : null);

    this.db
      .prepare(
        `INSERT INTO project_progress (project_id, track_id, status, score, completed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           status = excluded.status,
           score = excluded.score,
           completed_at = excluded.completed_at`
      )
      .run(projectId, trackId, status, bestScore, completedAt);

    if (passed && (!existing || existing.status !== 'completed')) {
      const profile = this.db.prepare('SELECT xp FROM learner_profile WHERE id = ?').get('default-learner');
      this.updateProfileFields({ xp: (profile ? profile.xp : 0) + xpReward });
    }

    return this.db.prepare('SELECT * FROM project_progress WHERE project_id = ?').get(projectId);
  }

  saveSessionSnapshot({ sessionId, clusterSnapshot, vfsSnapshot, activeLabId, activeIncidentId, activeProjectId, updatedAt }) {
    this.db
      .prepare(
        `INSERT INTO session_snapshots (session_id, cluster_snapshot_json, vfs_snapshot_json, active_lab_id, active_incident_id, active_project_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           cluster_snapshot_json = excluded.cluster_snapshot_json,
           vfs_snapshot_json = excluded.vfs_snapshot_json,
           active_lab_id = excluded.active_lab_id,
           active_incident_id = excluded.active_incident_id,
           active_project_id = excluded.active_project_id,
           updated_at = excluded.updated_at`
      )
      .run(
        sessionId,
        JSON.stringify(clusterSnapshot || {}),
        vfsSnapshot ? JSON.stringify(vfsSnapshot) : null,
        activeLabId || null,
        activeIncidentId || null,
        activeProjectId || null,
        updatedAt || new Date().toISOString()
      );
  }

  getSessionSnapshot(sessionId) {
    const row = this.db
      .prepare('SELECT * FROM session_snapshots WHERE session_id = ?')
      .get(sessionId);
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
    this.db.prepare('DELETE FROM session_snapshots WHERE session_id = ?').run(sessionId);
  }

  exportProfileBundle() {
    return {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      profile: this.getProfile(),
      savedArchitectures: this.listSavedArchitectures(),
      terminalHistory: this.getTerminalHistory(null, 200)
    };
  }

  importProfileBundle(bundle) {
    if (!bundle || !bundle.profile) {
      throw new Error('Invalid bundle format');
    }
    const { profile, completedLabs, incidents, certificates, projects } = bundle.profile;
    if (profile) {
      this.updateProfileFields({
        displayName: profile.display_name,
        xp: profile.xp,
        activeLabId: profile.active_lab_id,
        activeIncidentId: profile.active_incident_id
      });
    }
    if (Array.isArray(completedLabs)) {
      for (const lab of completedLabs) {
        this.db
          .prepare(
            `INSERT INTO lab_progress (lab_id, domain_id, status, score, attempts, completed_at, verification_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(lab_id) DO UPDATE SET
               status = excluded.status,
               score = excluded.score,
               attempts = excluded.attempts,
               completed_at = excluded.completed_at,
               verification_hash = excluded.verification_hash`
          )
          .run(lab.lab_id, lab.domain_id, lab.status, lab.score, lab.attempts, lab.completed_at, lab.verification_hash);
      }
    }
    if (Array.isArray(certificates)) {
      for (const c of certificates) {
        this.saveCertificate({
          certId: c.cert_id,
          trackId: c.track_id,
          title: c.title,
          learnerName: c.learner_name,
          scorePercent: c.score_percent,
          signatureSha256: c.signature_sha256,
          signatureEd25519: c.signature_ed25519 || null,
          issuedAt: c.issued_at
        });
      }
    }
    if (Array.isArray(projects)) {
      for (const p of projects) {
        this.recordProjectAttempt({
          projectId: p.project_id,
          trackId: p.track_id,
          passed: p.status === 'completed',
          score: p.score,
          xpReward: 0
        });
      }
    }
    return {
      synced: true,
      ...this.getProfile()
    };
  }

  getOrCreateSigningKeys(keyId = 'ed25519-cert-authority') {
    const existing = this.db
      .prepare('SELECT * FROM platform_keys WHERE key_id = ?')
      .get(keyId);
    if (existing && existing.public_key_pem && existing.private_key_pem) {
      return {
        publicKey: existing.public_key_pem,
        privateKey: existing.private_key_pem
      };
    }
    const pair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    this.db
      .prepare(
        `INSERT INTO platform_keys (key_id, algorithm, public_key_pem, private_key_pem, created_at)
         VALUES (?, 'ed25519', ?, ?, ?)
         ON CONFLICT(key_id) DO NOTHING`
      )
      .run(keyId, pair.publicKey, pair.privateKey, new Date().toISOString());
    return {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey
    };
  }

  syncOfflineProgress(payload = {}) {
    const entities = (payload && payload.entities) || {};
    const completedLabs = Array.isArray(payload.completedLabs)
      ? payload.completedLabs
      : (Array.isArray(entities.lab_progress) ? entities.lab_progress : (Array.isArray(payload.queue) ? payload.queue : []));
    const completedIncidents = Array.isArray(payload.incidents)
      ? payload.incidents
      : (Array.isArray(entities.incident_runs) ? entities.incident_runs : []);
    const completedProjects = Array.isArray(payload.projects)
      ? payload.projects
      : (Array.isArray(entities.project_progress) ? entities.project_progress : []);

    for (const item of completedLabs) {
      const labId = typeof item === 'string' ? item : item.labId;
      const domainId = (typeof item === 'object' && item.domainId) || 'kubernetes-core';
      const xpReward = (typeof item === 'object' && item.xpReward) || 150;
      if (labId) {
        this.recordLabAttempt({ labId, domainId, passed: true, score: 100, xpReward });
      }
    }
    for (const inc of completedIncidents) {
      const incId = typeof inc === 'string' ? inc : inc.incidentId;
      if (incId) {
        this.resolveIncidentRun(incId, (typeof inc === 'object' && inc.xpReward) || 250);
      }
    }
    for (const proj of completedProjects) {
      const projId = typeof proj === 'string' ? proj : proj.projectId;
      if (projId) {
        this.recordProjectAttempt({
          projectId: projId,
          trackId: (typeof proj === 'object' && proj.trackId) || 'track-k8s-admin',
          passed: true,
          score: 100,
          xpReward: (typeof proj === 'object' && proj.xpReward) || 450
        });
      }
    }
    return {
      synced: true,
      ...this.getProfile()
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = { KubeLabsDatabase };

