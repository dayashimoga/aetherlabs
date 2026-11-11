#!/usr/bin/env node
'use strict';

const http = require('node:http');
const path = require('node:path');
const { KubeLabsDatabase } = require('./db/database');
const { PluginManager } = require('./plugins/pluginManager');
const { VirtualCluster } = require('./engine/virtualCluster');
const { TerminalEngine } = require('./engine/terminalEngine');
const { ValidationEngine } = require('./engine/validationEngine');
const { IncidentEngine } = require('./engine/incidentEngine');
const { ProjectEngine } = require('./engine/projectEngine');
const { ArchitectureEngine } = require('./engine/architectureEngine');
const { AiMentor } = require('./engine/aiMentor');
const { CertificationEngine } = require('./engine/certificationEngine');
const { AgentOrchestrator } = require('./agents/orchestrator');
const { ApiRouter } = require('./api/router');

function createKubeLabsApp(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  const database = new KubeLabsDatabase(options.dbFilePath);
  const pluginManager = new PluginManager(
    path.join(rootDir, 'plugins'),
    path.join(rootDir, 'schemas', 'plugin.schema.json')
  );
  const virtualCluster = new VirtualCluster();
  const terminalEngine = new TerminalEngine(virtualCluster);
  const validationEngine = new ValidationEngine();
  const incidentEngine = new IncidentEngine(validationEngine);
  const projectEngine = new ProjectEngine(validationEngine);
  const architectureEngine = new ArchitectureEngine();
  const aiMentor = new AiMentor(validationEngine);
  const certificationEngine = new CertificationEngine(pluginManager, database);
  const agentOrchestrator = new AgentOrchestrator({ rootDir, pluginManager });

  // Initialize virtual cluster with starter lab state
  const starterLab = pluginManager.getLab('lab-k8s-01');
  if (starterLab && starterLab.initialClusterState) {
    virtualCluster.reset(starterLab.initialClusterState);
  }

  const router = new ApiRouter({
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
    publicDir: path.join(rootDir, 'public')
  });

  const server = http.createServer((req, res) => {
    router.handle(req, res);
  });

  return {
    server,
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
    router
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4100);
  const host = process.env.HOST || '127.0.0.1';
  const app = createKubeLabsApp();
  app.server.listen(port, host, () => {
    const rssMB = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
    console.log('==============================================================================');
    console.log(' KubeLabs Cloud-Native & Kubernetes Learn-by-Doing Platform (v1.0.0)');
    console.log(` URL           : http://${host}:${port}`);
    console.log(` Domains Loaded: ${app.pluginManager.getAllDomains().length} | Labs: ${app.pluginManager.getAllLabs().length} | Incidents: ${app.incidentEngine.listIncidents().length}`);
    console.log(` Memory Usage  : ${rssMB} MB RSS (Low-Resource Offline-Capable Mode)`);
    console.log('==============================================================================');
  });
}

module.exports = { createKubeLabsApp };

