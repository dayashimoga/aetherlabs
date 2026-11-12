'use strict';

const { VirtualCluster } = require('./virtualCluster');
const { VirtualFileSystem } = require('./virtualFileSystem');
const { TerminalEngine } = require('./terminalEngine');

class SessionManager {
  constructor({ database = null, maxSessions = 500, idleTimeoutMs = 1800000 } = {}) {
    this.db = database;
    this.maxSessions = maxSessions;
    this.idleTimeoutMs = idleTimeoutMs;
    this.sessions = new Map();
  }

  getSession(sessionId = 'default-session') {
    const sId = String(sessionId || 'default-session').trim();
    let session = this.sessions.get(sId);

    if (!session) {
      // Evict oldest session if at capacity
      if (this.sessions.size >= this.maxSessions) {
        this.evictOldestSession();
      }

      // Check if DB has snapshot for this session
      let snapshot = null;
      if (this.db && typeof this.db.getSessionSnapshot === 'function') {
        snapshot = this.db.getSessionSnapshot(sId);
      }

      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster();
      const terminal = new TerminalEngine(cluster, vfs);

      session = {
        sessionId: sId,
        cluster,
        vfs,
        terminal,
        activeLabId: 'lab-k8s-01',
        activeIncidentId: null,
        activeProjectId: null,
        activeContextType: 'lab',
        lastValidationReport: null,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };

      if (snapshot) {
        if (snapshot.clusterSnapshot) {
          if (typeof cluster.importSnapshot === 'function') {
            cluster.importSnapshot(snapshot.clusterSnapshot);
          } else if (typeof cluster.loadSnapshot === 'function') {
            cluster.loadSnapshot(snapshot.clusterSnapshot);
          }
        }
        if (snapshot.vfsSnapshot) vfs.importSnapshot(snapshot.vfsSnapshot);
        if (snapshot.activeLabId) session.activeLabId = snapshot.activeLabId;
        if (snapshot.activeIncidentId) session.activeIncidentId = snapshot.activeIncidentId;
        if (snapshot.activeProjectId) session.activeProjectId = snapshot.activeProjectId;
      }

      this.sessions.set(sId, session);
    } else {
      session.lastAccessedAt = new Date();
    }

    return session;
  }

  hasSession(sessionId) {
    return this.sessions.has(String(sessionId || '').trim());
  }

  deleteSession(sessionId) {
    const sId = String(sessionId || '').trim();
    if (this.db && typeof this.db.deleteSessionSnapshot === 'function') {
      this.db.deleteSessionSnapshot(sId);
    }
    return this.sessions.delete(sId);
  }

