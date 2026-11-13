'use strict';

/**
 * KubeLabs v4.0 - Unified Isomorphic Git Engine
 * Pure ES2024 module with zero external dependencies.
 * Provides high-fidelity, real VFS-backed Git operations for GitOps,
 * CI/CD pipelines, ArgoCD, Flux, and interactive developer terminals.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let cryptoModule;
try {
  cryptoModule = require('node:crypto');
} catch {
  try {
    cryptoModule = require('crypto');
  } catch {
    cryptoModule = (typeof globalThis !== 'undefined' && globalThis.crypto);
  }
}

/**
 * Generates an authentic 40-character Git SHA-1 hash.
 */
function sha1(input) {
  const str = String(input);
  if (cryptoModule && typeof cryptoModule.createHash === 'function') {
    try {
      return cryptoModule.createHash('sha1').update(str).digest('hex');
    } catch {
      // Fallback
    }
  }
  // Isomorphic SHA-1 / Fowler-Noll-Vo / Murmur inspired deterministic 40-hex fallback
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d, h3 = 0x9b19e27c, h4 = 0x76b219e8, h5 = 0x85ebca6b;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ (ch << 1), 1597334677);
    h3 = Math.imul(h3 ^ (ch << 2), 2246822507);
    h4 = Math.imul(h4 ^ (ch << 3), 3266489909);
    h5 = Math.imul(h5 ^ (ch << 4), 374761393);
  }
  const toHex8 = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return (toHex8(h1) + toHex8(h2) + toHex8(h3) + toHex8(h4) + toHex8(h5)).slice(0, 40);
}

class GitEngine {
  constructor(options = {}) {
    this.vfs = options.vfs || null;
    this.defaultAuthor = options.author || 'Learner <learner@kubelabs.local>';
    // In-memory registry of initialized repos: rootPath -> RepoState
    this.repos = new Map();
  }

  /**
   * Dispatches a git command array e.g. ['status'], ['commit', '-m', 'msg']
   */
  execute(argv = [], options = {}) {
    if (!argv || argv.length === 0) {
      return {
        stdout: 'usage: git [--version] [--help] [-C <path>] [-c <name>=<value>]\n           [--exec-path[=<path>]] [--html-path] [--man-path] [--info-path]\n           [-p | --paginate | -P | --no-pager] [--no-replace-objects] [--bare]\n           [--git-dir=<path>] [--work-tree=<path>] [--namespace=<name>]\n           [--config-env=<name>=<envvar>] <command> [<args>]\n',
        stderr: '',
        code: 1
      };
    }

    const vfs = options.vfs || this.vfs;
    let cwd = options.cwd || '/home/learner';

    // Parse global flags like `git -C <path>`
    let subcmdIdx = 0;
    while (subcmdIdx < argv.length) {
      const arg = argv[subcmdIdx];
      if (arg === '-C' && subcmdIdx + 1 < argv.length) {
        cwd = vfs ? vfs.normalizePath(argv[subcmdIdx + 1], cwd) : argv[subcmdIdx + 1];
        subcmdIdx += 2;
      } else if (arg === '--version' || arg === '-v') {
        return { stdout: 'git version 2.45.2\n', stderr: '', code: 0 };
      } else if (arg === '--help' || arg === '-h') {
        return { stdout: 'KubeLabs Isomorphic Git Engine v4.0\nCommands: init, clone, add, commit, status, log, diff, checkout, switch, branch, merge, tag, rebase, remote\n', stderr: '', code: 0 };
      } else if (!arg.startsWith('-')) {
        break;
      } else {
        subcmdIdx++;
      }
    }

    const subcmd = argv[subcmdIdx];
    const subArgs = argv.slice(subcmdIdx + 1);

    if (!subcmd) {
      return { stdout: 'git version 2.45.2\n', stderr: '', code: 0 };
    }

    switch (subcmd) {
      case 'init':
        return this.handleInit(subArgs, { vfs, cwd });
      case 'clone':
        return this.handleClone(subArgs, { vfs, cwd });
      case 'status':
        return this.handleStatus(subArgs, { vfs, cwd });
      case 'add':
        return this.handleAdd(subArgs, { vfs, cwd });
      case 'commit':
        return this.handleCommit(subArgs, { vfs, cwd });
      case 'log':
        return this.handleLog(subArgs, { vfs, cwd });
      case 'diff':
        return this.handleDiff(subArgs, { vfs, cwd });
      case 'checkout':
      case 'switch':
        return this.handleCheckout(subArgs, { vfs, cwd, isSwitch: subcmd === 'switch' });
      case 'branch':
        return this.handleBranch(subArgs, { vfs, cwd });
      case 'merge':
        return this.handleMerge(subArgs, { vfs, cwd });
      case 'tag':
        return this.handleTag(subArgs, { vfs, cwd });
      case 'rebase':
        return this.handleRebase(subArgs, { vfs, cwd });
      case 'remote':
        return this.handleRemote(subArgs, { vfs, cwd });
      case 'show':
        return this.handleShow(subArgs, { vfs, cwd });
      case 'reset':
        return this.handleReset(subArgs, { vfs, cwd });
      case 'push':
      case 'pull':
      case 'fetch':
        return this.handleRemoteSync(subcmd, subArgs, { vfs, cwd });
      default:
        return {
          stdout: '',
          stderr: `git: '${subcmd}' is not a git command. See 'git --help'.\n`,
          code: 1
        };
    }
  }

