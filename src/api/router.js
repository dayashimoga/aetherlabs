'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
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

class ApiRouter {
  constructor({
    database,
    pluginManager,
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
    this.cluster = virtualCluster;
    this.terminal = terminalEngine;
    this.validator = validationEngine;
    this.incidents = incidentEngine;
    this.projects = projectEngine;
    this.architectures = architectureEngine;
    this.mentor = aiMentor;
    this.certifications = certificationEngine;
    this.orchestrator = agentOrchestrator;
    this.publicDir = publicDir || path.join(__dirname, '..', '..', 'public');
    this.activeLabId = 'lab-k8s-01';
    this.activeIncidentId = null;
  }

  async handle(req, res) {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const method = req.method.toUpperCase();

      if (pathname.startsWith('/api/')) {
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
    // 1. Health & Telemetry
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        platform: 'KubeLabs Cloud-Native Learn-by-Doing Platform',
        version: '1.0.0',
        offlineCapable: true,
        domainsCount: this.plugins.getAllDomains().length,
        labsCount: this.plugins.getAllLabs().length,
        incidentsCount: this.incidents.listIncidents().length,
        projectsCount: this.projects ? this.projects.listProjects().length : 0,
        memoryRssMB: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
        timestamp: new Date().toISOString()
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
        clusterState: this.cluster.exportSnapshot(),
        activeLabId: this.activeLabId,
        activeIncidentId: this.activeIncidentId
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
      return sendJson(res, 200, { lab, clusterState: this.cluster.exportSnapshot() });
    }

    const labStartMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/start$/);
    if (method === 'POST' && labStartMatch) {
      const lab = this.plugins.getLab(labStartMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labStartMatch[1]} not found` } });
      }
      this.activeLabId = lab.id;
      this.activeIncidentId = null;
      this.terminal.commandHistory = [];
      this.cluster.reset(lab.initialClusterState);
      this.db.updateProfileFields({
        activeLabId: lab.id,
        activeIncidentId: null,
        clusterSnapshotJson: JSON.stringify(this.cluster.exportSnapshot())
      });
      return sendJson(res, 200, {
        lab,
        clusterState: this.cluster.exportSnapshot(),
        message: `Initialized virtual cluster for lab "${lab.title}"`
      });
    }

    const labValidateMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/validate$/);
    if (method === 'POST' && labValidateMatch) {
      const lab = this.plugins.getLab(labValidateMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labValidateMatch[1]} not found` } });
      }
      const report = this.validator.evaluate(lab.validationRules, this.cluster, this.terminal.commandHistory);
      const progressRecord = this.db.recordLabAttempt({
        labId: lab.id,
        domainId: lab.domainId,
        passed: report.passed,
        score: report.score,
        xpReward: lab.xpReward
      });
      return sendJson(res, 200, {
        labId: lab.id,
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        skillRadar: this.certifications.computeDomainSkillRadar(),
        clusterState: this.cluster.exportSnapshot()
      });
    }

    const labSolveMatch = pathname.match(/^\/api\/labs\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && labSolveMatch) {
      const lab = this.plugins.getLab(labSolveMatch[1]);
      if (!lab) {
        return sendJson(res, 404, { error: { code: 'LAB_NOT_FOUND', message: `Lab ${labSolveMatch[1]} not found` } });
      }
      this.activeLabId = lab.id;
      this.terminal.commandHistory = [];
      this.cluster.reset(lab.initialClusterState);
      const commandOutputs = [];
      for (const cmd of lab.solutionCommands) {
        const resCmd = this.terminal.execute(cmd, { manifestText: lab.starterManifest });
        commandOutputs.push(resCmd);
        this.db.recordTerminalCommand(lab.id, cmd, resCmd.exitCode, resCmd.output);
      }
      const report = this.validator.evaluate(lab.validationRules, this.cluster, this.terminal.commandHistory);
      const progressRecord = this.db.recordLabAttempt({
        labId: lab.id,
        domainId: lab.domainId,
        passed: report.passed,
        score: report.score,
        xpReward: lab.xpReward
      });
      return sendJson(res, 200, {
        labId: lab.id,
        commandOutputs,
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        skillRadar: this.certifications.computeDomainSkillRadar(),
        clusterState: this.cluster.exportSnapshot()
      });
    }

    // 4. Terminal & Cluster State Endpoints
    if (method === 'POST' && pathname === '/api/terminal/exec') {
      const body = await readJsonBody(req);
      if (!body.command || !String(body.command).trim()) {
        return sendJson(res, 400, { error: { code: 'EMPTY_COMMAND', message: 'Command string is required' } });
      }
      const result = this.terminal.execute(body.command, { manifestText: body.manifestText || '' });
      const contextId = body.contextId || this.activeIncidentId || this.activeLabId || 'global';
      this.db.recordTerminalCommand(contextId, body.command, result.exitCode, result.output);
      return sendJson(res, 200, {
        ...result,
        clusterState: this.cluster.exportSnapshot()
      });
    }

    if (method === 'GET' && pathname === '/api/cluster/state') {
      return sendJson(res, 200, { clusterState: this.cluster.exportSnapshot() });
    }

    if (method === 'POST' && pathname === '/api/cluster/reset') {
      const body = await readJsonBody(req);
      this.terminal.commandHistory = [];
      this.cluster.reset(body.initialClusterState || null);
      return sendJson(res, 200, { clusterState: this.cluster.exportSnapshot() });
    }

    if (method === 'POST' && pathname === '/api/cluster/apply') {
      const body = await readJsonBody(req);
      if (!body.manifest || !String(body.manifest).trim()) {
        return sendJson(res, 400, { error: { code: 'EMPTY_MANIFEST', message: 'YAML/JSON manifest is required' } });
      }
      try {
        const applied = this.cluster.applyManifest(body.manifest);
        return sendJson(res, 200, {
          applied: applied.map((a) => ({
            kind: a.resource.kind,
            name: a.resource.metadata.name,
            namespace: a.resource.metadata.namespace || 'default',
            action: a.action
          })),
          clusterState: this.cluster.exportSnapshot()
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
      this.activeIncidentId = inc.id;
      this.terminal.commandHistory = [];
      this.incidents.injectIncident(inc.id, this.cluster);
      const runRecord = this.db.startIncidentRun(inc.id);
      return sendJson(res, 200, {
        incident: inc,
        runRecord,
        clusterState: this.cluster.exportSnapshot()
      });
    }

    const incVerifyMatch = pathname.match(/^\/api\/incidents\/([a-z0-9-]+)\/verify$/);
    if (method === 'POST' && incVerifyMatch) {
      const inc = this.incidents.getIncident(incVerifyMatch[1]);
      if (!inc) {
        return sendJson(res, 404, { error: { code: 'INCIDENT_NOT_FOUND', message: `Incident ${incVerifyMatch[1]} not found` } });
      }
      const report = this.incidents.verifyIncidentResolution(inc.id, this.cluster, this.terminal.commandHistory);
      let runRecord = null;
      if (report.passed) {
        runRecord = this.db.resolveIncidentRun(inc.id, inc.xpReward);
      }
      return sendJson(res, 200, {
        ...report,
        runRecord,
        learner: this.db.getProfile(),
        clusterState: this.cluster.exportSnapshot()
      });
    }

    const incSolveMatch = pathname.match(/^\/api\/incidents\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && incSolveMatch) {
      const inc = this.incidents.getIncident(incSolveMatch[1]);
      if (!inc) {
        return sendJson(res, 404, { error: { code: 'INCIDENT_NOT_FOUND', message: `Incident ${incSolveMatch[1]} not found` } });
      }
      this.activeIncidentId = inc.id;
      this.terminal.commandHistory = [];
      this.incidents.injectIncident(inc.id, this.cluster);
      this.db.startIncidentRun(inc.id);
      const commandOutputs = [];
      for (const cmd of inc.solutionCommands) {
        const out = this.terminal.execute(cmd);
        commandOutputs.push(out);
      }
      const report = this.incidents.verifyIncidentResolution(inc.id, this.cluster, this.terminal.commandHistory);
      const runRecord = report.passed ? this.db.resolveIncidentRun(inc.id, inc.xpReward) : null;
      return sendJson(res, 200, {
        commandOutputs,
        ...report,
        runRecord,
        learner: this.db.getProfile(),
        clusterState: this.cluster.exportSnapshot()
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
      this.terminal.commandHistory = [];
      this.projects.startProject(proj.id, this.cluster);
      return sendJson(res, 200, {
        project: proj,
        clusterState: this.cluster.exportSnapshot()
      });
    }

    const projValidateMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/validate$/);
    if (method === 'POST' && projValidateMatch && this.projects) {
      const proj = this.projects.getProject(projValidateMatch[1]);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projValidateMatch[1]} not found` } });
      }
      const report = this.projects.validateProject(proj.id, this.cluster, this.terminal.commandHistory);
      const progressRecord = this.db.recordProjectAttempt({
        projectId: proj.id,
        trackId: proj.trackId,
        passed: report.passed,
        score: report.score,
        xpReward: proj.xpReward
      });
      return sendJson(res, 200, {
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        clusterState: this.cluster.exportSnapshot()
      });
    }

    const projSolveMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/solve$/);
    if (method === 'POST' && projSolveMatch && this.projects) {
      const proj = this.projects.getProject(projSolveMatch[1]);
      if (!proj) {
        return sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projSolveMatch[1]} not found` } });
      }
      this.terminal.commandHistory = [];
      this.projects.startProject(proj.id, this.cluster);
      const commandOutputs = [];
      for (const cmd of proj.solutionCommands) {
        const out = this.terminal.execute(cmd);
        commandOutputs.push(out);
      }
      const report = this.projects.validateProject(proj.id, this.cluster, this.terminal.commandHistory);
      const progressRecord = this.db.recordProjectAttempt({
        projectId: proj.id,
        trackId: proj.trackId,
        passed: report.passed,
        score: report.score,
        xpReward: proj.xpReward
      });
      return sendJson(res, 200, {
        commandOutputs,
        ...report,
        progressRecord,
        learner: this.db.getProfile(),
        clusterState: this.cluster.exportSnapshot()
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
        this.cluster.applyManifest(compiled.kubernetesYaml);
      }
      return sendJson(res, 200, {
        ...compiled,
        clusterState: this.cluster.exportSnapshot()
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
      const activeLab = this.plugins.getLab(body.labId || this.activeLabId);
      const activeIncident = this.incidents.getIncident(body.incidentId || this.activeIncidentId);
      const reply = this.mentor.respond({
        mode: body.mode || 'hint',
        query: body.query || '',
        activeLab,
        activeIncident,
        cluster: this.cluster,
        commandHistory: this.terminal.commandHistory
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

