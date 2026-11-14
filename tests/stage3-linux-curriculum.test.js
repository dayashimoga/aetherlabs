/**
 * tests/stage3-linux-curriculum.test.js
 * Subphase 3.1.1 Verification: Domain 01 (Linux Fundamentals) & Domain 02 (Linux Admin)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * POSIX streaming pipelines, systemd lifecycle, cgroups v2, namespaces, sysctl, and LVM storage.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 3.1.1 — Domain 01 (Linux Fundamentals) & Domain 02 (Linux Admin)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 01 and Domain 02 pass validation with zero errors', () => {
    assert.equal(pluginManager.validationErrors.length, 0, `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`);
    const domains = pluginManager.getAllDomains();
    assert.ok(domains.length >= 2, 'Curriculum catalog must contain at least Domain 01 and Domain 02');

    const domain01 = pluginManager.getDomain('linux-fundamentals');
    assert.ok(domain01, 'Domain 01 (linux-fundamentals) must exist');
    assert.equal(domain01.id, 'linux-fundamentals');
    assert.equal(domain01.category, 'Foundations');
    assert.equal(domain01.trackId, 'track-foundations');
    assert.ok(domain01.learningObjectives.length >= 3);
    assert.ok(domain01.curriculumModules.length >= 2);
    assert.equal(domain01.labs.length, 2);
    assert.equal(domain01.assessmentQuestions.length, 2);

    const domain02 = pluginManager.getDomain('linux-admin');
    assert.ok(domain02, 'Domain 02 (linux-admin) must exist');
    assert.equal(domain02.id, 'linux-admin');
    assert.equal(domain02.category, 'Foundations');
    assert.equal(domain02.trackId, 'track-foundations');
    assert.deepEqual(domain02.prerequisites, ['linux-fundamentals']);
    assert.ok(domain02.learningObjectives.length >= 3);
    assert.ok(domain02.curriculumModules.length >= 2);
    assert.equal(domain02.labs.length, 2);
    assert.equal(domain02.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const allLabs = pluginManager.getAllLabs();
    assert.equal(allLabs.length, 4, 'Must have exactly 4 hands-on labs across Domains 01 and 02');

    for (const lab of allLabs) {
      const vfs = new VirtualFileSystem();
      const cluster = new VirtualCluster(lab.initialClusterState);
      cluster.vfs = vfs;

      const beforeReport = validationEngine.evaluate(lab.validationRules, cluster, [], { vfs, cluster });
      assert.equal(
        beforeReport.passed,
        false,
        `Lab ${lab.id} should NOT pass before executing solution commands (got passed=true)`
      );
      assert.equal(beforeReport.score, 0, `Lab ${lab.id} pre-solution score must be 0%`);
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const allLabs = pluginManager.getAllLabs();

    for (const lab of allLabs) {
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

      // Evaluate validation rules with live VFS and command history
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

  it('4. Linux Fundamentals: File Permissions & POSIX Streaming Pipelines Engine Parity', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // Test chmod and chown on admin.conf
    term.execute('chmod 600 /etc/kubernetes/admin.conf', { vfs });
    term.execute('chown root:root /etc/kubernetes/admin.conf', { vfs });
    const statNode = vfs.resolve('/etc/kubernetes/admin.conf').node;
    assert.equal(statNode.mode, 0o600, 'admin.conf mode must be 0600');
    assert.equal(statNode.uid, 0, 'admin.conf uid must be 0 (root)');
    assert.equal(statNode.gid, 0, 'admin.conf gid must be 0 (root)');

    // Test multi-stage streaming pipeline: grep | awk | sort | uniq -c > offenders.txt
    const pipelineCmd = 'grep " 500 " /var/log/nginx/access.log | awk \'{print $1}\' | sort | uniq -c > /home/learner/offenders.txt';
    const pipeRes = term.execute(pipelineCmd, { vfs });
    assert.equal(pipeRes.exitCode, 0, `Pipeline failed: ${pipeRes.output || pipeRes.stderr}`);
    assert.ok(vfs.exists('/home/learner/offenders.txt'), 'Output file /home/learner/offenders.txt must exist');
    const content = vfs.readFile('/home/learner/offenders.txt');
    assert.ok(content.includes('192.168.1.105'), 'Offenders file must contain offending IP 192.168.1.105');
  });

  it('5. Linux Admin & OS Internals: Systemd, Journalctl, Cgroups v2, Namespaces & LVM Parity', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // Test journalctl error priority filtering
    const jRes = term.execute('journalctl -u containerd -p err', { vfs });
    assert.equal(jRes.exitCode, 0);
    assert.ok(jRes.output.includes('containerd'), 'journalctl must show containerd logs');
    assert.ok(jRes.output.includes('grpc: conn.reset'), 'journalctl -p err must show error level logs');

    // Test systemctl lifecycle
    const sysRestart = term.execute('systemctl restart containerd', { vfs });
    assert.equal(sysRestart.exitCode, 0);
    const sysStatus = term.execute('systemctl status kubelet', { vfs });
    assert.equal(sysStatus.exitCode, 0);
    assert.ok(sysStatus.output.includes('Active: active (running)'));

    // Test cgroups v2 write
    const cgroupCmd = 'echo "200000 100000" > /sys/fs/cgroup/system.slice/kubelet.service/cpu.max';
    const cgRes = term.execute(cgroupCmd, { vfs });
    assert.equal(cgRes.exitCode, 0);
    const cgContent = vfs.readFile('/sys/fs/cgroup/system.slice/kubelet.service/cpu.max');
    assert.ok(cgContent.includes('200000 100000'), 'Cgroups v2 cpu.max must be updated');

    // Test sysctl kernel tuning
    const sysctlRes = term.execute('sysctl -w net.ipv4.ip_forward=1', { vfs });
    assert.equal(sysctlRes.exitCode, 0);
    assert.ok(sysctlRes.output.includes('net.ipv4.ip_forward = 1'));

    // Test network namespaces
    const netnsRes = term.execute('ip netns add netns-worker', { vfs });
    assert.equal(netnsRes.exitCode, 0);
    const netnsList = term.execute('ip netns list', { vfs });
    assert.equal(netnsList.exitCode, 0);
    assert.ok(netnsList.output.includes('netns-worker'));

    // Test LVM volume management
    const pvRes = term.execute('pvcreate /dev/sdb1', { vfs });
    assert.equal(pvRes.exitCode, 0);
    assert.ok(pvRes.output.includes('Physical volume "/dev/sdb1" successfully created'));

    const pvsRes = term.execute('pvs', { vfs });
    assert.equal(pvsRes.exitCode, 0);
    assert.ok(pvsRes.output.includes('/dev/sdb1'));

    const vgRes = term.execute('vgcreate vg_k8s /dev/sdb1', { vfs });
    assert.equal(vgRes.exitCode, 0);
    assert.ok(vgRes.output.includes('Volume group "vg_k8s" successfully created'));

    const vgsRes = term.execute('vgs', { vfs });
    assert.equal(vgsRes.exitCode, 0);
    assert.ok(vgsRes.output.includes('vg_k8s'));

    const lvRes = term.execute('lvcreate -L 20G -n lv_containerd vg_k8s', { vfs });
    assert.equal(lvRes.exitCode, 0);
    assert.ok(lvRes.output.includes('Logical volume "lv_containerd" created'));

    const lvsRes = term.execute('lvs', { vfs });
    assert.equal(lvsRes.exitCode, 0);
    assert.ok(lvsRes.output.includes('lv_containerd'));
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domains = [pluginManager.getDomain('linux-fundamentals'), pluginManager.getDomain('linux-admin')];
    for (const d of domains) {
      for (const q of d.assessmentQuestions) {
        assert.ok(q.id, 'Question must have id');
        assert.ok(q.question.length > 10, 'Question must have meaningful prompt');
        assert.equal(q.options.length, 4, 'Must have exactly 4 multiple choice options');
        assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3, 'correctIndex must be between 0 and 3');
        assert.ok(q.explanation.length > 20, 'Explanation must be comprehensive');
      }
    }
  });
});