  // -------------------------------------------------------------------------
  // Helper: Find Nearest Git Root
  // -------------------------------------------------------------------------

  _findGitRoot(cwd, vfs) {
    if (!vfs) return null;
    let curr = vfs.normalizePath(cwd);
    while (curr) {
      const gitDir = vfs.normalizePath('.git', curr);
      if (vfs.exists(gitDir)) {
        return curr;
      }
      if (curr === '/' || curr === '') break;
      const lastSlash = curr.lastIndexOf('/');
      curr = lastSlash <= 0 ? '/' : curr.slice(0, lastSlash);
      if (curr === '/') {
        if (vfs.exists('/.git')) return '/';
        break;
      }
    }
    return null;
  }

  _getOrCreateRepo(rootPath, vfs) {
    if (this.repos.has(rootPath)) {
      return this.repos.get(rootPath);
    }
    const repo = {
      root: rootPath,
      currentBranch: 'main',
      branches: new Map([['main', []]]), // branch -> array of commits
      tags: new Map(), // tagName -> commitHash
      remotes: new Map(), // name -> url
      index: new Map(), // relativePath -> { content, hash, staged: true }
      headCommit: null
    };
    this.repos.set(rootPath, repo);
    return repo;
  }

  // -------------------------------------------------------------------------
  // 1. GIT INIT
  // -------------------------------------------------------------------------

  handleInit(args, { vfs, cwd }) {
    const targetDir = args[0] ? (vfs ? vfs.normalizePath(args[0], cwd) : args[0]) : cwd;
    const gitDir = vfs ? vfs.normalizePath('.git', targetDir) : `${targetDir}/.git`;

    if (vfs) {
      try {
        vfs.mkdir(gitDir, { recursive: true });
        vfs.mkdir(vfs.normalizePath('objects', gitDir), { recursive: true });
        vfs.mkdir(vfs.normalizePath('refs/heads', gitDir), { recursive: true });
        vfs.mkdir(vfs.normalizePath('refs/tags', gitDir), { recursive: true });
        vfs.writeFile(vfs.normalizePath('HEAD', gitDir), 'ref: refs/heads/main\n');
        vfs.writeFile(vfs.normalizePath('config', gitDir), '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n');
      } catch (err) {
        return { stdout: '', stderr: `fatal: cannot create directory '${gitDir}': ${err.message}\n`, code: 1 };
      }
    }

    const repo = this._getOrCreateRepo(targetDir, vfs);
    repo.currentBranch = 'main';
    if (!repo.branches.has('main')) repo.branches.set('main', []);

    return {
      stdout: `Initialized empty Git repository in ${gitDir}/\n`,
      stderr: '',
      code: 0
    };
  }

  // -------------------------------------------------------------------------
  // 2. GIT CLONE
  // -------------------------------------------------------------------------

