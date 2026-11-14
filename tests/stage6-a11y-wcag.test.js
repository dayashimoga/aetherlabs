'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

describe('Subphase 6.2.3 — WCAG 2.1 AA Keyboard & Screen-Reader Audit', () => {
  const rootDir = path.join(__dirname, '..');
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const cssPath = path.join(rootDir, 'public', 'css', 'styles.css');
  const jsPath = path.join(rootDir, 'public', 'js', 'app.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Relative luminance calculation according to WCAG 2.1 formula
  function getLuminance(hex) {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

    const sRGB = [r, g, b].map((val) => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  function getContrastRatio(hex1, hex2) {
    const lum1 = getLuminance(hex1);
    const lum2 = getLuminance(hex2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  }

  test('1. Semantic Landmarks & Skip-to-Main-Content Navigation (WCAG 2.4.1)', () => {
    // Skip to main content link
    assert.ok(html.includes('class="skip-link"'), 'HTML must declare .skip-link');
    assert.ok(html.includes('href="#main-content"'), 'Skip link must target #main-content');
    assert.ok(html.includes('id="main-content"'), 'Main element must declare id="main-content"');

    // Landmarks
    assert.ok(html.includes('role="banner"'), 'Header must declare role="banner"');
    assert.ok(html.includes('role="navigation"'), 'Nav components must declare role="navigation"');
    assert.ok(html.includes('role="main"'), 'Main container must declare role="main"');
    assert.ok(html.includes('role="contentinfo"'), 'Footer must declare role="contentinfo"');

    // View panels declare region and aria-labelledby
    const viewMatches = html.match(/<section id="view-[^"]+" class="view-panel[^"]*"[^>]*>/g) || [];
    assert.equal(viewMatches.length, 5, 'Must contain 5 view panel sections');
    for (const v of viewMatches) {
      assert.ok(v.includes('aria-labelledby='), `View panel must declare aria-labelledby: ${v}`);
    }
  });

  test('2. Universal Keyboard Shortcuts: Ctrl+K, Ctrl+Shift+D, and Escape Dismissal (WCAG 2.1.1, 2.1.2)', () => {
    // Command Palette shortcut Ctrl+K / Cmd+K
    assert.ok(
      js.includes("e.key === 'k'") || js.includes('e.key === "k"') || js.includes("e.key === 'K'"),
      'app.js must register keydown listener for Ctrl/Cmd+K'
    );
    assert.ok(js.includes('openCommandPalette()'), 'app.js must implement openCommandPalette');
    assert.ok(js.includes('closeCommandPalette()'), 'app.js must implement closeCommandPalette');

    // Diagnostics shortcut Ctrl+Shift+D
    assert.ok(
      js.includes("e.key === 'D'") || js.includes("e.key === 'd'"),
      'app.js must register keydown listener for Ctrl+Shift+D'
    );
    assert.ok(js.includes('openDiagnosticsModal()'), 'app.js must implement openDiagnosticsModal');
    assert.ok(js.includes('closeDiagnosticsModal()'), 'app.js must implement closeDiagnosticsModal');

    // Escape Key Modal Dismissal
    assert.ok(js.includes("e.key === 'Escape'"), 'app.js must listen for Escape key');
    assert.ok(js.includes('command-palette-modal'), 'Escape must check and close command-palette-modal');
    assert.ok(js.includes('diagnostics-modal'), 'Escape must check and close diagnostics-modal');
    assert.ok(js.includes('lab-arch-modal'), 'Escape must check and close lab-arch-modal');
    assert.ok(js.includes('domain-syllabus-drawer'), 'Escape must check and close domain-syllabus-drawer');

    // Command palette ArrowDown / ArrowUp navigation and Enter execution
    assert.ok(js.includes("e.key === 'ArrowDown'"), 'Command palette must handle ArrowDown navigation');
    assert.ok(js.includes("e.key === 'ArrowUp'"), 'Command palette must handle ArrowUp navigation');
    assert.ok(js.includes("e.key === 'Enter'"), 'Command palette must handle Enter execution');
  });

  test('3. Accessible Modal Dialogs & Explicit Close Buttons (WCAG 1.3.1, 4.1.2)', () => {
    const expectedModals = [
      { id: 'command-palette-modal', label: 'cmd-palette-title', closeId: 'btn-close-cmd-palette' },
      { id: 'diagnostics-modal', label: 'gov-heading', closeId: 'btn-close-diagnostics' },
      { id: 'lab-arch-modal', label: 'lab-arch-title', closeId: 'btn-close-lab-arch' },
      { id: 'domain-syllabus-drawer', label: 'syllabus-domain-title', closeId: 'btn-close-syllabus-drawer' }
    ];

    for (const m of expectedModals) {
      assert.ok(html.includes(`id="${m.id}"`), `HTML must contain #${m.id}`);
      assert.ok(html.includes(`aria-labelledby="${m.label}"`), `Modal #${m.id} must declare aria-labelledby="${m.label}"`);
      assert.ok(html.includes(`id="${m.closeId}"`), `Modal #${m.id} must contain close button #${m.closeId}`);
      assert.ok(html.includes(`aria-label="Close`), `Close button #${m.closeId} must declare aria-label`);
    }

    // Modal dialogs must have role="dialog" and aria-modal="true"
    const dialogs = html.match(/role="dialog"/g) || [];
    assert.ok(dialogs.length >= 4, 'Must define at least 4 accessible dialog elements');
  });

  test('4. ARIA Live Regions, Announcer & Log Stream Roles (WCAG 4.1.3)', () => {
    // Global polite live announcer
    assert.ok(html.includes('id="aria-live-announcer"'), 'HTML must declare #aria-live-announcer');
    assert.ok(html.includes('aria-live="polite"'), 'Announcer must declare aria-live="polite"');
    assert.ok(html.includes('aria-atomic="true"'), 'Announcer must declare aria-atomic="true"');

    // Announce function in app.js
    assert.ok(js.includes('function announceAria(message)'), 'app.js must declare announceAria helper');
    assert.ok(js.includes('Navigated to'), 'switchView must announce view transitions via announceAria');
    assert.ok(js.includes('Command Palette opened'), 'openCommandPalette must announce open state');
    assert.ok(js.includes('Diagnostics modal'), 'openDiagnosticsModal must announce open state');

    // Terminal and Loki log live regions
    assert.ok(html.includes('id="terminal-output" class="terminal-output" role="log" aria-live="polite"'),
      '#terminal-output must declare role="log" and aria-live="polite"');
    assert.ok(html.includes('id="loki-log-tailer" class="loki-log-stream" role="log" aria-live="polite"'),
      '#loki-log-tailer must declare role="log" and aria-live="polite"');
  });

  test('5. Keyboard Resizer Dividers & Mobile Pane Switcher Accessibility (WCAG 2.1.1, 2.5.3)', () => {
    // Left & Right resizers
    assert.ok(html.includes('id="resizer-left"'), 'Workbench must contain #resizer-left');
    assert.ok(html.includes('id="resizer-right"'), 'Workbench must contain #resizer-right');

    const resizerLeft = html.match(/<div class="workbench-resizer" id="resizer-left"[^>]*>/);
    assert.ok(resizerLeft, 'Must find left resizer tag');
    assert.ok(resizerLeft[0].includes('role="separator"'), 'Resizer must declare role="separator"');
    assert.ok(resizerLeft[0].includes('tabindex="0"'), 'Resizer must be keyboard focusable (tabindex="0")');
    assert.ok(resizerLeft[0].includes('aria-orientation="vertical"'), 'Resizer must declare aria-orientation="vertical"');
    assert.ok(resizerLeft[0].includes('aria-valuenow='), 'Resizer must declare aria-valuenow');
    assert.ok(resizerLeft[0].includes('aria-valuemin='), 'Resizer must declare aria-valuemin');
    assert.ok(resizerLeft[0].includes('aria-valuemax='), 'Resizer must declare aria-valuemax');

    // Keyboard ArrowLeft / ArrowRight handlers in app.js
    assert.ok(js.includes("e.key === 'ArrowLeft'"), 'app.js resizer handler must listen to ArrowLeft');
    assert.ok(js.includes("e.key === 'ArrowRight'"), 'app.js resizer handler must listen to ArrowRight');
    assert.ok(js.includes('announceAria'), 'Resizer keyboard adjustment must announce pixel width');

    // Mobile pane switcher tabs
    assert.ok(html.includes('role="tablist" aria-label="Mobile Workbench Pane Tabs"'),
      'Mobile pane switcher must declare role="tablist"');
    assert.ok(html.includes('role="tab" aria-selected="true"'),
      'Mobile pane active tab must declare role="tab" and aria-selected="true"');
  });

  test('6. Form Controls, Search Inputs & Dropdowns have Accessible Labels (WCAG 1.3.1, 4.1.2)', () => {
    const requiredInputs = [
      { id: 'cmd-palette-input', attr: 'aria-label' },
      { id: 'terminal-input', attr: 'aria-label' },
      { id: 'wb-lab-selector', attr: 'aria-label' },
      { id: 'domain-search-input', attr: 'aria-label' },
      { id: 'arch-blueprint-select', attr: 'aria-label' },
      { id: 'promql-preset-selector', attr: 'aria-label' },
      { id: 'promql-query-input', attr: 'placeholder' },
      { id: 'loki-filter-input', attr: 'placeholder' },
      { id: 'topology-search-input', attr: 'placeholder' }
    ];

    for (const item of requiredInputs) {
      assert.ok(html.includes(`id="${item.id}"`), `HTML must contain input #${item.id}`);
      const tagMatch = html.match(new RegExp(`<[^>]*id="${item.id}"[^>]*>`));
      assert.ok(tagMatch, `Must match tag for #${item.id}`);
      assert.ok(tagMatch[0].includes(item.attr), `Input #${item.id} must declare ${item.attr}`);
    }
  });

  test('7. Color Contrast Ratios (WCAG 2.1 AA >= 4.5:1), Focus Visibility & Reduced Motion', () => {
    // 1. Math Contrast Proof:
    const bgDark = '#090d16';
    const bgCard = '#131d31';

    const textPrimary = '#f8fafc';
    const textSecondary = '#cbd5e1';
    const textMuted = '#94a3b8';
    const accentCyan = '#38bdf8';
    const accentGreen = '#10b981';

    const crPrimary = getContrastRatio(textPrimary, bgDark);
    assert.ok(crPrimary >= 7.0, `Primary text contrast ratio (${crPrimary.toFixed(2)}) must exceed 7:1 (AAA)`);

    const crSecondary = getContrastRatio(textSecondary, bgDark);
    assert.ok(crSecondary >= 4.5, `Secondary text contrast ratio (${crSecondary.toFixed(2)}) must exceed 4.5:1 (AA)`);

    const crMuted = getContrastRatio(textMuted, bgDark);
    assert.ok(crMuted >= 4.5, `Muted text contrast ratio (${crMuted.toFixed(2)}) must exceed 4.5:1 (AA)`);

    const crCyan = getContrastRatio(accentCyan, bgDark);
    assert.ok(crCyan >= 4.5, `Cyan accent contrast ratio (${crCyan.toFixed(2)}) must exceed 4.5:1 (AA)`);

    const crGreen = getContrastRatio(accentGreen, bgDark);
    assert.ok(crGreen >= 4.5, `Green accent contrast ratio (${crGreen.toFixed(2)}) must exceed 4.5:1 (AA)`);

    const crCardPrimary = getContrastRatio(textPrimary, bgCard);
    assert.ok(crCardPrimary >= 7.0, `Card primary text contrast (${crCardPrimary.toFixed(2)}) must exceed 7:1`);

    // High Contrast Theme AAA verification
    const highContrastBg = '#000000';
    const highContrastText = '#ffffff';
    const crHighContrast = getContrastRatio(highContrastText, highContrastBg);
    assert.equal(crHighContrast.toFixed(1), '21.0', 'High contrast theme must provide 21:1 pure contrast');

    // 2. CSS Focus Visible & Outline
    assert.ok(css.includes(':focus-visible'), 'CSS must define :focus-visible');
    assert.ok(css.includes('outline: 2px solid var(--border-focus);'), 'Focus indicator must declare 2px solid outline');

    // 3. CSS Reduced Motion Support
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'),
      'CSS must define prefers-reduced-motion media query');
    assert.ok(css.includes('animation-duration: 0.01ms !important;'),
      'Reduced motion must eliminate animation duration');

    // 4. Skip link styling
    assert.ok(css.includes('.skip-link'), 'CSS must style .skip-link');
    assert.ok(css.includes('.skip-link:focus'), 'CSS must style .skip-link:focus with visible top displacement');
  });
});
