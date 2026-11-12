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

  getActiveSessionsCount() {
    return this.sessions.size;
  }

  get activeSessionsCount() {
    return this.sessions.size;
  }
}

module.exports = { SessionManager };

