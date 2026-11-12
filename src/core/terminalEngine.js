'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Sandboxed Multi-CLI AST Terminal Engine
 * Subphase 3.1.1: POSIX Shell AST & Cloud-Native CLI Suite
 * Features:
 *   1. Full AST pipeline parsing and execution (| && || ; > >> < 2> 2>&1)
 *   2. Environment variable expansion (export, env, $VAR, ${VAR:-default})
 *   3. Intelligent Autocomplete engine (commands, subcommands, flags, K8s kinds, namespaces, VFS paths)
 *   4. POSIX & Cloud-Native utilities:
 *      - File/Dir: ls, cd, pwd, mkdir, rm, cp, mv, touch, cat
 *      - Text/Stream: grep, awk, sed, head, tail, wc, sort, uniq, cut, tr, tee, base64, xargs, echo
 *      - Data: jq (pure ES2024 JSON processor with path extraction, slices, keys, lengths)
 *      - Network & DNS: curl, dig, nslookup, ping, ip, ss
 *      - Crypto: openssl (x509 cert inspect, expiry check, genrsa, req)
 *      - System & Diagnostics: ps, top, df, free, uname, whoami, id, systemctl, journalctl
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let shellParser;
try {
  shellParser = require('./shellParser');
} catch {
  shellParser = (typeof globalThis !== 'undefined' && globalThis.shellParser) || {};
}

let pipelineDriverModule;
try {
  pipelineDriverModule = require('./pipelineDriver');
} catch {
  pipelineDriverModule = (typeof globalThis !== 'undefined' && globalThis.pipelineDriverModule) || {};
}

let MultiCliDispatcher;
try {
  MultiCliDispatcher = require('./multiCliDispatcher').MultiCliDispatcher;
} catch {
  MultiCliDispatcher = (typeof globalThis !== 'undefined' && globalThis.MultiCliDispatcher);
}

let VirtualFileSystem;
try {
  VirtualFileSystem = require('./virtualFileSystem').VirtualFileSystem;
} catch {
  VirtualFileSystem = (typeof globalThis !== 'undefined' && globalThis.VirtualFileSystem);
}

let ResourceGraph;
try {
  ResourceGraph = require('./resourceGraph').ResourceGraph;
} catch {
  ResourceGraph = (typeof globalThis !== 'undefined' && globalThis.ResourceGraph);
}

const PipelineDriver = pipelineDriverModule.PipelineDriver || (typeof globalThis !== 'undefined' && globalThis.PipelineDriver);
const VirtualPTY = pipelineDriverModule.VirtualPTY || (typeof globalThis !== 'undefined' && globalThis.VirtualPTY);

// ---------------------------------------------------------------------------
// Universal Argument Unpacker (Supports both PipelineDriver object and direct call)
// ---------------------------------------------------------------------------

function unpackArgs(firstArg, ...rest) {
  if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg) && firstArg.argv) {
    return {
      args: (firstArg.argv || []).slice(1),
      stdin: firstArg.stdin || '',
      vfs: firstArg.vfs || null,
      cwd: firstArg.cwd || '/home/learner',
      env: firstArg.env || {},
      driver: firstArg.driver || null
    };
  }
  return {
    args: Array.isArray(firstArg) ? firstArg : [],
    stdin: rest[0] || '',
    vfs: rest[1] || null,
    cwd: rest[2] || '/home/learner',
    env: rest[3] || {},
    driver: rest[4] || null
  };
}

// ---------------------------------------------------------------------------
// Pure ES2024 JQ Utility Implementation (Zero Dependencies)
// ---------------------------------------------------------------------------

