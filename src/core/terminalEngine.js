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

let yamlParser;
try {
  yamlParser = require('./yamlParser');
} catch {
  yamlParser = (typeof globalThis !== 'undefined' && globalThis.yamlParser) || {};
}

let cliFormatterModule;
try {
  cliFormatterModule = require('./cliFormatter');
} catch {
  cliFormatterModule = (typeof globalThis !== 'undefined' && globalThis.cliFormatterModule) || {};
}

let GitEngine;
try {
  GitEngine = require('./gitEngine').GitEngine;
} catch {
  GitEngine = (typeof globalThis !== 'undefined' && globalThis.GitEngine);
}

let AutocompletionEngine;
try {
  AutocompletionEngine = require('./autocompletionEngine').AutocompletionEngine;
} catch {
  AutocompletionEngine = (typeof globalThis !== 'undefined' && globalThis.AutocompletionEngine);
}
const formatResourceTable = cliFormatterModule.formatResourceTable || function () { return ''; };
const formatYaml = cliFormatterModule.formatYaml || JSON.stringify;
const formatJson = cliFormatterModule.formatJson || JSON.stringify;
const formatJsonPath = cliFormatterModule.formatJsonPath || function () { return ''; };
const formatDescribeList = cliFormatterModule.formatDescribeList || function () { return ''; };
const formatDescribe = cliFormatterModule.formatDescribe || function () { return ''; };
const KubernetesApiError = cliFormatterModule.KubernetesApiError || Error;
const formatApiError = cliFormatterModule.formatApiError || function (type, details) { return String(details?.message || type); };
const createApiError = cliFormatterModule.createApiError || function (type, details) { return new Error(formatApiError(type, details)); };

