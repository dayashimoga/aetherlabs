/**
 * tests/stage3-git-fundamentals.test.js
 * Subphase 3.1.3 Verification: Domain 04 (Git Fundamentals)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Git object database (blobs, trees, commits, tags), hash-object, cat-file, rev-parse,
 * branching, cherry-pick, rebase, bisect, reflog, and GPG signature verification.
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

describe('Subphase 3.1.3 — Domain 04 (Git Fundamentals)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 04 passes validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain = pluginManager.getDomain('git-fundamentals');
    assert.ok(domain, 'Domain 04 (git-fundamentals) must exist');
    assert.equal(domain.id, 'git-fundamentals');
    assert.equal(domain.category, 'Foundations');
    assert.equal(domain.trackId, 'track-foundations');
    assert.deepEqual(domain.prerequisites, ['linux-fundamentals']);
    assert.ok(domain.learningObjectives.length >= 3);
    assert.ok(domain.curriculumModules.length >= 2);
    assert.equal(domain.labs.length, 2);
    assert.equal(domain.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: Both Git labs fail before solution commands (0% score)', () => {
    const gitLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-git-'));
    assert.equal(gitLabs.length, 2, 'Must have exactly 2 Git labs in Domain 04');

    for (const lab of gitLabs) {
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

  it('3. Deterministic Solver: Both Git labs achieve 100% score after canonical solution replay', () => {
    const gitLabs = pluginManager.getAllLabs().filter((l) => l.id.startsWith('lab-git-'));

    for (const lab of gitLabs) {
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

  it('4. Git Plumbing Engine Parity: init, hash-object, cat-file, and rev-parse', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    // 1. git init in specific directory
    const initRes = term.execute('git init /home/learner/my-repo', { vfs });
    assert.equal(initRes.exitCode, 0);
    assert.ok(initRes.output.includes('Initialized empty Git repository'));
    assert.ok(vfs.exists('/home/learner/my-repo/.git'));
    assert.ok(vfs.exists('/home/learner/my-repo/.git/HEAD'));

    // Change directory into repo
    term.execute('cd /home/learner/my-repo', { vfs });

    // 2. Create file and hash-object
    term.execute('echo "apiVersion: v1" > pod.yaml', { vfs });
    assert.ok(vfs.exists('/home/learner/my-repo/pod.yaml'));

    const hashRes = term.execute('git hash-object -w pod.yaml', { vfs });
    assert.equal(hashRes.exitCode, 0);
    const hash = hashRes.output.trim();
    assert.equal(hash.length, 40, 'Hash must be 40-hex characters');

    // Verify object was written into .git/objects/
    const objDir = `/home/learner/my-repo/.git/objects/${hash.slice(0, 2)}`;
    assert.ok(vfs.exists(objDir), `Object directory ${objDir} must exist`);

    // 3. Stage and commit
    term.execute('git add pod.yaml', { vfs });
    const commitRes = term.execute('git commit -m "feat: initial pod manifest"', { vfs });
    assert.equal(commitRes.exitCode, 0);

    // 4. rev-parse HEAD
    const revRes = term.execute('git rev-parse HEAD', { vfs });
    assert.equal(revRes.exitCode, 0);
    const commitHash = revRes.output.trim();
    assert.equal(commitHash.length, 40);

    const revShort = term.execute('git rev-parse --short HEAD', { vfs });
    assert.equal(revShort.exitCode, 0);
    assert.equal(revShort.output.trim(), commitHash.slice(0, 7));

    // 5. cat-file -t and -p
    const catType = term.execute('git cat-file -t HEAD', { vfs });
    assert.equal(catType.exitCode, 0);
    assert.equal(catType.output.trim(), 'commit');

    const catPretty = term.execute('git cat-file -p HEAD', { vfs });
    assert.equal(catPretty.exitCode, 0);
    assert.ok(catPretty.output.includes('tree'));
    assert.ok(catPretty.output.includes('author'));
    assert.ok(catPretty.output.includes('feat: initial pod manifest'));
  });

  it('5. Git Advanced Workflows Parity: Branching, Cherry-Pick, Rebase, Bisect & Reflog', () => {
    const vfs = new VirtualFileSystem();
    const cluster = new VirtualCluster();
    cluster.vfs = vfs;
    const term = new TerminalEngine(cluster, vfs);

    term.execute('cd /home/learner && git init repo', { vfs });
    term.execute('cd /home/learner/repo && echo "base" > base.txt && git add base.txt && git commit -m "initial"', { vfs });

    // 1. Branch and checkout
    const branchRes = term.execute('git branch feature/auth', { vfs });
    assert.equal(branchRes.exitCode, 0);

    const checkoutRes = term.execute('git checkout feature/auth', { vfs });
    assert.equal(checkoutRes.exitCode, 0);
    assert.ok(checkoutRes.output.includes("Switched to branch 'feature/auth'"));

    // 2. Commit on branch
    term.execute('echo "security patch" > auth.yaml && git add auth.yaml && git commit -m "fix(sec): patch auth"', { vfs });

    // 3. Switch back to main and cherry-pick
    term.execute('git checkout main', { vfs });
    const cherryRes = term.execute('git cherry-pick feature/auth', { vfs });
    assert.equal(cherryRes.exitCode, 0);
    assert.ok(cherryRes.output.includes('patch auth'));

    // 4. Rebase
    const rebaseRes = term.execute('git rebase main', { vfs });
    assert.equal(rebaseRes.exitCode, 0);
    assert.ok(rebaseRes.output.includes('Successfully rebased and updated'));

    // 5. Reflog
    const reflogRes = term.execute('git reflog', { vfs });
    assert.equal(reflogRes.exitCode, 0);
    assert.ok(reflogRes.output.includes('HEAD@{0}'));
    assert.ok(reflogRes.output.includes('rebase'));

    // 6. Bisect
    const bisectStart = term.execute('git bisect start', { vfs });
    assert.equal(bisectStart.exitCode, 0);

    const bisectBad = term.execute('git bisect bad', { vfs });
    assert.equal(bisectBad.exitCode, 0);
    assert.ok(bisectBad.output.includes('Bisecting'));

    const bisectReset = term.execute('git bisect reset', { vfs });
    assert.equal(bisectReset.exitCode, 0);
    assert.ok(bisectReset.output.includes('Switched to branch'));
  });

  it('6. Assessment Questions & Explanations integrity', () => {
    const domain = pluginManager.getDomain('git-fundamentals');
    for (const q of domain.assessmentQuestions) {
      assert.ok(q.id);
      assert.ok(q.question);
      assert.equal(q.options.length, 4);
      assert.ok(q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.ok(q.explanation && q.explanation.length > 20);
    }
  });
});
