'use strict';

/**
 * KubeLabs v3.0 - Asymmetric Ed25519 Certification Engine
 * 
 * Grades comprehensive role-based assessment exams, signs digital certificate
 * credentials using Ed25519 asymmetric cryptography and HMAC-SHA256,
 * and evaluates 26-domain skill mastery radar metrics.
 * 
 * Pure ES2024 module with ZERO external runtime dependencies.
 */

const crypto = require('node:crypto');
const { ROLE_TRACKS } = require('../plugins/pluginManager');

const SIGNING_SECRET = process.env.KUBELABS_CERT_SECRET || 'kubelabs-production-hmac-key-2026-v1';

class CertificationEngine {
  constructor(pluginManager, database, options = {}) {
    this.pluginManager = pluginManager;
    this.database = database;

    if (options.publicKey && options.privateKey) {
      this.publicKey = options.publicKey;
      this.privateKey = options.privateKey;
    } else if (this.database && typeof this.database.getOrCreateSigningKeys === 'function') {
      const pair = this.database.getOrCreateSigningKeys();
      this.publicKey = pair.publicKey;
      this.privateKey = pair.privateKey;
    } else {
      const pair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      this.publicKey = pair.publicKey;
      this.privateKey = pair.privateKey;
    }
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPublicKeyPem() {
    return this.publicKey;
  }

  signCertificatePayloadEd25519({ certId, trackId, title, learnerName, scorePercent }) {
    const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
    const data = Buffer.from(canonical, 'utf8');
    return crypto.sign(null, data, this.privateKey).toString('hex');
  }

  verifyCertificateEd25519({ certId, trackId, title, learnerName, scorePercent }, signatureHex, publicKey = this.publicKey) {
    try {
      const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
      const data = Buffer.from(canonical, 'utf8');
      const sigBuffer = Buffer.from(signatureHex, 'hex');
      return crypto.verify(null, data, publicKey, sigBuffer);
    } catch {
      return false;
    }
  }

  listExamTracks() {
    return ROLE_TRACKS.map((track) => {
      const questions = this.pluginManager.getTrackQuestions(track.id);
      return {
        id: track.id,
        title: track.title,
        role: track.role,
        certificationTitle: track.certificationTitle,
        summary: track.summary,
        questionCount: questions.length,
        passingScorePercent: 75,
        durationMinutes: 30,
        domainIds: track.domainIds
      };
    });
  }

  getExamQuestionsForClient(trackId) {
    const track = ROLE_TRACKS.find((t) => t.id === trackId);
    if (!track) {
      throw new Error(`Certification track "${trackId}" not found`);
    }
    const questions = this.pluginManager.getTrackQuestions(trackId);
    return {
      trackId: track.id,
      title: track.title,
      certificationTitle: track.certificationTitle,
      passingScorePercent: 75,
      questions: questions.map((q) => ({
        id: q.id,
        domainId: q.domainId,
        domainTitle: q.domainTitle,
        question: q.question,
        options: q.options
      }))
    };
  }

  gradeExam({ trackId, answers = {}, learnerName = 'Cloud-Native Engineer' }) {
    const track = ROLE_TRACKS.find((t) => t.id === trackId);
    if (!track) {
      throw new Error(`Certification track "${trackId}" not found`);
    }
    const questions = this.pluginManager.getTrackQuestions(trackId);
    if (questions.length === 0) {
      throw new Error(`No assessment questions registered for track "${trackId}"`);
    }

    let correctCount = 0;
    const domainStats = {};
    const detailedResults = [];

    for (const q of questions) {
      const submittedIdx = answers[q.id] !== undefined ? Number(answers[q.id]) : -1;
      const isCorrect = submittedIdx === Number(q.correctIndex);
      if (isCorrect) correctCount += 1;

      if (!domainStats[q.domainId]) {
        domainStats[q.domainId] = { correct: 0, total: 0, title: q.domainTitle };
      }
      domainStats[q.domainId].total += 1;
      if (isCorrect) domainStats[q.domainId].correct += 1;

      detailedResults.push({
        id: q.id,
        domainId: q.domainId,
        question: q.question,
        submittedIndex: submittedIdx,
        correctIndex: q.correctIndex,
        correct: isCorrect,
        explanation: q.explanation
      });
    }

    const scorePercent = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercent >= 75;
    const attemptId = `ATT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    if (this.database) {
      this.database.saveAssessmentAttempt({
        attemptId,
        trackId,
        scorePercent,
        passed,
        domainBreakdown: domainStats
      });
    }

    let certificate = null;
    if (passed) {
      const issuedAt = new Date().toISOString();
      const certId = `CERT-${track.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${crypto
        .createHash('sha256')
        .update(`${track.id}:${learnerName}:${scorePercent}`)
        .digest('hex')
        .slice(0, 8)
        .toUpperCase()}`;

      const signatureSha256 = this.signCertificatePayload({
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent
      });

      const signatureEd25519 = this.signCertificatePayloadEd25519({
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent
      });

      certificate = {
        certId,
        trackId: track.id,
        title: track.certificationTitle,
        learnerName,
        scorePercent,
        signatureSha256,
        signatureEd25519,
        publicKeyPem: this.publicKey,
        issuedAt
      };

      if (this.database) {
        this.database.saveCertificate(certificate);
        const profileData = this.database.getProfile();
        const currentXp = (profileData.profile && profileData.profile.xp) || 0;
        this.database.updateProfileFields({ xp: currentXp + 500 });
      }
    }

    return {
      attemptId,
      trackId,
      certificationTitle: track.certificationTitle,
      scorePercent,
      correctCount,
      totalQuestions: questions.length,
      passed,
      domainBreakdown: domainStats,
      detailedResults,
      certificate
    };
  }

  signCertificatePayload({ certId, trackId, title, learnerName, scorePercent }) {
    const canonical = `${certId}|${trackId}|${title}|${learnerName}|${scorePercent}`;
    return crypto.createHmac('sha256', SIGNING_SECRET).update(canonical).digest('hex');
  }

  verifyCertificate(certId, providedSignature) {
    if (!this.database) {
      return { valid: false, reason: 'Database unavailable' };
    }
    const cert = this.database.getCertificate(certId);
    if (!cert) {
      return { valid: false, reason: `Certificate "${certId}" not found` };
    }

    const payload = {
      certId: cert.cert_id,
      trackId: cert.track_id,
      title: cert.title,
      learnerName: cert.learner_name,
      scorePercent: cert.score_percent
    };

    let valid = false;
    let algorithm = 'hmac-sha256';

    if (providedSignature !== undefined && providedSignature !== null && String(providedSignature).trim() !== '') {
      const sigStr = String(providedSignature).trim();
      if (sigStr.length === 128) {
        valid = this.verifyCertificateEd25519(payload, sigStr);
        algorithm = 'ed25519';
      } else {
        const expectedShaSig = this.signCertificatePayload(payload);
        valid = sigStr === expectedShaSig;
        algorithm = 'hmac-sha256';
      }
    } else if (cert.signature_ed25519) {
      valid = this.verifyCertificateEd25519(payload, cert.signature_ed25519);
      algorithm = 'ed25519';
      if (!valid && cert.signature_sha256) {
        const expectedShaSig = this.signCertificatePayload(payload);
        valid = cert.signature_sha256 === expectedShaSig;
        algorithm = 'hmac-sha256';
      }
    } else {
      const expectedShaSig = this.signCertificatePayload(payload);
      valid = cert.signature_sha256 === expectedShaSig;
      algorithm = 'hmac-sha256';
    }

    return {
      valid,
      algorithm,
      certificate: cert,
      publicKeyPem: this.publicKey,
      verifiedAt: new Date().toISOString()
    };
  }

  computeDomainSkillRadar() {
    const domains = this.pluginManager.getAllDomains();
    const profileData = this.database ? this.database.getProfile() : { completedLabs: [] };
    const completedSet = new Set(
      (profileData.completedLabs || [])
        .filter((l) => l.status === 'completed')
        .map((l) => l.lab_id)
    );

    return domains.map((d) => {
      const totalLabs = (d.labs || []).length;
      const doneLabs = (d.labs || []).filter((l) => completedSet.has(l.id)).length;
      const masteryPercent = totalLabs > 0 ? Math.round((doneLabs / totalLabs) * 100) : 0;
      return {
        domainId: d.id,
        title: d.title,
        category: d.category,
        trackId: d.trackId,
        completedLabs: doneLabs,
        totalLabs,
        masteryPercent
      };
    });
  }
}

module.exports = { CertificationEngine };

