'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../public/index.html');
const cssPath = path.resolve(__dirname, '../public/css/styles.css');
const jsPath = path.resolve(__dirname, '../public/js/app.js');

test('Subphase 2.1.2: Workbench HTML layout defines 3-column resizable IDE with tabbed center and right panes', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. View container & Resizers
  assert.ok(html.includes('id="view-workbench"'), 'Must contain #view-workbench section');
  assert.ok(html.includes('id="workbench-layout"'), 'Must contain #workbench-layout container');
  assert.ok(html.includes('id="wb-pane-left"'), 'Must contain #wb-pane-left');
  assert.ok(html.includes('id="wb-pane-center"'), 'Must contain #wb-pane-center');
  assert.ok(html.includes('id="wb-pane-right"'), 'Must contain #wb-pane-right');
  assert.ok(html.includes('id="resizer-left"'), 'Must contain #resizer-left');
  assert.ok(html.includes('id="resizer-right"'), 'Must contain #resizer-right');

  // 2. Left Column: Architecture diagram button, checklist & Socratic hints accordion
  assert.ok(html.includes('id="btn-view-lab-arch"'), 'Left pane must contain #btn-view-lab-arch trigger');
  assert.ok(html.includes('id="wb-steps-list"'), 'Left pane must contain #wb-steps-list');
  assert.ok(html.includes('id="wb-hints-accordion"'), 'Left pane must contain #wb-hints-accordion');
  assert.ok(html.includes('id="wb-troubleshooting"'), 'Must retain #wb-troubleshooting hint element');
  assert.ok(html.includes('id="wb-socratic-clue"'), 'Must contain #wb-socratic-clue prompt');

  // 3. Center Column Tabs: Terminal, Editor, Observability
  assert.ok(html.includes('id="center-tab-terminal"'), 'Must contain #center-tab-terminal');
  assert.ok(html.includes('id="center-tab-editor"'), 'Must contain #center-tab-editor');
  assert.ok(html.includes('id="center-tab-observability"'), 'Must contain #center-tab-observability');
  assert.ok(html.includes('data-tab="center-tab-terminal"'), 'Must have center tab button for terminal');
  assert.ok(html.includes('data-tab="center-tab-editor"'), 'Must have center tab button for editor');
  assert.ok(html.includes('data-tab="center-tab-observability"'), 'Must have center tab button for observability');

  // 4. Center Tab 1: Terminal & Zoom
  assert.ok(html.includes('id="terminal-output"'), 'Must contain #terminal-output');
  assert.ok(html.includes('id="mobile-quick-keybar"'), 'Must retain #mobile-quick-keybar');
  assert.ok(html.includes('id="btn-zoom-term-in"'), 'Must contain #btn-zoom-term-in');
  assert.ok(html.includes('id="btn-zoom-term-out"'), 'Must contain #btn-zoom-term-out');

  // 5. Center Tab 2: Editor Gutter, Format, Diff, Apply
  assert.ok(html.includes('id="wb-manifest-editor"'), 'Must contain #wb-manifest-editor');
  assert.ok(html.includes('id="manifest-line-gutter"'), 'Must contain #manifest-line-gutter for line numbers');
  assert.ok(html.includes('id="btn-format-yaml"'), 'Must contain #btn-format-yaml');
  assert.ok(html.includes('id="btn-diff-manifest"'), 'Must contain #btn-diff-manifest');
  assert.ok(html.includes('id="btn-apply-manifest"'), 'Must retain #btn-apply-manifest');
  assert.ok(html.includes('id="wb-manifest-diff"'), 'Must contain #wb-manifest-diff panel');

  // 6. Center Tab 3: Observability PromQL, Loki, Jaeger
  assert.ok(html.includes('id="promql-query-input"'), 'Must contain #promql-query-input');
  assert.ok(html.includes('id="promql-preset-selector"'), 'Must contain #promql-preset-selector');
  assert.ok(html.includes('id="btn-run-promql"'), 'Must contain #btn-run-promql');
  assert.ok(html.includes('id="promql-chart-canvas"'), 'Must contain #promql-chart-canvas');
  assert.ok(html.includes('id="loki-log-tailer"'), 'Must contain #loki-log-tailer');
  assert.ok(html.includes('id="jaeger-trace-waterfall"'), 'Must contain #jaeger-trace-waterfall');

  // 7. Right Column Tabs: Topology, Validation/CIS, AI Mentor
  assert.ok(html.includes('id="right-tab-topology"'), 'Must contain #right-tab-topology');
  assert.ok(html.includes('id="right-tab-validation"'), 'Must contain #right-tab-validation');
  assert.ok(html.includes('id="right-tab-mentor"'), 'Must contain #right-tab-mentor');
  assert.ok(html.includes('data-tab="right-tab-topology"'), 'Must have right tab button for topology');
  assert.ok(html.includes('data-tab="right-tab-validation"'), 'Must have right tab button for validation');
  assert.ok(html.includes('data-tab="right-tab-mentor"'), 'Must have right tab button for mentor');

  // 8. Right Tab elements
  assert.ok(html.includes('id="topology-search-input"'), 'Must contain #topology-search-input');
  assert.ok(html.includes('id="cluster-topology-svg"'), 'Must retain #cluster-topology-svg');
  assert.ok(html.includes('id="cluster-topology-view"'), 'Must retain #cluster-topology-view');
  assert.ok(html.includes('id="wb-validation-results"'), 'Must retain #wb-validation-results');
  assert.ok(html.includes('id="wb-cis-security-checklist"'), 'Must contain #wb-cis-security-checklist');
  assert.ok(html.includes('id="btn-revalidate-in-tab"'), 'Must contain #btn-revalidate-in-tab');
  assert.ok(html.includes('id="mentor-response-box"'), 'Must retain #mentor-response-box');

  // 9. Architecture Diagram Modal
  assert.ok(html.includes('id="lab-arch-modal"'), 'Must contain #lab-arch-modal dialog');
  assert.ok(html.includes('id="lab-arch-title"'), 'Must contain #lab-arch-title');
  assert.ok(html.includes('id="lab-arch-svg"'), 'Must contain #lab-arch-svg');
  assert.ok(html.includes('id="btn-close-lab-arch"'), 'Must contain #btn-close-lab-arch');
});

