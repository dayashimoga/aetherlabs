'use strict';

/**
 * KubeLabs v3.0 - Contextual Socratic AI Mentor & CIS Security Auditor
 * 
 * Provides guided Socratic debugging hints, architectural concept breakdowns,
 * and automated CIS Kubernetes benchmark security audits without external LLM calls.
 * 
 * Pure ES2024 module with ZERO external runtime dependencies.
 */

let ValidationEngine;
try {
  ValidationEngine = require('./validationEngine').ValidationEngine;
} catch {
  ValidationEngine = null;
}

class AiMentor {
  constructor(validationEngine = null) {
    this.validationEngine = validationEngine || (ValidationEngine ? new ValidationEngine() : null);
  }

  respond({ mode = 'hint', query = '', activeLab = null, activeIncident = null, cluster, commandHistory = [] }) {
    const target = activeLab || activeIncident;
    const pods = cluster ? cluster.getResources('Pod', 'all') : [];
    const brokenPods = pods.filter((p) => p.status && p.status.reason !== 'Running');
    const services = cluster ? cluster.getResources('Service', 'all') : [];
    const zeroEpServices = services.filter((s) => s.status && s.status.endpointCount === 0);

    let validationReport = null;
    if (target && Array.isArray(target.validationRules) && cluster) {
      validationReport = this.validationEngine.evaluate(target.validationRules, cluster, commandHistory);
    }

    if (mode === 'security-audit') {
      return this.runCisSecurityAudit(cluster);
    }

    if (mode === 'debug-error') {
      return this.debugClusterAndLastCommand(brokenPods, zeroEpServices, commandHistory, validationReport);
    }

    if (mode === 'explain') {
      return this.explainConcept(target, query);
    }

    // Default: 'hint' (Socratic coaching based on live validation diff)
    return this.generateSocraticHint(target, validationReport, brokenPods, zeroEpServices, query);
  }

  generateSocraticHint(target, validationReport, brokenPods, zeroEpServices, query) {
    const lines = [];
    if (target) {
      lines.push(`### Socratic Mentor — ${target.title}`);
    } else {
      lines.push('### Socratic Cloud-Native Mentor');
    }

    if (validationReport && !validationReport.passed) {
      const nextUnmet = validationReport.results.find((r) => !r.passed);
      if (nextUnmet) {
        lines.push(`**Current Progress**: ${validationReport.passedCount}/${validationReport.totalCount} validation checks passing (${validationReport.score}%).`);
        lines.push(`**Next Objective Focus**: ${nextUnmet.description}`);
        lines.push(`- **Observed Cluster State**: \`${nextUnmet.actual}\``);
        lines.push(`- **Target State**: \`${nextUnmet.expected}\``);
        lines.push(`- **Guiding Question**: What resource or field needs to change so the controller reconciles to \`${nextUnmet.expected}\`?`);
        lines.push(`- **Actionable Hint**: ${nextUnmet.remediation}`);
      }
    } else if (validationReport && validationReport.passed) {
      lines.push('**All validation assertions are currently passing (100%)!** Click **Validate Lab / Verify Resolution** to record your completion and claim your XP.');
    }

    if (brokenPods.length > 0) {
      const bp = brokenPods[0];
      lines.push(
        `\n**Live Cluster Telemetry Alert**: Pod \`${bp.metadata.namespace}/${bp.metadata.name}\` is in state \`${bp.status.reason}\` (${bp.status.message}). Inspect it with \`kubectl describe pod ${bp.metadata.name} -n ${bp.metadata.namespace}\`.`
      );
    }

    if (zeroEpServices.length > 0) {
      const zs = zeroEpServices[0];
      lines.push(
        `\n**Networking Telemetry**: Service \`${zs.metadata.namespace}/${zs.metadata.name}\` currently has \`0\` endpoints for selector \`${JSON.stringify(zs.spec.selector)}\`.`
      );
    }

    if (query && query.trim()) {
      lines.push(`\n**Direct Answer to "${query.trim()}"**: Use \`kubectl get all -A\` to inspect live resources across namespaces, or check the step-by-step instructions panel for exact resource names and namespaces.`);
    }

    return {
      mode: 'hint',
      response: lines.join('\n'),
      timestamp: new Date().toISOString()
    };
  }

