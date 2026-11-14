/**
 * Subphase 6.3.3 — Documentation & Walkthrough Update Verification Suite
 *
 * Verifies that README.md, docs/07-CURRICULUM-CATALOG.md,
 * docs/14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md, and
 * docs/15-V4-SUBPHASE-TRACKING-LEDGER.md are 100% synchronized with the
 * full KubeLabs v4.0 platform:
 *  - All 45 Curriculum Domains & 90 Interactive Labs
 *  - All 25 Chaos War Room Incident Simulations
 *  - All 8 Multi-Milestone Capstone Projects (26 Milestones)
 *  - All 6 Practical Performance Certification Simulators (Dual Ed25519 & HMAC-SHA256)
 *  - All 5 Primary Workspace Views in UI v4.0
 *  - All 54 Subphases across 6 Stages marked [COMPLETED]
 *  - Zero Stubs, Placeholders, or Broken File References
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const readmePath = path.join(rootDir, 'README.md');
const catalogPath = path.join(rootDir, 'docs', '07-CURRICULUM-CATALOG.md');
const walkthroughPath = path.join(rootDir, 'docs', '14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md');
const ledgerPath = path.join(rootDir, 'docs', '15-V4-SUBPHASE-TRACKING-LEDGER.md');
const benchmarksPath = path.join(rootDir, 'docs', '10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md');
const domainsDir = path.join(rootDir, 'src', 'curriculum', 'domains');

describe('Subphase 6.3.3 — Documentation & Walkthrough Update', () => {

  it('1. README.md Synchronized with Complete KubeLabs v4.0 Specifications', () => {
    assert.ok(fs.existsSync(readmePath), 'README.md must exist in root');
    const readme = fs.readFileSync(readmePath, 'utf8');

    // Title and Version
    assert.ok(readme.includes('# KubeLabs — Enterprise Kubernetes & Cloud-Native Lab Platform (v4.0)'), 'README must state v4.0');
    assert.ok(readme.includes('"dependencies": {}'), 'README must state zero runtime dependencies');

    // Counts
    assert.ok(readme.includes('45 Modular Technology Domains'), 'README must reference 45 domains');
    assert.ok(readme.includes('90 Interactive Hands-On Labs'), 'README must reference 90 labs');
    assert.ok(readme.includes('25 Production Chaos War Room Incidents') || readme.includes('25 Chaos War Room Incidents'), 'README must reference 25 incidents');
    assert.ok(readme.includes('8 Multi-Milestone Production Capstone Projects'), 'README must reference 8 capstones');
    assert.ok(readme.includes('26 Milestones'), 'README must reference 26 milestones');
    assert.ok(readme.includes('6 Hands-On Practical Performance Certification Simulators'), 'README must reference 6 performance exams');
    assert.ok(readme.includes('5 Primary Workspace Views'), 'README must reference 5 primary workspace views');

    // Quality gates and subphases
    assert.ok(readme.includes('54 Quality Checks') || readme.includes('54/54 Checks PASS'), 'README must reference 54 quality checks');
    assert.ok(readme.includes('54 Execution Subphases') || readme.includes('54/54 VERIFIED'), 'README must reference 54 subphases');

    // Certification Simulators
    assert.ok(readme.includes('KCNA-SIM') && readme.includes('CKA-SIM') && readme.includes('CKS-SIM'), 'README must reference KCNA, CKA, CKS');
    assert.ok(readme.includes('CKRE-SIM') && readme.includes('CPA-SIM') && readme.includes('CMAOS-SIM'), 'README must reference CKRE, CPA, CMAOS');
    assert.ok(readme.includes('Ed25519'), 'README must reference Ed25519 signing');

    // Empirical Benchmarks
    assert.ok(readme.includes('< 250 ms') && readme.includes('~113 ms'), 'README must document startup latency benchmark');
    assert.ok(readme.includes('~45.4 MB') || readme.includes('~44.8 MB'), 'README must document idle memory benchmark');
  });

  it('2. Master Curriculum Catalog Covers All 45 Domains and 90 Interactive Labs', () => {
    assert.ok(fs.existsSync(catalogPath), 'docs/07-CURRICULUM-CATALOG.md must exist');
    const catalog = fs.readFileSync(catalogPath, 'utf8');

    assert.ok(catalog.includes('4.0.0'), 'Catalog must declare Version 4.0.0');
    assert.ok(catalog.includes('45 Domains | 7 Tiers | 6 Guided Role Tracks | 90 Hands-On Labs'), 'Catalog coverage header must declare 45 domains, 7 tiers, 6 tracks, 90 labs');

    // Read all 45 domain files and verify their ID and labs are present in catalog
    const domainFiles = fs.readdirSync(domainsDir).filter(f => f.endsWith('.json')).sort();
    assert.equal(domainFiles.length, 45, 'There must be exactly 45 domain JSON files');

    for (const f of domainFiles) {
      const d = JSON.parse(fs.readFileSync(path.join(domainsDir, f), 'utf8'));
      assert.ok(catalog.includes(`\`${d.id}\``), `Catalog must list domain ID ${d.id}`);
      assert.equal(d.labs.length, 2, `Domain ${d.id} must have exactly 2 labs`);
      for (const lab of d.labs) {
        assert.ok(catalog.includes(`\`${lab.id}\``), `Catalog must list lab ID ${lab.id}`);
      }
    }

    // Verify 8 Capstones with 26 milestones
    assert.ok(catalog.includes('proj-01-hardened-edge-node') && catalog.includes('proj-08-kserve-distributed-ai-cloud'), 'Catalog must list all capstones');
    assert.ok(catalog.includes('26 Milestones'), 'Catalog must reference 26 milestones');

    // Verify 25 Incidents
    for (let i = 1; i <= 25; i++) {
      const incPrefix = `inc-${String(i).padStart(2, '0')}`;
      assert.ok(catalog.includes(incPrefix), `Catalog must list incident ${incPrefix}`);
    }

    // Verify 6 Performance Exams
    assert.ok(catalog.includes('KCNA-SIM') && catalog.includes('CKA-SIM') && catalog.includes('CKS-SIM'), 'Catalog must include foundations exams');
    assert.ok(catalog.includes('CKRE-SIM') && catalog.includes('CPA-SIM') && catalog.includes('CMAOS-SIM'), 'Catalog must include advanced exams');
  });

  it('3. Comprehensive Project Walkthrough Details Full v4.0 System & Architecture', () => {
    assert.ok(fs.existsSync(walkthroughPath), 'docs/14-COMPREHENSIVE-PROJECT-WALKTHROUGH.md must exist');
    const walkthrough = fs.readFileSync(walkthroughPath, 'utf8');

    assert.ok(walkthrough.includes('KubeLabs v4.0: Comprehensive Project Walkthrough'), 'Walkthrough must declare v4.0');
    assert.ok(walkthrough.includes('45 Domains across 7 Tiers'), 'Walkthrough must reference 45 domains across 7 tiers');
    assert.ok(walkthrough.includes('90 Interactive Labs'), 'Walkthrough must reference 90 interactive labs');
    assert.ok(walkthrough.includes('25 Chaos War Room Incidents'), 'Walkthrough must reference 25 chaos incidents');
    assert.ok(walkthrough.includes('8 Capstones (26 Milestones)'), 'Walkthrough must reference 8 capstones with 26 milestones');
    assert.ok(walkthrough.includes('5 Primary Workspace Views'), 'Walkthrough must reference 5 primary workspace views');
    assert.ok(walkthrough.includes('54 Subphases (100% Verified)'), 'Walkthrough must reference 54 subphases');

    // Check all 5 views documented
    assert.ok(walkthrough.includes('view-paths') && walkthrough.includes('view-workbench'), 'Walkthrough must document view-paths and view-workbench');
    assert.ok(walkthrough.includes('view-incidents') && walkthrough.includes('view-architect') && walkthrough.includes('view-certs'), 'Walkthrough must document view-incidents, view-architect, and view-certs');

    // Check keyboard shortcuts and accessibility
    assert.ok(walkthrough.includes('Ctrl+K') || walkthrough.includes('Cmd+K'), 'Walkthrough must document Command Palette shortcut');
    assert.ok(walkthrough.includes('Ctrl+Shift+D'), 'Walkthrough must document Diagnostics modal shortcut');
    assert.ok(walkthrough.includes('WCAG 2.1 AA'), 'Walkthrough must document WCAG 2.1 AA accessibility');

    // Check 18 evaluators documented
    assert.ok(walkthrough.includes('18 specialized evaluators') || walkthrough.includes('18 evaluators'), 'Walkthrough must detail 18 evaluators');
    assert.ok(walkthrough.includes('slo_burn_rate_within_budget'), 'Walkthrough must document SLO evaluator');
    assert.ok(walkthrough.includes('circuit_breaker_tripped'), 'Walkthrough must document circuit breaker evaluator');
  });

  it('4. V4 Subphase Tracking Ledger Validates All 54 Subphases as COMPLETED', () => {
    assert.ok(fs.existsSync(ledgerPath), 'docs/15-V4-SUBPHASE-TRACKING-LEDGER.md must exist');
    const ledger = fs.readFileSync(ledgerPath, 'utf8');

    // Verify all 54 subphases are represented
    for (let stage = 1; stage <= 6; stage++) {
      for (let phase = 1; phase <= 3; phase++) {
        for (let sub = 1; sub <= 3; sub++) {
          const spId = `${stage}.${phase}.${sub}`;
          assert.ok(ledger.includes(`**${spId}**`), `Ledger must contain Subphase ${spId}`);
        }
      }
    }

    // Assert zero pending subphases in the table
    const pendingMatches = ledger.match(/\|\s*`\[PENDING\]`\s*\|/g);
    assert.equal(pendingMatches, null, 'There must be zero [PENDING] subphases remaining in the ledger');

    // Subphase 6.3.3 must be [COMPLETED]
    assert.ok(ledger.includes('| **6.3.3** | Phase 6.3 | Documentation & Walkthrough Update | `[COMPLETED]`'), 'Subphase 6.3.3 must be marked [COMPLETED]');
  });

  it('5. Static Anti-Stub and Integrity Audit Across All Documentation', () => {
    // Assert README, catalog, walkthrough, and benchmarks contain zero TODOs or stubs
    const cleanDocs = [readmePath, catalogPath, walkthroughPath, benchmarksPath];
    const forbiddenMarkers = [
      'TODO:',
      'FIXME:',
      'COMING_SOON_STUB',
      'PLACEHOLDER_IMPLEMENTATION',
      'UNIMPLEMENTED_STUB'
    ];

    for (const docPath of cleanDocs) {
      const content = fs.readFileSync(docPath, 'utf8');
      for (const marker of forbiddenMarkers) {
        assert.ok(!content.includes(marker), `Doc ${path.basename(docPath)} must not contain forbidden marker "${marker}"`);
      }
    }

    // Ledger only mentions the marker names in the descriptive summary of the 6.1.3 audit
    const ledgerContent = fs.readFileSync(ledgerPath, 'utf8');
    assert.ok(!ledgerContent.includes('TODO: implement'), 'Ledger must not contain pending TODOs');
    assert.ok(!ledgerContent.includes('FIXME: fix'), 'Ledger must not contain pending FIXMEs');
  });

  it('6. Performance and Scalability Metrics Parity Across Benchmarks & Documentation', () => {
    assert.ok(fs.existsSync(benchmarksPath), 'docs/10-PERFORMANCE-AND-SCALABILITY-BENCHMARKS.md must exist');
    const benchmarks = fs.readFileSync(benchmarksPath, 'utf8');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const walkthrough = fs.readFileSync(walkthroughPath, 'utf8');

    // Cold boot latency budget < 250ms and measured ~113ms
    assert.ok(benchmarks.includes('< 250 ms') && benchmarks.includes('~113 ms'), 'Benchmarks must state cold boot latency');
    assert.ok(readme.includes('< 250 ms'), 'README must state cold boot budget');
    assert.ok(walkthrough.includes('~113 milliseconds') || walkthrough.includes('< 250 ms'), 'Walkthrough must document latency');

    // Idle memory budget < 65MB and measured ~45.4MB
    assert.ok(benchmarks.includes('~45.4 MB'), 'Benchmarks must state measured idle memory');
    assert.ok(readme.includes('~45.4 MB'), 'README must state measured idle memory');

    // Control plane reconciliation budget < 50ms and measured ~13.04ms
    assert.ok(benchmarks.includes('13.04 ms'), 'Benchmarks must state scale reconciliation');
    assert.ok(readme.includes('13.04 ms'), 'README must state scale reconciliation');
  });

});
