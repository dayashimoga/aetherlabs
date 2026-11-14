/**
 * tests/stage3-networking-fundamentals.test.js
 * Subphase 3.1.2 Verification: Domain 03 (Networking Fundamentals)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Linux bridge devices (br0), veth pairs, network namespace isolation, default routing,
 * iptables NAT masquerading, CoreDNS dig +short resolution, and OpenSSL TLS diagnostics.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 3.1.2 — Domain 03 (Networking Fundamentals)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 03 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain = pluginManager.getDomain('networking-fundamentals');
    assert.ok(domain, 'Domain 03 (networking-fundamentals) must exist');
    assert.equal(domain.id, 'networking-fundamentals');
    assert.equal(domain.category, 'Foundations');
    assert.equal(domain.trackId, 'track-foundations');
    assert.deepEqual(domain.prerequisites, ['linux-fundamentals', 'linux-admin']);
    assert.ok(domain.learningObjectives.length >= 3);
    assert.ok(domain.curriculumModules.length >= 2);
    assert.equal(domain.labs.length, 2);
    assert.equal(domain.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both networking labs fail before solution commands (0% score)', () => {
    const netLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-net-'));
    assert.equal(netLabs.length, 2, 'Must have exactly 2 networking labs in Domain 03');

    for (const lab of netLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;

      const beforeReport = validationEngine.evaluate(lab.validationRules, cluster, [], { vfs, cluster });
      assert.equal(
        beforeReport.passed,
        false,
        `Lab ${lab.id} should NOT pass before executing solution commands`
      );
      assert.equal(beforeReport.score, 0, `Lab ${lab.id} pre-solution score must be 0%`);
    }
  });

  it('3. Deterministic Solver: Both networking labs achieve 100% score after canonical solution replay', () => {
    const netLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-net-'));

    for (const lab of netLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;
      const term = new TerminalEngine(cluster, vfs);

      // Replay all solution commands sequentially
      for (const cmd of lab.solutionCommands) {
        const res = term.execute(cmd, { manifestText: lab.starterManifest, vfs });
        assert.equal(
          res.exitCode,
          0,
          `Lab ${lab.id} solution command "${cmd}" failed with code ${res.exitCode}: ${res.output || res.stderr}`
        );
      }

      // Evaluate validation rules with live cluster context, VFS and command history
      const afterReport = validationEngine.evaluate(
        lab.validationRules,
        cluster,
        term.commandHistory,
        { vfs, cluster }
      );

      assert.equal(
        afterReport.passed,
        true,
        `Lab ${lab.id} failed after solutionCommands: ${JSON.stringify(afterReport.results)}`
      );
      assert.equal(afterReport.score, 100, `Lab ${lab.id} post-solution score must be 100%`);
    }
  });

  it('4. Linux Network Virtualization: Bridge, Veth Pairs, Netns Isolation & Routing Parity', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // 1. Create network namespace
    const nsRes = term.execute('ip netns add netns-isolated', { vfs });
    assert.equal(nsRes.exitCode, 0);

    const nsList = term.execute('ip netns list', { vfs });
    assert.ok(nsList.output.includes('netns-isolated'));

    // 2. Create bridge br0 and assign IP
    const brRes = term.execute('ip link add br0 type bridge', { vfs });
    assert.equal(brRes.exitCode, 0);

    const brIpRes = term.execute('ip addr add 10.200.1.1/24 dev br0', { vfs });
    assert.equal(brIpRes.exitCode, 0);

    const brUpRes = term.execute('ip link set br0 up', { vfs });
    assert.equal(brUpRes.exitCode, 0);

    // 3. Create veth pair
    const vethRes = term.execute('ip link add veth-host type veth peer name veth-ns', { vfs });
    assert.equal(vethRes.exitCode, 0);

    // 4. Enslave veth-host to bridge br0
    const masterRes = term.execute('ip link set veth-host master br0', { vfs });
    assert.equal(masterRes.exitCode, 0);

    const hostUpRes = term.execute('ip link set veth-host up', { vfs });
    assert.equal(hostUpRes.exitCode, 0);

    // 5. Move veth-ns into namespace
    const moveRes = term.execute('ip link set veth-ns netns netns-isolated', { vfs });
    assert.equal(moveRes.exitCode, 0);

    // Verify veth-ns is no longer in root namespace
    const rootLinks = term.execute('ip link show', { vfs });
    assert.ok(rootLinks.output.includes('br0'));
    assert.ok(rootLinks.output.includes('veth-host'));
    assert.ok(!rootLinks.output.includes('veth-ns'));

    // 6. Configure inside netns-isolated
    const loUp = term.execute('ip netns exec netns-isolated ip link set lo up', { vfs });
    assert.equal(loUp.exitCode, 0);

    const nsUp = term.execute('ip netns exec netns-isolated ip link set veth-ns up', { vfs });
    assert.equal(nsUp.exitCode, 0);

    const nsAddr = term.execute('ip netns exec netns-isolated ip addr add 10.200.1.10/24 dev veth-ns', { vfs });
    assert.equal(nsAddr.exitCode, 0);

    const nsRoute = term.execute('ip netns exec netns-isolated ip route add default via 10.200.1.1 dev veth-ns', { vfs });
    assert.equal(nsRoute.exitCode, 0);

    // Inspect addresses inside netns-isolated
    const nsAddrShow = term.execute('ip netns exec netns-isolated ip addr show', { vfs });
    assert.equal(nsAddrShow.exitCode, 0);
    assert.ok(nsAddrShow.output.includes('10.200.1.10/24'));

    // Inspect routes inside netns-isolated
    const nsRouteShow = term.execute('ip netns exec netns-isolated ip route show', { vfs });
    assert.equal(nsRouteShow.exitCode, 0);
    assert.ok(nsRouteShow.output.includes('default via 10.200.1.1 dev veth-ns'));
  });

  it('5. Iptables NAT Masquerade, CoreDNS & OpenSSL TLS Inspection Engine Parity', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster({
      resources: [
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'kubernetes', namespace: 'default' },
          spec: { clusterIP: '10.96.0.1', ports: [{ port: 443, targetPort: 6443, protocol: 'TCP' }] }
        }
      ]
    });
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // 1. Iptables NAT Masquerading
    const natRes = term.execute('iptables -t nat -A POSTROUTING -s 10.200.1.0/24 ! -o br0 -j MASQUERADE', { vfs });
    assert.equal(natRes.exitCode, 0);

    const fwdRes = term.execute('iptables -A FORWARD -i br0 ! -o br0 -j ACCEPT', { vfs });
    assert.equal(fwdRes.exitCode, 0);

    const listNat = term.execute('iptables -t nat -L POSTROUTING', { vfs });
    assert.equal(listNat.exitCode, 0);
    assert.ok(listNat.output.includes('MASQUERADE'));

    const listFwd = term.execute('iptables -L FORWARD', { vfs });
    assert.equal(listFwd.exitCode, 0);
    assert.ok(listFwd.output.includes('ACCEPT'));

    // 2. CoreDNS dig +short resolution
    const digShort = term.execute('dig +short kubernetes.default.svc.cluster.local', { vfs });
    assert.equal(digShort.exitCode, 0);
    assert.equal(digShort.output.trim(), '10.96.0.1');

    // 3. OpenSSL x509 cert inspection
    const certInspect = term.execute('openssl x509 -in /etc/kubernetes/pki/apiserver.crt -text -noout', { vfs });
    assert.equal(certInspect.exitCode, 0);
    assert.ok(certInspect.output.includes('Subject: CN = kube-apiserver'));
    assert.ok(certInspect.output.includes('DNS:kubernetes'));
    assert.ok(certInspect.output.includes('IP Address:10.96.0.1'));

    // 4. OpenSSL s_client TLS handshake simulation
    const sClient = term.execute('openssl s_client -connect 127.0.0.1:6443 -showcerts', { vfs });
    assert.equal(sClient.exitCode, 0);
    assert.ok(sClient.output.includes('CONNECTED(00000003)'));
    assert.ok(sClient.output.includes('Verification: OK'));
    assert.ok(sClient.output.includes('TLSv1.3'));
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domain = pluginManager.getDomain('networking-fundamentals');
    for (const q of domain.assessmentQuestions) {
      assert.ok(q.id);
      assert.ok(q.question);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation && q.explanation.length > 20);
    }
  });
});
