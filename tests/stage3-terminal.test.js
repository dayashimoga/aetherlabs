'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine, jqTool, opensslTool, systemctlTool, journalctlTool } = require('../src/core/terminalEngine');

test('Subphase 3.1.1: TerminalEngine initialization and baseline bootstrap', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const terminal = new TerminalEngine({ graph, vfs });

  assert.equal(terminal.cwd, '/home/learner');
  assert.equal(terminal.env.USER, 'learner');
  assert.ok(terminal.pipelineDriver);
  assert.ok(terminal.multiCli);

  // Default system pods bootstrapped
  const apiserver = graph.get('Pod', 'kube-system', 'kube-apiserver-control-plane');
  assert.ok(apiserver);
  assert.equal(apiserver.status.phase, 'Running');
});

test('Subphase 3.1.1: POSIX file commands and VFS manipulation (mkdir, touch, echo, cat, ls, cd, cp, mv, rm)', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  // mkdir -p
  let res = term.execute('mkdir -p /home/learner/workspace/k8s');
  assert.equal(res.code, 0);
  assert.ok(vfs.exists('/home/learner/workspace/k8s'));

  // cd & pwd
  res = term.execute('cd workspace/k8s && pwd');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), '/home/learner/workspace/k8s');
  assert.equal(term.cwd, '/home/learner/workspace/k8s');

  // echo and redirection >
  res = term.execute('echo "apiVersion: v1\nkind: ConfigMap" > config.yaml');
  assert.equal(res.code, 0);
  assert.ok(vfs.exists('/home/learner/workspace/k8s/config.yaml'));

  // cat
  res = term.execute('cat config.yaml');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /kind: ConfigMap/);

  // ls
  res = term.execute('ls -la');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /config\.yaml/);

  // cp
  res = term.execute('cp config.yaml config-backup.yaml');
  assert.equal(res.code, 0);
  assert.ok(vfs.exists('/home/learner/workspace/k8s/config-backup.yaml'));

  // mv
  res = term.execute('mv config-backup.yaml config-final.yaml');
  assert.equal(res.code, 0);
  assert.ok(!vfs.exists('/home/learner/workspace/k8s/config-backup.yaml'));
  assert.ok(vfs.exists('/home/learner/workspace/k8s/config-final.yaml'));

  // rm
  res = term.execute('rm config-final.yaml');
  assert.equal(res.code, 0);
  assert.ok(!vfs.exists('/home/learner/workspace/k8s/config-final.yaml'));

  // cd ~
  res = term.execute('cd ~ && pwd');
  assert.equal(res.code, 0);
  assert.equal(term.cwd, '/home/learner');
});

test('Subphase 3.1.1: AST Pipelines, Short-Circuit Operators (&&, ||, ;), and Environment Variables', () => {
  const graph = new ResourceGraph();
  const term = new TerminalEngine({ graph });

  // Environment variable export & expansion
  let res = term.execute('export CLUSTER_ENV=staging APP_NAME=checkout');
  assert.equal(res.code, 0);
  assert.equal(term.env.CLUSTER_ENV, 'staging');
  assert.equal(term.env.APP_NAME, 'checkout');

  res = term.execute('echo "Deploying $APP_NAME to $CLUSTER_ENV"');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'Deploying checkout to staging');

  // && execution
  res = term.execute('true && echo "Condition Met"');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'Condition Met');

  // && short-circuit
  res = term.execute('false && echo "Should Not Run"');
  assert.notEqual(res.code, 0);
  assert.ok(!res.stdout.includes('Should Not Run'));

  // || fallback
  res = term.execute('false || echo "Fallback Executed"');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'Fallback Executed');

  // Sequential ; execution
  res = term.execute('echo "First"; echo "Second"');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /First/);
  assert.match(res.stdout, /Second/);
});

test('Subphase 3.1.1: JQ JSON tool with path queries, keys, lengths, and streaming pipe', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  const sampleJson = {
    apiVersion: 'v1',
    items: [
      { metadata: { name: 'pod-alpha', namespace: 'default' }, status: { phase: 'Running' } },
      { metadata: { name: 'pod-beta', namespace: 'prod' }, status: { phase: 'Pending' } }
    ]
  };

  // Direct jq tool invocation
  let res = jqTool(['.items[].metadata.name', '-r'], JSON.stringify(sampleJson));
  assert.equal(res.code, 0);
  const names = res.stdout.trim().split('\n');
  assert.deepEqual(names, ['pod-alpha', 'pod-beta']);

  // JQ keys
  res = jqTool(['keys', '-c'], JSON.stringify(sampleJson));
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), '["apiVersion","items"]');

  // JQ length
  res = jqTool(['.items | length', '-c'], JSON.stringify(sampleJson));
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), '2');

  // Kubectl output piped into JQ
  const pipeRes = term.execute("kubectl get pods -n kube-system -o json | jq -r '.items[].metadata.name'");
  assert.equal(pipeRes.code, 0);
  assert.match(pipeRes.stdout, /kube-apiserver-control-plane/);
  assert.match(pipeRes.stdout, /etcd-control-plane/);
});

