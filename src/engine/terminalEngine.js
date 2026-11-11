'use strict';

const { normalizeKind, getFieldByPath, CLUSTER_SCOPED_KINDS } = require('./virtualCluster');

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
  constructor(virtualCluster) {
    this.cluster = virtualCluster;
    this.commandHistory = [];
  }

  execute(rawCommand, options = {}) {
    const trimmed = String(rawCommand || '').trim();
    if (!trimmed) {
      return { exitCode: 0, output: '', command: '' };
    }

    this.commandHistory.push({
      command: trimmed,
      timestamp: new Date().toISOString()
    });

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
      const manifestText = options.manifestText || '';
      if (manifestText && manifestText.trim()) {
        const applied = this.cluster.applyManifest(manifestText);
        return {
          exitCode: 0,
          output: applied
            .map((a) => `${a.resource.kind.toLowerCase()}/${a.resource.metadata.name} ${a.action}`)
            .join('\n')
        };
      }
      throw new Error('Provide YAML in the Manifest Editor or pass inline manifest to apply.');
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
    if (sub === 'delete') {
      const kind = subArgs[0];
      const name = subArgs[1];
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
    const rawKind = subArgs[0] || 'pods';
    const targetName = subArgs[1] || null;
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
    const kind = normalizeKind(subArgs[0] || 'Pod');
    const name = subArgs[1];
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
    const kind = normalizeKind(subArgs[0]);
    const name = subArgs[1];
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

  kubectlAuth(subArgs, flags) {
    const verb = subArgs[1] || 'get';
    const resource = subArgs[2] || 'pods';
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

    return {
      exitCode: 0,
      output: 'Linux kubelabs-control-plane 6.12.0-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
    };
  }
}

module.exports = { TerminalEngine, tokenizeCommand };
