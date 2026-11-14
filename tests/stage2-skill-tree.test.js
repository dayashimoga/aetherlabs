/**
 * tests/stage2-skill-tree.test.js
 * Subphase 2.2.2 Verification: Interactive 7-Tier DAG Skill Tree Roadmap & Syllabus Drawer
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.2.2 — Interactive 7-Tier DAG Skill Tree Roadmap & Syllabus Drawer', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure contains #roadmap-section with title, legend, and #skill-tree-container', () => {
    assert.ok(htmlContent.includes('id="roadmap-section"'), 'HTML must contain #roadmap-section');
    assert.ok(htmlContent.includes('id="roadmap-heading"'), 'Section must contain #roadmap-heading');
    assert.ok(htmlContent.includes('7-Tier Cloud-Native Architecture DAG Skill Tree'), 'Heading must have 7-tier title');
    assert.ok(htmlContent.includes('class="roadmap-legend"'), 'Section must contain .roadmap-legend');
    assert.ok(htmlContent.includes('status-mastered'), 'Legend must indicate Mastered status');
    assert.ok(htmlContent.includes('status-progress'), 'Legend must indicate In Progress status');
    assert.ok(htmlContent.includes('status-unlocked'), 'Legend must indicate Available status');
    assert.ok(htmlContent.includes('status-locked'), 'Legend must indicate Locked status');
    assert.ok(htmlContent.includes('id="skill-tree-container"'), 'HTML must contain #skill-tree-container');
    assert.ok(htmlContent.includes('class="skill-tree-dag"'), '#skill-tree-container must have skill-tree-dag class');
  });

  it('2. HTML structure contains #domain-syllabus-drawer with slide-in aside, badges, labs list & break-fix drill', () => {
    assert.ok(htmlContent.includes('id="domain-syllabus-drawer"'), 'HTML must contain #domain-syllabus-drawer');
    assert.ok(htmlContent.includes('class="syllabus-drawer glass-panel"'), 'Drawer aside must have syllabus-drawer class');
    assert.ok(htmlContent.includes('id="btn-close-syllabus-drawer"'), 'Drawer must have close button');
    assert.ok(htmlContent.includes('id="syllabus-tier-badge"'), 'Drawer header must contain #syllabus-tier-badge');
    assert.ok(htmlContent.includes('id="syllabus-cert-badge"'), 'Drawer header must contain #syllabus-cert-badge');
    assert.ok(htmlContent.includes('id="syllabus-difficulty-badge"'), 'Drawer header must contain #syllabus-difficulty-badge');
    assert.ok(htmlContent.includes('id="syllabus-domain-title"'), 'Drawer must contain #syllabus-domain-title');
    assert.ok(htmlContent.includes('id="syllabus-domain-id"'), 'Drawer must contain #syllabus-domain-id');
    assert.ok(htmlContent.includes('id="syllabus-concept-desc"'), 'Drawer must contain #syllabus-concept-desc');
    assert.ok(htmlContent.includes('id="syllabus-labs-count"'), 'Drawer must contain #syllabus-labs-count');
    assert.ok(htmlContent.includes('id="syllabus-labs-list"'), 'Drawer must contain #syllabus-labs-list');
    assert.ok(htmlContent.includes('id="syllabus-breakfix-section"'), 'Drawer must contain #syllabus-breakfix-section');
    assert.ok(htmlContent.includes('id="syllabus-breakfix-title"'), 'Drawer must contain #syllabus-breakfix-title');
    assert.ok(htmlContent.includes('id="syllabus-btn-start-breakfix"'), 'Drawer must contain #syllabus-btn-start-breakfix');
    assert.ok(htmlContent.includes('id="syllabus-btn-start-domain"'), 'Drawer must contain #syllabus-btn-start-domain CTA');
  });

  it('3. CSS defines cybernetic styles for DAG tree, nodes, status dots, connectors & syllabus drawer', () => {
    assert.ok(cssContent.includes('.roadmap-section'), 'CSS must define .roadmap-section');
    assert.ok(cssContent.includes('.roadmap-header-bar'), 'CSS must define .roadmap-header-bar');
    assert.ok(cssContent.includes('.roadmap-legend'), 'CSS must define .roadmap-legend');
    assert.ok(cssContent.includes('.node-status-dot.status-mastered'), 'CSS must style .status-mastered');
    assert.ok(cssContent.includes('.node-status-dot.status-progress'), 'CSS must style .status-progress');
    assert.ok(cssContent.includes('pulseCyan'), 'CSS must animate in-progress nodes with pulseCyan');
    assert.ok(cssContent.includes('.skill-tree-dag'), 'CSS must define .skill-tree-dag');
    assert.ok(cssContent.includes('.tier-group'), 'CSS must define .tier-group');
    assert.ok(cssContent.includes('.tier-nodes-grid'), 'CSS must define .tier-nodes-grid');
    assert.ok(cssContent.includes('.domain-node-card'), 'CSS must define .domain-node-card');
    assert.ok(cssContent.includes('.domain-node-card.node-mastered'), 'CSS must style .node-mastered');
    assert.ok(cssContent.includes('.domain-node-card.node-progress'), 'CSS must style .node-progress');
    assert.ok(cssContent.includes('.domain-node-card.node-locked'), 'CSS must style .node-locked');
    assert.ok(cssContent.includes('.domain-node-progress-bar'), 'CSS must define .domain-node-progress-bar');
    assert.ok(cssContent.includes('.tier-connector'), 'CSS must define .tier-connector');
    assert.ok(cssContent.includes('.syllabus-drawer-backdrop'), 'CSS must define .syllabus-drawer-backdrop');
    assert.ok(cssContent.includes('.syllabus-drawer'), 'CSS must define .syllabus-drawer');
    assert.ok(cssContent.includes('slideInRight'), 'CSS must animate drawer with slideInRight');
    assert.ok(cssContent.includes('.syllabus-lab-item'), 'CSS must define .syllabus-lab-item');
  });

  it('4. JavaScript defines 7 progressive tiers covering all 26 domains with certification alignments', () => {
    assert.ok(jsContent.includes('const CURRICULUM_TIERS = ['), 'app.js must define CURRICULUM_TIERS array');
    assert.ok(jsContent.includes('Tier 1: Systems & Networking Foundations'), 'Tiers must include Tier 1');
    assert.ok(jsContent.includes('Tier 2: Packaging, CI/CD & GitOps Delivery'), 'Tiers must include Tier 2');
    assert.ok(jsContent.includes('Tier 3: Kubernetes Core, Security & Lifecycle Operations'), 'Tiers must include Tier 3');
    assert.ok(jsContent.includes('Tier 4: Infrastructure as Code & Multi-Cloud Architecture'), 'Tiers must include Tier 4');
    assert.ok(jsContent.includes('Tier 5: Service Mesh & Zero-Trust Cryptographic Security'), 'Tiers must include Tier 5');
    assert.ok(jsContent.includes('Tier 6: Observability, SRE & Platform Engineering'), 'Tiers must include Tier 6');
    assert.ok(jsContent.includes('Tier 7: Cutting-Edge & Autonomous AI-Ops'), 'Tiers must include Tier 7');

    // Verify all 26 plugin domains are accounted for across the 7 tiers
    const pluginFiles = fs.readdirSync(path.join(ROOT_DIR, 'plugins')).filter((f) => f.endsWith('.json'));
    assert.equal(pluginFiles.length, 26, 'Must have 26 plugin files');

    for (const f of pluginFiles) {
      const plugin = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'plugins', f), 'utf8'));
      assert.ok(
        jsContent.includes(`'${plugin.id}'`),
        `CURRICULUM_TIERS or mappings must include plugin domain ID: ${plugin.id}`
      );
    }
  });

  it('5. JavaScript implements render7TierSkillTree, openSyllabusDrawer, and closeSyllabusDrawer', () => {
    assert.ok(jsContent.includes('function render7TierSkillTree('), 'app.js must define render7TierSkillTree');
    assert.ok(jsContent.includes('function openSyllabusDrawer('), 'app.js must define openSyllabusDrawer');
    assert.ok(jsContent.includes('function closeSyllabusDrawer('), 'app.js must define closeSyllabusDrawer');
    assert.ok(jsContent.includes('render7TierSkillTree(filterText)'), 'renderPathsAndDomains must call render7TierSkillTree');
    assert.ok(jsContent.includes('btn-close-syllabus-drawer'), 'app.js must bind close button');
    assert.ok(jsContent.includes('syllabus-btn-start-breakfix'), 'app.js must wire break-fix drill button');
    assert.ok(jsContent.includes('syllabus-btn-start-domain'), 'app.js must wire start domain CTA');
    assert.ok(jsContent.includes('window.KubeLabsSkillTree'), 'app.js must export KubeLabsSkillTree');
  });
});
