'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic In-Memory Virtual File System (VFS)
 * Pure ES2024 module with zero Node-specific globals. Runs identically
 * inside Node.js 22+, Web Workers (PWA/Mobile), and Desktop WebViews.
 */

class VirtualFileSystem {
  constructor(initialTree = null) {
    this.root = {
      type: 'dir',
      name: '',
      mode: 0o755,
      uid: 0,
      gid: 0,
      size: 4096,
      children: new Map(),
      mtime: new Date()
    };
    this.watchers = new Map(); // path -> Set<callback>

    if (initialTree) {
      this.importSnapshot(initialTree);
    } else {
      this.reset();
    }
  }

  /**
   * Helper to calculate UTF-8 byte length isomorphically (Node & Browser)
   */
  _byteLength(str) {
    if (typeof str !== 'string') return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    // Fallback if TextEncoder is unavailable
    return encodeURI(str).split(/%(?:u[0-9A-F]{4}|[0-9A-F]{2})/i).length - 1;
  }

  /**
   * Normalizes raw UNIX/Windows paths into standard POSIX absolute path
   */
  normalizePath(rawPath, cwd = '/home/learner') {
    if (!rawPath) return cwd;
    let p = String(rawPath).replace(/\\/g, '/');
    if (!p.startsWith('/')) {
      const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
      p = `${base}/${p}`;
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

  /**
   * Resolves a path, traversing directories and optionally resolving symlinks
   * @param {string} rawPath 
   * @param {object} options { followSymlinks = true, maxLinks = 40, cwd = '/home/learner' }
   * @returns {{ node: object|null, parent: object|null, name: string, canonicalPath: string }}
   */
  resolve(rawPath, options = {}) {
    const followFinalSymlink = options.followSymlinks !== false;
    const maxLinks = typeof options.maxLinks === 'number' ? options.maxLinks : 40;
    const cwd = options.cwd || '/home/learner';

    let currentPath = this.normalizePath(rawPath, cwd);
    let linkCount = 0;

    while (true) {
      if (currentPath === '/') {
        return {
          node: this.root,
          parent: null,
          name: '',
          canonicalPath: '/'
        };
      }

      const parts = currentPath.split('/').filter(Boolean);
      let currentNode = this.root;
      let parentNode = null;
      let partName = '';
      let isSymlinkFollowed = false;

      for (let i = 0; i < parts.length; i++) {
        partName = parts[i];
        const isFinal = i === parts.length - 1;

        if (currentNode.type !== 'dir') {
          return { node: null, parent: null, name: partName, canonicalPath: currentPath };
        }

        parentNode = currentNode;
        const nextNode = currentNode.children.get(partName);

        if (!nextNode) {
          return { node: null, parent: parentNode, name: partName, canonicalPath: currentPath };
        }

        // Check if nextNode is a symlink that needs resolution
        if (nextNode.type === 'symlink') {
          if (!isFinal || followFinalSymlink) {
            linkCount++;
            if (linkCount > maxLinks) {
              throw new Error(`ELOOP: too many levels of symbolic links, '${currentPath}'`);
            }
            // Resolve symlink target relative to current directory
            const parentDir = '/' + parts.slice(0, i).join('/');
            let target = nextNode.target;
            if (!target.startsWith('/')) {
              target = this.normalizePath(target, parentDir);
            }
            // Reconstruct remaining path
            const remaining = parts.slice(i + 1);
            if (remaining.length > 0) {
              currentPath = this.normalizePath(remaining.join('/'), target);
            } else {
              currentPath = this.normalizePath(target);
            }
            isSymlinkFollowed = true;
            break; // Restart traversal from resolved target
          }
        }

        currentNode = nextNode;
      }

      if (!isSymlinkFollowed) {
        return {
          node: currentNode,
          parent: parentNode,
          name: partName,
          canonicalPath: currentPath
        };
      }
    }
  }

  mkdir(rawPath, options = {}) {
    const recursive = options.recursive !== false;
    const mode = options.mode !== undefined ? options.mode : 0o755;
    const uid = options.uid !== undefined ? options.uid : 0;
    const gid = options.gid !== undefined ? options.gid : 0;

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
        if (!recursive && i < parts.length - 1) {
          throw new Error(`ENOENT: no such file or directory, '${cleanPath}'`);
        }
        next = {
          type: 'dir',
          name: part,
          mode: mode,
          uid: uid,
          gid: gid,
          size: 4096,
          children: new Map(),
          mtime: new Date()
        };
        current.children.set(part, next);
        this._notifyWatchers('create', '/' + parts.slice(0, i + 1).join('/'), null);
      }
      current = next;
    }
    return true;
  }