function evaluateJqPath(data, expr) {
  if (!expr || expr === '.') return data;

  let current = data;
  const path = expr.trim();

  // Special functions
  if (path === 'keys') {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return Object.keys(current);
    }
    if (Array.isArray(current)) {
      return current.map((_, i) => i);
    }
    return [];
  }

  if (path === 'length') {
    if (Array.isArray(current) || typeof current === 'string') return current.length;
    if (current && typeof current === 'object') return Object.keys(current).length;
    return 0;
  }

  // Handle pipeline within JQ expression (e.g. .items | length)
  if (path.includes('|')) {
    const segments = path.split('|').map((s) => s.trim());
    let res = current;
    for (const seg of segments) {
      res = evaluateJqPath(res, seg);
    }
    return res;
  }

  // Parse path segments: .items[], .metadata.name, .spec.containers[0].name
  const regex = /\.?([^.\[\]]+|\[\d*\])/g;
  let match;
  const tokens = [];

  while ((match = regex.exec(path)) !== null) {
    if (match[1]) tokens.push(match[1]);
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok === '[]') {
      if (!Array.isArray(current)) return null;
      const restExpr = tokens.slice(i + 1).join('.');
      if (!restExpr) return current;
      return current.map((item) => evaluateJqPath(item, restExpr)).filter((x) => x !== undefined);
    }

    if (tok.startsWith('[') && tok.endsWith(']')) {
      const idx = parseInt(tok.slice(1, -1), 10);
      if (!Array.isArray(current) || isNaN(idx)) return null;
      current = current[idx];
      continue;
    }

    if (current && typeof current === 'object') {
      current = current[tok];
    } else {
      return undefined;
    }
  }

  return current;
}

function jqTool(firstArg, ...rest) {
  const { args, stdin, vfs, cwd } = unpackArgs(firstArg, ...rest);

  let rawOutput = false;
  let compactOutput = false;
  let query = '.';
  const fileArgs = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-r' || a === '--raw-output') {
      rawOutput = true;
    } else if (a === '-c' || a === '--compact-output') {
      compactOutput = true;
    } else if (a === '-e' || a === '--exit-status') {
      // ignore
    } else if (a.startsWith('-')) {
      // flags
    } else if (query === '.') {
      query = a;
    } else {
      fileArgs.push(a);
    }
  }

  let inputRaw = stdin;
  if (fileArgs.length > 0 && vfs) {
    try {
      const resolved = vfs.normalizePath(fileArgs[0], cwd);
      inputRaw = vfs.readFile(resolved);
    } catch (err) {
      return { stdout: '', stderr: `jq: error reading ${fileArgs[0]}: ${err.message}\n`, code: 2 };
    }
  }

  if (!inputRaw || !String(inputRaw).trim()) {
    return { stdout: '', stderr: '', code: 0 };
  }

  let parsed;
  try {
    parsed = JSON.parse(inputRaw);
  } catch (err) {
    return { stdout: '', stderr: `jq: parse error: Invalid numeric or JSON literal\n`, code: 5 };
  }

  const result = evaluateJqPath(parsed, query);
  if (result === undefined) {
    return { stdout: 'null\n', stderr: '', code: 0 };
  }

  // If array produced by [] iteration or root array when raw output is requested
  if (Array.isArray(result) && (query.includes('[]') || rawOutput)) {
    const lines = result.map((item) => {
      if (typeof item === 'string' && rawOutput) return item;
      return compactOutput ? JSON.stringify(item) : JSON.stringify(item, null, 2);
    });
    return { stdout: lines.join('\n') + '\n', stderr: '', code: 0 };
  }

  if (typeof result === 'string' && rawOutput) {
    return { stdout: result + '\n', stderr: '', code: 0 };
  }

  const formatted = compactOutput ? JSON.stringify(result) : JSON.stringify(result, null, 2);
  return { stdout: formatted + '\n', stderr: '', code: 0 };
}

// ---------------------------------------------------------------------------
// OpenSSL Cryptographic Diagnostic Utility
// ---------------------------------------------------------------------------

