/**
 * tests/stage2-filter-search.test.js
 * Subphase 2.2.3 Verification: Role-Based Filter Bar & Instant Search (Ctrl+K)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const CSS_PATH = path.join(ROOT_DIR, 'public', 'css', 'styles.css');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'app.js');

describe('Subphase 2.2.3 — Role-Based Filter Bar & Instant Search (Ctrl+K)', () => {
  const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
  const cssContent = fs.readFileSync(CSS_PATH, 'utf8');
  const jsContent = fs.readFileSync(JS_PATH, 'utf8');

  it('1. HTML structure contains #curriculum-filter-bar with search input, match badge & filter pills', () => {
    assert.ok(htmlContent.includes('id="curriculum-filter-bar"'), 'HTML must contain #curriculum-filter-bar');
    assert.ok(htmlContent.includes('id="curriculum-search-input"'), 'Filter bar must contain #curriculum-search-input');
    assert.ok(htmlContent.includes('id="curriculum-match-count"'), 'Filter bar must contain #curriculum-match-count');
    assert.ok(htmlContent.includes('id="btn-reset-filters"'), 'Filter bar must contain #btn-reset-filters');
    assert.ok(htmlContent.includes('id="btn-clear-curriculum-search"'), 'Filter bar must contain clear search button');
    assert.ok(htmlContent.includes('id="cert-filter-pills"'), 'Filter bar must contain #cert-filter-pills radiogroup');
    assert.ok(htmlContent.includes('id="difficulty-filter-pills"'), 'Filter bar must contain #difficulty-filter-pills radiogroup');
    assert.ok(htmlContent.includes('id="status-filter-pills"'), 'Filter bar must contain #status-filter-pills radiogroup');

    // Certification targets
    assert.ok(htmlContent.includes('data-filter-value="CKA"'), 'Pills must include CKA filter');
    assert.ok(htmlContent.includes('data-filter-value="CKAD"'), 'Pills must include CKAD filter');
    assert.ok(htmlContent.includes('data-filter-value="CKS"'), 'Pills must include CKS filter');
    assert.ok(htmlContent.includes('data-filter-value="LFCS"'), 'Pills must include LFCS filter');
    assert.ok(htmlContent.includes('data-filter-value="GitOps"'), 'Pills must include GitOps filter');
    assert.ok(htmlContent.includes('data-filter-value="SRE"'), 'Pills must include SRE filter');
    assert.ok(htmlContent.includes('data-filter-value="AI-Ops"'), 'Pills must include AI-Ops filter');

    // Difficulty levels
    assert.ok(htmlContent.includes('data-filter-value="Beginner"'), 'Pills must include Beginner filter');
    assert.ok(htmlContent.includes('data-filter-value="Intermediate"'), 'Pills must include Intermediate filter');
    assert.ok(htmlContent.includes('data-filter-value="Advanced"'), 'Pills must include Advanced filter');

    // Progression statuses
    assert.ok(htmlContent.includes('data-filter-value="mastered"'), 'Pills must include Mastered filter');
    assert.ok(htmlContent.includes('data-filter-value="progress"'), 'Pills must include In Progress filter');
    assert.ok(htmlContent.includes('data-filter-value="available"'), 'Pills must include Available filter');
  });

  it('2. CSS defines cybernetic styles for filter bar, search input focus, active pills & reset button', () => {
    assert.ok(cssContent.includes('.curriculum-filter-bar'), 'CSS must define .curriculum-filter-bar');
    assert.ok(cssContent.includes('.filter-search-row'), 'CSS must define .filter-search-row');
    assert.ok(cssContent.includes('.search-input-wrap'), 'CSS must define .search-input-wrap');
    assert.ok(cssContent.includes('.curriculum-search-input'), 'CSS must define .curriculum-search-input');
    assert.ok(cssContent.includes('.filter-match-badge'), 'CSS must define .filter-match-badge');
    assert.ok(cssContent.includes('.filter-pills-container'), 'CSS must define .filter-pills-container');
    assert.ok(cssContent.includes('.filter-pill'), 'CSS must define .filter-pill');
    assert.ok(cssContent.includes('.filter-pill.active'), 'CSS must define active state for .filter-pill');
    assert.ok(cssContent.includes('.btn-reset-filters'), 'CSS must define .btn-reset-filters');
    assert.ok(cssContent.includes('.btn-clear-search'), 'CSS must define .btn-clear-search');
  });

  it('3. JavaScript implements centralized isDomainMatchingFilters and resetCurriculumFilters', () => {
    assert.ok(jsContent.includes('curriculumFilterState'), 'app.js must maintain curriculumFilterState');
    assert.ok(jsContent.includes('function isDomainMatchingFilters('), 'app.js must define isDomainMatchingFilters');
    assert.ok(jsContent.includes('function resetCurriculumFilters('), 'app.js must define resetCurriculumFilters');

    // Verify filter matching logic on mock domains
    const mockDomainK8s = {
      id: 'kubernetes-core',
      title: 'Kubernetes Core Architecture',
      category: 'Kubernetes & CNCF',
      difficulty: 'Intermediate',
      summary: 'Pod scheduling and RBAC',
      labs: [{ id: 'lab-k8s-01', title: 'Pod Scaling' }]
    };

    const mockDomainLinux = {
      id: 'linux-fundamentals',
      title: 'Linux Kernel & Isolation',
      category: 'Linux & Systems',
      difficulty: 'Beginner',
      summary: 'Namespaces and cgroups v2',
      labs: [{ id: 'lab-linux-01', title: 'Cgroups Tuning' }]
    };

    // Test extraction of filter matching logic
    assert.ok(jsContent.includes("cert === 'CKA'"), 'Matcher must handle CKA filter');
    assert.ok(jsContent.includes("cert === 'CKS'"), 'Matcher must handle CKS filter');
    assert.ok(jsContent.includes("cert === 'LFCS'"), 'Matcher must handle LFCS filter');
    assert.ok(jsContent.includes("cert === 'GitOps'"), 'Matcher must handle GitOps filter');
    assert.ok(jsContent.includes("cert === 'SRE'"), 'Matcher must handle SRE filter');
    assert.ok(jsContent.includes("cert === 'AI-Ops'"), 'Matcher must handle AI-Ops filter');
  });

  it('4. Command Palette (Ctrl+K) indexes domains, labs, SEV incidents, and capstone projects', () => {
    assert.ok(jsContent.includes("badge: 'Domain'"), 'Command palette must index domains with Domain badge');
    assert.ok(jsContent.includes("badge: 'Lab'"), 'Command palette must index labs with Lab badge');
    assert.ok(jsContent.includes("badge: 'Incident'"), 'Command palette must index incidents with Incident badge');
    assert.ok(jsContent.includes("badge: 'Capstone'"), 'Command palette must index capstone projects with Capstone badge');
    assert.ok(jsContent.includes('openSyllabusDrawer(d.id)'), 'Domain action must open syllabus drawer');
    assert.ok(jsContent.includes('startIncident(inc.id)'), 'Incident action must launch incident drill');
  });

  it('5. JavaScript wires keyboard shortcut / and bidirectional search input synchronization', () => {
    assert.ok(jsContent.includes("e.key === '/'"), 'app.js must bind / keyboard shortcut to focus search');
    assert.ok(jsContent.includes('currSearchInput.addEventListener'), 'app.js must bind curriculum-search-input');
    assert.ok(jsContent.includes('domSearchInput.addEventListener'), 'app.js must bind domain-search-input');
    assert.ok(jsContent.includes('btnResetAllFilters.addEventListener'), 'app.js must bind reset filters button');
    assert.ok(jsContent.includes('curriculum-match-count'), 'app.js must update match count badge');
  });
});
