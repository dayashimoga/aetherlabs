'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MultiCliDispatcher } = require('../src/core/multiCliDispatcher');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ResourceGraph } = require('../src/core/resourceGraph');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { ControllerManager } = require('../src/core/controllerManager');

test('1.2.3 - Helm: install, upgrade, rollback, uninstall, list, repo, template, lint, package', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const cm = new ControllerManager(graph);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. helm repo
  const repoAdd = dispatcher.executeCommand('helm repo add bitnami https://charts.bitnami.com/bitnami');
  assert.equal(repoAdd.code, 0);
  assert.ok(repoAdd.stdout.includes('"bitnami" has been added to your repositories'));

  const repoList = dispatcher.executeCommand('helm repo list');
  assert.equal(repoList.code, 0);
  assert.ok(repoList.stdout.includes('bitnami'));

  const repoUp = dispatcher.executeCommand('helm repo update');
  assert.equal(repoUp.code, 0);
  assert.ok(repoUp.stdout.includes('Update Complete'));

  // 2. helm install
  const installRes = dispatcher.executeCommand('helm install my-redis bitnami/redis -n production --set replicaCount=2');
  assert.equal(installRes.code, 0);
  assert.ok(installRes.stdout.includes('STATUS: deployed'));
  assert.ok(installRes.stdout.includes('NAME: my-redis'));

  // Verify Deployment created in ResourceGraph
  const dep = graph.get('Deployment', 'production', 'my-redis-redis');
  assert.ok(dep, 'Deployment my-redis-redis should exist in graph');
  assert.equal(dep.spec.replicas, 2);

  // 3. helm list
  const listRes = dispatcher.executeCommand('helm list -n production');
  assert.equal(listRes.code, 0);
  assert.ok(listRes.stdout.includes('my-redis'));
  assert.ok(listRes.stdout.includes('production'));

  // 4. helm upgrade
  const upgradeRes = dispatcher.executeCommand('helm upgrade my-redis bitnami/redis -n production');
  assert.equal(upgradeRes.code, 0);
  assert.ok(upgradeRes.stdout.includes('Release "my-redis" has been upgraded'));
  assert.ok(upgradeRes.stdout.includes('REVISION: 2'));

  // 5. helm rollback
  const rollbackRes = dispatcher.executeCommand('helm rollback my-redis 1');
  assert.equal(rollbackRes.code, 0);
  assert.ok(rollbackRes.stdout.includes('Rollback was a success!'));

  // 6. helm template
  const templateRes = dispatcher.executeCommand('helm template my-redis bitnami/redis');
  assert.equal(templateRes.code, 0);
  assert.ok(templateRes.stdout.includes('kind: Deployment'));
  assert.ok(templateRes.stdout.includes('kind: Service'));

  // 7. helm lint & package
  vfs.mkdir('/home/learner/my-chart', { recursive: true });
  vfs.writeFile('/home/learner/my-chart/Chart.yaml', 'apiVersion: v2\nname: my-chart\nversion: 1.2.0\n');
  const lintRes = dispatcher.executeCommand('helm lint /home/learner/my-chart');
  assert.equal(lintRes.code, 0);
  assert.ok(lintRes.stdout.includes('1 chart(s) linted, 0 chart(s) failed'));

  const pkgRes = dispatcher.executeCommand('helm package /home/learner/my-chart -d /home/learner');
  assert.equal(pkgRes.code, 0);
  assert.ok(pkgRes.stdout.includes('my-chart-1.2.0.tgz'));
  assert.ok(vfs.exists('/home/learner/my-chart-1.2.0.tgz'));

  // 8. helm uninstall
  const uninstRes = dispatcher.executeCommand('helm uninstall my-redis');
  assert.equal(uninstRes.code, 0);
  assert.ok(uninstRes.stdout.includes('release "my-redis" uninstalled'));
  assert.equal(graph.get('Deployment', 'production', 'my-redis-redis'), null);
});