function opensslTool(firstArg, ...rest) {
  const { args, vfs, cwd } = unpackArgs(firstArg, ...rest);
  const sub = args[0] || 'help';

  if (sub === 'version') {
    return { stdout: 'OpenSSL 3.2.1 30 Jan 2024 (Library: OpenSSL 3.2.1)\n', stderr: '', code: 0 };
  }

  if (sub === 'x509') {
    let inPath = null;
    let text = false;
    let noout = false;
    let checkend = null;
    let enddate = false;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '-in') inPath = args[++i];
      else if (args[i] === '-text') text = true;
      else if (args[i] === '-noout') noout = true;
      else if (args[i] === '-checkend') checkend = parseInt(args[++i], 10);
      else if (args[i] === '-enddate') enddate = true;
    }

    if (checkend !== null) {
      // Simulate valid cert: return code 0 if not expiring within checkend seconds
      return { stdout: `Certificate will not expire\n`, stderr: '', code: 0 };
    }

    if (enddate) {
      return { stdout: 'notAfter=Dec 31 23:59:59 2026 GMT\n', stderr: '', code: 0 };
    }

    const out = [
      'Certificate:',
      '    Data:',
      '        Version: 3 (0x2)',
      '        Serial Number: 45:67:89:ab:cd:ef:01:23:45',
      '        Signature Algorithm: sha256WithRSAEncryption',
      '        Issuer: CN = kubernetes-ca',
      '        Validity',
      '            Not Before: Jan  1 00:00:00 2026 GMT',
      '            Not After : Dec 31 23:59:59 2026 GMT',
      '        Subject: CN = kube-apiserver, O = system:masters',
      '        Subject Public Key Info:',
      '            Public Key Algorithm: rsaEncryption',
      '                Public-Key: (2048 bit)',
      '        X509v3 extensions:',
      '            X509v3 Subject Alternative Name:',
      '                DNS:kubernetes, DNS:kubernetes.default, DNS:kubernetes.default.svc, IP Address:10.96.0.1, IP Address:192.168.1.10'
    ];
    return { stdout: out.join('\n') + '\n', stderr: '', code: 0 };
  }

  if (sub === 'genrsa') {
    let outFile = null;
    let bits = 2048;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '-out') outFile = args[++i];
      else if (!isNaN(parseInt(args[i], 10))) bits = parseInt(args[i], 10);
    }
    const mockKey = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mockKeyGeneratedByKubeLabs${bits}bitKeyValidIsomorphic==\n-----END RSA PRIVATE KEY-----\n`;
    if (outFile && vfs) {
      try {
        vfs.writeFile(vfs.normalizePath(outFile, cwd), mockKey);
      } catch (err) {
        return { stdout: '', stderr: `openssl: ${err.message}\n`, code: 1 };
      }
    }
    return { stdout: `Generating RSA private key, ${bits} bit long modulus\n`, stderr: '', code: 0 };
  }

  if (sub === 'req') {
    return { stdout: 'Certificate Request generated successfully\n', stderr: '', code: 0 };
  }

  return { stdout: 'OpenSSL CLI (x509, genrsa, req, version)\n', stderr: '', code: 0 };
}

// ---------------------------------------------------------------------------
// Systemd Service Simulator (systemctl & journalctl)
// ---------------------------------------------------------------------------

const SYSTEMD_SERVICES = {
  kubelet: {
    status: 'active',
    substate: 'running',
    pid: 1245,
    description: 'kubelet: The Kubernetes Node Agent',
    logs: [
      'kubelet[1245]: I1112 10:00:00.123456 server.go:412] "Starting kubelet" version="v1.31.0"',
      'kubelet[1245]: I1112 10:00:01.234567 kubelet.go:345] "Watching directory for static pods" path="/etc/kubernetes/manifests"',
      'kubelet[1245]: I1112 10:00:02.345678 kubelet.go:567] "Fast image gc configured" threshold=85',
      'kubelet[1245]: I1112 10:00:03.456789 kubelet_node_status.go:78] "Successfully registered node control-plane-node"',
      'kubelet[1245]: I1112 10:00:04.567890 status_manager.go:90] "Syncing pod status with API server"'
    ]
  },
  containerd: {
    status: 'active',
    substate: 'running',
    pid: 890,
    description: 'containerd container runtime',
    logs: [
      'containerd[890]: time="2026-11-12T10:00:00Z" level=info msg="starting containerd" version=v1.7.15',
      'containerd[890]: time="2026-11-12T10:00:01Z" level=info msg="loading plugin" id=io.containerd.grpc.v1.cri',
      'containerd[890]: time="2026-11-12T10:00:02Z" level=info msg="serving CRI on /run/containerd/containerd.sock"'
    ]
  },
  etcd: {
    status: 'active',
    substate: 'running',
    pid: 940,
    description: 'etcd distributed key-value store',
    logs: [
      'etcd[940]: raft: member 8e9e05c52164694d became leader at term 2',
      'etcd[940]: ready to serve client requests on https://124.0.0.1:2379'
    ]
  }
};

function systemctlTool(firstArg, ...rest) {
  const { args } = unpackArgs(firstArg, ...rest);
  const action = args[0] || 'status';
  const unit = (args[1] || 'kubelet').replace(/\.service$/, '');
  const svc = SYSTEMD_SERVICES[unit];

  if (!svc) {
    return { stdout: '', stderr: `Unit ${unit}.service could not be found.\n`, code: 4 };
  }

  if (action === 'status') {
    const lines = [
      `● ${unit}.service - ${svc.description}`,
      `     Loaded: loaded (/usr/lib/systemd/system/${unit}.service; enabled; preset: enabled)`,
      `     Active: ${svc.status} (${svc.substate}) since Wed 2026-11-12 10:00:00 UTC; 6h ago`,
      `   Main PID: ${svc.pid} (${unit})`,
      `      Tasks: 34 (limit: 38334)`,
      `     Memory: 84.2M`,
      `        CPU: 45.210s`,
      `     CGroup: /system.slice/${unit}.service`,
      `             └─${svc.pid} /usr/bin/${unit}`
    ];
    return { stdout: lines.join('\n') + '\n', stderr: '', code: svc.status === 'active' ? 0 : 3 };
  }

  if (action === 'is-active') {
    return { stdout: `${svc.status}\n`, stderr: '', code: svc.status === 'active' ? 0 : 3 };
  }

  if (action === 'restart' || action === 'start') {
    svc.status = 'active';
    svc.substate = 'running';
    return { stdout: '', stderr: '', code: 0 };
  }

  if (action === 'stop') {
    svc.status = 'inactive';
    svc.substate = 'dead';
    return { stdout: '', stderr: '', code: 0 };
  }

  return { stdout: '', stderr: `Unknown systemctl command: ${action}\n`, code: 1 };
}

function journalctlTool(firstArg, ...rest) {
  const { args } = unpackArgs(firstArg, ...rest);
  let unit = 'kubelet';
  let numLines = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-u' || args[i] === '--unit') {
      unit = (args[++i] || 'kubelet').replace(/\.service$/, '');
    } else if (args[i] === '-n' || args[i] === '--lines') {
      numLines = parseInt(args[++i], 10) || 50;
    }
  }

  const svc = SYSTEMD_SERVICES[unit] || SYSTEMD_SERVICES.kubelet;
  const logs = svc.logs.slice(-numLines);
  return { stdout: logs.join('\n') + '\n', stderr: '', code: 0 };
}

// ---------------------------------------------------------------------------
// POSIX File Management Utility Handlers (ls, cd, pwd, mkdir, rm, cp, mv, touch)
// ---------------------------------------------------------------------------

function formatMode(mode, type) {
  const typeChar = type === 'dir' ? 'd' : (type === 'symlink' ? 'l' : '-');
  const rwx = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const u = rwx[(mode >> 6) & 7];
  const g = rwx[(mode >> 3) & 7];
  const o = rwx[mode & 7];
  return `${typeChar}${u}${g}${o}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

