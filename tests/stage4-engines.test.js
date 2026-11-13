'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ProjectEngine, CAPSTONE_PROJECTS } = require('../src/core/projectEngine');
const { ArchitectureEngine, ENTERPRISE_REFERENCE_ARCHITECTURES } = require('../src/core/architectureEngine');
const { AiMentor } = require('../src/core/aiMentor');
const { CertificationEngine } = require('../src/core/certificationEngine');

const { VirtualCluster } = require('../src/core/virtualCluster');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ValidationEngine } = require('../src/core/validationEngine');
const { SessionManager } = require('../src/core/sessionManager');
const { PluginManager } = require('../src/plugins/pluginManager');
const { KubeLabsDatabase } = require('../src/db/database');

test('Subphase 4.2.1: ProjectEngine - 8 Enterprise Capstones Catalog, Track Filtering & Milestone Validation', () => {
  const validationEngine = new ValidationEngine();
  const engine = new ProjectEngine(validationEngine);

  assert.equal(engine.listProjects().length, 8);
  assert.equal(CAPSTONE_PROJECTS.length, 8);

  // 1. Verify all 6 tracks have projects
  const tracks = engine.listTracks();
  assert.ok(tracks.length >= 5);

  const expectedTracks = [
    'track-foundations',
    'track-k8s-admin',
    'track-devsecops',
    'track-sre',
    'track-platform',
    'track-multicloud-aiops'
  ];
  for (const tId of expectedTracks) {
    const projs = engine.listProjects(tId);
    assert.ok(projs.length >= 1, `Track ${tId} must have at least 1 project`);
    assert.equal(engine.getProjectsByTrack(tId).length, projs.length);
  }

  // 2. Test Milestone Validation across all 8 Capstone Projects
  for (const proj of engine.listProjects()) {
    assert.ok(proj.id, 'Project must have id');
    assert.ok(proj.title, 'Project must have title');
    assert.ok(proj.trackId, 'Project must have trackId');
    assert.ok(Array.isArray(proj.milestones) && proj.milestones.length >= 3, `Project ${proj.id} must have >= 3 milestones`);
    assert.ok(Array.isArray(proj.validationRules) && proj.validationRules.length >= 3, `Project ${proj.id} must have >= 3 rules`);
    assert.ok(Array.isArray(proj.solutionCommands) && proj.solutionCommands.length >= 3, `Project ${proj.id} must have >= 3 solutionCommands`);
    assert.ok(proj.xpReward >= 400, `Project ${proj.id} must have >= 400 XP`);

    const cluster = new VirtualCluster(proj.initialClusterState);
    const term = new TerminalEngine(cluster);

    // Initial project check: MUST fail
    const initialCheck = engine.validateProject(proj.id, cluster, []);
    assert.equal(initialCheck.passed, false, `Project ${proj.id} must fail before solution`);

    // Initial milestone 1 check: MUST fail
    const m1Before = engine.validateMilestone(proj.id, 1, cluster, []);
    assert.equal(m1Before.passed, false, `Milestone 1 for ${proj.id} must fail before solution`);

    // Execute all solution commands
    for (const cmd of proj.solutionCommands) {
      const res = term.execute(cmd);
      assert.equal(res.exitCode, 0, `Command "${cmd}" failed in project ${proj.id}: ${res.output}`);
    }

    // After all commands: every milestone must pass
    for (const m of proj.milestones) {
      const mAfter = engine.validateMilestone(proj.id, m.milestoneNumber, cluster, term.commandHistory);
      assert.equal(mAfter.passed, true, `Milestone ${m.milestoneNumber} for ${proj.id} must pass after solution: ${JSON.stringify(mAfter.results)}`);
    }

    // Full project validation: MUST pass 100%
    const fullValidate = engine.validateProject(proj.id, cluster, term.commandHistory);
    assert.equal(fullValidate.passed, true, `Full validation for ${proj.id} failed: ${JSON.stringify(fullValidate.results)}`);
    assert.equal(fullValidate.score, 100);
    assert.equal(fullValidate.xpReward, proj.xpReward);
  }
});

test('Subphase 4.2.1: SessionManager.bindProject lifecycle and cluster state reset', () => {
  const sessionManager = new SessionManager();
  const session = sessionManager.getSession('capstone-session');
  const engine = new ProjectEngine();

  const proj = engine.getProject('proj-02-gitops-ha-commerce');
  assert.ok(proj);

  const bound = sessionManager.bindProject(session.sessionId, proj, engine);
  assert.equal(bound.activeProjectId, 'proj-02-gitops-ha-commerce');
  assert.equal(session.activeProjectId, 'proj-02-gitops-ha-commerce');
  assert.equal(session.activeContextType, 'project');
  assert.equal(session.activeLabId, null);
  assert.equal(session.activeIncidentId, null);

  // Initial validation in session: must fail
  const initialCheck = engine.validateProject(proj.id, session.cluster, session.terminal.commandHistory);
  assert.equal(initialCheck.passed, false);

  // Execute commands in session terminal
  for (const cmd of proj.solutionCommands) {
    const res = session.terminal.execute(cmd);
    assert.equal(res.exitCode, 0);
  }

  // Solved validation in session: must pass 100%
  const solvedCheck = engine.validateProject(proj.id, session.cluster, session.terminal.commandHistory);
  assert.equal(solvedCheck.passed, true);
  assert.equal(solvedCheck.score, 100);
});

