'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const {
  StorageCSIEngine,
  SecurityPolicyEngine,
  parseStorageBytes
} = require('../src/core/storageAndSecurityEngine');

test('Subphase 2.2.3: parseStorageBytes unit conversion', () => {
  assert.equal(parseStorageBytes('1Ki'), 1024);
  assert.equal(parseStorageBytes('10Mi'), 10 * 1024 * 1024);
  assert.equal(parseStorageBytes('5Gi'), 5 * 1024 * 1024 * 1024);
  assert.equal(parseStorageBytes('2Ti'), 2 * 1024 * 1024 * 1024 * 1024);
  assert.equal(parseStorageBytes('1Pi'), 1 * 1024 * 1024 * 1024 * 1024 * 1024);

  assert.equal(parseStorageBytes('1k'), 1000);
  assert.equal(parseStorageBytes('5M'), 5000000);
  assert.equal(parseStorageBytes('10G'), 10000000000);
  assert.equal(parseStorageBytes('1T'), 1000000000000);

  assert.equal(parseStorageBytes(2048), 2048);
  assert.equal(parseStorageBytes(''), 0);
  assert.equal(parseStorageBytes(null), 0);
  assert.equal(parseStorageBytes(undefined), 0);
});

test('Subphase 2.2.3: StorageCSIEngine dynamic provisioning with Immediate binding mode', () => {
  const graph = new ResourceGraph();
  const csi = new StorageCSIEngine(graph);

  // Storage classes bootstrapped
  assert.ok(graph.get('StorageClass', null, 'standard'));
  assert.ok(graph.get('StorageClass', null, 'gp3-immediate'));
  assert.ok(graph.get('StorageClass', null, 'efs-rwx'));

  // Create PVC requesting gp3-immediate
  const pvc = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'app-data-pvc', namespace: 'default' },
    spec: {
      storageClassName: 'gp3-immediate',
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '20Gi' } }
    }
  };
  graph.set(pvc);

  csi.reconcileStorage();

  const boundPvc = graph.get('PersistentVolumeClaim', 'default', 'app-data-pvc');
  assert.equal(boundPvc.status?.phase, 'Bound');
  assert.ok(boundPvc.spec?.volumeName);

  const pv = graph.get('PersistentVolume', null, boundPvc.spec.volumeName);
  assert.ok(pv);
  assert.equal(pv.status?.phase, 'Bound');
  assert.equal(pv.spec?.capacity?.storage, '20Gi');
  assert.deepEqual(pv.spec?.accessModes, ['ReadWriteOnce']);
  assert.equal(pv.spec?.claimRef?.name, 'app-data-pvc');
});

test('Subphase 2.2.3: StorageCSIEngine WaitForFirstConsumer lifecycle and zone topology assignment', () => {
  const graph = new ResourceGraph();
  const csi = new StorageCSIEngine(graph);

  // Nodes in different zones
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-us-east-1a',
      labels: { 'topology.kubernetes.io/zone': 'us-east-1a' }
    }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-us-east-1b',
      labels: { 'topology.kubernetes.io/zone': 'us-east-1b' }
    }
  });

  // PVC with default 'standard' StorageClass (WaitForFirstConsumer)
  const pvc = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'db-storage', namespace: 'default' },
    spec: {
      storageClassName: 'standard',
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '50Gi' } }
    }
  };
  graph.set(pvc);

  // Reconcile before pod exists
  csi.reconcileStorage();
  let updatedPvc = graph.get('PersistentVolumeClaim', 'default', 'db-storage');
  assert.equal(updatedPvc.status?.phase, 'Pending');
  assert.match(updatedPvc.status?.message, /Waiting for first consumer/);

  // Add Pod referencing db-storage, unscheduled (no nodeName)
  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'db-pod-0', namespace: 'default' },
    spec: {
      containers: [{ name: 'db', image: 'postgres:16' }],
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'db-storage' } }]
    }
  };
  graph.set(pod);

  csi.reconcileStorage();
  updatedPvc = graph.get('PersistentVolumeClaim', 'default', 'db-storage');
  assert.equal(updatedPvc.status?.phase, 'Pending');

  // Schedule Pod to node-us-east-1a
  pod.spec.nodeName = 'node-us-east-1a';
  graph.set(pod);

  csi.reconcileStorage();
  updatedPvc = graph.get('PersistentVolumeClaim', 'default', 'db-storage');
  assert.equal(updatedPvc.status?.phase, 'Bound');
  assert.ok(updatedPvc.spec?.volumeName);

  const pv = graph.get('PersistentVolume', null, updatedPvc.spec.volumeName);
  assert.ok(pv);
  assert.equal(pv.metadata.labels?.['topology.kubernetes.io/zone'], 'us-east-1a');
  assert.ok(pv.spec?.nodeAffinity?.required?.nodeSelectorTerms);
});