// ---------------------------------------------------------------------------
// 3. TERMINAL ENGINE CLASS
// ---------------------------------------------------------------------------

class TerminalEngine {
  constructor(options = {}) {
    // 1. Resource Graph & VFS Initialization
    this.graph = options.graph || (ResourceGraph ? new ResourceGraph() : null);
    this.vfs = options.vfs || (VirtualFileSystem ? new VirtualFileSystem() : null);

    // Backward compatibility for `cluster` option
    if (options.cluster) {
      this.cluster = options.cluster;
      if (!this.graph && this.cluster.graph) this.graph = this.cluster.graph;
      if (!this.vfs && this.cluster.vfs) this.vfs = this.cluster.vfs;
    }

    this.cwd = options.cwd || '/home/learner';
    this.env = {
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: '/home/learner',
      USER: 'learner',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      KUBECONFIG: '/home/learner/.kube/config',
      PWD: this.cwd,
      ...(options.env || {})
    };

    this.history = [...(options.history || [])];

    // 2. Multi-CLI Dispatcher
    this.multiCli = options.multiCliDispatcher || new MultiCliDispatcher({
      graph: this.graph,
      vfs: this.vfs
    });

    // 3. Pipeline Driver
    this.pipelineDriver = options.pipelineDriver || new PipelineDriver({
      vfs: this.vfs,
      cwd: this.cwd,
      env: this.env
    });

    // 4. Register Multi-CLI into PipelineDriver
    this.multiCli.registerTo(this.pipelineDriver);

    // 5. Register Extended POSIX, Data & System Tools
    this._registerExtendedBuiltins();
  }