  writeFile(rawPath, content, options = {}) {
    const mode = options.mode !== undefined ? options.mode : 0o644;
    const uid = options.uid !== undefined ? options.uid : 0;
    const gid = options.gid !== undefined ? options.gid : 0;

    const cleanPath = this.normalizePath(rawPath);
    const lastSlash = cleanPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : cleanPath.slice(0, lastSlash);
    const filename = cleanPath.slice(lastSlash + 1);

    if (!filename) {
      throw new Error(`EISDIR: illegal operation on a directory, write '${cleanPath}'`);
    }

    const { node: parentNode } = this.resolve(parentPath, { followSymlinks: true });
    if (!parentNode) {
      // Auto-create parents if not present or throw
      this.mkdir(parentPath, { recursive: true });
    }
    const resolvedParent = this.resolve(parentPath, { followSymlinks: true }).node;
    if (!resolvedParent || resolvedParent.type !== 'dir') {
      throw new Error(`ENOTDIR: parent path is not a directory '${parentPath}'`);
    }

    const strContent = String(content !== undefined && content !== null ? content : '');
    const byteSize = this._byteLength(strContent);
    const existing = resolvedParent.children.get(filename);
    const eventType = existing ? 'change' : 'create';

    const fileNode = {
      type: 'file',
      name: filename,
      content: strContent,
      mode: existing ? existing.mode : mode,
      uid: existing ? existing.uid : uid,
      gid: existing ? existing.gid : gid,
      size: byteSize,
      mtime: new Date()
    };

    resolvedParent.children.set(filename, fileNode);
    this._notifyWatchers(eventType, cleanPath, strContent);
    return fileNode;
  }