  evictOldestSession() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, session] of this.sessions.entries()) {
      const time = session.lastAccessedAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.persistSessionSnapshot(oldestKey);
      this.sessions.delete(oldestKey);
    }
  }

  persistSessionSnapshot(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !this.db || typeof this.db.saveSessionSnapshot !== 'function') return;

    this.db.saveSessionSnapshot({
      sessionId: session.sessionId,
      clusterSnapshot: session.cluster.exportSnapshot(),
      vfsSnapshot: session.vfs.exportSnapshot(),
      activeLabId: session.activeLabId,
      activeIncidentId: session.activeIncidentId,
      activeProjectId: session.activeProjectId,
      updatedAt: new Date().toISOString()
    });
  }

  pruneIdleSessions() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt.getTime() > this.idleTimeoutMs) {
        this.persistSessionSnapshot(key);
        this.sessions.delete(key);
      }
    }
  }

  /**
   * Atomically binds a session to an active Lab, initializing cluster state,
   * resetting VFS with starter manifests, clearing command history, and clearing stale validation reports.
   * @param {string} sessionId
   * @param {Object} lab Lab definition object
   * @returns {{ session: Object, clusterState: Object, activeLabId: string }}
   */
  bindLab(sessionId, lab) {
    if (!lab || !lab.id) {
      throw new Error('bindLab requires a valid lab object with an id property');
    }
    const session = this.getSession(sessionId);
    session.activeLabId = lab.id;
    session.activeIncidentId = null;
    session.activeProjectId = null;
    session.activeContextType = 'lab';
    session.lastValidationReport = null;

    if (session.terminal) {
      session.terminal.commandHistory = [];
      session.terminal.cwd = '/home/learner';
    }

    if (session.cluster && typeof session.cluster.reset === 'function') {
      session.cluster.reset(lab.initialClusterState || null);
    }

    if (session.vfs && typeof session.vfs.reset === 'function') {
      session.vfs.reset();
      if (lab.starterManifest) {
        try {
          session.vfs.writeFile('/home/learner/manifest.yaml', lab.starterManifest);
        } catch {}
      }
    }

    session.lastAccessedAt = new Date();
    return {
      session,
      activeLabId: lab.id,
      clusterState: session.cluster ? session.cluster.exportSnapshot() : null
    };
  }

  /**
   * Atomically binds a session to an active Incident scenario,
   * resetting state, clearing validation reports, and injecting the incident fault into the cluster.
   * @param {string} sessionId
   * @param {Object} incident Incident definition object
   * @param {Object} [incidentEngine] Optional incident engine for fault injection
   * @returns {{ session: Object, clusterState: Object, activeIncidentId: string }}
   */
  bindIncident(sessionId, incident, incidentEngine = null) {
    if (!incident || !incident.id) {
      throw new Error('bindIncident requires a valid incident object with an id property');
    }
    const session = this.getSession(sessionId);
    session.activeLabId = null;
    session.activeIncidentId = incident.id;
    session.activeProjectId = null;
    session.activeContextType = 'incident';
    session.lastValidationReport = null;

    if (session.terminal) {
      session.terminal.commandHistory = [];
      session.terminal.cwd = '/home/learner';
    }

    if (session.cluster && typeof session.cluster.reset === 'function') {
      session.cluster.reset(incident.initialClusterState || null);
    }

    if (session.vfs && typeof session.vfs.reset === 'function') {
      session.vfs.reset();
    }

    if (incidentEngine && typeof incidentEngine.injectIncident === 'function') {
      incidentEngine.injectIncident(incident.id, session.cluster);
    }

    session.lastAccessedAt = new Date();
    return {
      session,
      activeIncidentId: incident.id,
      clusterState: session.cluster ? session.cluster.exportSnapshot() : null
    };
  }

  /**
   * Atomically binds a session to an active Capstone Project,
   * resetting state and initializing project resources.
   * @param {string} sessionId
   * @param {Object} project Project definition object
   * @param {Object} [projectEngine] Optional project engine
   * @returns {{ session: Object, clusterState: Object, activeProjectId: string }}
   */
  bindProject(sessionId, project, projectEngine = null) {
    if (!project || !project.id) {
      throw new Error('bindProject requires a valid project object with an id property');
    }
    const session = this.getSession(sessionId);
    session.activeLabId = null;
    session.activeIncidentId = null;
    session.activeProjectId = project.id;
    session.activeContextType = 'project';
    session.lastValidationReport = null;

    if (session.terminal) {
      session.terminal.commandHistory = [];
      session.terminal.cwd = '/home/learner';
    }

    if (session.cluster && typeof session.cluster.reset === 'function') {
      session.cluster.reset();
    }

    if (session.vfs && typeof session.vfs.reset === 'function') {
      session.vfs.reset();
    }

    if (projectEngine && typeof projectEngine.startProject === 'function') {
      projectEngine.startProject(project.id, session.cluster);
    }

    session.lastAccessedAt = new Date();
    return {
      session,
      activeProjectId: project.id,
      clusterState: session.cluster ? session.cluster.exportSnapshot() : null
    };
  }

  setValidationReport(sessionId, report) {
    const session = this.getSession(sessionId);
    session.lastValidationReport = report;
  }

  getValidationReport(sessionId) {
    const session = this.getSession(sessionId);
    return session.lastValidationReport;
  }

  clearValidationReport(sessionId) {
    const session = this.getSession(sessionId);
    session.lastValidationReport = null;
  }

  resetSessionState(sessionId, initialClusterState = null) {
    const session = this.getSession(sessionId);
    session.activeIncidentId = null;
    session.activeProjectId = null;
    session.lastValidationReport = null;
    if (session.terminal) {
      session.terminal.commandHistory = [];
      session.terminal.cwd = '/home/learner';
    }
    if (session.cluster && typeof session.cluster.reset === 'function') {
      session.cluster.reset(initialClusterState);
    }
    if (session.vfs && typeof session.vfs.reset === 'function') {
      session.vfs.reset();
    }
    session.lastAccessedAt = new Date();
    return session;
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }

  get activeSessionsCount() {
    return this.sessions.size;
  }
}

module.exports = { SessionManager };

