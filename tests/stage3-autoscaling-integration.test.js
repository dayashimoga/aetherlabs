'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { ControllerManager } = require('../src/core/controllerManager');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');

// ---------------------------------------------------------------------------
// Integration tests for Subphase 3.2.2:
// HPA v2 controller reconciliation, VPA, Karpenter, Istio multiCli integration
// ---------------------------------------------------------------------------

test('Subphase 3.2.2: kubectl autoscale creates HPA, supports dry-run, rejects duplicates, and triggers live deployment scaling', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const cm = new ControllerManager(graph, vfs);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. Create target deployment
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'checkout-service', namespace: 'default' },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: 'checkout' } },
      template: {
        metadata: { labels: { app: 'checkout' } },
        spec: { containers: [{ name: 'checkout', image: 'checkout:v1' }] }
      }
    }
  });

  // 2. Test kubectl autoscale with dry-run
  const dryRunRes = dispatcher.executeCommand('kubectl autoscale deployment checkout-service --min=2 --max=8 --cpu-percent=70 --dry-run=client -o yaml');
  assert.equal(dryRunRes.code, 0);
  assert.ok(dryRunRes.stdout.includes('HorizontalPodAutoscaler'));
  assert.ok(dryRunRes.stdout.includes('checkout-service'));
  // Ensure not saved to graph during dry run
  assert.equal(graph.get('HorizontalPodAutoscaler', 'default', 'checkout-service'), null);

  // 3. Create authentic HPA via kubectl autoscale
  const autoscaleRes = dispatcher.executeCommand('kubectl autoscale deployment checkout-service --min=2 --max=8 --cpu-percent=70');
  assert.equal(autoscaleRes.code, 0);
  assert.ok(autoscaleRes.stdout.includes('horizontalpodautoscaler.autoscaling/checkout-service autoscaled'));

  const hpa = graph.get('HorizontalPodAutoscaler', 'default', 'checkout-service');
  assert.ok(hpa);
  assert.equal(hpa.spec.minReplicas, 2);
  assert.equal(hpa.spec.maxReplicas, 8);
  assert.equal(hpa.spec.metrics[0].resource.target.averageUtilization, 70);

  // 4. Test duplicate autoscale rejection
  const dupRes = dispatcher.executeCommand('kubectl autoscale deployment checkout-service --min=2 --max=8 --cpu-percent=70');
  assert.equal(dupRes.code, 1);
  assert.ok(dupRes.stderr.includes('already exists'));

  // 5. Test kubectl get hpa and describe hpa
  const getHpaRes = dispatcher.executeCommand('kubectl get hpa checkout-service');
  assert.equal(getHpaRes.code, 0);
  assert.ok(getHpaRes.stdout.includes('checkout-service'));
  assert.ok(getHpaRes.stdout.includes('Deployment/checkout-service'));

  const describeHpaRes = dispatcher.executeCommand('kubectl describe hpa checkout-service');
  assert.equal(describeHpaRes.code, 0);
  assert.ok(describeHpaRes.stdout.includes('Name:                                                  checkout-service'));
  assert.ok(describeHpaRes.stdout.includes('Reference:                                             Deployment/checkout-service'));
  assert.ok(describeHpaRes.stdout.includes('Conditions:'));

  // 6. Simulate high CPU utilization (e.g. 140% -> ratio 140/70 = 2.0 -> desired 2 * 2 = 4 replicas)
  cm.setMetricsSnapshot({
    'default/checkout-service': { cpuUtilization: 140 }
  });
  cm.reconcile();

  const scaledDeployment = graph.get('Deployment', 'default', 'checkout-service');
  assert.equal(scaledDeployment.spec.replicas, 4);

  // Verify ReplicaSet and pods scaled accordingly
  const pods = graph.list('Pod', 'default');
  const checkoutPods = pods.filter((p) => p.metadata.labels && p.metadata.labels.app === 'checkout');
  assert.equal(checkoutPods.length, 4);
});

