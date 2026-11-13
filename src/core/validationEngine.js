'use strict';

/**
 * KubeLabs v3.0 - Deterministic Multi-Assertion Validation Engine
 * 
 * Features:
 *  18 Comprehensive Rule Evaluators:
 *   1. packet_trace_allowed: Virtual CNI hop-by-hop packet trace allowed
 *   2. packet_trace_blocked: Virtual CNI hop-by-hop packet trace blocked
 *   3. promql_query_result: PromQL metric query scalar/vector assertion
 *   4. rbac_can_i: RBAC authorization check (user/SA, verb, resource)
 *   5. pod_security_standard: Pod Security Admission (PSA baseline/restricted)
 *   6. slo_burn_rate_within_budget: SRE multi-window error budget burn rate
 *   7. resource_count: Reconciled cluster resource count matching
 *   8. resource_field_equals: JSONPath / dot-path field value equality
 *   9. resource_exists: Cluster resource presence verification
 *  10. service_endpoints_ready: Service active ready backing endpoints
 *  11. logql_filter_matches: Loki stream selector and line/JSON filter matching
 *  12. hpa_target_scale_achieved: HorizontalPodAutoscaler desired replica target
 *  13. vpa_recommendation_present: VerticalPodAutoscaler recommendation target
 *  14. karpenter_node_consolidated: Karpenter node pool consolidation state
 *  15. istio_route_matches: Istio VirtualService route and canary split matching
 *  16. circuit_breaker_tripped: Istio DestinationRule outlier ejection tripping
 *  17. vfs_file_contains: In-memory POSIX VirtualFileSystem file contents
 *  18. dns_resolution_succeeds: CoreDNS loop-free service and pod resolution
 * 
 * Fully backwards-compatible with legacy rules:
 *   - resource_field_contains, pod_status_running, service_has_endpoints,
 *     replica_count_min, command_executed, cloud_resource_exists,
 *     helm_release_deployed, argocd_app_synced.
 * 
 * Pure ES2024 module with ZERO external runtime dependencies.
 */

const { jsonPath } = require('./jsonPath');
const { PromQLEngine, LogQLEngine, SloBurnRateCalculator } = require('./observabilityEngine');
const {
  HorizontalPodAutoscalerEngine,
  VerticalPodAutoscalerEngine,
  KarpenterEngine,
  IstioMeshController,
  parseCpu,
  parseMemory
} = require('./autoscalingAndMeshEngine');
const { NetworkTracer } = require('./networkTracer');
const { SecurityPolicyEngine } = require('./storageAndSecurityEngine');

let ResourceGraph;
try {
  ResourceGraph = require('./resourceGraph').ResourceGraph;
} catch {
  ResourceGraph = (typeof globalThis !== 'undefined' && globalThis.ResourceGraph);
}

let NetworkingEngine;
try {
  NetworkingEngine = require('./networkingEngine').NetworkingEngine;
} catch {
  NetworkingEngine = (typeof globalThis !== 'undefined' && globalThis.NetworkingEngine);
}

// ---------------------------------------------------------------------------
// Path & Value Comparison Utilities
// ---------------------------------------------------------------------------

function getFieldByPath(obj, fieldPath) {
  if (!obj || !fieldPath) return undefined;
  const cleanPath = String(fieldPath).replace(/^\./, '').trim();

  // If path starts with $ or contains bracket query like [*], evaluate via RFC 9535 JSONPath
  if (cleanPath.startsWith('$') || cleanPath.includes('[*]') || cleanPath.includes('?(')) {
    const expr = cleanPath.startsWith('$') ? cleanPath : `$.${cleanPath}`;
    const matches = jsonPath(obj, expr);
    return matches.length > 0 ? matches[0] : undefined;
  }

  // Handle bracket property access like metadata.labels['app.kubernetes.io/name']
  const normalized = cleanPath.replace(/\[['"]([^'"]+)['"]\]/g, '.$1');
  const parts = normalized.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined) return undefined;
    const remainingKey = parts.slice(i).join('.');
    if (typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, remainingKey)) {
      return current[remainingKey];
    }
    const part = parts[i];
    const arrayMatch = part.match(/^([^\[\]]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const prop = arrayMatch[1];
      const idx = Number(arrayMatch[2]);
      current = current[prop] ? current[prop][idx] : undefined;
    } else {
      current = current[part];
    }
  }
  return current;
}

