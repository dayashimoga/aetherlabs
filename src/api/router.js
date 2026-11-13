'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { SessionManager } = require('../core/sessionManager');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function applySecurityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  );
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function sendJson(res, statusCode, data) {
  applySecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    const maxBytes = 1024 * 1024; // 1MB cap
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('Request payload exceeds 1MB security limit'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON request payload'));
      }
    });
    req.on('error', reject);
  });
}

class RateLimiter {
  constructor(maxTokens = 180, refillRatePerSec = 3, maxBuckets = 5000) {
    this.maxTokens = maxTokens;
    this.refillRatePerSec = refillRatePerSec;
    this.maxBuckets = maxBuckets;
    this.buckets = new Map();
  }

  isAllowed(ip) {
    const now = Date.now();
    let bucket = this.buckets.get(ip);
    if (!bucket) {
      if (this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      }
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(ip, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsedSec * this.refillRatePerSec);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  reset(ip = null) {
    if (ip) {
      this.buckets.delete(ip);
    } else {
      this.buckets.clear();
    }
  }
}

class ApiRouter {
  constructor({
    database,
    pluginManager,
    sessionManager,
    virtualCluster,
    terminalEngine,
    validationEngine,
    incidentEngine,
    projectEngine,
    architectureEngine,
    aiMentor,
    certificationEngine,
    agentOrchestrator,
    publicDir
  }) {
    this.db = database;
    this.plugins = pluginManager;
    this.sessionManager =
      sessionManager ||
      new SessionManager({ database: this.db, maxSessions: 500 });
    this.validator = validationEngine;
    this.incidents = incidentEngine;
    this.projects = projectEngine;
    this.architectures = architectureEngine;
    this.mentor = aiMentor;
    this.certifications = certificationEngine;
    this.orchestrator = agentOrchestrator;
    this.publicDir = publicDir || path.join(__dirname, '..', '..', 'public');
    this.rateLimiter = new RateLimiter(180, 3);
    this.requestCount = 0;
    this.errorCount = 0;
    this.totalLatencyMs = 0;
    this.recentTraces = [];

    // Ensure default session has initial cluster/terminal if passed
    const defaultSession = this.sessionManager.getSession('default-session');
    if (virtualCluster) defaultSession.cluster = virtualCluster;
    if (terminalEngine) defaultSession.terminal = terminalEngine;
  }

  resolveSession(req) {
    let sessionId = 'default-session';
    if (req && req.headers && req.headers['x-kubelabs-session']) {
      sessionId = String(req.headers['x-kubelabs-session']).trim();
    } else if (req && req.url && req.url.includes('sessionId=')) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        sessionId = parsedUrl.searchParams.get('sessionId') || 'default-session';
      } catch {}
    }
    return this.sessionManager.getSession(sessionId);
  }

  get cluster() {
    return this.sessionManager.getSession('default-session').cluster;
  }
  set cluster(val) {
    this.sessionManager.getSession('default-session').cluster = val;
  }
  get terminal() {
    return this.sessionManager.getSession('default-session').terminal;
  }
  set terminal(val) {
    this.sessionManager.getSession('default-session').terminal = val;
  }
  get vfs() {
    return this.sessionManager.getSession('default-session').vfs;
  }
  get activeLabId() {
    return this.sessionManager.getSession('default-session').activeLabId;
  }
  set activeLabId(val) {
    this.sessionManager.getSession('default-session').activeLabId = val;
  }
  get activeIncidentId() {
    return this.sessionManager.getSession('default-session').activeIncidentId;
  }
  set activeIncidentId(val) {
    this.sessionManager.getSession('default-session').activeIncidentId = val;
  }