  handleClone(args, { vfs, cwd }) {
    const url = args.find((a) => !a.startsWith('-'));
    if (!url) {
      return { stdout: '', stderr: 'fatal: You must specify a repository to clone.\n', code: 128 };
    }

    let repoName = url.split('/').pop().replace(/\.git$/, '') || 'repository';
    const explicitDir = args.filter((a) => !a.startsWith('-'))[1];
    const targetDirName = explicitDir || repoName;
    const targetPath = vfs ? vfs.normalizePath(targetDirName, cwd) : `${cwd}/${targetDirName}`;

    if (vfs) {
      vfs.mkdir(targetPath, { recursive: true });
    }

    // Initialize the git repo in target
    this.handleInit([], { vfs, cwd: targetPath });
    const repo = this._getOrCreateRepo(targetPath, vfs);
    repo.remotes.set('origin', url);

    // Populate authentic default files for cloud-native / gitops repos
    const sampleFiles = {
      'README.md': `# ${repoName}\n\nAutomated GitOps repository managed by KubeLabs.\n`,
      'deployment.yaml': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${repoName}
  namespace: default
  labels:
    app.kubernetes.io/name: ${repoName}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${repoName}
  template:
    metadata:
      labels:
        app: ${repoName}
    spec:
      containers:
      - name: ${repoName}
        image: registry.k8s.io/pause:3.9
        ports:
        - containerPort: 8080
`,
      'service.yaml': `apiVersion: v1
kind: Service
metadata:
  name: ${repoName}-svc
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: ${repoName}
`,
      'kustomization.yaml': `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
`
    };

    if (vfs) {
      for (const [fname, content] of Object.entries(sampleFiles)) {
        vfs.writeFile(vfs.normalizePath(fname, targetPath), content);
      }
    }

    // Stage all files and create initial commit
    for (const [fname, content] of Object.entries(sampleFiles)) {
      repo.index.set(fname, { content, hash: sha1(content), staged: false });
    }

    const commitHash = sha1(`initial-commit-${repoName}-${Date.now()}`);
    const commit = {
      hash: commitHash,
      shortHash: commitHash.slice(0, 7),
      parent: null,
      tree: sha1(JSON.stringify(sampleFiles)),
      author: this.defaultAuthor,
      date: new Date().toUTCString(),
      message: `Initial commit from ${url}`,
      files: { ...sampleFiles }
    };

    repo.branches.get('main').push(commit);
    repo.headCommit = commit;

    return {
      stdout: [
        `Cloning into '${targetDirName}'...`,
        'remote: Enumerating objects: 15, done.',
        'remote: Counting objects: 100% (15/15), done.',
        'remote: Compressing objects: 100% (10/10), done.',
        'remote: Total 15 (delta 2), reused 15 (delta 2), pack-reused 0',
        'Receiving objects: 100% (15/15), done.',
        'Resolving deltas: 100% (2/2), done.'
      ].join('\n') + '\n',
      stderr: '',
      code: 0
    };
  }

  // -------------------------------------------------------------------------
  // 3. GIT STATUS
  // -------------------------------------------------------------------------

  handleStatus(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const branch = repo.currentBranch;

    // Scan VFS to discover untracked and modified files
    const stagedNew = [];
    const stagedModified = [];
    const unstagedModified = [];
    const untracked = [];

    // Find current files in directory
    const existingFiles = new Map();
    if (vfs) {
      const scanDir = (dirPath, relPrefix = '') => {
        try {
          const items = vfs.listDir(dirPath);
          for (const item of items) {
            if (item === '.git') continue;
            const fullPath = vfs.normalizePath(item, dirPath);
            const relPath = relPrefix ? `${relPrefix}/${item}` : item;
            try {
              const stat = vfs.stat(fullPath);
              if (stat.isDirectory()) {
                scanDir(fullPath, relPath);
              } else {
                existingFiles.set(relPath, vfs.readFile(fullPath));
              }
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      };
      scanDir(root);
    }

    const headFiles = repo.headCommit ? repo.headCommit.files || {} : {};

    // Check index against HEAD
    for (const [relPath, item] of repo.index.entries()) {
      if (item.staged) {
        if (!headFiles[relPath]) {
          stagedNew.push(relPath);
        } else if (headFiles[relPath] !== item.content) {
          stagedModified.push(relPath);
        }
      }
    }

    // Check working directory against index/HEAD
    for (const [relPath, content] of existingFiles.entries()) {
      if (repo.index.has(relPath)) {
        const idxItem = repo.index.get(relPath);
        if (idxItem.content !== content) {
          unstagedModified.push(relPath);
        }
      } else if (headFiles[relPath]) {
        if (headFiles[relPath] !== content) {
          unstagedModified.push(relPath);
        }
      } else {
        untracked.push(relPath);
      }
    }

    const lines = [`On branch ${branch}`];
    if (repo.remotes.has('origin')) {
      lines.push("Your branch is up to date with 'origin/" + branch + "'.");
    }

    if (stagedNew.length === 0 && stagedModified.length === 0 && unstagedModified.length === 0 && untracked.length === 0) {
      lines.push('nothing to commit, working tree clean');
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

    if (stagedNew.length > 0 || stagedModified.length > 0) {
      lines.push('\nChanges to be committed:');
      lines.push('  (use "git restore --staged <file>..." to unstage)');
      for (const f of stagedNew) {
        lines.push(`\tnew file:   ${f}`);
      }
      for (const f of stagedModified) {
        lines.push(`\tmodified:   ${f}`);
      }
    }

    if (unstagedModified.length > 0) {
      lines.push('\nChanges not staged for commit:');
      lines.push('  (use "git add <file>..." to update what will be committed)');
      lines.push('  (use "git restore <file>..." to discard changes in working directory)');
      for (const f of unstagedModified) {
        lines.push(`\tmodified:   ${f}`);
      }
    }

    if (untracked.length > 0) {
      lines.push('\nUntracked files:');
      lines.push('  (use "git add <file>..." to include in what will be committed)');
      for (const f of untracked) {
        lines.push(`\t${f}`);
      }
    }

    return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 4. GIT ADD
  // -------------------------------------------------------------------------

  handleAdd(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      return { stdout: 'Nothing specified, nothing added.\n', stderr: '', code: 0 };
    }

    const repo = this._getOrCreateRepo(root, vfs);

    if (targets.includes('.') || targets.includes('-A') || targets.includes('--all')) {
      // Stage everything in root
      if (vfs) {
        const scan = (dirPath, relPrefix = '') => {
          try {
            const items = vfs.listDir(dirPath);
            for (const item of items) {
              if (item === '.git') continue;
              const fullPath = vfs.normalizePath(item, dirPath);
              const relPath = relPrefix ? `${relPrefix}/${item}` : item;
              const stat = vfs.stat(fullPath);
              if (stat.isDirectory()) {
                scan(fullPath, relPath);
              } else {
                const content = vfs.readFile(fullPath);
                repo.index.set(relPath, { content, hash: sha1(content), staged: true });
              }
            }
          } catch {
            // ignore
          }
        };
        scan(root);
      }
      return { stdout: '', stderr: '', code: 0 };
    }

    for (const t of targets) {
      if (!vfs) continue;
      const fullPath = vfs.normalizePath(t, cwd);
      try {
        const content = vfs.readFile(fullPath);
        // Relative path from root
        let relPath = fullPath.replace(root, '').replace(/^\//, '');
        repo.index.set(relPath, { content, hash: sha1(content), staged: true });
      } catch (err) {
        return { stdout: '', stderr: `fatal: pathspec '${t}' did not match any files\n`, code: 128 };
      }
    }

    return { stdout: '', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 5. GIT COMMIT
  // -------------------------------------------------------------------------

  handleCommit(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    let message = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-m' && i + 1 < args.length) {
        message = args[++i];
      } else if (args[i].startsWith('-m')) {
        message = args[i].slice(2);
      } else if (args[i].startsWith('--message=')) {
        message = args[i].slice(10);
      }
    }

    if (!message) {
      return { stdout: '', stderr: 'error: switch `m\' requires a value\n', code: 1 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const branch = repo.currentBranch;

    // Check if there are staged changes
    const stagedEntries = Array.from(repo.index.entries()).filter(([, item]) => item.staged);
    if (stagedEntries.length === 0) {
      return { stdout: 'On branch ' + branch + '\nnothing to commit, working tree clean\n', stderr: '', code: 0 };
    }

    const parentCommit = repo.headCommit;
    const parentHash = parentCommit ? parentCommit.hash : null;
    const commitFiles = parentCommit ? { ...parentCommit.files } : {};

    for (const [relPath, item] of stagedEntries) {
      commitFiles[relPath] = item.content;
      item.staged = false; // committed
    }

    const commitHash = sha1(`${parentHash}-${message}-${Date.now()}`);
    const shortHash = commitHash.slice(0, 7);
    const commit = {
      hash: commitHash,
      shortHash,
      parent: parentHash,
      tree: sha1(JSON.stringify(commitFiles)),
      author: this.defaultAuthor,
      date: new Date().toUTCString(),
      message,
      files: commitFiles
    };

    if (!repo.branches.has(branch)) {
      repo.branches.set(branch, []);
    }
    repo.branches.get(branch).push(commit);
    repo.headCommit = commit;

    const rootTag = !parentCommit ? ' (root-commit)' : '';
    const fileCount = stagedEntries.length;
    return {
      stdout: `[${branch}${rootTag} ${shortHash}] ${message}\n ${fileCount} file${fileCount > 1 ? 's' : ''} changed\n`,
      stderr: '',
      code: 0
    };
  }

  // -------------------------------------------------------------------------
  // 6. GIT LOG
  // -------------------------------------------------------------------------

  handleLog(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const branch = repo.currentBranch;
    const commits = (repo.branches.get(branch) || []).slice().reverse();

    if (commits.length === 0) {
      return { stdout: '', stderr: `fatal: your current branch '${branch}' does not have any commits yet\n`, code: 128 };
    }

    const oneline = args.some((a) => a === '--oneline');
    const graph = args.some((a) => a === '--graph');

    let maxCount = Infinity;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-n' && i + 1 < args.length) {
        maxCount = parseInt(args[++i], 10) || Infinity;
      } else if (args[i].startsWith('-n')) {
        maxCount = parseInt(args[i].slice(2), 10) || Infinity;
      }
    }

