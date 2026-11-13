'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../public/index.html');
const cssPath = path.resolve(__dirname, '../public/css/styles.css');
const jsPath = path.resolve(__dirname, '../public/js/app.js');

test('Subphase 2.1.1: Top navigation streamlined to strictly 5 customer-facing workspaces', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract <nav class="main-nav">...</nav>
  const navMatch = html.match(/<nav class="main-nav"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, 'Must contain <nav class="main-nav">');

  const navContent = navMatch[1];
  const tabMatches = navContent.match(/<button class="nav-tab[^"]*"[^>]*data-view="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g);
  assert.ok(tabMatches, 'Must contain nav-tab buttons');
  assert.equal(tabMatches.length, 5, 'Must contain strictly 5 customer-facing workspace tabs');

  const expectedTabs = [
    { view: 'view-paths', label: '1. Learning Paths &amp; Catalog' },
    { view: 'view-workbench', label: '2. Interactive Lab Workbench' },
    { view: 'view-incidents', label: '3. Incident Response War Room' },
    { view: 'view-architect', label: '4. Interactive Architecture Studio' },
    { view: 'view-certs', label: '5. Certifications &amp; Skill Profile' }
  ];

  expectedTabs.forEach((exp, idx) => {
    assert.ok(tabMatches[idx].includes(`data-view="${exp.view}"`), `Tab ${idx + 1} must bind to ${exp.view}`);
    assert.ok(tabMatches[idx].includes(exp.label), `Tab ${idx + 1} must have customer-facing label "${exp.label}"`);
  });

  // Verify view-governance is NOT a top-level tab
  assert.ok(!navContent.includes('view-governance'), '11-Agent Quality Gate must not be in primary navigation tabs');
});

test('Subphase 2.1.1: 11-Agent Quality Gate moved to internal Diagnostics Modal (Ctrl+Shift+D)', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Must contain diagnostics modal dialog with accessible ARIA attributes
  assert.ok(html.includes('id="diagnostics-modal"'), 'Must have diagnostics-modal element');
  assert.ok(html.includes('role="dialog"'), 'Diagnostics modal must have role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Diagnostics modal must have aria-modal="true"');

  // Modal must house the full 11-agent audit elements
  assert.ok(html.includes('id="agent-audit-summary"'), 'Modal must contain #agent-audit-summary');
  assert.ok(html.includes('id="agent-audit-grid"'), 'Modal must contain #agent-audit-grid');
  assert.ok(html.includes('id="btn-run-agent-audit"'), 'Modal must contain #btn-run-agent-audit');
  assert.ok(html.includes('id="btn-close-diagnostics"'), 'Modal must contain #btn-close-diagnostics');

  // Must have triggers: header button and footer developer link
  assert.ok(html.includes('id="btn-open-diagnostics"'), 'Header must contain diagnostics button (#btn-open-diagnostics)');
  assert.ok(html.includes('id="footer-diagnostics-link"'), 'Footer must contain diagnostics link (#footer-diagnostics-link)');
  assert.ok(html.includes('Ctrl+Shift+D'), 'Must display Ctrl+Shift+D keyboard shortcut hint');
});

test('Subphase 2.1.1: CSS styles for diagnostics modal, dialog overlay, and responsive footer', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.modal-backdrop'), 'CSS must define .modal-backdrop');
  assert.ok(css.includes('.diagnostics-modal-dialog'), 'CSS must define .diagnostics-modal-dialog');
  assert.ok(css.includes('.modal-header'), 'CSS must define .modal-header');
  assert.ok(css.includes('.modal-close-btn'), 'CSS must define .modal-close-btn');
  assert.ok(css.includes('.app-footer'), 'CSS must define .app-footer');
});

test('Subphase 2.1.1: app.js wires Ctrl+Shift+D keyboard shortcut, modal triggers, and router route', () => {
  const js = fs.readFileSync(jsPath, 'utf8');

  assert.ok(js.includes('openDiagnosticsModal'), 'app.js must define openDiagnosticsModal');
  assert.ok(js.includes('closeDiagnosticsModal'), 'app.js must define closeDiagnosticsModal');
  assert.ok(js.includes("e.key === 'D'") || js.includes('e.key === "D"'), 'app.js must listen for D key with Ctrl+Shift');
  assert.ok(js.includes('#admin-diagnostics'), 'app.js must handle #admin-diagnostics route/hash');
  assert.ok(js.includes('btn-open-diagnostics'), 'app.js must attach click listener to btn-open-diagnostics');
  assert.ok(js.includes('footer-diagnostics-link'), 'app.js must attach click listener to footer-diagnostics-link');
});

test('Subphase 2.1.1: Router serves index.html for /admin/diagnostics internal route', async () => {
  const { createKubeLabsApp } = require('../src/server');
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/admin/diagnostics`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('id="diagnostics-modal"'), 'Must serve HTML with diagnostics modal');
  } finally {
    await app.drainGracefully(1000);
  }
});