test('Subphase 2.1.2: styles.css enforces full-viewport 100vh layout, zero outer scrollbars & IDE components', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Full-viewport 100vh
  assert.ok(css.includes('body.workbench-open'), 'CSS must define body.workbench-open');
  assert.ok(css.includes('height: 100vh;'), 'Must constrain body height to 100vh');
  assert.ok(css.includes('overflow: hidden;'), 'Must eliminate outer window scrollbars');

  // 2. Pane Tab Bar & Buttons
  assert.ok(css.includes('.pane-tab-bar'), 'Must style .pane-tab-bar');
  assert.ok(css.includes('.pane-tab-btn'), 'Must style .pane-tab-btn');
  assert.ok(css.includes('.pane-tab-btn.active'), 'Must define active tab indicator style');

  // 3. Line numbers gutter & editor container
  assert.ok(css.includes('.editor-container'), 'Must style .editor-container');
  assert.ok(css.includes('.editor-gutter'), 'Must style .editor-gutter');
  assert.ok(css.includes('.full-height-editor'), 'Must style .full-height-editor');
  assert.ok(css.includes('.full-height-terminal'), 'Must style .full-height-terminal');

  // 4. YAML Diff panel
  assert.ok(css.includes('.editor-diff-panel'), 'Must style .editor-diff-panel');
  assert.ok(css.includes('.diff-line.added'), 'Must style added diff lines');
  assert.ok(css.includes('.diff-line.removed'), 'Must style removed diff lines');

  // 5. Step card actions
  assert.ok(css.includes('.btn-run-step'), 'Must style .btn-run-step');
  assert.ok(css.includes('.btn-copy-step'), 'Must style .btn-copy-step');

  // 6. Socratic Hints Accordion
  assert.ok(css.includes('.hints-accordion'), 'Must style .hints-accordion');
  assert.ok(css.includes('.hint-details'), 'Must style .hint-details');
  assert.ok(css.includes('.hint-summary'), 'Must style .hint-summary');

  // 7. Observability styling
  assert.ok(css.includes('.observability-container'), 'Must style .observability-container');
  assert.ok(css.includes('.loki-log-stream'), 'Must style .loki-log-stream');
  assert.ok(css.includes('.trace-waterfall'), 'Must style .trace-waterfall');
});

test('Subphase 2.1.2: app.js wires workbench tabs, editor gutter, diff view, step run buttons, and arch modal', () => {
  const js = fs.readFileSync(jsPath, 'utf8');

  // 1. View switching sets body.workbench-open
  assert.ok(js.includes("classList.toggle('workbench-open'"), 'switchView must toggle workbench-open class');

  // 2. Tab switching logic
  assert.ok(js.includes('setupWorkbenchTabs'), 'app.js must define setupWorkbenchTabs');
  assert.ok(js.includes('.center-tab-btn'), 'Must attach click listeners to .center-tab-btn');
  assert.ok(js.includes('.right-tab-btn'), 'Must attach click listeners to .right-tab-btn');

  // 3. Editor Gutter & Diff
  assert.ok(js.includes('updateEditorGutter'), 'app.js must define updateEditorGutter');
  assert.ok(js.includes('computeSimpleDiff'), 'app.js must define computeSimpleDiff');
  assert.ok(js.includes('btn-format-yaml'), 'app.js must wire format YAML button');
  assert.ok(js.includes('btn-diff-manifest'), 'app.js must wire diff manifest button');

  // 4. Step run & copy buttons
  assert.ok(js.includes('btn-run-step'), 'app.js must render and wire .btn-run-step buttons');
  assert.ok(js.includes('btn-copy-step'), 'app.js must render and wire .btn-copy-step buttons');

  // 5. Architecture diagram modal
  assert.ok(js.includes('openLabArchModal'), 'app.js must define openLabArchModal');
  assert.ok(js.includes('closeLabArchModal'), 'app.js must define closeLabArchModal');
  assert.ok(js.includes('renderLabArchDiagram'), 'app.js must define renderLabArchDiagram');

  // 6. Observability & CIS Checklist
  assert.ok(js.includes('drawPromqlChart'), 'app.js must define drawPromqlChart');
  assert.ok(js.includes('seedObservability'), 'app.js must define seedObservability');
  assert.ok(js.includes('renderCisChecklist'), 'app.js must define renderCisChecklist');
  assert.ok(js.includes('topology-search-input'), 'app.js must wire topology search input');
});

