'use strict';

const { getFieldByPath } = require('./virtualCluster');

class ValidationEngine {
  evaluate(validationRules, virtualCluster, commandHistory = []) {
    virtualCluster.reconcile();
    const results = [];

    for (const rule of validationRules || []) {
      const check = this.evaluateRule(rule, virtualCluster, commandHistory);
      results.push({
        id: rule.id,
        description: rule.description,
        type: rule.type,
        passed: check.passed,
        actual: check.actual,
        expected: check.expected,
        remediation: check.passed ? null : rule.remediation
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;
    const passed = totalCount > 0 && passedCount === totalCount;

    return {
      passed,
      score,
      passedCount,
      totalCount,
      results,
      evaluatedAt: new Date().toISOString()
    };
  }

  evaluateRule(rule, cluster, commandHistory) {
    const ns = rule.namespace || 'default';

    switch (rule.type) {
      case 'resource_exists': {
        const res = cluster.getResource(rule.kind, rule.name, ns);
        return {
          passed: Boolean(res),
          actual: res ? `${rule.kind}/${rule.name} exists in ${ns}` : 'Not found',
          expected: `${rule.kind}/${rule.name} present in ${ns}`
        };
      }

      case 'resource_field_equals': {
        const res = cluster.getResource(rule.kind, rule.name, ns);
        if (!res) {
          return {
            passed: false,
            actual: `${rule.kind}/${rule.name} not found`,
            expected: `${rule.fieldPath} == ${JSON.stringify(rule.expectedValue)}`
          };
        }
        const actualVal = getFieldByPath(res, rule.fieldPath);
        const passed = String(actualVal) === String(rule.expectedValue);
        return {
          passed,
          actual: actualVal !== undefined ? String(actualVal) : 'undefined',
          expected: String(rule.expectedValue)
        };
      }

      case 'resource_field_contains': {
        const res = cluster.getResource(rule.kind, rule.name, ns);
        if (!res) {
          return {
            passed: false,
            actual: `${rule.kind}/${rule.name} not found`,
            expected: `${rule.fieldPath} contains "${rule.expectedValue}"`
          };
        }
        const actualVal = getFieldByPath(res, rule.fieldPath);
        const serialized = typeof actualVal === 'object' ? JSON.stringify(actualVal) : String(actualVal || '');
        const passed = serialized.includes(String(rule.expectedValue));
        return {
          passed,
          actual: serialized,
          expected: `Contains "${rule.expectedValue}"`
        };
      }

      case 'pod_status_running': {
        const pods = cluster.getResources('Pod', ns);
        const matching = pods.filter(
          (p) =>
            p.metadata.name === rule.name ||
            p.metadata.name.startsWith(`${rule.name}-`) ||
            p.metadata.ownerDeployment === rule.name
        );
        const runningPods = matching.filter(
          (p) => p.status && p.status.phase === 'Running' && p.status.reason === 'Running'
        );
        return {
          passed: runningPods.length > 0 && runningPods.length === matching.length,
          actual:
            matching.length === 0
              ? 'No matching pods found'
              : `${runningPods.length}/${matching.length} pods Running (${matching.map((m) => m.status.reason).join(', ')})`,
          expected: `All pods for "${rule.name}" in Running & Ready state`
        };
      }

      case 'service_has_endpoints': {
        const svc = cluster.getResource('Service', rule.name, ns);
        if (!svc) {
          return {
            passed: false,
            actual: `Service ${ns}/${rule.name} not found`,
            expected: 'At least 1 active endpoint'
          };
        }
        const count = (svc.status && svc.status.endpointCount) || 0;
        const minExpected = Number(rule.expectedValue || 1);
        return {
          passed: count >= minExpected,
          actual: `${count} active endpoint(s) (${((svc.status && svc.status.endpoints) || []).join(', ') || 'none'})`,
          expected: `>= ${minExpected} active endpoint(s)`
        };
      }

      case 'replica_count_min': {
        const res = cluster.getResource(rule.kind || 'Deployment', rule.name, ns);
        if (!res) {
          return {
            passed: false,
            actual: `${rule.kind || 'Deployment'}/${rule.name} not found`,
            expected: `>= ${rule.expectedValue} ready replicas`
          };
        }
        const ready = (res.status && res.status.readyReplicas) || 0;
        const min = Number(rule.expectedValue || 1);
        return {
          passed: ready >= min,
          actual: `${ready} ready replicas`,
          expected: `>= ${min} ready replicas`
        };
      }

      case 'command_executed': {
        const sub = String(rule.commandSubstring || rule.expectedValue || '').toLowerCase();
        const found = (commandHistory || []).some((entry) => {
          const cmd = typeof entry === 'string' ? entry : entry.command || '';
          return cmd.toLowerCase().includes(sub);
        });
        return {
          passed: found,
          actual: found ? `Executed command matching "${sub}"` : 'Command not yet executed',
          expected: `Command containing "${sub}"`
        };
      }

      case 'cloud_resource_exists': {
        const target = String(rule.name || rule.expectedValue || '');
        const found = (cluster.state.cloudResources || []).some(
          (cr) => cr.id === target || cr.name === target || cr.type === target
        );
        return {
          passed: found,
          actual: found ? `Cloud resource "${target}" ACTIVE` : `Cloud resource "${target}" not provisioned`,
          expected: `Cloud resource "${target}" ACTIVE`
        };
      }

      case 'helm_release_deployed': {
        const target = String(rule.name || '');
        const rel = (cluster.state.helmReleases || []).find(
          (r) => r.name === target && r.status === 'deployed'
        );
        return {
          passed: Boolean(rel),
          actual: rel ? `Helm release "${target}" deployed (rev ${rel.revision})` : `Helm release "${target}" not deployed`,
          expected: `Helm release "${target}" status=deployed`
        };
      }

      case 'argocd_app_synced': {
        const target = String(rule.name || '');
        const app = (cluster.state.argoApps || []).find((a) => a.name === target);
        const passed = Boolean(app && app.syncStatus === 'Synced' && app.healthStatus === 'Healthy');
        return {
          passed,
          actual: app ? `${app.syncStatus} / ${app.healthStatus}` : `ArgoCD App "${target}" not found`,
          expected: 'Synced / Healthy'
        };
      }

      default:
        return {
          passed: false,
          actual: `Unknown rule type ${rule.type}`,
          expected: 'Valid rule type'
        };
    }
  }
}

module.exports = { ValidationEngine };

