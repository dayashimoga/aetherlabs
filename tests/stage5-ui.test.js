'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../public/index.html');
const cssPath = path.resolve(__dirname, '../public/css/styles.css');
const jsPath = path.resolve(__dirname, '../public/js/app.js');

test('Subphase 5.1.1: index.html markup contains split-pane resizers, mobile quick keybar, and ARIA landmarks', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Resizers & ARIA range values
  assert.ok(html.includes('id="resizer-left"'), 'Must have resizer-left element');
  assert.ok(html.includes('id="resizer-right"'), 'Must have resizer-right element');
  assert.ok(html.includes('role="separator"'), 'Resizers must have role="separator"');
  assert.ok(html.includes('aria-orientation="vertical"'), 'Resizers must have aria-orientation="vertical"');
  assert.ok(html.includes('aria-valuenow="360"'), 'Left resizer must have initial aria-valuenow="360"');
  assert.ok(html.includes('aria-valuenow="380"'), 'Right resizer must have initial aria-valuenow="380"');
  assert.ok(html.includes('aria-valuemin="220"'), 'Left resizer must have aria-valuemin="220"');
  assert.ok(html.includes('aria-valuemin="240"'), 'Right resizer must have aria-valuemin="240"');
  assert.ok(html.includes('aria-valuemax="650"'), 'Resizers must have aria-valuemax="650"');

  // 2. Mobile Touch Quick-Key Bar
  assert.ok(html.includes('id="mobile-quick-keybar"'), 'Must have mobile-quick-keybar element');
  assert.ok(html.includes('role="toolbar"'), 'Quick keybar must have role="toolbar"');
  const mandatoryKeys = [
    'kubectl',
    'get',
    'describe',
    'apply -f',
    '-n',
    'pods',
    'svc',
    'deploy',
    '|',
    'grep',
    'Tab',
    'Ctrl+C',
    '&uarr;',
    '&darr;',
    'Clear'
  ];
  for (const k of mandatoryKeys) {
    assert.ok(html.includes(k), `Mobile keybar must include key "${k}"`);
  }

  // 3. Mobile Pane Switcher
  assert.ok(html.includes('mobile-pane-switcher'), 'Must have mobile-pane-switcher');
  assert.ok(html.includes('mobile-pane-tab'), 'Must have mobile-pane-tab buttons');

  // 4. Accessibility Announcer
  assert.ok(html.includes('id="aria-live-announcer"'), 'Must have aria-live-announcer');
  assert.ok(html.includes('aria-live="polite"'), 'Announcer must have aria-live="polite"');
});

test('Subphase 5.1.1: styles.css contains resizable layout, 44px touch targets, 360px breakpoint, and WCAG AA focus', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Resizer styling
  assert.ok(css.includes('.workbench-resizer'), 'Must have .workbench-resizer styles');
  assert.ok(css.includes('cursor: col-resize;'), 'Resizer must specify col-resize cursor');

  // 2. Quick Key Bar & Touch targets (>= 44x44px)
  assert.ok(css.includes('.mobile-quick-keybar'), 'Must have .mobile-quick-keybar styles');
  assert.ok(css.includes('.quick-key-btn'), 'Must have .quick-key-btn styles');
  assert.ok(css.includes('min-height: 44px;'), 'Interactive touch elements must meet 44px min-height');
  assert.ok(css.includes('min-width: 44px;'), 'Interactive touch elements must meet 44px min-width');

  // 3. Responsive Breakpoints down to 360px & up to 4K (2560px+)
  assert.ok(css.includes('@media (max-width: 1200px)'), 'Must include 1200px desktop breakpoint');
  assert.ok(css.includes('@media (max-width: 900px)'), 'Must include 900px tablet breakpoint');
  assert.ok(css.includes('@media (max-width: 640px)'), 'Must include 640px mobile breakpoint');
  assert.ok(css.includes('@media (max-width: 380px)'), 'Must include 380px small mobile breakpoint');
  assert.ok(css.includes('@media (max-width: 360px)'), 'Must include 360px compact mobile breakpoint');
  assert.ok(css.includes('@media (min-width: 2560px)'), 'Must include 2560px/4K ultrawide breakpoint');

  // 4. WCAG 2.1 AA Accessibility
  assert.ok(css.includes(':focus-visible'), 'Must define visible keyboard focus indicator');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must respect prefers-reduced-motion');
  assert.ok(css.includes('.sr-only'), 'Must include screen-reader only utility class');
});

