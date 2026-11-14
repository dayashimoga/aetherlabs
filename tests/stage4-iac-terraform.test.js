/**
 * tests/stage4-iac-terraform.test.js
 * Subphase 4.1.3 Verification: Domain 21 (IaC Foundations) & Domain 22 (Terraform / OpenTofu)
 * Validates schema conformance, deterministic 0% pre-score and 100% post-score solver execution,
 * Crossplane CompositeResourceDefinitions (XRDs) and self-service Claims, OpenTofu / Terraform HCL,
 * provider initialization, remote S3 state backends with DynamoDB locking, and cloud resource provisioning.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { CurriculumCatalog } = require('../src/curriculum/curriculumCatalog');
const { PluginManager } = require('../src/plugins/pluginManager');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { ValidationEngine, getFieldByPath } = require('../src/core/validationEngine');

const ROOT_DIR = path.resolve(__dirname, '..');
const CURRICULUM_DOMAINS_DIR = path.join(ROOT_DIR, 'src', 'curriculum', 'domains');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'plugin.schema.json');

describe('Subphase 4.1.3 — Domain 21 (IaC) & Domain 22 (Terraform / OpenTofu)', () => {
  const catalog = new CurriculumCatalog(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const pluginManager = new PluginManager(CURRICULUM_DOMAINS_DIR, SCHEMA_PATH);
  const validationEngine = new ValidationEngine();

  it('1. Schema Validation: Domain 21 and Domain 22 pass validation with zero errors', () => {
    assert.equal(
      pluginManager.validationErrors.length,
      0,
      `Validation errors: ${JSON.stringify(pluginManager.validationErrors)}`
    );

    const domain21 = pluginManager.getDomain('iac-foundations');
    assert.ok(domain21, 'Domain 21 (iac-foundations) must exist');
    assert.equal(domain21.category, 'Infrastructure as Code');
    assert.equal(domain21.trackId, 'track-platform');
    assert.equal(domain21.labs.length, 2);
    assert.equal(domain21.assessmentQuestions.length, 2);

    const domain22 = pluginManager.getDomain('terraform-opentofu');
    assert.ok(domain22, 'Domain 22 (terraform-opentofu) must exist');
    assert.equal(domain22.category, 'Infrastructure as Code');
    assert.equal(domain22.trackId, 'track-platform');
    assert.equal(domain22.labs.length, 2);
    assert.equal(domain22.assessmentQuestions.length, 2);
  });

  it('2. Deterministic Solver: All 4 labs fail before solution commands (0% score)', () => {
    const targetLabIds = [
      'lab-iac-01-crossplane-xrd',
      'lab-iac-02-crossplane-claim',
      'lab-tofu-01-vpc-cluster-apply',
      'lab-tofu-02-remote-state-locking'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));
    assert.equal(subphaseLabs.length, 4, 'Must find all 4 subphase labs');

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });
      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        0,
        `Lab ${lab.id} pre-score must be 0%, but got ${report.score}%. Report: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, false, `Lab ${lab.id} must not pass before solution`);
    }
  });

  it('3. Deterministic Solver: All 4 labs achieve 100% score after canonical solution replay', () => {
    const targetLabIds = [
      'lab-iac-01-crossplane-xrd',
      'lab-iac-02-crossplane-claim',
      'lab-tofu-01-vpc-cluster-apply',
      'lab-tofu-02-remote-state-locking'
    ];

    const allLabs = pluginManager.getAllLabs();
    const subphaseLabs = allLabs.filter((l) => targetLabIds.includes(l.id));

    for (const lab of subphaseLabs) {
      const cluster = new VirtualCluster(lab.initialClusterState || {});
      const vfs = new VirtualFileSystem();
      const terminal = new TerminalEngine({ cluster, vfs });

      // Execute canonical solution commands
      for (const cmd of lab.solutionCommands) {
        terminal.execute(cmd);
      }

      const context = {
        cluster,
        vfs,
        commandHistory: terminal.history || [],
        executedCommands: terminal.history || []
      };

      const report = validationEngine.evaluate(lab.validationRules, context);
      assert.equal(
        report.score,
        100,
        `Lab ${lab.id} post-score must be 100%, but got ${report.score}%. Rules: ${JSON.stringify(report.rules)}`
      );
      assert.equal(report.passed, true, `Lab ${lab.id} must pass after canonical solution`);
    }
  });

  it('4. Engine Parity: Domain 21 Crossplane XRDs & Claims', () => {
    const cluster = new VirtualCluster();
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /iac');
    terminal.execute('cat << \'EOF\' > /iac/xrd.yaml\napiVersion: apiextensions.crossplane.io/v1\nkind: CompositeResourceDefinition\nmetadata:\n  name: xpostgresqlinstances.database.kubelabs.io\nspec:\n  claimNames:\n    kind: PostgresInstance\nEOF');
    terminal.execute('kubectl apply -f /iac/xrd.yaml');

    const xrd = cluster.getResource('CompositeResourceDefinition', 'xpostgresqlinstances.database.kubelabs.io');
    assert.ok(xrd, 'XRD must exist in cluster');
    assert.equal(xrd.spec.claimNames.kind, 'PostgresInstance');

    terminal.execute('kubectl create namespace team-fintech');
    terminal.execute('cat << \'EOF\' > /iac/claim.yaml\napiVersion: database.kubelabs.io/v1alpha1\nkind: PostgresInstance\nmetadata:\n  name: fintech-payment-db\n  namespace: team-fintech\nspec:\n  parameters:\n    storageGB: 50\nEOF');
    terminal.execute('kubectl apply -f /iac/claim.yaml');

    const claim = cluster.getResource('PostgresInstance', 'fintech-payment-db', 'team-fintech');
    assert.ok(claim, 'Claim must exist in team-fintech namespace');
    assert.equal(claim.spec.parameters.storageGB, 50);

    const cpStatus = terminal.execute('crossplane status');
    assert.equal(cpStatus.exitCode, 0);
    assert.ok(cpStatus.output.includes('PostgresInstance/fintech-payment-db'));
  });

  it('5. Engine Parity: Domain 22 OpenTofu HCL, Remote State & Cloud Resources', () => {
    const cluster = new VirtualCluster({ cloudResources: [] });
    const vfs = new VirtualFileSystem();
    const terminal = new TerminalEngine({ cluster, vfs });

    terminal.execute('mkdir -p /infra');
    terminal.execute('cd /infra');
    const initRes = terminal.execute('tofu init');
    assert.equal(initRes.exitCode, 0);
    assert.ok(initRes.output.includes('OpenTofu has been successfully initialized!'));

    const applyRes = terminal.execute('tofu apply');
    assert.equal(applyRes.exitCode, 0);
    assert.ok(applyRes.output.includes('Apply complete!'));

    // Check cloud resources
    assert.ok(cluster.state.cloudResources.some((c) => c.id === 'aws_vpc.main'), 'aws_vpc.main must be active');
    assert.ok(cluster.state.cloudResources.some((c) => c.id === 'aws_eks_cluster.prod'), 'aws_eks_cluster.prod must be active');

    // Check backend.tf
    terminal.execute('cat << \'EOF\' > /infra/backend.tf\nterraform {\n  backend "s3" {\n    bucket = "state"\n    dynamodb_table = "locks"\n  }\n}\nEOF');
    assert.ok(vfs.exists('/infra/backend.tf'));
    assert.ok(vfs.readFile('/infra/backend.tf').includes('dynamodb_table = "locks"'));
  });
});