test('Subphase 4.2.2: ArchitectureEngine - 8 Reference Architectures, 4-Pillar Scoring & IaC Compilation', () => {
  const engine = new ArchitectureEngine();

  const refs = engine.listReferenceArchitectures();
  assert.equal(refs.length, 8);
  assert.equal(ENTERPRISE_REFERENCE_ARCHITECTURES.length, 8);

  for (const ref of refs) {
    assert.ok(ref.id);
    assert.ok(ref.name);
    assert.ok(ref.category);
    assert.ok(Array.isArray(ref.nodes));
    assert.ok(Array.isArray(ref.edges));

    // Topology Analysis
    const analysis = engine.analyzeTopology(ref.nodes, ref.edges);
    assert.ok(analysis.overallScore >= 50);
    assert.ok(analysis.pillars.reliability >= 50);
    assert.ok(analysis.pillars.security >= 50);
    assert.ok(analysis.pillars.observability >= 40);
    assert.ok(analysis.pillars.operationalExcellence >= 40);
    assert.ok(analysis.estimatedMonthlyCostUsd > 0);

    // IaC Compilation & VirtualCluster Deployment
    const compiled = engine.compileToManifests(ref.nodes, ref.edges);
    assert.ok(compiled.kubernetesYaml.length > 0);
    assert.ok(compiled.kubernetesYaml.includes('apiVersion:'));
    assert.ok(compiled.opentofuHcl.length > 0);
    assert.ok(compiled.opentofuHcl.includes('terraform {'));

    // Deploy compiled architecture directly into VirtualCluster
    const cluster = new VirtualCluster();
    cluster.applyManifest(compiled.kubernetesYaml);
    cluster.reconcile();
    assert.ok(cluster.state.resources.length > 0, `Architecture ${ref.id} should provision cluster resources`);
  }

  // Test SPOF detection on single replica node
  const singleReplicaNodes = [
    { id: 'app', type: 'deployment', label: 'fragile-api', replicas: 1, namespace: 'default' }
  ];
  const spofAnalysis = engine.analyzeTopology(singleReplicaNodes, []);
  assert.ok(spofAnalysis.spofs.length > 0);
  assert.ok(spofAnalysis.spofs[0].includes('Single Point of Failure'));
});

