#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { PluginManager } = require('../src/plugins/pluginManager');
const { AgentOrchestrator } = require('../src/agents/orchestrator');

const rootDir = path.join(__dirname, '..');
const pluginManager = new PluginManager(
  path.join(rootDir, 'plugins'),
  path.join(rootDir, 'schemas', 'plugin.schema.json')
);
const orchestrator = new AgentOrchestrator({ rootDir, pluginManager });

const report = orchestrator.runFullAudit();

console.log('================================================================================');
console.log(' KUBELABS 11-AGENT SELF-AUDIT & PRODUCTION READINESS GATE');
console.log('================================================================================');

for (const agent of report.agents) {
  console.log(`\n[${agent.status}] ${agent.role} (${agent.id})`);
  for (const check of agent.checks) {
    console.log(`  ${check.passed ? '✔' : '✘'} ${check.name}`);
  }
}

console.log('\n--------------------------------------------------------------------------------');
console.log(`Summary     : ${report.summary}`);
console.log(`Audit Time  : ${report.durationMs} ms`);
console.log(`Memory RSS  : ${report.memoryRssMB} MB (Budget: < 150 MB)`);
console.log(`Overall Gate: ${report.passed ? 'GREEN (PRODUCTION READY)' : 'RED (FAILED)'}`);
console.log('================================================================================');

if (!report.passed) {
  process.exit(1);
}

