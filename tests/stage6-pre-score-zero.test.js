'use strict';

/**
 * Stage 6 - Subphase 6.1.1: Pre-Solution Zero-Score Assertion
 * 
 * Verifies that on a clean cluster reset or initial fault injection,
 * EVERY SINGLE lab across all 45 domains, all 25 chaos incidents,
 * all 8 capstone projects, and all 6 performance certification simulators
 * deterministically scores 0% and fails verification before solutions are applied.
 * 
 * Zero external dependencies.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ProjectEngine } = require('../src/core/projectEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');

describe('Subphase 6.1.1 — Pre-Solution Zero-Score Assertion across All 45 Domains', () => {
  const curriculumDir = path.join(__dirname, '..', 'src', 'curriculum', 'domains');
  const pluginManager = new PluginManager(curriculumDir);
  const legacyPluginManager = new PluginManager();
  const validationEngine = new ValidationEngine();
  const incidentEngine = new IncidentEngine(validationEngine);
  const projectEngine = new ProjectEngine(validationEngine);
  const certEngine = new CertificationEngine(pluginManager, null, { validationEngine });

  test('1. Catalog Completeness: All 45 Domains and 90 Interactive Labs Load Without Errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Schema validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domains = pluginManager.getAllDomains();
    assert.equal(domains.length, 45, 'Must load exactly 45 curriculum domains');

    const labs = pluginManager.getAllLabs();
    assert.equal(labs.length, 90, 'Must load exactly 90 interactive labs (2 per domain)');

    // Ensure every domain has an id, title, category, trackId, and 2 labs
    for (const d of domains) {
      assert.ok(d.id, `Domain must have an id: ${JSON.stringify(d)}`);
      assert.ok(d.title, `Domain ${d.id} must have a title`);
      assert.ok(d.category, `Domain ${d.id} must have a category`);
      assert.ok(d.trackId, `Domain ${d.id} must have a trackId`);
      assert.equal(d.labs.length, 2, `Domain ${d.id} must have exactly 2 labs`);
    }
  });

  test('2. 100% Pre-Solution Zero-Score Proof across All 90 Labs in Domains 01–45', () => {
    const allLabs = pluginManager.getAllLabs();
    assert.equal(allLabs.length, 90);

    const nonZeroPreScores = [];

    for (const lab of allLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      if (lab.initialVfsState) {
        for (const [filePath, content] of Object.entries(lab.initialVfsState)) {
          vfs.writeFile(filePath, content);
        }
      }
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);

      if (report.score !== 0 || report.passed !== false) {
        nonZeroPreScores.push({
          id: lab.id,
          domainId: lab.domainId,
          score: report.score,
          passed: report.passed,
          rules: report.rules
        });
      }

      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} (${lab.domainId}) pre-solution score must be 0%, got ${report.score}%`
      );
      assert.equal(
        report.passed,
        false,
        `Lab ${lab.id} (${lab.domainId}) must fail verification before solution replay`
      );
    }

    assert.equal(
      nonZeroPreScores.length,
      0,
      `All 90 labs must score 0% before solution. Violations: ${JSON.stringify(nonZeroPreScores)}`
    );
  });

  test('3. Pre-Solution Zero-Score Proof across All 52 Labs in Legacy Plugins Directory', () => {
    const legacyLabs = legacyPluginManager.getAllLabs();
    assert.equal(legacyLabs.length, 52);

    for (const lab of legacyLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      if (lab.initialVfsState) {
        for (const [filePath, content] of Object.entries(lab.initialVfsState)) {
          vfs.writeFile(filePath, content);
        }
      }
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);

      assert.equal(
        report.score,
        0,
        `Legacy lab ${lab.id} pre-solution score must be 0%, got ${report.score}%`
      );
      assert.equal(
        report.passed,
        false,
        `Legacy lab ${lab.id} must fail verification before solution replay`
      );
    }
  });

  test('4. Pre-Solution Zero-Score Proof across All 25 Chaos War Room Incidents', () => {
    const warRoomScenarios = incidentEngine.getWarRoomScenarios();
    assert.equal(warRoomScenarios.length, 25, 'Must evaluate all 25 Chaos War Room outages');

    for (const inc of warRoomScenarios) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;

      incidentEngine.injectIncident(inc.id, cluster, vfs);

      const report = incidentEngine.verifyIncidentResolution(inc.id, cluster, [], vfs);

      assert.equal(
        report.passed,
        false,
        `Incident ${inc.id} must fail resolution verification on initial fault injection`
      );
      assert.ok(
        report.score < 100,
        `Incident ${inc.id} pre-score must not pass (< 100%), got ${report.score}%`
      );
    }
  });

  test('5. Pre-Solution Zero-Score Proof across All 8 Production Capstone Projects', () => {
    const projects = projectEngine.listProjects();
    assert.equal(projects.length, 8, 'Must evaluate all 8 Production Capstones');

    for (const proj of projects) {
      const cluster = new VirtualCluster(proj.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;

      const report = projectEngine.validateProject(proj.id, cluster, []);

      assert.equal(
        report.score,
        0,
        `Capstone ${proj.id} pre-score must be 0%, got ${report.score}%`
      );
      assert.equal(
        report.passed,
        false,
        `Capstone ${proj.id} must fail validation before milestone execution`
      );
    }
  });

  test('6. Pre-Solution Zero-Score Proof across All 6 Performance Certification Simulators', () => {
    const exams = certEngine.listPerformanceExams();
    assert.equal(exams.length, 6, 'Must evaluate all 6 Performance Certification Simulators');

    for (const exam of exams) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;

      certEngine.startPerformanceExam(exam.id, cluster, vfs);

      const graded = certEngine.gradePerformanceExam({
        examId: exam.id,
        virtualCluster: cluster,
        commandHistory: [],
        vfs,
        learnerName: 'Pre-Test Audit Candidate'
      });

      assert.equal(
        graded.scorePercent,
        0,
        `Performance exam ${exam.code} (${exam.id}) pre-score must be 0%, got ${graded.scorePercent}%`
      );
      assert.equal(
        graded.passed,
        false,
        `Performance exam ${exam.code} must not pass before candidate solutions`
      );
      assert.equal(
        graded.certificate,
        null,
        `Performance exam ${exam.code} must not issue a certificate on pre-solution state`
      );
    }
  });
});