function parseQuantity(raw) {
  if (raw === undefined || raw === null || raw === '') return NaN;
  if (typeof raw === 'number') return raw;
  const str = String(raw).trim();
  if (/^[0-9]+(\.[0-9]+)?(Ki|Mi|Gi|Ti|Pi)$/i.test(str)) {
    return parseMemory(str);
  }
  if (/^[0-9]+(\.[0-9]+)?m$/.test(str)) {
    return parseCpu(str);
  }
  if (/^[+-]?[0-9]+(\.[0-9]+)?$/.test(str)) {
    return parseFloat(str);
  }
  return NaN;
}

function compareValues(actual, op, expected) {
  const operator = (op || '==').trim();

  // Try numeric comparison if both look like numbers or quantities
  const numActual = typeof actual === 'number' ? actual : parseQuantity(actual);
  const numExpected = typeof expected === 'number' ? expected : parseQuantity(expected);

  if (!isNaN(numActual) && !isNaN(numExpected) && typeof actual !== 'boolean' && typeof expected !== 'boolean' && actual !== '' && expected !== '') {
    switch (operator) {
      case '==':
      case '=':
        return Math.abs(numActual - numExpected) < 0.0001;
      case '!=':
        return Math.abs(numActual - numExpected) >= 0.0001;
      case '>=':
        return numActual >= numExpected;
      case '<=':
        return numActual <= numExpected;
      case '>':
        return numActual > numExpected;
      case '<':
        return numActual < numExpected;
      default:
        return numActual === numExpected;
    }
  }

  // Fallback to string comparison
  const strActual = actual !== undefined ? String(actual) : '';
  const strExpected = expected !== undefined ? String(expected) : '';

  switch (operator) {
    case '==':
    case '=':
      return strActual === strExpected;
    case '!=':
      return strActual !== strExpected;
    default:
      return strActual === strExpected;
  }
}

// ---------------------------------------------------------------------------
// Main ValidationEngine Class
// ---------------------------------------------------------------------------

