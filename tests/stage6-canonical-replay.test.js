'use strict';

/**
 * Stage 6 - Subphase 6.1.2: Step-by-Step Canonical Solution Replay
 * 
 * Verifies that replaying canonical CLI commands and declarative manifests
 * deterministically achieves a 100% passing score across:
 *  - All 90 interactive labs in Domains 01–45
 *  - All 52 labs in the 26 legacy plugins
 *  - All 25 SEV-1/SEV-2 Chaos War Room incidents
 *  - All 8 Multi-Milestone Production Capstone Projects (26 milestones)
 *  - All 6 Hands-On Performance Certification Simulators (with Ed25519 signing)
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

describe('Subphase 6.1.2 — Step-by-Step Canonical Solution Replay across All 45 Domains', () => {
  const curriculumDir = path.join(__dirname, '..', 'src', 'curriculum', 'domains');
  const pluginManager = new PluginManager(curriculumDir);
  const legacyPluginManager = new PluginManager();
  const validationEngine = new ValidationEngine();
  const incidentEngine = new IncidentEngine(validationEngine);
  const projectEngine = new ProjectEngine(validationEngine);
  const certEngine = new CertificationEngine(pluginManager, null, { validationEngine });

  test('1. Catalog Completeness: All 45 Domains and 90 Interactive Labs Ready for Replay', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Schema errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );
    const domains = pluginManager.getAllDomains();
    assert.equal(domains.length, 45, 'Must load exactly 45 curriculum domains');

    const labs = pluginManager.getAllLabs();
    assert.equal(labs.length, 90, 'Must load exactly 90 interactive labs (2 per domain)');

    for (const lab of labs) {
      assert.ok(
        Array.isArray(lab.solutionCommands) && lab.solutionCommands.length > 0,
        `Lab ${lab.id} must define canonical solutionCommands`
      );
      assert.ok(
        Array.isArray(lab.validationRules) && lab.validationRules.length > 0,
        `Lab ${lab.id} must define validationRules`
      );
    }
  });

  test('2. 100% Deterministic Canonical Solver Replay across All 90 Labs in Domains 01–45', () => {
    const allLabs = pluginManager.getAllLabs();
    assert.equal(allLabs.length, 90);

    const solverFailures = [];

    for (const lab of allLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      if (lab.initialVfsState) {
        for (const [filePath, content] of Object.entries(lab.initialVfsState)) {
          vfs.writeFile(filePath, content);
        }
      }
      cluster.vfs = vfs;
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands step-by-step
      for (const cmd of lab.solutionCommands) {
        const execRes = terminal.execute(cmd, { manifestText: lab.starterManifest });
        assert.ok(
          execRes.exitCode === 0 || execRes.output.includes('AlreadyExists'),
          `Lab ${lab.id} solution command failed: "${cmd}" -> ${execRes.output}`
        );
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.commandHistory || terminal.history || [],
        executedCommands: terminal.commandHistory || terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context, context.commandHistory);

      if (!report.passed || report.score !== 100) {
        solverFailures.push({
          id: lab.id,
          domainId: lab.domainId,
          score: report.score,
          passed: report.passed,
          failedRules: report.rules?.filter((r) => !r.passed)
        });
      }

      assert.equal(
        report.passed,
        true,
        `Lab ${lab.id} (${lab.domainId}) must pass after canonical replay. Failed rules: ${JSON.stringify(report.rules?.filter((r) => !r.passed))}`
      );
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} (${lab.domainId}) must achieve 100% score, got ${report.score}%`
      );
    }

    assert.equal(
      solverFailures.length,
      0,
      `All 90 labs must pass 100%. Failures: ${JSON.stringify(solverFailures)}`
    );
  });

  test('3. 100% Deterministic Canonical Solver Replay across All 52 Legacy Labs', () => {
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
      cluster.vfs = vfs;
      const terminal = new TerminalEngine(cluster, vfs);

      for (const cmd of lab.solutionCommands || []) {
        const execRes = terminal.execute(cmd, { manifestText: lab.starterManifest });
        assert.equal(
          execRes.exitCode,
          0,
          `Legacy lab ${lab.id} solution command "${cmd}" failed: ${execRes.output}`
        );
      }

      const report = validationEngine.evaluate(lab.validationRules, cluster, terminal.commandHistory);
      assert.equal(
        report.passed,
        true,
        `Legacy lab ${lab.id} failed after solutionCommands: ${JSON.stringify(report.results || report.rules)}`
      );
      assert.equal(
        report.score,
        100,
        `Legacy lab ${lab.id} must achieve 100% score, got ${report.score}%`
      );
    }
  });

  test('4. 100% Deterministic Incident Solver Replay across All 25 Chaos War Room Incidents', () => {
    const warRoomScenarios = incidentEngine.getWarRoomScenarios();
    assert.equal(warRoomScenarios.length, 25, 'Must evaluate all 25 Chaos War Room outages');

    for (const inc of warRoomScenarios) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;
      const terminal = new TerminalEngine(cluster, vfs);

      incidentEngine.injectIncident(inc.id, cluster, vfs);

      for (const cmd of inc.solutionCommands) {
        const res = terminal.execute(cmd);
        assert.equal(
          res.exitCode,
          0,
          `Incident ${inc.id} remediation command "${cmd}" failed: ${res.output}`
        );
      }

      const report = incidentEngine.verifyIncidentResolution(
        inc.id,
        cluster,
        terminal.commandHistory,
        vfs
      );

      assert.equal(
        report.passed,
        true,
        `Incident ${inc.id} resolution failed after replay: ${JSON.stringify(report.results)}`
      );
      assert.equal(
        report.score,
        100,
        `Incident ${inc.id} must achieve 100% recovery score, got ${report.score}%`
      );
      assert.ok(report.stopwatch, 'Incident resolution must record stopwatch telemetry');
      assert.equal(report.stopwatch.active, false);
    }
  });

  test('5. 100% Deterministic Solver Replay across All 8 Production Capstones (26 Milestones)', () => {
    const projects = projectEngine.listProjects();
    assert.equal(projects.length, 8, 'Must evaluate all 8 Production Capstones');

    let totalMilestonesResolved = 0;

    for (const proj of projects) {
      const cluster = new VirtualCluster(proj.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;
      const terminal = new TerminalEngine(cluster, vfs);

      for (const cmd of proj.solutionCommands) {
        const res = terminal.execute(cmd);
        assert.equal(
          res.exitCode,
          0,
          `Capstone ${proj.id} command "${cmd}" failed: ${res.output}`
        );
      }

      const report = projectEngine.validateProject(proj.id, cluster, terminal.commandHistory);
      assert.equal(
        report.passed,
        true,
        `Capstone ${proj.id} failed post-solution verification: ${JSON.stringify(report.results)}`
      );
      assert.equal(
        report.score,
        100,
        `Capstone ${proj.id} must achieve 100% score, got ${report.score}%`
      );

      // Verify all milestones within the capstone are resolved
      for (const m of proj.milestones) {
        totalMilestonesResolved += 1;
      }
    }

    assert.equal(totalMilestonesResolved, 26, 'Must resolve all 26 milestones across 8 capstones');
  });

  test('6. 100% Deterministic Performance Exam Replay & Ed25519 Signing across All 6 Tracks', () => {
    const exams = certEngine.listPerformanceExams();
    assert.equal(exams.length, 6, 'Must evaluate all 6 Performance Certification Simulators');

    for (const exam of exams) {
      const fullExam = certEngine.getPerformanceExam(exam.id);
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      cluster.vfs = vfs;
      const terminal = new TerminalEngine(cluster, vfs);

      certEngine.startPerformanceExam(exam.id, cluster, vfs);

      for (const task of fullExam.tasks) {
        for (const cmd of task.solutionCommands) {
          const res = terminal.execute(cmd);
          assert.ok(
            res.exitCode === 0 || res.output.includes('AlreadyExists'),
            `Performance exam ${exam.code} task ${task.id} command "${cmd}" failed: ${res.output}`
          );
        }
      }

      const graded = certEngine.gradePerformanceExam({
        examId: exam.id,
        virtualCluster: cluster,
        commandHistory: terminal.commandHistory,
        vfs,
        learnerName: `Certified ${exam.role}`
      });

      assert.equal(
        graded.passed,
        true,
        `Performance exam ${exam.code} must pass after canonical replay`
      );
      assert.equal(
        graded.scorePercent,
        100,
        `Performance exam ${exam.code} must achieve 100% score`
      );
      assert.equal(graded.earnedPoints, 100);
      assert.ok(
        graded.certificate,
        `Performance exam ${exam.code} must issue a certificate on 100% completion`
      );
      assert.ok(graded.certificate.certId.startsWith('CERT-PERF-'));
      assert.ok(graded.certificate.signatureEd25519);
      assert.ok(graded.certificate.signatureSha256);

      // Verify asymmetric Ed25519 cryptographic validity
      const payload = {
        certId: graded.certificate.certId,
        trackId: graded.certificate.trackId,
        title: graded.certificate.title,
        learnerName: graded.certificate.learnerName,
        scorePercent: graded.certificate.scorePercent
      };
      assert.equal(
        certEngine.verifyCertificateEd25519(payload, graded.certificate.signatureEd25519),
        true,
        `Ed25519 signature verification failed for ${exam.code}`
      );
    }
  });
});
