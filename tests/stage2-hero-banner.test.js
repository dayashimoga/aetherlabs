/**
 * tests/stage2-hero-banner.test.js
 * Subphase 2.2.1 Verification: "Continue Learning" Personalized Hero Banner
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.2.1 — "Continue Learning" Personalized Hero Banner', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure contains #continue-learning-hero with track badge, streak, lab details & CTA buttons', () => {
    assert.ok(htmlContent.includes('id="continue-learning-hero"'), 'HTML must contain #continue-learning-hero');
    assert.ok(htmlContent.includes('id="hero-track-badge"'), 'Hero must contain #hero-track-badge');
    assert.ok(htmlContent.includes('id="hero-streak-text"'), 'Hero must contain #hero-streak-text');
    assert.ok(htmlContent.includes('id="hero-lab-title"'), 'Hero must contain #hero-lab-title');
    assert.ok(htmlContent.includes('id="hero-lab-desc"'), 'Hero must contain #hero-lab-desc');
    assert.ok(htmlContent.includes('id="hero-domain-name"'), 'Hero must contain #hero-domain-name');
    assert.ok(htmlContent.includes('id="hero-difficulty-badge"'), 'Hero must contain #hero-difficulty-badge');
    assert.ok(htmlContent.includes('id="hero-est-time"'), 'Hero must contain #hero-est-time');
    assert.ok(htmlContent.includes('id="hero-xp-reward"'), 'Hero must contain #hero-xp-reward');
    assert.ok(htmlContent.includes('id="hero-btn-resume"'), 'Hero must contain #hero-btn-resume button');
    assert.ok(htmlContent.includes('id="hero-btn-explore"'), 'Hero must contain #hero-btn-explore button');
  });

  it('2. HTML structure contains circular SVG mastery ring and learner stats', () => {
    assert.ok(htmlContent.includes('id="hero-progress-ring-fill"'), 'Hero must contain SVG progress fill element');
    assert.ok(htmlContent.includes('id="hero-progress-pct"'), 'Hero must contain #hero-progress-pct');
    assert.ok(htmlContent.includes('id="hero-stat-labs"'), 'Hero must contain #hero-stat-labs');
    assert.ok(htmlContent.includes('id="hero-stat-level"'), 'Hero must contain #hero-stat-level');
  });

  it('3. CSS defines cybernetic hero card, progress ring geometry, and responsive layout', () => {
    assert.ok(cssContent.includes('.hero-card'), 'CSS must define .hero-card');
    assert.ok(cssContent.includes('.hero-content'), 'CSS must define .hero-content');
    assert.ok(cssContent.includes('.progress-ring-fill'), 'CSS must define .progress-ring-fill');
    assert.ok(cssContent.includes('stroke-dashoffset'), 'CSS must handle stroke-dashoffset transitions');
    assert.ok(cssContent.includes('.hero-stats-mini'), 'CSS must define .hero-stats-mini');
  });

  it('4. app.js implements renderContinueLearningHero and synchronizes progression with telemetry', () => {
    assert.ok(jsContent.includes('renderContinueLearningHero'), 'app.js must define renderContinueLearningHero');
    assert.ok(jsContent.includes('hero-progress-ring-fill'), 'app.js must update progress ring fill');
    assert.ok(jsContent.includes('hero-btn-resume'), 'app.js must bind #hero-btn-resume to launch lab');
    assert.ok(jsContent.includes('hero-btn-explore'), 'app.js must bind #hero-btn-explore');
  });
});
