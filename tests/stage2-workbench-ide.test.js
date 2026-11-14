/**
 * tests/stage2-workbench-ide.test.js
 * Subphase 2.3.1 Verification: 3-Pane Split Lab IDE with Auto-Verifying Runbook
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.3.1 — 3-Pane Split Lab IDE with Auto-Verifying Runbook', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure establishes 3-Pane Split Workbench with draggable resizers', () => {
    assert.ok(htmlContent.includes('id="view-workbench"'), 'HTML must contain #view-workbench');
    assert.ok(htmlContent.includes('class="workbench-layout"'), 'Must establish .workbench-layout container');
    assert.ok(htmlContent.includes('id="wb-pane-left"'), 'Must contain Left Pane (#wb-pane-left)');
    assert.ok(htmlContent.includes('id="resizer-left"'), 'Must contain Left Resizer Divider (#resizer-left)');
    assert.ok(htmlContent.includes('id="wb-pane-center"'), 'Must contain Center Pane (#wb-pane-center)');
    assert.ok(htmlContent.includes('id="resizer-right"'), 'Must contain Right Resizer Divider (#resizer-right)');
    assert.ok(htmlContent.includes('id="wb-pane-right"'), 'Must contain Right Pane (#wb-pane-right)');

    // Verify resizer accessibility semantics
    assert.ok(htmlContent.includes('role="separator"'), 'Resizers must declare role="separator"');
    assert.ok(htmlContent.includes('aria-orientation="vertical"'), 'Resizers must declare vertical orientation');
  });

  it('2. HTML left pane houses production scenario, runbook steps & Socratic discovery clues', () => {
    assert.ok(htmlContent.includes('id="wb-scenario"'), 'Left pane must contain #wb-scenario');
    assert.ok(htmlContent.includes('id="wb-prod-context"'), 'Left pane must contain #wb-prod-context');
    assert.ok(htmlContent.includes('id="wb-steps-progress-badge"'), 'Left pane must contain #wb-steps-progress-badge');
    assert.ok(htmlContent.includes('id="wb-steps-list"'), 'Left pane must contain #wb-steps-list');
    assert.ok(htmlContent.includes('id="wb-hints-accordion"'), 'Left pane must contain #wb-hints-accordion');
    assert.ok(htmlContent.includes('id="wb-troubleshooting"'), 'Left pane must contain #wb-troubleshooting');
    assert.ok(htmlContent.includes('id="wb-socratic-clue"'), 'Left pane must contain #wb-socratic-clue');
  });

  it('3. CSS defines cybernetic styling for 3-pane layout, resizers, and auto-verifying runbook cards', () => {
    assert.ok(cssContent.includes('.workbench-layout'), 'CSS must define .workbench-layout');
    assert.ok(cssContent.includes('.workbench-pane'), 'CSS must define .workbench-pane');
    assert.ok(cssContent.includes('.workbench-resizer'), 'CSS must define .workbench-resizer');
    assert.ok(cssContent.includes('.step-card'), 'CSS must define .step-card');
    assert.ok(cssContent.includes('.step-card.step-active'), 'CSS must style .step-active with cyan glow');
    assert.ok(cssContent.includes('.step-card.step-verified'), 'CSS must style .step-verified with emerald pulse');
    assert.ok(cssContent.includes('emeraldPulse'), 'CSS must define emeraldPulse animation');
    assert.ok(cssContent.includes('.step-status-badge.verified'), 'CSS must style verified badge');
    assert.ok(cssContent.includes('.step-status-badge.active'), 'CSS must style active badge');
    assert.ok(cssContent.includes('.step-pulse-dot'), 'CSS must define pulsing dot for active step');
    assert.ok(cssContent.includes('.btn-run-step'), 'CSS must style .btn-run-step');
    assert.ok(cssContent.includes('.btn-copy-step'), 'CSS must style .btn-copy-step');
  });

  it('4. JavaScript implements updateRunbookStepStatuses and synchronizes step verification with validation', () => {
    assert.ok(jsContent.includes('function updateRunbookStepStatuses('), 'app.js must define updateRunbookStepStatuses');
    assert.ok(jsContent.includes('updateRunbookStepStatuses(report)'), 'renderValidationReport must call updateRunbookStepStatuses');
    assert.ok(jsContent.includes('step-active'), 'app.js must reference step-active');
    assert.ok(jsContent.includes('step-verified'), 'app.js must reference step-verified');
    assert.ok(jsContent.includes('window.KubeLabsWorkbench'), 'app.js must export KubeLabsWorkbench helpers');
  });

  it('5. JavaScript implements setupResizableWorkbench with drag & keyboard Arrow accessibility', () => {
    assert.ok(jsContent.includes('function setupResizableWorkbench('), 'app.js must define setupResizableWorkbench');
    assert.ok(jsContent.includes('kubelabs_pane_left_width'), 'app.js must persist left pane width');
    assert.ok(jsContent.includes('kubelabs_pane_right_width'), 'app.js must persist right pane width');
    assert.ok(jsContent.includes("e.key === 'ArrowLeft'"), 'Resizer must support ArrowLeft keyboard navigation');
    assert.ok(jsContent.includes("e.key === 'ArrowRight'"), 'Resizer must support ArrowRight keyboard navigation');
  });
});
