/**
 * tests/stage2-navigation-layout.test.js
 * Subphase 2.1.2 Verification: 64px Left Icon Rail & Top Command Header
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.1.2 — 64px Left Icon Rail & Top Command Header', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure contains 64px Left Icon Rail with brand logo, nav tabs, and bottom action buttons', () => {
    assert.ok(htmlContent.includes('class="app-layout"'), 'HTML must contain .app-layout master wrapper');
    assert.ok(htmlContent.includes('class="app-nav-rail"'), 'HTML must contain .app-nav-rail aside');
    assert.ok(htmlContent.includes('class="rail-brand"'), 'Rail must contain .rail-brand logo');
    assert.ok(htmlContent.includes('class="rail-bottom"'), 'Rail must contain .rail-bottom');
    assert.ok(htmlContent.includes('id="rail-btn-cmd-k"'), 'Rail must contain command palette button #rail-btn-cmd-k');
    assert.ok(htmlContent.includes('id="rail-btn-diagnostics"'), 'Rail must contain diagnostics button #rail-btn-diagnostics');
    assert.ok(htmlContent.includes('id="rail-btn-theme"'), 'Rail must contain theme toggle #rail-btn-theme');

    // Rail contains strictly 5 workspace buttons with SVG icons and tooltips
    const navMatch = htmlContent.match(/<nav class="main-nav"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, 'Rail must contain <nav class="main-nav">');
    const tabMatches = navMatch[1].match(/<button class="nav-tab[^"]*"[^>]*data-view="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g);
    assert.equal(tabMatches.length, 5, 'Rail must contain strictly 5 workspace nav-tab buttons');
    assert.ok(navMatch[1].includes('<svg class="nav-icon"'), 'Nav tabs must contain SVG icons');
    assert.ok(navMatch[1].includes('<span class="nav-label"'), 'Nav tabs must contain .nav-label spans');
  });

  it('2. HTML structure contains 52px Top Command Header with breadcrumbs, Ctrl+K search trigger, and cluster health', () => {
    assert.ok(htmlContent.includes('class="top-header"'), 'HTML must contain .top-header');
    assert.ok(htmlContent.includes('class="header-breadcrumb"'), 'Header must contain .header-breadcrumb');
    assert.ok(htmlContent.includes('id="header-active-view-name"'), 'Breadcrumb must contain #header-active-view-name');
    assert.ok(htmlContent.includes('id="btn-open-cmd-palette"'), 'Header must contain Command Palette trigger #btn-open-cmd-palette');
    assert.ok(htmlContent.includes('Ctrl+K'), 'Header search trigger must display Ctrl+K shortcut badge');
    assert.ok(htmlContent.includes('id="header-cluster-health"'), 'Header must contain #header-cluster-health status pill');
    assert.ok(htmlContent.includes('class="status-dot"'), 'Cluster health pill must contain .status-dot');
  });

  it('3. HTML structure contains Command Palette modal dialog', () => {
    assert.ok(htmlContent.includes('id="command-palette-modal"'), 'HTML must contain #command-palette-modal');
    assert.ok(htmlContent.includes('class="command-palette-dialog'), 'Modal must contain .command-palette-dialog');
    assert.ok(htmlContent.includes('id="cmd-palette-input"'), 'Modal must contain #cmd-palette-input');
    assert.ok(htmlContent.includes('id="cmd-palette-results"'), 'Modal must contain #cmd-palette-results');
    assert.ok(htmlContent.includes('id="btn-close-cmd-palette"'), 'Modal must contain close button #btn-close-cmd-palette');
  });

  it('4. CSS defines 64px rail dimensions, sticky positioning, active indicators, and hover tooltips', () => {
    assert.ok(cssContent.includes('.app-nav-rail {'), 'CSS must define .app-nav-rail');
    assert.ok(cssContent.includes('width: 64px;'), 'Rail width must be strictly 64px');
    assert.ok(cssContent.includes('.nav-tab.active::before'), 'Active tab must have cyan indicator bar');
    assert.ok(cssContent.includes('.nav-tab .nav-label {'), 'CSS must define .nav-label tooltip positioning');
    assert.ok(cssContent.includes('.top-header {'), 'CSS must define .top-header');
    assert.ok(cssContent.includes('height: 52px;'), 'Header height must be strictly 52px');
    assert.ok(cssContent.includes('.header-cmd-search'), 'CSS must define .header-cmd-search bar');
    assert.ok(cssContent.includes('.status-healthy'), 'CSS must define .status-healthy pill');
  });

  it('5. CSS defines Command Palette modal and responsive mobile rail collapse', () => {
    assert.ok(cssContent.includes('.command-palette-dialog'), 'CSS must style .command-palette-dialog');
    assert.ok(cssContent.includes('.cmd-palette-search-bar'), 'CSS must style .cmd-palette-search-bar');
    assert.ok(cssContent.includes('.cmd-result-item'), 'CSS must style .cmd-result-item');
    assert.ok(cssContent.includes('@media (max-width: 768px)'), 'CSS must have responsive 768px breakpoint');
    assert.ok(cssContent.includes('position: fixed;'), 'Mobile nav rail must position fixed at bottom');
  });

  it('6. app.js implements Command Palette controller and wires shortcuts and triggers', () => {
    assert.ok(jsContent.includes('openCommandPalette'), 'app.js must define openCommandPalette');
    assert.ok(jsContent.includes('closeCommandPalette'), 'app.js must define closeCommandPalette');
    assert.ok(jsContent.includes('renderCommandPaletteResults'), 'app.js must define renderCommandPaletteResults');
    assert.ok(jsContent.includes('VIEW_NAMES'), 'app.js must track VIEW_NAMES');
    assert.ok(jsContent.includes('header-active-view-name'), 'app.js must update #header-active-view-name on switchView');
    assert.ok(jsContent.includes('btn-open-cmd-palette'), 'app.js must bind #btn-open-cmd-palette');
    assert.ok(jsContent.includes('rail-btn-cmd-k'), 'app.js must bind #rail-btn-cmd-k');
    assert.ok(jsContent.includes('rail-btn-diagnostics'), 'app.js must bind #rail-btn-diagnostics');
    assert.ok(jsContent.includes('rail-btn-theme'), 'app.js must bind #rail-btn-theme');
    assert.ok(
      jsContent.includes("e.key === 'k'") || jsContent.includes('e.key === "k"'),
      'app.js must listen for Ctrl/Cmd+K'
    );
  });
});