test('Subphase 3.1.1: OpenSSL cryptographic diagnostic and generation utility', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  let res = term.execute('openssl version');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /OpenSSL 3\./);

  // Inspect cert text
  res = term.execute('openssl x509 -in /etc/kubernetes/pki/apiserver.crt -text -noout');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Subject: CN = kube-apiserver/);
  assert.match(res.stdout, /DNS:kubernetes/);

  // Check cert expiry
  res = term.execute('openssl x509 -checkend 86400 -in /etc/kubernetes/pki/apiserver.crt');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Certificate will not expire/);

  // Generate private key into VFS
  res = term.execute('openssl genrsa -out /home/learner/tls.key 2048');
  assert.equal(res.code, 0);
  assert.ok(vfs.exists('/home/learner/tls.key'));
  const keyContent = vfs.readFile('/home/learner/tls.key');
  assert.match(keyContent, /BEGIN RSA PRIVATE KEY/);
});

test('Subphase 3.1.1: Systemd service manager and journal log inspection (systemctl & journalctl)', () => {
  const graph = new ResourceGraph();
  const term = new TerminalEngine({ graph });

  // Systemctl status
  let res = term.execute('systemctl status kubelet');
  assert.equal(res.code, 0);
  assert.match(res.stdout, /kubelet: The Kubernetes Node Agent/);
  assert.match(res.stdout, /Active: active \(running\)/);

  // Systemctl is-active
  res = term.execute('systemctl is-active kubelet');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'active');

  // Systemctl stop
  res = term.execute('systemctl stop kubelet');
  assert.equal(res.code, 0);

  res = term.execute('systemctl is-active kubelet');
  assert.equal(res.code, 3);
  assert.equal(res.stdout.trim(), 'inactive');

  // Systemctl restart
  res = term.execute('systemctl restart kubelet');
  assert.equal(res.code, 0);

  res = term.execute('systemctl is-active kubelet');
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'active');

  // Journalctl logs
  res = term.execute('journalctl -u kubelet -n 3');
  assert.equal(res.code, 0);
  const logLines = res.stdout.trim().split('\n');
  assert.ok(logLines.length <= 3);
  assert.match(res.stdout, /kubelet/);
});

test('Subphase 3.1.1: Autocomplete Engine for commands, subcommands, kinds, namespaces, flags, and VFS paths', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const term = new TerminalEngine({ graph, vfs });

  // 1. Command completion
  let comp = term.autocomplete('kube');
  assert.ok(comp.completions.includes('kubectl'));

  comp = term.autocomplete('hel');
  assert.ok(comp.completions.includes('helm'));

  // 2. Subcommand completion
  comp = term.autocomplete('kubectl d');
  assert.ok(comp.completions.includes('describe'));
  assert.ok(comp.completions.includes('drain'));
  assert.ok(comp.completions.includes('diff'));

  // 3. Resource kind completion
  comp = term.autocomplete('kubectl get p');
  assert.ok(comp.completions.includes('pods'));
  assert.ok(comp.completions.includes('persistentvolumeclaims'));
  assert.ok(comp.completions.includes('persistentvolumes'));

  // 4. Namespace completion
  comp = term.autocomplete('kubectl get pods -n k');
  assert.ok(comp.completions.includes('kube-system'));

  // 5. Flag completion
  comp = term.autocomplete('kubectl get pods --na');
  assert.ok(comp.completions.includes('--namespace'));

  // 6. VFS path completion
  vfs.mkdir('/home/learner/manifests', { recursive: true });
  vfs.writeFile('/home/learner/manifests/web.yaml', 'apiVersion: v1');
  vfs.writeFile('/home/learner/manifests/db.yaml', 'apiVersion: v1');

  comp = term.autocomplete('kubectl apply -f manifests/w');
  assert.ok(comp.completions.some((c) => c.includes('web.yaml')));
});

test('Subphase 3.1.1: History tracking and !! expansion', () => {
  const graph = new ResourceGraph();
  const term = new TerminalEngine({ graph });

  term.execute('echo "First Line"');
  term.execute('echo "Second Line"');

  const hist = term.execute('history');
  assert.equal(hist.code, 0);
  assert.match(hist.stdout, /echo "First Line"/);
  assert.match(hist.stdout, /echo "Second Line"/);

  // !! expansion repeats last command
  const repeat = term.execute('!!');
  assert.equal(repeat.code, 0);
  assert.match(repeat.stdout, /echo "Second Line"/);
});