test('Subphase 2.2.3: StorageCSIEngine cross-zone topology conflict detection', () => {
  const graph = new ResourceGraph();
  const csi = new StorageCSIEngine(graph);

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-zone-a',
      labels: { 'topology.kubernetes.io/zone': 'us-east-1a' }
    }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: 'node-zone-b',
      labels: { 'topology.kubernetes.io/zone': 'us-east-1b' }
    }
  });

  // Pre-bound PV in zone us-east-1a
  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: {
      name: 'pv-zone-a',
      labels: { 'topology.kubernetes.io/zone': 'us-east-1a' }
    },
    spec: {
      capacity: { storage: '10Gi' },
      accessModes: ['ReadWriteOnce'],
      claimRef: { namespace: 'default', name: 'claim-zone-a' }
    },
    status: { phase: 'Bound' }
  });

  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'claim-zone-a', namespace: 'default' },
    spec: {
      volumeName: 'pv-zone-a',
      accessModes: ['ReadWriteOnce']
    },
    status: { phase: 'Bound' }
  });

  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'zone-pod', namespace: 'default' },
    spec: {
      volumes: [{ name: 'vol', persistentVolumeClaim: { claimName: 'claim-zone-a' } }]
    }
  };

  // Attaching on node in zone us-east-1b should be rejected
  const resB = csi.validatePodVolumeAttachment(pod, 'node-zone-b');
  assert.equal(resB.allowed, false);
  assert.match(resB.error, /VolumeScheduling error/);
  assert.match(resB.error, /is located in zone "us-east-1a", but target node "node-zone-b" is in zone "us-east-1b"/);

  // Attaching on node in zone us-east-1a should be allowed
  const resA = csi.validatePodVolumeAttachment(pod, 'node-zone-a');
  assert.equal(resA.allowed, true);
});

test('Subphase 2.2.3: StorageCSIEngine RWO multi-attach conflict vs RWX multi-node support', () => {
  const graph = new ResourceGraph();
  const csi = new StorageCSIEngine(graph);

  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'node-alpha' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name: 'node-beta' }
  });

  // RWO PV & PVC
  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: { name: 'pv-rwo-disk' },
    spec: {
      capacity: { storage: '20Gi' },
      accessModes: ['ReadWriteOnce']
    },
    status: { phase: 'Bound' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'pvc-rwo-disk', namespace: 'default' },
    spec: { volumeName: 'pv-rwo-disk', accessModes: ['ReadWriteOnce'] },
    status: { phase: 'Bound' }
  });

  // Pod 1 Running on node-alpha using pvc-rwo-disk
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-alpha', namespace: 'default', uid: 'pod-alpha-uid' },
    spec: {
      nodeName: 'node-alpha',
      volumes: [{ name: 'disk', persistentVolumeClaim: { claimName: 'pvc-rwo-disk' } }]
    },
    status: { phase: 'Running' }
  });

  // Pod 2 trying to attach pvc-rwo-disk to node-beta
  const podBeta = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'pod-beta', namespace: 'default', uid: 'pod-beta-uid' },
    spec: {
      volumes: [{ name: 'disk', persistentVolumeClaim: { claimName: 'pvc-rwo-disk' } }]
    }
  };

  const rwoConflict = csi.validatePodVolumeAttachment(podBeta, 'node-beta');
  assert.equal(rwoConflict.allowed, false);
  assert.match(rwoConflict.error, /Multi-Attach error for volume "pv-rwo-disk"/);

  // Pod attaching to the same node-alpha is allowed
  const rwoSameNode = csi.validatePodVolumeAttachment(podBeta, 'node-alpha');
  assert.equal(rwoSameNode.allowed, true);

  // RWX PV & PVC
  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: { name: 'pv-rwx-share' },
    spec: {
      capacity: { storage: '100Gi' },
      accessModes: ['ReadWriteMany']
    },
    status: { phase: 'Bound' }
  });
  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'pvc-rwx-share', namespace: 'default' },
    spec: { volumeName: 'pv-rwx-share', accessModes: ['ReadWriteMany'] },
    status: { phase: 'Bound' }
  });

  // Pod on node-alpha using RWX
  graph.set({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'rwx-pod-1', namespace: 'default', uid: 'rwx-1-uid' },
    spec: {
      nodeName: 'node-alpha',
      volumes: [{ name: 'share', persistentVolumeClaim: { claimName: 'pvc-rwx-share' } }]
    },
    status: { phase: 'Running' }
  });

  // Second pod on node-beta using same RWX volume should be allowed
  const rwxPod2 = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'rwx-pod-2', namespace: 'default', uid: 'rwx-2-uid' },
    spec: {
      volumes: [{ name: 'share', persistentVolumeClaim: { claimName: 'pvc-rwx-share' } }]
    }
  };
  const rwxResult = csi.validatePodVolumeAttachment(rwxPod2, 'node-beta');
  assert.equal(rwxResult.allowed, true);
});