test('Subphase 5.1.1: app.js wires resizer dragging, mobile quick key actions, and ARIA announcements', () => {
  const js = fs.readFileSync(jsPath, 'utf8');

  // 1. Resizable workbench logic
  assert.ok(js.includes('setupResizableWorkbench'), 'Must define setupResizableWorkbench');
  assert.ok(js.includes('kubelabs_pane_left_width'), 'Must persist left pane width to localStorage');
  assert.ok(js.includes('kubelabs_pane_right_width'), 'Must persist right pane width to localStorage');
  assert.ok(js.includes("resizer.setAttribute('aria-valuenow'"), 'Must update aria-valuenow on drag or arrow keys');
  assert.ok(js.includes("e.key === 'ArrowLeft'"), 'Must support ArrowLeft keyboard resizing');
  assert.ok(js.includes("e.key === 'ArrowRight'"), 'Must support ArrowRight keyboard resizing');

  // 2. Mobile Quick Keybar logic
  assert.ok(js.includes('setupMobileQuickKeybar'), 'Must define setupMobileQuickKeybar');
  assert.ok(js.includes("btn.dataset.insert"), 'Must handle text insertion at cursor position');
  assert.ok(js.includes("btn.dataset.action"), 'Must handle quick actions (tab, ctrl-c, history)');
  assert.ok(js.includes("ContextAwareQuickKeyEngine"), 'Must integrate ContextAwareQuickKeyEngine for intelligent token insertion');
  assert.ok(js.includes("handleTabCompletion"), 'Must trigger tab completion from quick bar');

  // 3. Mobile Pane Switcher logic
  assert.ok(js.includes('setupMobilePaneSwitcher'), 'Must define setupMobilePaneSwitcher');
  assert.ok(js.includes('mobile-active'), 'Must toggle mobile-active class on panes');

  // 4. Accessibility Announcer
  assert.ok(js.includes('function announceAria'), 'Must define announceAria helper');
  assert.ok(js.includes("aria-live-announcer"), 'Must query aria-live-announcer');
});

test('Subphase 5.1.1: ContextAwareQuickKeyEngine provides zero-friction mobile token insertion', () => {
  const QuickKeyEngine = require('../public/js/quickKeyEngine');

  // 1. Empty command line defaults
  const kRes = QuickKeyEngine.insertToken('', 0, 'kubectl');
  assert.equal(kRes.line, 'kubectl ');

  const getRes = QuickKeyEngine.insertToken('', 0, 'get');
  assert.equal(getRes.line, 'kubectl get ');

  const podsRes = QuickKeyEngine.insertToken('', 0, 'pods');
  assert.equal(podsRes.line, 'kubectl get pods ');

  // 2. Resource multi-chaining
  const multiRes = QuickKeyEngine.insertToken('kubectl get pods', 16, 'svc');
  assert.equal(multiRes.line, 'kubectl get pods,svc ');

  // 3. Pipe & grep wrapping
  const grepRes = QuickKeyEngine.insertToken('kubectl get pods', 16, 'grep');
  assert.equal(grepRes.line, 'kubectl get pods | grep ');

  // 4. Clean verb replacement
  const descRes = QuickKeyEngine.insertToken('kubectl get pods', 16, 'describe');
  assert.equal(descRes.line, 'kubectl describe pods ');
});
