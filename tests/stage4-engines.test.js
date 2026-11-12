'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ProjectEngine, CAPSTONE_PROJECTS } = require('../src/core/projectEngine');
const { ArchitectureEngine, ENTERPRISE_REFERENCE_ARCHITECTURES } = require('../src/core/architectureEngine');
const { AiMentor } = require('../src/core/aiMentor');
const { CertificationEngine } = require('../src/core/certificationEngine');

const { VirtualCluster } = require('../src/engine/virtualCluster');
const { TerminalEngine } = require('../src/engine/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { PluginManager } = require('../src/plugins/pluginManager');
const { KubeLabsDatabase } = require('../src/db/database');

test('Subphase 4.2.2: ProjectEngine - 8 Enterprise Capstones, Milestone & Full Validation', () => {
  const validationEngine = new ValidationEngine();
  const engine = new ProjectEngine(validationEngine);

  assert.equal(engine.listProjects().length, 8);
  assert.equal(CAPSTONE_PROJECTS.length, 8);

  const tracks = engine.listTracks();
  assert.ok(tracks.length >= 5);

  const platformProjects = engine.getProjectsByTrack('track-platform');
  assert.ok(platformProjects.length >= 2);
  assert.ok(platformProjects.some((p) => p.id === 'proj-07-multitenant-vcluster-platform'));

  // Test Capstone 1 milestone validation
  const proj1 = engine.getProject('proj-01-hardened-edge-node');
  assert.ok(proj1);
  assert.equal(proj1.milestones.length, 3);

  const cluster = new VirtualCluster(proj1.initialClusterState);
  const term = new TerminalEngine(cluster);

  // Before executing milestone 1: fails
  const m1Before = engine.validateMilestone(proj1.id, 1, cluster, term.commandHistory);
  assert.equal(m1Before.passed, false);

  // Execute milestone 1 solution command
  term.execute(proj1.solutionCommands[0]);
  const m1After = engine.validateMilestone(proj1.id, 1, cluster, term.commandHistory);
  assert.equal(m1After.passed, true);

  // Execute remaining solution commands
  for (let i = 1; i < proj1.solutionCommands.length; i++) {
    term.execute(proj1.solutionCommands[i]);
  }

  // Full project validation should pass
  const fullValidate = engine.validateProject(proj1.id, cluster, term.commandHistory);
  assert.equal(fullValidate.passed, true);
  assert.equal(fullValidate.xpReward, 400);
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

    // IaC Compilation
    const compiled = engine.compileToManifests(ref.nodes, ref.edges);
    assert.ok(compiled.kubernetesYaml.length > 0);
    assert.ok(compiled.kubernetesYaml.includes('apiVersion:'));
    assert.ok(compiled.opentofuHcl.length > 0);
    assert.ok(compiled.opentofuHcl.includes('terraform {'));
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

  // 1. Socratic Hint mode
  const hintReply = mentor.respond({
    mode: 'hint',
    query: 'How do I expose my deployment?',
    cluster
  });
  assert.equal(hintReply.mode, 'hint');
  assert.ok(hintReply.response.includes('Socratic'));
  assert.ok(hintReply.timestamp);

  // 2. Debug Error mode
  const debugReply = mentor.respond({
    mode: 'debug-error',
    cluster,
    commandHistory: ['kubectl apply -f bad.yaml']
  });
  assert.equal(debugReply.mode, 'debug-error');
  assert.ok(debugReply.response.includes('Root-Cause Diagnostic Analysis'));

  // 3. Explain Concept mode
  const explainReply = mentor.respond({
    mode: 'explain',
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

  // 4. Exam grading and Ed25519 signature issuance
  const allQuestions = pm.getTrackQuestions('track-foundations');
  const perfectAnswers = {};
  for (const q of allQuestions) {
    perfectAnswers[q.id] = q.correctIndex;
  }

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

  // 5. Ed25519 signature verification
  const edVerify = engine.verifyCertificate(graded.certificate.certId, graded.certificate.signatureEd25519);
  assert.equal(edVerify.valid, true);
  assert.equal(edVerify.algorithm, 'ed25519');

  // 6. HMAC-SHA256 signature verification fallback
  const shaVerify = engine.verifyCertificate(graded.certificate.certId, graded.certificate.signatureSha256);
  assert.equal(shaVerify.valid, true);
  assert.equal(shaVerify.algorithm, 'hmac-sha256');

  // 7. Forged signature rejection
  const forgedSig = 'f'.repeat(128);
  const forgedVerify = engine.verifyCertificate(graded.certificate.certId, forgedSig);
  assert.equal(forgedVerify.valid, false);

  // 8. 26-Domain Skill Radar computation
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