test('Subphase 3.2.2: VerticalPodAutoscaler (VPA) reconciliation and kubectl integration', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  const cm = new ControllerManager(graph, vfs);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. Create target deployment
  graph.set({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'analytics-processor', namespace: 'default' },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'analytics' } },
      template: {
        metadata: { labels: { app: 'analytics' } },
        spec: {
          containers: [
            {
              name: 'processor',
              image: 'analytics:v2',
              resources: { requests: { cpu: '100m', memory: '128Mi' } }
            }
          ]
        }
      }
    }
  });

  // 2. Create VPA targeting analytics-processor
  const vpa = {
    apiVersion: 'autoscaling.k8s.io/v1',
    kind: 'VerticalPodAutoscaler',
    metadata: { name: 'analytics-vpa', namespace: 'default' },
    spec: {
      targetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'analytics-processor' },
      updatePolicy: { updateMode: 'Auto' },
      resourcePolicy: {
        containerPolicies: [
          {
            containerName: 'processor',
            minAllowed: { cpu: '150m', memory: '256Mi' },
            maxAllowed: { cpu: '2', memory: '4Gi' }
          }
        ]
      }
    }
  };
  graph.set(vpa);

  // 3. Set usage data and reconcile
  cm.setVpaUsageData({
    'default/analytics-vpa': {
      processor: {
        cpuSamples: ['250m', '400m', '600m'],
        memorySamples: ['256Mi', '350Mi', '512Mi']
      }
    }
  });
  cm.reconcile();

  // 4. Verify VPA recommendations generated and container requests updated
  const updatedVpa = graph.get('VerticalPodAutoscaler', 'default', 'analytics-vpa');
  assert.ok(updatedVpa.status.recommendation);
  const rec = updatedVpa.status.recommendation.containerRecommendations[0];
  assert.equal(rec.containerName, 'processor');

  const updatedDep = graph.get('Deployment', 'default', 'analytics-processor');
  const container = updatedDep.spec.template.spec.containers[0];
  assert.equal(container.resources.requests.cpu, rec.target.cpu);
  assert.equal(container.resources.requests.memory, rec.target.memory);

  // 5. Verify kubectl get vpa and describe vpa
  const getVpaRes = dispatcher.executeCommand('kubectl get vpa');
  assert.equal(getVpaRes.code, 0);
  assert.ok(getVpaRes.stdout.includes('analytics-vpa'));
  assert.ok(getVpaRes.stdout.includes('Auto'));

  const describeVpaRes = dispatcher.executeCommand('kubectl describe vpa analytics-vpa');
  assert.equal(describeVpaRes.code, 0);
  assert.ok(describeVpaRes.stdout.includes('Name:         analytics-vpa'));
  assert.ok(describeVpaRes.stdout.includes('Container Recommendations:'));
  assert.ok(describeVpaRes.stdout.includes('Container Name:  processor'));
});

test('Subphase 3.2.2: Istioctl analyze, proxy-status, and authn tls-check mesh verification', () => {
  const graph = new ResourceGraph();
  const dispatcher = new MultiCliDispatcher({ graph });

  // 1. Initial state: analyze default namespace without issues
  const analyzeEmpty = dispatcher.executeCommand('istioctl analyze -n default');
  assert.equal(analyzeEmpty.code, 0);
  assert.ok(analyzeEmpty.stdout.includes('No validation issues found'));

  // 2. Add Service
  graph.set({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'productpage', namespace: 'default' },
    spec: { ports: [{ port: 9080, name: 'http' }] }
  });

  // 3. Add VirtualService referencing subset 'v1' that has NO DestinationRule yet
  graph.set({
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'VirtualService',
    metadata: { name: 'productpage-vs', namespace: 'default' },
    spec: {
      hosts: ['productpage'],
      http: [
        {
          route: [{ destination: { host: 'productpage', subset: 'v1' }, weight: 100 }]
        }
      ]
    }
  });

  // 4. istioctl analyze detects missing subset in DestinationRule
  const analyzeIssue = dispatcher.executeCommand('istioctl analyze -n default');
  assert.equal(analyzeIssue.code, 1);
  assert.ok(analyzeIssue.stdout.includes('Error [IST0101]'));
  assert.ok(analyzeIssue.stdout.includes('Referenced host+subset not found: "productpage" subset: "v1"'));

  // 5. Add DestinationRule defining subset 'v1'
  graph.set({
    apiVersion: 'networking.istio.io/v1beta1',
    kind: 'DestinationRule',
    metadata: { name: 'productpage-dr', namespace: 'default' },
    spec: {
      host: 'productpage',
      subsets: [{ name: 'v1', labels: { version: 'v1' } }]
    }
  });

  // 6. istioctl analyze now passes cleanly!
  const analyzeResolved = dispatcher.executeCommand('istioctl analyze -n default');
  assert.equal(analyzeResolved.code, 0);
  assert.ok(analyzeResolved.stdout.includes('No validation issues found'));

  // 7. Check istioctl authn tls-check and proxy-status
  const tlsCheckRes = dispatcher.executeCommand('istioctl authn tls-check details-pod');
  assert.equal(tlsCheckRes.code, 0);
  assert.ok(tlsCheckRes.stdout.includes('mTLS'));

  const proxyStatusRes = dispatcher.executeCommand('istioctl proxy-status');
  assert.equal(proxyStatusRes.code, 0);
  assert.ok(proxyStatusRes.stdout.includes('SYNCED'));
});

