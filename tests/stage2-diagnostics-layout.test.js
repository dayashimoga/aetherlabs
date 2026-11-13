/**
 * tests/stage2-diagnostics-layout.test.js
 * Subphase 2.1.3 Verification: Modal & Responsive Layout Defect Remediation
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.1.3 — Modal & Responsive Layout Defect Remediation', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure houses #diagnostics-modal at the document root outside .app-layout', () => {
    assert.ok(htmlContent.includes('id="diagnostics-modal"'), 'HTML must contain #diagnostics-modal');
    assert.ok(htmlContent.includes('diagnostics-modal-body'), 'Modal must contain .diagnostics-modal-body');
    assert.ok(!htmlContent.includes('max-height:calc(85vh - 100px)'), 'Eliminated brittle inline max-height on modal-body');

    // Modal dialog must be positioned outside .app-main-wrapper and .app-layout
    const layoutIdx = htmlContent.indexOf('class="app-layout"');
    const layoutCloseIdx = htmlContent.indexOf('</div><!-- /.app-layout -->');
    const diagModalIdx = htmlContent.indexOf('id="diagnostics-modal"');
    assert.ok(layoutIdx > -1 && layoutCloseIdx > -1 && diagModalIdx > -1, 'Modal tags must be found');
    assert.ok(diagModalIdx > layoutCloseIdx, 'Diagnostics modal must sit outside .app-layout to prevent stacking context clipping');
  });

  it('2. CSS flexbox scroll architecture guarantees unclipped top row cards beneath sticky header', () => {
    assert.ok(cssContent.includes('.diagnostics-modal-dialog'), 'CSS must define .diagnostics-modal-dialog');
    assert.ok(cssContent.includes('.diagnostics-modal-body'), 'CSS must define .diagnostics-modal-body');
    assert.ok(cssContent.includes('flex-shrink: 0;'), 'Modal header must have flex-shrink: 0');
    assert.ok(cssContent.includes('min-height: 0;'), 'Modal body must have min-height: 0 to allow proper flex scrolling');
    assert.ok(cssContent.includes('overflow-y: auto;'), 'Modal body must manage overflow-y: auto independently');
  });

  it('3. CSS defines agent card styling, check alignment, and zero-stub skeleton loading styles', () => {
    assert.ok(cssContent.includes('.agent-card'), 'CSS must define .agent-card');
    assert.ok(cssContent.includes('.agent-card-header'), 'CSS must define .agent-card-header');
    assert.ok(cssContent.includes('.agent-check-item'), 'CSS must define .agent-check-item');
    assert.ok(cssContent.includes('.audit-skeleton-card'), 'CSS must define .audit-skeleton-card to eliminate empty black card boxes');
    assert.ok(cssContent.includes('pulseShimmer'), 'CSS must define shimmer pulse animation for skeleton cards');
  });

  it('4. CSS locks background page scrolling when modal is active', () => {
    assert.ok(cssContent.includes('body.modal-open'), 'CSS must define body.modal-open');
    assert.ok(cssContent.includes('overflow: hidden !important;'), 'body.modal-open must enforce overflow: hidden');
  });

  it('5. app.js manages modal-open state and renders instant skeleton placeholders on audit trigger', () => {
    assert.ok(jsContent.includes("document.body.classList.add('modal-open')"), 'openDiagnosticsModal must add modal-open class');
    assert.ok(jsContent.includes("document.body.classList.remove('modal-open')"), 'closeDiagnosticsModal must remove modal-open class');
    assert.ok(jsContent.includes('audit-skeleton-card'), 'runLiveAgentAudit must render skeleton cards while in flight');
    assert.ok(jsContent.includes('Retry Audit'), 'runLiveAgentAudit must provide retry handler on failure');
  });
});
