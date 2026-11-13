'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../public/index.html');
const cssPath = path.resolve(__dirname, '../public/css/styles.css');
const jsPath = path.resolve(__dirname, '../public/js/app.js');

test('Subphase 2.1.3: index.html defines interactive Architecture Studio with canvas viewport, palette, and inspector tabs', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Studio layout & Header controls
  assert.ok(html.includes('id="view-architect"'), 'Must contain #view-architect section');
  assert.ok(html.includes('id="arch-blueprint-select"'), 'Must contain #arch-blueprint-select');
  assert.ok(html.includes('id="btn-arch-deploy"'), 'Must contain #btn-arch-deploy');
  assert.ok(html.includes('id="btn-arch-save"'), 'Must contain #btn-arch-save');
  assert.ok(html.includes('id="btn-arch-clear"'), 'Must contain #btn-arch-clear');
  assert.ok(html.includes('id="btn-arch-fault-inject"'), 'Must contain #btn-arch-fault-inject');

  // 2. Component Palette Bar
  const mandatoryPalette = ['waf', 'ingress', 'service', 'deployment', 'database', 'storage', 'networkpolicy', 'mesh', 'gitops', 'observability', 'gpu-pool'];
  for (const p of mandatoryPalette) {
    assert.ok(html.includes(`data-type="${p}"`), `Palette must include component type "${p}"`);
  }

  // 3. Canvas Viewport & SVG Layers
  assert.ok(html.includes('id="arch-canvas-viewport"'), 'Must contain #arch-canvas-viewport');
  assert.ok(html.includes('id="arch-canvas-svg"'), 'Must contain #arch-canvas-svg');
  assert.ok(html.includes('id="arch-cables-group"'), 'Must contain #arch-cables-group');
  assert.ok(html.includes('id="arch-pulses-group"'), 'Must contain #arch-pulses-group');
  assert.ok(html.includes('id="arch-nodes-canvas"'), 'Must contain #arch-nodes-canvas');
  assert.ok(html.includes('id="btn-arch-zoom-in"'), 'Must contain zoom in button');
  assert.ok(html.includes('id="btn-arch-zoom-out"'), 'Must contain zoom out button');
  assert.ok(html.includes('id="btn-arch-zoom-reset"'), 'Must contain zoom reset button');

  // 4. Bi-Directional Inspector Tabs
  assert.ok(html.includes('id="arch-tab-btn-yaml"'), 'Must contain YAML tab button');
  assert.ok(html.includes('id="arch-tab-btn-hcl"'), 'Must contain HCL tab button');
  assert.ok(html.includes('id="arch-tab-btn-review"'), 'Must contain Review tab button');
  assert.ok(html.includes('id="arch-tab-yaml"'), 'Must contain YAML tab content panel');
  assert.ok(html.includes('id="arch-tab-hcl"'), 'Must contain HCL tab content panel');
  assert.ok(html.includes('id="arch-tab-review"'), 'Must contain Review tab content panel');
  assert.ok(html.includes('id="arch-yaml-out"'), 'Must retain #arch-yaml-out');
  assert.ok(html.includes('id="arch-hcl-out"'), 'Must retain #arch-hcl-out');
  assert.ok(html.includes('id="btn-copy-arch-yaml"'), 'Must contain copy YAML button');
  assert.ok(html.includes('id="btn-copy-arch-hcl"'), 'Must contain copy HCL button');
  assert.ok(html.includes('id="btn-arch-apply-yaml"'), 'Must contain apply YAML button');
  assert.ok(html.includes('id="arch-pillars-summary"'), 'Must contain #arch-pillars-summary');
  assert.ok(html.includes('id="arch-spofs-list"'), 'Must contain #arch-spofs-list');
  assert.ok(html.includes('id="arch-recommendations-list"'), 'Must contain #arch-recommendations-list');
});

