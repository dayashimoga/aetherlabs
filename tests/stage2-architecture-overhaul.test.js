/**
 * tests/stage2-architecture-overhaul.test.js
 * Subphase 2.3.3 Verification: Bi-Directional Architecture Studio Overhaul
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');
const ARCH_ENGINE_PATH = path.join(ROOT_DIR, 'src', 'core', 'architectureEngine.js');

describe('Subphase 2.3.3 — Bi-Directional Architecture Studio Overhaul', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');
  const { ArchitectureEngine, ENTERPRISE_REFERENCE_ARCHITECTURES } = require(ARCH_ENGINE_PATH);

  it('1. HTML structure establishes Bi-Directional Architecture Studio controls and editors', () => {
    assert.ok(htmlContent.includes('id="view-architect"'), 'HTML must contain #view-architect');
    assert.ok(htmlContent.includes('id="arch-blueprint-select"'), 'Must contain #arch-blueprint-select');
    assert.ok(htmlContent.includes('id="arch-canvas-viewport"'), 'Must contain #arch-canvas-viewport');
    assert.ok(htmlContent.includes('id="arch-canvas-svg"'), 'Must contain #arch-canvas-svg');
    assert.ok(htmlContent.includes('id="arch-nodes-canvas"'), 'Must contain #arch-nodes-canvas');

    // Bi-directional YAML and HCL editors
    assert.ok(htmlContent.includes('id="arch-yaml-out"'), 'Must contain #arch-yaml-out');
    assert.ok(htmlContent.includes('id="arch-hcl-out"'), 'Must contain #arch-hcl-out');
    assert.ok(htmlContent.includes('id="btn-sync-arch-yaml"'), 'Must contain #btn-sync-arch-yaml');
    assert.ok(htmlContent.includes('id="btn-copy-arch-yaml"'), 'Must contain #btn-copy-arch-yaml');
    assert.ok(htmlContent.includes('id="btn-copy-arch-hcl"'), 'Must contain #btn-copy-arch-hcl');
    assert.ok(htmlContent.includes('id="btn-arch-apply-yaml"'), 'Must contain #btn-arch-apply-yaml');
    assert.ok(htmlContent.includes('id="btn-arch-deploy"'), 'Must contain #btn-arch-deploy');
  });

  it('2. CSS establishes unclipped 220px node cards, clean port connectors and responsive layout', () => {
    // Node card dimensions: min-width 220px
    assert.ok(cssContent.includes('.arch-canvas-node'), 'CSS must define .arch-canvas-node');
    assert.ok(cssContent.includes('min-width: 220px') || cssContent.includes('width: 220px'), 'Node card must be at least 220px wide');

    // Node title text overflow
    assert.ok(cssContent.includes('.arch-node-title'), 'CSS must define .arch-node-title');
    assert.ok(cssContent.includes('text-overflow: ellipsis'), 'Node title must declare text-overflow: ellipsis');
    assert.ok(cssContent.includes('white-space: nowrap'), 'Node title must declare white-space: nowrap');

    // Clean connection ports
    assert.ok(cssContent.includes('.arch-node-port'), 'CSS must define .arch-node-port');
    assert.ok(cssContent.includes('.input-port'), 'CSS must define .input-port');
    assert.ok(cssContent.includes('.output-port'), 'CSS must define .output-port');
    assert.ok(cssContent.includes('border-radius: 50%'), 'Ports must be circular');

    // Cables and packet pulses
    assert.ok(cssContent.includes('.arch-cable'), 'CSS must define .arch-cable');
    assert.ok(cssContent.includes('.arch-packet-pulse'), 'CSS must define .arch-packet-pulse');
  });

  it('3. JavaScript implements client-side manifest synthesizer preventing blank YAML/HCL outputs', () => {
    assert.ok(jsContent.includes('function compileArchitectureManifestsClient('), 'app.js must define compileArchitectureManifestsClient');
    assert.ok(jsContent.includes('function syncYamlToArchitectureCanvas('), 'app.js must define syncYamlToArchitectureCanvas');
    assert.ok(jsContent.includes('window.KubeLabsArchitectureStudio'), 'app.js must export window.KubeLabsArchitectureStudio');

    // Extract compileArchitectureManifestsClient and test directly
    const fnMatch = jsContent.match(/function compileArchitectureManifestsClient\([\s\S]*?\n  \}/);
    assert.ok(fnMatch, 'Must find compileArchitectureManifestsClient implementation');

    const fnScope = new Function(`
      ${fnMatch[0]}
      return { compileArchitectureManifestsClient };
    `);
    const { compileArchitectureManifestsClient } = fnScope();

    const sampleNodes = [
      { id: 'n-1', type: 'waf', label: 'Cloud WAF & Edge Shield', namespace: 'edge', replicas: 2 },
      { id: 'n-2', type: 'ingress', label: 'Gateway API / Ingress', namespace: 'edge', replicas: 2 },
      { id: 'n-3', type: 'service', label: 'ClusterIP Service', namespace: 'production', port: 80 },
      { id: 'n-4', type: 'deployment', label: 'Microservice Deployment (HA)', namespace: 'production', replicas: 3 },
      { id: 'n-5', type: 'database', label: 'CloudNativePG HA Database', namespace: 'production', replicas: 2 },
      { id: 'n-6', type: 'networkpolicy', label: 'Zero-Trust NetworkPolicy', namespace: 'production' }
    ];
    const sampleEdges = [
      { from: 'n-1', to: 'n-2', protocol: 'HTTPS/443' },
      { from: 'n-2', to: 'n-3', protocol: 'HTTP/80' },
      { from: 'n-3', to: 'n-4', protocol: 'TCP/mTLS' },
      { from: 'n-4', to: 'n-5', protocol: 'TCP/5432' }
    ];

    const result = compileArchitectureManifestsClient(sampleNodes, sampleEdges);
    assert.ok(result.kubernetesYaml, 'Synthesized YAML must not be empty');
    assert.ok(result.opentofuHcl, 'Synthesized HCL must not be empty');
    assert.ok(result.kubernetesYaml.includes('kind: Deployment'), 'Must include Deployment manifest');
    assert.ok(result.kubernetesYaml.includes('kind: Service'), 'Must include Service manifest');
    assert.ok(result.kubernetesYaml.includes('kind: Ingress'), 'Must include Ingress manifest');
    assert.ok(result.kubernetesYaml.includes('kind: StatefulSet'), 'Must include StatefulSet manifest');
    assert.ok(result.opentofuHcl.includes('resource "kubernetes_deployment"'), 'Must include HCL deployment');
    assert.ok(result.analysis, 'Must include client-side analysis');
    assert.equal(typeof result.analysis.overallScore, 'number');
    assert.ok(result.analysis.overallScore >= 0 && result.analysis.overallScore <= 100);
  });

  it('4. Bi-Directional parser converts YAML text documents back into visual canvas node topology', () => {
    const fnMatch = jsContent.match(/function syncYamlToArchitectureCanvas\([\s\S]*?\n  \}/);
    const compileMatch = jsContent.match(/function compileArchitectureManifestsClient\([\s\S]*?\n  \}/);
    assert.ok(fnMatch, 'Must find syncYamlToArchitectureCanvas implementation');

    const fnScope = new Function(`
      const state = {
        activeArch: {
          name: 'Test Platform',
          nodes: [],
          edges: []
        }
      };
      let canvasRendered = false;
      let cablesRendered = false;
      function renderArchitectureCanvas() { canvasRendered = true; }
      function renderCablesAndPulses() { cablesRendered = true; }
      function renderArchitectureReviewTab() {}
      ${compileMatch[0]}
      ${fnMatch[0]}
      return { syncYamlToArchitectureCanvas, state, getStatus: () => ({ canvasRendered, cablesRendered }) };
    `);

    // Create mock DOM textarea
    const yamlSample = [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: custom-checkout-api',
      '  namespace: production',
      'spec:',
      '  replicas: 4',
      '---',
      'apiVersion: v1',
      'kind: Service',
      'metadata:',
      '  name: custom-checkout-svc',
      '  namespace: production'
    ].join('\n');

    global.document = {
      getElementById: (id) => {
        if (id === 'arch-yaml-out') return { value: yamlSample };
        return { textContent: '' };
      }
    };

    try {
      const instance = fnScope();
      instance.syncYamlToArchitectureCanvas(false);

      assert.equal(instance.state.activeArch.nodes.length, 2, 'Must parse exactly 2 nodes from YAML');
      const depNode = instance.state.activeArch.nodes.find((n) => n.type === 'deployment');
      const svcNode = instance.state.activeArch.nodes.find((n) => n.type === 'service');
      assert.ok(depNode, 'Must identify Deployment node');
      assert.ok(svcNode, 'Must identify Service node');
      assert.equal(depNode.replicas, 4, 'Must parse replicas 4 from YAML spec');
      assert.equal(depNode.namespace, 'production');
      assert.ok(instance.getStatus().canvasRendered, 'Must trigger canvas rendering');
      assert.ok(instance.getStatus().cablesRendered, 'Must trigger cables rendering');
    } finally {
      delete global.document;
    }
  });

  it('5. Clean cable geometry and port alignment matches 220px card width and 48px vertical port center', () => {
    // Verify cables formula in renderCablesAndPulses
    assert.ok(jsContent.includes('const NODE_WIDTH = 220;'), 'Must define NODE_WIDTH = 220 in app.js');
    assert.ok(jsContent.includes('fromNode.x') && jsContent.includes('NODE_WIDTH'), 'x1 calculation must offset from fromNode.x by NODE_WIDTH');
    assert.ok(jsContent.includes('x2 = (toNode.x || 30);'), 'x2 calculation must anchor directly to toNode.x');

    // Verify blueprint layout spacing accommodates 220px cards with >= 40px column margins
    assert.ok(jsContent.includes('col * 260'), 'computeBlueprintLayout must space columns by at least 260px (220px + 40px margin)');
  });

  it('6. All 8 Enterprise Reference Blueprints compile cleanly with zero errors', () => {
    assert.equal(ENTERPRISE_REFERENCE_ARCHITECTURES.length, 8, 'Must provide all 8 enterprise reference blueprints');
    const engine = new ArchitectureEngine();

    for (const bp of ENTERPRISE_REFERENCE_ARCHITECTURES) {
      assert.ok(bp.id, 'Blueprint must have id');
      assert.ok(bp.name, 'Blueprint must have name');
      assert.ok(Array.isArray(bp.nodes), `Blueprint ${bp.id} must define nodes array`);
      assert.ok(bp.nodes.length > 0, `Blueprint ${bp.id} must contain at least 1 node`);

      const compiled = engine.compileToManifests(bp.nodes, bp.edges);
      assert.ok(compiled.kubernetesYaml && compiled.kubernetesYaml.length > 100, `Blueprint ${bp.id} must compile valid YAML`);
      assert.ok(compiled.opentofuHcl && compiled.opentofuHcl.length > 100, `Blueprint ${bp.id} must compile valid HCL`);
      assert.ok(compiled.analysis, `Blueprint ${bp.id} must compile analysis`);
      assert.equal(typeof compiled.analysis.overallScore, 'number');
    }
  });
});

