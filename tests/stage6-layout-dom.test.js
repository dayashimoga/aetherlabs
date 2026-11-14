'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

describe('Subphase 6.2.2 — DOM & Layout Non-Empty State Verification', () => {
  const rootDir = path.join(__dirname, '..');
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const cssPath = path.join(rootDir, 'public', 'css', 'styles.css');
  const jsPath = path.join(rootDir, 'public', 'js', 'app.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  test('1. Master Layout & 5 Primary Workspace View Panels are Declared and Non-Empty', () => {
    assert.ok(html.includes('class="app-layout"'), 'HTML must declare .app-layout master layout');
    assert.ok(html.includes('class="app-nav-rail"'), 'HTML must declare .app-nav-rail navigation aside');
    assert.ok(html.includes('class="app-main-wrapper"'), 'HTML must declare .app-main-wrapper content wrapper');

    const expectedViews = [
      { id: 'view-paths', name: 'Learning Paths & Catalog' },
      { id: 'view-workbench', name: 'Interactive Lab Workbench' },
      { id: 'view-incidents', name: 'Incident Response War Room' },
      { id: 'view-architect', name: 'Interactive Architecture Studio' },
      { id: 'view-certs', name: 'Certifications & Skill Profile' }
    ];

    for (const v of expectedViews) {
      assert.ok(html.includes(`id="${v.id}"`), `HTML must contain section #${v.id}`);
      assert.ok(html.includes(`data-view="${v.id}"`), `Nav rail must contain button for ${v.id}`);
      assert.ok(js.includes(`'${v.id}':`), `app.js VIEW_NAMES must include ${v.id}`);
    }

    // Verify nav rail has 5 tabs
    const navMatch = html.match(/<nav class="main-nav"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'Must contain <nav class="main-nav">');
    const tabMatches = navMatch[1].match(/<button class="nav-tab[^"]*"[^>]*data-view="([^"]+)"[^>]*>/g);
    assert.equal(tabMatches.length, 5, 'Must contain exactly 5 primary workspace nav tabs');
  });

  test('2. View 1 (Learning Paths & Catalog): Hero Banner, Domain Grid & Filter Architecture', () => {
    // Hero Banner
    assert.ok(html.includes('id="continue-learning-hero"'), 'Paths view must contain #continue-learning-hero');
    assert.ok(js.includes('renderContinueLearningHero'), 'app.js must implement renderContinueLearningHero');

    // Learning Tracks & Domains
    assert.ok(html.includes('id="tracks-container"'), 'Paths view must contain #tracks-container');
    assert.ok(html.includes('id="domains-container"'), 'Paths view must contain #domains-container');
    assert.ok(html.includes('id="projects-container"'), 'Paths view must contain #projects-container');
    assert.ok(html.includes('id="domain-search-input"'), 'Paths view must contain search input #domain-search-input');

    // Empty State Fallback
    assert.ok(css.includes('.empty-state-card'), 'CSS must define .empty-state-card');
    assert.ok(js.includes('No domains match your active filter'), 'app.js must render non-empty card on zero search results');
    assert.ok(js.includes('btn-empty-clear-filters'), 'app.js must provide Clear Filters button on empty domain search');
  });

  test('3. View 2 (Interactive Lab Workbench): Split-Pane Layout, Resizers, Editor & Terminal', () => {
    // Instructions Pane
    assert.ok(html.includes('id="wb-pane-left"'), 'Workbench must contain left instructions pane #wb-pane-left');
    assert.ok(html.includes('id="wb-steps-list"'), 'Instructions pane must contain #wb-steps-list');
    assert.ok(html.includes('id="wb-lab-selector"'), 'Workbench header must contain lab selector #wb-lab-selector');

    // Resizers
    assert.ok(html.includes('id="resizer-left"'), 'Workbench must contain left resizer #resizer-left');
    assert.ok(html.includes('id="resizer-right"'), 'Workbench must contain right resizer #resizer-right');

    // Editor & Terminal
    assert.ok(html.includes('id="editor-container"'), 'Workbench must contain #editor-container');
    assert.ok(html.includes('id="wb-manifest-editor"'), 'Workbench must contain manifest editor #wb-manifest-editor');
    assert.ok(html.includes('id="center-tab-terminal"'), 'Workbench must contain terminal tab #center-tab-terminal');
    assert.ok(html.includes('id="terminal-output"'), 'Terminal container must contain #terminal-output');
    assert.ok(html.includes('id="terminal-form"'), 'Terminal container must contain #terminal-form');

    // Validation & Mobile Quick Keybar
    assert.ok(html.includes('id="btn-validate-lab"'), 'Workbench must contain validation trigger #btn-validate-lab');
    assert.ok(html.includes('id="mobile-quick-keybar"'), 'Workbench must contain mobile quick keybar #mobile-quick-keybar');
  });

  test('4. View 3 (Incident Response War Room): Standby HUD, Category Navigation & Scenarios Grid', () => {
    assert.ok(html.includes('id="incident-standby-banner"'), 'War Room must contain #incident-standby-banner');
    assert.ok(html.includes('id="active-incident-banner"'), 'War Room must contain #active-incident-banner');
    assert.ok(html.includes('id="inc-fleet-status-pill"'), 'War Room must contain #inc-fleet-status-pill');
    assert.ok(html.includes('id="incidents-category-bar"'), 'War Room must contain #incidents-category-bar');
    assert.ok(html.includes('id="incidents-grid"'), 'War Room must contain #incidents-grid');
    assert.ok(html.includes('id="inc-mttr-stopwatch"'), 'War Room must contain MTTR stopwatch #inc-mttr-stopwatch');
    assert.ok(html.includes('id="btn-inc-verify"'), 'War Room must contain verification trigger #btn-inc-verify');

    // Zero-Incident Category Fallback
    assert.ok(js.includes('No incidents in category'), 'app.js must render informative empty state when category filter has 0 incidents');
  });

  test('5. View 4 (Interactive Architecture Studio): Blueprint Selector, 4-Pillar Score & Canvas', () => {
    assert.ok(html.includes('id="arch-blueprint-select"'), 'Studio must contain #arch-blueprint-select');
    assert.ok(html.includes('id="arch-score-badge"'), 'Studio must contain #arch-score-badge');
    assert.ok(html.includes('id="arch-nodes-canvas"'), 'Studio must contain #arch-nodes-canvas');
    assert.ok(html.includes('id="arch-canvas-viewport"'), 'Studio must contain #arch-canvas-viewport');
    assert.ok(html.includes('id="arch-yaml-out"'), 'Studio must contain YAML compiler container #arch-yaml-out');
    assert.ok(html.includes('id="arch-hcl-out"'), 'Studio must contain OpenTofu HCL compiler container #arch-hcl-out');

    // Empty Architecture Canvas Fallback
    assert.ok(css.includes('.empty-arch-canvas'), 'CSS must define .empty-arch-canvas');
    assert.ok(js.includes('Empty Architecture Canvas'), 'app.js must render empty state illustration when canvas has zero nodes');
  });

  test('6. View 5 (Certifications & Skill Profile): Exam Simulators, Radar Grid & Cryptographic Verifier', () => {
    assert.ok(html.includes('id="cert-tracks-list"'), 'Certs view must contain #cert-tracks-list');
    assert.ok(html.includes('id="earned-certs-list"'), 'Certs view must contain #earned-certs-list');
    assert.ok(html.includes('id="exam-runner-area"'), 'Certs view must contain #exam-runner-area');
    assert.ok(html.includes('id="skill-radar-grid"'), 'Certs view must contain #skill-radar-grid');
    assert.ok(js.includes('HMAC-SHA256: ${c.signature_sha256}'), 'app.js must display cryptographic HMAC-SHA256 signatures');

    // Empty Certificates Fallback
    assert.ok(css.includes('.empty-certs-card'), 'CSS must define .empty-certs-card');
    assert.ok(js.includes('No Cryptographic Certificates Earned Yet'), 'app.js must render non-empty placeholder when learner has zero certs');
  });

  test('7. Anti-Clipping CSS Rules & Responsive Breakpoints across Viewports', () => {
    // Header flex-shrink and anti-clipping
    assert.ok(css.includes('.top-header {'), 'CSS must style .top-header');
    assert.ok(css.includes('height: 52px;'), 'Header height must be strictly 52px');
    assert.ok(css.includes('.workbench-header-bar,'), 'CSS must style .workbench-header-bar');
    assert.ok(css.includes('flex-shrink: 0;'), 'View headers must define flex-shrink: 0 to prevent vertical squishing');

    // View Panel Min-Height
    assert.ok(css.includes('.view-panel {'), 'CSS must style .view-panel');
    assert.ok(css.includes('min-height: calc(100vh - 120px);'), 'View panels must have minimum viewport height');

    // Responsive Breakpoints
    const expectedBreakpoints = ['1200px', '1024px', '900px', '768px', '640px', '380px', '360px'];
    for (const bp of expectedBreakpoints) {
      assert.ok(css.includes(bp), `CSS must define responsive media query for breakpoint ${bp}`);
    }
  });
});