function unpackArgs(firstArg, ...rest) {
  if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg)) {
    if (firstArg.argv) {
      return {
        args: (firstArg.argv || []).slice(1),
        stdin: firstArg.stdin || '',
        vfs: firstArg.vfs || null,
        cwd: firstArg.cwd || '/home/learner',
        env: firstArg.env || {},
        driver: firstArg.driver || null
      };
    }
    if (firstArg.args) {
      return {
        args: firstArg.args || [],
        stdin: firstArg.stdin || '',
        vfs: firstArg.vfs || null,
        cwd: firstArg.cwd || '/home/learner',
        env: firstArg.env || {},
        driver: firstArg.driver || null
      };
    }
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

  if (sub === 's_client') {
    let connect = '127.0.0.1:6443';
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '-connect') connect = args[++i] || connect;
    }
    const out = [
      'CONNECTED(00000003)',
      'depth=1 CN = kubernetes-ca',
      'verify return:1',
      'depth=0 CN = kube-apiserver',
      'verify return:1',
      '---',
      'Certificate chain',
      ' 0 s:CN = kube-apiserver',
      '   i:CN = kubernetes-ca',
      '---',
      'Server certificate',
      '-----BEGIN CERTIFICATE-----',
      'MIIDITCCAgmgAwIBAgIIZ1vMOCKCERTIFICATEFORKUBELABSINSPECTION...',
      '-----END CERTIFICATE-----',
      'subject=CN = kube-apiserver',
      'issuer=CN = kubernetes-ca',
      '---',
      'No client certificate CA names sent',
      'Peer signing digest: SHA256',
      'Server Temp Key: X25519, 253 bits',
      '---',
      'SSL handshake has read 1845 bytes and written 432 bytes',
      'Verification: OK',
      '---',
      'New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384',
      'Server public key is 2048 bit',
      'Secure Renegotiation IS NOT supported',
      'Compression: NONE',
      'Expansion: NONE',
      'No ALPN negotiated',
      'Early data was not sent',
      'Verify return code: 0 (ok)',
      '---'
    ];
    return { stdout: out.join('\n') + '\n', stderr: '', code: 0 };
  }

  return { stdout: 'OpenSSL CLI (x509, genrsa, req, s_client, version)\n', stderr: '', code: 0 };
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
  let showLabels = false;
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
    } else if (t === '--show-labels') {
      showLabels = true;
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
    } else if (t.startsWith('--patch=')) {
      patchJson = t.slice('--patch='.length);
    } else if (t.startsWith('-p=')) {
      patchJson = t.slice(3);
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
    showLabels,
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

    const isVirtualCluster = clusterOrOptions && (typeof clusterOrOptions.applyManifest === 'function' || clusterOrOptions.state);
    const extractVfs = (cand) => {
      if (!cand) return null;
      if (typeof cand.normalizePath === 'function') return cand;
      if (cand.vfs && typeof cand.vfs.normalizePath === 'function') return cand.vfs;
      return cand;
    };

    if (isVirtualCluster) {
      cluster = clusterOrOptions;
      vfs = extractVfs(maybeVfs) || extractVfs(clusterOrOptions.vfs) || null;
      graph = clusterOrOptions.graph || null;
    } else if (clusterOrOptions && typeof clusterOrOptions === 'object') {
      cluster = clusterOrOptions.cluster || null;
      vfs = extractVfs(clusterOrOptions.vfs) || extractVfs(maybeVfs) || null;
      graph = clusterOrOptions.graph || null;
      env = clusterOrOptions.env || {};
      history = clusterOrOptions.history || [];
    } else {
      cluster = clusterOrOptions;
      vfs = extractVfs(maybeVfs);
    }

    this.cluster = cluster;
    this.vfs = vfs || (this.cluster && this.cluster.vfs ? this.cluster.vfs : (VirtualFileSystem ? new VirtualFileSystem() : null));
    this.graph = graph || (this.cluster && this.cluster.graph ? this.cluster.graph : (ResourceGraph ? new ResourceGraph() : null));

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

    // Sync initial cluster resources into graph if graph is active
    if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.resources) && this.graph) {
      for (const res of this.cluster.state.resources) {
        try {
          if (typeof this.graph.set === 'function') {
            this.graph.set(res, { skipReconcileNotification: true });
          }
        } catch {}
      }
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
          vfs: this.vfs,
          cluster: this.cluster
        });
        this.multiCli.registerTo(this.pipelineDriver);
      }
      this._registerExtendedBuiltins();
    }

    if (!this.multiCli && MultiCliDispatcher) {
      this.multiCli = new MultiCliDispatcher({
        graph: this.graph,
        vfs: this.vfs,
        cluster: this.cluster
      });
    }

    this.gitEngine = clusterOrOptions?.gitEngine || (this.multiCli && this.multiCli.gitEngine) || (GitEngine ? new GitEngine({ vfs: this.vfs, author: 'Learner <learner@kubelabs.local>' }) : null);

    if (AutocompletionEngine) {
      this.autocompletionEngine = new AutocompletionEngine({
        graph: this.graph,
        vfs: this.vfs,
        cluster: this.cluster,
        pipelineDriver: this.pipelineDriver,
        cwd: this.cwd
      });
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

  _executeHeredoc(commandStr, options = {}) {
    const lines = commandStr.split(/\r?\n/);
    const firstLine = lines[0].trim();

    if (!firstLine.includes('<<')) return null;

    // Pattern matches:
    // cat <<EOF > manifest.yaml
    // cat <<'EOF'>manifest.yaml
    // cat << "EOF" >> /tmp/manifest.yaml
    // cat <<EOF | kubectl apply -f -
    // kubectl apply -f - <<EOF
    // cat <<EOF
    const match = firstLine.match(/<<\s*['"]?([A-Za-z0-9_-]+)['"]?(.*)$/);
    if (!match) return null;

    const delimiter = match[1];
    const remainder = (match[2] || '').trim();

    let redirOp = null;
    let targetFile = null;
    let pipeCommand = null;

    if (remainder.startsWith('>>') || remainder.startsWith('>')) {
      const rm = remainder.match(/^(>>|>)\s*([^\s|]+)/);
      if (rm) {
        redirOp = rm[1];
        targetFile = rm[2].trim();
      }
    } else if (remainder.startsWith('|')) {
      pipeCommand = remainder.slice(1).trim();
    }

    if (!targetFile && !pipeCommand) {
      const rm2 = firstLine.match(/(>>|>)\s*([^\s|]+)$/);
      if (rm2) {
        redirOp = rm2[1];
        targetFile = rm2[2].trim();
      } else if (firstLine.includes('|')) {
        pipeCommand = firstLine.split('|').slice(1).join('|').trim();
      }
    }

    // Collect body lines until delimiter line
    const bodyLines = [];
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === delimiter) {
        break;
      }
      bodyLines.push(l);
    }
    const bodyContent = bodyLines.join('\n');

    // Case A: Pipe to kubectl apply or first line includes kubectl apply
    if ((pipeCommand && pipeCommand.includes('kubectl apply')) || firstLine.includes('kubectl apply')) {
      if (this.cluster && typeof this.cluster.applyManifest === 'function') {
        const applied = this.cluster.applyManifest(bodyContent);
        const out = (applied || [])
          .map((a) => {
            const kind = (a.resource ? a.resource.kind : a.kind || 'resource').toLowerCase();
            const name = a.resource ? a.resource.metadata.name : (a.name || 'item');
            const action = a.action || 'configured';
            return `${kind}/${name} ${action}`;
          })
          .join('\n');
        return {
          exitCode: 0,
          code: 0,
          output: out || 'configured',
          stdout: out || 'configured',
          stderr: '',
          command: commandStr
        };
      }
      if (this.graph && typeof this.graph.apply === 'function') {
        let docs = [];
        try {
          const { parseYamlManifests } = require('./virtualCluster');
          docs = parseYamlManifests(bodyContent);
        } catch {
          docs = [];
        }
        const outputs = [];
        for (const doc of docs) {
          if (doc && doc.kind && doc.metadata && doc.metadata.name) {
            this.graph.apply(doc);
            outputs.push(`${doc.kind.toLowerCase()}/${doc.metadata.name} configured`);
          }
        }
        const out = outputs.join('\n') || 'configured';
        return {
          exitCode: 0,
          code: 0,
          output: out,
          stdout: out,
          stderr: '',
          command: commandStr
        };
      }
    }

    // Case B: Redirection to VFS file (> or >>)
    if (targetFile) {
      if (this.vfs) {
        try {
          if (redirOp === '>>') {
            this.vfs.appendFile(targetFile, bodyContent + '\n');
          } else {
            this.vfs.writeFile(targetFile, bodyContent + '\n');
          }
          return {
            exitCode: 0,
            code: 0,
            output: '',
            stdout: '',
            stderr: '',
            command: commandStr
          };
        } catch (err) {
          return {
            exitCode: 1,
            code: 1,
            output: `sh: ${err.message}\n`,
            stdout: '',
            stderr: `sh: ${err.message}\n`,
            command: commandStr
          };
        }
      }
    }

    // Case C: Standard heredoc output to stdout
    return {
      exitCode: 0,
      code: 0,
      output: bodyContent,
      stdout: bodyContent,
      stderr: '',
      command: commandStr
    };
  }

  execute(rawCommand, options = {}) {
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return { exitCode: 0, code: 0, output: '', stdout: '', stderr: '', command: '' };
    }

    // Multi-line YAML Heredoc execution (cat <<EOF > file.yaml, cat <<EOF | kubectl apply -f -, etc.)
    if (trimmed.includes('<<')) {
      const heredocRes = this._executeHeredoc(trimmed, options);
      if (heredocRes) {
        this.commandHistory.push({ command: trimmed, timestamp: new Date().toISOString() });
        return heredocRes;
      }
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
          const targetPath = this.vfs.normalizePath(targetFile, this.cwd);
          if (op === '>>') {
            this.vfs.appendFile(targetPath, (res.output || '') + '\n');
          } else {
            this.vfs.writeFile(targetPath, (res.output || '') + '\n');
          }
        } catch (e) {
          return { exitCode: 1, output: `sh: ${e.message}`, command: trimmed };
        }
      }
      return { exitCode: res.exitCode, output: '', command: trimmed };
    }

    // Support multi-stage pipeline execution via PipelineDriver
    if (this.pipelineDriver && trimmed.includes('|') && !trimmed.includes('<<')) {
      const res = this.pipelineDriver.execute(trimmed, {
        cwd: this.cwd,
        env: this.env,
        vfs: this.vfs,
        ...options
      });
      this.cwd = this.pipelineDriver.cwd || this.cwd;
      this.env = { ...this.env, ...this.pipelineDriver.env, PWD: this.cwd };
      const out = (res.stdout || '') + (res.stderr || '');
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        code: res.code !== undefined ? res.code : 0,
        output: out.replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        command: trimmed
      };
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
      const code = err.exitCode !== undefined ? err.exitCode : 1;
      const rawMsg = err.message || '';
      let formattedOutput = rawMsg;
      if (
        !rawMsg.startsWith('Error from server') &&
        !rawMsg.startsWith('error:') &&
        !rawMsg.startsWith('The ') &&
        !rawMsg.startsWith('Error:') &&
        !rawMsg.startsWith('bash:') &&
        !rawMsg.startsWith('sh:') &&
        !rawMsg.startsWith('Usage:')
      ) {
        formattedOutput = `error: ${rawMsg}`;
      }
      return {
        exitCode: code,
        code,
        output: formattedOutput,
        stderr: formattedOutput,
        stdout: '',
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
      case 'kustomize':
        return this.handleKustomize(args);
      case 'docker':
      case 'crictl':
        return this.handleDocker(bin, args, options);
      case 'git':
        return this.handleGit(args, options);
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
      case 'k8sgpt':
      case 'aiops':
        return this.handleAiOps(args);
      case 'etcdctl':
        return this.handleEtcdctl(args);
      case 'kubeadm':
        return this.handleKubeadm(args);
      case 'velero':
        return this.handleVelero(args);
      case 'cilium':
        return this.handleCilium(args);
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
      case 'promql':
      case 'promtool':
        return this.handlePromql(bin, args);
      case 'logql':
      case 'logcli':
        return this.handleLogql(bin, args);
      case 'otelcol':
        return this.handleOtelcol(bin, args);
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
      case 'kill':
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
      case 'cp':
      case 'mv':
      case 'cd':
      case 'touch':
      case 'chmod':
      case 'chown':
      case 'ln':
      case 'find':
      case 'env':
      case 'export':
      case 'unshare':
      case 'iptables':
      case 'ip':
      case 'ss':
      case 'ping':
      case 'curl':
      case 'dig':
      case 'nslookup':
      case 'traceroute':
      case 'nc':
      case 'netcat':
      case 'head':
      case 'tail':
      case 'grep':
      case 'awk':
      case 'sed':
      case 'sort':
      case 'uniq':
      case 'wc':
      case 'cut':
      case 'tr':
      case 'tee':
      case 'pvcreate':
      case 'pvs':
      case 'pvdisplay':
      case 'vgcreate':
      case 'vgs':
      case 'vgdisplay':
      case 'lvcreate':
      case 'lvs':
      case 'lvdisplay':
      case 'openssl':
        return this.handleLinuxAndNet(bin, args, options);
      default:
        return {
          exitCode: 127,
          code: 127,
          output: `bash: ${bin}: command not found`,
          stderr: `bash: ${bin}: command not found\n`,
          stdout: ''
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
    if (sub === 'kustomize') {
      if (this.multiCli) {
        const kRes = this.multiCli.handleKustomize({ argv: ['kustomize', 'build', ...(subArgs.length > 0 ? subArgs : ['.'])], cwd: this.cwd, vfs: this.vfs });
        return {
          exitCode: kRes.code !== undefined ? kRes.code : 0,
          output: (kRes.stdout || kRes.stderr || '').replace(/\n$/, '')
        };
      }
    }
    if (sub === 'apply') {
      let manifestText = options.manifestText || '';
      const fIdx = (args || []).indexOf('-f');
      if (fIdx > -1 && args[fIdx + 1] && args[fIdx + 1] !== '-') {
        const filePath = this.vfs ? this.vfs.normalizePath(args[fIdx + 1], this.cwd) : args[fIdx + 1];
        if (this.vfs && this.vfs.exists(filePath)) {
          manifestText = this.vfs.readFile(filePath);
        }
      }
      let kIdx = (args || []).indexOf('-k');
      if (kIdx === -1) kIdx = (args || []).indexOf('--kustomize');
      if (kIdx > -1 && args[kIdx + 1]) {
        const rawKustDir = args[kIdx + 1];
        const kustDir = this.vfs ? this.vfs.normalizePath(rawKustDir, this.cwd) : rawKustDir;
        if (this.multiCli) {
          const kRes = this.multiCli.handleKustomize({ argv: ['kustomize', 'build', kustDir], cwd: this.cwd, vfs: this.vfs });
          if (kRes.code === 0 && kRes.stdout) {
            manifestText = kRes.stdout;
          } else if (kRes.stderr) {
            return { exitCode: 1, output: kRes.stderr.trim() };
          }
        }
      }
      if (manifestText && manifestText.trim()) {
        const applied = this.cluster.applyManifest(manifestText);
        return {
          exitCode: 0,
          output: (applied || [])
            .map((a) => `${(a.resource ? a.resource.kind : a.kind || 'resource').toLowerCase()}/${(a.resource ? a.resource.metadata.name : a.name || 'item')} ${a.action || 'configured'}`)
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
      const rest = subArgs;
      let nodeName = null;
      let force = false;
      let ignoreDaemonSets = false;
      for (const a of rest) {
        if (a === '--force') force = true;
        else if (a.startsWith('--ignore-daemonsets')) ignoreDaemonSets = true;
        else if (!a.startsWith('-') && !nodeName) nodeName = a;
      }
      if (!nodeName) throw new Error('Usage: kubectl drain <node-name> [--force] [--ignore-daemonsets]');
      try {
        this.cluster.drainNode(nodeName, { force, ignoreDaemonSets });
        return { exitCode: 0, output: `node/${nodeName} cordoned\nevicting pods on node "${nodeName}"\nnode/${nodeName} drained` };
      } catch (err) {
        return { exitCode: 1, output: `node/${nodeName} cordoned\nerror: ${err.message}` };
      }
    }
    if (sub === 'taint') {
      const nodeIdx = subArgs[0] === 'nodes' || subArgs[0] === 'node' ? 1 : 0;
      const nodeName = subArgs[nodeIdx];
      const taintExpr = subArgs[nodeIdx + 1];
      if (!nodeName || !taintExpr) throw new Error('Usage: kubectl taint nodes <node-name> <key>=<value>:<effect>');
      if (taintExpr.endsWith('-')) {
        const cleanExpr = taintExpr.slice(0, -1);
        const colonIdx = cleanExpr.indexOf(':');
        const keyPart = colonIdx > -1 ? cleanExpr.slice(0, colonIdx) : cleanExpr;
        const eqIdx = keyPart.indexOf('=');
        const key = eqIdx > -1 ? keyPart.slice(0, eqIdx) : keyPart;
        this.cluster.taintNode(nodeName, key, '', '-');
        return { exitCode: 0, output: `node/${nodeName} untainted` };
      }
      const parts = taintExpr.split(':');
      const effect = parts[1] || 'NoSchedule';
      const kv = parts[0].split('=');
      this.cluster.taintNode(nodeName, kv[0], kv[1] || '', effect);
      return { exitCode: 0, output: `node/${nodeName} tainted` };
    }
    if (sub === 'replace') {
      return this.kubectlReplace(subArgs, flags, options);
    }
    if (sub === 'exec') {
      return this.kubectlExec(subArgs, flags, options);
    }
    if (sub === 'debug') {
      return this.kubectlDebug(subArgs, flags);
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
        throw createApiError('NotFound', { kind: normalizeKind(kind), name });
      }
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()} "${name}" deleted` };
    }

    if (this.multiCli && typeof this.multiCli.handleKubectl === 'function') {
      const cliRes = this.multiCli.handleKubectl({
        argv: ['kubectl', ...args],
        cwd: this.cwd,
        vfs: this.vfs
      });
      if (cliRes && cliRes.code === 0) {
        return {
          exitCode: 0,
          code: 0,
          output: (cliRes.stdout || '').replace(/\n$/, ''),
          stdout: cliRes.stdout || '',
          stderr: cliRes.stderr || ''
        };
      }
    }

    throw new Error(`Unsupported kubectl subcommand "${sub}". Try get, describe, apply, replace, create, scale, set, patch, label, annotate, rollout, autoscale, logs, exec, debug, top, auth, cordon, uncordon, drain, taint, delete.`);
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
        throw createApiError('NotFound', { kind, name: targetName });
      }
    }

    if (flags.output && flags.output.startsWith('jsonpath=')) {
      const expr = flags.output.slice('jsonpath='.length);
      const payload = targetName ? items[0] : items;
      return { exitCode: 0, output: formatJsonPath(payload, expr) };
    }

    if (flags.output === 'json') {
      const payload = targetName ? items[0] : items;
      return { exitCode: 0, output: formatJson(payload) };
    }

    if (flags.output === 'yaml') {
      const payload = targetName ? items[0] : items;
      return { exitCode: 0, output: formatYaml(payload) };
    }

    const output = formatResourceTable(kind, items, {
      allNamespaces: flags.allNamespaces,
      wide: flags.output === 'wide',
      output: flags.output,
      showLabels: flags.showLabels,
      selector: flags.selector,
      namespace: flags.namespace
    });

    return { exitCode: 0, output };
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
      throw createApiError('NotFound', { kind, name: name || '' });
    }

    const events = this.cluster?.state?.events || [];
    const output = formatDescribeList(items, events);
    return { exitCode: 0, output };
  }

  kubectlCreate(subArgs, flags) {
    const rawKind = subArgs[0];
    const name = subArgs[1];
    if (!rawKind || !name) {
      throw new Error('Usage: kubectl create <kind> <name> [options]');
    }
    const kind = normalizeKind(rawKind);

    const existing = this.cluster.getResource(kind, name, flags.namespace);
    if (existing) {
      throw createApiError('AlreadyExists', { kind, name });
    }

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

    if (kind === 'Role') {
      let verbs = ['get', 'list', 'watch'];
      let resources = ['pods'];
      for (const arg of subArgs) {
        if (arg.startsWith('--verb=')) verbs = arg.slice(7).split(',').map((s) => s.trim());
        if (arg.startsWith('--verbs=')) verbs = arg.slice(8).split(',').map((s) => s.trim());
        if (arg.startsWith('--resource=')) resources = arg.slice(11).split(',').map((s) => s.trim());
        if (arg.startsWith('--resources=')) resources = arg.slice(12).split(',').map((s) => s.trim());
      }
      this.cluster.applyResource({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'Role',
        metadata: { name, namespace: flags.namespace },
        rules: [
          {
            apiGroups: [''],
            resources,
            verbs
          }
        ]
      });
      return { exitCode: 0, output: `role.rbac.authorization.k8s.io/${name} created` };
    }

    if (kind === 'RoleBinding') {
      let roleName = name;
      let isClusterRole = false;
      const subjects = [];
      for (const arg of subArgs) {
        if (arg.startsWith('--role=')) {
          roleName = arg.slice(7);
          isClusterRole = false;
        } else if (arg.startsWith('--clusterrole=')) {
          roleName = arg.slice(14);
          isClusterRole = true;
        } else if (arg.startsWith('--serviceaccount=')) {
          const val = arg.slice(17);
          const parts = val.split(':');
          if (parts.length >= 2) {
            subjects.push({ kind: 'ServiceAccount', name: parts[1], namespace: parts[0] });
          } else {
            subjects.push({ kind: 'ServiceAccount', name: val, namespace: flags.namespace });
          }
        } else if (arg.startsWith('--user=')) {
          subjects.push({ kind: 'User', name: arg.slice(7), apiGroup: 'rbac.authorization.k8s.io' });
        } else if (arg.startsWith('--group=')) {
          subjects.push({ kind: 'Group', name: arg.slice(8), apiGroup: 'rbac.authorization.k8s.io' });
        }
      }
      this.cluster.applyResource({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { name, namespace: flags.namespace },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: isClusterRole ? 'ClusterRole' : 'Role',
          name: roleName
        },
        subjects
      });
      return { exitCode: 0, output: `rolebinding.rbac.authorization.k8s.io/${name} created` };
    }

    if (kind === 'ClusterRole') {
      let verbs = ['get', 'list', 'watch'];
      let resources = ['pods'];
      for (const arg of subArgs) {
        if (arg.startsWith('--verb=')) verbs = arg.slice(7).split(',').map((s) => s.trim());
        if (arg.startsWith('--verbs=')) verbs = arg.slice(8).split(',').map((s) => s.trim());
        if (arg.startsWith('--resource=')) resources = arg.slice(11).split(',').map((s) => s.trim());
        if (arg.startsWith('--resources=')) resources = arg.slice(12).split(',').map((s) => s.trim());
      }
      this.cluster.applyResource({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { name },
        rules: [
          {
            apiGroups: ['*'],
            resources,
            verbs
          }
        ]
      });
      return { exitCode: 0, output: `clusterrole.rbac.authorization.k8s.io/${name} created` };
    }

    if (kind === 'ClusterRoleBinding') {
      let roleName = name;
      const subjects = [];
      for (const arg of subArgs) {
        if (arg.startsWith('--clusterrole=') || arg.startsWith('--role=')) {
          roleName = arg.split('=')[1];
        } else if (arg.startsWith('--serviceaccount=')) {
          const val = arg.slice(17);
          const parts = val.split(':');
          if (parts.length >= 2) {
            subjects.push({ kind: 'ServiceAccount', name: parts[1], namespace: parts[0] });
          } else {
            subjects.push({ kind: 'ServiceAccount', name: val, namespace: 'default' });
          }
        } else if (arg.startsWith('--user=')) {
          subjects.push({ kind: 'User', name: arg.slice(7), apiGroup: 'rbac.authorization.k8s.io' });
        } else if (arg.startsWith('--group=')) {
          subjects.push({ kind: 'Group', name: arg.slice(8), apiGroup: 'rbac.authorization.k8s.io' });
        }
      }
      this.cluster.applyResource({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: { name },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
          name: roleName
        },
        subjects
      });
      return { exitCode: 0, output: `clusterrolebinding.rbac.authorization.k8s.io/${name} created` };
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

  kubectlReplace(subArgs, flags, options = {}) {
    let manifestText = options.manifestText || '';
    const fIdx = (subArgs || []).indexOf('-f');
    if (fIdx > -1 && subArgs[fIdx + 1] && subArgs[fIdx + 1] !== '-') {
      const filePath = subArgs[fIdx + 1];
      if (this.vfs && this.vfs.exists(filePath)) {
        manifestText = this.vfs.readFile(filePath);
      } else {
        throw new Error(`error: the path "${filePath}" does not exist`);
      }
    } else if (fIdx > -1 && subArgs[fIdx + 1] === '-') {
      manifestText = options.stdin || '';
    }

    if (!manifestText || !manifestText.trim()) {
      throw new Error('Provide YAML manifest via -f <file> or stdin to replace.');
    }

    const force = (subArgs || []).includes('--force');
    let parsedDocs = [];
    if (yamlParser && typeof yamlParser.parseAllYaml === 'function') {
      parsedDocs = yamlParser.parseAllYaml(manifestText);
    } else if (yamlParser && typeof yamlParser.parseYaml === 'function') {
      parsedDocs = [yamlParser.parseYaml(manifestText)];
    } else {
      parsedDocs = [JSON.parse(manifestText)];
    }

    if (!parsedDocs || parsedDocs.length === 0) {
      throw new Error('error: no valid resources found in manifest');
    }

    const outputs = [];
    for (const doc of parsedDocs) {
      if (!doc || !doc.kind) continue;
      const kind = normalizeKind(doc.kind);
      const name = doc.metadata?.name;
      const docNs = doc.metadata?.namespace || flags.namespace || 'default';
      if (!name) throw new Error('error: resource name not specified in manifest');

      const existing = this.cluster.getResource(kind, name, docNs);
      if (!existing) {
        throw createApiError('NotFound', { kind, name });
      }

      if (force) {
        this.cluster.deleteResource(kind, name, docNs);
        this.cluster.applyResource(doc);
      } else {
        existing.spec = JSON.parse(JSON.stringify(doc.spec || {}));
        existing.metadata = existing.metadata || {};
        existing.metadata.labels = JSON.parse(JSON.stringify(doc.metadata?.labels || {}));
        existing.metadata.annotations = JSON.parse(JSON.stringify(doc.metadata?.annotations || {}));
        this.cluster.reconcile();
      }
      outputs.push(`${normalizeKind(kind).toLowerCase()}/${name} replaced`);
    }

    return { exitCode: 0, output: outputs.join('\n') };
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

    if (setType === 'selector') {
      let kind = 'Service';
      let name = subArgs[1];
      let assignToken = subArgs[2];
      if (name && name.includes('/')) {
        const parts = name.split('/');
        kind = parts[0];
        name = parts[1];
      } else if (subArgs.length >= 4 && !subArgs[2].includes('=')) {
        kind = subArgs[1];
        name = subArgs[2];
        assignToken = subArgs[3];
      }
      if (!assignToken || !assignToken.includes('=')) {
        throw new Error('Usage: kubectl set selector <type>/<name> <key>=<val>');
      }
      const [k, v] = assignToken.split('=');
      const res = this.cluster.getResource(kind, name, flags.namespace);
      if (!res) throw createApiError('NotFound', { kind: normalizeKind(kind), name });
      if (normalizeKind(kind) === 'Service') {
        res.spec = res.spec || {};
        res.spec.selector = res.spec.selector || {};
        res.spec.selector[k] = v;
      } else {
        res.spec = res.spec || {};
        res.spec.selector = res.spec.selector || {};
        res.spec.selector.matchLabels = res.spec.selector.matchLabels || {};
        res.spec.selector.matchLabels[k] = v;
        if (res.spec.template?.metadata?.labels) {
          res.spec.template.metadata.labels[k] = v;
        }
      }
      this.cluster.reconcile();
      return { exitCode: 0, output: `${normalizeKind(kind).toLowerCase()}/${name} selector updated` };
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
    let patchObj;
    try {
      patchObj = JSON.parse(flags.patchJson);
    } catch {
      try {
        const relaxed = flags.patchJson.replace(/([{,]\s*)([a-zA-Z0-9_-]+)\s*:/g, '$1"$2":');
        patchObj = JSON.parse(relaxed);
      } catch {
        throw new Error(`invalid patch payload: ${flags.patchJson}`);
      }
    }
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
      const token = subArgs[i];
      if (token === '--overwrite' || token.startsWith('--')) continue;
      if (token.endsWith('-')) {
        delete res.metadata.labels[token.slice(0, -1)];
      } else if (token.includes('=')) {
        const [k, v] = token.split('=');
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
      const token = subArgs[i];
      if (token === '--overwrite' || token.startsWith('--')) continue;
      if (token.endsWith('-')) {
        delete res.metadata.annotations[token.slice(0, -1)];
      } else if (token.includes('=')) {
        const eq = token.indexOf('=');
        res.metadata.annotations[token.slice(0, eq)] = token.slice(eq + 1);
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

    if (action === 'history') {
      return {
        exitCode: 0,
        output: `${normalizeKind(kind).toLowerCase()}.apps/${name}\nREVISION  CHANGE-CAUSE\n1         <none>\n2         kubectl set image ...`
      };
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
    let target = '';
    let container = null;
    let tail = null;

    for (let i = 0; i < subArgs.length; i++) {
      const a = subArgs[i];
      if (a === '-c' || a === '--container') container = subArgs[++i];
      else if (a.startsWith('-c=') || a.startsWith('--container=')) container = a.split('=')[1];
      else if (a === '--tail') tail = parseInt(subArgs[++i], 10);
      else if (a.startsWith('--tail=')) tail = parseInt(a.split('=')[1], 10);
      else if (!a.startsWith('-') && !target) target = a;
    }

    if (!target) {
      throw new Error('error: pod name required for logs');
    }

    const pods = this.cluster.getResources('Pod', flags.namespace);
    const pod = pods.find((p) => p.metadata.name === target || p.metadata.name.startsWith(target.replace(/^deploy(ment)?\//, '')));
    if (!pod) {
      throw new Error(`Error from server (NotFound): pods "${target}" not found`);
    }
    if (pod.status && pod.status.reason && pod.status.reason !== 'Running') {
      return {
        exitCode: 0,
        output: `[ERROR] ${new Date().toISOString()} Container failed startup check: ${pod.status.reason} - ${pod.status.message || 'Error'}`
      };
    }
    const cName = container || pod.spec?.containers?.[0]?.name || pod.metadata.name;
    const now = new Date().toISOString();
    const logLines = [
      `[INFO] ${now} Starting ${pod.metadata.name} (container: ${cName})...`,
      `[INFO] ${now} Listening on port 8080`,
      `[INFO] ${now} Health check probe succeeded on /healthz`,
      `[INFO] ${now} Serving requests in namespace ${flags.namespace}`
    ];
    const outputLines = tail ? logLines.slice(-tail) : logLines;
    return {
      exitCode: 0,
      output: outputLines.join('\n')
    };
  }

  kubectlExec(subArgs, flags, options = {}) {
    let podTarget = '';
    let container = null;
    const dDash = subArgs.indexOf('--');
    const flagArgs = dDash !== -1 ? subArgs.slice(0, dDash) : subArgs;
    const cmdTokens = dDash !== -1 ? subArgs.slice(dDash + 1) : ['sh'];

    for (let i = 0; i < flagArgs.length; i++) {
      const a = flagArgs[i];
      if (a === '-c' || a === '--container') container = flagArgs[++i];
      else if (a.startsWith('-c=') || a.startsWith('--container=')) container = a.split('=')[1];
      else if (a === '-it' || a === '-i' || a === '-t') { /* tty flags */ }
      else if (!a.startsWith('-') && !podTarget) podTarget = a;
    }

    if (!podTarget) {
      throw new Error('Usage: kubectl exec [flags] <pod-name> -- <command>');
    }
    const podName = podTarget.includes('/') ? podTarget.split('/')[1] : podTarget;
    const pod = this.cluster.getResource('Pod', podName, flags.namespace);
    if (!pod) {
      throw createApiError('NotFound', { kind: 'Pod', name: podName });
    }

    const phase = pod.status?.phase || 'Running';
    if (phase !== 'Running') {
      throw new Error(`error: unable to upgrade connection: container not running (pod phase is ${phase})`);
    }

    const cmd = cmdTokens.join(' ');
    const bin = cmdTokens[0] || 'sh';

    if (bin === 'hostname') {
      return { exitCode: 0, output: podName };
    }
    if (bin === 'whoami') {
      return { exitCode: 0, output: 'root' };
    }
    if (bin === 'id') {
      return { exitCode: 0, output: 'uid=0(root) gid=0(root) groups=0(root)' };
    }
    if (bin === 'uname' || cmd.startsWith('uname')) {
      return { exitCode: 0, output: `Linux ${podName} 6.8.0-cloud-native #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux` };
    }
    if (cmd === 'cat /etc/os-release') {
      return {
        exitCode: 0,
        output: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.0\nPRETTY_NAME="Alpine Linux v3.20"'
      };
    }
    if (bin === 'env') {
      const envLines = [`HOSTNAME=${podName}`, 'SHLVL=1', 'HOME=/root', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'];
      const containers = pod.spec?.containers || [];
      for (const c of containers) {
        for (const e of c.env || []) {
          envLines.push(`${e.name}=${e.value}`);
        }
      }
      return { exitCode: 0, output: envLines.join('\n') };
    }
    if (bin === 'ls') {
      return { exitCode: 0, output: 'bin  dev  etc  home  lib  proc  root  sys  tmp  usr  var' };
    }
    if (bin === 'echo') {
      const echoText = cmdTokens.slice(1).join(' ').replace(/^['"]|['"]$/g, '');
      return { exitCode: 0, output: echoText };
    }
    if (bin === 'curl') {
      return { exitCode: 0, output: 'HTTP/1.1 200 OK\nContent-Type: text/plain\n\nOK' };
    }

    return { exitCode: 0, output: `[pod ${podName}] ${cmd} completed successfully` };
  }

  kubectlDebug(subArgs, flags) {
    const rawTarget = subArgs[0] || '';
    if (!rawTarget) {
      throw new Error('Usage: kubectl debug <node|pod>/<name> [--image=<image>]');
    }
    let kind = 'Pod';
    let name = rawTarget;
    if (rawTarget.includes('/')) {
      const parts = rawTarget.split('/');
      kind = normalizeKind(parts[0]);
      name = parts[1];
    } else if (subArgs.length >= 2 && !subArgs[1].startsWith('-')) {
      kind = normalizeKind(subArgs[0]);
      name = subArgs[1];
    }

    let image = 'busybox:latest';
    for (const a of subArgs) {
      if (a.startsWith('--image=')) image = a.split('=')[1];
    }

    if (kind === 'Pod') {
      const pod = this.cluster.getResource('Pod', name, flags.namespace);
      if (!pod) throw createApiError('NotFound', { kind: 'Pod', name });
      pod.spec = pod.spec || {};
      pod.spec.ephemeralContainers = pod.spec.ephemeralContainers || [];
      pod.spec.ephemeralContainers.push({
        name: 'debugger',
        image,
        stdin: true,
        tty: true
      });
      this.cluster.reconcile();
      return {
        exitCode: 0,
        output: 'Targeting container "debugger". If you don\'t see a command prompt, try pressing enter.'
      };
    }

    if (kind === 'Node') {
      const node = this.cluster.getResource('Node', name);
      if (!node) throw createApiError('NotFound', { kind: 'Node', name });
      const debugPodName = `node-debugger-${name.slice(0, 10)}`;
      this.cluster.applyResource({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: debugPodName, namespace: flags.namespace || 'kube-system' },
        spec: {
          nodeName: name,
          hostPID: true,
          hostNetwork: true,
          containers: [{ name: 'debugger', image }]
        },
        status: { phase: 'Running', ready: '1/1' }
      });
      return {
        exitCode: 0,
        output: `Creating debugging pod ${debugPodName} with container debugger on node ${name}.`
      };
    }

    return { exitCode: 0, output: `Debugging started for ${rawTarget}` };
  }

  kubectlTop(subArgs, flags) {
    const target = subArgs[0] || 'pods';
    if (target.startsWith('no')) {
      const targetNode = subArgs[1] || (target.includes('/') ? target.split('/')[1] : null);
      let rows = [
        ['kubelabs-control-plane', '310m', '7%', '1420Mi', '17%'],
        ['kubelabs-worker-01', '640m', '8%', '3120Mi', '19%'],
        ['kubelabs-worker-gpu-02', '890m', '11%', '6400Mi', '20%']
      ];
      if (this.cluster) {
        const liveNodes = this.cluster.getResources('Node');
        if (liveNodes.length > 0) {
          rows = liveNodes.map((n, idx) => [
            n.metadata?.name || `node-${idx}`,
            `${250 + (idx * 80)}m`,
            `${7 + (idx * 3)}%`,
            `${1420 + (idx * 500)}Mi`,
            `${17 + (idx * 5)}%`
          ]);
        }
      }
      if (targetNode) {
        rows = rows.filter((r) => r[0] === targetNode);
        if (rows.length === 0) {
          throw createApiError('NotFound', { kind: 'Node', name: targetNode });
        }
      }
      const formatted = [
        'NAME                      CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%',
        ...rows.map((r) => `${padRight(r[0], 26)}${padRight(r[1], 13)}${padRight(r[2], 7)}${padRight(r[3], 16)}${r[4]}`)
      ].join('\n');
      return { exitCode: 0, output: formatted };
    }

    const nsQuery = flags.allNamespaces ? 'all' : flags.namespace;
    const targetPod = subArgs[1] || (target.includes('/') ? target.split('/')[1] : null);
    let pods = this.cluster.getResources('Pod', nsQuery);
    if (targetPod) {
      pods = pods.filter((p) => p.metadata?.name === targetPod);
      if (pods.length === 0) {
        throw createApiError('NotFound', { kind: 'Pod', name: targetPod });
      }
    }

    if (flags.allNamespaces) {
      const rows = pods.map((p) => `${padRight(p.metadata?.namespace || 'default', 14)}${padRight(p.metadata?.name, 34)}45m          128Mi`);
      return {
        exitCode: 0,
        output: ['NAMESPACE     NAME                              CPU(cores)   MEMORY(bytes)', ...rows].join('\n')
      };
    }

    const rows = pods.map((p) => `${padRight(p.metadata?.name, 34)}45m          128Mi`);
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

  handleKustomize(args) {
    if (this.multiCli) {
      const res = this.multiCli.handleKustomize({ argv: ['kustomize', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }
    return { exitCode: 0, output: '{Version:kustomize/v5.4.3}' };
  }

  handleHelm(args) {
    if (this.multiCli) {
      const res = this.multiCli.handleHelm({ argv: ['helm', ...args], cwd: this.cwd, vfs: this.vfs });
      if (this.cluster && this.cluster.state && Array.isArray(this.multiCli.helmReleases)) {
        this.cluster.state.helmReleases = this.multiCli.helmReleases;
      }
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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

  handleDocker(bin, args, options = {}) {
    if (this.multiCli) {
      const handler = bin === 'crictl' ? this.multiCli.handleCrictl.bind(this.multiCli) : this.multiCli.handleDocker.bind(this.multiCli);
      const res = handler({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs });
      // Synchronize container state into cluster.state.containers if cluster exists
      if (this.cluster && this.cluster.state && Array.isArray(this.multiCli.simulatedContainers)) {
        this.cluster.state.containers = this.multiCli.simulatedContainers.map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image,
          status: c.status,
          ports: c.ports,
          rootless: true
        }));
      }
      const out = (res.stdout || '') + (res.stderr || '');
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        code: res.code !== undefined ? res.code : 0,
        output: out.replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || ''
      };
    }

    const sub = args[0] || 'ps';
    if (sub === 'ps') {
      const rows = (this.cluster?.state?.containers || []).map(
        (c) => `${padRight(c.id, 16)}${padRight(c.image, 28)}${padRight(c.status, 16)}${padRight(c.ports, 14)}${c.name}`
      );
      return {
        exitCode: 0,
        output: ['CONTAINER ID    IMAGE                       STATUS          PORTS         NAMES', ...rows].join('\n')
      };
    }
    return { exitCode: 0, output: `${bin} ${sub} ready` };
  }

  handleGit(args, options = {}) {
    if (!this.gitEngine) {
      if (GitEngine) {
        this.gitEngine = new GitEngine({ vfs: this.vfs, author: 'Learner <learner@kubelabs.local>' });
      } else if (this.multiCli && this.multiCli.gitEngine) {
        this.gitEngine = this.multiCli.gitEngine;
      }
    }
    if (!this.gitEngine) {
      return { exitCode: 1, code: 1, output: 'fatal: git engine unavailable', stdout: '', stderr: 'fatal: git engine unavailable\n' };
    }
    const res = this.gitEngine.execute(args, { vfs: this.vfs, cwd: this.cwd, ...options });
    const output = (res.stdout || '') + (res.stderr || '');
    return {
      exitCode: res.code !== undefined ? res.code : 0,
      code: res.code !== undefined ? res.code : 0,
      output: output.replace(/\n$/, ''),
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      ...res
    };
  }

  handleArgoCD(args) {
    if (this.multiCli) {
      const res = this.multiCli.handleArgoCD({ argv: ['argocd', ...args], cwd: this.cwd, vfs: this.vfs });
      if (this.cluster && this.cluster.state && Array.isArray(this.multiCli.argocdApps)) {
        this.cluster.state.argoApps = this.multiCli.argocdApps;
      }
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      const res = this.multiCli.handleIstioctl({ argv: ['istioctl', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      const res = this.multiCli.handleTofu({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs });
      if (this.cluster && this.cluster.state && this.cluster.state.terraformState) {
        this.cluster.state.terraformState.resources = this.multiCli.tofuResources;
      }
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      const res = this.multiCli.handleAws({ argv: ['aws', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      const res = this.multiCli.handleAzure({ argv: ['az', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      const res = this.multiCli.handleGcloud({ argv: ['gcloud', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (this.multiCli) {
      let res;
      if (bin === 'trivy') res = this.multiCli.handleTrivy({ argv: ['trivy', ...args], cwd: this.cwd, vfs: this.vfs });
      else if (bin === 'falco') res = this.multiCli.handleFalco({ argv: ['falco', ...args], cwd: this.cwd, vfs: this.vfs });
      else if (bin === 'cosign') res = this.multiCli.handleCosign({ argv: ['cosign', ...args], cwd: this.cwd, vfs: this.vfs });
      if (res) {
        return {
          exitCode: res.code !== undefined ? res.code : 0,
          output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
          stdout: res.stdout || '',
          stderr: res.stderr || '',
          ...res
        };
      }
    }

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
    if (sub !== 'remediate' && this.multiCli) {
      const res = this.multiCli.handleK8sGPT({ argv: ['k8sgpt', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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

  handleLinuxAndNet(bin, args, options = {}) {
    if (!this.multiCli && MultiCliDispatcher) {
      this.multiCli = new MultiCliDispatcher({
        graph: this.graph,
        vfs: this.vfs
      });
    }

    if (this.multiCli) {
      const argv = [bin, ...args];
      let res;
      switch (bin) {
        case 'ls':
          res = this.multiCli.handleLs({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'cd':
          res = this.multiCli.handleCd({ argv, cwd: this.cwd, vfs: this.vfs, env: this.env });
          if (res.cwd) {
            this.cwd = res.cwd;
            this.env.PWD = res.cwd;
            if (this.pipelineDriver) this.pipelineDriver.cwd = res.cwd;
          }
          break;
        case 'pwd':
          res = this.multiCli.handlePwd({ cwd: this.cwd });
          break;
        case 'cat':
          res = this.multiCli.handleCat({ argv, stdin: options.stdin || '', cwd: this.cwd, vfs: this.vfs });
          break;
        case 'mkdir':
          res = this.multiCli.handleMkdir({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'rm':
          res = this.multiCli.handleRm({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'cp':
          res = this.multiCli.handleCp({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'mv':
          res = this.multiCli.handleMv({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'chmod':
          res = this.multiCli.handleChmod({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'chown':
          res = this.multiCli.handleChown({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'ln':
          res = this.multiCli.handleLn({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'find':
          res = this.multiCli.handleFind({ argv, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'touch':
          res = this._handleTouch({ args, cwd: this.cwd });
          break;
        case 'env':
          res = this.multiCli.handleEnv({ env: this.env });
          break;
        case 'export':
          res = this.multiCli.handleExport({ argv, env: this.env });
          break;
        case 'echo':
          res = this.multiCli.handleEcho({ argv });
          break;
        case 'systemctl':
          res = this.multiCli.handleSystemctl({ argv });
          if (this.cluster && this.cluster.state) {
            const action = args[0] || 'status';
            const unit = (args[1] || 'kubelet').replace(/\.service$/, '');
            if (action === 'restart' || action === 'start' || action === 'enable') {
              this.cluster.state.systemdUnits[unit] = { active: 'active', enabled: true, description: `Hardened ${unit} daemon` };
              if (unit === 'kubelet' || unit === 'containerd') {
                const nodes = this.cluster.getResources('Node');
                for (const node of nodes) {
                  node.status = node.status || {};
                  if (node.status.phase === 'NotReady') node.status.phase = 'Ready';
                }
                this.cluster.reconcile();
              }
            } else if (action === 'stop' || action === 'disable') {
              this.cluster.state.systemdUnits[unit] = { active: 'inactive', enabled: false, description: `Stopped ${unit} daemon` };
              if (unit === 'kubelet') {
                const nodes = this.cluster.getResources('Node');
                for (const node of nodes) {
                  node.status = node.status || {};
                  node.status.phase = 'NotReady';
                }
              }
            }
          }
          break;
        case 'journalctl':
          res = this.multiCli.handleJournalctl({ argv });
          break;
        case 'sysctl':
          res = this.multiCli.handleSysctl({ argv });
          if (this.cluster && this.cluster.state && args[0] === '-w' && args[1] && args[1].includes('=')) {
            const [k, v] = args[1].split('=');
            this.cluster.state.sysctls[k.trim()] = v.trim();
          }
          break;
        case 'unshare':
          res = this.multiCli.handleUnshare({ argv });
          break;
        case 'kill':
          res = this.multiCli.handleKill({ argv });
          break;
        case 'iptables':
          res = this.multiCli.handleIptables({ argv });
          break;
        case 'ip':
          res = this.multiCli.handleIp({ argv });
          break;
        case 'ss':
          res = this.multiCli.handleSs({ argv });
          break;
        case 'nc':
        case 'netcat':
          res = this.multiCli.handleNc({ argv });
          break;
        case 'dig':
          res = this.multiCli.handleDig({ argv });
          break;
        case 'nslookup':
          res = this.multiCli.handleNslookup({ argv });
          break;
        case 'curl':
          res = this.multiCli.handleCurl({ argv });
          break;
        case 'ping':
          res = this.multiCli.handlePing({ argv });
          break;
        case 'traceroute':
          res = this.multiCli.handleTraceroute({ argv });
          break;
        case 'ps':
        case 'top':
          res = this.multiCli.handlePs({ argv });
          break;
        case 'df':
          res = this.multiCli.handleDf({ argv });
          break;
        case 'free':
          res = this.multiCli.handleFree({ argv });
          break;
        case 'uname':
          res = this.multiCli.handleUname({ argv });
          break;
        case 'whoami':
          res = { stdout: 'learner\n', stderr: '', code: 0 };
          break;
        case 'id':
          res = { stdout: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo),999(docker)\n', stderr: '', code: 0 };
          break;
        case 'pvcreate':
          res = this.multiCli.handlePvcreate({ argv });
          break;
        case 'pvs':
        case 'pvdisplay':
          res = this.multiCli.handlePvs();
          break;
        case 'vgcreate':
          res = this.multiCli.handleVgcreate({ argv });
          break;
        case 'vgs':
        case 'vgdisplay':
          res = this.multiCli.handleVgs();
          break;
        case 'lvcreate':
          res = this.multiCli.handleLvcreate({ argv });
          break;
        case 'lvs':
        case 'lvdisplay':
          res = this.multiCli.handleLvs();
          break;
        case 'openssl':
          res = opensslTool({ args, cwd: this.cwd, vfs: this.vfs });
          break;
        case 'head':
        case 'tail':
        case 'grep':
        case 'awk':
        case 'sed':
        case 'sort':
        case 'uniq':
        case 'wc':
        case 'cut':
        case 'tr':
        case 'tee':
          if (this.pipelineDriver) {
            res = this.pipelineDriver.execute([bin, ...args].join(' '), { cwd: this.cwd, env: this.env, vfs: this.vfs, ...options });
          } else {
            res = { stdout: '', stderr: '', code: 0 };
          }
          break;
        default:
          res = { stdout: 'Linux kubelabs-node 6.8.0-40-generic x86_64 GNU/Linux\n', stderr: '', code: 0 };
      }

      const out = (res.stdout || '') + (res.stderr || '');
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        code: res.code !== undefined ? res.code : 0,
        output: out.replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || ''
      };
    }

    return {
      exitCode: 0,
      output: 'Linux kubelabs-control-plane 6.12.0-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
    };
  }

  handleEtcdctl(args) {
    const sub = args[0] || 'endpoint';
    if (sub === 'defrag') {
      return {
        exitCode: 0,
        output: 'Finished defragmenting etcd member[https://127.0.0.1:2379]'
      };
    }
    if (sub === 'compact') {
      const rev = args[1] || '5000';
      return {
        exitCode: 0,
        output: `compacted revision ${rev}`
      };
    }
    if (sub === 'snapshot') {
      const action = args[1];
      const target = args[2] || '/var/lib/etcd/backup.db';
      if (action === 'status') {
        return {
          exitCode: 0,
          output: [
            'HASH       REVISION   TOTAL KEYS   TOTAL SIZE',
            '41fa2a87   34892      4520         26 MB'
          ].join('\n')
        };
      }
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
    if (sub === 'member' && (args[1] === 'list' || !args[1])) {
      return {
        exitCode: 0,
        output: 'b07e1c841a029f12, started, kubelabs-control-plane, https://192.168.1.10:2380, https://192.168.1.10:2379, false'
      };
    }
    if (sub === 'endpoint') {
      const action = args[1] || 'health';
      if (action === 'status') {
        return {
          exitCode: 0,
          output: [
            'ENDPOINT                 ID                 VERSION   DB SIZE   IS LEADER   IS LEARNER   RAFT TERM   RAFT INDEX   RAFT APPLIED INDEX   ERRORS',
            'https://127.0.0.1:2379   b07e1c841a029f12   3.5.15    28 MB     true        false        4           34892        34892                '
          ].join('\n')
        };
      }
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
    if (sub === 'init') {
      if (this.vfs) {
        this.vfs.mkdir('/etc/kubernetes/pki');
        this.vfs.mkdir('/etc/kubernetes/manifests');
        this.vfs.mkdir('/home/learner/.kube');
        this.vfs.writeFile('/etc/kubernetes/admin.conf', 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\n');
        this.vfs.writeFile('/home/learner/.kube/config', 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://192.168.1.10:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\n');
      }
      if (this.cluster) {
        const nodes = this.cluster.getResources('Node');
        const cp = nodes.find((n) => n.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined) || nodes[0];
        if (cp) {
          cp.metadata.labels = cp.metadata.labels || {};
          cp.metadata.labels['node-role.kubernetes.io/control-plane'] = '';
          this.cluster.reconcile();
        }
      }
      return {
        exitCode: 0,
        output: [
          '[init] Using Kubernetes version: v1.31.0',
          '[preflight] Running pre-flight checks',
          '[certs] Generating "ca" certificate and key',
          '[certs] Generating "apiserver" certificate and key',
          '[certs] apiserver serving cert is signed for DNS names [kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local kubelabs-control-plane] and IPs [10.96.0.1 192.168.1.10]',
          '[certs] Generating "apiserver-kubelet-client" certificate and key',
          '[certs] Generating "front-proxy-ca" certificate and key',
          '[certs] Generating "front-proxy-client" certificate and key',
          '[certs] Generating "etcd/ca" certificate and key',
          '[certs] Generating "etcd/server" certificate and key',
          '[certs] Generating "etcd/peer" certificate and key',
          '[certs] Generating "etcd/healthcheck-client" certificate and key',
          '[certs] Generating "apiserver-etcd-client" certificate and key',
          '[certs] Generating "sa" key and public key',
          '[kubeconfig] Writing "admin.conf" kubeconfig file',
          '[kubeconfig] Writing "kubelet.conf" kubeconfig file',
          '[kubeconfig] Writing "controller-manager.conf" kubeconfig file',
          '[kubeconfig] Writing "scheduler.conf" kubeconfig file',
          '[control-plane] Using manifest folder "/etc/kubernetes/manifests"',
          '[control-plane] Creating static Pod manifest for "kube-apiserver"',
          '[control-plane] Creating static Pod manifest for "kube-controller-manager"',
          '[control-plane] Creating static Pod manifest for "kube-scheduler"',
          '[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"',
          '[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods',
          '[apiclient] All control plane components are healthy after 5.001 seconds',
          '[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace',
          '[kubelet] Creating a ConfigMap "kubelet-config" in namespace kube-system with the configuration for the kubelets in the cluster',
          '[mark-control-plane] Marking the node as control-plane by adding the labels: [node-role.kubernetes.io/control-plane]',
          '[addons] Applied Essential Addon: CoreDNS',
          '[addons] Applied Essential Addon: kube-proxy',
          '',
          'Your Kubernetes control-plane has initialized successfully!',
          '',
          'To start using your cluster, you need to run the following as a regular user:',
          '',
          '  mkdir -p $HOME/.kube',
          '  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config',
          '  sudo chown $(id -u):$(id -g) $HOME/.kube/config',
          '',
          'Then you can join any number of worker nodes by running the following on each as root:',
          '',
          'kubeadm join 192.168.1.10:6443 --token 9a01ea.8018e4a547741478 \\',
          '    --discovery-token-ca-cert-hash sha256:7c4a16198f121175654ebd310061e89df95b35c023d6a69efee52220d9f67a21'
        ].join('\n')
      };
    }

    if (sub === 'join') {
      const endpoint = args[1] || '192.168.1.10:6443';
      if (this.cluster) {
        const workerNode = this.cluster.getResource('Node', 'kubelabs-worker-01');
        if (workerNode) {
          workerNode.status = workerNode.status || {};
          workerNode.status.conditions = [{ type: 'Ready', status: 'True', reason: 'KubeletReady' }];
          this.cluster.reconcile();
        }
      }
      return {
        exitCode: 0,
        output: [
          `[preflight] Running pre-flight checks to ${endpoint}`,
          '[preflight] Reading configuration from the cluster...',
          '[preflight] FYI: You can look at this config file with \'kubectl -n kube-system get cm kubeadm-config -o yaml\'',
          '[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"',
          '[kubelet-start] Starting the kubelet',
          '[kubelet-check] Waiting for a healthy kubelet. This can take up to 4m0s',
          '[kubelet-check] The kubelet is healthy after 1.502s',
          '',
          'This node has joined the cluster:',
          '* Certificate signing request was sent to apiserver and a response was received.',
          '* The Kubelet was informed of the new secure connection details.',
          '',
          'Run \'kubectl get nodes\' on the control-plane to see this node join the cluster.'
        ].join('\n')
      };
    }

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

    if (sub === 'token') {
      const action = args[1] || 'list';
      if (action === 'list') {
        return {
          exitCode: 0,
          output: [
            'TOKEN                     TTL         EXPIRES                USAGES                   DESCRIPTION                                                EXTRA GROUPS',
            '9a01ea.8018e4a547741478   23h         2026-11-14T16:00:00Z   authentication,signing   The default bootstrap token generated by \'kubeadm init\'.   system:bootstrappers:kubeadm:default-node-token'
          ].join('\n')
        };
      }
      if (action === 'create') {
        const printJoin = args.includes('--print-join-command');
        const token = '9a01ea.8018e4a547741478';
        if (printJoin) {
          return {
            exitCode: 0,
            output: `kubeadm join 192.168.1.10:6443 --token ${token} --discovery-token-ca-cert-hash sha256:7c4a16198f121175654ebd310061e89df95b35c023d6a69efee52220d9f67a21`
          };
        }
        return { exitCode: 0, output: token };
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
    if (this.multiCli) {
      const res = this.multiCli.handleVelero({ argv: ['velero', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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

  handleCilium(args) {
    if (this.multiCli) {
      const res = this.multiCli.handleCilium({ argv: ['cilium', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }
    return { exitCode: 0, output: 'Cilium CLI v1.16.4' };
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
    if (this.multiCli) {
      const res = this.multiCli.handleFlux({ argv: ['flux', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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
    if (bin === 'linkerd' && this.multiCli) {
      const res = this.multiCli.handleLinkerd({ argv: ['linkerd', ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }

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

  handlePromql(bin, args) {
    if (this.multiCli) {
      const res = bin === 'promql'
        ? this.multiCli.handlePromql({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs })
        : this.multiCli.handlePromtool({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }
    return { exitCode: 0, output: 'promql metric vector active' };
  }

  handleLogql(bin, args) {
    if (this.multiCli) {
      const res = bin === 'logql'
        ? this.multiCli.handleLogql({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs })
        : this.multiCli.handleLogcli({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }
    return { exitCode: 0, output: 'logql stream active' };
  }

  handleOtelcol(bin, args) {
    if (this.multiCli) {
      const res = this.multiCli.handleOtelcol({ argv: [bin, ...args], cwd: this.cwd, vfs: this.vfs });
      return {
        exitCode: res.code !== undefined ? res.code : 0,
        output: (res.stdout || res.stderr || '').replace(/\n$/, ''),
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        ...res
      };
    }
    return { exitCode: 0, output: 'OpenTelemetry Collector active' };
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
    if (action === 'inject' || action === 'pod-delete' || action === 'experiment') {
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
    this.pipelineDriver.registerCommand('systemctl', (ctx) => (this.multiCli ? this.multiCli.handleSystemctl(ctx) : systemctlTool(ctx)));
    this.pipelineDriver.registerCommand('journalctl', (ctx) => (this.multiCli ? this.multiCli.handleJournalctl(ctx) : journalctlTool(ctx)));

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
    let recursive = false;
    const paths = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-r' || args[i] === '-R') recursive = true;
      else if (!args[i].startsWith('-')) paths.push(args[i]);
    }
    if (paths.length < 2) {
      return { stdout: '', stderr: 'cp: missing file operand\n', code: 1 };
    }
    const currentCwd = cwd || this.cwd;
    const src = this.vfs.normalizePath(paths[0], currentCwd);
    const dst = this.vfs.normalizePath(paths[1], currentCwd);

    try {
      if (typeof this.vfs.cp === 'function') {
        this.vfs.cp(src, dst, { recursive });
      } else {
        const content = this.vfs.readFile(src);
        this.vfs.writeFile(dst, content);
      }
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `cp: cannot stat '${paths[0]}': ${err.message}\n`, code: 1 };
    }
  }

  _handleMv(ctx) {
    const { args, cwd } = unpackArgs(ctx);
    const paths = args.filter((a) => !a.startsWith('-'));
    if (paths.length < 2) {
      return { stdout: '', stderr: 'mv: missing file operand\n', code: 1 };
    }
    const currentCwd = cwd || this.cwd;
    const src = this.vfs.normalizePath(paths[0], currentCwd);
    const dst = this.vfs.normalizePath(paths[1], currentCwd);

    try {
      if (typeof this.vfs.rename === 'function') {
        this.vfs.rename(src, dst);
      } else {
        const content = this.vfs.readFile(src);
        this.vfs.writeFile(dst, content);
        this.vfs.unlink(src);
      }
      return { stdout: '', stderr: '', code: 0 };
    } catch (err) {
      return { stdout: '', stderr: `mv: cannot stat '${paths[0]}': ${err.message}\n`, code: 1 };
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
  // AUTOCOMPLETE ENGINE & RESOURCE INTROSPECTION HELPERS
  // -------------------------------------------------------------------------

  _getResourcesForKind(kind, namespace = null) {
    const norm = normalizeKind(kind);
    const names = new Set();
    const results = [];

    const addResource = (r) => {
      if (!r || !r.metadata || !r.metadata.name) return;
      const rKind = r.kind ? normalizeKind(r.kind) : norm;
      if (norm && rKind !== norm) return;
      if (namespace && namespace !== '*' && r.metadata.namespace && r.metadata.namespace !== namespace) {
        return;
      }
      if (!names.has(r.metadata.name)) {
        names.add(r.metadata.name);
        results.push(r);
      }
    };

    if (this.graph && typeof this.graph.list === 'function') {
      try {
        const query = { kind: norm };
        if (namespace && namespace !== '*') query.namespace = namespace;
        const list = this.graph.list(query);
        for (const item of (list || [])) addResource(item);
      } catch {}
    }

    if (this.cluster) {
      if (typeof this.cluster.getResources === 'function') {
        try {
          const nsQuery = (!namespace || namespace === '*') ? 'all' : namespace;
          const list = this.cluster.getResources(norm, nsQuery);
          for (const item of (list || [])) addResource(item);
        } catch {}
      }
      if (this.cluster.state && Array.isArray(this.cluster.state.resources)) {
        for (const item of this.cluster.state.resources) {
          if (item && item.kind && normalizeKind(item.kind) === norm) {
            addResource(item);
          }
        }
      }
    }

    return results;
  }

  _getNamespaces() {
    const list = this._getResourcesForKind('Namespace');
    const names = new Set(list.map((n) => n.metadata.name));
    for (const d of ['default', 'kube-system', 'production', 'monitoring', 'argocd', 'istio-system', 'security']) {
      names.add(d);
    }
    return Array.from(names).sort();
  }

  _isKindSlashSyntax(token) {
    if (!token || !token.includes('/')) return false;
    const part = token.split('/')[0].toLowerCase();
    const knownKinds = new Set([
      'pod', 'pods', 'po', 'deploy', 'deployment', 'deployments',
      'svc', 'service', 'services', 'node', 'nodes', 'no',
      'ns', 'namespace', 'namespaces', 'cm', 'configmap', 'configmaps',
      'sec', 'secret', 'secrets', 'netpol', 'networkpolicy', 'networkpolicies',
      'ing', 'ingress', 'ingresses', 'pvc', 'pv', 'sts', 'ds', 'job', 'cronjob',
      'sa', 'serviceaccount', 'serviceaccounts'
    ]);
    return knownKinds.has(part);
  }

  _completeKindSlash(token, targetNs, makeResult) {
    const slashIdx = token.indexOf('/');
    const kindPart = token.slice(0, slashIdx);
    const namePrefix = token.slice(slashIdx + 1);
    const resources = this._getResourcesForKind(kindPart, targetNs);
    const names = resources.map((r) => r.metadata.name).filter((n) => n.startsWith(namePrefix));
    const completions = names.map((n) => `${kindPart}/${n}`);
    return makeResult(token, completions, true);
  }

  _getContainerNames() {
    const names = new Set();
    if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.containers)) {
      for (const c of this.cluster.state.containers) {
        if (c.name) names.add(c.name);
      }
    }
    const pods = this._getResourcesForKind('Pod');
    for (const p of pods) {
      const containers = p.spec && Array.isArray(p.spec.containers) ? p.spec.containers : [];
      for (const c of containers) {
        if (c.name) names.add(c.name);
      }
    }
    return Array.from(names).sort();
  }

  _getHelmReleaseNames() {
    if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.helmReleases)) {
      return this.cluster.state.helmReleases.map((r) => r.name).filter(Boolean);
    }
    return [];
  }

  _getArgoAppNames() {
    if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.argoApps)) {
      return this.cluster.state.argoApps.map((a) => a.name).filter(Boolean);
    }
    return [];
  }

  /**
   * Intelligently autocompletes the user's input line
   * Introspects live ResourceGraph and VirtualCluster for dynamic pod names, namespaces, deployments, services, nodes.
   * @param {string} line Current line buffer
   * @param {number} cursor Optional cursor index
   * @returns {{ prefix: string, completions: string[], replacement?: string, line: string, cursor: number }}
   */
  autocomplete(line, cursor = line.length) {
    if (this.autocompletionEngine) {
      this.autocompletionEngine.setContext({
        graph: this.graph,
        vfs: this.vfs,
        cluster: this.cluster,
        cwd: this.cwd
      });
      return this.autocompletionEngine.autocomplete(line, cursor);
    }

    const textBeforeCursor = line.slice(0, cursor);
    const textAfterCursor = line.slice(cursor);
    const rawTokens = textBeforeCursor.trimStart().split(/\s+/);
    const isTrailingSpace = textBeforeCursor.endsWith(' ');
    const currentToken = isTrailingSpace ? '' : (rawTokens[rawTokens.length - 1] || '');

    const calcLCP = (arr) => {
      if (!arr || arr.length === 0) return '';
      if (arr.length === 1) return arr[0];
      let p = arr[0];
      for (let i = 1; i < arr.length; i++) {
        while (!arr[i].startsWith(p)) {
          p = p.slice(0, -1);
          if (!p) return '';
        }
      }
      return p;
    };

    const makeResult = (prefix, matches, isComplete = false) => {
      const sorted = Array.from(new Set(matches)).sort();
      let newLine = line;
      let newCursor = cursor;

      if (sorted.length === 1) {
        const match = sorted[0];
        const tokenReplacement = match + (isComplete ? ' ' : '');
        const beforeToken = textBeforeCursor.slice(0, textBeforeCursor.length - prefix.length);
        newLine = beforeToken + tokenReplacement + textAfterCursor;
        newCursor = beforeToken.length + tokenReplacement.length;
      } else if (sorted.length > 1) {
        const common = calcLCP(sorted);
        if (common.length > prefix.length) {
          const beforeToken = textBeforeCursor.slice(0, textBeforeCursor.length - prefix.length);
          newLine = beforeToken + common + textAfterCursor;
          newCursor = beforeToken.length + common.length;
        }
      }

      return {
        prefix,
        completions: sorted,
        line: newLine,
        cursor: newCursor
      };
    };

    // 1. Completing First Command Token
    if (rawTokens.length <= 1 && !isTrailingSpace) {
      const allCommands = this.pipelineDriver && this.pipelineDriver.commands
        ? Array.from(this.pipelineDriver.commands.keys())
        : [
            'kubectl', 'k', 'helm', 'docker', 'argocd', 'istioctl', 'tofu', 'terraform',
            'aws', 'az', 'gcloud', 'trivy', 'aiops', 'etcdctl', 'systemctl', 'journalctl',
            'cat', 'ls', 'grep', 'awk', 'sed', 'jq', 'curl', 'export', 'alias', 'echo', 'clear'
          ];
      const matches = allCommands.filter((cmd) => cmd.startsWith(currentToken)).sort();
      return makeResult(currentToken, matches, true);
    }

    const bin = rawTokens[0];

    // 2. Parse Flags and Positional Arguments
    let specifiedNamespace = null;
    let allNamespaces = false;
    const positional = [];
    const prevRawToken = rawTokens[rawTokens.length - (currentToken ? 2 : 1)] || '';

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (tok === '-n' || tok === '--namespace') {
        if (i + 1 < rawTokens.length) {
          specifiedNamespace = rawTokens[i + 1];
          i++;
        }
      } else if (tok.startsWith('--namespace=')) {
        specifiedNamespace = tok.slice(12);
      } else if (tok === '-A' || tok === '--all-namespaces') {
        allNamespaces = true;
      } else if (!tok.startsWith('-') || tok === '--') {
        positional.push(tok);
      }
    }

    // 3. Completing Flags (- or --)
    if (currentToken.startsWith('-') && !currentToken.startsWith('--namespace=') && !currentToken.startsWith('--output=')) {
      const verb = positional[1] || '';
      const flagMap = {
        get: ['-n', '--namespace', '-A', '--all-namespaces', '-o', '--output', '-l', '--selector', '-w', '--watch', '--show-labels', '--sort-by'],
        describe: ['-n', '--namespace', '-A', '-l', '--selector'],
        delete: ['-n', '--namespace', '-A', '-f', '--filename', '--force', '--grace-period', '--all'],
        edit: ['-n', '--namespace', '-o', '--output'],
        logs: ['-n', '--namespace', '-f', '--follow', '-c', '--container', '--tail', '--previous', '--all-containers'],
        exec: ['-n', '--namespace', '-i', '-t', '-it', '-c', '--container', '--'],
        apply: ['-f', '--filename', '-k', '--kustomize', '-R', '--recursive', '--dry-run=client', '--prune'],
        scale: ['-n', '--namespace', '--replicas', '--current-replicas'],
        rollout: ['-n', '--namespace']
      };
      const candidateFlags = flagMap[verb] || [
        '-n', '--namespace', '-A', '--all-namespaces',
        '-o', '--output', '-l', '--selector',
        '-f', '--filename', '--replicas', '--image',
        '--dry-run', '--raw-output', '--compact-output'
      ];
      const matches = candidateFlags.filter((f) => f.startsWith(currentToken));
      return makeResult(currentToken, matches, !currentToken.endsWith('='));
    }

    // 4. Completing Namespaces (after -n or --namespace)
    if (prevRawToken === '-n' || prevRawToken === '--namespace' || currentToken.startsWith('--namespace=')) {
      const prefix = currentToken.startsWith('--namespace=') ? currentToken.slice(12) : currentToken;
      const nsList = this._getNamespaces();
      let matches = nsList.filter((n) => n.startsWith(prefix));
      if (currentToken.startsWith('--namespace=')) {
        matches = matches.map((m) => `--namespace=${m}`);
        return makeResult(currentToken, matches, true);
      }
      return makeResult(currentToken, matches, true);
    }

    // 5. Completing Output Formats (after -o or --output)
    if (prevRawToken === '-o' || prevRawToken === '--output' || currentToken.startsWith('--output=')) {
      const prefix = currentToken.startsWith('--output=') ? currentToken.slice(9) : currentToken;
      const formats = ['json', 'yaml', 'wide', 'name', 'jsonpath='];
      let matches = formats.filter((f) => f.startsWith(prefix));
      if (currentToken.startsWith('--output=')) {
        matches = matches.map((m) => `--output=${m}`);
        return makeResult(currentToken, matches, !matches[0]?.endsWith('='));
      }
      return makeResult(currentToken, matches, true);
    }

    // 6. Completing File Paths in VFS
    const isVfsCandidate = currentToken.startsWith('/') || currentToken.startsWith('./') || currentToken.startsWith('../')
      || prevRawToken === '-f' || prevRawToken === '--filename' || prevRawToken === 'cat' || prevRawToken === 'ls'
      || prevRawToken === 'cd' || prevRawToken === 'vi' || prevRawToken === 'vim' || prevRawToken === 'nano';

    if (isVfsCandidate && !this._isKindSlashSyntax(currentToken)) {
      const matches = this._completeVfsPath(currentToken);
      return makeResult(currentToken, matches, true);
    }

    // 7. Kubernetes Command Logic (kubectl / k)
    if (bin === 'kubectl' || bin === 'k') {
      const verb = positional[1];

      // 7a. Completing Subcommands (verbs)
      if (!verb || (positional.length === 2 && !isTrailingSpace)) {
        const kubeSubcommands = [
          'get', 'describe', 'apply', 'create', 'delete', 'edit',
          'patch', 'scale', 'rollout', 'logs', 'exec', 'top',
          'cordon', 'uncordon', 'drain', 'taint', 'label', 'annotate',
          'auth', 'cluster-info', 'version', 'diff', 'wait', 'config',
          'explain', 'run'
        ];
        const matches = kubeSubcommands.filter((sc) => sc.startsWith(currentToken));
        return makeResult(currentToken, matches, true);
      }

      const targetNs = allNamespaces ? null : (specifiedNamespace || (this.cluster ? this.cluster.currentNamespace : 'default'));

      // 7b. Verbs targeting Nodes directly (cordon, uncordon, drain)
      if (verb === 'cordon' || verb === 'uncordon' || verb === 'drain') {
        const nodes = this._getResourcesForKind('Node');
        const nodeNames = nodes.map((n) => n.metadata.name);
        const matches = nodeNames.filter((name) => name.startsWith(currentToken));
        return makeResult(currentToken, matches, true);
      }

      // 7c. Verb: taint
      if (verb === 'taint') {
        if (positional.length === 2 && isTrailingSpace) {
          return makeResult(currentToken, ['node', 'nodes'].filter((k) => k.startsWith(currentToken)), true);
        }
        if (positional.length === 3 && (positional[2] === 'node' || positional[2] === 'nodes')) {
          const nodes = this._getResourcesForKind('Node');
          const nodeNames = nodes.map((n) => n.metadata.name);
          const matches = nodeNames.filter((name) => name.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }
      }

      // 7d. Verb: logs (targets Pod or Deployment)
      if (verb === 'logs') {
        if (this._isKindSlashSyntax(currentToken)) {
          return this._completeKindSlash(currentToken, targetNs, makeResult);
        }
        const pods = this._getResourcesForKind('Pod', targetNs);
        let names = pods.map((p) => p.metadata.name);
        if (names.length === 0) {
          const deploys = this._getResourcesForKind('Deployment', targetNs);
          names = deploys.map((d) => d.metadata.name);
        }
        const matches = names.filter((name) => name.startsWith(currentToken));
        return makeResult(currentToken, matches, true);
      }

      // 7e. Verb: exec (targets Pod)
      if (verb === 'exec') {
        const pods = this._getResourcesForKind('Pod', targetNs);
        const names = pods.map((p) => p.metadata.name);
        const matches = names.filter((name) => name.startsWith(currentToken));
        return makeResult(currentToken, matches, true);
      }

      // 7f. Verb: scale or rollout
      if (verb === 'scale' || verb === 'rollout') {
        if (positional.length === 2 && isTrailingSpace) {
          const sub = verb === 'scale' ? ['deployment', 'statefulset'] : ['status', 'restart', 'history', 'undo'];
          return makeResult(currentToken, sub.filter((s) => s.startsWith(currentToken)), true);
        }
        const kindToken = positional[2];
        if (kindToken === 'restart' || kindToken === 'status' || kindToken === 'history') {
          if (positional.length === 3 && isTrailingSpace) {
            return makeResult(currentToken, ['deployment', 'daemonset', 'statefulset'].filter((k) => k.startsWith(currentToken)), true);
          }
          const actualKind = positional[3] || 'deployment';
          const resources = this._getResourcesForKind(actualKind, targetNs);
          const names = resources.map((r) => r.metadata.name);
          const matches = names.filter((n) => n.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }
        if (kindToken) {
          const resources = this._getResourcesForKind(kindToken, targetNs);
          const names = resources.map((r) => r.metadata.name);
          const matches = names.filter((n) => n.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }
      }

      // 7g. Verb: top (pod / node)
      if (verb === 'top') {
        if (positional.length === 2 && isTrailingSpace) {
          return makeResult(currentToken, ['pods', 'nodes'].filter((k) => k.startsWith(currentToken)), true);
        }
        if (positional.length >= 3) {
          const kindToken = positional[2];
          const resources = this._getResourcesForKind(kindToken, targetNs);
          const names = resources.map((r) => r.metadata.name);
          const matches = names.filter((n) => n.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }
      }

      // 7h. General CRUD verbs: get, describe, delete, edit, explain
      if (['get', 'describe', 'delete', 'edit', 'explain'].includes(verb)) {
        if (this._isKindSlashSyntax(currentToken)) {
          return this._completeKindSlash(currentToken, targetNs, makeResult);
        }

        const isCompletingKind = (positional.length === 2 && isTrailingSpace)
          || (positional.length === 3 && !isTrailingSpace);

        if (isCompletingKind) {
          const kinds = [
            'pods', 'deployments', 'services', 'nodes', 'namespaces',
            'configmaps', 'secrets', 'networkpolicies', 'ingresses',
            'statefulsets', 'daemonsets', 'jobs', 'cronjobs',
            'persistentvolumeclaims', 'persistentvolumes', 'serviceaccounts',
            'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings',
            'endpoints', 'storageclasses'
          ];
          const matches = kinds.filter((k) => k.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }

        if (positional.length >= 3) {
          const kindToken = positional[2];
          let resources = this._getResourcesForKind(kindToken, targetNs);
          if (resources.length === 0 && targetNs && !CLUSTER_SCOPED_KINDS.has(normalizeKind(kindToken))) {
            resources = this._getResourcesForKind(kindToken, null);
          }
          const names = resources.map((r) => r.metadata.name);
          const matches = names.filter((name) => name.startsWith(currentToken));
          return makeResult(currentToken, matches, true);
        }
      }
    }

    // 8. Other CLI Tools (docker, helm, argocd, istioctl)
    if (bin === 'docker') {
      const verb = positional[1];
      if (!verb || (positional.length === 2 && !isTrailingSpace)) {
        return makeResult(currentToken, ['ps', 'logs', 'exec', 'stop', 'rm', 'build', 'run', 'images', 'inspect'].filter((v) => v.startsWith(currentToken)), true);
      }
      if (['logs', 'stop', 'rm', 'inspect'].includes(verb)) {
        const containers = this._getContainerNames();
        return makeResult(currentToken, containers.filter((c) => c.startsWith(currentToken)), true);
      }
    }

    if (bin === 'helm') {
      const verb = positional[1];
      if (!verb || (positional.length === 2 && !isTrailingSpace)) {
        return makeResult(currentToken, ['list', 'install', 'upgrade', 'uninstall', 'status', 'repo', 'template'].filter((v) => v.startsWith(currentToken)), true);
      }
      if (['status', 'upgrade', 'uninstall'].includes(verb)) {
        const releases = this._getHelmReleaseNames();
        return makeResult(currentToken, releases.filter((r) => r.startsWith(currentToken)), true);
      }
    }

    if (bin === 'argocd') {
      const verb = positional[1];
      if (verb === 'app') {
        const appVerb = positional[2];
        if (!appVerb || (positional.length === 3 && !isTrailingSpace)) {
          return makeResult(currentToken, ['get', 'sync', 'diff', 'list', 'history', 'rollback'].filter((v) => v.startsWith(currentToken)), true);
        }
        const apps = this._getArgoAppNames();
        return makeResult(currentToken, apps.filter((a) => a.startsWith(currentToken)), true);
      }
    }

    if (bin === 'istioctl') {
      const verb = positional[1];
      if (verb === 'proxy-config') {
        if (positional.length === 2 && isTrailingSpace) {
          return makeResult(currentToken, ['endpoints', 'cluster', 'routes', 'listener', 'secret'].filter((s) => s.startsWith(currentToken)), true);
        }
        const pods = this._getResourcesForKind('Pod');
        return makeResult(currentToken, pods.map((p) => p.metadata.name).filter((n) => n.startsWith(currentToken)), true);
      }
    }

    return makeResult(currentToken, []);
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
  AutocompletionEngine,
  tokenizeCommand,
  parseKubeFlags,
  jqTool,
  opensslTool,
  systemctlTool,
  journalctlTool
};
