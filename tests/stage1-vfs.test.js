'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');

test('Subphase 1.1.2: VFS pre-populated tree contains Kubernetes control-plane manifests and configs', () => {
  const vfs = new VirtualFileSystem();

  // Control plane static manifests
  assert.ok(vfs.exists('/etc/kubernetes/manifests/kube-apiserver.yaml'));
  assert.ok(vfs.exists('/etc/kubernetes/manifests/etcd.yaml'));
  assert.ok(vfs.exists('/etc/kubernetes/manifests/kube-controller-manager.yaml'));
  assert.ok(vfs.exists('/etc/kubernetes/manifests/kube-scheduler.yaml'));

  const apiserverYaml = vfs.readFile('/etc/kubernetes/manifests/kube-apiserver.yaml');
  assert.match(apiserverYaml, /kube-apiserver/);
  assert.match(apiserverYaml, /--etcd-servers=https:\/\/127\.0\.0\.1:2379/);

  // Hosts & DNS
  assert.ok(vfs.exists('/etc/hosts'));
  const hosts = vfs.readFile('/etc/hosts');
  assert.match(hosts, /192\.168\.10\.10 k8s-control-plane/);

  assert.ok(vfs.exists('/etc/resolv.conf'));
  const resolv = vfs.readFile('/etc/resolv.conf');
  assert.match(resolv, /nameserver 10\.96\.0\.10/);

  // Kubeconfigs & Learner Environment
  assert.ok(vfs.exists('/etc/kubernetes/admin.conf'));
  assert.ok(vfs.exists('/root/.kube/config'));
  assert.ok(vfs.exists('/home/learner/.kube/config'));
  assert.ok(vfs.exists('/home/learner/.bashrc'));
  assert.ok(vfs.exists('/home/learner/welcome.txt'));

  const bashrc = vfs.readFile('/home/learner/.bashrc');
  assert.match(bashrc, /alias k=kubectl/);

  // Directories exist
  assert.ok(vfs.exists('/var/log/pods'));
  assert.ok(vfs.exists('/var/lib/etcd'));
  assert.ok(vfs.stat('/var/log/pods').isDirectory());
  assert.ok(vfs.stat('/var/lib/etcd').isDirectory());
});

test('Subphase 1.1.2: VFS POSIX permissions, chmod, chown, stat, and lstat', () => {
  const vfs = new VirtualFileSystem();

  vfs.writeFile('/tmp/secure.key', 'PRIVATE-KEY-CONTENT', { mode: 0o600, uid: 1000, gid: 1000 });
  const st = vfs.stat('/tmp/secure.key');
  assert.equal(st.mode, 0o600);
  assert.equal(st.uid, 1000);
  assert.equal(st.gid, 1000);
  assert.equal(st.isFile(), true);
  assert.equal(st.isDirectory(), false);

  // chmod
  vfs.chmod('/tmp/secure.key', 0o644);
  assert.equal(vfs.stat('/tmp/secure.key').mode, 0o644);

  // chown
  vfs.chown('/tmp/secure.key', 0, 0);
  assert.equal(vfs.stat('/tmp/secure.key').uid, 0);
  assert.equal(vfs.stat('/tmp/secure.key').gid, 0);
});

test('Subphase 1.1.2: VFS symlinks, readlink, resolution, and loop detection', () => {
  const vfs = new VirtualFileSystem();

  vfs.writeFile('/etc/target.conf', 'PORT=8080\n');
  vfs.symlink('/etc/target.conf', '/etc/app.conf');

  assert.equal(vfs.readlink('/etc/app.conf'), '/etc/target.conf');
  assert.equal(vfs.lstat('/etc/app.conf').isSymbolicLink(), true);
  assert.equal(vfs.stat('/etc/app.conf').isFile(), true); // stat follows symlink
  assert.equal(vfs.readFile('/etc/app.conf'), 'PORT=8080\n');

  // Relative symlinks
  vfs.symlink('../target.conf', '/etc/kubernetes/link-to-target.conf');
  assert.equal(vfs.readFile('/etc/kubernetes/link-to-target.conf'), 'PORT=8080\n');

  // Symlink loop detection
  vfs.symlink('/tmp/loop-a', '/tmp/loop-b');
  vfs.symlink('/tmp/loop-b', '/tmp/loop-a');
  assert.throws(() => {
    vfs.readFile('/tmp/loop-a');
  }, /ELOOP: too many levels of symbolic links/);
});