test('1.2.3 - Kustomize: build with overlays, prefixes, labels, and edit commands', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // Setup directory structure
  vfs.mkdir('/home/learner/k8s/base', { recursive: true });
  vfs.writeFile('/home/learner/k8s/base/deployment.yaml', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: nginx:1.24
`);
  vfs.writeFile('/home/learner/k8s/base/kustomization.yaml', `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: staging
namePrefix: dev-
commonLabels:
  environment: staging
resources:
- deployment.yaml
images:
- name: nginx
  newName: nginx
  newTag: 1.25.0-alpine
`);

  // kustomize build
  const buildRes = dispatcher.executeCommand('kustomize build /home/learner/k8s/base');
  assert.equal(buildRes.code, 0);
  assert.ok(buildRes.stdout.includes('dev-api-server'));
  assert.ok(buildRes.stdout.includes('staging'));
  assert.ok(buildRes.stdout.includes('environment: staging'));
  assert.ok(buildRes.stdout.includes('nginx:1.25.0-alpine'));

  // kustomize edit
  const editNs = dispatcher.executeCommand('kustomize edit set namespace prod', { cwd: '/home/learner/k8s/base' });
  assert.equal(editNs.code, 0);
  const updatedBuild = dispatcher.executeCommand('kustomize build /home/learner/k8s/base');
  assert.ok(updatedBuild.stdout.includes('namespace: prod'));
});

test('1.2.3 - ArgoCD & Flux GitOps binaries', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const cm = new ControllerManager(graph);
  const dispatcher = new MultiCliDispatcher({ graph, controllerManager: cm, vfs });

  // 1. argocd app create & list
  const appCreate = dispatcher.executeCommand('argocd app create orders-app --repo https://github.com/org/repo.git --path k8s/prod --dest-server https://kubernetes.default.svc --dest-namespace production');
  assert.equal(appCreate.code, 0);
  assert.ok(appCreate.stdout.includes("application 'orders-app' created"));

  const appList = dispatcher.executeCommand('argocd app list');
  assert.equal(appList.code, 0);
  assert.ok(appList.stdout.includes('orders-app'));

  // 2. argocd app get & diff
  const appGet = dispatcher.executeCommand('argocd app get orders-app');
  assert.equal(appGet.code, 0);
  assert.ok(appGet.stdout.includes('Name:               orders-app'));

  // 3. argocd app sync & wait
  const appSync = dispatcher.executeCommand('argocd app sync orders-app');
  assert.equal(appSync.code, 0);
  assert.ok(appSync.stdout.includes('Synced'));
  assert.ok(appSync.stdout.includes('Healthy'));

  const appWait = dispatcher.executeCommand('argocd app wait orders-app');
  assert.equal(appWait.code, 0);
  assert.ok(appWait.stdout.includes("Application 'orders-app' is Synced and Healthy"));

  // 4. argocd app history & rollback
  const appHist = dispatcher.executeCommand('argocd app history orders-app');
  assert.equal(appHist.code, 0);
  assert.ok(appHist.stdout.includes('REVISION'));

  const appRollback = dispatcher.executeCommand('argocd app rollback orders-app 1');
  assert.equal(appRollback.code, 0);
  assert.ok(appRollback.stdout.includes("Rolled back application 'orders-app' to revision 1"));

  // 5. Flux check, get, reconcile, create
  const fluxCheck = dispatcher.executeCommand('flux check');
  assert.equal(fluxCheck.code, 0);
  assert.ok(fluxCheck.stdout.includes('all checks passed'));

  const fluxGet = dispatcher.executeCommand('flux get kustomizations');
  assert.equal(fluxGet.code, 0);
  assert.ok(fluxGet.stdout.includes('apps'));

  const fluxRec = dispatcher.executeCommand('flux reconcile kustomization apps');
  assert.equal(fluxRec.code, 0);
  assert.ok(fluxRec.stdout.includes('reconciled successfully'));

  const fluxCreate = dispatcher.executeCommand('flux create source git my-source --url=https://github.com/my/repo --branch=main');
  assert.equal(fluxCreate.code, 0);
  assert.ok(fluxCreate.stdout.includes('GitRepository source created'));
});

test('1.2.3 - OpenTofu / Terraform: init, plan, apply, state, output, destroy', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // 1. init
  const initRes = dispatcher.executeCommand('tofu init');
  assert.equal(initRes.code, 0);
  assert.ok(initRes.stdout.includes('OpenTofu has been successfully initialized!'));

  // 2. plan
  const planRes = dispatcher.executeCommand('tofu plan');
  assert.equal(planRes.code, 0);
  assert.ok(planRes.stdout.includes('Plan: 2 to add'));

  // 3. apply
  const applyRes = dispatcher.executeCommand('tofu apply -auto-approve', { cwd: '/home/learner' });
  assert.equal(applyRes.code, 0);
  assert.ok(applyRes.stdout.includes('Apply complete!'));
  assert.ok(vfs.exists('/home/learner/terraform.tfstate'));

  // 4. state list & show
  const stateList = dispatcher.executeCommand('tofu state list');
  assert.equal(stateList.code, 0);
  assert.ok(stateList.stdout.includes('aws_vpc.main'));

  const stateShow = dispatcher.executeCommand('tofu state show aws_vpc.main');
  assert.equal(stateShow.code, 0);
  assert.ok(stateShow.stdout.includes('resource "aws_vpc" "main"'));

  // 5. output
  const outputRes = dispatcher.executeCommand('tofu output cluster_endpoint');
  assert.equal(outputRes.code, 0);
  assert.ok(outputRes.stdout.includes('https://78A9C12.gr7.us-east-1.eks.amazonaws.com'));

  // 6. destroy
  const destroyRes = dispatcher.executeCommand('tofu destroy -auto-approve', { cwd: '/home/learner' });
  assert.equal(destroyRes.code, 0);
  assert.ok(destroyRes.stdout.includes('Destroy complete!'));
});

test('1.2.3 - Multi-Cloud, Service Mesh, Security & Observability CLIs', () => {
  const graph = new ResourceGraph();
  const vfs = new VirtualFileSystem();
  vfs.reset();
  const dispatcher = new MultiCliDispatcher({ graph, vfs });

  // Cloud CLIs: aws, az, gcloud
  const awsSts = dispatcher.executeCommand('aws sts get-caller-identity');
  assert.equal(awsSts.code, 0);
  assert.ok(awsSts.stdout.includes('cloud-engineer'));

  const awsS3Ls = dispatcher.executeCommand('aws s3 ls');
  assert.equal(awsS3Ls.code, 0);
  assert.ok(awsS3Ls.stdout.includes('kubelabs-tfstate-bucket'));

  vfs.writeFile('/home/learner/test.txt', 'hello s3');
  const awsS3Cp = dispatcher.executeCommand('aws s3 cp /home/learner/test.txt s3://kubelabs-backup-artifacts/test.txt');
  assert.equal(awsS3Cp.code, 0);
  assert.ok(awsS3Cp.stdout.includes('upload:'));

  const azAks = dispatcher.executeCommand('az aks list');
  assert.equal(azAks.code, 0);
  assert.ok(azAks.stdout.includes('aks-production'));

  const gcloudGke = dispatcher.executeCommand('gcloud container clusters list');
  assert.equal(gcloudGke.code, 0);
  assert.ok(gcloudGke.stdout.includes('gke-production'));

  // Service Mesh: istioctl, linkerd
  const istioAnalyze = dispatcher.executeCommand('istioctl analyze');
  assert.equal(istioAnalyze.code, 0);
  assert.ok(istioAnalyze.stdout.includes('No validation issues'));

  const istioPc = dispatcher.executeCommand('istioctl proxy-config endpoints web-frontend');
  assert.equal(istioPc.code, 0);
  assert.ok(istioPc.stdout.includes('ENDPOINT'));

  const istioDash = dispatcher.executeCommand('istioctl dashboard kiali');
  assert.equal(istioDash.code, 0);
  assert.ok(istioDash.stdout.includes(':20001/kiali'));

  const linkerdCheck = dispatcher.executeCommand('linkerd check');
  assert.equal(linkerdCheck.code, 0);
  assert.ok(linkerdCheck.stdout.includes('Status check succeeded'));

  const linkerdStat = dispatcher.executeCommand('linkerd viz stat');
  assert.equal(linkerdStat.code, 0);
  assert.ok(linkerdStat.stdout.includes('orders-api'));

  const linkerdTap = dispatcher.executeCommand('linkerd viz tap deploy/orders-api');
  assert.equal(linkerdTap.code, 0);
  assert.ok(linkerdTap.stdout.includes(':method=GET'));

  // Security: trivy, falco, cosign, k8sgpt
  const trivyScan = dispatcher.executeCommand('trivy image nginx:latest');
  assert.equal(trivyScan.code, 0);
  assert.ok(trivyScan.stdout.includes('Scan Target: nginx:latest'));

  const falcoCheck = dispatcher.executeCommand('falco -c /etc/falco/falco_rules.yaml');
  assert.equal(falcoCheck.code, 0);
  assert.ok(falcoCheck.stdout.includes('Falco version: 0.38.1'));

  const cosignVer = dispatcher.executeCommand('cosign verify ghcr.io/kubelabs/app:v1.0.0');
  assert.equal(cosignVer.code, 0);
  assert.ok(cosignVer.stdout.includes('cosign container image signature'));

  const k8sgptRes = dispatcher.executeCommand('k8sgpt analyze --explain');
  assert.equal(k8sgptRes.code, 0);
  assert.ok(k8sgptRes.stdout.includes('AI Provider: local'));

  // Observability: promql, logql, velero
  const promqlRes = dispatcher.executeCommand('promql query "up"');
  assert.equal(promqlRes.code, 0);

  const veleroBackup = dispatcher.executeCommand('velero backup create weekly-drill');
  assert.equal(veleroBackup.code, 0);
  assert.ok(veleroBackup.stdout.includes('weekly-drill'));

  const veleroGet = dispatcher.executeCommand('velero backup get');
  assert.equal(veleroGet.code, 0);
  assert.ok(veleroGet.stdout.includes('weekly-drill'));
});