  appendFile(rawPath, content, options = {}) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (res.node) {
      if (res.node.type !== 'file') {
        throw new Error(`EISDIR: illegal operation on a directory, append '${cleanPath}'`);
      }
      res.node.content += String(content !== undefined && content !== null ? content : '');
      res.node.size = this._byteLength(res.node.content);
      res.node.mtime = new Date();
      this._notifyWatchers('change', res.canonicalPath, res.node.content);
      return res.node;
    }
    return this.writeFile(cleanPath, content, options);
  }

  readFile(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, open '${cleanPath}'`);
    }
    if (res.node.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${cleanPath}'`);
    }
    return res.node.content;
  }

  exists(rawPath) {
    try {
      const cleanPath = this.normalizePath(rawPath);
      const res = this.resolve(cleanPath, { followSymlinks: true });
      return res.node !== null;
    } catch {
      return false;
    }
  }

  stat(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, stat '${cleanPath}'`);
    }
    const node = res.node;
    return {
      isDirectory: () => node.type === 'dir',
      isFile: () => node.type === 'file',
      isSymbolicLink: () => node.type === 'symlink',
      size: node.size || 0,
      mode: node.mode,
      uid: node.uid,
      gid: node.gid,
      mtime: node.mtime
    };
  }

  lstat(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: false });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, lstat '${cleanPath}'`);
    }
    const node = res.node;
    return {
      isDirectory: () => node.type === 'dir',
      isFile: () => node.type === 'file',
      isSymbolicLink: () => node.type === 'symlink',
      size: node.size || 0,
      mode: node.mode,
      uid: node.uid,
      gid: node.gid,
      mtime: node.mtime,
      target: node.target
    };
  }

  symlink(target, linkPath, options = {}) {
    const cleanPath = this.normalizePath(linkPath);
    const lastSlash = cleanPath.lastIndexOf('/');
    const parentPath = lastSlash === 0 ? '/' : cleanPath.slice(0, lastSlash);
    const linkName = cleanPath.slice(lastSlash + 1);

    if (!linkName) {
      throw new Error(`EINVAL: invalid argument, symlink '${linkPath}'`);
    }

    const { node: parentNode } = this.resolve(parentPath, { followSymlinks: true });
    if (!parentNode || parentNode.type !== 'dir') {
      throw new Error(`ENOENT: no such directory '${parentPath}'`);
    }

    if (parentNode.children.has(linkName)) {
      throw new Error(`EEXIST: file already exists, symlink '${linkPath}'`);
    }

    const symlinkNode = {
      type: 'symlink',
      name: linkName,
      target: String(target),
      mode: 0o777,
      uid: options.uid !== undefined ? options.uid : 0,
      gid: options.gid !== undefined ? options.gid : 0,
      size: this._byteLength(String(target)),
      mtime: new Date()
    };

    parentNode.children.set(linkName, symlinkNode);
    this._notifyWatchers('create', cleanPath, null);
    return symlinkNode;
  }

  readlink(rawPath) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: false });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, readlink '${cleanPath}'`);
    }
    if (res.node.type !== 'symlink') {
      throw new Error(`EINVAL: invalid argument, not a symbolic link '${cleanPath}'`);
    }
    return res.node.target;
  }

  chmod(rawPath, mode) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, chmod '${cleanPath}'`);
    }

    let parsedMode;
    if (typeof mode === 'number') {
      parsedMode = mode;
    } else if (typeof mode === 'string') {
      const trimmed = mode.trim();
      if (/^[0-7]{3,4}$/.test(trimmed)) {
        parsedMode = parseInt(trimmed, 8);
      } else if (trimmed.includes('+') || trimmed.includes('-')) {
        let currentMode = res.node.mode || 0o644;
        const add = trimmed.includes('+');
        const flag = trimmed.slice(trimmed.indexOf(add ? '+' : '-') + 1);
        let bits = 0;
        if (flag.includes('r')) bits |= 0o444;
        if (flag.includes('w')) bits |= 0o222;
        if (flag.includes('x')) bits |= 0o111;
        parsedMode = add ? (currentMode | bits) : (currentMode & ~bits);
      } else {
        parsedMode = parseInt(trimmed, 8) || 0o644;
      }
    } else {
      parsedMode = 0o644;
    }

    res.node.mode = parsedMode;
    res.node.mtime = new Date();
    this._notifyWatchers('change', res.canonicalPath, null);
    return true;
  }

  chown(rawPath, uid, gid) {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, chown '${cleanPath}'`);
    }

    const parseId = (val, defaultVal = 0) => {
      if (val === undefined || val === null) return defaultVal;
      if (typeof val === 'number') return val;
      const str = String(val).trim();
      if (str === 'root') return 0;
      if (str === 'learner' || str === 'ubuntu' || str === 'node') return 1000;
      const parsed = parseInt(str, 10);
      return isNaN(parsed) ? defaultVal : parsed;
    };

    let targetUid = uid;
    let targetGid = gid;

    if (typeof uid === 'string' && uid.includes(':')) {
      const parts = uid.split(':');
      targetUid = parts[0];
      targetGid = parts[1];
    }

    if (targetUid !== undefined && targetUid !== null) res.node.uid = parseId(targetUid, 0);
    if (targetGid !== undefined && targetGid !== null) res.node.gid = parseId(targetGid, 0);
    res.node.mtime = new Date();
    this._notifyWatchers('change', res.canonicalPath, null);
    return true;
  }

  listDir(rawPath = '/') {
    const cleanPath = this.normalizePath(rawPath);
    const res = this.resolve(cleanPath, { followSymlinks: true });
    if (!res.node) {
      throw new Error(`ENOENT: no such file or directory, scandir '${cleanPath}'`);
    }
    if (res.node.type !== 'dir') {
      throw new Error(`ENOTDIR: not a directory, scandir '${cleanPath}'`);
    }
    return Array.from(res.node.children.keys()).sort();
  }

  readdir(rawPath = '/') {
    return this.listDir(rawPath);
  }

  rm(rawPath, options = {}) {
    const recursive = options.recursive !== false;
    const cleanPath = this.normalizePath(rawPath);
    if (cleanPath === '/') {
      throw new Error(`EPERM: cannot remove root directory`);
    }

    // Notice we do NOT follow the final symlink when deleting it!
    const res = this.resolve(cleanPath, { followSymlinks: false });
    if (!res.node || !res.parent) {
      throw new Error(`ENOENT: no such file or directory, rm '${cleanPath}'`);
    }

    const targetNode = res.node;
    if (targetNode.type === 'dir' && !recursive && targetNode.children.size > 0) {
      throw new Error(`ENOTEMPTY: directory not empty, rm '${cleanPath}'`);
    }

    res.parent.children.delete(res.name);
    this._notifyWatchers('delete', cleanPath, null);
    return true;
  }

  unlink(rawPath) {
    return this.rm(rawPath, { recursive: false });
  }

  rmdir(rawPath, options = {}) {
    return this.rm(rawPath, options);
  }

  copyFile(srcPath, destPath) {
    const content = this.readFile(srcPath);
    const srcStat = this.stat(srcPath);
    return this.writeFile(destPath, content, {
      mode: srcStat.mode,
      uid: srcStat.uid,
      gid: srcStat.gid
    });
  }

  cp(srcPath, destPath, options = {}) {
    const recursive = options.recursive !== false;
    const cleanSrc = this.normalizePath(srcPath);
    let cleanDest = this.normalizePath(destPath);

    const srcStat = this.stat(cleanSrc);
    if (srcStat.isDirectory()) {
      if (!recursive) {
        throw new Error(`EISDIR: -r not specified; omitting directory '${cleanSrc}'`);
      }
      if (this.exists(cleanDest) && this.stat(cleanDest).isDirectory()) {
        const srcBase = cleanSrc.split('/').filter(Boolean).pop();
        cleanDest = this.normalizePath(srcBase, cleanDest);
      }
      this.mkdir(cleanDest, { recursive: true, mode: srcStat.mode, uid: srcStat.uid, gid: srcStat.gid });
      const entries = this.listDir(cleanSrc);
      for (const entry of entries) {
        this.cp(`${cleanSrc}/${entry}`, `${cleanDest}/${entry}`, { recursive: true });
      }
      return true;
    }

    if (this.exists(cleanDest) && this.stat(cleanDest).isDirectory()) {
      const srcBase = cleanSrc.split('/').filter(Boolean).pop();
      cleanDest = this.normalizePath(srcBase, cleanDest);
    }
    return this.copyFile(cleanSrc, cleanDest);
  }

  find(startPath = '/', options = {}) {
    const cleanStart = this.normalizePath(startPath);
    if (!this.exists(cleanStart)) {
      throw new Error(`ENOENT: no such file or directory, find '${cleanStart}'`);
    }
    const results = [];
    const namePattern = options.name ? new RegExp('^' + options.name.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$') : null;
    const typeFilter = options.type;

    const traverse = (p) => {
      const stat = this.stat(p);
      const isDir = stat.isDirectory();
      const base = p.split('/').filter(Boolean).pop() || '/';

      let match = true;
      if (typeFilter === 'f' && isDir) match = false;
      if (typeFilter === 'd' && !isDir) match = false;
      if (namePattern && !namePattern.test(base)) match = false;

      if (match) results.push(p);

      if (isDir) {
        try {
          const children = this.listDir(p);
          for (const c of children) {
            traverse(p === '/' ? `/${c}` : `${p}/${c}`);
          }
        } catch {
          // ignore
        }
      }
    };

    traverse(cleanStart);
    return results;
  }

  rename(oldPath, newPath) {
    const cleanOld = this.normalizePath(oldPath);
    const cleanNew = this.normalizePath(newPath);

    if (cleanOld === '/') throw new Error('EPERM: cannot rename root');
    const oldRes = this.resolve(cleanOld, { followSymlinks: false });
    if (!oldRes.node || !oldRes.parent) {
      throw new Error(`ENOENT: no such file or directory, rename '${cleanOld}'`);
    }

    const lastSlash = cleanNew.lastIndexOf('/');
    const newParentPath = lastSlash === 0 ? '/' : cleanNew.slice(0, lastSlash);
    const newName = cleanNew.slice(lastSlash + 1);

    const newParentRes = this.resolve(newParentPath, { followSymlinks: true });
    if (!newParentRes.node || newParentRes.node.type !== 'dir') {
      throw new Error(`ENOENT: target directory does not exist '${newParentPath}'`);
    }

    // Detach from old parent
    oldRes.parent.children.delete(oldRes.name);
    // Attach to new parent
    oldRes.node.name = newName;
    newParentRes.node.children.set(newName, oldRes.node);

    this._notifyWatchers('delete', cleanOld, null);
    this._notifyWatchers('create', cleanNew, null);
    return true;
  }

  /**
   * Helper for stream redirection (command > file or command >> file)
   */
  redirectOutput(content, targetPath, append = false) {
    if (append) {
      return this.appendFile(targetPath, content);
    }
    return this.writeFile(targetPath, content);
  }

  /**
   * Watches a specific file or directory. Returns unwatch function.
   * @param {string} pathOrDir 
   * @param {function(eventType: 'create'|'change'|'delete', filepath: string, content: string|null): void} callback 
   * @returns {function(): void}
   */
  watch(pathOrDir, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('watch callback must be a function');
    }
    const cleanPath = this.normalizePath(pathOrDir);
    if (!this.watchers.has(cleanPath)) {
      this.watchers.set(cleanPath, new Set());
    }
    const bucket = this.watchers.get(cleanPath);
    bucket.add(callback);

    return () => {
      bucket.delete(callback);
      if (bucket.size === 0) {
        this.watchers.delete(cleanPath);
      }
    };
  }

  _notifyWatchers(eventType, targetPath, content) {
    if (this.watchers.size === 0) return;
    const cleanPath = this.normalizePath(targetPath);

    // 1. Direct file matches
    if (this.watchers.has(cleanPath)) {
      for (const cb of this.watchers.get(cleanPath)) {
        try {
          cb(eventType, cleanPath, content);
        } catch (err) {
          console.error('Error in VFS watch callback:', err);
        }
      }
    }

    // 2. Parent directory matches
    let parent = cleanPath;
    while (parent && parent !== '/') {
      const idx = parent.lastIndexOf('/');
      parent = idx === 0 ? '/' : parent.slice(0, idx);
      if (this.watchers.has(parent)) {
        for (const cb of this.watchers.get(parent)) {
          try {
            cb(eventType, cleanPath, content);
          } catch (err) {
            console.error('Error in VFS dir watch callback:', err);
          }
        }
      }
    }
  }

  /**
   * Pre-populates standard Kubernetes, UNIX, and Learner file structures
   */
  reset() {
    this.root = {
      type: 'dir',
      name: '',
      mode: 0o755,
      uid: 0,
      gid: 0,
      size: 4096,
      children: new Map(),
      mtime: new Date()
    };
    this.watchers.clear();

    // Standard UNIX Directories
    this.mkdir('/bin');
    this.mkdir('/etc/kubernetes/manifests');
    this.mkdir('/etc/kubernetes/pki');
    this.mkdir('/etc/sysctl.d');
    this.mkdir('/var/lib/etcd');
    this.mkdir('/var/log/pods');
    this.mkdir('/var/log/nginx');
    this.mkdir('/sys/fs/cgroup/system.slice/kubelet.service');
    this.mkdir('/sys/fs/cgroup/system.slice/containerd.service');
    this.mkdir('/root/.kube');
    this.mkdir('/home/learner/.kube');
    this.mkdir('/tmp', { mode: 0o1777 });

    // Linux cgroups v2 resource hierarchy
    this.writeFile('/sys/fs/cgroup/cpu.max', 'max 100000\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/memory.max', 'max\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/cgroup.procs', '1\n2\n100\n1420\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/system.slice/kubelet.service/cpu.max', 'max 100000\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/system.slice/kubelet.service/memory.max', '2147483648\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/system.slice/containerd.service/cpu.max', 'max 100000\n', { mode: 0o644, uid: 0, gid: 0 });
    this.writeFile('/sys/fs/cgroup/system.slice/containerd.service/memory.max', '1073741824\n', { mode: 0o644, uid: 0, gid: 0 });

    // Linux kernel sysctl CRI defaults
    this.writeFile(
      '/etc/sysctl.d/99-kubernetes-cri.conf',
      'net.bridge.bridge-nf-call-iptables = 1\nnet.ipv4.ip_forward = 1\nnet.bridge.bridge-nf-call-ip6tables = 1\n',
      { mode: 0o644, uid: 0, gid: 0 }
    );

    // Production Access Log Sample for Streaming Pipelines
    this.writeFile(
      '/var/log/nginx/access.log',
      '192.168.1.10 - - [14/Nov/2026:08:00:01 +0000] "GET /api/v1/health HTTP/1.1" 200 45 "-" "curl/7.88.1"\n' +
      '192.168.1.105 - - [14/Nov/2026:08:00:15 +0000] "POST /api/v1/checkout HTTP/1.1" 500 128 "-" "Mozilla/5.0"\n' +
      '192.168.1.105 - - [14/Nov/2026:08:00:18 +0000] "POST /api/v1/checkout HTTP/1.1" 500 128 "-" "Mozilla/5.0"\n' +
      '192.168.1.42 - - [14/Nov/2026:08:01:22 +0000] "GET /index.html HTTP/1.1" 200 2340 "-" "Mozilla/5.0"\n' +
      '192.168.1.105 - - [14/Nov/2026:08:01:45 +0000] "POST /api/v1/checkout HTTP/1.1" 500 128 "-" "Mozilla/5.0"\n' +
      '192.168.1.99 - - [14/Nov/2026:08:02:10 +0000] "GET /api/v1/items HTTP/1.1" 200 892 "-" "curl/7.88.1"\n',
      { mode: 0o644, uid: 0, gid: 0 }
    );

    // Host & DNS Configuration
    this.writeFile(
      '/etc/hosts',
      `127.0.0.1 localhost\n::1 localhost ip6-localhost ip6-loopback\n192.168.10.10 k8s-control-plane control-plane.kubelabs.internal\n192.168.10.11 k8s-worker-01 worker1.kubelabs.internal\n192.168.10.12 k8s-worker-02 worker2.kubelabs.internal\n`,
      { mode: 0o644, uid: 0, gid: 0 }
    );

    this.writeFile(
      '/etc/resolv.conf',
      `nameserver 10.96.0.10\nsearch default.svc.cluster.local svc.cluster.local cluster.local\noptions ndots:5\n`,
      { mode: 0o644, uid: 0, gid: 0 }
    );

    // PKI Certificate Authority & Control Plane Certs
    this.writeFile(
      '/etc/kubernetes/pki/ca.crt',
      `-----BEGIN CERTIFICATE-----\nMIICyDCCAbCgAwIBAgIBADANBgkqhkiG9w0BAQsFADAVMRMwEQYDVQQDEwprdWJl\ncm5ldGVzMB4XDTI2MTExMjAwMDAwMFoXDTM2MTExMDAwMDAwMFowFTETMBEGA1UE\nAxMKa3ViZXJuZXRlczCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAL0=\n-----END CERTIFICATE-----\n`,
      { mode: 0o644, uid: 0, gid: 0 }
    );
    this.writeFile(
      '/etc/kubernetes/pki/apiserver.crt',
      `-----BEGIN CERTIFICATE-----\nMIIDITCCAgmgAwIBAgIIZ1vMOCKCERTIFICATEFORKUBELABSINSPECTION...\n-----END CERTIFICATE-----\n`,
      { mode: 0o644, uid: 0, gid: 0 }
    );
    this.writeFile(
      '/etc/kubernetes/pki/apiserver.key',
      `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0mockKeyGeneratedByKubeLabs2048bitKeyValidIsomorphic==\n-----END RSA PRIVATE KEY-----\n`,
      { mode: 0o600, uid: 0, gid: 0 }
    );

    // Kubernetes Admin Kubeconfig
    const adminKubeconfig = `apiVersion: v1
clusters:
- cluster:
    certificate-authority: /etc/kubernetes/pki/ca.crt
    server: https://192.168.10.10:6443
  name: kubelabs-cluster
contexts:
- context:
    cluster: kubelabs-cluster
    user: kubernetes-admin
  name: kubernetes-admin@kubelabs-cluster
current-context: kubernetes-admin@kubelabs-cluster
kind: Config
preferences: {}
users:
- name: kubernetes-admin
  user:
    client-certificate-data: LS0tLS1CRUdJTi...
    client-key-data: LS0tLS1CRUdJTi...
`;
    this.writeFile('/etc/kubernetes/admin.conf', adminKubeconfig, { mode: 0o600, uid: 0, gid: 0 });

    // Root and Learner Kubeconfigs
    this.writeFile('/root/.kube/config', adminKubeconfig, { mode: 0o600, uid: 0, gid: 0 });
    this.writeFile('/home/learner/.kube/config', adminKubeconfig, { mode: 0o600, uid: 1000, gid: 1000 });

    // Learner Environment (.bashrc, welcome)
    this.writeFile(
      '/home/learner/.bashrc',
      `# KubeLabs v3.0 Learner Environment\nexport KUBECONFIG=/home/learner/.kube/config\nalias k=kubectl\nalias kgp="kubectl get pods"\nalias kgs="kubectl get svc"\nalias kgn="kubectl get nodes"\nalias kd="kubectl describe"\nsource <(kubectl completion bash 2>/dev/null || true)\ncomplete -o default -F __start_kubectl k 2>/dev/null || true\n`,
      { mode: 0o644, uid: 1000, gid: 1000 }
    );

    this.writeFile(
      '/home/learner/welcome.txt',
      `Welcome to KubeLabs v3.0 Enterprise Cloud-Native Shell!\nRun "kubectl get nodes -o wide" or "ls -la /etc/kubernetes/manifests" to explore.\nAll core controllers, real AST parsing, and live reconciliation are active.\n`,
      { mode: 0o644, uid: 1000, gid: 1000 }
    );

    // Control Plane Static Pod Manifests
    this.writeFile(
      '/etc/kubernetes/manifests/kube-apiserver.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  annotations:
    kubeadm.kubernetes.io/kube-apiserver.advertise-address.endpoint: 192.168.10.10:6443
  labels:
    component: kube-apiserver
    tier: control-plane
  name: kube-apiserver
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-apiserver
    - --advertise-address=192.168.10.10
    - --allow-privileged=true
    - --authorization-mode=Node,RBAC
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --enable-admission-plugins=NodeRestriction,ValidatingAdmissionPolicy
    - --enable-bootstrap-token-auth=true
    - --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt
    - --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt
    - --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key
    - --etcd-servers=https://127.0.0.1:2379
    - --kubelet-client-certificate=/etc/kubernetes/pki/apiserver-kubelet-client.crt
    - --kubelet-client-key=/etc/kubernetes/pki/apiserver-kubelet-client.key
    - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
    - --proxy-client-cert-file=/etc/kubernetes/pki/front-proxy-client.crt
    - --proxy-client-key-file=/etc/kubernetes/pki/front-proxy-client.key
    - --requestheader-allowed-names=front-proxy-client
    - --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt
    - --secure-port=6443
    - --service-account-issuer=https://kubernetes.default.svc.cluster.local
    - --service-account-key-file=/etc/kubernetes/pki/sa.pub
    - --service-account-signing-key-file=/etc/kubernetes/pki/sa.key
    - --service-cluster-ip-range=10.96.0.0/12
    - --tls-cert-file=/etc/kubernetes/pki/apiserver.crt
    - --tls-private-key-file=/etc/kubernetes/pki/apiserver.key
    image: registry.k8s.io/kube-apiserver:v1.32.0
    imagePullPolicy: IfNotPresent
    livenessProbe:
      httpGet:
        host: 127.0.0.1
        path: /livez
        port: 6443
        scheme: HTTPS
      initialDelaySeconds: 10
      periodSeconds: 10
      timeoutSeconds: 15
    name: kube-apiserver
    readinessProbe:
      httpGet:
        host: 127.0.0.1
        path: /readyz
        port: 6443
        scheme: HTTPS
      periodSeconds: 1
      timeoutSeconds: 15
    resources:
      requests:
        cpu: 250m
        memory: 512Mi
  hostNetwork: true
  priorityClassName: system-node-critical
  securityContext:
    seccompProfile:
      type: RuntimeDefault
`,
      { mode: 0o600, uid: 0, gid: 0 }
    );

    this.writeFile(
      '/etc/kubernetes/manifests/etcd.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  labels:
    component: etcd
    tier: control-plane
  name: etcd
  namespace: kube-system
spec:
  containers:
  - command:
    - etcd
    - --advertise-client-urls=https://127.0.0.1:2379
    - --cert-file=/etc/kubernetes/pki/etcd/server.crt
    - --client-cert-auth=true
    - --data-dir=/var/lib/etcd
    - --initial-advertise-peer-urls=https://127.0.0.1:2380
    - --initial-cluster=k8s-control-plane=https://127.0.0.1:2380
    - --key-file=/etc/kubernetes/pki/etcd/server.key
    - --listen-client-urls=https://127.0.0.1:2379
    - --listen-metrics-urls=http://127.0.0.1:2381
    - --listen-peer-urls=https://127.0.0.1:2380
    - --peer-cert-file=/etc/kubernetes/pki/etcd/peer.crt
    - --peer-client-cert-auth=true
    - --peer-key-file=/etc/kubernetes/pki/etcd/peer.key
    - --snapshot-count=10000
    image: registry.k8s.io/etcd:3.5.15-0
    imagePullPolicy: IfNotPresent
    name: etcd
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
  hostNetwork: true
  priorityClassName: system-node-critical
  securityContext:
    seccompProfile:
      type: RuntimeDefault
`,
      { mode: 0o600, uid: 0, gid: 0 }
    );

    this.writeFile(
      '/etc/kubernetes/manifests/kube-controller-manager.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  labels:
    component: kube-controller-manager
    tier: control-plane
  name: kube-controller-manager
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-controller-manager
    - --allocate-node-cidrs=true
    - --authentication-kubeconfig=/etc/kubernetes/controller-manager.conf
    - --authorization-kubeconfig=/etc/kubernetes/controller-manager.conf
    - --bind-address=127.0.0.1
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --cluster-cidr=10.244.0.0/16
    - --cluster-name=kubernetes
    - --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt
    - --cluster-signing-key-file=/etc/kubernetes/pki/ca.key
    - --controllers=*,bootstrapsigner,tokencleaner
    - --kubeconfig=/etc/kubernetes/controller-manager.conf
    - --leader-elect=true
    - --root-ca-file=/etc/kubernetes/pki/ca.crt
    - --service-account-private-key-file=/etc/kubernetes/pki/sa.key
    - --use-service-account-credentials=true
    image: registry.k8s.io/kube-controller-manager:v1.32.0
    imagePullPolicy: IfNotPresent
    name: kube-controller-manager
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
  hostNetwork: true
  priorityClassName: system-node-critical
`,
      { mode: 0o600, uid: 0, gid: 0 }
    );

    this.writeFile(
      '/etc/kubernetes/manifests/kube-scheduler.yaml',
      `apiVersion: v1
kind: Pod
metadata:
  labels:
    component: kube-scheduler
    tier: control-plane
  name: kube-scheduler
  namespace: kube-system
spec:
  containers:
  - command:
    - kube-scheduler
    - --authentication-kubeconfig=/etc/kubernetes/scheduler.conf
    - --authorization-kubeconfig=/etc/kubernetes/scheduler.conf
    - --bind-address=127.0.0.1
    - --kubeconfig=/etc/kubernetes/scheduler.conf
    - --leader-elect=true
    image: registry.k8s.io/kube-scheduler:v1.32.0
    imagePullPolicy: IfNotPresent
    name: kube-scheduler
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
  hostNetwork: true
  priorityClassName: system-node-critical
`,
      { mode: 0o600, uid: 0, gid: 0 }
    );
  }

  exportSnapshot() {
    function serializeNode(node) {
      if (node.type === 'file') {
        return {
          type: 'file',
          name: node.name,
          mode: node.mode,
          uid: node.uid,
          gid: node.gid,
          size: node.size,
          content: node.content,
          mtime: node.mtime instanceof Date ? node.mtime.toISOString() : new Date().toISOString()
        };
      }
      if (node.type === 'symlink') {
        return {
          type: 'symlink',
          name: node.name,
          target: node.target,
          mode: node.mode,
          uid: node.uid,
          gid: node.gid,
          size: node.size,
          mtime: node.mtime instanceof Date ? node.mtime.toISOString() : new Date().toISOString()
        };
      }
      const children = {};
      for (const [k, v] of node.children.entries()) {
        children[k] = serializeNode(v);
      }
      return {
        type: 'dir',
        name: node.name,
        mode: node.mode,
        uid: node.uid,
        gid: node.gid,
        size: node.size,
        children,
        mtime: node.mtime instanceof Date ? node.mtime.toISOString() : new Date().toISOString()
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
          mode: data.mode !== undefined ? data.mode : 0o644,
          uid: data.uid !== undefined ? data.uid : 0,
          gid: data.gid !== undefined ? data.gid : 0,
          size: data.size || 0,
          mtime: data.mtime ? new Date(data.mtime) : new Date()
        };
      }
      if (data.type === 'symlink') {
        return {
          type: 'symlink',
          name: data.name,
          target: data.target || '',
          mode: data.mode !== undefined ? data.mode : 0o777,
          uid: data.uid !== undefined ? data.uid : 0,
          gid: data.gid !== undefined ? data.gid : 0,
          size: data.size || 0,
          mtime: data.mtime ? new Date(data.mtime) : new Date()
        };
      }
      const dirNode = {
        type: 'dir',
        name: data.name || '',
        mode: data.mode !== undefined ? data.mode : 0o755,
        uid: data.uid !== undefined ? data.uid : 0,
        gid: data.gid !== undefined ? data.gid : 0,
        size: data.size || 4096,
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
      mode: 0o755,
      uid: 0,
      gid: 0,
      size: 4096,
      children: new Map(),
      mtime: new Date()
    };
    this.watchers.clear();
  }
}

// Dual ESM and CommonJS export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VirtualFileSystem };
}
export { VirtualFileSystem };