test('Subphase 2.1.3: styles.css defines styles for node-graph canvas, bezier cables, packet pulses, and ports', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  // 1. Studio layout
  assert.ok(css.includes('.arch-studio-layout'), 'CSS must define .arch-studio-layout');
  assert.ok(css.includes('.arch-canvas-viewport'), 'CSS must define .arch-canvas-viewport');
  assert.ok(css.includes('.arch-canvas-svg'), 'CSS must define .arch-canvas-svg');

  // 2. Cables and packet animation
  assert.ok(css.includes('.arch-cable'), 'CSS must style .arch-cable');
  assert.ok(css.includes('.arch-cable.spof'), 'CSS must style .arch-cable.spof');
  assert.ok(css.includes('.arch-cable.killed'), 'CSS must style .arch-cable.killed');
  assert.ok(css.includes('.arch-packet-pulse'), 'CSS must style .arch-packet-pulse');

  // 3. Draggable Nodes & Connection Ports
  assert.ok(css.includes('.arch-canvas-node'), 'CSS must define .arch-canvas-node');
  assert.ok(css.includes('.arch-canvas-node.spof-node'), 'CSS must style .arch-canvas-node.spof-node');
  assert.ok(css.includes('.arch-canvas-node.killed-node'), 'CSS must style .arch-canvas-node.killed-node');
  assert.ok(css.includes('.arch-node-port'), 'CSS must style .arch-node-port');
  assert.ok(css.includes('.input-port'), 'CSS must style .input-port');
  assert.ok(css.includes('.output-port'), 'CSS must style .output-port');

  // 4. Pillar meters & SPOF item
  assert.ok(css.includes('.arch-pillar-grid'), 'CSS must style .arch-pillar-grid');
  assert.ok(css.includes('.arch-pillar-meter'), 'CSS must style .arch-pillar-meter');
  assert.ok(css.includes('.arch-spof-item'), 'CSS must style .arch-spof-item');
});

test('Subphase 2.1.3: app.js wires draggable node-graph, bezier cables, packet pulses, and fault injection', () => {
  const js = fs.readFileSync(jsPath, 'utf8');

  // 1. Architecture Designer initialization & layout
  assert.ok(js.includes('initArchitectureDesigner'), 'app.js must define initArchitectureDesigner');
  assert.ok(js.includes('computeBlueprintLayout'), 'app.js must define computeBlueprintLayout');
  assert.ok(js.includes('renderArchitectureCanvas'), 'app.js must define renderArchitectureCanvas');
  assert.ok(js.includes('renderCablesAndPulses'), 'app.js must define renderCablesAndPulses');

  // 2. Interactive dragging & ports
  assert.ok(js.includes('setupNodeDrag'), 'app.js must define setupNodeDrag');
  assert.ok(js.includes('connectingPortState'), 'app.js must track connectingPortState');
  assert.ok(js.includes('btn-rep-up'), 'app.js must wire replica increment');
  assert.ok(js.includes('btn-rep-down'), 'app.js must wire replica decrement');
  assert.ok(js.includes('btn-arch-clear'), 'app.js must wire clear canvas button');
  assert.ok(js.includes('btn-arch-fault-inject'), 'app.js must wire fault injection button');

  // 3. Tab switching & review
  assert.ok(js.includes('.arch-tab-btn'), 'app.js must wire .arch-tab-btn tab switching');
  assert.ok(js.includes('renderArchitectureReviewTab'), 'app.js must define renderArchitectureReviewTab');
});

test('Subphase 2.1.3: Server API compiles and deploys visual architecture DAG into in-memory VirtualCluster', async () => {
  const { createKubeLabsApp } = require('../src/server');
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    const testNodes = [
      { id: 'n-waf-1', type: 'waf', label: 'Edge Shield', namespace: 'edge', replicas: 2 },
      { id: 'n-svc-1', type: 'service', label: 'web-svc', namespace: 'production', replicas: 1, port: 80 },
      { id: 'n-dep-1', type: 'deployment', label: 'web-frontend', namespace: 'production', replicas: 3, image: 'nginx:alpine' }
    ];
    const testEdges = [
      { from: 'n-waf-1', to: 'n-svc-1', protocol: 'HTTPS/443' },
      { from: 'n-svc-1', to: 'n-dep-1', protocol: 'TCP/80' }
    ];

    // Test POST /api/architectures/analyze
    const analyzeRes = await fetch(`http://127.0.0.1:${port}/api/architectures/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: testNodes, edges: testEdges })
    });
    assert.equal(analyzeRes.status, 200);
    const analyzed = await analyzeRes.json();
    assert.ok(analyzed.kubernetesYaml.includes('kind: Deployment'));
    assert.ok(analyzed.kubernetesYaml.includes('kind: Service'));
    assert.ok(analyzed.opentofuHcl.includes('resource "kubernetes_deployment"'));
    assert.equal(typeof analyzed.analysis.overallScore, 'number');
    assert.equal(typeof analyzed.analysis.pillars.reliability, 'number');

    // Test POST /api/architectures/deploy
    const deployRes = await fetch(`http://127.0.0.1:${port}/api/architectures/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: testNodes, edges: testEdges })
    });
    assert.equal(deployRes.status, 200);
    const deployed = await deployRes.json();
    assert.ok(deployed.clusterState, 'Deploy must return updated clusterState snapshot');
    const hasDeployment = (deployed.clusterState.resources || []).some(
      (r) => r.kind === 'Deployment' && r.metadata.name.includes('web-frontend')
    );
    assert.ok(hasDeployment, 'Deployed architecture must reconcile into VirtualCluster deployments');
  } finally {
    await app.drainGracefully(1000);
  }
});