test('Subphase 2.2.3: StorageCSIEngine VolumeSnapshot creation and retrieval', () => {
  const graph = new ResourceGraph();
  const csi = new StorageCSIEngine(graph);

  graph.set({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'source-pvc', namespace: 'prod' },
    spec: { resources: { requests: { storage: '50Gi' } } }
  });

  const snap = csi.createSnapshot('prod-backup-snap', 'prod', 'source-pvc');
  assert.equal(snap.kind, 'VolumeSnapshot');
  assert.equal(snap.metadata.name, 'prod-backup-snap');
  assert.equal(snap.metadata.namespace, 'prod');
  assert.equal(snap.status.readyToUse, true);
  assert.equal(snap.status.restoreSize, '50Gi');

  const retrieved = graph.get('VolumeSnapshot', 'prod', 'prod-backup-snap');
  assert.ok(retrieved);
  assert.equal(retrieved.spec.source.persistentVolumeClaimName, 'source-pvc');
});

test('Subphase 2.2.3: SecurityPolicyEngine RBAC authorization', () => {
  const graph = new ResourceGraph();
  const security = new SecurityPolicyEngine(graph);

  // Superuser bypass
  assert.equal(security.can({ user: 'kubernetes-admin' }).allowed, true);
  assert.equal(security.can({ user: 'dev-alice', groups: ['system:masters'] }).allowed, true);

  // Denied by default for unauthorized user
  const denied = security.can({ user: 'dev-bob', verb: 'get', resource: 'pods', namespace: 'dev' });
  assert.equal(denied.allowed, false);

  // Setup Role and RoleBinding in namespace 'dev'
  graph.set({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: { name: 'pod-reader', namespace: 'dev' },
    rules: [{ verbs: ['get', 'list'], resources: ['pods'] }]
  });

  graph.set({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: { name: 'dev-bob-pod-reader', namespace: 'dev' },
    subjects: [{ kind: 'User', name: 'dev-bob' }],
    roleRef: { kind: 'Role', name: 'pod-reader' }
  });

  // dev-bob can get/list pods in dev
  assert.equal(security.can({ user: 'dev-bob', verb: 'get', resource: 'pods', namespace: 'dev' }).allowed, true);
  assert.equal(security.can({ user: 'dev-bob', verb: 'list', resource: 'pods', namespace: 'dev' }).allowed, true);

  // dev-bob cannot delete pods in dev
  assert.equal(security.can({ user: 'dev-bob', verb: 'delete', resource: 'pods', namespace: 'dev' }).allowed, false);

  // dev-bob cannot get pods in 'prod'
  assert.equal(security.can({ user: 'dev-bob', verb: 'get', resource: 'pods', namespace: 'prod' }).allowed, false);

  // ClusterRole and ClusterRoleBinding for cluster-wide deployments access
  graph.set({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: { name: 'deployment-admin' },
    rules: [{ verbs: ['*'], resources: ['deployments'] }]
  });

  graph.set({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: { name: 'ops-deployers' },
    subjects: [{ kind: 'Group', name: 'ops-team' }],
    roleRef: { kind: 'ClusterRole', name: 'deployment-admin' }
  });

  // Member of ops-team group can create deployments in any namespace
  const opsCan = security.can({
    user: 'dev-charlie',
    groups: ['ops-team'],
    verb: 'create',
    resource: 'deployments',
    namespace: 'staging'
  });
  assert.equal(opsCan.allowed, true);
});

