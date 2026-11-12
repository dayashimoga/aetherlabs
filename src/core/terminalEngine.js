'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Sandboxed Multi-CLI AST Terminal Engine
 * Single Source of Truth for Node.js 22+, Web Workers (PWA/Mobile), and Desktop WebViews.
 */

const { normalizeKind, getFieldByPath, evaluateJsonPath, CLUSTER_SCOPED_KINDS } = require('./virtualCluster');
const { VirtualFileSystem } = require('./virtualFileSystem');

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

let ResourceGraph;
try {
  ResourceGraph = require('./resourceGraph').ResourceGraph;
} catch {
  ResourceGraph = (typeof globalThis !== 'undefined' && globalThis.ResourceGraph);
}

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








function tokenizeCommand(cmdString) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmdString.length; i++) {
    const ch = cmdString[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function parseKubeFlags(tokens) {
  let namespace = 'default';
  let allNamespaces = false;
  let output = 'table';
  let selector = null;
  let replicas = null;
  let image = null;
  let port = null;
  let targetPort = null;
  let patchJson = null;
  const fromLiterals = {};
  const hardLimits = {};
  const limits = {};
  const requests = {};
  const rest = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-n' || t === '--namespace') {
      namespace = tokens[++i] || 'default';
    } else if (t.startsWith('--namespace=')) {
      namespace = t.split('=')[1];
    } else if (t === '-A' || t === '--all-namespaces') {
      allNamespaces = true;
    } else if (t === '-o' || t === '--output') {
      output = tokens[++i] || 'table';
    } else if (t.startsWith('-o=')) {
      output = t.slice(3);
    } else if (t === '-l' || t === '--selector') {
      selector = tokens[++i] || null;
    } else if (t.startsWith('-l=')) {
      selector = t.slice(3);
    } else if (t.startsWith('--replicas=')) {
      replicas = Number(t.split('=')[1]);
    } else if (t === '--replicas') {
      replicas = Number(tokens[++i]);
    } else if (t.startsWith('--image=')) {
      image = t.split('=')[1];
    } else if (t === '--image') {
      image = tokens[++i];
    } else if (t.startsWith('--port=')) {
      port = Number(t.split('=')[1]);
    } else if (t.startsWith('--target-port=')) {
      targetPort = Number(t.split('=')[1]);
    } else if (t.startsWith('--tcp=')) {
      const parts = t.split('=')[1].split(':');
      port = Number(parts[0]);
      targetPort = Number(parts[1] || parts[0]);
    } else if (t === '-p' || t === '--patch') {
      patchJson = tokens[++i];
    } else if (t.startsWith('--from-literal=')) {
      const kv = t.slice('--from-literal='.length);
      const eq = kv.indexOf('=');
      if (eq > -1) {
        fromLiterals[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    } else if (t.startsWith('--hard=')) {
      const parts = t.slice('--hard='.length).split(',');
      for (const p of parts) {
        const [k, v] = p.split('=');
        if (k && v) hardLimits[k] = v;
      }
    } else if (t === '--hard') {
      const raw = tokens[++i] || '';
      const parts = raw.split(',');
      for (const p of parts) {
        const [k, v] = p.split('=');
        if (k && v) hardLimits[k] = v;
      }
    } else if (t.startsWith('--limits=')) {
      const parts = t.slice('--limits='.length).split(',');
      for (const p of parts) {
        const [k, v] = p.split('=');
        if (k && v) limits[k] = v;
      }
    } else if (t.startsWith('--requests=')) {
      const parts = t.slice('--requests='.length).split(',');
      for (const p of parts) {
        const [k, v] = p.split('=');
        if (k && v) requests[k] = v;
      }
    } else if (t === '--overwrite') {
      // ignore flag
    } else {
      rest.push(t);
    }
  }

  return {
    namespace,
    allNamespaces,
    output,
    selector,
    replicas,
    image,
    port,
    targetPort,
    patchJson,
    fromLiterals,
    hardLimits,
    limits,
    requests,
    rest
  };
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function padRight(str, width) {
  const s = String(str === undefined || str === null ? '' : str);
  return s.length >= width ? s + '  ' : s + ' '.repeat(width - s.length);
}



class TerminalEngine {
    constructor(clusterOrOptions = null, maybeVfs = null) {
    let cluster = null;
    let vfs = null;
    let graph = null;
    let env = {};
    let history = [];

    if (clusterOrOptions && typeof clusterOrOptions === 'object') {
      if (clusterOrOptions.cluster || clusterOrOptions.graph || (clusterOrOptions.vfs && !maybeVfs)) {
        cluster = clusterOrOptions.cluster || null;
        vfs = clusterOrOptions.vfs || null;
        graph = clusterOrOptions.graph || null;
        env = clusterOrOptions.env || {};
        history = clusterOrOptions.history || [];
      } else {
        cluster = clusterOrOptions;
        vfs = maybeVfs;
      }
    } else {
      cluster = clusterOrOptions;
      vfs = maybeVfs;
    }

    this.cluster = cluster;
    this.vfs = vfs || (this.cluster ? this.cluster.vfs : (VirtualFileSystem ? new VirtualFileSystem() : null));
    this.graph = graph || (this.cluster ? this.cluster.graph : (ResourceGraph ? new ResourceGraph() : null));

    // Bootstrap kube-apiserver control-plane pod if graph has no pods
    if (this.graph && typeof this.graph.get === 'function' && !this.graph.get('Pod', 'kube-system', 'kube-apiserver-control-plane')) {
      try {
        this.graph.create({
          apiVersion: 'v1',
          kind: 'Pod',
          metadata: { name: 'kube-apiserver-control-plane', namespace: 'kube-system' },
          status: { phase: 'Running', hostIP: '192.168.1.10', podIP: '192.168.1.10' }
        });
      } catch {}
    }

    this.cwd = '/home/learner';
    this.env = {
      PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: '/home/learner',
      USER: 'learner',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      KUBECONFIG: '/home/learner/.kube/config',
      PWD: this.cwd,
      ...env
    };

    this.commandHistory = [...history];

    const PipelineDriver = pipelineDriverModule.PipelineDriver || (typeof globalThis !== 'undefined' && globalThis.PipelineDriver);
    if (PipelineDriver) {
      this.pipelineDriver = new PipelineDriver({
        vfs: this.vfs,
        cwd: this.cwd,
        env: this.env
      });
      if (MultiCliDispatcher) {
        this.multiCli = new MultiCliDispatcher({
          graph: this.graph,
          vfs: this.vfs
        });
        this.multiCli.registerTo(this.pipelineDriver);
      }
      this._registerExtendedBuiltins();
    }
  }

  get history() {
    const list = [];
    for (const item of this.commandHistory) {
      if (typeof item === 'string') list.push(item);
      else if (item && item.command) list.push(item.command);
    }
    return list;
  }

  set history(h) {
    this.commandHistory = Array.isArray(h) ? h : [];
  }

  execute(rawCommand, options = {}) {
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return { exitCode: 0, code: 0, output: '', stdout: '', stderr: '', command: '' };
    }

    // Graph-only pipeline execution
    if (this.pipelineDriver && this.graph && !this.cluster) {
      let commandToRun = trimmed;
      if (trimmed === '!!' && this.history.length > 0) {
        commandToRun = this.history[this.history.length - 1];
      }
      this.commandHistory.push({ command: commandToRun, timestamp: new Date().toISOString() });

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
          output: combinedOutput,
          command: commandToRun
        };
      }

      const res = this.pipelineDriver.execute(commandToRun, {
        cwd: this.cwd,
        env: this.env,
        vfs: this.vfs,
        ...options
      });
      this.cwd = this.pipelineDriver.cwd || this.cwd;
      this.env = { ...this.env, ...this.pipelineDriver.env, PWD: this.cwd };
      const out = (res.stdout || '') + (res.stderr || '');
      return {
        exitCode: res.code,
        code: res.code,
        output: out,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        command: commandToRun
      };
    }

    this.commandHistory.push({
      command: trimmed,
      timestamp: new Date().toISOString()
    });

    // Support command chaining: `&&` and `;`
    if (trimmed.includes('&&') && !trimmed.includes('<<')) {
      const subcmds = trimmed.split('&&');
      const outputs = [];
      for (const sc of subcmds) {
        const res = this.execute(sc.trim(), options);
        if (res.output) outputs.push(res.output);
        if (res.exitCode !== 0) {
          return { exitCode: res.exitCode, output: outputs.join('\n'), command: trimmed };
        }
      }
      return { exitCode: 0, output: outputs.join('\n'), command: trimmed };
    }

    if (trimmed.includes(';') && !trimmed.includes('<<')) {
      const subcmds = trimmed.split(';');
      const outputs = [];
      for (const sc of subcmds) {
        if (!sc.trim()) continue;
        const res = this.execute(sc.trim(), options);
        if (res.output) outputs.push(res.output);
      }
      return { exitCode: 0, output: outputs.join('\n'), command: trimmed };
    }

    // Support output redirection to VFS (> and >>)
    const redirMatch = trimmed.match(/^(.*?)\s*(>>|>)\s*([^>|]+)$/);
    if (redirMatch && !trimmed.includes('<<')) {
      const mainCmd = redirMatch[1].trim();
      const op = redirMatch[2];
      const targetFile = redirMatch[3].trim();
      const res = this.execute(mainCmd, options);
      if (this.vfs) {
        try {
          if (op === '>>') {
            this.vfs.appendFile(targetFile, (res.output || '') + '\n');
          } else {
            this.vfs.writeFile(targetFile, (res.output || '') + '\n');
          }
        } catch (e) {
          return { exitCode: 1, output: `sh: ${e.message}`, command: trimmed };
        }
      }
      return { exitCode: res.exitCode, output: '', command: trimmed };
    }

    // Support pipe to grep (`| grep <pattern>`)
    let grepPattern = null;
    let mainCommand = trimmed;
    const pipeMatch = trimmed.match(/^(.*?)\|\s*grep\s+(.+)$/);
    if (pipeMatch && !trimmed.includes('<<')) {
      mainCommand = pipeMatch[1].trim();
      grepPattern = pipeMatch[2].trim().replace(/^['"]|['"]$/g, '');
    }

    try {
      const result = this.dispatchCommand(mainCommand, options);
      if (grepPattern && result.output) {
        const filtered = result.output
          .split('\n')
          .filter((line) => line.toLowerCase().includes(grepPattern.toLowerCase()))
          .join('\n');
        return {
          ...result,
          output: filtered || `(no lines matched "${grepPattern}")`,
          command: trimmed
        };
      }
      return { ...result, command: trimmed };
    } catch (err) {
      return {
        exitCode: 1,
        output: `Error: ${err.message}`,
        command: trimmed
      };
    }
  }

  dispatchCommand(commandStr, options = {}) {
    // Handle heredoc `cat <<EOF | kubectl apply -f -` or `kubectl apply -f - <<EOF`
    if (commandStr.includes('<<') && commandStr.includes('kubectl apply')) {
      const lines = commandStr.split(/\r?\n/);
      const bodyLines = lines.slice(1).filter((l) => !/^EOF\s*$/.test(l.trim()) && !l.includes('kubectl apply'));
      const yamlText = bodyLines.join('\n');
      const applied = this.cluster.applyManifest(yamlText);
      const out = applied
        .map((a) => `${a.resource.kind.toLowerCase()}/${a.resource.metadata.name} ${a.action}`)
        .join('\n');
      return { exitCode: 0, output: out };
    }

    const tokens = tokenizeCommand(commandStr);
    const bin = tokens[0];
    const args = tokens.slice(1);

    switch (bin) {
      case 'help':
        return this.handleHelp();
      case 'clear':
        return { exitCode: 0, output: '', clearScreen: true };
      case 'kubectl':
      case 'k':
        return this.handleKubectl(args, options);
      case 'helm':
        return this.handleHelm(args);
      case 'docker':
      case 'crictl':
        return this.handleDocker(bin, args);
      case 'argocd':
        return this.handleArgoCD(args);
      case 'istioctl':
        return this.handleIstioctl(args);
      case 'tofu':
      case 'terraform':
        return this.handleTerraform(bin, args);
      case 'aws':
        return this.handleAws(args);
      case 'az':
        return this.handleAzure(args);
      case 'gcloud':
        return this.handleGcloud(args);
      case 'trivy':
      case 'falco':
      case 'cosign':
        return this.handleSecurityTools(bin, args);
      case 'aiops':
        return this.handleAiOps(args);
      case 'etcdctl':
        return this.handleEtcdctl(args);
      case 'kubeadm':
        return this.handleKubeadm(args);
      case 'velero':
        return this.handleVelero(args);
      case 'kyverno':
        return this.handleKyverno(args);
      case 'vcluster':
        return this.handleVcluster(args);
      case 'crossplane':
        return this.handleCrossplane(args);
      case 'flux':
        return this.handleFlux(args);
      case 'linkerd':
      case 'consul':
        return this.handleServiceMeshCli(bin, args);
      case 'opa':
      case 'conftest':
        return this.handleOpa(bin, args);
      case 'chaos':
      case 'litmusctl':
        return this.handleChaos(bin, args);
      case 'systemctl':
      case 'sysctl':
      case 'journalctl':
      case 'ps':
      case 'top':
      case 'free':
      case 'df':
      case 'uname':
      case 'id':
      case 'whoami':
      case 'pwd':
      case 'echo':
      case 'mkdir':
      case 'rm':
      case 'ls':
      case 'cat':
      case 'ip':
      case 'ss':
      case 'ping':
      case 'curl':
      case 'dig':
      case 'nslookup':
        return this.handleLinuxAndNet(bin, args);
      default:
        return {
          exitCode: 127,
          output: `kubelabs-sh: ${bin}: command not supported. Type 'help' to see available cloud-native & Linux CLI tools.`
        };
    }
  }

  handleHelp() {
    return {
      exitCode: 0,
      output: [
        'KubeLabs Sandboxed Multi-CLI Cloud-Native Shell (v1.0.0)',
        '------------------------------------------------------------------------------',
        'Kubernetes & CNCF : kubectl (get, describe, apply, create, scale, set, patch,',
        '                    label, annotate, rollout, autoscale, logs, top, auth, delete)',
        '                    helm (install, upgrade, list, rollback, status, repo)',
        'GitOps & Mesh     : argocd (app list, app get, app sync), istioctl (analyze, proxy-status)',
        'Containers & Linux: docker, crictl, systemctl, sysctl, journalctl, ps, free, df, uname',
        'Networking        : ip (addr, route), ss (-tulpn), ping, curl, dig, nslookup',
        'IaC & Multi-Cloud : tofu / terraform (init, plan, apply, state list), aws, az, gcloud',
        'DevSecOps & AI-Ops: trivy (image, k8s), falco, cosign, aiops (analyze, remediate, predict)'
      ].join('\n')
    };
  }

  handleKubectl(args, options = {}) {
    const flags = parseKubeFlags(args);
    const sub = flags.rest[0];
    const subArgs = flags.rest.slice(1);

    if (!sub) {
      return { exitCode: 0, output: 'kubectl controls the KubeLabs Virtual Kubernetes Cluster Manager.' };
    }

    if (sub === 'get') {
      return this.kubectlGet(subArgs, flags);
    }
    if (sub === 'describe') {
      return this.kubectlDescribe(subArgs, flags);
    }
    if (sub === 'apply') {
      let manifestText = options.manifestText || '';
      const fIdx = (args || []).indexOf('-f');
      if (fIdx > -1 && args[fIdx + 1] && args[fIdx + 1] !== '-') {
        const filePath = args[fIdx + 1];
        if (this.vfs && this.vfs.exists(filePath)) {
          manifestText = this.vfs.readFile(filePath);
        }
      }
      if (manifestText && manifestText.trim()) {
        const applied = this.cluster.applyManifest(manifestText);
        return {
          exitCode: 0,
          output: applied
            .map((a) => `${a.resource.kind.toLowerCase()}/${a.resource.metadata.name} ${a.action}`)
            .join('\n')
        };
      }
      throw new Error('Provide YAML in the Manifest Editor or pass valid -f <file> to apply.');
    }
    if (sub === 'create') {
      return this.kubectlCreate(subArgs, flags);
    }
    if (sub === 'expose') {
      return this.kubectlExpose(subArgs, flags);
    }
    if (sub === 'scale') {
      return this.kubectlScale(subArgs, flags);
    }
    if (sub === 'set') {
      return this.kubectlSet(subArgs, flags);
    }
    if (sub === 'patch') {
      return this.kubectlPatch(subArgs, flags);
    }
    if (sub === 'label') {
      return this.kubectlLabel(subArgs, flags);
    }
    if (sub === 'annotate') {
      return this.kubectlAnnotate(subArgs, flags);
    }
    if (sub === 'rollout') {
      return this.kubectlRollout(subArgs, flags);
    }
    if (sub === 'autoscale') {
      return this.kubectlAutoscale(subArgs, flags);
    }
    if (sub === 'logs') {
      return this.kubectlLogs(subArgs, flags);
    }
    if (sub === 'top') {
      return this.kubectlTop(subArgs, flags);
    }
    if (sub === 'auth') {
      return this.kubectlAuth(subArgs, flags, args);
    }
    if (sub === 'cordon') {
      const nodeName = subArgs[0];
      if (!nodeName) throw new Error('Usage: kubectl cordon <node-name>');
      this.cluster.cordonNode(nodeName);
      return { exitCode: 0, output: `node/${nodeName} cordoned` };
    }
    if (sub === 'uncordon') {
      const nodeName = subArgs[0];
      if (!nodeName) throw new Error('Usage: kubectl uncordon <node-name>');
      this.cluster.uncordonNode(nodeName);
      return { exitCode: 0, output: `node/${nodeName} uncordoned` };
    }
    if (sub === 'drain') {
      const nodeName = subArgs[0];
      if (!nodeName) throw new Error('Usage: kubectl drain <node-name>');
      this.cluster.drainNode(nodeName);
      return { exitCode: 0, output: `node/${nodeName} cordoned\nevicting pods...\nnode/${nodeName} drained` };
    }
    if (sub === 'taint') {
      const nodeIdx = subArgs[0] === 'nodes' || subArgs[0] === 'node' ? 1 : 0;
      const nodeName = subArgs[nodeIdx];
      const taintExpr = subArgs[nodeIdx + 1];
      if (!nodeName || !taintExpr) throw new Error('Usage: kubectl taint nodes <node-name> <key>=<value>:<effect>');
      const parts = taintExpr.split(':');
      const effect = parts[1] || 'NoSchedule';
      const kv = parts[0].split('=');
      this.cluster.taintNode(nodeName, kv[0], kv[1] || '', effect);
      return { exitCode: 0, output: `node/${nodeName} tainted` };
    }
    if (sub === 'delete') {
      let kind = subArgs[0];
      let name = subArgs[1];
      if (kind && kind.includes('/')) {
        [kind, name] = kind.split('/');
      }
      if (!kind || !name) throw new Error('Usage: kubectl delete <kind> <name> [-n <ns>]');
      const deleted = this.cluster.deleteResource(kind, name, flags.namespace);
      if (!deleted) {
        throw new Error(`Error from server (NotFound): ${normalizeKind(kind)} "${name}" not found`);
      }
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()} "${name}" deleted` };
    }

    throw new Error(`Unsupported kubectl subcommand "${sub}". Try get, describe, apply, create, scale, set, patch, label, annotate, rollout, autoscale, logs, top, auth, delete.`);
  }

  kubectlGet(subArgs, flags) {
    let rawKind = subArgs[0] || 'pods';
    let targetName = subArgs[1] || null;
    if (rawKind && rawKind.includes('/')) {
      [rawKind, targetName] = rawKind.split('/');
    }
    const nsQuery = flags.allNamespaces ? 'all' : flags.namespace;

    if (rawKind === 'all') {
      const pods = this.kubectlGet(['pods'], flags).output;
      const svcs = this.kubectlGet(['services'], flags).output;
      const deploys = this.kubectlGet(['deployments'], flags).output;
      return { exitCode: 0, output: [pods, '', svcs, '', deploys].join('\n') };
    }

    const kind = normalizeKind(rawKind);
    let items = this.cluster.getResources(kind, nsQuery, flags.selector);
    if (targetName) {
      items = items.filter((r) => r.metadata && r.metadata.name === targetName);
      if (items.length === 0) {
        throw new Error(`Error from server (NotFound): ${kind.toLowerCase()} "${targetName}" not found`);
      }
    }

    if (flags.output && flags.output.startsWith('jsonpath=')) {
      const expr = flags.output.slice('jsonpath='.length);
      const payload = targetName ? items[0] : { apiVersion: 'v1', kind: 'List', items };
      return { exitCode: 0, output: evaluateJsonPath(payload, expr) };
    }

    if (flags.output === 'json' || flags.output === 'yaml') {
      const payload = targetName ? items[0] : { apiVersion: 'v1', kind: 'List', items };
      return { exitCode: 0, output: JSON.stringify(payload, null, 2) };
    }

    if (items.length === 0) {
      return {
        exitCode: 0,
        output: flags.allNamespaces
          ? 'No resources found'
          : `No resources found in ${flags.namespace} namespace.`
      };
    }

    if (kind === 'Node') {
      const header = padRight('NAME', 26) + padRight('STATUS', 10) + padRight('ROLES', 16) + padRight('VERSION', 12) + 'INTERNAL-IP';
      const rows = items.map((n) => {
        const labels = n.metadata.labels || {};
        const role = labels['node-role.kubernetes.io/control-plane'] ? 'control-plane' : 'worker';
        return (
          padRight(n.metadata.name, 26) +
          padRight((n.status && n.status.phase) || 'Ready', 10) +
          padRight(role, 16) +
          padRight((n.status && n.status.kubeletVersion) || 'v1.32.0', 12) +
          ((n.status && n.status.internalIP) || '192.168.10.10')
        );
      });
      return { exitCode: 0, output: [header, ...rows].join('\n') };
    }

    if (kind === 'Pod') {
      const header =
        (flags.allNamespaces ? padRight('NAMESPACE', 16) : '') +
        padRight('NAME', 34) +
        padRight('READY', 9) +
        padRight('STATUS', 22) +
        padRight('RESTARTS', 10) +
        padRight('IP', 16) +
        'NODE';
      const rows = items.map((p) => {
        const st = p.status || {};
        const statusDisplay = st.reason && st.reason !== 'Running' ? st.reason : st.phase || 'Running';
        return (
          (flags.allNamespaces ? padRight(p.metadata.namespace || 'default', 16) : '') +
          padRight(p.metadata.name, 34) +
          padRight(st.ready || '1/1', 9) +
          padRight(statusDisplay, 22) +
          padRight(st.restarts || 0, 10) +
          padRight(st.podIP || '<none>', 16) +
          (st.nodeName || 'kubelabs-worker-01')
        );
      });
      return { exitCode: 0, output: [header, ...rows].join('\n') };
    }

    if (kind === 'Deployment' || kind === 'StatefulSet' || kind === 'Rollout') {
      const header =
        (flags.allNamespaces ? padRight('NAMESPACE', 16) : '') +
        padRight('NAME', 28) +
        padRight('READY', 12) +
        padRight('UP-TO-DATE', 14) +
        'AVAILABLE';
      const rows = items.map((d) => {
        const desired = d.spec && d.spec.replicas !== undefined ? d.spec.replicas : 1;
        const ready = d.status && d.status.readyReplicas !== undefined ? d.status.readyReplicas : desired;
        return (
          (flags.allNamespaces ? padRight(d.metadata.namespace || 'default', 16) : '') +
          padRight(d.metadata.name, 28) +
          padRight(`${ready}/${desired}`, 12) +
          padRight(desired, 14) +
          ready
        );
      });
      return { exitCode: 0, output: [header, ...rows].join('\n') };
    }

    if (kind === 'Service') {
      const header =
        (flags.allNamespaces ? padRight('NAMESPACE', 16) : '') +
        padRight('NAME', 26) +
        padRight('TYPE', 16) +
        padRight('CLUSTER-IP', 18) +
        padRight('PORT(S)', 16) +
        'ENDPOINTS';
      const rows = items.map((s) => {
        const ports = ((s.spec && s.spec.ports) || [{ port: 80, targetPort: 80 }])
          .map((p) => `${p.port}:${p.targetPort || p.port}/TCP`)
          .join(',');
        const eps = (s.status && s.status.endpoints) || [];
        return (
          (flags.allNamespaces ? padRight(s.metadata.namespace || 'default', 16) : '') +
          padRight(s.metadata.name, 26) +
          padRight((s.spec && s.spec.type) || 'ClusterIP', 16) +
          padRight((s.status && s.status.clusterIP) || '10.96.0.10', 18) +
          padRight(ports, 16) +
          (eps.length > 0 ? eps.join(',') : '<none>')
        );
      });
      return { exitCode: 0, output: [header, ...rows].join('\n') };
    }

    // Generic resource table
    const header =
      (flags.allNamespaces ? padRight('NAMESPACE', 16) : '') +
      padRight('KIND', 24) +
      padRight('NAME', 32) +
      'STATUS';
    const rows = items.map((r) => {
      return (
        (flags.allNamespaces ? padRight(r.metadata.namespace || '-', 16) : '') +
        padRight(r.kind, 24) +
        padRight(r.metadata.name, 32) +
        'Active'
      );
    });
    return { exitCode: 0, output: [header, ...rows].join('\n') };
  }

  kubectlDescribe(subArgs, flags) {
    let rawKind = subArgs[0] || 'Pod';
    let name = subArgs[1];
    if (rawKind && rawKind.includes('/')) {
      [rawKind, name] = rawKind.split('/');
    }
    const kind = normalizeKind(rawKind);
    const items = name
      ? [this.cluster.getResource(kind, name, flags.namespace)].filter(Boolean)
      : this.cluster.getResources(kind, flags.namespace);

    if (items.length === 0) {
      throw new Error(`Error from server (NotFound): ${kind.toLowerCase()} "${name || ''}" not found`);
    }

    const lines = [];
    for (const item of items) {
      lines.push(`Name:         ${item.metadata.name}`);
      lines.push(`Namespace:    ${item.metadata.namespace || '<cluster-scoped>'}`);
      lines.push(`Kind:         ${item.kind}`);
      lines.push(`Labels:       ${JSON.stringify(item.metadata.labels || {})}`);
      lines.push(`Annotations:  ${JSON.stringify(item.metadata.annotations || {})}`);
      lines.push(`Spec:         ${JSON.stringify(item.spec || {}, null, 2)}`);
      lines.push(`Status:       ${JSON.stringify(item.status || {}, null, 2)}`);
      lines.push('---');
    }
    return { exitCode: 0, output: lines.join('\n') };
  }

  kubectlCreate(subArgs, flags) {
    const rawKind = subArgs[0];
    const name = subArgs[1];
    if (!rawKind || !name) {
      throw new Error('Usage: kubectl create <kind> <name> [options]');
    }
    const kind = normalizeKind(rawKind);

    if (kind === 'Namespace') {
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name },
        status: { phase: 'Active' }
      });
      return { exitCode: 0, output: `namespace/${name} created` };
    }

    if (kind === 'Deployment') {
      const image = flags.image || 'nginx:1.27-alpine';
      const replicas = flags.replicas || 1;
      this.cluster.applyResource({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace: flags.namespace, labels: { app: name } },
        spec: {
          replicas,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels: { app: name } },
            spec: { containers: [{ name, image }] }
          }
        }
      });
      return { exitCode: 0, output: `deployment.apps/${name} created` };
    }

    if (kind === 'ServiceAccount') {
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: { name, namespace: flags.namespace }
      });
      return { exitCode: 0, output: `serviceaccount/${name} created` };
    }

    if (kind === 'Service') {
      let svcType = 'ClusterIP';
      let svcName = name;
      if (['clusterip', 'nodeport', 'loadbalancer', 'headless'].includes(name.toLowerCase())) {
        svcType = name.toLowerCase() === 'clusterip' ? 'ClusterIP' : name.toLowerCase() === 'nodeport' ? 'NodePort' : 'LoadBalancer';
        svcName = subArgs[2] || name;
      }
      const port = flags.port || 80;
      const targetPort = flags.targetPort || port;
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: svcName, namespace: flags.namespace, labels: { app: svcName } },
        spec: {
          type: svcType,
          selector: { app: svcName },
          ports: [{ port, targetPort }]
        }
      });
      return { exitCode: 0, output: `service/${svcName} created` };
    }

    if (kind === 'Secret') {
      const secretName = subArgs[2] || name;
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: secretName, namespace: flags.namespace },
        type: 'Opaque',
        data: { ...flags.fromLiterals }
      });
      return { exitCode: 0, output: `secret/${secretName} created` };
    }

    if (kind === 'ConfigMap') {
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name, namespace: flags.namespace },
        data: { ...flags.fromLiterals }
      });
      return { exitCode: 0, output: `configmap/${name} created` };
    }

    if (kind === 'ResourceQuota') {
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'ResourceQuota',
        metadata: { name, namespace: flags.namespace },
        spec: {
          hard: { ...flags.hardLimits }
        }
      });
      return { exitCode: 0, output: `resourcequota/${name} created` };
    }

    if (kind === 'Job') {
      const image = flags.image || 'busybox:1.36';
      this.cluster.applyResource({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name, namespace: flags.namespace },
        spec: {
          completions: 1,
          template: {
            spec: {
              restartPolicy: 'Never',
              containers: [{ name, image }]
            }
          }
        }
      });
      return { exitCode: 0, output: `job.batch/${name} created` };
    }

    if (kind === 'CronJob') {
      const image = flags.image || 'busybox:1.36';
      this.cluster.applyResource({
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name, namespace: flags.namespace },
        spec: {
          schedule: '*/5 * * * *',
          jobTemplate: {
            spec: {
              template: {
                spec: {
                  restartPolicy: 'OnFailure',
                  containers: [{ name, image }]
                }
              }
            }
          }
        }
      });
      return { exitCode: 0, output: `cronjob.batch/${name} created` };
    }

    this.cluster.applyResource({
      apiVersion: 'v1',
      kind,
      metadata: { name, namespace: flags.namespace },
      spec: {}
    });
    return { exitCode: 0, output: `${kind.toLowerCase()}/${name} created` };
  }

  kubectlExpose(subArgs, flags) {
    const kind = normalizeKind(subArgs[0]);
    const name = subArgs[1];
    const target = this.cluster.getResource(kind, name, flags.namespace);
    if (!target) {
      throw new Error(`${kind} "${name}" not found in namespace "${flags.namespace}"`);
    }
    const port = flags.port || 80;
    const targetPort = flags.targetPort || port;
    const labels =
      (target.spec && target.spec.selector && target.spec.selector.matchLabels) ||
      (target.metadata && target.metadata.labels) ||
      { app: name };

    this.cluster.applyResource({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name, namespace: flags.namespace, labels },
      spec: {
        type: 'ClusterIP',
        selector: { ...labels },
        ports: [{ port, targetPort }]
      }
    });
    return { exitCode: 0, output: `service/${name} exposed` };
  }

  kubectlScale(subArgs, flags) {
    let kind = 'Deployment';
    let name = subArgs[0];
    if (name && name.includes('/')) {
      const parts = name.split('/');
      kind = parts[0];
      name = parts[1];
    } else if (subArgs.length >= 2) {
      kind = subArgs[0];
      name = subArgs[1];
    }
    if (flags.replicas === null || Number.isNaN(flags.replicas)) {
      throw new Error('Usage: kubectl scale deployment <name> --replicas=<count>');
    }
    this.cluster.scaleResource(kind, name, flags.replicas, flags.namespace);
    return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}.apps/${name} scaled` };
  }

  kubectlSet(subArgs, flags) {
    const setType = subArgs[0];
    if (setType === 'image') {
      let kind = 'Deployment';
      let name = subArgs[1];
      let assignToken = subArgs[2];
      if (name && name.includes('/')) {
        const parts = name.split('/');
        kind = parts[0];
        name = parts[1];
      } else {
        kind = subArgs[1];
        name = subArgs[2];
        assignToken = subArgs[3];
      }
      if (!assignToken || !assignToken.includes('=')) {
        throw new Error('Usage: kubectl set image deployment/<name> <container>=<image>');
      }
      const [containerName, newImage] = assignToken.split('=');
      this.cluster.setImage(kind, name, containerName, newImage, flags.namespace);
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}.apps/${name} image updated` };
    }

    if (setType === 'env') {
      let kind = 'Deployment';
      let name = subArgs[1];
      let assignToken = subArgs[2];
      if (name && name.includes('/')) {
        const parts = name.split('/');
        kind = parts[0];
        name = parts[1];
      } else {
        kind = subArgs[1];
        name = subArgs[2];
        assignToken = subArgs[3];
      }
      const res = this.cluster.getResource(kind, name, flags.namespace);
      if (!res) throw new Error(`${kind} "${name}" not found`);
      const [envKey, envVal] = (assignToken || '').split('=');
      const containers =
        res.kind === 'Pod'
          ? res.spec.containers
          : res.spec && res.spec.template && res.spec.template.spec && res.spec.template.spec.containers;
      if (Array.isArray(containers) && containers[0]) {
        containers[0].env = containers[0].env || [];
        const existingEnv = containers[0].env.find((e) => e.name === envKey);
        if (existingEnv) {
          existingEnv.value = envVal;
        } else {
          containers[0].env.push({ name: envKey, value: envVal });
        }
      }
      this.cluster.reconcile();
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}.apps/${name} env updated` };
    }

    if (setType === 'resources') {
      let kind = 'Deployment';
      let name = subArgs[1];
      if (name && name.includes('/')) {
        const parts = name.split('/');
        kind = parts[0];
        name = parts[1];
      } else {
        kind = subArgs[1];
        name = subArgs[2];
      }
      const res = this.cluster.getResource(kind, name, flags.namespace);
      if (!res) throw new Error(`${kind} "${name}" not found`);
      const containers =
        res.kind === 'Pod'
          ? res.spec.containers
          : res.spec && res.spec.template && res.spec.template.spec && res.spec.template.spec.containers;
      if (Array.isArray(containers) && containers[0]) {
        containers[0].resources = containers[0].resources || {};
        if (flags.limits && Object.keys(flags.limits).length > 0) {
          containers[0].resources.limits = Object.assign(containers[0].resources.limits || {}, flags.limits);
        }
        if (flags.requests && Object.keys(flags.requests).length > 0) {
          containers[0].resources.requests = Object.assign(containers[0].resources.requests || {}, flags.requests);
        }
      }
      this.cluster.reconcile();
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}.apps/${name} resource requirements updated` };
    }

    throw new Error(`Unsupported kubectl set command "${setType}"`);
  }

  kubectlPatch(subArgs, flags) {
    let kind = subArgs[0];
    let name = subArgs[1];
    if (kind && kind.includes('/')) {
      [kind, name] = kind.split('/');
    }
    const res = this.cluster.getResource(kind, name, flags.namespace);
    if (!res) {
      throw new Error(`${normalizeKind(kind)} "${name}" not found in namespace "${flags.namespace}"`);
    }
    if (!flags.patchJson) {
      throw new Error('Provide patch payload with -p \'<json>\'');
    }
    const patchObj = JSON.parse(flags.patchJson);
    deepMerge(res, patchObj);
    this.cluster.reconcile();
    return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}/${name} patched` };
  }

  kubectlLabel(subArgs, flags) {
    let kind = subArgs[0];
    let name = subArgs[1];
    let kvIndex = 2;
    if (kind && kind.includes('/')) {
      [kind, name] = kind.split('/');
      kvIndex = 1;
    }
    const res = this.cluster.getResource(kind, name, flags.namespace);
    if (!res) throw new Error(`${normalizeKind(kind)} "${name}" not found`);
    res.metadata.labels = res.metadata.labels || {};
    for (let i = kvIndex; i < subArgs.length; i++) {
      const [k, v] = subArgs[i].split('=');
      if (k && v !== undefined) {
        res.metadata.labels[k] = v;
      }
    }
    this.cluster.reconcile();
    return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}/${name} labeled` };
  }

  kubectlAnnotate(subArgs, flags) {
    let kind = subArgs[0];
    let name = subArgs[1];
    let kvIndex = 2;
    if (kind && kind.includes('/')) {
      [kind, name] = kind.split('/');
      kvIndex = 1;
    }
    const res = this.cluster.getResource(kind, name, flags.namespace);
    if (!res) throw new Error(`${normalizeKind(kind)} "${name}" not found`);
    res.metadata.annotations = res.metadata.annotations || {};
    for (let i = kvIndex; i < subArgs.length; i++) {
      const eq = subArgs[i].indexOf('=');
      if (eq > -1) {
        const k = subArgs[i].slice(0, eq);
        const v = subArgs[i].slice(eq + 1);
        res.metadata.annotations[k] = v;
      }
    }
    this.cluster.reconcile();
    return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}/${name} annotated` };
  }

  kubectlRollout(subArgs, flags) {
    const action = subArgs[0];
    const target = subArgs[1] || '';
    const [kind, name] = target.includes('/') ? target.split('/') : ['Deployment', subArgs[2] || target];
    const res = this.cluster.getResource(kind, name, flags.namespace);
    if (!res) throw new Error(`${normalizeKind(kind)} "${name}" not found`);

    if (action === 'status') {
      const ready = (res.status && res.status.readyReplicas) || 0;
      const desired = (res.spec && res.spec.replicas) || 1;
      if (ready >= desired) {
        return { exitCode: 0, output: `deployment "${name}" successfully rolled out (${ready}/${desired} ready)` };
      }
      return { exitCode: 0, output: `Waiting for deployment "${name}" rollout to finish: ${ready} of ${desired} updated replicas are available...` };
    }

    if (action === 'undo') {
      const containers = res.spec && res.spec.template && res.spec.template.spec && res.spec.template.spec.containers;
      if (Array.isArray(containers) && containers[0]) {
        containers[0].image = String(containers[0].image).replace(/(-|:)(broken|invalid|missing|canary-bug)/g, '$1stable');
        if (Array.isArray(containers[0].env)) {
          containers[0].env = containers[0].env.filter((e) => e.name !== 'CRASH_ON_START');
        }
      }
      this.cluster.reconcile();
      return { exitCode: 0, output: `deployment.apps/${name} rolled back to previous stable revision` };
    }

    if (action === 'restart') {
      this.cluster.reconcile();
      return { exitCode: 0, output: `deployment.apps/${name} restarted` };
    }

    throw new Error(`Unsupported rollout action "${action}"`);
  }

  kubectlAutoscale(subArgs, flags) {
    let rawKind = subArgs[0];
    let name = subArgs[1];
    if (rawKind && rawKind.includes('/')) {
      [rawKind, name] = rawKind.split('/');
    }
    const kind = normalizeKind(rawKind);
    let min = 2;
    let max = 10;
    let cpu = 75;
    for (const token of subArgs) {
      if (token.startsWith('--min=')) min = Number(token.split('=')[1]);
      if (token.startsWith('--max=')) max = Number(token.split('=')[1]);
      if (token.startsWith('--cpu-percent=')) cpu = Number(token.split('=')[1]);
    }
    this.cluster.applyResource({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name, namespace: flags.namespace },
      spec: {
        scaleTargetRef: { kind, name },
        minReplicas: min,
        maxReplicas: max,
        targetCPUUtilizationPercentage: cpu
      }
    });
    return { exitCode: 0, output: `horizontalpodautoscaler.autoscaling/${name} autoscaled` };
  }

  kubectlLogs(subArgs, flags) {
    const target = subArgs[0] || '';
    const pods = this.cluster.getResources('Pod', flags.namespace);
    const pod = pods.find((p) => p.metadata.name === target || p.metadata.name.startsWith(target.replace(/^deploy(ment)?\//, '')));
    if (!pod) {
      throw new Error(`Error from server (NotFound): pods "${target}" not found`);
    }
    if (pod.status && pod.status.reason !== 'Running') {
      return {
        exitCode: 0,
        output: `[ERROR] ${new Date().toISOString()} Container failed startup check: ${pod.status.reason} - ${pod.status.message}`
      };
    }
    return {
      exitCode: 0,
      output: `[INFO] ${new Date().toISOString()} Server listening and healthy on pod ${pod.metadata.name} (${pod.status.podIP})`
    };
  }

  kubectlTop(subArgs, flags) {
    const target = subArgs[0] || 'pods';
    if (target.startsWith('no')) {
      return {
        exitCode: 0,
        output: [
          'NAME                      CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%',
          'kubelabs-control-plane    310m         7%     1420Mi          17%',
          'kubelabs-worker-01        640m         8%     3120Mi          19%',
          'kubelabs-worker-gpu-02    890m         11%    6400Mi          20%'
        ].join('\n')
      };
    }
    const pods = this.cluster.getResources('Pod', flags.namespace);
    const rows = pods.map((p) => `${padRight(p.metadata.name, 34)}45m          128Mi`);
    return {
      exitCode: 0,
      output: ['NAME                              CPU(cores)   MEMORY(bytes)', ...rows].join('\n')
    };
  }

  kubectlAuth(subArgs, flags, args = []) {
    const verb = subArgs[1] || 'get';
    const resource = subArgs[2] || 'pods';
    let asUser = 'kubernetes-admin';
    const asFlag = args.find((a) => a.startsWith('--as='));
    if (asFlag) asUser = asFlag.split('=')[1];
    const asIdx = args.indexOf('--as');
    if (asIdx > -1 && args[asIdx + 1]) asUser = args[asIdx + 1];

    if (this.cluster && typeof this.cluster.evaluateRBAC === 'function') {
      let serviceAccount = null;
      let rbacNamespace = flags.namespace || 'default';
      if (asUser && asUser.startsWith('system:serviceaccount:')) {
        const saParts = asUser.split(':');
        if (saParts.length >= 4) {
          rbacNamespace = saParts[2] || rbacNamespace;
          serviceAccount = saParts[3];
        }
      }
      const allowed = this.cluster.evaluateRBAC({
        user: asUser,
        serviceAccount,
        verb,
        resource,
        namespace: rbacNamespace
      });
      return {
        exitCode: 0,
        output: allowed ? 'yes' : 'no'
      };
    }
    const roles = this.cluster.getResources('Role', flags.namespace);
    const bindings = this.cluster.getResources('RoleBinding', flags.namespace);
    const allowed = roles.length > 0 && bindings.length > 0;
    return {
      exitCode: 0,
      output: allowed ? `yes (RBAC Role & RoleBinding active for ${verb} ${resource})` : 'yes'
    };
  }

  handleHelm(args) {
    const sub = args[0];
    if (sub === 'list' || sub === 'ls') {
      const releases = this.cluster.state.helmReleases;
      if (releases.length === 0) {
        return { exitCode: 0, output: 'NAME\tNAMESPACE\tREVISION\tSTATUS\tCHART\tAPP VERSION' };
      }
      const rows = releases.map(
        (r) => `${r.name}\t${r.namespace}\t${r.revision}\t${r.status}\t${r.chart}\t${r.appVersion || '1.0.0'}`
      );
      return {
        exitCode: 0,
        output: ['NAME\tNAMESPACE\tREVISION\tSTATUS\tCHART\tAPP VERSION', ...rows].join('\n')
      };
    }

    if (sub === 'install' || sub === 'upgrade') {
      const releaseName = args[1] || 'webapp-release';
      const chart = args[2] || 'bitnami/nginx';
      let namespace = 'default';
      let replicas = 2;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' || args[i] === '--namespace') namespace = args[i + 1] || 'default';
        if (args[i].startsWith('replicaCount=')) replicas = Number(args[i].split('=')[1]);
        if (args[i] === '--set' && args[i + 1] && args[i + 1].includes('replicaCount=')) {
          replicas = Number(args[i + 1].split('=')[1]);
        }
      }
      const existing = this.cluster.state.helmReleases.find((r) => r.name === releaseName);
      if (existing) {
        existing.revision += 1;
        existing.chart = chart;
        existing.status = 'deployed';
      } else {
        this.cluster.state.helmReleases.push({
          name: releaseName,
          namespace,
          revision: 1,
          status: 'deployed',
          chart,
          appVersion: '1.27.0'
        });
      }
      this.cluster.applyResource({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: releaseName,
          namespace,
          labels: { 'app.kubernetes.io/managed-by': 'Helm', app: releaseName }
        },
        spec: {
          replicas,
          selector: { matchLabels: { app: releaseName } },
          template: {
            metadata: { labels: { app: releaseName } },
            spec: { containers: [{ name: releaseName, image: 'nginx:1.27-alpine' }] }
          }
        }
      });
      return {
        exitCode: 0,
        output: `NAME: ${releaseName}\nNAMESPACE: ${namespace}\nSTATUS: deployed\nREVISION: ${existing ? existing.revision : 1}`
      };
    }

    if (sub === 'rollback') {
      const releaseName = args[1] || 'webapp-release';
      const rel = this.cluster.state.helmReleases.find((r) => r.name === releaseName);
      if (rel) {
        rel.revision += 1;
        rel.status = 'deployed';
      }
      return { exitCode: 0, output: `Rollback was a success! Happy Helming!` };
    }

    if (sub === 'repo') {
      return { exitCode: 0, output: '"bitnami" has been added to your repositories\nUpdate Complete. Happy Helming!' };
    }

    return { exitCode: 0, output: 'Helm v3.16.2 package manager ready.' };
  }

  handleDocker(bin, args) {
    const sub = args[0] || 'ps';
    if (sub === 'ps') {
      const rows = this.cluster.state.containers.map(
        (c) => `${padRight(c.id, 16)}${padRight(c.image, 28)}${padRight(c.status, 16)}${padRight(c.ports, 14)}${c.name}`
      );
      return {
        exitCode: 0,
        output: ['CONTAINER ID    IMAGE                       STATUS          PORTS         NAMES', ...rows].join('\n')
      };
    }
    if (sub === 'images') {
      return {
        exitCode: 0,
        output: [
          'REPOSITORY                        TAG            IMAGE ID       SIZE',
          'nginx                             1.27-alpine    a928f7c1093d   18.4MB',
          'gcr.io/distroless/static-debian12 nonroot        4d9e8a1b2c3f   2.4MB',
          'postgres                          16-alpine      8f12c904e5a1   84.1MB'
        ].join('\n')
      };
    }
    if (sub === 'run' || sub === 'build') {
      const nameIdx = args.indexOf('--name');
      const name = nameIdx > -1 ? args[nameIdx + 1] : `container-${this.cluster.state.containers.length + 1}`;
      const image = args[args.length - 1] || 'gcr.io/distroless/static-debian12:nonroot';
      this.cluster.state.containers.push({
        id: 'f91a2e4b8c10',
        name,
        image,
        status: 'Up 2 seconds',
        ports: '8080/tcp',
        rootless: true
      });
      return { exitCode: 0, output: `f91a2e4b8c10 (${name} running with ${image})` };
    }
    return { exitCode: 0, output: `${bin} ${sub} completed successfully.` };
  }

  handleArgoCD(args) {
    const sub = args[0];
    const action = args[1];
    const appName = args[2] || 'payments-gitops';

    if (sub === 'app' && action === 'list') {
      const apps = this.cluster.state.argoApps;
      const header = 'NAME               CLUSTER                         NAMESPACE    PROJECT  STATUS     HEALTH   SYNCPOLICY';
      const rows = apps.map(
        (a) =>
          `${padRight(a.name, 19)}https://kubernetes.default.svc  ${padRight(a.destNamespace || 'production', 13)}default  ${padRight(a.syncStatus, 11)}${padRight(a.healthStatus, 9)}Automated`
      );
      return { exitCode: 0, output: [header, ...rows].join('\n') };
    }

    if (sub === 'app' && action === 'sync') {
      let app = this.cluster.state.argoApps.find((a) => a.name === appName);
      if (!app) {
        app = {
          name: appName,
          namespace: 'argocd',
          destNamespace: 'production',
          syncStatus: 'Synced',
          healthStatus: 'Healthy'
        };
        this.cluster.state.argoApps.push(app);
      } else {
        app.syncStatus = 'Synced';
        app.healthStatus = 'Healthy';
      }

      const appResource = this.cluster.getResource('Application', appName, 'argocd');
      if (appResource) {
        appResource.status = { syncStatus: 'Synced', healthStatus: 'Healthy' };
      }

      // Reconcile the target deployment in production namespace
      this.cluster.applyResource({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: appName, namespace: app.destNamespace || 'production', labels: { 'argocd.argoproj.io/instance': appName } },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: appName } },
          template: {
            metadata: { labels: { app: appName } },
            spec: { containers: [{ name: appName, image: 'ghcr.io/kubelabs/payments:v2.4.0' }] }
          }
        }
      });

      return {
        exitCode: 0,
        output: `Name:               argocd/${appName}\nSync Status:        Synced to main (c8a91f2)\nHealth Status:      Healthy`
      };
    }

    if (sub === 'app' && action === 'get') {
      const app = this.cluster.state.argoApps.find((a) => a.name === appName) || {
        name: appName,
        syncStatus: 'Synced',
        healthStatus: 'Healthy'
      };
      return {
        exitCode: 0,
        output: `Name: ${app.name}\nSync Status: ${app.syncStatus}\nHealth Status: ${app.healthStatus}`
      };
    }

    return { exitCode: 0, output: 'argocd CLI v2.13.0 ready.' };
  }

  handleIstioctl(args) {
    const sub = args[0] || 'analyze';
    if (sub === 'analyze') {
      return {
        exitCode: 0,
        output: '✔ No validation issues found when analyzing namespace: production.'
      };
    }
    if (sub === 'proxy-status' || sub === 'ps') {
      return {
        exitCode: 0,
        output: [
          'NAME                                      CLUSTER        CDS        LDS        EDS        RDS        ECDS         ISTIOD',
          'reviews-v1-pod-1.production               Kubernetes     SYNCED     SYNCED     SYNCED     SYNCED     NOT SENT     istiod-1.24.0',
          'reviews-v2-pod-1.production               Kubernetes     SYNCED     SYNCED     SYNCED     SYNCED     NOT SENT     istiod-1.24.0'
        ].join('\n')
      };
    }
    return { exitCode: 0, output: 'istioctl version 1.24.0' };
  }

  handleTerraform(bin, args) {
    const sub = args[0] || 'plan';
    if (sub === 'init') {
      this.cluster.state.terraformState.initialized = true;
      return {
        exitCode: 0,
        output: `${bin} has been successfully initialized! Providers: hashicorp/aws v5.80, hashicorp/kubernetes v2.35.`
      };
    }
    if (sub === 'validate') {
      return { exitCode: 0, output: 'Success! The configuration is valid.' };
    }
    if (sub === 'plan') {
      return {
        exitCode: 0,
        output: 'Plan: 3 to add, 0 to change, 0 to destroy. (aws_vpc.main, aws_eks_cluster.prod, aws_s3_bucket.artifacts)'
      };
    }
    if (sub === 'apply') {
      this.cluster.state.terraformState.initialized = true;
      const defaultResources = ['aws_vpc.main', 'aws_eks_cluster.prod', 'aws_s3_bucket.artifacts'];
      for (const r of defaultResources) {
        if (!this.cluster.state.terraformState.resources.includes(r)) {
          this.cluster.state.terraformState.resources.push(r);
        }
        if (!this.cluster.state.cloudResources.some((cr) => cr.id === r)) {
          this.cluster.state.cloudResources.push({
            id: r,
            provider: 'aws',
            type: r.split('.')[0],
            name: r.split('.')[1],
            status: 'ACTIVE'
          });
        }
      }
      return {
        exitCode: 0,
        output: 'Apply complete! Resources: 3 added, 0 changed, 0 destroyed.\nOutputs:\ncluster_endpoint = "https://eks.us-east-1.amazonaws.com/prod"'
      };
    }
    if (sub === 'state' && args[1] === 'list') {
      const list = this.cluster.state.terraformState.resources;
      return { exitCode: 0, output: list.length ? list.join('\n') : 'aws_vpc.main\naws_eks_cluster.prod' };
    }
    return { exitCode: 0, output: `${bin} v1.9.0 executed.` };
  }

  handleAws(args) {
    const service = args[0];
    const action = args[1];
    if (service === 'eks') {
      const clusterName = args[args.indexOf('--name') + 1] || 'kubelabs-eks-prod';
      if (!this.cluster.state.cloudResources.some((c) => c.name === clusterName)) {
        this.cluster.state.cloudResources.push({
          id: `aws_eks_cluster.${clusterName}`,
          provider: 'aws',
          type: 'eks-cluster',
          name: clusterName,
          status: 'ACTIVE'
        });
      }
      return {
        exitCode: 0,
        output: JSON.stringify(
          {
            cluster: {
              name: clusterName,
              status: 'ACTIVE',
              version: '1.32',
              endpoint: `https://${clusterName}.yl4.us-east-1.eks.amazonaws.com`,
              identity: { oidc: { issuer: 'https://oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B716D3041E' } }
            }
          },
          null,
          2
        )
      };
    }
    if (service === 's3') {
      return { exitCode: 0, output: '2026-11-11 12:00:00 s3://kubelabs-prod-state-bucket' };
    }
    return { exitCode: 0, output: `AWS CLI executed: aws ${service || ''} ${action || ''}` };
  }

  handleAzure(args) {
    const group = args[0];
    if (group === 'aks') {
      const nameIdx = args.indexOf('--name');
      const name = nameIdx > -1 ? args[nameIdx + 1] : 'kubelabs-aks-prod';
      if (!this.cluster.state.cloudResources.some((c) => c.name === name)) {
        this.cluster.state.cloudResources.push({
          id: `azurerm_kubernetes_cluster.${name}`,
          provider: 'azure',
          type: 'aks-cluster',
          name,
          status: 'Succeeded'
        });
      }
      return {
        exitCode: 0,
        output: JSON.stringify({ name, provisioningState: 'Succeeded', kubernetesVersion: '1.32.0', oidcIssuerProfile: { enabled: true } }, null, 2)
      };
    }
    return { exitCode: 0, output: 'Azure CLI v2.66.0 completed.' };
  }

  handleGcloud(args) {
    if (args[0] === 'container') {
      const name = args[3] || 'kubelabs-gke-autopilot';
      if (!this.cluster.state.cloudResources.some((c) => c.name === name)) {
        this.cluster.state.cloudResources.push({
          id: `google_container_cluster.${name}`,
          provider: 'gcp',
          type: 'gke-cluster',
          name,
          status: 'RUNNING'
        });
      }
      return {
        exitCode: 0,
        output: `NAME                     LOCATION     MASTER_VERSION  STATUS\n${padRight(name, 25)}us-central1  1.32.0-gke.100  RUNNING`
      };
    }
    return { exitCode: 0, output: 'Google Cloud SDK 500.0.0 completed.' };
  }

  handleSecurityTools(bin, args) {
    if (bin === 'trivy') {
      const target = args[1] || 'nginx:1.27-alpine';
      return {
        exitCode: 0,
        output: [
          `Report Summary for ${target}`,
          '================================================================================',
          'Total: 0 (HIGH: 0, CRITICAL: 0) — Image verified clean against NVD & GHSA feeds.'
        ].join('\n')
      };
    }
    if (bin === 'falco') {
      return {
        exitCode: 0,
        output: 'Falco eBPF Runtime Security Engine: ACTIVE (0 anomalous container syscalls detected)'
      };
    }
    if (bin === 'cosign') {
      return {
        exitCode: 0,
        output: 'Verification for OCI image signature succeeded! SLSA Provenance Level 3 attested.'
      };
    }
    return { exitCode: 0, output: `${bin} completed.` };
  }

  handleAiOps(args) {
    const sub = args[0] || 'analyze';
    const pods = this.cluster.getResources('Pod', 'all');
    const brokenPods = pods.filter((p) => p.status && p.status.reason !== 'Running');
    const svcs = this.cluster.getResources('Service', 'all');
    const brokenSvcs = svcs.filter((s) => s.status && s.status.endpointCount === 0);

    if (sub === 'analyze') {
      const findings = [];
      for (const bp of brokenPods) {
        findings.push(
          `[CRITICAL] Pod ${bp.metadata.namespace}/${bp.metadata.name} is in state ${bp.status.reason}: ${bp.status.message}`
        );
      }
      for (const bs of brokenSvcs) {
        findings.push(
          `[WARNING] Service ${bs.metadata.namespace}/${bs.metadata.name} has 0 active endpoints for selector ${JSON.stringify(bs.spec.selector)}`
        );
      }
      if (findings.length === 0) {
        return {
          exitCode: 0,
          output: 'AI-Ops RCA Engine: 0 anomalies detected. All cluster workloads, endpoints, and nodes are healthy.'
        };
      }
      return {
        exitCode: 0,
        output: ['AI-Ops Root Cause Analysis Report:', ...findings].join('\n')
      };
    }

    if (sub === 'remediate') {
      let fixed = 0;
      const workloads = this.cluster.getResources('Deployment', 'all');
      for (const wl of workloads) {
        const containers = wl.spec && wl.spec.template && wl.spec.template.spec && wl.spec.template.spec.containers;
        if (Array.isArray(containers) && containers[0]) {
          if (String(containers[0].image).includes('broken') || String(containers[0].image).includes('invalid')) {
            containers[0].image = String(containers[0].image).replace(/(-|:)(broken|invalid)/g, '$1stable');
            fixed++;
          }
          if (Array.isArray(containers[0].env)) {
            containers[0].env = containers[0].env.filter((e) => e.name !== 'CRASH_ON_START');
            fixed++;
          }
        }
      }
      // Also record AI-Ops self-healing annotation on cluster
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'aiops-remediation-report', namespace: 'monitoring' },
        data: { status: 'remediated', fixedCount: String(fixed) }
      });
      this.cluster.reconcile();
      return {
        exitCode: 0,
        output: `AI-Ops Autonomous Controller remediated anomalies and recorded ConfigMap monitoring/aiops-remediation-report.`
      };
    }

    return {
      exitCode: 0,
      output: 'AI-Ops Predictive Autoscaler: Next 60m traffic forecast +18%, GPU utilization nominal (64%).'
    };
  }

  handleLinuxAndNet(bin, args) {
    if (bin === 'systemctl') {
      const action = args[0] || 'status';
      const unit = (args[1] || 'kubelet').replace(/\.service$/, '');
      if (action === 'restart' || action === 'start' || action === 'enable') {
        this.cluster.state.systemdUnits[unit] = {
          active: 'active',
          enabled: true,
          description: `Hardened ${unit} daemon`
        };
        if (unit === 'kubelet' || unit === 'containerd') {
          const nodes = this.cluster.getResources('Node');
          for (const node of nodes) {
            node.status = node.status || {};
            if (node.status.phase === 'NotReady') {
              node.status.phase = 'Ready';
            }
          }
          this.cluster.reconcile();
        }
        return { exitCode: 0, output: `● ${unit}.service - active (running) [restarted & enabled]` };
      }
      const st = this.cluster.state.systemdUnits[unit] || { active: 'active', enabled: true };
      return {
        exitCode: 0,
        output: `● ${unit}.service - Cloud-Native System Daemon\n   Loaded: loaded (/etc/systemd/system/${unit}.service; enabled)\n   Active: ${st.active} (running)`
      };
    }

    if (bin === 'sysctl') {
      if (args[0] === '-w' && args[1] && args[1].includes('=')) {
        const [k, v] = args[1].split('=');
        this.cluster.state.sysctls[k] = v;
        return { exitCode: 0, output: `${k} = ${v}` };
      }
      const entries = Object.entries(this.cluster.state.sysctls).map(([k, v]) => `${k} = ${v}`);
      return { exitCode: 0, output: entries.join('\n') };
    }

    if (bin === 'ss') {
      return {
        exitCode: 0,
        output: [
          'Netid  State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port  Process',
          'tcp    LISTEN  0       4096    0.0.0.0:6443         0.0.0.0:*          users:(("kube-apiserver",pid=1102))',
          'tcp    LISTEN  0       4096    127.0.0.1:10248      0.0.0.0:*          users:(("kubelet",pid=1420))',
          'tcp    LISTEN  0       4096    0.0.0.0:80           0.0.0.0:*          users:(("envoy",pid=2190))'
        ].join('\n')
      };
    }

    if (bin === 'ip') {
      if (args[0] === 'route' || args[0] === 'r') {
        return {
          exitCode: 0,
          output: 'default via 192.168.10.1 dev eth0 proto static\n10.244.0.0/16 via 10.244.0.1 dev cilium_host src 10.244.0.3'
        };
      }
      return {
        exitCode: 0,
        output: '1: lo: <LOOPBACK,UP,LOWER_UP> inet 127.0.0.1/8\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> inet 192.168.10.10/24\n3: cilium_host: <UP,LOWER_UP> inet 10.244.0.3/32'
      };
    }

    if (bin === 'df') {
      return {
        exitCode: 0,
        output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1  100G   18G   82G  18% /\noverlay         100G   18G   82G  18% /var/lib/containerd'
      };
    }

    if (bin === 'free') {
      return {
        exitCode: 0,
        output: '               total        used        free      shared  buff/cache   available\nMem:           16384        3120        9840         120        3424       12980'
      };
    }

    if (bin === 'ps' || bin === 'top') {
      return {
        exitCode: 0,
        output: [
          'PID   USER     TIME  COMMAND',
          '1     root     0:04  /sbin/init',
          '1102  root     1:18  kube-apiserver --authorization-mode=Node,RBAC',
          '1204  root     0:52  containerd',
          '1420  root     1:05  kubelet --container-runtime-endpoint=unix:///run/containerd/containerd.sock'
        ].join('\n')
      };
    }

    if (bin === 'dig' || bin === 'nslookup' || bin === 'ping' || bin === 'curl') {
      const target = args[args.length - 1] || 'kubernetes.default.svc.cluster.local';
      return {
        exitCode: 0,
        output: `Resolved ${target} -> 10.96.0.1 (HTTP 200 OK / 0.4ms RTT)`
      };
    }

    if (bin === 'pwd') {
      return { exitCode: 0, output: '/home/learner' };
    }

    if (bin === 'echo') {
      return { exitCode: 0, output: args.join(' ').replace(/^['"]|['"]$/g, '') };
    }

    if (bin === 'ls') {
      const target = args.find((a) => !a.startsWith('-')) || '/home/learner';
      if (this.vfs) {
        try {
          const files = this.vfs.listDir(target);
          return { exitCode: 0, output: files.join('  ') || '(empty directory)' };
        } catch (e) {
          return { exitCode: 1, output: `ls: cannot access '${target}': ${e.message}` };
        }
      }
      return { exitCode: 0, output: 'manifest.yaml  deployment.yaml  service.yaml' };
    }

    if (bin === 'cat') {
      const target = args.find((a) => !a.startsWith('-'));
      if (target && this.vfs) {
        try {
          const content = this.vfs.readFile(target);
          return { exitCode: 0, output: content };
        } catch (e) {
          return { exitCode: 1, output: `cat: ${target}: ${e.message}` };
        }
      }
      return { exitCode: 0, output: '' };
    }

    if (bin === 'mkdir') {
      const target = args[args.length - 1];
      if (target && this.vfs) {
        try {
          this.vfs.mkdir(target);
          return { exitCode: 0, output: '' };
        } catch (e) {
          return { exitCode: 1, output: `mkdir: cannot create directory '${target}': ${e.message}` };
        }
      }
      return { exitCode: 0, output: '' };
    }

    if (bin === 'rm') {
      const target = args[args.length - 1];
      if (target && this.vfs) {
        try {
          this.vfs.rm(target);
          return { exitCode: 0, output: '' };
        } catch (e) {
          return { exitCode: 1, output: `rm: cannot remove '${target}': ${e.message}` };
        }
      }
      return { exitCode: 0, output: '' };
    }

    return {
      exitCode: 0,
      output: 'Linux kubelabs-control-plane 6.12.0-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
    };
  }

  handleEtcdctl(args) {
    const sub = args[0] || 'endpoint';
    if (sub === 'snapshot') {
      const action = args[1];
      const target = args[2] || '/var/lib/etcd/backup.db';
      if (action === 'save') {
        if (this.vfs) {
          this.vfs.writeFile(target, 'etcd-snapshot-v3.5.15-binary-data');
        }
        return {
          exitCode: 0,
          output: `Snapshot saved at ${target}\n{"hash":1098273645,"revision":34892,"totalKey":4520,"totalSize":26843545}`
        };
      }
      if (action === 'restore') {
        const etcdPods = this.cluster.getResources('Pod', 'kube-system').filter(
          (p) => p.metadata && p.metadata.labels && p.metadata.labels['component'] === 'etcd'
        );
        for (const p of etcdPods) {
          if (p.metadata && p.metadata.labels) {
            delete p.metadata.labels['etcd-unhealthy'];
          }
        }
        this.cluster.reconcile();
        return {
          exitCode: 0,
          output: `2026-11-12 06:00:00.000000 I | etcdmain: restored snapshot ${target} to /var/lib/etcd/default.etcd\nQuorum restored across all etcd members.`
        };
      }
    }
    if (sub === 'endpoint' && args[1] === 'health') {
      return {
        exitCode: 0,
        output: 'https://127.0.0.1:2379 is healthy: successfully committed proposal: took = 1.942ms'
      };
    }
    return {
      exitCode: 0,
      output: 'etcdctl version: 3.5.15\nAPI version: 3.5\nEndpoint: https://127.0.0.1:2379 (healthy)'
    };
  }

  handleKubeadm(args) {
    const sub = args[0];
    if (sub === 'upgrade') {
      const action = args[1] || 'plan';
      if (action === 'plan') {
        return {
          exitCode: 0,
          output: [
            '[upgrade/plan] Components that must be upgraded manually after you have upgraded the control plane with kubeadm upgrade apply:',
            'COMPONENT     CURRENT       AVAILABLE',
            'Kubelet       v1.31.0       v1.32.0',
            '',
            'Upgrade to the latest version in the v1.32 series:',
            'COMPONENT            CURRENT   AVAILABLE',
            'kube-apiserver       v1.31.0   v1.32.0',
            'kube-controller-mgr  v1.31.0   v1.32.0',
            'kube-scheduler       v1.31.0   v1.32.0',
            'kube-proxy           v1.31.0   v1.32.0',
            'CoreDNS              v1.11.1   v1.11.3',
            'etcd                 3.5.14-0  3.5.15-0',
            '',
            'You can now apply the upgrade by executing: kubeadm upgrade apply v1.32.0'
          ].join('\n')
        };
      }
      if (action === 'apply') {
        const ver = args[2] || 'v1.32.0';
        return {
          exitCode: 0,
          output: `[upgrade/apply] SUCCESS! Your cluster was upgraded to "${ver}". Enjoy!`
        };
      }
    }
    if (sub === 'certs') {
      const action = args[1] || 'check-expiration';
      if (action === 'check-expiration') {
        return {
          exitCode: 0,
          output: [
            'CERTIFICATE                EXPIRES                  RESIDUAL TIME   CERTIFICATE AUTHORITY   EXTERNALLY MANAGED',
            'admin.conf                 Nov 11, 2027 05:00 UTC   364d            ca                      no',
            'apiserver                  Nov 11, 2027 05:00 UTC   364d            ca                      no',
            'apiserver-etcd-client      Nov 11, 2027 05:00 UTC   364d            etcd-ca                 no',
            'apiserver-kubelet-client   Nov 11, 2027 05:00 UTC   364d            ca                      no',
            'front-proxy-client         Nov 11, 2027 05:00 UTC   364d            front-proxy-ca          no'
          ].join('\n')
        };
      }
      if (action === 'renew') {
        return {
          exitCode: 0,
          output: '[certs] All certificates have been renewed successfully for 365 days.'
        };
      }
    }
    return { exitCode: 0, output: 'kubeadm version: v1.32.0' };
  }

  handleVelero(args) {
    const sub = args[0] || 'backup';
    if (sub === 'backup') {
      const action = args[1] || 'get';
      if (action === 'create') {
        const name = args[2] || 'cluster-daily-backup';
        return {
          exitCode: 0,
          output: `Backup request "${name}" submitted successfully.\nRun \`velero backup describe ${name}\` or \`velero backup logs ${name}\` for more details.`
        };
      }
      return {
        exitCode: 0,
        output: [
          'NAME                     STATUS      ERRORS   WARNINGS   CREATED                         EXPIRES   STORAGE LOCATION   SELECTOR',
          'cluster-daily-backup     Completed   0        0          2026-11-12 04:00:00 +0000 UTC   29d       default            <none>'
        ].join('\n')
      };
    }
    if (sub === 'restore') {
      const action = args[1] || 'get';
      if (action === 'create') {
        return {
          exitCode: 0,
          output: 'Restore request "cluster-restore-drill" submitted successfully.'
        };
      }
    }
    return { exitCode: 0, output: 'Velero client v1.14.0' };
  }

  handleKyverno(args) {
    const sub = args[0] || 'version';
    if (sub === 'apply' || sub === 'test') {
      return {
        exitCode: 0,
        output: [
          'Applying 1 policy to 3 resources...',
          '(flag) pass: 3, fail: 0, warn: 0, error: 0, skip: 0',
          'Policies validated successfully against Pod Security Standards (Restricted).'
        ].join('\n')
      };
    }
    return { exitCode: 0, output: 'Kyverno CLI Version: v1.12.5' };
  }

  handleVcluster(args) {
    const sub = args[0] || 'list';
    if (sub === 'create') {
      const name = args[1] || 'tenant-alpha';
      return {
        exitCode: 0,
        output: `[INFO] Creating virtual cluster "${name}" in namespace "vcluster-${name}"...\n[SUCCESS] Virtual cluster "${name}" created and ready.`
      };
    }
    if (sub === 'list') {
      return {
        exitCode: 0,
        output: [
          'NAME           NAMESPACE            STATUS    CONNECTED   CREATED',
          'tenant-alpha   vcluster-tenant-a    Running   true        2026-11-12 05:00:00'
        ].join('\n')
      };
    }
    if (sub === 'connect') {
      const name = args[1] || 'tenant-alpha';
      return {
        exitCode: 0,
        output: `Switched kubeconfig context to "vcluster_${name}".`
      };
    }
    return { exitCode: 0, output: 'vcluster version 0.20.0' };
  }

  handleCrossplane(args) {
    return {
      exitCode: 0,
      output: [
        'NAME                                           SYNCED   READY   STATUS',
        'PostgresInstance/fintech-payment-db            True     True    Available',
        '└─ CompositePostgreSQLTable/fintech-table-01   True     True    Available'
      ].join('\n')
    };
  }

  handleFlux(args) {
    const sub = args[0] || 'get';
    if (sub === 'reconcile') {
      const kind = args[1] || 'kustomization';
      const name = args[2] || 'flux-system';
      this.cluster.reconcile();
      return {
        exitCode: 0,
        output: [
          `► annotating ${kind} ${name} in flux-system namespace`,
          `✔ ${kind} annotated`,
          `◎ waiting for ${kind} reconciliation`,
          `✔ ${kind} reconciliation completed -> Applied revision: main@sha1:9a8b7c6d`
        ].join('\n')
      };
    }
    if (sub === 'check') {
      return {
        exitCode: 0,
        output: [
          '► checking prerequisites',
          '✔ Kubernetes 1.32.0 >=1.28.0-0',
          '► checking controllers',
          '✔ helm-controller: deployment ready',
          '✔ kustomize-controller: deployment ready',
          '✔ notification-controller: deployment ready',
          '✔ source-controller: deployment ready',
          '✔ all checks passed'
        ].join('\n')
      };
    }
    return {
      exitCode: 0,
      output: [
        'NAME          REVISION              SUSPENDED   READY   MESSAGE',
        'flux-system   main@sha1:9a8b7c6d    False       True    Applied revision: main@sha1:9a8b7c6d'
      ].join('\n')
    };
  }

  handleServiceMeshCli(bin, args) {
    if (bin === 'linkerd') {
      const sub = args[0] || 'check';
      if (sub === 'viz' || sub === 'stat') {
        const deploys = this.cluster.getResources('Deployment', 'all');
        const rows = deploys.map(
          (d) =>
            `${padRight(d.metadata.name, 22)}${padRight(d.metadata.namespace, 14)}1/1       100.00%   42rps    2ms      9ms`
        );
        return {
          exitCode: 0,
          output: ['NAME                  NAMESPACE     MESHED    SUCCESS   RPS      LATENCY_P50   LATENCY_P99', ...rows].join('\n')
        };
      }
      return {
        exitCode: 0,
        output: [
          'linkerd-core',
          '------------',
          '√ control plane Namespace exists',
          '√ control plane proxies are ready',
          '√ mTLS identity certificates are valid',
          'Status check results are √'
        ].join('\n')
      };
    }
    // consul
    return {
      exitCode: 0,
      output: [
        'Node                  Address          Status  Type    Build   Protocol  DC   Partition',
        'consul-server-0       10.244.0.14:8301 alive   server  1.19.2  2         dc1  default',
        'kubelabs-worker-01    10.244.1.10:8301 alive   client  1.19.2  2         dc1  default'
      ].join('\n')
    };
  }

  handleOpa(bin, args) {
    const sub = args[0] || 'eval';
    const constraints = this.cluster.getResources('K8sRequiredLabels', 'all');
    const templates = this.cluster.getResources('ConstraintTemplate', 'all');
    if (bin === 'conftest' || sub === 'test' || sub === 'eval') {
      return {
        exitCode: 0,
        output: `PASS - ${constraints.length + templates.length + 3} Rego policy assertions verified (0 violations, 0 warnings)`
      };
    }
    return { exitCode: 0, output: 'OPA Gatekeeper / Conftest Rego Engine v0.68.0' };
  }

  handleChaos(bin, args) {
    const action = args[0] || 'status';
    if (action === 'inject' || action === 'pod-delete') {
      const ns = args.includes('-n') ? args[args.indexOf('-n') + 1] : 'default';
      this.cluster.reconcile();
      return {
        exitCode: 0,
        output: `[ChaosEngine] Injected fault experiment in namespace "${ns}". Self-healing ReplicaSet controller reconciled target pods in 180ms.`
      };
    }
    return {
      exitCode: 0,
      output: 'LitmusChaos / ChaosMesh Resilience Engine v3.9.0 - Steady-State Hypothesis: VERIFIED'
    };
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

}


module.exports = {
  TerminalEngine,
  tokenizeCommand,
  parseKubeFlags,
  jqTool,
  opensslTool,
  systemctlTool,
  journalctlTool
};
