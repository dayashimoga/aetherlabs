'use strict';

/**
 * Stage 5 Phase 5.2 Subphase 5.2.1 - Server Hardening, Security Headers, Rate Limiting, Metrics & CI/Release Tests
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createKubeLabsApp } = require('../src/server');

test('Subphase 5.2.1: Server applies strict Security Headers (CSP, HSTS, X-Content-Type-Options, etc.)', async () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);

    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Must include Content-Security-Policy header');
    assert.ok(csp.includes("default-src 'self'"), 'CSP must restrict default-src');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must prevent iframe clickjacking');
    assert.ok(csp.includes("object-src 'none'"), 'CSP must disallow plugins/objects');

    const hsts = res.headers.get('strict-transport-security');
    assert.ok(hsts, 'Must include Strict-Transport-Security header');
    assert.ok(hsts.includes('max-age=63072000'), 'HSTS must specify 2-year max-age');
    assert.ok(hsts.includes('includeSubDomains'), 'HSTS must include subdomains');

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('permissions-policy').includes('geolocation=()'));
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');

    // Also verify static asset responses receive security headers
    const staticRes = await fetch(`http://127.0.0.1:${port}/`);
    assert.ok(staticRes.headers.get('content-security-policy'));
    assert.equal(staticRes.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await app.drainGracefully(1000);
  }
});

test('Subphase 5.2.1: Bounded Token-Bucket RateLimiter restricts excessive traffic with HTTP 429', async () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  // Set lower token threshold on router rateLimiter for deterministic testing
  app.router.rateLimiter.maxTokens = 5;
  app.router.rateLimiter.refillRatePerSec = 0;
  app.router.rateLimiter.reset();

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200, `Request ${i + 1} within burst limit should succeed`);
    }

    // 6th request must be rate limited
    const limitedRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(limitedRes.status, 429, 'Excess request must return HTTP 429');
    assert.equal(limitedRes.headers.get('retry-after'), '60', 'Must return Retry-After header');
    const body = await limitedRes.json();
    assert.equal(body.error.code, 'RATE_LIMIT_EXCEEDED');

    // Resetting bucket restores immediate access
    app.router.rateLimiter.reset();
    const restoredRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(restoredRes.status, 200, 'Resetting rate limit must restore access');
  } finally {
    await app.drainGracefully(1000);
  }
});

test('Subphase 5.2.1: Prometheus /metrics endpoint exposes OpenMetrics telemetry and kubelabs_info', async () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    // Make a test request to populate metrics
    await fetch(`http://127.0.0.1:${port}/api/health`);

    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/plain'));

    const text = await res.text();
    assert.ok(text.includes('kubelabs_http_requests_total'), 'Must expose http requests counter');
    assert.ok(text.includes('kubelabs_http_errors_total'), 'Must expose error counter');
    assert.ok(text.includes('kubelabs_http_request_duration_ms_avg'), 'Must expose latency gauge');
    assert.ok(text.includes('kubelabs_slo_availability_ratio'), 'Must expose SLO ratio');
    assert.ok(text.includes('kubelabs_active_sessions'), 'Must expose active sessions gauge');
    assert.ok(text.includes('kubelabs_memory_rss_bytes'), 'Must expose memory RSS gauge');
    assert.ok(text.includes('kubelabs_uptime_seconds'), 'Must expose uptime gauge');
    assert.ok(text.includes('kubelabs_info{version="3.0.0",edition="isomorphic"} 1'), 'Must expose version 3.0.0 build info');
  } finally {
    await app.drainGracefully(1000);
  }
});

test('Subphase 5.2.1: Health & Observability Probes (/livez, /readyz, /api/health) and graceful drain', async () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  try {
    // 1. Liveness probe
    const liveRes = await fetch(`http://127.0.0.1:${port}/api/livez`);
    assert.equal(liveRes.status, 200);
    const liveBody = await liveRes.json();
    assert.equal(liveBody.status, 'ok');
    assert.ok(liveBody.uptimeSeconds >= 0);

    // 2. Readiness probe
    const readyRes = await fetch(`http://127.0.0.1:${port}/api/readyz`);
    assert.equal(readyRes.status, 200);
    const readyBody = await readyRes.json();
    assert.equal(readyBody.status, 'ready');
    assert.equal(readyBody.pluginsLoaded, 26);

    // 3. API health endpoint
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.version, '3.0.0');
    assert.equal(healthBody.domainsCount, 26);
    assert.equal(healthBody.labsCount, 52);

    // 4. Offline sync endpoint
    const syncRes = await fetch(`http://127.0.0.1:${port}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedLabs: ['lab-k8s-01'], xp: 150 })
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.synced, true);

    // 5. Graceful draining transitions readiness probe to 503
    app.router.isDraining = true;
    const drainingRes = await fetch(`http://127.0.0.1:${port}/api/readyz`);
    assert.equal(drainingRes.status, 503, 'Readiness probe must return 503 during drain');
    const drainingBody = await drainingRes.json();
    assert.equal(drainingBody.status, 'draining');
  } finally {
    await app.drainGracefully(1000);
    assert.equal(app.isDraining(), true);
  }
});

test('Subphase 5.2.1: CI/Release Workflow .github/workflows/ci-release.yml is configured and validated', () => {
  const wfPath = path.join(__dirname, '..', '.github', 'workflows', 'ci-release.yml');
  assert.ok(fs.existsSync(wfPath), 'ci-release.yml must exist');
  const wfContent = fs.readFileSync(wfPath, 'utf8');

  assert.ok(wfContent.includes('matrix:'), 'Must configure multi-OS matrix');
  assert.ok(wfContent.includes('ubuntu-latest') && wfContent.includes('windows-latest') && wfContent.includes('macos-latest'));
  assert.ok(wfContent.includes('npm run audit:self'), 'Must execute 11-agent self-audit');
  assert.ok(wfContent.includes('npm run verify:subphases'), 'Must execute subphase verification ledger');
  assert.ok(wfContent.includes('npm run test:stage1'));
  assert.ok(wfContent.includes('npm run test:stage2'));
  assert.ok(wfContent.includes('npm run test:stage3'));
  assert.ok(wfContent.includes('npm run test:stage4'));
  assert.ok(wfContent.includes('npm run test:stage5'));
  assert.ok(wfContent.includes('npm test'));
  assert.ok(wfContent.includes('package-and-release:'), 'Must define release packaging job');
  assert.ok(wfContent.includes('SHA256SUMS.txt'), 'Must compute sha256 checksums');
});
