'use strict';

/**
 * Stage 5 - Subphase 5.3.3: Hands-On Performance Certification Simulators
 * 
 * Validates the practical performance certification exam simulators across
 * all 6 tracks (KCNA, CKA, CKS, CKRE, CPA, CMAOS), ensuring:
 *  - Comprehensive hands-on exam catalog with task weights summing to 100
 *  - Deterministic pre-solution zero-score assertion on clean/faulted state
 *  - Deterministic post-solution 100% score upon canonical solution replay
 *  - Asymmetric Ed25519 & HMAC-SHA256 dual cryptographic certificate signing
 *  - Forgery detection and tampered payload rejection
 *  - Stopwatch timing and API router endpoint parity
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { CertificationEngine, PERFORMANCE_EXAMS } = require('../src/core/certificationEngine');
const { PluginManager } = require('../src/plugins/pluginManager');
const { KubeLabsDatabase } = require('../src/db/database');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');
const { ApiRouter } = require('../src/api/router');
const { SessionManager } = require('../src/core/sessionManager');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ArchitectureEngine } = require('../src/core/architectureEngine');
const { AiMentor } = require('../src/core/aiMentor');
const { AgentOrchestrator } = require('../src/agents/orchestrator');

describe('Subphase 5.3.3 — Hands-On Performance Certification Simulators', () => {
  const pm = new PluginManager();
  const db = new KubeLabsDatabase(':memory:');
  const validator = new ValidationEngine();
  const certEngine = new CertificationEngine(pm, db, { validationEngine: validator });

  test('1. Performance Exam Catalog: 6 Role-Based Practical Simulators across all tracks', () => {
    const exams = certEngine.listPerformanceExams();
    assert.equal(exams.length, 6, 'Must expose exactly 6 practical performance certification exams');

    const expectedCodes = ['KCNA-SIM', 'CKA-SIM', 'CKS-SIM', 'CKRE-SIM', 'CPA-SIM', 'CMAOS-SIM'];
    for (const code of expectedCodes) {
      const match = exams.find((e) => e.code === code);
      assert.ok(match, `Performance exam ${code} must be registered in catalog`);
      assert.ok(match.id, 'Exam ID must be present');
      assert.ok(match.trackId, 'Track ID must be present');
      assert.ok(match.title, 'Title must be present');
      assert.ok(match.certificationTitle, 'Certification title must be present');
      assert.ok(match.durationMinutes >= 60, 'Duration must be at least 60 minutes');
      assert.equal(match.passingScorePercent, 75, 'Passing score must be 75%');
      assert.ok(match.taskCount >= 4, 'Must have at least 4 practical tasks');
      assert.equal(match.totalWeight, 100, `Task weights for ${code} must sum exactly to 100`);
    }

    // Verify track listing integration
    const tracks = certEngine.listExamTracks();
    assert.equal(tracks.length, 6);
    for (const track of tracks) {
      assert.equal(track.performanceExamAvailable, true);
      assert.ok(track.performanceExamId);
      assert.ok(track.performanceExamCode);
      assert.ok(track.performanceTasksCount >= 4);
    }
  });

  test('2. Client-Safe Exam Retrieval: Solution commands stripped from candidate payload', () => {
    for (const exam of PERFORMANCE_EXAMS) {
      const clientPayload = certEngine.getPerformanceExamForClient(exam.id);
      assert.ok(clientPayload);
      assert.equal(clientPayload.id, exam.id);
      assert.equal(clientPayload.code, exam.code);
      assert.equal(clientPayload.tasks.length, exam.tasks.length);

      for (const task of clientPayload.tasks) {
        assert.ok(task.id);
        assert.ok(task.title);
        assert.ok(task.weight > 0);
        assert.ok(task.description);
        assert.equal(task.solutionCommands, undefined, 'Solution commands must be stripped from candidate payload');
        assert.equal(task.validationRules, undefined, 'Validation rules must be stripped from candidate payload');
      }
    }
  });

  test('3. Deterministic Pre-Solution Zero-Score Assertion across all 6 exams', () => {
    for (const exam of PERFORMANCE_EXAMS) {
      const testCluster = new VirtualCluster();
      const testVfs = new VirtualFileSystem();
      testCluster.vfs = testVfs;

      certEngine.startPerformanceExam(exam.id, testCluster, testVfs);

      const graded = certEngine.gradePerformanceExam({
        examId: exam.id,
        virtualCluster: testCluster,
        commandHistory: [],
        vfs: testVfs,
        learnerName: 'Pre-Test Candidate'
      });

      assert.equal(graded.passed, false, `Exam ${exam.code} must not pass without solution execution`);
      assert.equal(graded.scorePercent, 0, `Exam ${exam.code} must score 0% on initial/clean state`);
      assert.equal(graded.certificate, null, `Exam ${exam.code} must not issue certificate on 0% score`);
      assert.equal(graded.earnedPoints, 0);
    }
  });

  test('4. Deterministic Canonical Solution Replay: 100% Score & Ed25519 Signing across all 6 exams', () => {
    for (const exam of PERFORMANCE_EXAMS) {
      const testCluster = new VirtualCluster();
      const testVfs = new VirtualFileSystem();
      testCluster.vfs = testVfs;
      const terminal = new TerminalEngine(testCluster, testVfs);

      certEngine.startPerformanceExam(exam.id, testCluster, testVfs);

      // Replay all canonical solution commands across every task
      for (const task of exam.tasks) {
        for (const cmd of task.solutionCommands) {
          terminal.execute(cmd);
        }
      }

      const graded = certEngine.gradePerformanceExam({
        examId: exam.id,
        virtualCluster: testCluster,
        commandHistory: terminal.commandHistory,
        vfs: testVfs,
        learnerName: `Certified ${exam.role}`
      });

      assert.equal(graded.passed, true, `Exam ${exam.code} must pass after canonical solution replay`);
      assert.equal(graded.scorePercent, 100, `Exam ${exam.code} must achieve 100% score`);
      assert.equal(graded.earnedPoints, 100);
      assert.ok(graded.certificate, `Exam ${exam.code} must issue a certificate on 100% score`);
      assert.ok(graded.certificate.certId.startsWith('CERT-PERF-'));
      assert.ok(graded.certificate.signatureEd25519);
      assert.ok(graded.certificate.signatureSha256);
      assert.equal(graded.certificate.scorePercent, 100);

      // Verify certificate can be verified via engine
      const verified = certEngine.verifyCertificate(graded.certificate.certId);
      assert.equal(verified.valid, true);
      assert.equal(verified.algorithm, 'ed25519');

      // Verify stopwatch record
      assert.ok(graded.stopwatch);
      assert.equal(graded.stopwatch.active, false);
      assert.ok(graded.stopwatch.durationMs >= 0);
      assert.equal(graded.stopwatch.withinTimeLimit, true);
    }
  });

  test('5. Cryptographic Security & Anti-Tampering: Forged Signature & Payload Tampering Rejection', () => {
    const testCluster = new VirtualCluster();
    const testVfs = new VirtualFileSystem();
    testCluster.vfs = testVfs;
    const terminal = new TerminalEngine(testCluster, testVfs);

    const exam = certEngine.getPerformanceExam('perf-exam-cks');
    certEngine.startPerformanceExam(exam.id, testCluster, testVfs);

    for (const task of exam.tasks) {
      for (const cmd of task.solutionCommands) {
        terminal.execute(cmd);
      }
    }

    const graded = certEngine.gradePerformanceExam({
      examId: exam.id,
      virtualCluster: testCluster,
      commandHistory: terminal.commandHistory,
      vfs: testVfs,
      learnerName: 'Legitimate DevSecOps Engineer'
    });

    const cert = graded.certificate;
    assert.ok(cert);

    // 1. Direct Ed25519 verification with valid signature
    const payload = {
      certId: cert.certId,
      trackId: cert.trackId,
      title: cert.title,
      learnerName: cert.learnerName,
      scorePercent: cert.scorePercent
    };
    assert.equal(certEngine.verifyCertificateEd25519(payload, cert.signatureEd25519), true);

    // 2. Reject forged 128-char hex signature
    const forgedSig = '0'.repeat(128);
    assert.equal(certEngine.verifyCertificateEd25519(payload, forgedSig), false);

    // 3. Reject tampered learner name
    const tamperedNamePayload = { ...payload, learnerName: 'Adversary Impostor' };
    assert.equal(certEngine.verifyCertificateEd25519(tamperedNamePayload, cert.signatureEd25519), false);

    // 4. Reject tampered score
    const tamperedScorePayload = { ...payload, scorePercent: 70 };
    assert.equal(certEngine.verifyCertificateEd25519(tamperedScorePayload, cert.signatureEd25519), false);

    // 5. Verify database persistence
    const savedCert = db.getCertificate(cert.certId);
    assert.ok(savedCert);
    assert.equal(savedCert.cert_id, cert.certId);
    assert.equal(savedCert.score_percent, 100);
  });

  test('6. API Router Integration: /api/certifications/performance endpoints', async () => {
    const apiDb = new KubeLabsDatabase(':memory:');
    const apiCertEngine = new CertificationEngine(pm, apiDb, { validationEngine: validator });
    const sessionManager = new SessionManager({ database: apiDb });
    const incidentEngine = new IncidentEngine(validator);
    const archEngine = new ArchitectureEngine();
    const aiMentor = new AiMentor();
    const orchestrator = new AgentOrchestrator({ rootDir: process.cwd(), pluginManager: pm });

    const router = new ApiRouter({
      pluginManager: pm,
      database: apiDb,
      sessionManager,
      validationEngine: validator,
      incidentEngine,
      architectureEngine: archEngine,
      certificationEngine: apiCertEngine,
      aiMentor,
      orchestrator
    });

    // Helper to simulate HTTP requests
    function simulateRequest(method, pathname, body = null, headers = {}) {
      return new Promise((resolve) => {
        const req = {
          method,
          url: pathname,
          headers: { host: 'localhost:3000', ...headers },
          on: (ev, cb) => {
            if (ev === 'data' && body) {
              cb(Buffer.from(JSON.stringify(body)));
            }
            if (ev === 'end') {
              cb();
            }
          }
        };
        let resData = '';
        let resCode = 200;
        let resHeaders = {};
        const res = {
          setHeader: (k, v) => {
            resHeaders[k] = v;
          },
          writeHead: (code, hdrs) => {
            resCode = code;
            resHeaders = { ...resHeaders, ...(hdrs || {}) };
          },
          on: (ev, cb) => {
            if (ev === 'finish') cb();
          },
          end: (data) => {
            resData = data;
            let json = null;
            try {
              json = JSON.parse(resData);
            } catch {
              json = resData;
            }
            resolve({ statusCode: resCode, headers: resHeaders, body: json });
          }
        };

        if (body) {
          req[Symbol.asyncIterator] = async function* () {
            yield Buffer.from(JSON.stringify(body));
          };
        } else {
          req[Symbol.asyncIterator] = async function* () {};
        }

        router.handle(req, res).catch((err) => {
          resolve({ statusCode: 500, error: err.message });
        });
      });
    }

    // 1. List performance exams
    const listRes = await simulateRequest('GET', '/api/certifications/performance/exams');
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.exams.length, 6);

    // 2. Get specific exam for client
    const getRes = await simulateRequest('GET', '/api/certifications/performance/exams/perf-exam-cka');
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.body.code, 'CKA-SIM');
    assert.ok(getRes.body.tasks.length >= 4);

    // 3. Start performance exam
    const startRes = await simulateRequest('POST', '/api/certifications/performance/exams/perf-exam-cka/start');
    assert.equal(startRes.statusCode, 200);
    assert.equal(startRes.body.contextType, 'exam');
    assert.equal(startRes.body.code, 'CKA-SIM');

    // 4. Grade pre-solution (0%)
    const gradePreRes = await simulateRequest('POST', '/api/certifications/performance/exams/perf-exam-cka/grade', {
      learnerName: 'API Candidate'
    });
    assert.equal(gradePreRes.statusCode, 200);
    assert.equal(gradePreRes.body.passed, false);
    assert.equal(gradePreRes.body.scorePercent, 0);
  });
});
