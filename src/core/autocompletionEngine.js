'use strict';

/**
 * KubeLabs v4.0 - Context-Aware Tab Autocompletion Engine
 * 
 * Provides intelligent context-sensitive command, flag, resource, and VFS path completion.
 * Queries live ResourceGraph, VirtualCluster, and VirtualFileSystem.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let cliFormatterModule;
    try {
      cliFormatterModule = require('./cliFormatter');
    } catch {
      cliFormatterModule = (typeof globalThis !== 'undefined' && globalThis.cliFormatterModule) || {};
    }
    module.exports = factory(cliFormatterModule);
  } else {
    root.AutocompletionEngine = factory(root.cliFormatterModule || {});
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (cliFormatter) {

  const normalizeKind = cliFormatter.normalizeKind || function (k) {
    if (!k) return '';
    const s = String(k).toLowerCase();
    if (s === 'po' || s === 'pod' || s === 'pods') return 'Pod';
    if (s === 'deploy' || s === 'deployment' || s === 'deployments') return 'Deployment';
    if (s === 'svc' || s === 'service' || s === 'services') return 'Service';
    if (s === 'no' || s === 'node' || s === 'nodes') return 'Node';
    if (s === 'ns' || s === 'namespace' || s === 'namespaces') return 'Namespace';
    if (s === 'cm' || s === 'configmap' || s === 'configmaps') return 'ConfigMap';
    if (s === 'secret' || s === 'secrets') return 'Secret';
    if (s === 'ing' || s === 'ingress' || s === 'ingresses') return 'Ingress';
    if (s === 'netpol' || s === 'networkpolicy' || s === 'networkpolicies') return 'NetworkPolicy';
    if (s === 'pvc' || s === 'persistentvolumeclaim' || s === 'persistentvolumeclaims') return 'PersistentVolumeClaim';
    if (s === 'pv' || s === 'persistentvolume' || s === 'persistentvolumes') return 'PersistentVolume';
    if (s === 'sts' || s === 'statefulset' || s === 'statefulsets') return 'StatefulSet';
    if (s === 'ds' || s === 'daemonset' || s === 'daemonsets') return 'DaemonSet';
    if (s === 'sa' || s === 'serviceaccount' || s === 'serviceaccounts') return 'ServiceAccount';
    if (s === 'sc' || s === 'storageclass' || s === 'storageclasses') return 'StorageClass';
    return k.charAt(0).toUpperCase() + k.slice(1);
  };

  const CLUSTER_SCOPED_KINDS = cliFormatter.CLUSTER_SCOPED_KINDS || new Set([
    'Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding',
    'StorageClass', 'PersistentVolume', 'CustomResourceDefinition'
  ]);

  const KUBECTL_VERBS = [
    'get', 'describe', 'apply', 'create', 'delete', 'edit',
    'patch', 'scale', 'rollout', 'logs', 'exec', 'top',
    'cordon', 'uncordon', 'drain', 'taint', 'label', 'annotate',
    'auth', 'cluster-info', 'version', 'diff', 'wait', 'config',
    'explain', 'run', 'debug', 'replace', 'set'
  ];

  const KUBECTL_KINDS = [
    'pods', 'deployments', 'services', 'nodes', 'namespaces',
    'configmaps', 'secrets', 'networkpolicies', 'ingresses',
    'statefulsets', 'daemonsets', 'jobs', 'cronjobs',
    'persistentvolumeclaims', 'persistentvolumes', 'serviceaccounts',
    'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings',
    'endpoints', 'storageclasses', 'gateways', 'httproutes'
  ];

  const KUBECTL_SHORT_KINDS = [
    'po', 'deploy', 'svc', 'no', 'ns', 'cm', 'ing',
    'pvc', 'pv', 'sa', 'netpol', 'sts', 'ds', 'sc', 'ep'
  ];

  const KNOWN_KINDS = new Set([
    'pod', 'pods', 'po',
    'deployment', 'deployments', 'deploy',
    'service', 'services', 'svc',
    'node', 'nodes', 'no',
    'namespace', 'namespaces', 'ns',
    'configmap', 'configmaps', 'cm',
    'secret', 'secrets',
    'ingress', 'ingresses', 'ing',
    'networkpolicy', 'networkpolicies', 'netpol',
    'persistentvolumeclaim', 'persistentvolumeclaims', 'pvc',
    'persistentvolume', 'persistentvolumes', 'pv',
    'statefulset', 'statefulsets', 'sts',
    'daemonset', 'daemonsets', 'ds',
    'serviceaccount', 'serviceaccounts', 'sa',
    'role', 'roles',
    'rolebinding', 'rolebindings',
    'clusterrole', 'clusterroles',
    'clusterrolebinding', 'clusterrolebindings',
    'endpoint', 'endpoints', 'ep',
    'storageclass', 'storageclasses', 'sc',
    'gateway', 'gateways',
    'httproute', 'httproutes',
    'job', 'jobs',
    'cronjob', 'cronjobs'
  ]);

  const ROOT_COMMANDS = [
    'kubectl', 'k', 'helm', 'kustomize', 'docker', 'crictl', 'argocd', 'flux',
    'istioctl', 'linkerd', 'tofu', 'terraform', 'aws', 'az', 'gcloud',
    'trivy', 'falco', 'cosign', 'k8sgpt', 'aiops', 'promql', 'logql', 'velero',
    'etcdctl', 'kubeadm', 'systemctl', 'journalctl', 'sysctl', 'unshare',
    'pvcreate', 'pvs', 'pvdisplay', 'vgcreate', 'vgs', 'vgdisplay', 'lvcreate', 'lvs', 'lvdisplay',
    'ip', 'iptables', 'ss', 'dig', 'nslookup', 'curl', 'ping', 'traceroute', 'nc',
    'git', 'cat', 'ls', 'cd', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'ln',
    'find', 'grep', 'awk', 'sed', 'jq', 'env', 'export', 'alias', 'echo', 'clear', 'pwd'
  ];

  class AutocompletionEngine {
    constructor(options = {}) {
      this.graph = options.graph || null;
      this.vfs = options.vfs || null;
      this.cluster = options.cluster || null;
      this.pipelineDriver = options.pipelineDriver || null;
      this.cwd = options.cwd || '/home/learner';
    }

    setContext({ graph, vfs, cluster, cwd }) {
      if (graph) this.graph = graph;
      if (vfs) this.vfs = vfs;
      if (cluster) this.cluster = cluster;
      if (cwd) this.cwd = cwd;
    }

    calcLCP(arr) {
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
    }

    makeResult(prefix, matches, isComplete = false, line = '', cursor = 0, textBeforeCursor = '', textAfterCursor = '') {
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
        const common = this.calcLCP(sorted);
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
    }

    autocomplete(line = '', cursor = line.length) {
      const textBeforeCursor = line.slice(0, cursor);
      const textAfterCursor = line.slice(cursor);
      const rawTokens = textBeforeCursor.trimStart().split(/\s+/).filter(Boolean);
      const isTrailingSpace = textBeforeCursor.endsWith(' ');
      const currentToken = isTrailingSpace ? '' : (rawTokens[rawTokens.length - 1] || '');

      const make = (prefix, matches, isComplete = false) =>
        this.makeResult(prefix, matches, isComplete, line, cursor, textBeforeCursor, textAfterCursor);

      // 1. Root Command Token Completion
      if (rawTokens.length <= 1 && !isTrailingSpace) {
        const commands = this.pipelineDriver && this.pipelineDriver.commands
          ? Array.from(new Set([...this.pipelineDriver.commands.keys(), ...ROOT_COMMANDS]))
          : ROOT_COMMANDS;
        const matches = commands.filter((c) => c.startsWith(currentToken)).sort();
        return make(currentToken, matches, true);
      }

      const bin = rawTokens[0];

      // 2. Extract Flags & Scoped Namespace
      let specifiedNamespace = null;
      let allNamespaces = false;
      const positional = [];
      const prevRawToken = isTrailingSpace
        ? (rawTokens[rawTokens.length - 1] || '')
        : (rawTokens[rawTokens.length - 2] || '');

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

      // 3. Flag Completion (- or --)
      if (currentToken.startsWith('-') && !currentToken.startsWith('--namespace=') && !currentToken.startsWith('--output=')) {
        const verb = positional[1] || '';
        const flagMap = {
          get: ['-n', '--namespace', '-A', '--all-namespaces', '-o', '--output', '-l', '--selector', '-w', '--watch', '--show-labels', '--sort-by'],
          describe: ['-n', '--namespace', '-A', '-l', '--selector'],
          delete: ['-n', '--namespace', '-A', '-f', '--filename', '--force', '--grace-period', '--all'],
          create: ['-n', '--namespace', '--image', '--dry-run=client', '--dry-run=server', '--replicas', '--port'],
          edit: ['-n', '--namespace', '-o', '--output'],
          logs: ['-n', '--namespace', '-f', '--follow', '-c', '--container', '--tail', '--previous', '--all-containers'],
          exec: ['-n', '--namespace', '-i', '-t', '-it', '-c', '--container', '--'],
          apply: ['-f', '--filename', '-k', '--kustomize', '-R', '--recursive', '--dry-run=client', '--dry-run=server', '--prune'],
          scale: ['-n', '--namespace', '--replicas', '--current-replicas'],
          rollout: ['-n', '--namespace'],
          top: ['-n', '--namespace', '-A', '--containers', '--sort-by=cpu', '--sort-by=memory']
        };
        const candidateFlags = flagMap[verb] || [
          '-n', '--namespace', '-A', '--all-namespaces',
          '-o', '--output', '-l', '--selector',
          '-f', '--filename', '--replicas', '--image',
          '--dry-run=client', '--dry-run=server', '--dry-run', '--help', '-v', '--version'
        ];
        const matches = candidateFlags.filter((f) => f.startsWith(currentToken));
        return make(currentToken, matches, !currentToken.endsWith('='));
      }

      // 4. Namespace Completion (after -n, --namespace, or --namespace=)
      if (prevRawToken === '-n' || prevRawToken === '--namespace' || currentToken.startsWith('--namespace=')) {
        const prefix = currentToken.startsWith('--namespace=') ? currentToken.slice(12) : currentToken;
        const nsList = this.getNamespaces();
        let matches = nsList.filter((n) => n.startsWith(prefix));
        if (currentToken.startsWith('--namespace=')) {
          matches = matches.map((m) => `--namespace=${m}`);
          return make(currentToken, matches, true);
        }
        return make(currentToken, matches, true);
      }

      // 5. Output Format Completion (after -o or --output)
      if (prevRawToken === '-o' || prevRawToken === '--output' || currentToken.startsWith('--output=')) {
        const prefix = currentToken.startsWith('--output=') ? currentToken.slice(9) : currentToken;
        const formats = ['json', 'yaml', 'wide', 'name', 'jsonpath='];
        let matches = formats.filter((f) => f.startsWith(prefix));
        if (currentToken.startsWith('--output=')) {
          matches = matches.map((m) => `--output=${m}`);
          return make(currentToken, matches, !matches[0]?.endsWith('='));
        }
        return make(currentToken, matches, true);
      }

      // 6. VFS File Path Completion
      const isVfsCandidate = currentToken.startsWith('/') || currentToken.startsWith('./') || currentToken.startsWith('../')
        || prevRawToken === '-f' || prevRawToken === '--filename' || prevRawToken === 'cat' || prevRawToken === 'ls'
        || prevRawToken === 'cd' || prevRawToken === 'vi' || prevRawToken === 'vim' || prevRawToken === 'nano'
        || prevRawToken === 'rm' || prevRawToken === 'cp' || prevRawToken === 'mv';

      if (isVfsCandidate && !this.isKindSlashSyntax(currentToken)) {
        const matches = this.completeVfsPath(currentToken);
        const hasDirMatch = matches.length === 1 && matches[0].endsWith('/');
        return make(currentToken, matches, !hasDirMatch);
      }

      // 7. Kubernetes Command Autocompletion (`kubectl` / `k`)
      if (bin === 'kubectl' || bin === 'k') {
        const verb = positional[1];

        // Subcommands (verbs)
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          const matches = KUBECTL_VERBS.filter((sc) => sc.startsWith(currentToken));
          return make(currentToken, matches, true);
        }

        const targetNs = allNamespaces
          ? null
          : (specifiedNamespace || (this.cluster ? this.cluster.currentNamespace : 'default'));

        // Verbs targeting nodes directly (cordon, uncordon, drain)
        if (verb === 'cordon' || verb === 'uncordon' || verb === 'drain') {
          const nodes = this.getResourcesForKind('Node');
          const nodeNames = nodes.map((n) => n.metadata?.name || n.name);
          const matches = nodeNames.filter((name) => name.startsWith(currentToken));
          return make(currentToken, matches, true);
        }

        // Verb: taint
        if (verb === 'taint') {
          if (positional.length === 2 && isTrailingSpace) {
            return make(currentToken, ['node', 'nodes'].filter((k) => k.startsWith(currentToken)), true);
          }
          if (positional.length === 3 && (positional[2] === 'node' || positional[2] === 'nodes')) {
            const nodes = this.getResourcesForKind('Node');
            const nodeNames = nodes.map((n) => n.metadata?.name || n.name);
            const matches = nodeNames.filter((name) => name.startsWith(currentToken));
            return make(currentToken, matches, true);
          }
        }

        // Verb: logs
        if (verb === 'logs') {
          if (this.isKindSlashSyntax(currentToken)) {
            return this.completeKindSlash(currentToken, targetNs, make);
          }
          const pods = this.getResourcesForKind('Pod', targetNs);
          let names = pods.map((p) => p.metadata?.name || p.name);
          if (names.length === 0) {
            const deploys = this.getResourcesForKind('Deployment', targetNs);
            names = deploys.map((d) => d.metadata?.name || d.name);
          }
          const matches = names.filter((name) => name.startsWith(currentToken));
          return make(currentToken, matches, true);
        }

        // Verb: exec
        if (verb === 'exec') {
          const pods = this.getResourcesForKind('Pod', targetNs);
          const names = pods.map((p) => p.metadata?.name || p.name);
          const matches = names.filter((name) => name.startsWith(currentToken));
          return make(currentToken, matches, true);
        }

        // Verb: scale or rollout
        if (verb === 'scale' || verb === 'rollout') {
          if (positional.length === 2 && isTrailingSpace) {
            const sub = verb === 'scale' ? ['deployment', 'statefulset'] : ['status', 'restart', 'history', 'undo'];
            return make(currentToken, sub.filter((s) => s.startsWith(currentToken)), true);
          }
          const kindToken = positional[2];
          if (kindToken === 'restart' || kindToken === 'status' || kindToken === 'history') {
            if (positional.length === 3 && isTrailingSpace) {
              return make(currentToken, ['deployment', 'daemonset', 'statefulset'].filter((k) => k.startsWith(currentToken)), true);
            }
            const actualKind = positional[3] || 'deployment';
            const resources = this.getResourcesForKind(actualKind, targetNs);
            const names = resources.map((r) => r.metadata?.name || r.name);
            const matches = names.filter((n) => n.startsWith(currentToken));
            return make(currentToken, matches, true);
          }
          if (kindToken) {
            const resources = this.getResourcesForKind(kindToken, targetNs);
            const names = resources.map((r) => r.metadata?.name || r.name);
            const matches = names.filter((n) => n.startsWith(currentToken));
            return make(currentToken, matches, true);
          }
        }

        // Verb: top
        if (verb === 'top') {
          if (positional.length === 2 && isTrailingSpace) {
            return make(currentToken, ['pods', 'nodes'].filter((k) => k.startsWith(currentToken)), true);
          }
          if (positional.length >= 3) {
            const kindToken = positional[2];
            const resources = this.getResourcesForKind(kindToken, targetNs);
            const names = resources.map((r) => r.metadata?.name || r.name);
            const matches = names.filter((n) => n.startsWith(currentToken));
            return make(currentToken, matches, true);
          }
        }

        // General Resource CRUD: get, describe, delete, edit, explain
        if (['get', 'describe', 'delete', 'edit', 'explain'].includes(verb)) {
          if (this.isKindSlashSyntax(currentToken)) {
            return this.completeKindSlash(currentToken, targetNs, make);
          }

          const isCompletingKind = (positional.length === 2 && isTrailingSpace)
            || (positional.length === 3 && !isTrailingSpace);

          if (isCompletingKind) {
            const allKinds = [...KUBECTL_KINDS, ...KUBECTL_SHORT_KINDS];
            const matches = allKinds.filter((k) => k.startsWith(currentToken));
            return make(currentToken, matches, true);
          }

          if (positional.length >= 3) {
            const kindToken = positional[2];
            let resources = this.getResourcesForKind(kindToken, targetNs);
            if (resources.length === 0 && targetNs && !CLUSTER_SCOPED_KINDS.has(normalizeKind(kindToken))) {
              resources = this.getResourcesForKind(kindToken, null);
            }
            const names = resources.map((r) => r.metadata?.name || r.name);
            const matches = names.filter((name) => name.startsWith(currentToken));
            return make(currentToken, matches, true);
          }
        }
      }

      // 8. Helm Autocompletion
      if (bin === 'helm') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          const helmVerbs = ['list', 'install', 'upgrade', 'uninstall', 'status', 'repo', 'template', 'lint', 'package', 'rollback', 'version'];
          return make(currentToken, helmVerbs.filter((v) => v.startsWith(currentToken)), true);
        }
        if (['status', 'upgrade', 'uninstall', 'rollback'].includes(verb)) {
          const releases = this.getHelmReleaseNames();
          return make(currentToken, releases.filter((r) => r.startsWith(currentToken)), true);
        }
        if (verb === 'repo') {
          const repoActions = ['add', 'update', 'list', 'remove'];
          return make(currentToken, repoActions.filter((a) => a.startsWith(currentToken)), true);
        }
      }

      // 9. Docker / crictl Autocompletion
      if (bin === 'docker' || bin === 'crictl') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          const sub = bin === 'docker'
            ? ['ps', 'logs', 'exec', 'stop', 'rm', 'build', 'run', 'images', 'inspect', 'network']
            : ['pods', 'ps', 'logs', 'exec', 'images', 'stats', 'inspect', 'rm', 'rmp'];
          return make(currentToken, sub.filter((v) => v.startsWith(currentToken)), true);
        }
        if (['logs', 'stop', 'rm', 'inspect', 'exec'].includes(verb)) {
          const containers = this.getContainerNames();
          return make(currentToken, containers.filter((c) => c.startsWith(currentToken)), true);
        }
      }

      // 10. ArgoCD Autocompletion
      if (bin === 'argocd') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['app', 'cluster', 'repo', 'proj', 'login', 'version', 'sync'].filter((v) => v.startsWith(currentToken)), true);
        }
        if (verb === 'app') {
          const appVerb = positional[2];
          if (!appVerb || (positional.length === 3 && !isTrailingSpace)) {
            return make(currentToken, ['get', 'sync', 'diff', 'list', 'history', 'rollback', 'wait', 'create', 'delete'].filter((v) => v.startsWith(currentToken)), true);
          }
          const apps = this.getArgoAppNames();
          return make(currentToken, apps.filter((a) => a.startsWith(currentToken)), true);
        }
      }

      // 11. Istioctl & Linkerd Autocompletion
      if (bin === 'istioctl') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['analyze', 'proxy-status', 'proxy-config', 'dashboard', 'version'].filter((v) => v.startsWith(currentToken)), true);
        }
        if (verb === 'proxy-config') {
          if (positional.length === 2 && isTrailingSpace) {
            return make(currentToken, ['endpoints', 'cluster', 'routes', 'listener', 'secret'].filter((s) => s.startsWith(currentToken)), true);
          }
          const pods = this.getResourcesForKind('Pod');
          return make(currentToken, pods.map((p) => p.metadata?.name || p.name).filter((n) => n.startsWith(currentToken)), true);
        }
      }

      if (bin === 'linkerd') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['check', 'viz', 'version', 'install'].filter((v) => v.startsWith(currentToken)), true);
        }
        if (verb === 'viz') {
          return make(currentToken, ['stat', 'tap', 'top', 'edges'].filter((s) => s.startsWith(currentToken)), true);
        }
      }

      // 12. OpenTofu / Terraform Autocompletion
      if (bin === 'tofu' || bin === 'terraform') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['init', 'plan', 'apply', 'destroy', 'state', 'output', 'validate', 'fmt'].filter((v) => v.startsWith(currentToken)), true);
        }
        if (verb === 'state') {
          return make(currentToken, ['list', 'show', 'mv', 'rm'].filter((s) => s.startsWith(currentToken)), true);
        }
      }

      // 13. Git Autocompletion
      if (bin === 'git') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['status', 'add', 'commit', 'log', 'diff', 'checkout', 'branch', 'merge', 'tag', 'rebase', 'pull', 'push', 'show', 'reset'].filter((v) => v.startsWith(currentToken)), true);
        }
        if (verb === 'checkout' || verb === 'branch' || verb === 'merge' || verb === 'rebase') {
          const branches = ['main', 'master', 'develop', 'staging', 'production', 'feature/auth', 'hotfix/patch-1'];
          return make(currentToken, branches.filter((b) => b.startsWith(currentToken)), true);
        }
      }

      // 14. Linux Systemctl / Journalctl Autocompletion
      if (bin === 'systemctl') {
        const verb = positional[1];
        if (!verb || (positional.length === 2 && !isTrailingSpace)) {
          return make(currentToken, ['status', 'start', 'stop', 'restart', 'enable', 'disable', 'daemon-reload'].filter((v) => v.startsWith(currentToken)), true);
        }
        const services = ['kubelet.service', 'containerd.service', 'etcd.service', 'docker.service', 'systemd-resolved.service', 'sshd.service'];
        return make(currentToken, services.filter((s) => s.startsWith(currentToken)), true);
      }

      return make(currentToken, []);
    }

    // -------------------------------------------------------------------------
    // Resource & State Queries
    // -------------------------------------------------------------------------

    getNamespaces() {
      const list = new Set(['default', 'kube-system', 'kube-public', 'kube-node-lease']);

      if (this.graph) {
        const nsDocs = this.graph.list({ kind: 'Namespace' });
        for (const d of nsDocs) list.add(d.metadata.name);
        const all = this.graph.list({});
        for (const r of all) {
          if (r.metadata?.namespace) list.add(r.metadata.namespace);
        }
      }

      if (this.cluster) {
        if (typeof this.cluster.getNamespaces === 'function') {
          const clusterNs = this.cluster.getNamespaces();
          for (const n of clusterNs) list.add(typeof n === 'string' ? n : n.name || n.metadata?.name);
        }
        if (this.cluster.state && Array.isArray(this.cluster.state.resources)) {
          for (const r of this.cluster.state.resources) {
            if (r.metadata?.namespace) list.add(r.metadata.namespace);
            if (r.namespace) list.add(r.namespace);
          }
        }
      }

      return Array.from(list).sort();
    }

    getResourcesForKind(kindStr, namespace = null) {
      const normalized = normalizeKind(kindStr);
      const results = [];
      const seen = new Set();

      if (this.graph) {
        const query = { kind: normalized };
        if (namespace && !CLUSTER_SCOPED_KINDS.has(normalized)) {
          query.namespace = namespace;
        }
        const docs = this.graph.list(query);
        for (const d of docs) {
          const key = `${d.metadata?.namespace || ''}/${d.metadata?.name}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(d);
          }
        }
      }

      if (this.cluster) {
        const clusterNs = namespace || (CLUSTER_SCOPED_KINDS.has(normalized) ? null : 'all');
        let clusterDocs = [];
        if (typeof this.cluster.getResources === 'function') {
          clusterDocs = this.cluster.getResources(normalized, clusterNs);
        } else if (this.cluster.state && Array.isArray(this.cluster.state.resources)) {
          clusterDocs = this.cluster.state.resources.filter((r) => {
            if (normalizeKind(r.kind) !== normalized) return false;
            if (namespace && (r.metadata?.namespace || r.namespace) !== namespace) return false;
            return true;
          });
        }
        for (const d of clusterDocs) {
          const dName = d.metadata?.name || d.name;
          const dNs = d.metadata?.namespace || d.namespace || '';
          const key = `${dNs}/${dName}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(d);
          }
        }
      }

      return results;
    }

    getContainerNames() {
      const names = new Set();
      if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.containers)) {
        for (const c of this.cluster.state.containers) {
          if (c.name) names.add(c.name);
          if (c.id) names.add(c.id.slice(0, 12));
        }
      }
      const pods = this.getResourcesForKind('Pod');
      for (const p of pods) {
        const containers = p.spec?.containers || [];
        for (const c of containers) {
          if (c.name) names.add(c.name);
        }
      }
      return Array.from(names).sort();
    }

    getHelmReleaseNames() {
      const names = new Set();
      if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.helmReleases)) {
        for (const r of this.cluster.state.helmReleases) names.add(r.name);
      }
      return Array.from(names).sort();
    }

    getArgoAppNames() {
      const names = new Set();
      if (this.cluster && this.cluster.state && Array.isArray(this.cluster.state.argoApps)) {
        for (const a of this.cluster.state.argoApps) names.add(a.name);
      }
      if (this.graph) {
        const apps = this.graph.list({ kind: 'Application' });
        for (const a of apps) names.add(a.metadata.name);
      }
      return Array.from(names).sort();
    }

    isKindSlashSyntax(token) {
      if (!token || typeof token !== 'string') return false;
      const parts = token.split('/');
      if (parts.length !== 2) return false;
      const candidateKind = parts[0].toLowerCase();
      return KNOWN_KINDS.has(candidateKind)
        || KUBECTL_KINDS.some((k) => k.toLowerCase() === candidateKind)
        || KUBECTL_SHORT_KINDS.some((k) => k.toLowerCase() === candidateKind);
    }

    completeKindSlash(token, namespace, makeResult) {
      const [kindPart, namePrefix] = token.split('/');
      let resources = this.getResourcesForKind(kindPart, namespace);
      if (resources.length === 0 && namespace && !CLUSTER_SCOPED_KINDS.has(normalizeKind(kindPart))) {
        resources = this.getResourcesForKind(kindPart, null);
      }
      const matches = resources
        .map((r) => r.metadata?.name || r.name)
        .filter((name) => name.startsWith(namePrefix))
        .map((name) => `${kindPart}/${name}`);
      return makeResult(token, matches, true);
    }

    completeVfsPath(prefix) {
      if (!this.vfs) return [];

      let searchDir = this.cwd;
      let filePrefix = prefix;

      const lastSlash = prefix.lastIndexOf('/');
      if (lastSlash > -1) {
        const dirPart = prefix.slice(0, lastSlash) || '/';
        filePrefix = prefix.slice(lastSlash + 1);
        searchDir = typeof this.vfs.normalizePath === 'function'
          ? this.vfs.normalizePath(dirPart, this.cwd)
          : (dirPart.startsWith('/') ? dirPart : `${this.cwd}/${dirPart}`.replace(/\/+/g, '/'));
      }

      try {
        const entries = typeof this.vfs.listDir === 'function' ? this.vfs.listDir(searchDir) : [];
        return entries
          .filter((name) => name.startsWith(filePrefix))
          .map((name) => {
            let suffix = '';
            try {
              const full = `${searchDir.replace(/\/$/, '')}/${name}`;
              const s = this.vfs.stat(full);
              if (s && (typeof s.isDirectory === 'function' ? s.isDirectory() : s.isDirectory)) {
                suffix = '/';
              }
            } catch {}
            return (lastSlash > -1 ? prefix.slice(0, lastSlash + 1) + name : name) + suffix;
          });
      } catch {
        return [];
      }
    }
  }

  return {
    AutocompletionEngine,
    KUBECTL_VERBS,
    KUBECTL_KINDS,
    KUBECTL_SHORT_KINDS,
    ROOT_COMMANDS
  };
});