  debugClusterAndLastCommand(brokenPods, zeroEpServices, commandHistory, validationReport) {
    const lastCmd = commandHistory.length > 0 ? commandHistory[commandHistory.length - 1] : null;
    const lines = ['### Root-Cause Diagnostic Analysis'];

    if (lastCmd) {
      lines.push(`- **Last Executed Command**: \`${lastCmd.command || lastCmd}\``);
    }

    if (brokenPods.length > 0) {
      for (const p of brokenPods) {
        lines.push(
          `- **Pod Fault Detected**: \`${p.metadata.namespace}/${p.metadata.name}\` -> \`${p.status.reason}\` — ${p.status.message}`
        );
      }
    } else if (zeroEpServices.length > 0) {
      for (const s of zeroEpServices) {
        lines.push(
          `- **Service Endpoint Mismatch**: \`${s.metadata.namespace}/${s.metadata.name}\` has 0 endpoints. Verify pod labels match \`${JSON.stringify(s.spec.selector)}\`.`
        );
      }
    } else {
      lines.push('- **Cluster Health**: All scheduled pods are `Running` and all services have active endpoints.');
    }

    if (validationReport && !validationReport.passed) {
      const failed = validationReport.results.filter((r) => !r.passed);
      lines.push(`- **Remaining Validation Gaps (${failed.length})**:`);
      for (const f of failed) {
        lines.push(`  - ${f.description}: ${f.remediation}`);
      }
    }

    return {
      mode: 'debug-error',
      response: lines.join('\n'),
      timestamp: new Date().toISOString()
    };
  }

  explainConcept(target, query) {
    const title = target ? target.title : 'Cloud-Native Reconciliation Loop';
    const scenario = target ? target.productionContext || target.scenario || target.alertSummary : '';
    return {
      mode: 'explain',
      response: [
        `### Architectural Deep-Dive: ${title}`,
        scenario ? `**Production Context**: ${scenario}` : '',
        '**Core Mental Model**:',
        '1. **Declarative Desired State**: Kubernetes, Argo CD, and OpenTofu continuously compare desired spec against observed status.',
        '2. **Controller Reconciliation**: Controllers (Deployment, ReplicaSet, EndpointSlice, Scheduler) watch API objects and drive actual state toward desired state.',
        '3. **Zero-Trust & Observability**: Production workloads combine least-privilege RBAC, non-root Pod Security, NetworkPolicies, and golden-signal telemetry.',
        query ? `\n**Focused Note on "${query}"**: Always verify changes via both \`kubectl get\` and \`kubectl describe\` to confirm controller events.` : ''
      ]
        .filter(Boolean)
        .join('\n\n'),
      timestamp: new Date().toISOString()
    };
  }

  runCisSecurityAudit(cluster) {
    const findings = [];
    const pods = cluster ? cluster.getResources('Pod', 'all') : [];
    const netpols = cluster ? cluster.getResources('NetworkPolicy', 'all') : [];
    const roles = cluster ? cluster.getResources('Role', 'all') : [];

    for (const p of pods) {
      if (p.metadata.namespace === 'kube-system') continue;
      const c = (p.spec && p.spec.containers && p.spec.containers[0]) || {};
      const secCtx = (c.securityContext || (p.spec && p.spec.securityContext)) || {};
      if (!secCtx.runAsNonRoot) {
        findings.push(
          `[CIS-5.2.6 WARN] Pod ${p.metadata.namespace}/${p.metadata.name} does not explicitly enforce securityContext.runAsNonRoot=true.`
        );
      }
      if (!c.resources || !c.resources.limits) {
        findings.push(
          `[CIS-5.4.1 INFO] Pod ${p.metadata.namespace}/${p.metadata.name} has no CPU/Memory resource limits defined.`
        );
      }
    }

    if (netpols.length === 0) {
      findings.push('[CIS-5.3.2 WARN] No NetworkPolicy objects detected; pod-to-pod traffic is unrestricted.');
    } else {
      findings.push(`[CIS-5.3.2 PASS] ${netpols.length} NetworkPolicy object(s) active enforcing micro-segmentation.`);
    }

    if (roles.length > 0) {
      findings.push(`[CIS-5.1.1 PASS] ${roles.length} namespace-scoped RBAC Role(s) configured.`);
    }

    return {
      mode: 'security-audit',
      response: [
        '### CIS Kubernetes Benchmark & DevSecOps Posture Audit',
        ...findings
      ].join('\n- '),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { AiMentor };