  async handle(req, res) {
    const startTime = performance.now();
    const traceId = (req.headers && req.headers['x-trace-id']) || crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${spanId}-01`;
    res.setHeader('X-Trace-Id', traceId);
    res.setHeader('Traceparent', traceparent);

    try {
      this.requestCount += 1;
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const method = req.method.toUpperCase();

      res.on('finish', () => {
        const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
        this.totalLatencyMs += durationMs;
        if (res.statusCode >= 500) this.errorCount += 1;
        this.recentTraces.push({
          traceId,
          spanId,
          method,
          pathname,
          statusCode: res.statusCode,
          durationMs,
          timestamp: new Date().toISOString()
        });
        if (this.recentTraces.length > 100) {
          this.recentTraces.shift();
        }
      });

      // Prometheus metrics endpoint
      if (method === 'GET' && pathname === '/metrics') {
        applySecurityHeaders(res);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        const mem = process.memoryUsage();
        const activeSessions = this.sessionManager ? this.sessionManager.activeSessionsCount : 1;
        const avgLatency = this.requestCount > 0 ? (this.totalLatencyMs / this.requestCount).toFixed(3) : '0.000';
        const sloRatio = this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount).toFixed(5) : '1.00000';
        const metrics = [
          '# HELP kubelabs_http_requests_total Total number of HTTP requests handled',
          '# TYPE kubelabs_http_requests_total counter',
          `kubelabs_http_requests_total ${this.requestCount}`,
          '',
          '# HELP kubelabs_http_errors_total Total number of HTTP 5xx server errors',
          '# TYPE kubelabs_http_errors_total counter',
          `kubelabs_http_errors_total ${this.errorCount}`,
          '',
          '# HELP kubelabs_http_request_duration_ms_avg Average HTTP request latency in milliseconds',
          '# TYPE kubelabs_http_request_duration_ms_avg gauge',
          `kubelabs_http_request_duration_ms_avg ${avgLatency}`,
          '',
          '# HELP kubelabs_slo_availability_ratio Availability SLI ratio (target >= 0.999)',
          '# TYPE kubelabs_slo_availability_ratio gauge',
          `kubelabs_slo_availability_ratio ${sloRatio}`,
          '',
          '# HELP kubelabs_active_sessions Number of active virtual cluster sessions',
          '# TYPE kubelabs_active_sessions gauge',
          `kubelabs_active_sessions ${activeSessions}`,
          '',
          '# HELP kubelabs_memory_rss_bytes Resident set size in bytes',
          '# TYPE kubelabs_memory_rss_bytes gauge',
          `kubelabs_memory_rss_bytes ${mem.rss}`,
          '',
          '# HELP kubelabs_memory_heap_used_bytes Heap used in bytes',
          '# TYPE kubelabs_memory_heap_used_bytes gauge',
          `kubelabs_memory_heap_used_bytes ${mem.heapUsed}`,
          '',
          '# HELP kubelabs_uptime_seconds Total application uptime in seconds',
          '# TYPE kubelabs_uptime_seconds gauge',
          `kubelabs_uptime_seconds ${Math.floor(process.uptime())}`,
          '',
          '# HELP kubelabs_info Application build version and runtime metadata',
          '# TYPE kubelabs_info gauge',
          'kubelabs_info{version="3.0.0",edition="isomorphic"} 1'
        ].join('\n');
        res.end(metrics + '\n');
        return;
      }

      // Kubernetes Liveness Probe
      if (method === 'GET' && (pathname === '/livez' || pathname === '/api/livez')) {
        return sendJson(res, 200, {
          status: 'ok',
          uptimeSeconds: process.uptime(),
          timestamp: new Date().toISOString()
        });
      }

      // Kubernetes Readiness Probe
      if (method === 'GET' && (pathname === '/readyz' || pathname === '/api/readyz')) {
        if (this.isDraining) {
          return sendJson(res, 503, {
            status: 'draining',
            message: 'Server is terminating gracefully',
            timestamp: new Date().toISOString()
          });
        }
        return sendJson(res, 200, {
          status: 'ready',
          uptimeSeconds: process.uptime(),
          pluginsLoaded: this.plugins ? this.plugins.getAllDomains().length : 26,
          activeSessions: this.sessionManager ? this.sessionManager.activeSessionsCount : 1,
          timestamp: new Date().toISOString()
        });
      }

      if (pathname.startsWith('/api/')) {
        const clientIp = (req.socket && req.socket.remoteAddress) || '127.0.0.1';
        if (!this.rateLimiter.isAllowed(clientIp)) {
          res.setHeader('Retry-After', '60');
          return sendJson(res, 429, {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit of 180 requests/minute exceeded. Please retry shortly.'
            }
          });
        }
        await this.handleApi(method, pathname, req, res);
        return;
      }

      this.serveStaticAsset(pathname, res);
    } catch (err) {
      sendJson(res, 500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message
        }
      });
    }
  }

  async handleApi(method, pathname, req, res) {
    const session = this.resolveSession(req);

    // 1. Health & Telemetry
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        platform: 'KubeLabs Cloud-Native Learn-by-Doing Platform',
        version: '3.0.0',
        offlineCapable: true,
        domainsCount: this.plugins.getAllDomains().length,
        labsCount: this.plugins.getAllLabs().length,
        incidentsCount: this.incidents.listIncidents().length,
        projectsCount: this.projects ? this.projects.listProjects().length : 0,
        activeSessionsCount: this.sessionManager.getActiveSessionsCount(),
        memoryRssMB: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
        timestamp: new Date().toISOString()
      });
    }

    // 1b. Profile Export & Import
    if (method === 'GET' && pathname === '/api/profile/export') {
      return sendJson(res, 200, this.db.exportProfileBundle());
    }

    if (method === 'POST' && pathname === '/api/profile/import') {
      const body = await readJsonBody(req);
      const updated = this.db.importProfileBundle(body);
      return sendJson(res, 200, { success: true, profile: updated });
    }

    if (method === 'POST' && (pathname === '/api/offline/sync' || pathname === '/api/sync')) {
      const body = await readJsonBody(req);
      const syncedProfile = this.db.syncOfflineProgress(body);
      return sendJson(res, 200, {
        success: true,
        synced: true,
        syncedAt: new Date().toISOString(),
        learner: syncedProfile
      });
    }

    if (method === 'GET' && pathname === '/api/observability/telemetry') {
      const mem = process.memoryUsage();
      const pods = session.cluster.getResources('Pod', 'all');
      const unhealthyPods = pods.filter((p) => p.status && p.status.reason !== 'Running');
      const sloAvailability = this.requestCount > 0 ? (this.requestCount - this.errorCount) / this.requestCount : 1;
      return sendJson(res, 200, {
        goldenSignals: {
          trafficRequestsTotal: this.requestCount,
          errorsTotal: this.errorCount,
          avgLatencyMs: this.requestCount > 0 ? Math.round((this.totalLatencyMs / this.requestCount) * 100) / 100 : 0,
          saturationRssMB: Math.round((mem.rss / (1024 * 1024)) * 10) / 10
        },
        slo: {
          targetAvailability: 0.999,
          currentAvailability: Number(sloAvailability.toFixed(5)),
          errorBudgetRemainingPercent: Math.max(0, Math.min(100, Math.round((1 - (1 - sloAvailability) / 0.001) * 100)))
        },
        activeAlerts: unhealthyPods.map((p) => ({
          alertName: `KubePod${p.status.reason}`,
          severity: 'critical',
          namespace: p.metadata.namespace || 'default',
          pod: p.metadata.name,
          message: p.status.message
        })),
        recentTraces: this.recentTraces.slice(-20),
        clusterEvents: session.cluster.state.events.slice(-25)
      });
    }

    // 2. Full Platform Overview
    if (method === 'GET' && pathname === '/api/overview') {
      const profileData = this.db.getProfile();
      return sendJson(res, 200, {
        tracks: this.plugins.getTracks(),
        domains: this.plugins.getAllDomains(),
        labs: this.plugins.getAllLabs(),
        incidents: this.incidents.listIncidents(),
        projects: this.projects ? this.projects.listProjects() : [],
        referenceArchitectures: this.architectures.listReferenceArchitectures(),
        savedArchitectures: this.db.listSavedArchitectures(),
        certificationTracks: this.certifications.listExamTracks(),
        skillRadar: this.certifications.computeDomainSkillRadar(),
        learner: profileData,
        clusterState: session.cluster.exportSnapshot(),
        activeLabId: session.activeLabId,
        activeIncidentId: session.activeIncidentId,
        activeProjectId: session.activeProjectId,
        activeContextType: session.activeContextType || 'lab'
      });
    }

    // 3. Domains & Labs
    if (method === 'GET' && pathname === '/api/domains') {
      return sendJson(res, 200, {
        tracks: this.plugins.getTracks(),
        domains: this.plugins.getAllDomains()
      });
    }

    const domainMatch = pathname.match(/^\/api\/domains\/([a-z0-9-]+)$/);
    if (method === 'GET' && domainMatch) {
      const domain = this.plugins.getDomain(domainMatch[1]);
      if (!domain) {
        return sendJson(res, 404, { error: { code: 'DOMAIN_NOT_FOUND', message: `Domain ${domainMatch[1]} not found` } });
      }
      return sendJson(res, 200, { domain });
    }

    if (method === 'GET' && pathname === '/api/labs') {
      return sendJson(res, 200, { labs: this.plugins.getAllLabs() });
    }

    const labGetMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)$/);
    if (method === 'GET' && labGetMatch) {
      const lab = this.plugins.getLab(labGetMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labGetMatch[1]} not found` } });
      }
      return sendJson(res, 200, { lab, clusterState: session.cluster.exportSnapshot() });
    }

    const labStartMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/start$/);
    if (method === 'POST' && labStartMatch) {
      const lab = this.plugins.getLab(labStartMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labStartMatch[1]} not found` } });
      }
      const bound = this.sessionManager.bindLab(session.sessionId, lab);
      this.db.updateProfileFields({
        activeLabId: lab.id,
        activeIncidentId: null,
        clusterSnapshotJson: JSON.stringify(bound.clusterState)
      });
      return sendJson(res, 200, {
        lab,
        activeLabId: lab.id,
        contextType: 'lab',
        clusterState: bound.clusterState,
        message: `Initialized virtual cluster for lab "${lab.title}"`
      });
    }

    const labValidateMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/validate$/);
    if (method === 'POST' && labValidateMatch) {
      const lab = this.plugins.getLab(labValidateMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labValidateMatch[1]} not found` } });
      }
      // Ensure session is bound to the target lab
      if (session.activeLabId !== lab.id) {
        this.sessionManager.bindLab(session.sessionId, lab);
      }
      const report = this.validator.evaluate(lab.validationRules, session.cluster, session.terminal.commandHistory, { labId: lab.id, contextType: 'lab' });
      this.sessionManager.setValidationReport(session.sessionId, report);
      const progressRecord = this.db.recordLabAttempt({
        labId: lab.id,
        domainId: lab.domainId,
        passed: report.passed,
        score: report.score,
        xpReward: lab.xpReward
      });
      return sendJson(res, 200, {
        labId: lab.id,
        activeLabId: lab.id,
        contextType: 'lab',
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        skillRadar: this.certifications ? this.certifications.computeDomainSkillRadar() : {},
        clusterState: session.cluster.exportSnapshot()
      });
    }

    const labSolveMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && labSolveMatch) {
      const lab = this.plugins.getLab(labSolveMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labSolveMatch[1]} not found` } });
      }
      this.sessionManager.bindLab(session.sessionId, lab);
      const commandOutputs = [];
      for (const cmd of lab.solutionCommands) {
        const resCmd = session.terminal.execute(cmd, { manifestText: lab.starterManifest });
        commandOutputs.push(resCmd);
        this.db.recordTerminalCommand(lab.id, cmd, resCmd.exitCode, resCmd.output);
      }
      const report = this.validator.evaluate(lab.validationRules, session.cluster, session.terminal.commandHistory, { labId: lab.id, contextType: 'lab' });
      this.sessionManager.setValidationReport(session.sessionId, report);
      const progressRecord = this.db.recordLabAttempt({
        labId: lab.id,
        domainId: lab.domainId,
        passed: report.passed,
        score: report.score,
        xpReward: lab.xpReward
      });
      return sendJson(res, 200, {
        labId: lab.id,
        activeLabId: lab.id,
        contextType: 'lab',
        commandOutputs,
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        skillRadar: this.certifications ? this.certifications.computeDomainSkillRadar() : {},
        clusterState: session.cluster.exportSnapshot()
      });
    }

    // 4. Terminal & Cluster State Endpoints
    if (method === 'POST' && pathname === '/api/terminal/exec') {
      const body = await readJsonBody(req);
      if (!body.command || !String(body.command).trim()) {
        return sendJson(res, 400, { error: { code: 'EMPTY_COMMAND', message: 'Command string is required' } });
      }
      const result = session.terminal.execute(body.command, { manifestText: body.manifestText || '' });
      const contextId = body.contextId || session.activeIncidentId || session.activeLabId || 'global';
      this.db.recordTerminalCommand(contextId, body.command, result.exitCode, result.output);
      return sendJson(res, 200, {
        ...result,
        clusterState: session.cluster.exportSnapshot()
      });
    }

    if (method === 'POST' && pathname === '/api/terminal/autocomplete') {
      const body = await readJsonBody(req);
      const line = String(body.line || '');
      const cursor = typeof body.cursor === 'number' ? body.cursor : line.length;
      const result = session.terminal.autocomplete(line, cursor);
      return sendJson(res, 200, result);
    }

    if (method === 'GET' && pathname === '/api/cluster/state') {
      return sendJson(res, 200, { clusterState: session.cluster.exportSnapshot() });
    }

    if (method === 'POST' && pathname === '/api/cluster/reset') {
      const body = await readJsonBody(req);
      session.terminal.commandHistory = [];
      session.cluster.reset(body.initialClusterState || null);
      return sendJson(res, 200, { clusterState: session.cluster.exportSnapshot() });
    }

    if (method === 'POST' && pathname === '/api/cluster/apply') {
      const body = await readJsonBody(req);
      if (!body.manifest || !String(body.manifest).trim()) {
        return sendJson(res, 400, { error: { code: 'EMPTY_MANIFEST', message: 'YAML/JSON manifest is required' } });
      }
      try {
        const applied = session.cluster.applyManifest(body.manifest);
        return sendJson(res, 200, {
          applied: applied.map((a) => ({
            kind: a.resource.kind,
            name: a.resource.metadata.name,
            namespace: a.resource.metadata.namespace || 'default',
            action: a.action
          })),
          clusterState: session.cluster.exportSnapshot()
        });
      } catch (err) {
        return sendJson(res, 422, { error: { code: 'MANIFEST_PARSE_ERROR', message: err.message } });
      }
    }

    // 5. Production Incident Simulations
    if (method === 'GET' && pathname === '/api/incidents') {
      return sendJson(res, 200, {
        incidents: this.incidents.scenarios,
        runs: this.db.getProfile().incidents
      });
    }

    const incStartMatch = pathname.match(/^\/api\/incidents\/([a-z0-9-]+)\/start$/);
    if (method === 'POST' && incStartMatch) {
      const inc = this.incidents.getIncident(incStartMatch[1]);
      if (!inc) {
        return sendJson(res, 404, { error: { code: 'INCIDENT_NOT_FOUND', message: `Incident ${incStartMatch[1]} not found` } });
      }
      const bound = this.sessionManager.bindIncident(session.sessionId, inc, this.incidents);
      const runRecord = this.db.startIncidentRun(inc.id);
      return sendJson(res, 200, {
        incident: inc,
        activeIncidentId: inc.id,
        contextType: 'incident',
        runRecord,
        clusterState: bound.clusterState
      });
    }

    const incVerifyMatch = pathname.match(/^\/api\/incidents\/([a-z0-9-]+)\/verify$/);
    if (method === 'POST' && incVerifyMatch) {
      const inc = this.incidents.getIncident(incVerifyMatch[1]);
      if (!inc) {
        return sendJson(res, 404, { error: { code: 'INCIDENT_NOT_FOUND', message: `Incident ${incVerifyMatch[1]} not found` } });
      }
      const report = this.incidents.verifyIncidentResolution(inc.id, session.cluster, session.terminal.commandHistory);
      let runRecord = null;
      if (report.passed) {
        runRecord = this.db.resolveIncidentRun(inc.id, inc.xpReward);
      }
      return sendJson(res, 200, {
        incidentId: inc.id,
        activeIncidentId: inc.id,
        contextType: 'incident',
        ...report,
        runRecord,
        learner: this.db.getProfile(),
        clusterState: session.cluster.exportSnapshot()
      });
    }

    const incSolveMatch = pathname.match(/^\/api\/incidents\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && incSolveMatch) {
      const inc = this.incidents.getIncident(incSolveMatch[1]);
      if (!inc) {
        return sendJson(res, 404, { error: { code: 'INCIDENT_NOT_FOUND', message: `Incident ${incSolveMatch[1]} not found` } });
      }
      const bound = this.sessionManager.bindIncident(session.sessionId, inc, this.incidents);
      this.db.startIncidentRun(inc.id);
      const commandOutputs = [];
      for (const cmd of inc.solutionCommands) {
        const out = session.terminal.execute(cmd);
        commandOutputs.push(out);
      }
      const report = this.incidents.verifyIncidentResolution(inc.id, session.cluster, session.terminal.commandHistory);
      const runRecord = report.passed ? this.db.resolveIncidentRun(inc.id, inc.xpReward) : null;
      return sendJson(res, 200, {
        incidentId: inc.id,
        activeIncidentId: inc.id,
        contextType: 'incident',
        commandOutputs,
        ...report,
        runRecord,
        learner: this.db.getProfile(),
        clusterState: session.cluster.exportSnapshot()
      });
    }

    // 5b. Real-World Capstone Projects
    if (method === 'GET' && pathname === '/api/projects') {
      return sendJson(res, 200, {
        projects: this.projects ? this.projects.listProjects() : [],
        progress: this.db.getProfile().projects || []
      });
    }

    const projStartMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/start$/);
    if (method === 'POST' && projStartMatch && this.projects) {
      const proj = this.projects.getProject(projStartMatch[1]);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projStartMatch[1]} not found` } });
      }
      const bound = this.sessionManager.bindProject(session.sessionId, proj, this.projects);
      return sendJson(res, 200, {
        project: proj,
        projectId: proj.id,
        activeProjectId: proj.id,
        contextType: 'project',
        clusterState: bound.clusterState
      });
    }

    const projValidateMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/validate$/);
    if (method === 'POST' && projValidateMatch && this.projects) {
      const proj = this.projects.getProject(projValidateMatch[1]);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projValidateMatch[1]} not found` } });
      }
      const report = this.projects.validateProject(proj.id, session.cluster, session.terminal.commandHistory);
      const progressRecord = this.db.recordProjectAttempt({
        projectId: proj.id,
        trackId: proj.trackId,
        passed: report.passed,
        score: report.score,
        xpReward: proj.xpReward
      });
      return sendJson(res, 200, {
        projectId: proj.id,
        isProject: true,
        contextType: 'project',
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        clusterState: session.cluster.exportSnapshot()
      });
    }

    const projMilestoneValidateMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/milestones\/([0-9]+)\/validate$/);
    if (method === 'POST' && projMilestoneValidateMatch && this.projects) {
      const projId = projMilestoneValidateMatch[1];
      const mNum = parseInt(projMilestoneValidateMatch[2], 10);
      const proj = this.projects.getProject(projId);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projId} not found` } });
      }
      try {
        const report = this.projects.validateMilestone(proj.id, mNum, session.cluster, session.terminal.commandHistory);
        return sendJson(res, 200, {
          projectId: proj.id,
          isProject: true,
          contextType: 'project',
          milestoneNumber: mNum,
          ...report,
          clusterState: session.cluster.exportSnapshot()
        });
      } catch (err) {
        return sendJson(res, 400, { error: { code: 'MILESTONE_VALIDATE_ERROR', message: err.message } });
      }
    }

    const projSolveMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && projSolveMatch && this.projects) {
      const proj = this.projects.getProject(projSolveMatch[1]);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projSolveMatch[1]} not found` } });
      }
      this.sessionManager.bindProject(session.sessionId, proj, this.projects);
      const commandOutputs = [];
      for (const cmd of proj.solutionCommands) {
        const out = session.terminal.execute(cmd);
        commandOutputs.push(out);
      }
      const report = this.projects.validateProject(proj.id, session.cluster, session.terminal.commandHistory);
      const progressRecord = this.db.recordProjectAttempt({
        projectId: proj.id,
        trackId: proj.trackId,
        passed: report.passed,
        score: report.score,
        xpReward: proj.xpReward
      });
      return sendJson(res, 200, {
        projectId: proj.id,
        isProject: true,
        contextType: 'project',
        commandOutputs,
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        clusterState: session.cluster.exportSnapshot()
      });
    }

    // 6. Visual Architecture Designer & Enterprise Reference Architectures
    if (method === 'GET' && pathname === '/api/architectures') {
      return sendJson(res, 200, {
        referenceArchitectures: this.architectures.listReferenceArchitectures(),
        savedArchitectures: this.db.listSavedArchitectures()
      });
    }

    if (method === 'POST' && pathname === '/api/architectures/analyze') {
      const body = await readJsonBody(req);
      const compiled = this.architectures.compileToManifests(body.nodes || [], body.edges || []);
      return sendJson(res, 200, compiled);
    }

    if (method === 'POST' && pathname === '/api/architectures/deploy') {
      const body = await readJsonBody(req);
      const compiled = this.architectures.compileToManifests(body.nodes || [], body.edges || []);
      if (compiled.kubernetesYaml && compiled.kubernetesYaml.trim()) {
        session.cluster.applyManifest(compiled.kubernetesYaml);
      }
      return sendJson(res, 200, {
        ...compiled,
        clusterState: session.cluster.exportSnapshot()
      });
    }

    if (method === 'POST' && pathname === '/api/architectures/save') {
      const body = await readJsonBody(req);
      const analysis = this.architectures.analyzeTopology(body.nodes || [], body.edges || []);
      const saved = this.db.saveArchitecture({
        archId: body.archId,
        name: body.name || 'Custom Cloud-Native Architecture',
        description: body.description || '',
        nodes: body.nodes || [],
        edges: body.edges || [],
        score: analysis.overallScore
      });
      return sendJson(res, 201, {
        saved,
        analysis,
        savedArchitectures: this.db.listSavedArchitectures()
      });
    }

    // 7. Contextual Socratic AI Mentor & CIS Auditor
    if (method === 'POST' && pathname === '/api/mentor/ask') {
      const body = await readJsonBody(req);
      const activeLab = this.plugins.getLab(body.labId || session.activeLabId);
      const activeIncident = this.incidents.getIncident(body.incidentId || session.activeIncidentId);
      const reply = this.mentor.respond({
        mode: body.mode || 'hint',
        query: body.query || '',
        activeLab,
        activeIncident,
        cluster: session.cluster,
        commandHistory: session.terminal.commandHistory
      });
      return sendJson(res, 200, reply);
    }

    // 8. Assessments & Verifiable Certifications
    if (method === 'GET' && pathname === '/api/certifications/tracks') {
      return sendJson(res, 200, {
        tracks: this.certifications.listExamTracks(),
        earnedCertificates: this.db.getProfile().certificates
      });
    }

    const certTrackQMatch = pathname.match(/^\/api\/certifications\/tracks\/([a-z0-9-]+)\/questions$/);
    if (method === 'GET' && certTrackQMatch) {
      try {
        const exam = this.certifications.getExamQuestionsForClient(certTrackQMatch[1]);
        return sendJson(res, 200, exam);
      } catch (err) {
        return sendJson(res, 404, { error: { code: 'TRACK_NOT_FOUND', message: err.message } });
      }
    }

    if (method === 'POST' && pathname === '/api/certifications/submit') {
      const body = await readJsonBody(req);
      if (!body.trackId) {
        return sendJson(res, 400, { error: { code: 'MISSING_TRACK_ID', message: 'trackId is required' } });
      }
      const graded = this.certifications.gradeExam({
        trackId: body.trackId,
        answers: body.answers || {},
        learnerName: body.learnerName || 'Cloud-Native Engineer'
      });
      return sendJson(res, 200, {
        ...graded,
        learner: this.db.getProfile()
      });
    }

    if (method === 'GET' && pathname === '/api/certifications/public-key') {
      return sendJson(res, 200, {
        algorithm: 'ed25519',
        publicKeyPem: this.certifications.getPublicKeyPem()
      });
    }

    if (method === 'POST' && pathname === '/api/certifications/verify') {
      const body = await readJsonBody(req);
      const verification = this.certifications.verifyCertificate(body.certId, body.signature);
      return sendJson(res, 200, verification);
    }

    // 9. 11-Agent Framework Live Audit
    if (method === 'GET' && pathname === '/api/agents/audit') {
      const auditReport = this.orchestrator.runFullAudit();
      return sendJson(res, 200, auditReport);
    }

    return sendJson(res, 404, {
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: `API route ${method} ${pathname} not found`
      }
    });
  }

  serveStaticAsset(pathname, res) {
    applySecurityHeaders(res);
    let relPath = pathname === '/' ? '/index.html' : pathname;
    relPath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(this.publicDir, relPath);

    if (!fullPath.startsWith(this.publicDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.end(fs.readFileSync(fullPath));
      return;
    }

    // SPA fallback to index.html
    const indexHtml = path.join(this.publicDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(fs.readFileSync(indexHtml));
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  }
}

module.exports = { ApiRouter };

