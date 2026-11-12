'use strict';

class VirtualFileSystem {
  constructor(initialTree = null) {
    this.root = {
      type: 'dir',
      name: '',
      children: new Map(),
      mtime: new Date()
    };
    if (initialTree) {
      this.importSnapshot(initialTree);
    } else {
      this.reset();
    }
  }

  normalizePath(rawPath) {
    if (!rawPath) return '/';
    let p = String(rawPath).replace(/\\/g, '/');
    if (!p.startsWith('/')) {
      p = '/home/learner/' + p;
    }
    const parts = p.split('/').filter((seg) => seg.length > 0 && seg !== '.');
    const resolved = [];
    for (const part of parts) {
      if (part === '..') {
        if (resolved.length > 0) resolved.pop();
      } else {
        resolved.push(part);
      }
    }
    return '/' + resolved.join('/');
  }

  traverse(cleanPath, createParents = false) {
    if (cleanPath === '/') return this.root;
    const parts = cleanPath.split('/').filter(Boolean);
    let current = this.root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (current.type !== 'dir') return null;
      let next = current.children.get(part);
      if (!next) {
        if (createParents) {
          next = {
            type: 'dir',
            name: part,
            children: new Map(),
            mtime: new Date()
          };
          current.children.set(part, next);
        } else {
          return null;
        }
      }
      current = next;
    }
    return current;
  }

  mkdir(rawPath, options = { recursive: true }) {
    const cleanPath = this.normalizePath(rawPath);
    if (cleanPath === '/') return true;
    const parts = cleanPath.split('/').filter(Boolean);
    let current = this.root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (current.type !== 'dir') {
        throw new Error(`ENOTDIR: not a directory, '${part}'`);
      }
      let next = current.children.get(part);
      if (!next) {
        if (!options.recursive && i < parts.length - 1) {
          throw new Error(`ENOENT: no such file or directory, '${cleanPath}'`);
        }
        next = {
          type: 'dir',
          name: part,
          children: new Map(),
          mtime: new Date()
        };
        current.children.set(part, next);
      }
      current = next;
    }
    return true;
  }

  writeFile(rawPath, content) {
    const cleanPath = this.normalizePath(rawPath);
    const lastSlash = cleanPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : cleanPath.slice(0, lastSlash);
    const filename = cleanPath.slice(lastSlash + 1);
    if (!filename) {
      throw new Error(`EISDIR: illegal operation on a directory, write '${cleanPath}'`);
    }

    let parent = this.traverse(parentPath, true);
    if (!parent || parent.type !== 'dir') {
      throw new Error(`ENOTDIR: parent path is not a directory '${parentPath}'`);
    }

    const strContent = String(content !== undefined && content !== null ? content : '');
    const fileNode = {
      type: 'file',
      name: filename,
      content: strContent,
      size: Buffer.byteLength(strContent, 'utf8'),
      mtime: new Date()
    };
    parent.children.set(filename, fileNode);
    return fileNode;
  }

  appendFile(rawPath, content) {
    const cleanPath = this.normalizePath(rawPath);
    const existing = this.traverse(cleanPath);
    if (existing) {
      if (existing.type !== 'file') {
        throw new Error(`EISDIR: illegal operation on a directory, append '${cleanPath}'`);
      }
      existing.content += String(content);
      existing.size = Buffer.byteLength(existing.content, 'utf8');
      existing.mtime = new Date();
      return existing;
    }
    return this.writeFile(cleanPath, content);
  }

  readFile(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const node = this.traverse(cleanPath);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, open '${cleanPath}'`);
    }
    if (node.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${cleanPath}'`);
    }
    return node.content;
  }

  exists(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    return this.traverse(cleanPath) !== null;
  }

  stat(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const node = this.traverse(cleanPath);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, stat '${cleanPath}'`);
    }
    return {
      isDirectory: () => node.type === 'dir',
      isFile: () => node.type === 'file',
      size: node.size || 0,
      mtime: node.mtime
    };
  }

  listDir(rawPath = '/') {
    const cleanPath = this.normalizePath(rawPath);
    const node = this.traverse(cleanPath);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory, scandir '${cleanPath}'`);
    }
    if (node.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, scandir '${cleanPath}'`);
    }
    return Array.from(node.children.keys()).sort();
  }

  rm(rawPath, options = { recursive: true }) {
    const cleanPath = this.normalizePath(rawPath);
    if (cleanPath === '/') {
      throw new Error(`EPERM: cannot remove root directory`);
    }
    const lastSlash = cleanPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : cleanPath.slice(0, lastSlash);
    const name = cleanPath.slice(lastSlash + 1);

    const parent = this.traverse(parentPath);
    if (!parent || parent.type !== 'dir') {
      throw new Error(`ENOENT: no such file or directory, rm '${cleanPath}'`);
    }
    const target = parent.children.get(name);
    if (!target) {
      throw new Error(`ENOENT: no such file or directory, rm '${cleanPath}'`);
    }
    if (target.type === 'dir' && !options.recursive && target.children.size > 0) {
      throw new Error(`ENOTEMPTY: directory not empty, rm '${cleanPath}'`);
    }
    parent.children.delete(name);
    return true;
  }

  reset() {
    this.root = {
      type: 'dir',
      name: '',
      children: new Map(),
      mtime: new Date()
    };

    // Pre-populate standard UNIX & Kubernetes directories
    this.mkdir('/etc/kubernetes/manifests');
    this.mkdir('/etc/kubernetes/pki');
    this.mkdir('/var/lib/etcd');
    this.mkdir('/var/log/pods');
    this.mkdir('/home/learner');
    this.mkdir('/tmp');

    // Pre-populate Control Plane static manifests
    this.writeFile(
      '/etc/kubernetes/manifests/kube-apiserver.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  name: kube-apiserver
  namespace: kube-system
  labels:
    component: kube-apiserver
    tier: control-plane
spec:
  containers:
    - name: kube-apiserver
      image: registry.k8s.io/kube-apiserver:v1.32.0
      command:
        - kube-apiserver
        - --advertise-address=192.168.10.10
        - --allow-privileged=true
        - --authorization-mode=Node,RBAC
        - --client-ca-file=/etc/kubernetes/pki/ca.crt
        - --enable-admission-plugins=NodeRestriction,ValidatingAdmissionPolicy
        - --etcd-servers=https://127.0.0.1:2379
        - --secure-port=6443
`
    );

    this.writeFile(
      '/etc/kubernetes/manifests/etcd.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  name: etcd
  namespace: kube-system
  labels:
    component: etcd
    tier: control-plane
spec:
  containers:
    - name: etcd
      image: registry.k8s.io/etcd:3.5.15-0
      command:
        - etcd
        - --advertise-client-urls=https://127.0.0.1:2379
        - --data-dir=/var/lib/etcd
        - --listen-client-urls=https://127.0.0.1:2379
        - --listen-peer-urls=https://127.0.0.1:2380
`
    );

    this.writeFile(
      '/etc/kubernetes/admin.conf',
      `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://192.168.10.10:6443
  name: kubelabs-cluster
contexts:
- context:
    cluster: kubelabs-cluster
    user: kubernetes-admin
  name: kubernetes-admin@kubelabs-cluster
current-context: kubernetes-admin@kubelabs-cluster
users:
- name: kubernetes-admin
`
    );

    this.writeFile(
      '/home/learner/welcome.txt',
      'Welcome to KubeLabs v2.0 Enterprise Cloud-Native Shell!\nRun "kubectl get nodes -o wide" or "ls -la /etc/kubernetes/manifests" to explore.\n'
    );
  }

  exportSnapshot() {
    function serializeNode(node) {
      if (node.type === 'file') {
        return {
          type: 'file',
          name: node.name,
          content: node.content,
          size: node.size,
          mtime: node.mtime.toISOString()
        };
      }
      const children = {};
      for (const [k, v] of node.children.entries()) {
        children[k] = serializeNode(v);
      }
      return {
        type: 'dir',
        name: node.name,
        children,
        mtime: node.mtime.toISOString()
      };
    }
    return serializeNode(this.root);
  }

  importSnapshot(snapshot) {
    function deserializeNode(data) {
      if (!data) return null;
      if (data.type === 'file') {
        return {
          type: 'file',
          name: data.name,
          content: data.content || '',
          size: data.size || 0,
          mtime: data.mtime ? new Date(data.mtime) : new Date()
        };
      }
      const dirNode = {
        type: 'dir',
        name: data.name || '',
        children: new Map(),
        mtime: data.mtime ? new Date(data.mtime) : new Date()
      };
      if (data.children) {
        for (const [k, childData] of Object.entries(data.children)) {
          const childNode = deserializeNode(childData);
          if (childNode) dirNode.children.set(k, childNode);
        }
      }
      return dirNode;
    }
    this.root = deserializeNode(snapshot) || {
      type: 'dir',
      name: '',
      children: new Map(),
      mtime: new Date()
    };
  }
}

module.exports = { VirtualFileSystem };