test('Subphase 4.2.2: AiMentor - Socratic Hint, Debug, Explain & CIS Security Benchmark', () => {
  const validationEngine = new ValidationEngine();
  const mentor = new AiMentor(validationEngine);
  const cluster = new VirtualCluster();

  // Seed sample deployment
  cluster.applyManifest(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-api
  namespace: production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payments-api
  template:
    metadata:
      labels:
        app: payments-api
    spec:
      containers:
        - name: app
          image: nginx:1.27
`);
  cluster.reconcile();

  const mockLab = {
    id: 'lab-test-socratic',
    title: 'High-Availability Payments Scaling',
    validationRules: [
      {
        id: 'r1',
        description: 'Deployment payments-api has at least 3 ready replicas',
        type: 'replica_count_min',
        kind: 'Deployment',
        name: 'payments-api',
        namespace: 'production',
        expectedValue: 3,
        remediation: 'Run `kubectl scale deployment payments-api --replicas=3 -n production`.'
      }
    ]
  };

  // 1. Socratic Hint mode with unmet rule
  const hintReply = mentor.respond({
    mode: 'hint',
    activeLab: mockLab,
    cluster
  });
  assert.equal(hintReply.mode, 'hint');
  assert.ok(hintReply.response.includes('Socratic Mentor'));
  assert.ok(hintReply.response.includes('Next Objective Focus'));
  assert.ok(hintReply.response.includes('Observed Cluster State'));
  assert.ok(hintReply.response.includes('Target State'));
  assert.ok(hintReply.response.includes('Actionable Hint'));
  assert.ok(hintReply.timestamp);

  // 2. Debug Error mode with broken pod
  cluster.state.resources.push({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'failing-pod', namespace: 'production' },
    status: { reason: 'CrashLoopBackOff', message: 'Process exited with code 1' }
  });
  const debugReply = mentor.respond({
    mode: 'debug-error',
    cluster,
    commandHistory: ['kubectl apply -f bad.yaml']
  });
  assert.equal(debugReply.mode, 'debug-error');
  assert.ok(debugReply.response.includes('Root-Cause Diagnostic Analysis'));
  assert.ok(debugReply.response.includes('CrashLoopBackOff'));

  // 3. Explain Concept mode
  const explainReply = mentor.respond({
    mode: 'explain',
    activeLab: mockLab,
    query: 'reconciliation loop',
    cluster
  });
  assert.equal(explainReply.mode, 'explain');
  assert.ok(explainReply.response.includes('Architectural Deep-Dive'));
  assert.ok(explainReply.response.includes('Declarative Desired State'));

  // 4. CIS Security Audit mode
  const auditReply = mentor.respond({
    mode: 'security-audit',
    cluster
  });
  assert.equal(auditReply.mode, 'security-audit');
  assert.ok(auditReply.response.includes('CIS Kubernetes Benchmark'));
  assert.ok(auditReply.response.includes('CIS-5.2.6'));
  assert.ok(auditReply.response.includes('CIS-5.3.2'));
});

test('Subphase 4.2.2: CertificationEngine - Ed25519 Digital Signatures, Exam Grading & Skill Radar', () => {
  const pm = new PluginManager();
  const db = new KubeLabsDatabase(':memory:');
  const engine = new CertificationEngine(pm, db);

  // 1. Verify Ed25519 public key presence
  const pubKey = engine.getPublicKey();
  assert.ok(pubKey);
  assert.ok(pubKey.includes('BEGIN PUBLIC KEY'));

  // 2. Exam track listing
  const tracks = engine.listExamTracks();
  assert.equal(tracks.length, 6);
  for (const track of tracks) {
    assert.ok(track.id);
    assert.ok(track.title);
    assert.ok(track.certificationTitle);
    assert.ok(track.questionCount > 0);
  }

  // 3. Client question retrieval (answers stripped)
  const clientQuestions = engine.getExamQuestionsForClient('track-foundations');
  assert.equal(clientQuestions.trackId, 'track-foundations');
  assert.ok(clientQuestions.questions.length > 0);
  assert.equal(clientQuestions.questions[0].correctIndex, undefined);

  // 4. Exam grading with failing score (< 75%)
  const failingAnswers = {};
  for (const q of clientQuestions.questions) {
    failingAnswers[q.id] = 999; // Incorrect answer
  }
  const failedExam = engine.gradeExam({
    trackId: 'track-foundations',
    answers: failingAnswers,
    learnerName: 'Test Student'
  });
  assert.equal(failedExam.passed, false);
  assert.equal(failedExam.scorePercent, 0);
  assert.equal(failedExam.certificate, null);

  // 5. Exam grading and Ed25519 signature issuance
  const allQuestions = pm.getTrackQuestions('track-foundations');
  const perfectAnswers = {};
  for (const q of allQuestions) {
    perfectAnswers[q.id] = q.correctIndex;
  }

  const initialProfile = db.getProfile();
  const initialXp = (initialProfile.profile && initialProfile.profile.xp) || 0;

  const graded = engine.gradeExam({
    trackId: 'track-foundations',
    answers: perfectAnswers,
    learnerName: 'Enterprise Cloud Architect'
  });
  assert.equal(graded.passed, true);
  assert.equal(graded.scorePercent, 100);
  assert.ok(graded.certificate);
  assert.ok(graded.certificate.certId);
  assert.ok(graded.certificate.signatureEd25519);
  assert.ok(graded.certificate.signatureSha256);

  // Verify XP was awarded (+500 XP)
  const updatedProfile = db.getProfile();
  assert.equal(updatedProfile.profile.xp, initialXp + 500);

  // 6. Ed25519 signature verification
  const edVerify = engine.verifyCertificate(graded.certificate.certId, graded.certificate.signatureEd25519);
  assert.equal(edVerify.valid, true);
  assert.equal(edVerify.algorithm, 'ed25519');

  // 7. HMAC-SHA256 signature verification fallback
  const shaVerify = engine.verifyCertificate(graded.certificate.certId, graded.certificate.signatureSha256);
  assert.equal(shaVerify.valid, true);
  assert.equal(shaVerify.algorithm, 'hmac-sha256');

  // 8. Forged signature rejection
  const forgedSig = 'f'.repeat(128);
  const forgedVerify = engine.verifyCertificate(graded.certificate.certId, forgedSig);
  assert.equal(forgedVerify.valid, false);

  // 9. Tampered certificate payload detection
  const tamperedPayload = {
    certId: graded.certificate.certId,
    trackId: 'track-foundations',
    title: graded.certificate.title,
    learnerName: 'Impostor', // Tampered name
    scorePercent: 100
  };
  const tamperedVerify = engine.verifyCertificateEd25519(tamperedPayload, graded.certificate.signatureEd25519);
  assert.equal(tamperedVerify, false);

  // 10. 26-Domain Skill Radar computation
  const radar = engine.computeDomainSkillRadar();
  assert.equal(radar.length, 26);
  for (const domain of radar) {
    assert.ok(domain.domainId);
    assert.ok(domain.title);
    assert.ok(domain.category);
    assert.equal(typeof domain.masteryPercent, 'number');
  }

  db.close();
});
