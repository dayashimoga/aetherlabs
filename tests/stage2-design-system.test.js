/**
 * tests/stage2-design-system.test.js
 * Subphase 2.1.1 Verification: Design Tokens, Glassmorphism & Typography
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');

describe('Subphase 2.1.1 — Design Tokens, Glassmorphism & Typography', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');

  it('1. HTML root element has dark-first default attribute data-theme="dark"', () => {
    assert.match(
      htmlContent,
      /<html[^>]*data-theme="dark"[^>]*>/i,
      'public/index.html must set data-theme="dark" on the <html> tag to eliminate FOUC'
    );
  });

  it('2. HTML document loads Inter and JetBrains Mono fonts via Google Fonts preconnect', () => {
    assert.ok(
      htmlContent.includes('fonts.googleapis.com'),
      'index.html should link to Google Fonts'
    );
    assert.ok(
      htmlContent.includes('Inter') && htmlContent.includes('JetBrains+Mono'),
      'index.html should load both Inter and JetBrains Mono fonts'
    );
    assert.ok(
      htmlContent.includes('rel="preconnect"'),
      'index.html should have preconnect links for high-performance font loading'
    );
  });

  it('3. CSS imports JetBrains Mono and Inter fonts', () => {
    assert.ok(
      cssContent.includes('@import url(') && cssContent.includes('JetBrains+Mono'),
      'CSS should @import JetBrains Mono and Inter fonts'
    );
  });

  it('4. CSS defines required futuristic dark design tokens in :root / [data-theme="dark"]', () => {
    // Canvas & Surfaces
    assert.ok(cssContent.includes('--bg-primary: #090d16'), 'CSS must define --bg-primary: #090d16');
    assert.ok(cssContent.includes('--bg-secondary: #111827'), 'CSS must define --bg-secondary: #111827');
    assert.ok(cssContent.includes('--bg-card: #131d31'), 'CSS must define --bg-card: #131d31');
    assert.ok(cssContent.includes('--bg-glass: rgba(17, 24, 39, 0.78)'), 'CSS must define --bg-glass');

    // Accent colors
    assert.ok(cssContent.includes('--accent-cyan: #38bdf8'), 'CSS must define --accent-cyan: #38bdf8');
    assert.ok(cssContent.includes('--accent-emerald: #10b981'), 'CSS must define --accent-emerald: #10b981');

    // Borders & focus
    assert.ok(cssContent.includes('--border-subtle: rgba(255, 255, 255, 0.08)'), 'CSS must define --border-subtle');
    assert.ok(cssContent.includes('--border-focus: #38bdf8'), 'CSS must define --border-focus: #38bdf8');

    // Typography stacks
    assert.ok(cssContent.includes("'Inter'"), 'CSS font-sans must include Inter');
    assert.ok(cssContent.includes("'JetBrains Mono'"), 'CSS font-mono must include JetBrains Mono');
  });

  it('5. CSS defines glassmorphism blur classes and tokens', () => {
    assert.ok(cssContent.includes('.glass-panel'), 'CSS must define .glass-panel utility');
    assert.ok(cssContent.includes('.glass-card'), 'CSS must define .glass-card utility');
    assert.ok(cssContent.includes('backdrop-filter: blur(16px)'), 'Glass panels must apply blur(16px)');
  });

  it('6. CSS defines futuristic dark scrollbars', () => {
    assert.ok(cssContent.includes('::-webkit-scrollbar'), 'CSS must define custom scrollbar');
    assert.ok(cssContent.includes('::-webkit-scrollbar-thumb'), 'CSS must define custom scrollbar thumb');
  });

  it('7. CSS defines light and high-contrast theme overrides', () => {
    assert.ok(cssContent.includes('[data-theme="light"]'), 'CSS must support light theme');
    assert.ok(cssContent.includes('[data-theme="high-contrast"]'), 'CSS must support high-contrast theme');
    assert.ok(cssContent.includes('--bg-primary: #000000'), 'High contrast theme must use pitch black canvas');
  });

  it('8. CSS styles typography elements: code, kbd, pre, samp and status glow badges', () => {
    assert.ok(cssContent.includes('code, kbd, samp'), 'CSS must style code, kbd, samp tags');
    assert.ok(cssContent.includes('.badge-glow-cyan'), 'CSS must define .badge-glow-cyan');
    assert.ok(cssContent.includes('.badge-glow-emerald'), 'CSS must define .badge-glow-emerald');
    assert.ok(cssContent.includes('.badge-glow-red'), 'CSS must define .badge-glow-red');
  });
});