  _registerExtendedBuiltins() {
    // jq JSON tool
    this.pipelineDriver.registerCommand('jq', (ctx) => jqTool(ctx));

    // openssl crypto tool
    this.pipelineDriver.registerCommand('openssl', (ctx) => opensslTool(ctx));

    // systemctl & journalctl
    this.pipelineDriver.registerCommand('systemctl', (ctx) => systemctlTool(ctx));
    this.pipelineDriver.registerCommand('journalctl', (ctx) => journalctlTool(ctx));

    // ls file lister
    this.pipelineDriver.registerCommand('ls', (ctx) => this._handleLs(ctx));

    // cd directory changer
    this.pipelineDriver.registerCommand('cd', (ctx) => this._handleCd(ctx));

    // mkdir directory creator
    this.pipelineDriver.registerCommand('mkdir', (ctx) => this._handleMkdir(ctx));

    // rm file/directory remover
    this.pipelineDriver.registerCommand('rm', (ctx) => this._handleRm(ctx));

    // cp copy
    this.pipelineDriver.registerCommand('cp', (ctx) => this._handleCp(ctx));

    // mv move/rename
    this.pipelineDriver.registerCommand('mv', (ctx) => this._handleMv(ctx));

    // touch file
    this.pipelineDriver.registerCommand('touch', (ctx) => this._handleTouch(ctx));

    // export variable
    this.pipelineDriver.registerCommand('export', (ctx) => this._handleExport(ctx));

    // unset variable
    this.pipelineDriver.registerCommand('unset', (ctx) => this._handleUnset(ctx));

    // history
    this.pipelineDriver.registerCommand('history', () => {
      const lines = this.history.map((cmd, idx) => `  ${String(idx + 1).padStart(4)}  ${cmd}`);
      return { stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    });

    // clear screen
    this.pipelineDriver.registerCommand('clear', () => ({
      stdout: '\x1b[2J\x1b[H',
      stderr: '',
      code: 0
    }));
  }

  // -------------------------------------------------------------------------
  // POSIX Handlers
  // -------------------------------------------------------------------------

  _handleLs(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    let showAll = false;
    let longFormat = false;
    let humanReadable = false;
    let onePerLine = false;
    let targetPath = null;

    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith('-') && a.length > 1) {
        if (a.includes('a')) showAll = true;
        if (a.includes('l')) longFormat = true;
        if (a.includes('h')) humanReadable = true;
        if (a.includes('1')) onePerLine = true;
      } else if (!targetPath) {
        targetPath = a;
      }
    }

    const resolved = this.vfs.normalizePath(targetPath || cwd || this.cwd, cwd || this.cwd);
    let names;
    try {
      const stat = this.vfs.stat(resolved);
      if (stat.type !== 'dir' && !stat.isDirectory()) {
        // Single file listing
        return { stdout: `${targetPath}\n`, stderr: '', code: 0 };
      }
      names = this.vfs.listDir(resolved);
    } catch (err) {
      return { stdout: '', stderr: `ls: cannot access '${targetPath || resolved}': No such file or directory\n`, code: 2 };
    }

    if (showAll) {
      names = ['.', '..', ...names];
    } else {
      names = names.filter((n) => !n.startsWith('.'));
    }

    names.sort();

