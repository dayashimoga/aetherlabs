'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatTable,
  calculateAge,
  matchesSelector,
  normalizeKind,
  formatLabels,
  formatResourceTable
} = require('../src/core/cliFormatter');

test('cliFormatter - Subphase 1.1.1: Dynamic Column-Padding ASCII Table & Wide Output Renderer', async (t) => {
  await t.test('1. formatTable aligns columns with dynamic padding and gutters', () => {
    const headers = ['NAME', 'READY', 'STATUS'];
    const rows = [
      ['short', '1/1', 'Running'],
      ['very-long-pod-name-abc-12345', '2/2', 'ContainerCreating']
    ];
    const out = formatTable(headers, rows);
    const lines = out.split('\n');
    assert.equal(lines.length, 3);
    // Header should be padded to match max length of row cells
    assert.match(lines[0], /^NAME\s{27}READY\s{3}STATUS$/);
    assert.match(lines[1], /^short\s{26}1\/1\s{5}Running$/);
    assert.match(lines[2], /^very-long-pod-name-abc-12345\s{3}2\/2\s{5}ContainerCreating$/);
  });

  await t.test('2. calculateAge returns human-readable kubernetes ages', () => {
    const now = Date.now();
    assert.equal(calculateAge(new Date(now - 30 * 1000).toISOString()), '30s');
    assert.equal(calculateAge(new Date(now - 5 * 60 * 1000).toISOString()), '5m');
    assert.equal(calculateAge(new Date(now - 3 * 3600 * 1000).toISOString()), '3h');
    assert.equal(calculateAge(new Date(now - 48 * 3600 * 1000).toISOString()), '2d');
    assert.equal(calculateAge(null), '2m');
  });

  await t.test('3. matchesSelector supports equality, inequality, and set-based expressions', () => {
    const labels = { app: 'web', env: 'production', tier: 'frontend' };
    assert.equal(matchesSelector(labels, 'app=web'), true);
    assert.equal(matchesSelector(labels, 'app=db'), false);
    assert.equal(matchesSelector(labels, 'env!=staging'), true);
    assert.equal(matchesSelector(labels, 'env!=production'), false);
    assert.equal(matchesSelector(labels, 'tier in (frontend, api)'), true);
    assert.equal(matchesSelector(labels, 'tier in (backend, database)'), false);
    assert.equal(matchesSelector(labels, 'app notin (cache, redis)'), true);
    assert.equal(matchesSelector(labels, 'app notin (web, api)'), false);
    assert.equal(matchesSelector(labels, 'app'), true);
    assert.equal(matchesSelector(labels, '!missing'), true);
    assert.equal(matchesSelector(labels, 'app=web,env=production'), true);
    assert.equal(matchesSelector(labels, 'app=web,env=staging'), false);
  });

  await t.test('4. formatLabels outputs sorted key=value pairs or <none>', () => {
    assert.equal(formatLabels({ tier: 'cache', app: 'redis' }), 'app=redis,tier=cache');
    assert.equal(formatLabels({}), '<none>');
    assert.equal(formatLabels(null), '<none>');
  });

  await t.test('5. formatResourceTable renders Pods (normal, wide, -A, --show-labels, -l)', () => {
    const pods = [
      {
        kind: 'Pod',
        metadata: {
          name: 'frontend-7d9c-1',
          namespace: 'production',
          labels: { app: 'frontend', tier: 'web' },
          creationTimestamp: new Date(Date.now() - 120000).toISOString()
        },
        spec: { containers: [{ name: 'web', image: 'nginx:1.25' }] },
        status: { phase: 'Running', podIP: '10.244.1.5', nodeName: 'worker-01', restartCount: 0 }
      },
      {
        kind: 'Pod',
        metadata: {
          name: 'backend-5b8d-2',
          namespace: 'production',
          labels: { app: 'backend', tier: 'api' },
          creationTimestamp: new Date(Date.now() - 3600000).toISOString()
        },
        spec: { containers: [{ name: 'api', image: 'node:20' }] },
        status: { phase: 'Running', podIP: '10.244.2.8', nodeName: 'worker-02', restartCount: 2 }
      }
    ];

    // Standard output
    const std = formatResourceTable('pods', pods, { namespace: 'production' });
    assert.match(std, /^NAME\s+READY\s+STATUS\s+RESTARTS\s+AGE$/m);
    assert.match(std, /frontend-7d9c-1\s+1\/1\s+Running\s+0\s+2m/);

    // Wide output
    const wide = formatResourceTable('pods', pods, { namespace: 'production', wide: true });
    assert.match(wide, /IP\s+NODE\s+NOMINATED NODE\s+READINESS GATES/);
    assert.match(wide, /10\.244\.1\.5\s+worker-01\s+<none>\s+<none>/);

    // All namespaces
    const allNs = formatResourceTable('pods', pods, { allNamespaces: true });
    assert.match(allNs, /^NAMESPACE\s+NAME\s+READY/);
    assert.match(allNs, /production\s+frontend-7d9c-1/);

    // Show labels
    const withLabels = formatResourceTable('pods', pods, { showLabels: true });
    assert.match(withLabels, /LABELS$/m);
    assert.match(withLabels, /app=frontend,tier=web/);

    // Selector filter
    const filtered = formatResourceTable('pods', pods, { selector: 'app=backend' });
    assert.match(filtered, /backend-5b8d-2/);
    assert.doesNotMatch(filtered, /frontend-7d9c-1/);
  });

  await t.test('6. formatResourceTable renders Deployments, StatefulSets & DaemonSets', () => {
    const deploys = [
      {
        kind: 'Deployment',
        metadata: { name: 'web-deploy', namespace: 'default', creationTimestamp: new Date(Date.now() - 60000).toISOString() },
        spec: { replicas: 3, template: { spec: { containers: [{ name: 'web', image: 'nginx:alpine' }] } }, selector: { matchLabels: { app: 'web' } } },
        status: { readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 }
      }
    ];
    const depOut = formatResourceTable('deployments', deploys, { wide: true });
    assert.match(depOut, /^NAME\s+READY\s+UP-TO-DATE\s+AVAILABLE\s+AGE\s+CONTAINERS\s+IMAGES\s+SELECTOR$/m);
    assert.match(depOut, /web-deploy\s+3\/3\s+3\s+3\s+1m\s+web\s+nginx:alpine\s+app=web/);

    const sts = [
      {
        kind: 'StatefulSet',
        metadata: { name: 'redis-sts', namespace: 'default' },
        spec: { replicas: 3 },
        status: { readyReplicas: 3 }
      }
    ];
    const stsOut = formatResourceTable('sts', sts);
    assert.match(stsOut, /^NAME\s+READY\s+AGE$/m);
    assert.match(stsOut, /redis-sts\s+3\/3/);

    const ds = [
      {
        kind: 'DaemonSet',
        metadata: { name: 'fluentbit', namespace: 'kube-system' },
        spec: { template: { spec: { nodeSelector: { tier: 'node' } } } },
        status: { desiredNumberScheduled: 5, currentNumberScheduled: 5, numberReady: 5, updatedNumberScheduled: 5, numberAvailable: 5 }
      }
    ];
    const dsOut = formatResourceTable('ds', ds);
    assert.match(dsOut, /^NAME\s+DESIRED\s+CURRENT\s+READY\s+UP-TO-DATE\s+AVAILABLE\s+NODE SELECTOR\s+AGE$/m);
    assert.match(dsOut, /fluentbit\s+5\s+5\s+5\s+5\s+5\s+tier=node/);
  });

  await t.test('7. formatResourceTable renders Services, Endpoints, Ingress, Gateway & HTTPRoute', () => {
    const svc = [
      {
        kind: 'Service',
        metadata: { name: 'api-svc', namespace: 'default' },
        spec: { type: 'LoadBalancer', clusterIP: '10.96.10.15', ports: [{ port: 80, nodePort: 30080, protocol: 'TCP' }] },
        status: { loadBalancer: { ingress: [{ ip: '34.120.45.67' }] } }
      }
    ];
    const svcOut = formatResourceTable('services', svc, { wide: true });
    assert.match(svcOut, /^NAME\s+TYPE\s+CLUSTER-IP\s+EXTERNAL-IP\s+PORT\(S\)\s+AGE\s+SELECTOR$/m);
    assert.match(svcOut, /api-svc\s+LoadBalancer\s+10\.96\.10\.15\s+34\.120\.45\.67\s+80:30080\/TCP/);

    const ep = [
      {
        kind: 'Endpoints',
        metadata: { name: 'api-svc', namespace: 'default' },
        subsets: [{ addresses: [{ ip: '10.244.1.10' }, { ip: '10.244.2.11' }], ports: [{ port: 8080 }] }]
      }
    ];
    const epOut = formatResourceTable('endpoints', ep);
    assert.match(epOut, /^NAME\s+ENDPOINTS\s+AGE$/m);
    assert.match(epOut, /api-svc\s+10\.244\.1\.10:8080,10\.244\.2\.11:8080/);

    const ing = [
      {
        kind: 'Ingress',
        metadata: { name: 'main-ing', namespace: 'default' },
        spec: { ingressClassName: 'nginx', rules: [{ host: 'app.example.com' }] },
        status: { loadBalancer: { ingress: [{ ip: '1.2.3.4' }] } }
      }
    ];
    const ingOut = formatResourceTable('ingress', ing);
    assert.match(ingOut, /^NAME\s+CLASS\s+HOSTS\s+ADDRESS\s+PORTS\s+AGE$/m);
    assert.match(ingOut, /main-ing\s+nginx\s+app\.example\.com\s+1\.2\.3\.4\s+80/);

    const gw = [
      {
        kind: 'Gateway',
        metadata: { name: 'prod-gateway', namespace: 'default' },
        spec: { gatewayClassName: 'istio' },
        status: { addresses: [{ value: '198.51.100.1' }], conditions: [{ type: 'Ready', status: 'True' }] }
      }
    ];
    const gwOut = formatResourceTable('gateway', gw);
    assert.match(gwOut, /^NAME\s+CLASS\s+ADDRESSES\s+READY\s+AGE$/m);
    assert.match(gwOut, /prod-gateway\s+istio\s+198\.51\.100\.1\s+True/);

    const hr = [
      {
        kind: 'HTTPRoute',
        metadata: { name: 'api-route', namespace: 'default' },
        spec: { hostnames: ['api.example.com'] }
      }
    ];
    const hrOut = formatResourceTable('httproute', hr);
    assert.match(hrOut, /^NAME\s+HOSTNAMES\s+AGE$/m);
    assert.match(hrOut, /api-route\s+api\.example\.com/);
  });

  await t.test('8. formatResourceTable renders Storage & Security (PV, PVC, StorageClass, NetworkPolicy, ServiceAccount, Role, RoleBinding)', () => {
    const pv = [
      {
        kind: 'PersistentVolume',
        metadata: { name: 'pv-volume-01' },
        spec: { capacity: { storage: '50Gi' }, accessModes: ['ReadWriteOnce'], persistentVolumeReclaimPolicy: 'Retain', storageClassName: 'fast-ssd' },
        status: { phase: 'Bound' }
      }
    ];
    const pvOut = formatResourceTable('pv', pv);
    assert.match(pvOut, /^NAME\s+CAPACITY\s+ACCESS MODES\s+RECLAIM POLICY\s+STATUS\s+CLAIM\s+STORAGECLASS\s+REASON\s+AGE$/m);
    assert.match(pvOut, /pv-volume-01\s+50Gi\s+ReadWriteOnce\s+Retain\s+Bound\s+<none>\s+fast-ssd/);

    const pvc = [
      {
        kind: 'PersistentVolumeClaim',
        metadata: { name: 'db-claim', namespace: 'production' },
        spec: { volumeName: 'pv-volume-01', resources: { requests: { storage: '50Gi' } }, accessModes: ['ReadWriteOnce'], storageClassName: 'fast-ssd' },
        status: { phase: 'Bound' }
      }
    ];
    const pvcOut = formatResourceTable('pvc', pvc);
    assert.match(pvcOut, /^NAME\s+STATUS\s+VOLUME\s+CAPACITY\s+ACCESS MODES\s+STORAGECLASS\s+AGE$/m);
    assert.match(pvcOut, /db-claim\s+Bound\s+pv-volume-01\s+50Gi\s+ReadWriteOnce\s+fast-ssd/);

    const sc = [
      {
        kind: 'StorageClass',
        metadata: { name: 'standard-csi' },
        provisioner: 'ebs.csi.aws.com',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'WaitForFirstConsumer',
        allowVolumeExpansion: true
      }
    ];
    const scOut = formatResourceTable('sc', sc);
    assert.match(scOut, /^NAME\s+PROVISIONER\s+RECLAIMPOLICY\s+VOLUMEBINDINGMODE\s+ALLOWVOLUMEEXPANSION\s+AGE$/m);
    assert.match(scOut, /standard-csi\s+ebs\.csi\.aws\.com\s+Delete\s+WaitForFirstConsumer\s+true/);

    const netpol = [
      {
        kind: 'NetworkPolicy',
        metadata: { name: 'db-isolation', namespace: 'production' },
        spec: { podSelector: { matchLabels: { role: 'database' } } }
      }
    ];
    const netpolOut = formatResourceTable('netpol', netpol);
    assert.match(netpolOut, /^NAME\s+POD-SELECTOR\s+AGE$/m);
    assert.match(netpolOut, /db-isolation\s+role=database/);

    const sa = [
      {
        kind: 'ServiceAccount',
        metadata: { name: 'build-bot', namespace: 'default' },
        secrets: [{ name: 'token-secret' }]
      }
    ];
    const saOut = formatResourceTable('sa', sa);
    assert.match(saOut, /^NAME\s+SECRETS\s+AGE$/m);
    assert.match(saOut, /build-bot\s+1/);

    const role = [
      {
        kind: 'Role',
        metadata: { name: 'pod-reader', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' }
      }
    ];
    const roleOut = formatResourceTable('role', role);
    assert.match(roleOut, /^NAME\s+CREATED AT$/m);
    assert.match(roleOut, /pod-reader\s+2026-01-01T00:00:00Z/);

    const rb = [
      {
        kind: 'RoleBinding',
        metadata: { name: 'read-pods', namespace: 'default' },
        roleRef: { kind: 'Role', name: 'pod-reader' }
      }
    ];
    const rbOut = formatResourceTable('rolebinding', rb);
    assert.match(rbOut, /^NAME\s+ROLE\s+AGE$/m);
    assert.match(rbOut, /read-pods\s+Role\/pod-reader/);
  });

  await t.test('9. formatResourceTable renders Cluster Nodes, Namespaces & Events', () => {
    const nodes = [
      {
        kind: 'Node',
        metadata: {
          name: 'cp-01',
          labels: { 'node-role.kubernetes.io/control-plane': '' }
        },
        status: {
          phase: 'Ready',
          kubeletVersion: 'v1.32.0',
          internalIP: '192.168.1.100',
          externalIP: '<none>',
          nodeInfo: {
            osImage: 'Ubuntu 24.04',
            kernelVersion: '6.8.0',
            containerRuntimeVersion: 'containerd://1.7.13'
          }
        }
      }
    ];
    const nodeStd = formatResourceTable('nodes', nodes);
    assert.match(nodeStd, /^NAME\s+STATUS\s+ROLES\s+AGE\s+VERSION$/m);
    assert.match(nodeStd, /cp-01\s+Ready\s+control-plane\s+2m\s+v1\.32\.0/);

    const nodeWide = formatResourceTable('nodes', nodes, { wide: true });
    assert.match(nodeWide, /INTERNAL-IP\s+EXTERNAL-IP\s+OS-IMAGE\s+KERNEL-VERSION\s+CONTAINER-RUNTIME/);
    assert.match(nodeWide, /192\.168\.1\.100\s+<none>\s+Ubuntu 24\.04\s+6\.8\.0\s+containerd:\/\/1\.7\.13/);

    const ns = [
      {
        kind: 'Namespace',
        metadata: { name: 'kube-system' },
        status: { phase: 'Active' }
      }
    ];
    const nsOut = formatResourceTable('namespaces', ns);
    assert.match(nsOut, /^NAME\s+STATUS\s+AGE$/m);
    assert.match(nsOut, /kube-system\s+Active/);

    const events = [
      {
        kind: 'Event',
        metadata: { name: 'ev-1', namespace: 'default' },
        involvedObject: { kind: 'Pod', name: 'web-1' },
        type: 'Normal',
        reason: 'Scheduled',
        message: 'Successfully assigned default/web-1 to worker-01'
      }
    ];
    const evOut = formatResourceTable('events', events);
    assert.match(evOut, /^LAST SEEN\s+TYPE\s+REASON\s+OBJECT\s+MESSAGE$/m);
    assert.match(evOut, /Normal\s+Scheduled\s+Pod\/web-1\s+Successfully assigned default\/web-1 to worker-01/);
  });

  await t.test('10. formatResourceTable handles empty resources with appropriate messages', () => {
    assert.equal(formatResourceTable('pods', [], { namespace: 'custom-ns' }), 'No resources found in custom-ns namespace.');
    assert.equal(formatResourceTable('pods', [], { allNamespaces: true }), 'No resources found');
  });

  await t.test('11. TerminalEngine end-to-end integration with cliFormatter for kubectl get', () => {
    const { VirtualCluster } = require('../src/core/virtualCluster');
    const { TerminalEngine } = require('../src/core/terminalEngine');
    const cluster = new VirtualCluster();
    const terminal = new TerminalEngine(cluster);

    // Apply sample deployment and service
    cluster.applyManifest(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-frontend
  namespace: default
  labels:
    app: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
---
apiVersion: v1
kind: Service
metadata:
  name: web-svc
  namespace: default
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
`);

    // Verify kubectl get pods
    const resPods = terminal.execute('kubectl get pods');
    assert.equal(resPods.exitCode, 0);
    assert.match(resPods.output, /^NAME\s+READY\s+STATUS\s+RESTARTS\s+AGE$/m);
    assert.match(resPods.output, /web-frontend/);

    // Verify kubectl get pods -A
    const resPodsAll = terminal.execute('kubectl get pods -A');
    assert.equal(resPodsAll.exitCode, 0);
    assert.match(resPodsAll.output, /^NAMESPACE\s+NAME\s+READY\s+STATUS\s+RESTARTS\s+AGE$/m);
    assert.match(resPodsAll.output, /default\s+web-frontend/);

    // Verify kubectl get pods -o wide
    const resWide = terminal.execute('kubectl get pods -o wide');
    assert.equal(resWide.exitCode, 0);
    assert.match(resWide.output, /IP\s+NODE\s+NOMINATED NODE\s+READINESS GATES/);

    // Verify kubectl get pods --show-labels
    const resLabels = terminal.execute('kubectl get pods --show-labels');
    assert.equal(resLabels.exitCode, 0);
    assert.match(resLabels.output, /LABELS$/m);
    assert.match(resLabels.output, /app=web/);

    // Verify kubectl get pods -l selector
    const resSelMatch = terminal.execute('kubectl get pods -l app=web');
    assert.equal(resSelMatch.exitCode, 0);
    assert.match(resSelMatch.output, /web-frontend/);

    const resSelMiss = terminal.execute('kubectl get pods -l app=nonexistent');
    assert.equal(resSelMiss.exitCode, 0);
    assert.match(resSelMiss.output, /No resources found in default namespace\./);

    // Verify kubectl get nodes
    const resNodes = terminal.execute('kubectl get nodes');
    assert.equal(resNodes.exitCode, 0);
    assert.match(resNodes.output, /^NAME\s+STATUS\s+ROLES\s+AGE\s+VERSION$/m);

    // Verify kubectl get svc
    const resSvc = terminal.execute('kubectl get svc');
    assert.equal(resSvc.exitCode, 0);
    assert.match(resSvc.output, /^NAME\s+TYPE\s+CLUSTER-IP\s+EXTERNAL-IP\s+PORT\(S\)\s+AGE$/m);
    assert.match(resSvc.output, /web-svc/);

    // Verify kubectl get deploy
    const resDeploy = terminal.execute('kubectl get deploy');
    assert.equal(resDeploy.exitCode, 0);
    assert.match(resDeploy.output, /^NAME\s+READY\s+UP-TO-DATE\s+AVAILABLE\s+AGE$/m);
    assert.match(resDeploy.output, /web-frontend\s+2\/2\s+2\s+2/);
  });

  await t.test('12. formatYaml formats single resource and List items cleanly', () => {
    const { formatYaml } = require('../src/core/cliFormatter');
    const single = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'mypod', namespace: 'default' } };
    const yamlSingle = formatYaml(single);
    assert.match(yamlSingle, /apiVersion:\s*v1/);
    assert.match(yamlSingle, /kind:\s*Pod/);
    assert.match(yamlSingle, /name:\s*mypod/);

    const list = [single];
    const yamlList = formatYaml(list);
    assert.match(yamlList, /kind:\s*List/);
    assert.match(yamlList, /items:/);
  });

  await t.test('13. formatJson formats single resource and List items cleanly', () => {
    const { formatJson } = require('../src/core/cliFormatter');
    const single = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'app-config' } };
    const jsonSingle = formatJson(single);
    const parsedSingle = JSON.parse(jsonSingle);
    assert.equal(parsedSingle.kind, 'ConfigMap');

    const list = [single];
    const jsonList = formatJson(list);
    const parsedList = JSON.parse(jsonList);
    assert.equal(parsedList.kind, 'List');
    assert.equal(parsedList.items.length, 1);
  });

  await t.test('14. formatJsonPath extracts data using JSONPath templates', () => {
    const { formatJsonPath } = require('../src/core/cliFormatter');
    const payload = {
      items: [
        { metadata: { name: 'pod-a' }, status: { podIP: '10.244.0.1' } },
        { metadata: { name: 'pod-b' }, status: { podIP: '10.244.0.2' } }
      ]
    };
    const outNames = formatJsonPath(payload, '{.items[*].metadata.name}');
    assert.equal(outNames.trim(), 'pod-a pod-b');

    const outIPs = formatJsonPath(payload, '.items[*].status.podIP');
    assert.equal(outIPs.trim(), '10.244.0.1 10.244.0.2');
  });

  await t.test('15. formatDescribe produces authentic multi-section pod details and events', () => {
    const { formatDescribe } = require('../src/core/cliFormatter');
    const pod = {
      kind: 'Pod',
      metadata: {
        name: 'auth-service-789',
        namespace: 'production',
        labels: { app: 'auth', tier: 'api' },
        annotations: { 'deployment.kubernetes.io/revision': '1' }
      },
      spec: {
        nodeName: 'worker-01',
        containers: [
          {
            name: 'auth-api',
            image: 'auth:v1.2',
            ports: [{ containerPort: 8080, protocol: 'TCP' }]
          }
        ]
      },
      status: {
        phase: 'Running',
        podIP: '10.244.1.33'
      }
    };
    const events = [
      {
        name: 'auth-service-789',
        namespace: 'production',
        type: 'Normal',
        reason: 'Scheduled',
        message: 'Successfully assigned production/auth-service-789 to worker-01'
      },
      {
        name: 'auth-service-789',
        namespace: 'production',
        type: 'Normal',
        reason: 'Started',
        message: 'Started container auth-api'
      }
    ];

    const desc = formatDescribe(pod, events);
    assert.match(desc, /^Name:\s+auth-service-789/m);
    assert.match(desc, /^Namespace:\s+production/m);
    assert.match(desc, /^Status:\s+Running/m);
    assert.match(desc, /^IP:\s+10\.244\.1\.33/m);
    assert.match(desc, /Containers:/);
    assert.match(desc, /auth-api:/);
    assert.match(desc, /Port:\s+8080\/TCP/);
    assert.match(desc, /Conditions:/);
    assert.match(desc, /Initialized\s+True/);
    assert.match(desc, /Events:/);
    assert.match(desc, /Normal\s+Scheduled\s+.*Successfully assigned/);
    assert.match(desc, /Normal\s+Started\s+.*Started container auth-api/);
  });

  await t.test('16. formatDescribe produces authentic Deployment, Service, and Node descriptions', () => {
    const { formatDescribe } = require('../src/core/cliFormatter');
    const deploy = {
      kind: 'Deployment',
      metadata: { name: 'cart-service', namespace: 'default' },
      spec: { replicas: 3, selector: { matchLabels: { app: 'cart' } }, template: { spec: { containers: [{ name: 'cart', image: 'cart:1.0' }] } } },
      status: { readyReplicas: 3, availableReplicas: 3, updatedReplicas: 3 }
    };
    const descDeploy = formatDescribe(deploy);
    assert.match(descDeploy, /^Name:\s+cart-service/m);
    assert.match(descDeploy, /Replicas:\s+3 desired \| 3 updated \| 3 total \| 3 available \| 0 unavailable/);
    assert.match(descDeploy, /Pod Template:/);
    assert.match(descDeploy, /RollingUpdateStrategy:/);

    const svc = {
      kind: 'Service',
      metadata: { name: 'cart-svc', namespace: 'default' },
      spec: { type: 'ClusterIP', clusterIP: '10.96.20.5', ports: [{ name: 'grpc', port: 50051, protocol: 'TCP' }] },
      status: { endpoints: ['10.244.1.10:50051'] }
    };
    const descSvc = formatDescribe(svc);
    assert.match(descSvc, /^Name:\s+cart-svc/m);
    assert.match(descSvc, /Type:\s+ClusterIP/);
    assert.match(descSvc, /IP:\s+10\.96\.20\.5/);
    assert.match(descSvc, /Port:\s+grpc\s+50051\/TCP/);
    assert.match(descSvc, /Endpoints:\s+10\.244\.1\.10:50051/);

    const node = {
      kind: 'Node',
      metadata: { name: 'worker-01', labels: { 'kubernetes.io/os': 'linux' } },
      status: { phase: 'Ready', internalIP: '192.168.1.10' }
    };
    const descNode = formatDescribe(node);
    assert.match(descNode, /^Name:\s+worker-01/m);
    assert.match(descNode, /Roles:\s+worker/);
    assert.match(descNode, /Capacity:/);
    assert.match(descNode, /Allocatable:/);
    assert.match(descNode, /System Info:/);
  });

  await t.test('17. TerminalEngine end-to-end integration for -o yaml, -o json, -o jsonpath & describe', () => {
    const { VirtualCluster } = require('../src/core/virtualCluster');
    const { TerminalEngine } = require('../src/core/terminalEngine');
    const cluster = new VirtualCluster();
    const terminal = new TerminalEngine(cluster);

    cluster.applyManifest(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-api
  namespace: default
  labels:
    tier: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      tier: backend
  template:
    metadata:
      labels:
        tier: backend
    spec:
      containers:
      - name: api
        image: demo:v1
`);

    // -o yaml
    const resYaml = terminal.execute('kubectl get deployment demo-api -o yaml');
    assert.equal(resYaml.exitCode, 0);
    assert.match(resYaml.output, /apiVersion:\s*apps\/v1/);
    assert.match(resYaml.output, /kind:\s*Deployment/);
    assert.match(resYaml.output, /name:\s*demo-api/);

    // -o json
    const resJson = terminal.execute('kubectl get deployment demo-api -o json');
    assert.equal(resJson.exitCode, 0);
    const parsed = JSON.parse(resJson.output);
    assert.equal(parsed.metadata.name, 'demo-api');

    // -o jsonpath
    const resJPath = terminal.execute("kubectl get deployment demo-api -o jsonpath='{.metadata.name}'");
    assert.equal(resJPath.exitCode, 0);
    assert.equal(resJPath.output.trim(), 'demo-api');

    // kubectl describe
    const resDesc = terminal.execute('kubectl describe deployment demo-api');
    assert.equal(resDesc.exitCode, 0);
    assert.match(resDesc.output, /^Name:\s+demo-api/m);
    assert.match(resDesc.output, /RollingUpdateStrategy:/);
  });

  await t.test('18. formatApiError renders authentic Kubernetes API errors', () => {
    const { formatApiError } = require('../src/core/cliFormatter');
    assert.equal(formatApiError('NotFound', { kind: 'Pod', name: 'missing-pod' }), 'Error from server (NotFound): pod "missing-pod" not found');
    assert.equal(formatApiError('AlreadyExists', { kind: 'Deployment', name: 'web' }), 'Error from server (AlreadyExists): deployment "web" already exists');
    assert.match(
      formatApiError('Forbidden', { kind: 'Pod', name: 'vault-db', user: 'dev-user', verb: 'delete', namespace: 'prod' }),
      /Error from server \(Forbidden\): pods "vault-db" is forbidden: User "dev-user" cannot delete resource "pods" in API group "" in the namespace "prod"/
    );
    assert.equal(
      formatApiError('Invalid', { kind: 'Deployment', name: 'bad-deploy', field: 'spec.replicas', reason: '-1 must be greater than or equal to 0' }),
      'The Deployment "bad-deploy" is invalid: spec.replicas: Invalid value: -1 must be greater than or equal to 0'
    );
    assert.match(formatApiError('BadRequest', { message: 'no objects passed to apply' }), /Error from server \(BadRequest\): no objects passed to apply/);
    assert.match(formatApiError('Conflict', { kind: 'Pod', name: 'order-pod' }), /Error from server \(Conflict\): Operation cannot be fulfilled on pod "order-pod"/);
    assert.equal(formatApiError('Unauthorized'), 'error: You must be logged in to the server (Unauthorized)');
    assert.match(formatApiError('ConnectionRefused'), /The connection to the server 127\.0\.0\.1:6443 was refused/);
    assert.equal(formatApiError('CommandNotFound', { bin: 'mycli' }), 'bash: mycli: command not found');
    assert.equal(formatApiError('PermissionDenied', { bin: '/etc/shadow' }), 'bash: /etc/shadow: Permission denied');
  });

  await t.test('19. createApiError sets authentic POSIX exit codes and HTTP statuses', () => {
    const { createApiError, KubernetesApiError } = require('../src/core/cliFormatter');
    const nf = createApiError('NotFound', { kind: 'Service', name: 'api' });
    assert.ok(nf instanceof KubernetesApiError);
    assert.equal(nf.exitCode, 1);
    assert.equal(nf.status, 404);

    const cnf = createApiError('CommandNotFound', { bin: 'weird-bin' });
    assert.equal(cnf.exitCode, 127);
    assert.equal(cnf.status, 404);

    const pd = createApiError('PermissionDenied', { bin: '/root/admin.key' });
    assert.equal(pd.exitCode, 126);
    assert.equal(pd.status, 403);

    const ae = createApiError('AlreadyExists', { kind: 'Namespace', name: 'prod' });
    assert.equal(ae.exitCode, 1);
    assert.equal(ae.status, 409);

    const inv = createApiError('Invalid', { kind: 'Pod', name: 'bad-pod', field: 'spec.containers', reason: 'at least 1 container required' });
    assert.equal(inv.exitCode, 1);
    assert.equal(inv.status, 422);
  });

  await t.test('20. TerminalEngine end-to-end integration for realistic exit codes & API error handling', () => {
    const { VirtualCluster } = require('../src/core/virtualCluster');
    const { TerminalEngine } = require('../src/core/terminalEngine');
    const cluster = new VirtualCluster();
    const terminal = new TerminalEngine(cluster);

    // Command not found -> exit code 127
    const resCmdNotFound = terminal.execute('nonexistent-binary-cmd --flag');
    assert.equal(resCmdNotFound.exitCode, 127);
    assert.match(resCmdNotFound.output, /bash: nonexistent-binary-cmd: command not found/);

    // kubectl get nonexistent resource -> exit code 1 with Error from server (NotFound)
    const resGetNotFound = terminal.execute('kubectl get pod nonexistent-pod-xyz');
    assert.equal(resGetNotFound.exitCode, 1);
    assert.match(resGetNotFound.output, /^Error from server \(NotFound\): pod "nonexistent-pod-xyz" not found$/m);

    // kubectl describe nonexistent resource -> exit code 1 with Error from server (NotFound)
    const resDescNotFound = terminal.execute('kubectl describe pod nonexistent-pod-xyz');
    assert.equal(resDescNotFound.exitCode, 1);
    assert.match(resDescNotFound.output, /^Error from server \(NotFound\): pod "nonexistent-pod-xyz" not found$/m);

    // kubectl delete nonexistent resource -> exit code 1 with Error from server (NotFound)
    const resDelNotFound = terminal.execute('kubectl delete pod nonexistent-pod-xyz');
    assert.equal(resDelNotFound.exitCode, 1);
    assert.match(resDelNotFound.output, /^Error from server \(NotFound\): pod "nonexistent-pod-xyz" not found$/m);

    // Create a deployment
    const resCreate = terminal.execute('kubectl create deployment unique-app --image=nginx:alpine');
    assert.equal(resCreate.exitCode, 0);

    // Create the same deployment again -> exit code 1 with Error from server (AlreadyExists)
    const resDup = terminal.execute('kubectl create deployment unique-app --image=nginx:alpine');
    assert.equal(resDup.exitCode, 1);
    assert.match(resDup.output, /^Error from server \(AlreadyExists\): deployment "unique-app" already exists$/m);
  });
});
