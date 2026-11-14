/**
 * tests/stage5-capstones-war-room.test.js
 * Subphase 5.3.2 Verification: Production Capstones & Chaos War Room Expansion
 * Validates 8 Enterprise Production Capstone Projects across all 6 learning tracks,
 * and 25 SEV-1/SEV-2 Incident Chaos War Room scenarios across all 8 outage categories,
 * with deterministic 0% pre-score and 100% post-score resolution verification.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { ProjectEngine, CAPSTONE_PROJECTS } = require('../src/core/projectEngine');
const {
  IncidentEngine,
  INCIDENT_SCENARIOS,
  V4_CHAOS_WAR_ROOM_INCIDENTS,
  INCIDENT_CATEGORIES
} = require('../src/core/incidentEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');

describe('Subphase 5.3.2 — Production Capstones & Chaos War Room Expansion', () => {
  const validationEngine = new ValidationEngine();
  const projectEngine = new ProjectEngine(validationEngine);
  const incidentEngine = new IncidentEngine(validationEngine);

  it('1. Capstone Catalog: 8 Multi-Milestone Enterprise Production Capstones across all 6 tracks', () => {
    const projects = projectEngine.listProjects();
    assert.equal(projects.length, 8, 'Must have exactly 8 production capstone projects');
    assert.equal(CAPSTONE_PROJECTS.length, 8);

    const requiredTracks = [
      'track-foundations',
      'track-k8s-admin',
      'track-devsecops',
      'track-sre',
      'track-platform',
      'track-multicloud-aiops'
    ];

    for (const trackId of requiredTracks) {
      const trackProjects = projectEngine.listProjects(trackId);
      assert.ok(
        trackProjects.length >= 1,
        `Track ${trackId} must have at least 1 production capstone`
      );
    }

    for (const proj of projects) {
      assert.ok(proj.id, 'Capstone must have id');
      assert.ok(proj.title, 'Capstone must have title');
      assert.ok(proj.trackId, 'Capstone must have trackId');
      assert.ok(
        Array.isArray(proj.milestones) && proj.milestones.length >= 3,
        `Capstone ${proj.id} must have >= 3 milestones`
      );
      assert.ok(
        Array.isArray(proj.validationRules) && proj.validationRules.length >= 3,
        `Capstone ${proj.id} must have >= 3 validation rules`
      );
      assert.ok(
        Array.isArray(proj.solutionCommands) && proj.solutionCommands.length >= 3,
        `Capstone ${proj.id} must have >= 3 solution commands`
      );
      assert.ok(proj.xpReward >= 400, `Capstone ${proj.id} must award >= 400 XP`);
    }
  });

  it('2. Deterministic Capstone Solver: All 8 Capstones fail initially (0%) and pass 100% after replay', () => {
    for (const proj of projectEngine.listProjects()) {
      const cluster = new VirtualCluster(proj.initialClusterState);
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Before solution: must fail
      const preValidation = projectEngine.validateProject(proj.id, cluster, []);
      assert.equal(
        preValidation.passed,
        false,
        `Capstone ${proj.id} must fail before solution replay`
      );

      // Execute canonical solution commands
      for (const cmd of proj.solutionCommands) {
        const res = terminal.execute(cmd);
        assert.equal(
          res.exitCode,
          0,
          `Command "${cmd}" in capstone ${proj.id} failed with exitCode ${res.exitCode}: ${res.output}`
        );
      }

      // After solution: all milestones and full validation must pass
      for (const m of proj.milestones) {
        const mAfter = projectEngine.validateMilestone(
          proj.id,
          m.milestoneNumber,
          cluster,
          terminal.commandHistory
        );
        assert.equal(
          mAfter.passed,
          true,
          `Milestone ${m.milestoneNumber} in capstone ${proj.id} failed: ${JSON.stringify(mAfter.results)}`
        );
      }

      const postValidation = projectEngine.validateProject(
        proj.id,
        cluster,
        terminal.commandHistory
      );
      assert.equal(
        postValidation.passed,
        true,
        `Full validation for capstone ${proj.id} failed: ${JSON.stringify(postValidation.results)}`
      );
      assert.equal(postValidation.score, 100);
    }
  });

  it('3. Chaos War Room: 25 SEV-1/SEV-2 Incident Scenarios across all 8 outage categories', () => {
    const warRoomScenarios = incidentEngine.getWarRoomScenarios();
    assert.equal(
      warRoomScenarios.length,
      25,
      'Chaos War Room must contain exactly 25 incident scenarios'
    );
    assert.equal(V4_CHAOS_WAR_ROOM_INCIDENTS.length, 25);

    // Verify all 8 categories are represented
    const categoriesFound = new Set(warRoomScenarios.map((s) => s.category));
    for (const cat of INCIDENT_CATEGORIES) {
      assert.ok(
        categoriesFound.has(cat),
        `Category "${cat}" must be represented in Chaos War Room scenarios`
      );
    }

    // Verify scenario schema compliance
    for (const inc of warRoomScenarios) {
      assert.ok(inc.id, 'Scenario must have id');
      assert.ok(inc.title, 'Scenario must have title');
      assert.ok(
        inc.severity.includes('SEV-1') || inc.severity.includes('SEV-2'),
        `Scenario ${inc.id} severity must be SEV-1 or SEV-2`
      );
      assert.ok(inc.domainId, `Scenario ${inc.id} must define domainId`);
      assert.ok(inc.alertSummary, `Scenario ${inc.id} must define alertSummary`);
      assert.ok(inc.customerImpact, `Scenario ${inc.id} must define customerImpact`);
      assert.ok(
        Array.isArray(inc.symptoms) && inc.symptoms.length >= 1,
        `Scenario ${inc.id} must have symptoms`
      );
      assert.ok(
        Array.isArray(inc.diagnosticHints) && inc.diagnosticHints.length >= 1,
        `Scenario ${inc.id} must have diagnosticHints`
      );
      assert.ok(inc.initialClusterState, `Scenario ${inc.id} must have initialClusterState`);
      assert.ok(
        Array.isArray(inc.validationRules) && inc.validationRules.length >= 1,
        `Scenario ${inc.id} must have validationRules`
      );
      assert.ok(
        Array.isArray(inc.solutionCommands) && inc.solutionCommands.length >= 1,
        `Scenario ${inc.id} must have solutionCommands`
      );
      assert.ok(inc.xpReward >= 200, `Scenario ${inc.id} must award >= 200 XP`);
    }
  });

  it('4. Deterministic Chaos War Room Solver: All 25 Incidents fail initially (0%) and pass 100% after replay', () => {
    const warRoomScenarios = incidentEngine.getWarRoomScenarios();

    for (const inc of warRoomScenarios) {
      const cluster = new VirtualCluster();
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // 1. Inject incident
      incidentEngine.injectIncident(inc.id, cluster, vfs);

      // 2. Pre-solution check: MUST fail
      const preCheck = incidentEngine.verifyIncidentResolution(inc.id, cluster, [], vfs);
      assert.equal(
        preCheck.passed,
        false,
        `Incident ${inc.id} must fail before solution replay`
      );

      // 3. Execute canonical solution commands
      for (const cmd of inc.solutionCommands) {
        const res = terminal.execute(cmd);
        assert.equal(
          res.exitCode,
          0,
          `Command "${cmd}" in incident ${inc.id} failed: ${res.output}`
        );
      }

      // 4. Post-solution check: MUST pass 100%
      const postCheck = incidentEngine.verifyIncidentResolution(
        inc.id,
        cluster,
        terminal.commandHistory,
        vfs
      );
      assert.equal(
        postCheck.passed,
        true,
        `Incident ${inc.id} failed post-solution verification: ${JSON.stringify(postCheck.results)}`
      );
      assert.equal(postCheck.score, 100);
    }
  });

  it('5. Engine Parity: War Room API, MTTR Stopwatch & Category Filtering', () => {
    // List War Room incidents
    const allWarRoom = incidentEngine.listWarRoomIncidents();
    assert.equal(allWarRoom.length, 25);

    // Filter by category
    const slowAppIncidents = incidentEngine.listWarRoomIncidents('slow_app');
    assert.ok(slowAppIncidents.length >= 3, 'Must find >= 3 slow_app incidents');

    const netIncidents = incidentEngine.listWarRoomIncidents('networking_outage');
    assert.ok(netIncidents.length >= 2, 'Must find >= 2 networking_outage incidents');

    // Stopwatch tracking verification
    const testCluster = new VirtualCluster();
    incidentEngine.injectIncident('inc-20-velero-backup-dr-mismatch', testCluster);
    const swActive = incidentEngine.getStopwatch('inc-20-velero-backup-dr-mismatch');
    assert.ok(swActive, 'Stopwatch must be active after injection');
    assert.equal(swActive.active, true);

    const term = new TerminalEngine(testCluster);
    const inc = incidentEngine.getIncident('inc-20-velero-backup-dr-mismatch');
    for (const cmd of inc.solutionCommands) {
      term.execute(cmd);
    }

    const resolved = incidentEngine.verifyIncidentResolution(
      'inc-20-velero-backup-dr-mismatch',
      testCluster,
      term.commandHistory
    );
    assert.equal(resolved.passed, true);
    assert.ok(resolved.stopwatch, 'Resolved report must include stopwatch');
    assert.equal(resolved.stopwatch.active, false);
    assert.ok(resolved.stopwatch.elapsedMs >= 0);
    assert.ok(resolved.stopwatch.durationMs >= 0);
  });
});