    if (longFormat) {
      const lines = names.map((name) => {
        let node;
        try {
          const itemPath = name === '.' || name === '..' ? resolved : `${resolved}/${name}`.replace('//', '/');
          node = this.vfs.stat(itemPath);
        } catch {
          node = { mode: 0o755, type: 'file', size: 0, mtime: new Date() };
        }
        const modeStr = formatMode(node.mode || 0o644, node.type || (node.isDirectory && node.isDirectory() ? 'dir' : 'file'));
        const sizeStr = humanReadable ? formatBytes(node.size || 0) : String(node.size || 0);
        const owner = node.uid === 0 ? 'root' : 'learner';
        const group = node.gid === 0 ? 'root' : 'learner';
        const dateStr = 'Nov 12 10:00';
        return `${modeStr} 1 ${owner} ${group} ${sizeStr.padStart(6)} ${dateStr} ${name}`;
      });
      return { stdout: lines.join('\n') + (lines.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    }

    if (onePerLine) {
      return { stdout: names.join('\n') + (names.length > 0 ? '\n' : ''), stderr: '', code: 0 };
    }

    return { stdout: names.join('  ') + (names.length > 0 ? '\n' : ''), stderr: '', code: 0 };
  }

  _handleCd(ctx) {
    const { args, cwd, driver } = unpackArgs(ctx);
    const target = args[0] || '~';
    let dest = target;

    if (target === '~' || target === '') {
      dest = this.env.HOME || '/home/learner';
    } else if (target === '-') {
      dest = this.env.OLDPWD || this.cwd;
    }

    const currentCwd = cwd || this.cwd;
    const resolved = this.vfs.normalizePath(dest, currentCwd);
    try {
      const stat = this.vfs.stat(resolved);
      if (stat.type !== 'dir' && !stat.isDirectory()) {
        return { stdout: '', stderr: `bash: cd: ${target}: Not a directory\n`, code: 1 };
      }
    } catch {
      return { stdout: '', stderr: `bash: cd: ${target}: No such file or directory\n`, code: 1 };
    }

    this.env.OLDPWD = this.cwd;
    this.cwd = resolved;
    this.env.PWD = resolved;
    if (driver) {
      driver.cwd = resolved;
      driver.env.OLDPWD = this.env.OLDPWD;
      driver.env.PWD = resolved;
    }
    return { stdout: '', stderr: '', code: 0, cwd: resolved };
  }

  _handleMkdir(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    let parents = false;
    const paths = [];

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-p' || args[i] === '--parents') {
        parents = true;
      } else {
        paths.push(args[i]);
      }
    }

    const currentCwd = cwd || this.cwd;
    for (const p of paths) {
      const resolved = this.vfs.normalizePath(p, currentCwd);
      try {
        this.vfs.mkdir(resolved, { recursive: parents });
      } catch (err) {
        return { stdout: '', stderr: `mkdir: cannot create directory '${p}': ${err.message}\n`, code: 1 };
      }
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  _handleRm(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    let recursive = false;
    let force = false;
    const paths = [];

    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-r' || a === '-R' || a === '-rf' || a === '-fr') {
        recursive = true;
        if (a.includes('f')) force = true;
      } else if (a === '-f') {
        force = true;
      } else {
        paths.push(a);
      }
    }

    const currentCwd = cwd || this.cwd;
    for (const p of paths) {
      const resolved = this.vfs.normalizePath(p, currentCwd);
      try {
        const stat = this.vfs.stat(resolved);
        if (stat.type === 'dir' || stat.isDirectory()) {
          if (!recursive) {
            return { stdout: '', stderr: `rm: cannot remove '${p}': Is a directory\n`, code: 1 };
          }
          this.vfs.rm(resolved, { recursive: true });
        } else {
          this.vfs.unlink(resolved);
        }
      } catch (err) {
        if (!force) {
          return { stdout: '', stderr: `rm: cannot remove '${p}': No such file or directory\n`, code: 1 };
        }
      }
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  _handleCp(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    if (args.length < 2) {
      return { stdout: '', stderr: 'cp: missing file operand\n', code: 1 };
    }
    const currentCwd = cwd || this.cwd;
    const src = this.vfs.normalizePath(args[0], currentCwd);
    const dst = this.vfs.normalizePath(args[1], currentCwd);

    try {
      const content = this.vfs.readFile(src);
      this.vfs.writeFile(dst, content);
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `cp: cannot stat '${args[0]}': ${err.message}\n`, code: 1 };
    }
  }