test('Subphase 2.2.3: SecurityPolicyEngine Pod Security Admission (PSA) levels', () => {
  const graph = new ResourceGraph();
  const security = new SecurityPolicyEngine(graph);

  const privilegedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'root-net-pod' },
    spec: {
      hostNetwork: true,
      containers: [{
        name: 'priv',
        image: 'busybox',
        securityContext: { privileged: true }
      }]
    }
  };

  // Privileged profile allows everything
  assert.equal(security.evaluatePSA(privilegedPod, 'privileged').allowed, true);

  // Baseline rejects hostNetwork and privileged container
  const baseEval = security.evaluatePSA(privilegedPod, 'baseline');
  assert.equal(baseEval.allowed, false);
  assert.ok(baseEval.violations.some((v) => v.includes('hostNetwork')));
  assert.ok(baseEval.violations.some((v) => v.includes('privileged container')));

  // Standard pod passes baseline
  const standardPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'standard-web' },
    spec: {
      containers: [{ name: 'web', image: 'nginx:1.25' }]
    }
  };
  assert.equal(security.evaluatePSA(standardPod, 'baseline').allowed, true);

  // Standard pod fails restricted (must drop ALL caps, runAsNonRoot, allowPrivilegeEscalation: false)
  const restEvalFail = security.evaluatePSA(standardPod, 'restricted');
  assert.equal(restEvalFail.allowed, false);
  assert.ok(restEvalFail.violations.some((v) => v.includes('allowPrivilegeEscalation: false')));

  // Fully hardened pod passes restricted
  const hardenedPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'hardened-web' },
    spec: {
      securityContext: { runAsNonRoot: true, runAsUser: 10001 },
      containers: [{
        name: 'web',
        image: 'nginx:1.25-alpine',
        securityContext: {
          allowPrivilegeEscalation: false,
          capabilities: { drop: ['ALL'] }
        }
      }]
    }
  };
  assert.equal(security.evaluatePSA(hardenedPod, 'restricted').allowed, true);
});

test('Subphase 2.2.3: SecurityPolicyEngine OPA Gatekeeper constraints and Kyverno policy engine', () => {
  const graph = new ResourceGraph();
  const security = new SecurityPolicyEngine(graph);

  // 1. OPA Gatekeeper constraint requiring labels
  graph.set({
    apiVersion: 'constraints.gatekeeper.sh/v1beta1',
    kind: 'Constraint',
    metadata: { name: 'require-team-label' },
    spec: {
      match: { kinds: [{ kinds: ['Pod', 'Deployment'] }] },
      parameters: { labels: ['team', 'env'] }
    }
  });

  const podMissingLabels = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'unlabeled-pod', labels: { team: 'core' } }
  };
  const opaResFail = security.evaluateGatekeeper(podMissingLabels);
  assert.equal(opaResFail.allowed, false);
  assert.equal(opaResFail.violations.length, 1);
  assert.match(opaResFail.violations[0].message, /missing required label: "env"/);

  const podWithLabels = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'valid-pod', labels: { team: 'core', env: 'production' } }
  };
  const opaResPass = security.evaluateGatekeeper(podWithLabels);
  assert.equal(opaResPass.allowed, true);

  // 2. Kyverno ClusterPolicy mutation and validation
  graph.set({
    apiVersion: 'kyverno.io/v1',
    kind: 'ClusterPolicy',
    metadata: { name: 'secure-and-label-pods' },
    spec: {
      rules: [
        {
          name: 'inject-cost-center-label',
          match: { resources: { kinds: ['Pod'] } },
          mutate: {
            patchStrategicMerge: {
              metadata: {
                labels: { 'cost-center': 'engineering' }
              }
            }
          }
        },
        {
          name: 'validate-non-root',
          match: { resources: { kinds: ['Pod'] } },
          validate: {
            message: 'Containers must run with runAsNonRoot: true',
            pattern: {
              spec: {
                securityContext: {
                  runAsNonRoot: true
                }
              }
            }
          }
        }
      ]
    }
  });

  const rawPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'payment-pod', labels: { app: 'payment' } },
    spec: {
      securityContext: { runAsNonRoot: true },
      containers: [{ name: 'pay', image: 'payment:v1' }]
    }
  };

  const kyvernoResult = security.evaluateKyverno(rawPod);
  assert.equal(kyvernoResult.allowed, true);
  assert.equal(kyvernoResult.resource.metadata.labels['cost-center'], 'engineering');
  assert.equal(kyvernoResult.resource.metadata.labels['app'], 'payment');

  // Kyverno validation failure
  const invalidPod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'insecure-pod' },
    spec: {
      securityContext: { runAsNonRoot: false }
    }
  };
  const kyvernoFail = security.evaluateKyverno(invalidPod);
  assert.equal(kyvernoFail.allowed, false);
  assert.equal(kyvernoFail.violations.length, 1);
  assert.match(kyvernoFail.violations[0].message, /runAsNonRoot: true/);
});