test('Subphase 1.1.2: VFS stream redirection and file manipulation', () => {
  const vfs = new VirtualFileSystem();

  // Overwrite (>)
  vfs.redirectOutput('line 1\n', '/home/learner/output.log', false);
  assert.equal(vfs.readFile('/home/learner/output.log'), 'line 1\n');

  // Append (>>)
  vfs.redirectOutput('line 2\n', '/home/learner/output.log', true);
  assert.equal(vfs.readFile('/home/learner/output.log'), 'line 1\nline 2\n');

  // copyFile and rename
  vfs.copyFile('/home/learner/output.log', '/home/learner/output.bak');
  assert.equal(vfs.readFile('/home/learner/output.bak'), 'line 1\nline 2\n');

  vfs.rename('/home/learner/output.bak', '/tmp/output.saved');
  assert.ok(!vfs.exists('/home/learner/output.bak'));
  assert.ok(vfs.exists('/tmp/output.saved'));

  // rm
  vfs.rm('/tmp/output.saved');
  assert.ok(!vfs.exists('/tmp/output.saved'));
});

test('Subphase 1.1.2: VFS watch hooks trigger for direct file and parent directory listeners', () => {
  const vfs = new VirtualFileSystem();

  const events = [];
  const unwatchManifests = vfs.watch('/etc/kubernetes/manifests', (eventType, filePath, content) => {
    events.push({ scope: 'dir', eventType, filePath, contentLength: content ? content.length : null });
  });

  const unwatchSpecific = vfs.watch('/etc/kubernetes/manifests/coredns.yaml', (eventType, filePath) => {
    events.push({ scope: 'file', eventType, filePath });
  });

  // Create a new static manifest
  vfs.writeFile('/etc/kubernetes/manifests/coredns.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: coredns\n');

  // Both the directory watcher and file watcher should receive events
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    scope: 'file',
    eventType: 'create',
    filePath: '/etc/kubernetes/manifests/coredns.yaml'
  });
  assert.deepEqual(events[1], {
    scope: 'dir',
    eventType: 'create',
    filePath: '/etc/kubernetes/manifests/coredns.yaml',
    contentLength: 51
  });

  // Modify manifest
  events.length = 0;
  vfs.appendFile('/etc/kubernetes/manifests/coredns.yaml', 'spec:\n  containers: []\n');
  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, 'change');
  assert.equal(events[1].eventType, 'change');

  // Unwatch file watcher
  unwatchSpecific();
  events.length = 0;
  vfs.rm('/etc/kubernetes/manifests/coredns.yaml');
  assert.equal(events.length, 1);
  assert.equal(events[0].scope, 'dir');
  assert.equal(events[0].eventType, 'delete');

  // Cleanup dir watcher
  unwatchManifests();
});

test('Subphase 1.1.2: VFS exportSnapshot and importSnapshot round-trip preservation', () => {
  const vfsOriginal = new VirtualFileSystem();
  vfsOriginal.writeFile('/home/learner/custom.yaml', 'custom: value', { mode: 0o700, uid: 1000, gid: 1000 });
  vfsOriginal.symlink('/home/learner/custom.yaml', '/tmp/symlink-custom');

  const snapshot = vfsOriginal.exportSnapshot();
  const serialized = JSON.stringify(snapshot);

  const vfsRestored = new VirtualFileSystem();
  vfsRestored.importSnapshot(JSON.parse(serialized));

  assert.ok(vfsRestored.exists('/home/learner/custom.yaml'));
  assert.equal(vfsRestored.readFile('/home/learner/custom.yaml'), 'custom: value');
  assert.equal(vfsRestored.stat('/home/learner/custom.yaml').mode, 0o700);

  assert.ok(vfsRestored.exists('/tmp/symlink-custom'));
  assert.equal(vfsRestored.readFile('/tmp/symlink-custom'), 'custom: value');
  assert.equal(vfsRestored.readlink('/tmp/symlink-custom'), '/home/learner/custom.yaml');
});