  _handleMv(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    if (args.length < 2) {
      return { stdout: '', stderr: 'mv: missing file operand\n', code: 1 };
    }
    const currentCwd = cwd || this.cwd;
    const src = this.vfs.normalizePath(args[0], currentCwd);
    const dst = this.vfs.normalizePath(args[1], currentCwd);

    try {
      const content = this.vfs.readFile(src);
      this.vfs.writeFile(dst, content);
      this.vfs.unlink(src);
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `mv: cannot stat '${args[0]}': ${err.message}\n`, code: 1 };
    }
  }

  _handleTouch(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    const currentCwd = cwd || this.cwd;
    for (const filename of args) {
      const resolved = this.vfs.normalizePath(filename, currentCwd);
      if (this.vfs.exists(resolved)) {
        // update timestamp
      } else {
        this.vfs.writeFile(resolved, '');
      }
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  _handleExport(ctx) {
    const { args, env, driver } = unpackArgs(ctx);
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        const k = a.slice(0, eq).trim();
        const v = a.slice(eq + 1).trim();
        this.env[k] = v;
        env[k] = v;
        if (driver) driver.env[k] = v;
      }
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  _handleUnset(ctx) {
    const { args, env, driver } = unpackArgs(ctx);
    for (const a of args) {
      delete this.env[a];
      delete env[a];
      if (driver) delete driver.env[a];
    }
    return { stdout: '', stderr: '', code: 0 };
  }

  // -------------------------------------------------------------------------
  // AUTOCOMPLETE ENGINE
  // -------------------------------------------------------------------------

  /**
   * Intelligently autocompletes the user's input line
   * @param {string} line Current line buffer
   * @param {number} cursor Optional cursor index
   * @returns {{ prefix: string, completions: string[], replacement: string }}
   */
  autocomplete(line, cursor = line.length) {
    const textBeforeCursor = line.slice(0, cursor);
    const tokens = textBeforeCursor.trimStart().split(/\s+/);
    const currentToken = textBeforeCursor.endsWith(' ') ? '' : (tokens[tokens.length - 1] || '');

    // 1. Completing First Command Token
    if (tokens.length <= 1 && !textBeforeCursor.endsWith(' ')) {
      const allCommands = Array.from(this.pipelineDriver.commands.keys());
      const matches = allCommands.filter((cmd) => cmd.startsWith(currentToken)).sort();
      return { prefix: currentToken, completions: matches };
    }

    const bin = tokens[0];

    // 2. Completing Flags (- or --)
    if (currentToken.startsWith('-')) {
      const commonFlags = [
        '-n', '--namespace', '-A', '--all-namespaces',
        '-o', '--output', '-l', '--selector',
        '-f', '--filename', '--replicas', '--image',
        '--dry-run', '--raw-output', '--compact-output'
      ];
      const matches = commonFlags.filter((f) => f.startsWith(currentToken));
      return { prefix: currentToken, completions: matches };
    }

    // 3. Completing Namespaces (after -n or --namespace)
    const prevToken = tokens[tokens.length - (currentToken ? 2 : 1)];
    if (prevToken === '-n' || prevToken === '--namespace') {
      const nsList = this.graph ? this.graph.list({ kind: 'Namespace' }).map((ns) => ns.metadata.name) : ['default', 'kube-system', 'prod', 'staging'];
      const matches = nsList.filter((n) => n.startsWith(currentToken));
      return { prefix: currentToken, completions: matches };
    }

    // 4. Completing Kubernetes Subcommands
    if ((bin === 'kubectl' || bin === 'k') && (tokens.length === 2 || (tokens.length === 1 && textBeforeCursor.endsWith(' ')))) {
      const kubeSubcommands = [
        'get', 'describe', 'apply', 'create', 'delete', 'edit',
        'patch', 'scale', 'rollout', 'logs', 'exec', 'top',
        'cordon', 'uncordon', 'drain', 'taint', 'label', 'annotate',
        'auth', 'cluster-info', 'version', 'diff', 'wait', 'config'
      ];
      const matches = kubeSubcommands.filter((sc) => sc.startsWith(currentToken));
      return { prefix: currentToken, completions: matches };
    }

    // 5. Completing Kubernetes Resource Kinds
    if ((bin === 'kubectl' || bin === 'k') && (tokens[1] === 'get' || tokens[1] === 'describe' || tokens[1] === 'delete' || tokens[1] === 'edit')) {
      const kinds = [
        'pods', 'deployments', 'services', 'configmaps', 'secrets',
        'persistentvolumeclaims', 'persistentvolumes', 'nodes', 'namespaces',
        'ingress', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs',
        'storageclasses', 'networkpolicies', 'endpoints', 'endpointslices'
      ];
      const matches = kinds.filter((k) => k.startsWith(currentToken));
      return { prefix: currentToken, completions: matches };
    }

    // 6. Completing File Paths in VFS
    if (currentToken.startsWith('/') || currentToken.startsWith('./') || currentToken.startsWith('../') || prevToken === '-f' || prevToken === 'cat' || prevToken === 'ls' || prevToken === 'cd' || currentToken.includes('/')) {
      const matches = this._completeVfsPath(currentToken);
      return { prefix: currentToken, completions: matches };
    }

    return { prefix: currentToken, completions: [] };
  }

  _completeVfsPath(prefix) {
    if (!this.vfs) return [];

    let searchDir = this.cwd;
    let filePrefix = prefix;

    const lastSlash = prefix.lastIndexOf('/');
    if (lastSlash > -1) {
      const dirPart = prefix.slice(0, lastSlash) || '/';
      filePrefix = prefix.slice(lastSlash + 1);
      searchDir = this.vfs.normalizePath(dirPart, this.cwd);
    }

    try {
      const entries = this.vfs.listDir(searchDir);
      return entries
        .filter((name) => name.startsWith(filePrefix))
        .map((name) => (lastSlash > -1 ? prefix.slice(0, lastSlash + 1) + name : name));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // MAIN EXECUTION ENTRYPOINT
  // -------------------------------------------------------------------------

  /**
   * Executes a command string and tracks history & session state
   * @param {string} rawCommand Full shell command string
   * @param {object} options Optional execution parameters
   * @returns {{ stdout: string, stderr: string, code: number, exitCode: number, output: string }}
   */
  execute(rawCommand, options = {}) {
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return { stdout: '', stderr: '', code: 0, exitCode: 0, output: '' };
    }

    // History expansion (e.g. !! for last command)
    let commandToRun = trimmed;
    if (trimmed === '!!' && this.history.length > 0) {
      commandToRun = this.history[this.history.length - 1];
    }

    // Record into history
    this.history.push(commandToRun);

    // Support sequential ; execution accumulating output
    if (commandToRun.includes(';') && !commandToRun.includes('<<')) {
      const parts = commandToRun.split(';');
      let combinedStdout = '';
      let combinedStderr = '';
      let lastCode = 0;
      for (const p of parts) {
        const trimmedPart = p.trim();
        if (!trimmedPart) continue;
        const subRes = this.pipelineDriver.execute(trimmedPart, {
          cwd: this.cwd,
          env: this.env,
          vfs: this.vfs,
          ...options
        });
        combinedStdout += subRes.stdout || '';
        combinedStderr += subRes.stderr || '';
        lastCode = subRes.code;
        this.cwd = this.pipelineDriver.cwd || this.cwd;
        this.env = { ...this.env, ...this.pipelineDriver.env, PWD: this.cwd };
      }
      const combinedOutput = combinedStdout + combinedStderr;
      return {
        stdout: combinedStdout,
        stderr: combinedStderr,
        code: lastCode,
        exitCode: lastCode,
        output: combinedOutput
      };
    }

    // Execute via PipelineDriver
    const result = this.pipelineDriver.execute(commandToRun, {
      cwd: this.cwd,
      env: this.env,
      vfs: this.vfs,
      ...options
    });

    // Synchronize environment and working directory
    this.cwd = this.pipelineDriver.cwd || this.cwd;
    this.env = { ...this.env, ...this.pipelineDriver.env, PWD: this.cwd };

    // Standard isomorphic output contract
    const combinedOutput = (result.stdout || '') + (result.stderr || '');
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code,
      exitCode: result.code,
      output: combinedOutput
    };
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TerminalEngine,
    jqTool,
    opensslTool,
    systemctlTool,
    journalctlTool
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.TerminalEngine = TerminalEngine;
  globalThis.jqTool = jqTool;
  globalThis.opensslTool = opensslTool;
  globalThis.systemctlTool = systemctlTool;
  globalThis.journalctlTool = journalctlTool;
}