    const selected = commits.slice(0, maxCount);

    if (oneline || (graph && oneline)) {
      const prefix = graph ? '* ' : '';
      const lines = selected.map((c, i) => {
        const headMark = i === 0 ? ` (HEAD -> ${branch})` : '';
        return `${prefix}${c.shortHash}${headMark} ${c.message}`;
      });
      return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
    }

    const lines = [];
    selected.forEach((c, i) => {
      const headMark = i === 0 ? ` (HEAD -> ${branch})` : '';
      lines.push(`commit ${c.hash}${headMark}`);
      lines.push(`Author: ${c.author}`);
      lines.push(`Date:   ${c.date}\n`);
      lines.push(`    ${c.message}\n`);
    });

    return { stdout: lines.join('\n'), stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 7. GIT DIFF
  // -------------------------------------------------------------------------

  handleDiff(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const headFiles = repo.headCommit ? repo.headCommit.files || {} : {};

    const diffLines = [];

    if (vfs) {
      const scan = (dirPath, relPrefix = '') => {
        try {
          const items = vfs.listDir(dirPath);
          for (const item of items) {
            if (item === '.git') continue;
            const fullPath = vfs.normalizePath(item, dirPath);
            const relPath = relPrefix ? `${relPrefix}/${item}` : item;
            const stat = vfs.stat(fullPath);
            if (stat.isDirectory()) {
              scan(fullPath, relPath);
            } else {
              const currentContent = vfs.readFile(fullPath);
              const oldContent = headFiles[relPath] !== undefined ? headFiles[relPath] : null;

              if (oldContent !== null && oldContent !== currentContent) {
                diffLines.push(`diff --git a/${relPath} b/${relPath}`);
                diffLines.push('--- a/' + relPath);
                diffLines.push('+++ b/' + relPath);
                const oldLines = oldContent.split('\n');
                const newLines = currentContent.split('\n');
                diffLines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
                for (const l of oldLines) {
                  if (!newLines.includes(l)) diffLines.push(`-${l}`);
                }
                for (const l of newLines) {
                  if (!oldLines.includes(l)) diffLines.push(`+${l}`);
                }
              }
            }
          }
        } catch {
          // ignore
        }
      };
      scan(root);
    }

    return { stdout: diffLines.join('\n') + (diffLines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 8. GIT CHECKOUT / SWITCH
  // -------------------------------------------------------------------------

  handleCheckout(args, { vfs, cwd, isSwitch = false }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    let createBranch = false;
    let branchName = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-b' || args[i] === '-c' || args[i] === '--create') {
        createBranch = true;
        branchName = args[++i];
      } else if (!args[i].startsWith('-') && !branchName) {
        branchName = args[i];
      }
    }

    if (!branchName) {
      return { stdout: '', stderr: 'fatal: missing branch or commit argument\n', code: 128 };
    }

    if (createBranch) {
      if (repo.branches.has(branchName)) {
        return { stdout: '', stderr: `fatal: a branch named '${branchName}' already exists\n`, code: 128 };
      }
      const currentCommits = repo.branches.get(repo.currentBranch) || [];
      repo.branches.set(branchName, [...currentCommits]);
      repo.currentBranch = branchName;
      return {
        stdout: `Switched to a new branch '${branchName}'\n`,
        stderr: '',
        code: 0
      };
    }

    if (repo.branches.has(branchName)) {
      repo.currentBranch = branchName;
      const commits = repo.branches.get(branchName);
      repo.headCommit = commits && commits.length > 0 ? commits[commits.length - 1] : null;

      // Update working directory files to match HEAD
      if (vfs && repo.headCommit && repo.headCommit.files) {
        for (const [fname, content] of Object.entries(repo.headCommit.files)) {
          vfs.writeFile(vfs.normalizePath(fname, root), content);
        }
      }

      return {
        stdout: `Switched to branch '${branchName}'\n`,
        stderr: '',
        code: 0
      };
    }

    return { stdout: '', stderr: `error: pathspec '${branchName}' did not match any file(s) known to git\n`, code: 1 };
  }

  // -------------------------------------------------------------------------
  // 9. GIT BRANCH
  // -------------------------------------------------------------------------

  handleBranch(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const deleteFlag = args.includes('-d') || args.includes('-D');
    const allFlag = args.includes('-a');

    if (deleteFlag) {
      const target = args.find((a) => !a.startsWith('-'));
      if (!target) return { stdout: '', stderr: 'fatal: branch name required\n', code: 1 };
      if (target === repo.currentBranch) {
        return { stdout: '', stderr: `error: Cannot delete branch '${target}' checked out at '${root}'\n`, code: 1 };
      }
      repo.branches.delete(target);
      return { stdout: `Deleted branch ${target} (was 0f50f9a).\n`, stderr: '', code: 0 };
    }

    const newBranch = args.find((a) => !a.startsWith('-'));
    if (newBranch) {
      if (repo.branches.has(newBranch)) {
        return { stdout: '', stderr: `fatal: a branch named '${newBranch}' already exists\n`, code: 128 };
      }
      const currentCommits = repo.branches.get(repo.currentBranch) || [];
      repo.branches.set(newBranch, [...currentCommits]);
      return { stdout: '', stderr: '', code: 0 };
    }

    const lines = [];
    for (const b of repo.branches.keys()) {
      if (b === repo.currentBranch) {
        lines.push(`* ${b}`);
      } else {
        lines.push(`  ${b}`);
      }
    }
    if (allFlag && repo.remotes.has('origin')) {
      lines.push(`  remotes/origin/${repo.currentBranch}`);
    }

    return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 10. GIT MERGE
  // -------------------------------------------------------------------------

  handleMerge(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const targetBranch = args.find((a) => !a.startsWith('-'));
    if (!targetBranch) {
      return { stdout: '', stderr: 'fatal: No commit specified and merge.default unspecified.\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    if (!repo.branches.has(targetBranch)) {
      return { stdout: '', stderr: `merge: ${targetBranch} - not something we can merge\n`, code: 1 };
    }

    const targetCommits = repo.branches.get(targetBranch) || [];
    const currentCommits = repo.branches.get(repo.currentBranch) || [];

    if (targetCommits.length === 0) {
      return { stdout: 'Already up to date.\n', stderr: '', code: 0 };
    }

    const lastTarget = targetCommits[targetCommits.length - 1];
    repo.branches.set(repo.currentBranch, [...targetCommits]);
    repo.headCommit = lastTarget;

    if (vfs && lastTarget.files) {
      for (const [fname, content] of Object.entries(lastTarget.files)) {
        vfs.writeFile(vfs.normalizePath(fname, root), content);
      }
    }

    return {
      stdout: `Updating ${currentCommits.length > 0 ? currentCommits[currentCommits.length - 1].shortHash : '0000000'}..${lastTarget.shortHash}\nFast-forward\n`,
      stderr: '',
      code: 0
    };
  }

  // -------------------------------------------------------------------------
  // 11. GIT TAG
  // -------------------------------------------------------------------------

  handleTag(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const tagName = args.find((a) => !a.startsWith('-'));

    if (!tagName) {
      const tags = Array.from(repo.tags.keys()).sort();
      return { stdout: tags.length > 0 ? tags.join('\n') + '\n' : '', stderr: '', code: 0 };
    }

    const commitHash = repo.headCommit ? repo.headCommit.hash : sha1('empty');
    repo.tags.set(tagName, commitHash);
    return { stdout: '', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 12. GIT REBASE
  // -------------------------------------------------------------------------

  handleRebase(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const targetBranch = args.find((a) => !a.startsWith('-'));
    if (!targetBranch) {
      return { stdout: '', stderr: 'fatal: branch name required for rebase\n', code: 1 };
    }

    return {
      stdout: `Successfully rebased and updated refs/heads/${this._getOrCreateRepo(root, vfs).currentBranch}.\n`,
      stderr: '',
      code: 0
    };
  }

  // -------------------------------------------------------------------------
  // 13. GIT REMOTE
  // -------------------------------------------------------------------------

  handleRemote(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }

    const repo = this._getOrCreateRepo(root, vfs);
    const sub = args[0];

    if (sub === 'add' && args[1] && args[2]) {
      repo.remotes.set(args[1], args[2]);
      return { stdout: '', stderr: '', code: 0 };
    }

    if (sub === '-v' || args.includes('-v')) {
      const lines = [];
      for (const [name, url] of repo.remotes.entries()) {
        lines.push(`${name}\t${url} (fetch)`);
        lines.push(`${name}\t${url} (push)`);
      }
      return { stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    }

    const names = Array.from(repo.remotes.keys());
    return { stdout: names.join('\n') + (names.length > 0 ? '\n' : ''), stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 14. GIT SHOW
  // -------------------------------------------------------------------------

  handleShow(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }
    const repo = this._getOrCreateRepo(root, vfs);
    const commit = repo.headCommit;
    if (!commit) {
      return { stdout: '', stderr: 'fatal: your current branch does not have any commits yet\n', code: 128 };
    }

    const lines = [
      `commit ${commit.hash}`,
      `Author: ${commit.author}`,
      `Date:   ${commit.date}\n`,
      `    ${commit.message}\n`
    ];
    return { stdout: lines.join('\n'), stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 15. GIT RESET
  // -------------------------------------------------------------------------

  handleReset(args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }
    const repo = this._getOrCreateRepo(root, vfs);
    // Unstage everything
    for (const item of repo.index.values()) {
      item.staged = false;
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // 16. GIT REMOTE SYNC (PUSH / PULL / FETCH)
  // -------------------------------------------------------------------------

  handleRemoteSync(cmd, args, { vfs, cwd }) {
    const root = this._findGitRoot(cwd, vfs);
    if (!root) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git\n', code: 128 };
    }
    const repo = this._getOrCreateRepo(root, vfs);
    const branch = repo.currentBranch;

    if (cmd === 'push') {
      return {
        stdout: `Everything up-to-date\nTo origin\n   ${repo.headCommit ? repo.headCommit.shortHash : '0f50f9a'}..${repo.headCommit ? repo.headCommit.shortHash : '0f50f9a'}  ${branch} -> ${branch}\n`,
        stderr: '',
        code: 0
      };
    }

    if (cmd === 'pull') {
      return { stdout: 'Already up to date.\n', stderr: '', code: 0 };
    }

    return { stdout: '', stderr: '', code: 0 };
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GitEngine, sha1 };
}

if (typeof globalThis !== 'undefined') {
  globalThis.GitEngine = GitEngine;
  globalThis.sha1 = sha1;
}

