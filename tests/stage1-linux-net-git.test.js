'use strict';

/**
 * KubeLabs v4.0 - Test Suite: Stage 1 Subphase 1.2.2
 * Linux, Networking, Container Runtimes & Isomorphic Git Binaries
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { GitEngine } = require('../src/core/gitEngine');

function setupTestEnvironment() {
  const vfs = new VirtualFileSystem();
  const graph = new ResourceGraph();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });
  const terminal = new TerminalEngine({
    vfs,
    graph,
    pipelineDriver: true
  });
  // Ensure terminal uses the graph and vfs
  terminal.multiCli = dispatcher;
  terminal.gitEngine = dispatcher.gitEngine;
  return { vfs, graph, dispatcher, terminal };
}

test('1.2.2 - POSIX / Bash builtins (ls, cd, pwd, cat, mkdir, rm, cp, mv, chmod, chown, ln, find, env, export, echo)', async () => {
  const { vfs, terminal } = setupTestEnvironment();

  // mkdir -p
  const mkdirRes = terminal.execute('mkdir -p /opt/cni/bin /etc/cni/net.d');
  assert.equal(mkdirRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin'), true);
  assert.equal(vfs.exists('/etc/cni/net.d'), true);

  // touch / write
  vfs.writeFile('/opt/cni/bin/bridge', '#!/bin/sh\necho cni-bridge');
  vfs.writeFile('/opt/cni/bin/loopback', '#!/bin/sh\necho cni-loopback');

  // pwd & cd
  const pwdInitial = terminal.execute('pwd');
  assert.equal(pwdInitial.exitCode, 0);
  assert.equal(pwdInitial.output.trim(), '/home/learner');

  const cdRes = terminal.execute('cd /opt/cni/bin');
  assert.equal(cdRes.exitCode, 0);
  const pwdAfter = terminal.execute('pwd');
  assert.equal(pwdAfter.output.trim(), '/opt/cni/bin');

  // ls, ls -la, ls -lh
  const lsRes = terminal.execute('ls');
  assert.equal(lsRes.exitCode, 0);
  assert.match(lsRes.output, /bridge/);
  assert.match(lsRes.output, /loopback/);

  const lsLaRes = terminal.execute('ls -la');
  assert.equal(lsLaRes.exitCode, 0);
  assert.match(lsLaRes.output, /\.\./);
  assert.match(lsLaRes.output, /bridge/);
  assert.match(lsLaRes.output, /root/);

  // cat & cat -n
  const catRes = terminal.execute('cat bridge');
  assert.equal(catRes.exitCode, 0);
  assert.match(catRes.output, /cni-bridge/);

  const catNRes = terminal.execute('cat -n bridge');
  assert.equal(catNRes.exitCode, 0);
  assert.match(catNRes.output, /1\s+#!/);

  // cp & cp -r
  const cpRes = terminal.execute('cp bridge bridge.bak');
  assert.equal(cpRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin/bridge.bak'), true);

  const cpDirRes = terminal.execute('cp -r /opt/cni/bin /opt/cni/bin-copy');
  assert.equal(cpDirRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin-copy/bridge'), true);

  // mv
  const mvRes = terminal.execute('mv bridge.bak bridge.old');
  assert.equal(mvRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin/bridge.old'), true);
  assert.equal(vfs.exists('/opt/cni/bin/bridge.bak'), false);

  // chmod & chown
  const chmodRes = terminal.execute('chmod 755 bridge.old');
  assert.equal(chmodRes.exitCode, 0);
  assert.equal(vfs.stat('/opt/cni/bin/bridge.old').mode, 0o755);

  const chownRes = terminal.execute('chown root:root bridge.old');
  assert.equal(chownRes.exitCode, 0);
  assert.equal(vfs.stat('/opt/cni/bin/bridge.old').uid, 0);
  assert.equal(vfs.stat('/opt/cni/bin/bridge.old').gid, 0);

  // ln -s
  const lnRes = terminal.execute('ln -s /opt/cni/bin/bridge /opt/cni/bin/bridge-symlink');
  assert.equal(lnRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin/bridge-symlink'), true);

  // find
  const findRes = terminal.execute('find /opt/cni -name "*.old"');
  assert.equal(findRes.exitCode, 0);
  assert.match(findRes.output, /bridge\.old/);

  // rm
  const rmRes = terminal.execute('rm bridge.old');
  assert.equal(rmRes.exitCode, 0);
  assert.equal(vfs.exists('/opt/cni/bin/bridge.old'), false);

  // export & env
  terminal.execute('export CNI_VERSION=v1.5.0');
  const envRes = terminal.execute('env');
  assert.equal(envRes.exitCode, 0);
  assert.match(envRes.output, /CNI_VERSION=v1\.5\.0/);

  // echo
  const echoRes = terminal.execute('echo "KubeLabs POSIX Engine v4.0"');
  assert.equal(echoRes.exitCode, 0);
  assert.equal(echoRes.output.trim(), 'KubeLabs POSIX Engine v4.0');
});

test('1.2.2 - Linux admin tools (ps aux, kill, systemctl, journalctl, df -h, free -m, uname -a, sysctl, unshare)', async () => {
  const { graph, terminal } = setupTestEnvironment();

  // Create a NotReady node
  graph.create({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'worker-node-1' },
    status: {
      phase: 'NotReady',
      conditions: [{ type: 'Ready', status: 'False', reason: 'KubeletStopped' }]
    }
  });

  // ps & ps aux
  const psRes = terminal.execute('ps');
  assert.equal(psRes.exitCode, 0);
  assert.match(psRes.output, /PID/);

  const psAuxRes = terminal.execute('ps aux');
  assert.equal(psAuxRes.exitCode, 0);
  assert.match(psAuxRes.output, /USER/);
  assert.match(psAuxRes.output, /kube-apiserver/);
  assert.match(psAuxRes.output, /containerd/);
  assert.match(psAuxRes.output, /kubelet/);

  // kill
  const killRes = terminal.execute('kill 3410');
  assert.equal(killRes.exitCode, 0);

  // systemctl status & is-active
  const statusRes = terminal.execute('systemctl status kubelet');
  assert.equal(statusRes.exitCode, 0);
  assert.match(statusRes.output, /active \(running\)/);
  assert.match(statusRes.output, /The Kubernetes Node Agent/);

  const isActiveRes = terminal.execute('systemctl is-active kubelet');
  assert.equal(isActiveRes.exitCode, 0);
  assert.equal(isActiveRes.output.trim(), 'active');

  // systemctl restart kubelet reconciles NotReady node to Ready!
  const restartRes = terminal.execute('systemctl restart kubelet');
  assert.equal(restartRes.exitCode, 0);
  const node = graph.get('Node', null, 'worker-node-1');
  assert.equal(node.status.phase, 'Ready');
  const readyCond = node.status.conditions.find((c) => c.type === 'Ready');
  assert.equal(readyCond.status, 'True');

  // journalctl -u kubelet -n 2
  const journalRes = terminal.execute('journalctl -u kubelet -n 2');
  assert.equal(journalRes.exitCode, 0);
  assert.match(journalRes.output, /kubelet/);

  // df -h & free -m & uname -a
  const dfRes = terminal.execute('df -h');
  assert.equal(dfRes.exitCode, 0);
  assert.match(dfRes.output, /\/dev\/root/);

  const freeRes = terminal.execute('free -m');
  assert.equal(freeRes.exitCode, 0);
  assert.match(freeRes.output, /Mem:/);

  const unameRes = terminal.execute('uname -a');
  assert.equal(unameRes.exitCode, 0);
  assert.match(unameRes.output, /Linux/);

  // sysctl -a and sysctl -w
  const sysctlList = terminal.execute('sysctl -a');
  assert.equal(sysctlList.exitCode, 0);
  assert.match(sysctlList.output, /net\.ipv4\.ip_forward/);

  const sysctlSet = terminal.execute('sysctl -w net.ipv4.ip_forward=1');
  assert.equal(sysctlSet.exitCode, 0);
  assert.match(sysctlSet.output, /net\.ipv4\.ip_forward = 1/);

  // unshare simulation
  const unshareRes = terminal.execute('unshare -m -u -i -n -p -f ps aux');
  assert.equal(unshareRes.exitCode, 0);
  assert.match(unshareRes.output, /isolated-ns/);
});

test('1.2.2 - Networking tools (ip addr/route/link/netns, iptables, ss -tulpn, dig, nslookup, curl, ping, traceroute, nc)', async () => {
  const { terminal } = setupTestEnvironment();

  // ip addr
  const ipAddrRes = terminal.execute('ip addr');
  assert.equal(ipAddrRes.exitCode, 0);
  assert.match(ipAddrRes.output, /127\.0\.0\.1\/8/);
  assert.match(ipAddrRes.output, /eth0/);

  // ip route
  const ipRouteRes = terminal.execute('ip route');
  assert.equal(ipRouteRes.exitCode, 0);
  assert.match(ipRouteRes.output, /default via/);

  // ip link
  const ipLinkRes = terminal.execute('ip link');
  assert.equal(ipLinkRes.exitCode, 0);
  assert.match(ipLinkRes.output, /state UP/);

  // ip netns
  const ipNetnsRes = terminal.execute('ip netns list');
  assert.equal(ipNetnsRes.exitCode, 0);
  assert.match(ipNetnsRes.output, /cni-/);

  // iptables filter table
  const iptablesFilter = terminal.execute('iptables -L -n -v');
  assert.equal(iptablesFilter.exitCode, 0);
  assert.match(iptablesFilter.output, /Chain INPUT/);
  assert.match(iptablesFilter.output, /6443/);

  // iptables nat table
  const iptablesNat = terminal.execute('iptables -t nat -L -n -v');
  assert.equal(iptablesNat.exitCode, 0);
  assert.match(iptablesNat.output, /Chain KUBE-SERVICES/);
  assert.match(iptablesNat.output, /10\.96\.0\.1/);

  // ss -tulpn
  const ssRes = terminal.execute('ss -tulpn');
  assert.equal(ssRes.exitCode, 0);
  assert.match(ssRes.output, /6443/);
  assert.match(ssRes.output, /kube-apiserver/);

  // dig
  const digRes = terminal.execute('dig kubernetes.default.svc');
  assert.equal(digRes.exitCode, 0);
  assert.match(digRes.output, /ANSWER SECTION/);
  assert.match(digRes.output, /10\.96\.0\.1/);

  // nslookup
  const nslookupRes = terminal.execute('nslookup kubernetes.default.svc');
  assert.equal(nslookupRes.exitCode, 0);
  assert.match(nslookupRes.output, /10\.96\.0\.1/);

  // curl -I (headers) & curl (body)
  const curlHeadRes = terminal.execute('curl -I https://10.96.0.1:443/livez');
  assert.equal(curlHeadRes.exitCode, 0);
  assert.match(curlHeadRes.output, /HTTP\/1\.1 200 OK/);

  const curlBodyRes = terminal.execute('curl https://10.96.0.1:443/livez');
  assert.equal(curlBodyRes.exitCode, 0);
  assert.equal(curlBodyRes.output.trim(), 'ok');

  // ping
  const pingRes = terminal.execute('ping -c 2 10.96.0.1');
  assert.equal(pingRes.exitCode, 0);
  assert.match(pingRes.output, /0% packet loss/);

  // traceroute
  const traceRes = terminal.execute('traceroute 10.96.0.1');
  assert.equal(traceRes.exitCode, 0);
  assert.match(traceRes.output, /traceroute to/);

  // nc -zv
  const ncRes = terminal.execute('nc -zv 10.96.0.1 443');
  assert.equal(ncRes.exitCode, 0);
  assert.match(ncRes.output, /succeeded!/);
});

test('1.2.2 - Container runtimes (docker build/run/ps/images/logs/exec/inspect/network & crictl pods/ps/inspect/logs/images)', async () => {
  const { graph, terminal } = setupTestEnvironment();

  // Create active pod in graph
  graph.create({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'coredns-7d8899c99c-c8k7p', namespace: 'kube-system' },
    status: { phase: 'Running' }
  });

  // docker ps & docker images
  const dockerPs = terminal.execute('docker ps');
  assert.equal(dockerPs.exitCode, 0);
  assert.match(dockerPs.output, /CONTAINER ID/);
  assert.match(dockerPs.output, /web-gateway/);

  const dockerImages = terminal.execute('docker images');
  assert.equal(dockerImages.exitCode, 0);
  assert.match(dockerImages.output, /nginx/);
  assert.match(dockerImages.output, /1\.27-alpine/);

  // docker run
  const dockerRun = terminal.execute('docker run -d --name redis-cache -p 6379:6379 redis:7.2-alpine');
  assert.equal(dockerRun.exitCode, 0);
  assert.match(dockerRun.output, /[a-f0-9]{12}/);

  // docker build
  const dockerBuild = terminal.execute('docker build -t payment-api:v1.2 .');
  assert.equal(dockerBuild.exitCode, 0);
  assert.match(dockerBuild.output, /Building 1\.1s/);
  assert.match(dockerBuild.output, /payment-api:v1\.2/);

  // docker logs & exec & inspect
  const dockerLogs = terminal.execute('docker logs redis-cache');
  assert.equal(dockerLogs.exitCode, 0);
  assert.match(dockerLogs.output, /Ready to receive traffic/);

  const dockerExec = terminal.execute('docker exec redis-cache whoami');
  assert.equal(dockerExec.exitCode, 0);
  assert.match(dockerExec.output, /root/);

  const dockerInspect = terminal.execute('docker inspect redis-cache');
  assert.equal(dockerInspect.exitCode, 0);
  assert.match(dockerInspect.output, /"Status": "running"/);

  // docker network ls
  const dockerNet = terminal.execute('docker network ls');
  assert.equal(dockerNet.exitCode, 0);
  assert.match(dockerNet.output, /bridge/);
  assert.match(dockerNet.output, /cilium-net/);

  // docker stop & rm
  const dockerStop = terminal.execute('docker stop redis-cache');
  assert.equal(dockerStop.exitCode, 0);

  const dockerRm = terminal.execute('docker rm redis-cache');
  assert.equal(dockerRm.exitCode, 0);

  // crictl pods & ps & images & stats
  const crictlPods = terminal.execute('crictl pods');
  assert.equal(crictlPods.exitCode, 0);
  assert.match(crictlPods.output, /coredns/);

  const crictlPs = terminal.execute('crictl ps');
  assert.equal(crictlPs.exitCode, 0);
  assert.match(crictlPs.output, /kube-apiserver/);

  const crictlImages = terminal.execute('crictl images');
  assert.equal(crictlImages.exitCode, 0);
  assert.match(crictlImages.output, /registry\.k8s\.io/);

  const crictlStats = terminal.execute('crictl stats');
  assert.equal(crictlStats.exitCode, 0);
  assert.match(crictlStats.output, /CPU %/);
});

test('1.2.2 - Isomorphic git client (init, clone, add, commit, status, log, diff, checkout, branch, merge, tag, rebase)', async () => {
  const { vfs, terminal } = setupTestEnvironment();

  // git init in /home/learner/my-repo
  const initRes = terminal.execute('git init /home/learner/my-repo');
  assert.equal(initRes.exitCode, 0);
  assert.match(initRes.output, /Initialized empty Git repository/);
  assert.equal(vfs.exists('/home/learner/my-repo/.git/HEAD'), true);

  terminal.execute('cd /home/learner/my-repo');

  // git status (clean)
  const statusEmpty = terminal.execute('git status');
  assert.equal(statusEmpty.exitCode, 0);
  assert.match(statusEmpty.output, /nothing to commit, working tree clean/);

  // Create file & status (untracked)
  terminal.execute('echo "apiVersion: v1" > deployment.yaml');
  const statusUntracked = terminal.execute('git status');
  assert.equal(statusUntracked.exitCode, 0);
  assert.match(statusUntracked.output, /Untracked files:/);
  assert.match(statusUntracked.output, /deployment\.yaml/);

  // git add .
  const addRes = terminal.execute('git add .');
  assert.equal(addRes.exitCode, 0);

  // git status (staged)
  const statusStaged = terminal.execute('git status');
  assert.equal(statusStaged.exitCode, 0);
  assert.match(statusStaged.output, /Changes to be committed:/);
  assert.match(statusStaged.output, /new file:\s+deployment\.yaml/);

  // git commit -m
  const commitRes = terminal.execute('git commit -m "feat: initial manifest commit"');
  assert.equal(commitRes.exitCode, 0);
  assert.match(commitRes.output, /\[main \(root-commit\) [a-f0-9]{7}\] feat: initial manifest commit/);

  // git log & git log --oneline
  const logRes = terminal.execute('git log');
  assert.equal(logRes.exitCode, 0);
  assert.match(logRes.output, /Author: Learner/);
  assert.match(logRes.output, /feat: initial manifest commit/);

  const logOneline = terminal.execute('git log --oneline');
  assert.equal(logOneline.exitCode, 0);
  assert.match(logOneline.output, /[a-f0-9]{7} \(HEAD -> main\) feat: initial manifest commit/);

  // git branch & git checkout -b
  const branchRes = terminal.execute('git branch');
  assert.equal(branchRes.exitCode, 0);
  assert.match(branchRes.output, /\* main/);

  const checkoutNew = terminal.execute('git checkout -b feature/ingress');
  assert.equal(checkoutNew.exitCode, 0);
  assert.match(checkoutNew.output, /Switched to a new branch 'feature\/ingress'/);

  // Commit on feature branch
  terminal.execute('echo "kind: Ingress" > ingress.yaml');
  terminal.execute('git add ingress.yaml');
  terminal.execute('git commit -m "feat: add ingress route"');

  // Switch back to main and merge
  terminal.execute('git checkout main');
  const mergeRes = terminal.execute('git merge feature/ingress');
  assert.equal(mergeRes.exitCode, 0);
  assert.match(mergeRes.output, /Fast-forward/);

  // git tag
  const tagRes = terminal.execute('git tag -a v1.0.0');
  assert.equal(tagRes.exitCode, 0);
  const tagList = terminal.execute('git tag');
  assert.equal(tagList.exitCode, 0);
  assert.match(tagList.output, /v1\.0\.0/);

  // git clone simulation
  terminal.execute('cd /home/learner');
  const cloneRes = terminal.execute('git clone https://github.com/kubelabs-org/payments-gitops.git');
  assert.equal(cloneRes.exitCode, 0);
  assert.match(cloneRes.output, /Cloning into 'payments-gitops'/);
  assert.equal(vfs.exists('/home/learner/payments-gitops/deployment.yaml'), true);
  assert.equal(vfs.exists('/home/learner/payments-gitops/kustomization.yaml'), true);

  terminal.execute('cd /home/learner/payments-gitops');
  const remoteRes = terminal.execute('git remote -v');
  assert.equal(remoteRes.exitCode, 0);
  assert.match(remoteRes.output, /https:\/\/github\.com\/kubelabs-org\/payments-gitops\.git/);
});
