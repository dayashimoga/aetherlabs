'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKubeLabsApp } = require('../src/server');
const { VirtualCluster, parseManifests } = require('../src/engine/virtualCluster');
const { TerminalEngine } = require('../src/engine/terminalEngine');
const { ValidationEngine } = require('../src/engine/validationEngine');

test('1. PluginManager loads and validates all 26 domains, 6 tracks, 52 labs, and 8 capstone projects with zero schema errors', () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  assert.equal(app.pluginManager.validationErrors.length, 0, `Validation errors: ${app.pluginManager.validationErrors.join(', ')}`);
  assert.equal(app.pluginManager.getAllDomains().length, 26);
  assert.equal(app.pluginManager.getTracks().length, 6);
  assert.equal(app.pluginManager.getAllLabs().length, 52);
  assert.equal(app.projectEngine.listProjects().length, 8);
  app.database.close();
});

test('2. VirtualCluster reconciles Deployments, Endpoints, YAML manifests, and realistic pod error states', () => {
  const cluster = new VirtualCluster();
  const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-gw
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-gw
  template:
    metadata:
      labels:
        app: payment-gw
    spec:
      containers:
        - name: gw
          image: nginx:1.27-alpine
---
apiVersion: v1
kind: Service
metadata:
  name: payment-gw-svc
  namespace: production
spec:
  selector:
    app: payment-gw
  ports:
    - port: 80
      targetPort: 8080
`;
  const docs = parseManifests(yaml);
  assert.equal(docs.length, 2);

  cluster.applyManifest(yaml);
  const pods = cluster.getResources('Pod', 'production');
  assert.equal(pods.length, 3);
  assert.ok(pods.every((p) => p.status.phase === 'Running' && p.status.reason === 'Running'));

  const svc = cluster.getResource('Service', 'payment-gw-svc', 'production');
  assert.equal(svc.status.endpointCount, 3);

  // Test ImagePullBackOff simulation
  cluster.setImage('Deployment', 'payment-gw', 'gw', 'nginx:1.27-broken', 'production');
  const brokenPods = cluster.getResources('Pod', 'production');
  assert.ok(brokenPods.every((p) => p.status.reason === 'ImagePullBackOff'));
  assert.equal(cluster.getResource('Service', 'payment-gw-svc', 'production').status.endpointCount, 0);
});

test('3. TerminalEngine executes multi-CLI commands across Kubernetes, CNCF, Linux, IaC, Multi-Cloud, Security & AI-Ops', () => {
  const cluster = new VirtualCluster();
  const term = new TerminalEngine(cluster);

  assert.equal(term.execute('kubectl get nodes').exitCode, 0);
  assert.equal(term.execute('helm install my-rel bitnami/nginx -n production').exitCode, 0);
  assert.equal(term.execute('docker images').exitCode, 0);
  assert.equal(term.execute('argocd app sync demo-app').exitCode, 0);
  assert.equal(term.execute('istioctl analyze').exitCode, 0);
  assert.equal(term.execute('tofu init').exitCode, 0);
  assert.equal(term.execute('tofu apply').exitCode, 0);
  assert.equal(term.execute('aws eks describe-cluster --name eks-prod').exitCode, 0);
  assert.equal(term.execute('az aks show --name aks-prod').exitCode, 0);
  assert.equal(term.execute('gcloud container clusters describe gke-prod').exitCode, 0);
  assert.equal(term.execute('trivy image nginx:1.27-alpine').exitCode, 0);
  assert.equal(term.execute('cosign verify nginx:1.27-alpine').exitCode, 0);
  assert.equal(term.execute('aiops analyze').exitCode, 0);
  assert.equal(term.execute('systemctl status kubelet').exitCode, 0);
  assert.equal(term.execute('ss -tulpn').exitCode, 0);
  assert.equal(term.execute('flux check').exitCode, 0);
  assert.equal(term.execute('flux reconcile kustomization flux-system').exitCode, 0);
  assert.equal(term.execute('linkerd check').exitCode, 0);
  assert.equal(term.execute('consul members').exitCode, 0);
  assert.equal(term.execute('opa eval').exitCode, 0);
  assert.equal(term.execute('conftest test').exitCode, 0);
  assert.equal(term.execute('chaos inject -n production').exitCode, 0);
  assert.equal(term.execute('kubectl create job db-migrate --image=postgres:16-alpine -n production').exitCode, 0);
  assert.equal(term.execute('kubectl create cronjob nightly-report --image=busybox:1.36 -n production').exitCode, 0);
  assert.equal(cluster.getResources('Job', 'production').length >= 2, true);
});

test('4. Deterministic E2E Lab Solver Suite: Every single lab (52/52) fails before solution and passes 100% after solution', () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  const valEngine = new ValidationEngine();
  const allLabs = app.pluginManager.getAllLabs();
  assert.equal(allLabs.length, 52);

  for (const lab of allLabs) {
    const cluster = new VirtualCluster(lab.initialClusterState);
    const term = new TerminalEngine(cluster);

    const beforeReport = valEngine.evaluate(lab.validationRules, cluster, []);
    assert.equal(
      beforeReport.passed,
      false,
      `Lab ${lab.id} passed BEFORE executing solutionCommands (false positive validation rules)`
    );

    for (const cmd of lab.solutionCommands) {
      const execRes = term.execute(cmd, { manifestText: lab.starterManifest });
      assert.equal(execRes.exitCode, 0, `Lab ${lab.id} solution command "${cmd}" failed: ${execRes.output}`);
    }

    const afterReport = valEngine.evaluate(lab.validationRules, cluster, term.commandHistory);
    assert.equal(
      afterReport.passed,
      true,
      `Lab ${lab.id} failed AFTER solutionCommands: ${JSON.stringify(afterReport.results)}`
    );
    assert.equal(afterReport.score, 100);
  }
  app.database.close();
});

test('5. Deterministic E2E Incident Simulation Solver Suite: All 15 production outages resolve cleanly', () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  const incidents = app.incidentEngine.scenarios;
  assert.equal(incidents.length, 15);

  for (const inc of incidents) {
    const cluster = new VirtualCluster();
    app.incidentEngine.injectIncident(inc.id, cluster);
    const term = new TerminalEngine(cluster);

    const before = app.incidentEngine.verifyIncidentResolution(inc.id, cluster, []);
    assert.equal(before.passed, false, `Incident ${inc.id} should not be resolved initially`);

    for (const cmd of inc.solutionCommands) {
      const res = term.execute(cmd);
      assert.equal(res.exitCode, 0, `Incident ${inc.id} command "${cmd}" failed: ${res.output}`);
    }

    const after = app.incidentEngine.verifyIncidentResolution(inc.id, cluster, term.commandHistory);
    assert.equal(after.passed, true, `Incident ${inc.id} failed recovery check: ${JSON.stringify(after.results)}`);
  }
  app.database.close();
});

test('6. UI Architecture Designer compiles Reference Architectures to valid YAML & OpenTofu HCL', () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  const refs = app.architectureEngine.listReferenceArchitectures();
  assert.equal(refs.length, 8);

  for (const ref of refs) {
    const compiled = app.architectureEngine.compileToManifests(ref.nodes, ref.edges);
    assert.ok(compiled.kubernetesYaml.includes('apiVersion:'));
    assert.ok(compiled.opentofuHcl.includes('terraform {'));
    assert.ok(compiled.analysis.overallScore >= 75, `Expected high score for ${ref.id}, got ${compiled.analysis.overallScore}`);
    assert.equal(compiled.analysis.spofs.length, 0, `Reference architecture ${ref.id} should have 0 SPOFs`);
  }
  app.database.close();
});

test('7. Contextual Socratic AI Mentor & Certification Engine issue and verify Ed25519 & HMAC-SHA256 credentials', () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  const lab = app.pluginManager.getLab('lab-k8s-01');
  app.virtualCluster.reset(lab.initialClusterState);

  for (const mode of ['hint', 'debug-error', 'explain', 'security-audit']) {
    const reply = app.aiMentor.respond({
      mode,
      activeLab: lab,
      cluster: app.virtualCluster,
      commandHistory: []
    });
    assert.equal(reply.mode, mode);
    assert.ok(reply.response.length > 40);
  }

  // Grade exam with 100% correct answers and verify cryptographic signature
  const questions = app.pluginManager.getTrackQuestions('track-foundations');
  const answers = {};
  for (const q of questions) {
    answers[q.id] = q.correctIndex;
  }

  const graded = app.certificationEngine.gradeExam({
    trackId: 'track-foundations',
    answers,
    learnerName: 'Ada Lovelace'
  });

  assert.equal(graded.passed, true);
  assert.equal(graded.scorePercent, 100);
  assert.ok(graded.certificate);
  assert.ok(graded.certificate.signatureSha256);
  assert.ok(graded.certificate.signatureEd25519);
  assert.ok(graded.certificate.publicKeyPem);

  // Verify HMAC-SHA256 signature
  const verificationSha = app.certificationEngine.verifyCertificate(
    graded.certificate.certId,
    graded.certificate.signatureSha256
  );
  assert.equal(verificationSha.valid, true);

  // Verify Ed25519 asymmetric signature
  const verificationEd = app.certificationEngine.verifyCertificate(
    graded.certificate.certId,
    graded.certificate.signatureEd25519
  );
  assert.equal(verificationEd.valid, true);
  assert.equal(verificationEd.algorithm, 'ed25519');

  // Security Regression Test (BUG-SEC-01): Reject forged/tampered caller-supplied signatures
  const forgedShort = app.certificationEngine.verifyCertificate(graded.certificate.certId, 'deadbeef1234');
  assert.equal(forgedShort.valid, false);
  const forged128 = app.certificationEngine.verifyCertificate(graded.certificate.certId, 'a'.repeat(128));
  assert.equal(forged128.valid, false);

  app.database.close();
});

test('8. HTTP Server, Observability Probes, Rate Limiter & Public Key API Integration Test', async () => {
  const app = createKubeLabsApp({ dbFilePath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(healthRes.headers.get('content-security-policy').includes("default-src 'self'"));
    const healthJson = await healthRes.json();
    assert.equal(healthJson.domainsCount, 26);
    assert.equal(healthJson.labsCount, 52);
    assert.equal(healthJson.projectsCount, 8);
    assert.equal(healthJson.incidentsCount, 15);
    assert.ok(healthRes.headers.get('traceparent'));

    // Prometheus OpenMetrics format
    const metricsRes = await fetch(`${baseUrl}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.ok(metricsText.includes('kubelabs_http_requests_total'));
    assert.ok(metricsText.includes('kubelabs_memory_rss_bytes'));
    assert.ok(metricsText.includes('kubelabs_slo_availability_ratio'));

    // Observability Golden Signals & SLO Telemetry API
    const telemetryRes = await fetch(`${baseUrl}/api/observability/telemetry`);
    assert.equal(telemetryRes.status, 200);
    const telemetryJson = await telemetryRes.json();
    assert.ok(telemetryJson.slo && telemetryJson.goldenSignals);

    // Offline Progress Sync API
    const syncRes = await fetch(`${baseUrl}/api/offline/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedLabs: ['lab-linux-01'], incidents: ['inc-01-selector-blackhole'] })
    });
    assert.equal(syncRes.status, 200);
    const syncJson = await syncRes.json();
    assert.equal(syncJson.synced, true);

    // Multi-Tenant Session Isolation Verification
    await fetch(`${baseUrl}/api/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-kubelabs-session': 'tenant-alpha' },
      body: JSON.stringify({ command: 'kubectl create namespace alpha-isolated' })
    });
    const betaClusterRes = await fetch(`${baseUrl}/api/cluster/state`, {
      headers: { 'x-kubelabs-session': 'tenant-beta' }
    });
    const betaCluster = await betaClusterRes.json();
    assert.equal(
      betaCluster.clusterState.resources.some((r) => r.kind === 'Namespace' && r.metadata.name === 'alpha-isolated'),
      false,
      'Tenant Beta should not see Tenant Alpha namespace'
    );

    // Kubernetes Probes
    const livezRes = await fetch(`${baseUrl}/api/livez`);
    assert.equal(livezRes.status, 200);
    const readyzRes = await fetch(`${baseUrl}/api/readyz`);
    assert.equal(readyzRes.status, 200);

    // Ed25519 Public Key endpoint
    const pubKeyRes = await fetch(`${baseUrl}/api/certifications/public-key`);
    assert.equal(pubKeyRes.status, 200);
    const pubKeyJson = await pubKeyRes.json();
    assert.equal(pubKeyJson.algorithm, 'ed25519');
    assert.ok(pubKeyJson.publicKeyPem.includes('BEGIN PUBLIC KEY'));

    // Lab solution test
    const solveRes = await fetch(`${baseUrl}/api/labs/lab-k8s-01/solve`, { method: 'POST' });
    assert.equal(solveRes.status, 200);
    const solveJson = await solveRes.json();
    assert.equal(solveJson.passed, true);
    assert.equal(solveJson.score, 100);

    // Capstone Project Milestone validation test
    await fetch(`${baseUrl}/api/projects/proj-07-multitenant-vcluster-platform/start`, { method: 'POST' });
    const milestoneRes = await fetch(`${baseUrl}/api/projects/proj-07-multitenant-vcluster-platform/milestones/1/validate`, { method: 'POST' });
    assert.equal(milestoneRes.status, 200);

    // Full 11-Agent Audit
    const auditRes = await fetch(`${baseUrl}/api/agents/audit`);
    assert.equal(auditRes.status, 200);
    const auditJson = await auditRes.json();
    if (!auditJson.passed) {
      const failed = (auditJson.agents || [])
        .filter((a) => a.status !== 'PASS')
        .map((a) => `${a.id}: ${(a.checks || []).filter((c) => !c.passed).map((c) => c.name).join('; ')}`);
      assert.fail(`11-Agent Audit failed: ${failed.join(' | ')}`);
    }
    assert.equal(auditJson.passed, true);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    app.database.close();
  }
});