class ValidationEngine {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
    this.activeLabId = null;
    this.boundRules = [];
  }

  /**
   * Binds the validation engine to an active lab and assertion rule set.
   * @param {string} labId Target lab identifier
   * @param {Array<Object>} [rules] Optional rule set
   * @returns {ValidationEngine}
   */
  bindLab(labId, rules = []) {
    this.activeLabId = labId;
    this.boundRules = Array.isArray(rules) ? rules : [];
    return this;
  }

  /**
   * Evaluates an array of validation rules against the cluster or execution context.
   * @param {Array<Object>|null} validationRules Array of rule definitions (or null if bound)
   * @param {Object} clusterOrContext VirtualCluster instance, ResourceGraph, or context map
   * @param {Array} commandHistory List of executed commands
   * @param {Object|string} [options] Evaluation options or target labId
   * @returns {Object} Validation report { labId, contextType, passed, score, passedCount, totalCount, results, evaluatedAt }
   */
  evaluate(validationRules = null, clusterOrContext = null, commandHistory = [], options = {}) {
    const opts = typeof options === 'string' ? { labId: options } : (options || {});
    const labId = opts.labId || opts.activeLabId || this.activeLabId || null;
    const contextType = opts.contextType || (labId ? 'lab' : 'generic');
    const rules = Array.isArray(validationRules) ? validationRules : (this.boundRules || []);

    // 1. Prepare and standardize runtime context
    const context = this._buildContext(clusterOrContext, commandHistory);

    // Trigger reconciliation if running on VirtualCluster
    if (context.cluster && typeof context.cluster.reconcile === 'function') {
      try {
        context.cluster.reconcile();
      } catch {
        // Reconciliation errors handled safely
      }
    }

    const results = [];

    // 2. Evaluate each rule deterministically
    for (const rule of rules) {
      const check = this.evaluateRule(rule, context);
      results.push({
        id: rule.id || `rule-${results.length + 1}`,
        description: rule.description || `Validate ${rule.type}`,
        type: rule.type,
        passed: check.passed,
        actual: check.actual,
        expected: check.expected,
        remediation: check.passed ? null : (rule.remediation || check.remediation || null)
      });
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;
    const passed = totalCount > 0 && passedCount === totalCount;

    return {
      labId,
      contextType,
      passed,
      score,
      passedCount,
      totalCount,
      results,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Evaluates a single validation rule against the runtime context.
   */
  evaluateRule(rule, context) {
    const ns = rule.namespace || 'default';

    switch (rule.type) {
      // -----------------------------------------------------------------------
      // 1. Packet Trace Allowed
      // -----------------------------------------------------------------------
      case 'packet_trace_allowed': {
        const tracer = context.tracer || (context.graph ? new NetworkTracer(context.graph) : null);
        if (!tracer) {
          return { passed: false, actual: 'NetworkTracer unavailable', expected: 'Packet trace allowed' };
        }
        const src = rule.srcPod || rule.src || { metadata: { name: rule.srcPodName || 'client', namespace: ns } };
        const dst = rule.dstPod || rule.dst || { metadata: { name: rule.dstPodName || 'server', namespace: ns } };
        const port = rule.port || 80;
        const proto = rule.protocol || 'TCP';

        try {
          const trace = tracer.tracePacket({ src, dst, port, protocol: proto });
          return {
            passed: trace.allowed === true,
            actual: trace.allowed ? `Packet allowed through ${trace.hops?.length || 0} stages` : `Packet dropped: ${trace.dropReason}`,
            expected: 'Packet permitted by NetworkPolicy'
          };
        } catch (err) {
          return { passed: false, actual: `Tracer error: ${err.message}`, expected: 'Packet permitted' };
        }
      }

      // -----------------------------------------------------------------------
      // 2. Packet Trace Blocked
      // -----------------------------------------------------------------------
      case 'packet_trace_blocked': {
        const tracer = context.tracer || (context.graph ? new NetworkTracer(context.graph) : null);
        if (!tracer) {
          return { passed: false, actual: 'NetworkTracer unavailable', expected: 'Packet trace blocked' };
        }
        const src = rule.srcPod || rule.src || { metadata: { name: rule.srcPodName || 'client', namespace: ns } };
        const dst = rule.dstPod || rule.dst || { metadata: { name: rule.dstPodName || 'server', namespace: ns } };
        const port = rule.port || 80;
        const proto = rule.protocol || 'TCP';

        try {
          const trace = tracer.tracePacket({ src, dst, port, protocol: proto });
          const blocked = trace.allowed === false || trace.dropped === true;
          return {
            passed: blocked,
            actual: blocked ? `Packet correctly blocked (${trace.dropReason})` : 'Packet unexpectedly allowed',
            expected: 'Packet dropped by NetworkPolicy'
          };
        } catch (err) {
          return { passed: false, actual: `Tracer error: ${err.message}`, expected: 'Packet dropped' };
        }
      }

      // -----------------------------------------------------------------------
      // 3. PromQL Query Result
      // -----------------------------------------------------------------------
      case 'promql_query_result': {
        const promql = context.promql || (context.cluster && context.cluster.promql) || new PromQLEngine();
        const query = rule.query;
        const op = rule.operator || '==';
        const expected = rule.expectedValue;

        if (Array.isArray(rule.samples)) {
          for (const s of rule.samples) {
            promql.recordSample(s.metricName || s.name, s.labels || {}, s.value);
          }
        }

        try {
          let res = null;
          if (typeof promql.query === 'function') {
            const qr = promql.query(query);
            if (qr.status === 'success' && qr.data) {
              res = qr.data;
            }
          } else if (typeof promql.evaluateInstant === 'function') {
            res = promql.evaluateInstant(query);
          }

          let actualVal = 0;
          if (res) {
            if (res.resultType === 'vector' && Array.isArray(res.result) && res.result.length > 0) {
              actualVal = res.result[0].value ? res.result[0].value[1] : res.result[0].value;
            } else if (res.resultType === 'scalar' && Array.isArray(res.result)) {
              actualVal = res.result[1];
            } else if (Array.isArray(res) && res.length > 0) {
              actualVal = res[0].value ? res[0].value[1] : res[0].value;
            } else if (res.value !== undefined) {
              actualVal = Array.isArray(res.value) ? res.value[1] : res.value;
            }
          }

          const passed = compareValues(actualVal, op, expected);
          return {
            passed,
            actual: `PromQL "${query}" -> ${actualVal}`,
            expected: `${op} ${expected}`
          };
        } catch (err) {
          return { passed: false, actual: `PromQL query error: ${err.message}`, expected: `${op} ${expected}` };
        }
      }

      // -----------------------------------------------------------------------
      // 4. RBAC Authorization (can-i)
      // -----------------------------------------------------------------------
      case 'rbac_can_i': {
        const security = context.security || (context.graph ? new SecurityPolicyEngine(context.graph) : null);
        const user = rule.user || 'developer';
        const verb = rule.verb || 'get';
        const resource = rule.resource || 'pods';
        const expectedAllowed = rule.expectedAllowed !== undefined ? rule.expectedAllowed : (rule.allowed !== undefined ? rule.allowed : true);

        let actualAllowed = false;
        let reason = '';

        if (security && typeof security.can === 'function') {
          const check = security.can({ user, groups: rule.groups || [], verb, resource, namespace: ns });
          actualAllowed = check.allowed;
          reason = check.reason;
        } else if (context.cluster && typeof context.cluster.canI === 'function') {
          const check = context.cluster.canI({ user, verb, resource, namespace: ns });
          actualAllowed = check.allowed;
          reason = check.reason || (actualAllowed ? 'Allowed' : 'Forbidden');
        } else {
          return { passed: false, actual: 'RBAC evaluator unavailable', expected: `can-i ${verb} ${resource}` };
        }

        const passed = actualAllowed === expectedAllowed;
        return {
          passed,
          actual: `User "${user}" can "${verb}" "${resource}" in "${ns}": ${actualAllowed} (${reason})`,
          expected: `Allowed == ${expectedAllowed}`
        };
      }

      // -----------------------------------------------------------------------
      // 5. Pod Security Standard (PSA)
      // -----------------------------------------------------------------------
      case 'pod_security_standard': {
        const security = context.security || (context.graph ? new SecurityPolicyEngine(context.graph) : null);
        const level = rule.level || 'baseline';
        const expectedStatus = rule.expectedStatus || 'allowed'; // 'allowed' or 'denied'

        let pod = null;
        if (rule.pod) {
          pod = rule.pod;
        } else if (context.graph && rule.name) {
          pod = context.graph.get('Pod', ns, rule.name);
        } else if (context.cluster && rule.name) {
          pod = context.cluster.getResource('Pod', rule.name, ns);
        }

        if (!pod) {
          return { passed: false, actual: `Pod "${rule.name}" not found in "${ns}"`, expected: `PSA ${level} ${expectedStatus}` };
        }

        if (security && typeof security.evaluatePSA === 'function') {
          const psaRes = security.evaluatePSA(pod, level);
          const actualStatus = psaRes.allowed ? 'allowed' : 'denied';
          const passed = actualStatus === expectedStatus;
          return {
            passed,
            actual: `PSA ${level}: ${actualStatus} (${psaRes.violations?.join('; ') || 'No violations'})`,
            expected: `PSA ${level} == ${expectedStatus}`
          };
        }

        return { passed: false, actual: 'PSA evaluator unavailable', expected: `PSA ${level} ${expectedStatus}` };
      }

      // -----------------------------------------------------------------------
      // 6. SLO Burn Rate Within Budget
      // -----------------------------------------------------------------------
      case 'slo_burn_rate_within_budget': {
        const targetSlo = rule.targetSlo !== undefined ? rule.targetSlo : (rule.sloTarget !== undefined ? rule.sloTarget : 0.99);
        const totalEvents = rule.totalEvents || 10000;
        const badEvents = rule.errorEvents !== undefined ? rule.errorEvents : (rule.badEvents !== undefined ? rule.badEvents : 50);
        const windowDays = rule.windowDays || 30;
        const periodHours = rule.windowHours || rule.periodHours || 1;
        const maxBurnRate = rule.burnRateMax !== undefined ? rule.burnRateMax : 2.0;

        try {
          const calc = SloBurnRateCalculator.calculate({
            totalEvents,
            badEvents,
            sloTarget: targetSlo,
            windowDays,
            periodHours
          });
          let passed = calc.burnRate <= maxBurnRate;
          if (rule.expectedAlertSeverity) {
            passed = passed && calc.alertSeverity === rule.expectedAlertSeverity;
          }

          return {
            passed,
            actual: `Burn Rate ${calc.burnRate} (Alert: ${calc.alertSeverity}, Budget Consumed: ${calc.budgetConsumedPercent}%)`,
            expected: `Burn Rate <= ${maxBurnRate}${rule.expectedAlertSeverity ? ` with Alert: ${rule.expectedAlertSeverity}` : ''}`
          };
        } catch (err) {
          return { passed: false, actual: `SLO calculation error: ${err.message}`, expected: `Burn rate <= ${maxBurnRate}` };
        }
      }

      // -----------------------------------------------------------------------
      // 7. Resource Count Matching
      // -----------------------------------------------------------------------
      case 'resource_count': {
        const kind = rule.kind || 'Pod';
        const op = rule.operator || '==';
        const expected = Number(rule.expectedValue || 1);

        let resources = [];
        if (context.graph) {
          resources = context.graph.list({ kind, namespace: rule.namespace || null, labelSelector: rule.labelSelector || null });
        } else if (context.cluster) {
          resources = context.cluster.getResources(kind, rule.namespace || null);
          if (rule.labelSelector) {
            // Simple label filter
            const [k, v] = rule.labelSelector.split('=');
            if (k && v) {
              resources = resources.filter((r) => r.metadata?.labels?.[k.trim()] === v.trim());
            }
          }
        }

        const count = resources.length;
        const passed = compareValues(count, op, expected);
        return {
          passed,
          actual: `${count} ${kind}(s) found`,
          expected: `${op} ${expected} ${kind}(s)`
        };
      }

      // -----------------------------------------------------------------------
      // 8. Resource Field Equals
      // -----------------------------------------------------------------------
      case 'resource_field_equals': {
        const res = this._resolveResource(rule.kind, rule.name, ns, context);
        if (!res) {
          return {
            passed: false,
            actual: `${rule.kind}/${rule.name} not found in ${ns}`,
            expected: `${rule.fieldPath} == ${JSON.stringify(rule.expectedValue)}`
          };
        }

        const actualVal = getFieldByPath(res, rule.fieldPath);
        const passed = compareValues(actualVal, rule.operator || '==', rule.expectedValue);
        return {
          passed,
          actual: actualVal !== undefined ? (typeof actualVal === 'object' ? JSON.stringify(actualVal) : String(actualVal)) : 'undefined',
          expected: String(rule.expectedValue)
        };
      }

      // -----------------------------------------------------------------------
      // 9. Resource Exists
      // -----------------------------------------------------------------------
      case 'resource_exists': {
        const res = this._resolveResource(rule.kind, rule.name, ns, context);
        const passed = Boolean(res);
        return {
          passed,
          actual: res ? `${rule.kind}/${rule.name} exists in ${ns}` : 'Not found',
          expected: `${rule.kind}/${rule.name} present in ${ns}`
        };
      }

      // -----------------------------------------------------------------------
      // 10. Service Endpoints Ready
      // -----------------------------------------------------------------------
      case 'service_endpoints_ready':
      case 'service_has_endpoints': {
        const svc = this._resolveResource('Service', rule.name, ns, context);
        if (!svc) {
          return {
            passed: false,
            actual: `Service ${ns}/${rule.name} not found`,
            expected: 'Ready active endpoints'
          };
        }

        let readyCount = (svc.status && svc.status.endpointCount) || 0;
        if (readyCount === 0 && Array.isArray(svc.status?.endpoints)) {
          readyCount = svc.status.endpoints.length;
        }

        // If context has graph, inspect actual EndpointSlice or Endpoints
        if (context.graph && readyCount === 0) {
          const eps = context.graph.get('Endpoints', ns, rule.name);
          if (eps && Array.isArray(eps.subsets)) {
            for (const sub of eps.subsets) {
              readyCount += (sub.addresses || []).length;
            }
          }
          if (readyCount === 0) {
            const slices = context.graph.list({ kind: 'EndpointSlice', namespace: ns });
            for (const slice of slices) {
              if (slice.metadata?.labels?.['kubernetes.io/service-name'] === rule.name || slice.metadata?.name?.startsWith(rule.name)) {
                readyCount += (slice.endpoints || []).filter((e) => e.conditions?.ready !== false).length;
              }
            }
          }
        }

        const minExpected = Number(rule.expectedValue || 1);
        const passed = readyCount >= minExpected;
        return {
          passed,
          actual: `${readyCount} ready endpoint(s)`,
          expected: `>= ${minExpected} ready endpoint(s)`
        };
      }

      // -----------------------------------------------------------------------
      // 11. LogQL Filter Matches
      // -----------------------------------------------------------------------
      case 'logql_filter_matches': {
        const logql = context.logql || new LogQLEngine();
        const query = rule.query;
        const minMatches = Number(rule.minMatches || 1);
        const logs = rule.logs || context.logs || [];

        // Push any logs provided in rule or context into logql engine
        if (Array.isArray(logs) && logs.length > 0) {
          for (const l of logs) {
            logql.pushLog(l.labels || {}, l.message || l.line || '', l.timestamp || Date.now());
          }
        }

        try {
          const res = logql.query(query);
          let matchCount = 0;
          if (res && res.status === 'success' && res.data && Array.isArray(res.data.result)) {
            matchCount = res.data.result.length;
          }
          const passed = matchCount >= minMatches;
          return {
            passed,
            actual: `LogQL "${query}" matched ${matchCount} lines`,
            expected: `>= ${minMatches} matching log line(s)`
          };
        } catch (err) {
          return { passed: false, actual: `LogQL error: ${err.message}`, expected: `>= ${minMatches} log matches` };
        }
      }

      // -----------------------------------------------------------------------
      // 12. HPA Target Scale Achieved
      // -----------------------------------------------------------------------
      case 'hpa_target_scale_achieved': {
        const hpa = this._resolveResource('HorizontalPodAutoscaler', rule.name, ns, context)
          || this._resolveResource('HPA', rule.name, ns, context);

        if (!hpa) {
          return { passed: false, actual: `HPA "${rule.name}" not found in "${ns}"`, expected: 'HPA resource present' };
        }

        const currentDesired = (hpa.status && (hpa.status.desiredReplicas !== undefined ? hpa.status.desiredReplicas : hpa.status.currentReplicas)) || 1;
        const expected = Number(rule.expectedReplicas || rule.expectedValue || 1);
        const op = rule.operator || '==';
        const passed = compareValues(currentDesired, op, expected);

        return {
          passed,
          actual: `HPA desiredReplicas: ${currentDesired}`,
          expected: `desiredReplicas ${op} ${expected}`
        };
      }

      // -----------------------------------------------------------------------
      // 13. VPA Recommendation Present
      // -----------------------------------------------------------------------
      case 'vpa_recommendation_present': {
        const vpa = this._resolveResource('VerticalPodAutoscaler', rule.name, ns, context)
          || this._resolveResource('VPA', rule.name, ns, context);

        if (!vpa) {
          return { passed: false, actual: `VPA "${rule.name}" not found in "${ns}"`, expected: 'VPA resource present' };
        }

        const recs = (vpa.status && vpa.status.recommendation && vpa.status.recommendation.containerRecommendations) || [];
        const targetContainer = rule.containerName;
        const foundRec = targetContainer ? recs.find((r) => r.containerName === targetContainer) : recs[0];

        const passed = Boolean(foundRec && foundRec.target && foundRec.target.cpu && foundRec.target.memory);
        return {
          passed,
          actual: foundRec ? `Target CPU: ${foundRec.target.cpu}, Memory: ${foundRec.target.memory}` : 'No recommendations calculated',
          expected: 'VPA recommendations available'
        };
      }

      // -----------------------------------------------------------------------
      // 14. Karpenter Node Consolidated
      // -----------------------------------------------------------------------
      case 'karpenter_node_consolidated': {
        let nodes = [];
        if (context.graph) {
          nodes = context.graph.list({ kind: 'Node' });
        } else if (context.cluster) {
          nodes = context.cluster.getResources('Node');
        }

        const poolName = rule.nodePool || 'default';
        const poolNodes = nodes.filter((n) => n.metadata?.labels?.['karpenter.sh/nodepool'] === poolName);

        if (rule.expectedCapacityType) {
          const matchingCap = poolNodes.filter((n) => n.metadata?.labels?.['karpenter.sh/capacity-type'] === rule.expectedCapacityType);
          const passed = matchingCap.length > 0;
          return {
            passed,
            actual: `${matchingCap.length} node(s) with capacity-type "${rule.expectedCapacityType}"`,
            expected: `At least 1 node with capacity-type "${rule.expectedCapacityType}"`
          };
        }

        const maxNodes = Number(rule.maxNodes || 2);
        const passed = poolNodes.length <= maxNodes;
        return {
          passed,
          actual: `${poolNodes.length} active Karpenter node(s)`,
          expected: `<= ${maxNodes} active node(s)`
        };
      }

      // -----------------------------------------------------------------------
      // 15. Istio Route Matches
      // -----------------------------------------------------------------------
      case 'istio_route_matches': {
        const istio = context.istio || (context.graph ? new IstioMeshController(context.graph) : null);
        if (!istio) {
          return { passed: false, actual: 'Istio controller unavailable', expected: 'VirtualService routing match' };
        }

        const vsName = rule.virtualService || rule.name;
        const uri = rule.uri || '/';
        const headers = rule.headers || {};
        const random = rule.random !== undefined ? rule.random : 0.5;

        try {
          const res = istio.resolveHttpRoute(vsName, ns, { uri, headers, random });
          let passed = res.matched;
          if (rule.expectedSubset) {
            passed = passed && res.destination?.subset === rule.expectedSubset;
          }
          if (rule.expectedHost) {
            passed = passed && res.destination?.host === rule.expectedHost;
          }
          if (rule.expectedFaultType) {
            passed = passed && res.fault?.type === rule.expectedFaultType;
          }
          if (rule.expectedWeight !== undefined && res.weight !== undefined) {
            passed = passed && res.weight === rule.expectedWeight;
          }

          return {
            passed,
            actual: res.matched ? `Routed to ${res.destination?.host || ''}:${res.destination?.subset || ''}${res.fault ? ` (Fault: ${res.fault.type})` : ''}` : 'No matching route rule',
            expected: `Route to ${rule.expectedHost || '*'}:${rule.expectedSubset || '*'}`
          };
        } catch (err) {
          return { passed: false, actual: `Istio route resolution error: ${err.message}`, expected: 'Route matched' };
        }
      }

      // -----------------------------------------------------------------------
      // 16. Circuit Breaker Tripped
      // -----------------------------------------------------------------------
      case 'circuit_breaker_tripped': {
        const istio = context.istio || (context.graph ? new IstioMeshController(context.graph) : null);
        if (!istio) {
          return { passed: false, actual: 'Istio controller unavailable', expected: 'Circuit breaker evaluation' };
        }

        const drName = rule.destinationRule || rule.name;
        const subset = rule.subset || null;
        const expectedTripped = rule.expectedTripped !== undefined ? rule.expectedTripped : true;

        if (Array.isArray(rule.errorCodes)) {
          for (const code of rule.errorCodes) {
            const host = rule.host || drName;
            istio.recordEndpointResult(host, subset, code);
          }
        }

        try {
          const res = istio.evaluateDestinationRule(drName, ns, subset);
          const passed = res.circuitBreakerTripped === expectedTripped;
          return {
            passed,
            actual: `Circuit breaker tripped: ${res.circuitBreakerTripped} (Errors: ${res.consecutiveErrors})`,
            expected: `Circuit breaker tripped == ${expectedTripped}`
          };
        } catch (err) {
          return { passed: false, actual: `Circuit breaker error: ${err.message}`, expected: `Tripped == ${expectedTripped}` };
        }
      }

      // -----------------------------------------------------------------------
      // 17. VFS File Contains
      // -----------------------------------------------------------------------
      case 'vfs_file_contains': {
        const vfs = context.vfs || context.cluster?.vfs;
        if (!vfs) {
          return { passed: false, actual: 'VirtualFileSystem unavailable', expected: `File ${rule.path} exists` };
        }

        const filePath = rule.path;
        const expected = String(rule.expectedContent || rule.expectedValue || rule.pattern || '');
        const isRegex = Boolean(rule.isRegex);

        try {
          if (!vfs.exists(filePath)) {
            return {
              passed: false,
              actual: `File "${filePath}" does not exist in VFS`,
              expected: `File "${filePath}" containing "${expected}"`
            };
          }

          const content = vfs.readFile(filePath);
          const passed = isRegex ? new RegExp(expected).test(content) : content.includes(expected);
          return {
            passed,
            actual: passed ? `File contains "${expected}"` : 'Pattern not found in file content',
            expected: `Contains "${expected}"`
          };
        } catch (err) {
          return { passed: false, actual: `VFS error: ${err.message}`, expected: `File contains "${expected}"` };
        }
      }

      // -----------------------------------------------------------------------
      // 18. DNS Resolution Succeeds
      // -----------------------------------------------------------------------
      case 'dns_resolution_succeeds': {
        const host = rule.host || 'kubernetes.default.svc.cluster.local';
        const expectedIp = rule.expectedIp || null;

        // Try networking engine resolver if available
        let resolvedIp = null;
        let loopDetected = false;

        if (context.dns && typeof context.dns.resolve === 'function') {
          const res = context.dns.resolve(host);
          resolvedIp = res.ip;
          loopDetected = res.loopDetected;
        } else if (context.cluster && typeof context.cluster.resolveDns === 'function') {
          const res = context.cluster.resolveDns(host);
          resolvedIp = res.ip;
          loopDetected = res.loopDetected;
        } else if (context.networking && typeof context.networking.resolveDNS === 'function') {
          const res = context.networking.resolveDNS(host);
          resolvedIp = res.ip;
          loopDetected = res.loopDetected;
        } else if (context.graph && NetworkingEngine) {
          try {
            const net = new NetworkingEngine(context.graph);
            const res = net.resolveDNS(host);
            resolvedIp = res.ip;
            loopDetected = res.loopDetected;
          } catch {
            // Fallback to direct service lookup
          }
        }

        if (!resolvedIp && context.graph) {
          // Direct lookup in ResourceGraph Services
          const parts = host.split('.');
          const svcName = parts[0];
          const svcNs = parts[1] || 'default';
          const svc = context.graph.get('Service', svcNs, svcName);
          if (svc && svc.spec?.clusterIP) {
            resolvedIp = svc.spec.clusterIP;
          }
        }

        const passed = Boolean(resolvedIp && !loopDetected && (!expectedIp || resolvedIp === expectedIp));
        return {
          passed,
          actual: resolvedIp ? `Resolved ${host} -> ${resolvedIp}${loopDetected ? ' (Loop Detected!)' : ''}` : `Failed to resolve ${host}`,
          expected: `Resolves successfully${expectedIp ? ` to ${expectedIp}` : ''}`
        };
      }

      // -----------------------------------------------------------------------
      // Legacy Backward-Compatible Rule Types
      // -----------------------------------------------------------------------
      case 'resource_field_contains': {
        const res = this._resolveResource(rule.kind, rule.name, ns, context);
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
        let pods = [];
        if (context.graph) {
          pods = context.graph.list({ kind: 'Pod', namespace: ns });
        } else if (context.cluster) {
          pods = context.cluster.getResources('Pod', ns);
        }

        const matching = pods.filter(
          (p) =>
            p.metadata?.name === rule.name ||
            p.metadata?.name?.startsWith(`${rule.name}-`) ||
            p.metadata?.ownerDeployment === rule.name
        );
        const runningPods = matching.filter(
          (p) => p.status && p.status.phase === 'Running' && (p.status.reason === 'Running' || !p.status.reason)
        );

        return {
          passed: runningPods.length > 0 && runningPods.length === matching.length,
          actual: matching.length === 0
            ? 'No matching pods found'
            : `${runningPods.length}/${matching.length} pods Running`,
          expected: `All pods for "${rule.name}" in Running state`
        };
      }

      case 'replica_count_min': {
        const res = this._resolveResource(rule.kind || 'Deployment', rule.name, ns, context);
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
        const found = (context.commandHistory || []).some((entry) => {
          const cmd = typeof entry === 'string' ? entry : (entry && entry.command ? entry.command : '');
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
        const cloudResources = (context.cluster && context.cluster.state && context.cluster.state.cloudResources) || [];
        const found = cloudResources.some(
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
        const releases = (context.cluster && context.cluster.state && context.cluster.state.helmReleases) || [];
        const rel = releases.find((r) => r.name === target && r.status === 'deployed');
        return {
          passed: Boolean(rel),
          actual: rel ? `Helm release "${target}" deployed` : `Helm release "${target}" not deployed`,
          expected: `Helm release "${target}" status=deployed`
        };
      }

      case 'argocd_app_synced': {
        const target = String(rule.name || '');
        const apps = (context.cluster && context.cluster.state && context.cluster.state.argoApps) || [];
        const app = apps.find((a) => a.name === target);
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
          actual: `Unknown rule type "${rule.type}"`,
          expected: 'Valid rule type'
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  _buildContext(clusterOrContext, commandHistory) {
    const base = { ...this.defaultContext };

    if (!clusterOrContext) {
      return { ...base, commandHistory };
    }

    let ctx;
    const isVirtualCluster = Boolean(
      clusterOrContext && (
        typeof clusterOrContext.getResource === 'function' ||
        typeof clusterOrContext.applyManifest === 'function' ||
        (clusterOrContext.state && Array.isArray(clusterOrContext.state.resources))
      )
    );

    const isResourceGraph = Boolean(
      clusterOrContext &&
      typeof clusterOrContext.list === 'function' &&
      typeof clusterOrContext.get === 'function' &&
      !isVirtualCluster
    );

    if (isVirtualCluster) {
      ctx = {
        ...base,
        cluster: clusterOrContext,
        graph: clusterOrContext.graph || null,
        vfs: clusterOrContext.vfs || null,
        commandHistory
      };
    } else if (isResourceGraph) {
      ctx = {
        ...base,
        graph: clusterOrContext,
        commandHistory
      };
    } else if (clusterOrContext.graph || clusterOrContext.cluster || clusterOrContext.vfs) {
      // If it's a context map object with known keys
      ctx = {
        ...base,
        ...clusterOrContext,
        commandHistory: clusterOrContext.commandHistory || commandHistory
      };
    } else {
      ctx = {
        ...base,
        cluster: clusterOrContext,
        graph: clusterOrContext.graph || null,
        vfs: clusterOrContext.vfs || null,
        commandHistory
      };
    }

    // Auto-bridge: If graph is missing but cluster has resources, create an ephemeral ResourceGraph
    if (!ctx.graph && ctx.cluster && Array.isArray(ctx.cluster.state?.resources) && ResourceGraph) {
      try {
        const g = new ResourceGraph();
        for (const r of ctx.cluster.state.resources) {
          g.set(r, { skipReconcileNotification: true });
        }
        ctx.graph = g;
      } catch {
        // Fallback gracefully
      }
    }

    return ctx;
  }

  _resolveResource(kind, name, namespace, context) {
    if (context.graph) {
      const res = context.graph.get(kind, namespace, name);
      if (res) return res;
    }
    if (context.cluster && typeof context.cluster.getResource === 'function') {
      return context.cluster.getResource(kind, name, namespace);
    }
    return null;
  }
}

module.exports = {
  ValidationEngine,
  getFieldByPath,
  compareValues
};
