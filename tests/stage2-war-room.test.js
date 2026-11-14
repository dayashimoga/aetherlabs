/**
 * tests/stage2-war-room.test.js
 * Subphase 2.3.2 Verification: Incident Response War Room Overhaul
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');
const INCIDENT_ENGINE_PATH = path.join(ROOT_DIR, 'src', 'core', 'incidentEngine.js');

describe('Subphase 2.3.2 — Incident Response War Room Overhaul', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');
  const { INCIDENT_SCENARIOS, INCIDENT_CATEGORY_METADATA } = require(INCIDENT_ENGINE_PATH);

  it('1. HTML structure establishes Standby Fleet HUD and Live Incident Command HUD', () => {
    assert.ok(htmlContent.includes('id="view-incidents"'), 'HTML must contain #view-incidents');
    assert.ok(htmlContent.includes('id="inc-fleet-status-pill"'), 'Must contain #inc-fleet-status-pill');
    assert.ok(htmlContent.includes('id="incident-standby-banner"'), 'Must contain #incident-standby-banner');
    assert.ok(htmlContent.includes('class="standby-header"'), 'Standby banner must contain .standby-header');
    assert.ok(htmlContent.includes('class="standby-metrics-strip"'), 'Must contain .standby-metrics-strip');
    assert.ok(htmlContent.includes('class="standby-prompt-box"'), 'Must contain .standby-prompt-box');

    // Live Incident Command HUD
    assert.ok(htmlContent.includes('id="active-incident-banner"'), 'Must contain #active-incident-banner');
    assert.ok(htmlContent.includes('class="incident-command-hud'), 'Banner must declare .incident-command-hud');
    assert.ok(htmlContent.includes('id="inc-active-sev"'), 'Must contain #inc-active-sev');
    assert.ok(htmlContent.includes('class="badge badge-firing"'), 'Must contain .badge-firing');
    assert.ok(htmlContent.includes('id="inc-active-title"'), 'Must contain #inc-active-title');
    assert.ok(htmlContent.includes('id="inc-mttr-box"'), 'Must contain #inc-mttr-box');
    assert.ok(htmlContent.includes('id="inc-mttr-stopwatch"'), 'Must contain #inc-mttr-stopwatch');
  });

  it('2. HTML houses PagerDuty Alert Banner, Prometheus RED Sparklines, Diagnostic Hints & Controls', () => {
    // Action buttons
    assert.ok(htmlContent.includes('id="btn-inc-open-workbench"'), 'Must contain #btn-inc-open-workbench');
    assert.ok(htmlContent.includes('id="btn-inc-solve"'), 'Must contain #btn-inc-solve');
    assert.ok(htmlContent.includes('id="btn-inc-verify"'), 'Must contain #btn-inc-verify');

    // PagerDuty Alert
    assert.ok(htmlContent.includes('id="inc-pagerduty-alert"'), 'Must contain #inc-pagerduty-alert');
    assert.ok(htmlContent.includes('id="inc-active-alert"'), 'Must contain #inc-active-alert');
    assert.ok(htmlContent.includes('id="inc-active-impact"'), 'Must contain #inc-active-impact');

    // Prometheus RED Sparklines
    assert.ok(htmlContent.includes('id="inc-red-sparklines"'), 'Must contain #inc-red-sparklines');
    assert.ok(htmlContent.includes('PROMETHEUS RED METRICS'), 'Must include Prometheus RED metrics title');

    // Diagnostic Hints & Verification Output
    assert.ok(htmlContent.includes('id="inc-active-hints-container"'), 'Must contain #inc-active-hints-container');
    assert.ok(htmlContent.includes('id="inc-active-hints"'), 'Must contain #inc-active-hints');
    assert.ok(htmlContent.includes('id="inc-verification-output"'), 'Must contain #inc-verification-output');

    // Category filter and grid
    assert.ok(htmlContent.includes('id="incidents-category-bar"'), 'Must contain #incidents-category-bar');
    assert.ok(htmlContent.includes('id="incidents-grid"'), 'Must contain #incidents-grid');
  });

  it('3. CSS defines cybernetic styles for Standby HUD, Firing Alerts, MTTR Stopwatch, and RED Sparklines', () => {
    // Standby banner
    assert.ok(cssContent.includes('.incident-standby-banner'), 'CSS must define .incident-standby-banner');
    assert.ok(cssContent.includes('.standby-pulse-dot'), 'CSS must define .standby-pulse-dot');
    assert.ok(cssContent.includes('.standby-metrics-strip'), 'CSS must define .standby-metrics-strip');
    assert.ok(cssContent.includes('.standby-prompt-box'), 'CSS must define .standby-prompt-box');

    // Active HUD & Firing animation
    assert.ok(cssContent.includes('.incident-command-hud'), 'CSS must define .incident-command-hud');
    assert.ok(cssContent.includes('@keyframes pulseFiring'), 'CSS must define @keyframes pulseFiring');
    assert.ok(cssContent.includes('.badge-firing'), 'CSS must define .badge-firing');

    // MTTR Stopwatch
    assert.ok(cssContent.includes('.mttr-stopwatch'), 'CSS must define .mttr-stopwatch');
    assert.ok(cssContent.includes('.mttr-digits'), 'CSS must define .mttr-digits');

    // PagerDuty Alert
    assert.ok(cssContent.includes('.inc-pagerduty-alert'), 'CSS must define .inc-pagerduty-alert');
    assert.ok(cssContent.includes('.alert-source'), 'CSS must define .alert-source');

    // Prometheus RED Sparklines
    assert.ok(cssContent.includes('.red-sparklines-grid'), 'CSS must define .red-sparklines-grid');
    assert.ok(cssContent.includes('.red-sparkline-card'), 'CSS must define .red-sparkline-card');
    assert.ok(cssContent.includes('.red-sparkline-svg'), 'CSS must define .red-sparkline-svg');

    // Category bar and incident cards
    assert.ok(cssContent.includes('.incidents-category-bar'), 'CSS must define .incidents-category-bar');
    assert.ok(cssContent.includes('.inc-cat-btn'), 'CSS must define .inc-cat-btn');
    assert.ok(cssContent.includes('.inc-cat-btn.active'), 'CSS must style .inc-cat-btn.active');
    assert.ok(cssContent.includes('.incident-card'), 'CSS must define .incident-card');
    assert.ok(cssContent.includes('.incident-card.is-active'), 'CSS must style .incident-card.is-active');
  });

  it('4. JavaScript implements MTTR Stopwatch, RED Sparklines, and War Room Controller', () => {
    assert.ok(jsContent.includes('function formatStopwatchDigits('), 'app.js must define formatStopwatchDigits');
    assert.ok(jsContent.includes('function startMttrTimer('), 'app.js must define startMttrTimer');
    assert.ok(jsContent.includes('function stopMttrTimer('), 'app.js must define stopMttrTimer');
    assert.ok(jsContent.includes('function generateRedMetrics('), 'app.js must define generateRedMetrics');
    assert.ok(jsContent.includes('function renderRedSparklines('), 'app.js must define renderRedSparklines');
    assert.ok(jsContent.includes('function renderIncidentCategoryBar('), 'app.js must define renderIncidentCategoryBar');
    assert.ok(jsContent.includes('window.KubeLabsWarRoom'), 'app.js must export window.KubeLabsWarRoom');
  });

  it('5. War Room logic calculates accurate MTTR stopwatches and authentic RED telemetry across all categories', () => {
    // Extract War Room helper functions from jsContent for functional unit testing
    const warRoomCode = jsContent.match(/function formatStopwatchDigits\([\s\S]*?function renderRedSparklines\([\s\S]*?\n  \}/);
    assert.ok(warRoomCode, 'Must locate War Room helper code in app.js');

    // Evaluate in safe isolated scope
    const fnScope = new Function(`
      ${warRoomCode[0]}
      return { formatStopwatchDigits, generateRedMetrics };
    `);
    const { formatStopwatchDigits, generateRedMetrics } = fnScope();

    // Verify Stopwatch formatting
    assert.equal(formatStopwatchDigits(0), '00:00:00', '0s should format as 00:00:00');
    assert.equal(formatStopwatchDigits(5), '00:00:05', '5s should format as 00:00:05');
    assert.equal(formatStopwatchDigits(65), '00:01:05', '65s should format as 00:01:05');
    assert.equal(formatStopwatchDigits(600), '00:10:00', '600s should format as 00:10:00');
    assert.equal(formatStopwatchDigits(3665), '01:01:05', '3665s should format as 01:01:05');

    // Verify RED Sparkline metrics for all 15 production incidents
    assert.equal(INCIDENT_SCENARIOS.length, 15, 'Must have exactly 15 production incident scenarios');

    for (const incident of INCIDENT_SCENARIOS) {
      const metrics = generateRedMetrics(incident);
      assert.ok(metrics.rate, `Incident ${incident.id} must have Rate metric`);
      assert.ok(metrics.errors, `Incident ${incident.id} must have Errors metric`);
      assert.ok(metrics.duration, `Incident ${incident.id} must have Duration metric`);

      // Verify SVG polyline points format
      assert.ok(metrics.rate.points.split(' ').length >= 10, 'Rate points must have at least 10 coordinates');
      assert.ok(metrics.errors.points.split(' ').length >= 10, 'Errors points must have at least 10 coordinates');
      assert.ok(metrics.duration.points.split(' ').length >= 10, 'Duration points must have at least 10 coordinates');

      // Verify degradation statuses
      assert.ok(['status-danger', 'status-warning'].includes(metrics.errors.status), 'Error metric must indicate danger or warning');
    }
  });
});
