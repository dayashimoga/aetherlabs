'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Kubernetes Admission Controller & Policy Engine
 * Features:
 *  1. MutatingAdmissionWebhook (RFC 6902 JSON Patch mutation & sidecar injection)
 *  2. ValidatingAdmissionWebhook (Rule-based validation & HTTP 403 review rejection)
 *  3. ValidatingAdmissionPolicy (In-tree CEL evaluator)
 *  4. Pod Security Standards (Privileged, Baseline, Restricted)
 * Pure ES2024 module with zero external dependencies.
 */

// Helper: RFC 6902 JSON Patch Applicator
function applyJsonPatch(target, patch) {
  if (!Array.isArray(patch)) return target;
  let root = target;

  for (const op of patch) {
    if (!op || !op.path) continue;
    const parts = op.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
      if (current[part] === undefined) {
        current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      current = current[part];
    }

    const lastKey = parts[parts.length - 1].replace(/~1/g, '/').replace(/~0/g, '~');

    switch (op.op) {
      case 'add':
        if (Array.isArray(current)) {
          if (lastKey === '-') {
            current.push(op.value);
          } else {
            const idx = Number(lastKey);
            current.splice(idx, 0, op.value);
          }
        } else {
          current[lastKey] = op.value;
        }
        break;
      case 'replace':
        if (Array.isArray(current)) {
          const idx = Number(lastKey);
          current[idx] = op.value;
        } else {
          current[lastKey] = op.value;
        }
        break;
      case 'remove':
        if (Array.isArray(current)) {
          const idx = Number(lastKey);
          current.splice(idx, 1);
        } else {
          delete current[lastKey];
        }
        break;
    }
  }

  return root;
}

// Helper: Common Expression Language (CEL) Evaluator
function evaluateCEL(expression, context) {
  if (!expression || typeof expression !== 'string') return true;
  let expr = expression.trim();

  // Handle logical && and ||
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < expr.length - 1; i++) {
    const ch = expr[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (depth === 0) {
        if (ch === '&' && expr[i + 1] === '&') {
          const left = expr.slice(0, i);
          const right = expr.slice(i + 2);
          return evaluateCEL(left, context) && evaluateCEL(right, context);
        }
        if (ch === '|' && expr[i + 1] === '|') {
          const left = expr.slice(0, i);
          const right = expr.slice(i + 2);
          return evaluateCEL(left, context) || evaluateCEL(right, context);
        }
      }
    }
  }

  // Handle parenthesis wrapping
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evaluateCEL(expr.slice(1, -1), context);
  }

  // Handle negation !
  if (expr.startsWith('!')) {
    return !evaluateCEL(expr.slice(1).trim(), context);
  }

  // Built-in CEL function: has(object.spec.replicas)
  const hasMatch = expr.match(/^has\((.*?)\)$/);
  if (hasMatch) {
    const val = resolveCELPath(hasMatch[1].trim(), context);
    return val !== undefined && val !== null;
  }

  // Built-in string methods: object.metadata.name.startsWith('prod-')
  const startsWithMatch = expr.match(/^(.*?)\.startsWith\((.*?)\)$/);
  if (startsWithMatch) {
    const strVal = String(resolveCELPath(startsWithMatch[1].trim(), context) || '');
    const prefix = resolveCELPath(startsWithMatch[2].trim(), context);
    return strVal.startsWith(String(prefix));
  }

  const endsWithMatch = expr.match(/^(.*?)\.endsWith\((.*?)\)$/);
  if (endsWithMatch) {
    const strVal = String(resolveCELPath(endsWithMatch[1].trim(), context) || '');
    const suffix = resolveCELPath(endsWithMatch[2].trim(), context);
    return strVal.endsWith(String(suffix));
  }

  const containsMatch = expr.match(/^(.*?)\.contains\((.*?)\)$/);
  if (containsMatch) {
    const strVal = String(resolveCELPath(containsMatch[1].trim(), context) || '');
    const sub = resolveCELPath(containsMatch[2].trim(), context);
    return strVal.includes(String(sub));
  }

  // Comparison operators: ==, !=, <=, >=, <, >
  const opMatch = expr.match(/^(.*?)\s*(==|!=|<=|>=|<|>)\s*(.*)$/);
  if (opMatch) {
    const leftRaw = opMatch[1].trim();
    const op = opMatch[2];
    const rightRaw = opMatch[3].trim();

    const left = resolveCELPath(leftRaw, context);
    const right = resolveCELPath(rightRaw, context);

    switch (op) {
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '<=':
        return Number(left) <= Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<':
        return Number(left) < Number(right);
      case '>':
        return Number(left) > Number(right);
    }
  }

  const res = resolveCELPath(expr, context);
  return res !== undefined && res !== null && res !== false && res !== 0 && res !== '';
}

function resolveCELPath(raw, context) {
  raw = raw.trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

  // String literals
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }

  // Property access on context (e.g. object.spec.replicas)
  const parts = parseCELPropertyPath(raw);
  let current = context;
  for (const p of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[p];
  }
  return current;
}

function parseCELPropertyPath(str) {
  const parts = [];
  let buffer = '';
  let inBracket = false;
  let quoteChar = null;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ((ch === "'" || ch === '"') && inBracket) {
      if (quoteChar === ch) {
        quoteChar = null;
      } else if (!quoteChar) {
        quoteChar = ch;
      }
      continue;
    }

    if (ch === '[' && !inBracket) {
      if (buffer) {
        parts.push(buffer);
        buffer = '';
      }
      inBracket = true;
      continue;
    }
    if (ch === ']' && inBracket) {
      if (buffer) {
        parts.push(buffer);
        buffer = '';
      }
      inBracket = false;
      continue;
    }
    if (ch === '.' && !inBracket) {
      if (buffer) {
        parts.push(buffer);
        buffer = '';
      }
      continue;
    }
    buffer += ch;
  }
  if (buffer) parts.push(buffer);
  return parts;
}

/**
 * Pod Security Standards (PSS) Validator
 */
function validatePodSecurityStandards(podSpec, level) {
  level = String(level || 'privileged').toLowerCase();
  if (level === 'privileged') {
    return { allowed: true };
  }

  const containers = [
    ...(podSpec.containers || []),
    ...(podSpec.initContainers || [])
  ];

  // 1. Baseline Level Checks
  if (podSpec.hostNetwork === true) {
    return { allowed: false, message: 'PodSecurity "baseline" violation: hostNetwork is not allowed' };
  }
  if (podSpec.hostPID === true) {
    return { allowed: false, message: 'PodSecurity "baseline" violation: hostPID is not allowed' };
  }
  if (podSpec.hostIPC === true) {
    return { allowed: false, message: 'PodSecurity "baseline" violation: hostIPC is not allowed' };
  }

  for (const c of containers) {
    const sec = c.securityContext || {};
    if (sec.privileged === true) {
      return {
        allowed: false,
        message: `PodSecurity "baseline" violation: container "${c.name}" must not be privileged`
      };
    }
    const ports = c.ports || [];
    for (const p of ports) {
      if (p.hostPort && p.hostPort > 0) {
        return {
          allowed: false,
          message: `PodSecurity "baseline" violation: container "${c.name}" uses forbidden hostPort ${p.hostPort}`
        };
      }
    }
  }

  // 2. Restricted Level Checks
  if (level === 'restricted') {
    const podSec = podSpec.securityContext || {};

    for (const c of containers) {
      const sec = c.securityContext || {};

      // Must explicitly drop ALL capabilities
      const caps = (sec.capabilities && sec.capabilities.drop) || [];
      const hasDropAll = caps.some((cap) => String(cap).toUpperCase() === 'ALL');
      if (!hasDropAll) {
        return {
          allowed: false,
          message: `PodSecurity "restricted" violation: container "${c.name}" must drop ALL capabilities (capabilities.drop: ["ALL"])`
        };
      }

      // allowPrivilegeEscalation must be false
      if (sec.allowPrivilegeEscalation !== false) {
        return {
          allowed: false,
          message: `PodSecurity "restricted" violation: container "${c.name}" must set allowPrivilegeEscalation: false`
        };
      }

      // runAsNonRoot must be true (either at pod or container level) or runAsUser > 0
      const isNonRoot = podSec.runAsNonRoot === true || sec.runAsNonRoot === true || (sec.runAsUser && sec.runAsUser > 0);
      if (!isNonRoot) {
        return {
          allowed: false,
          message: `PodSecurity "restricted" violation: container "${c.name}" must set runAsNonRoot: true or runAsUser > 0`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Complete Kubernetes Admission Controller Engine
 */
class AdmissionController {
  constructor(resourceGraph) {
    this.graph = resourceGraph;
    this.registeredWebhooks = new Map(); // name -> handler(resource, operation, oldResource)
  }

  /**
   * Registers a custom in-memory webhook handler
   */
  registerWebhook(name, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Webhook handler must be a function');
    }
    this.registeredWebhooks.set(name, handler);
    return () => this.registeredWebhooks.delete(name);
  }

  /**
   * Evaluates admission chain for an incoming resource
   * @param {object} rawResource 
   * @param {'CREATE'|'UPDATE'|'DELETE'} operation 
   * @param {object|null} oldResource 
   * @returns {{ allowed: boolean, resource: object, status?: { code: number, message: string } }}
   */
  admit(rawResource, operation = 'CREATE', oldResource = null) {
    if (!rawResource || typeof rawResource !== 'object') {
      return { allowed: false, status: { code: 400, message: 'Invalid non-object resource' } };
    }

    let resource = structuredClone ? structuredClone(rawResource) : JSON.parse(JSON.stringify(rawResource));
    const kind = resource.kind;
    const namespace = resource.metadata && resource.metadata.namespace ? resource.metadata.namespace : 'default';

    // -------------------------------------------------------------
    // Stage 1: Mutating Admission Webhook Phase
    // -------------------------------------------------------------
    const mutatingConfigs = this.graph ? this.graph.list({ kind: 'MutatingWebhookConfiguration' }) : [];
    for (const cfg of mutatingConfigs) {
      const webhooks = cfg.webhooks || [];
      for (const wh of webhooks) {
        if (!this._matchesRules(wh.rules, operation, kind)) continue;
        if (!this._matchesNamespaceSelector(wh.namespaceSelector, namespace)) continue;

        // Apply registered handler if present
        if (this.registeredWebhooks.has(wh.name)) {
          const handler = this.registeredWebhooks.get(wh.name);
          const mutationResult = handler(resource, operation, oldResource);
          if (mutationResult && mutationResult.patches) {
            resource = applyJsonPatch(resource, mutationResult.patches);
          } else if (mutationResult && typeof mutationResult === 'object') {
            resource = mutationResult;
          }
        } else if (Array.isArray(wh.patches)) {
          // Declarative patches configured directly in webhook spec
          resource = applyJsonPatch(resource, wh.patches);
        }
      }
    }

    // -------------------------------------------------------------
    // Stage 2: Pod Security Standards (PSS) Admission Phase
    // -------------------------------------------------------------
    if (this.graph && (kind === 'Pod' || resource.spec && resource.spec.template)) {
      const nsObj = this.graph.get('Namespace', null, namespace);
      const nsLabels = (nsObj && nsObj.metadata && nsObj.metadata.labels) || {};
      const enforceLevel = nsLabels['pod-security.kubernetes.io/enforce'] || 'privileged';

      const podSpec = kind === 'Pod' ? resource.spec : (resource.spec.template && resource.spec.template.spec);
      if (podSpec) {
        const pssResult = validatePodSecurityStandards(podSpec, enforceLevel);
        if (!pssResult.allowed) {
          return {
            allowed: false,
            status: {
              code: 403,
              message: pssResult.message
            }
          };
        }
      }
    }

    // -------------------------------------------------------------
    // Stage 3: Validating Admission Webhook Phase
    // -------------------------------------------------------------
    const validatingConfigs = this.graph ? this.graph.list({ kind: 'ValidatingWebhookConfiguration' }) : [];
    for (const cfg of validatingConfigs) {
      const webhooks = cfg.webhooks || [];
      for (const wh of webhooks) {
        if (!this._matchesRules(wh.rules, operation, kind)) continue;
        if (!this._matchesNamespaceSelector(wh.namespaceSelector, namespace)) continue;

        if (this.registeredWebhooks.has(wh.name)) {
          const handler = this.registeredWebhooks.get(wh.name);
          const review = handler(resource, operation, oldResource);
          if (review && review.allowed === false) {
            return {
              allowed: false,
              status: {
                code: review.code || 403,
                message: review.message || `Admission webhook "${wh.name}" denied request`
              }
            };
          }
        }
      }
    }

    // -------------------------------------------------------------
    // Stage 4: ValidatingAdmissionPolicy (In-Tree CEL) Phase
    // -------------------------------------------------------------
    const bindings = this.graph ? this.graph.list({ kind: 'ValidatingAdmissionPolicyBinding' }) : [];
    for (const binding of bindings) {
      const policyName = binding.spec && binding.spec.policyName;
      if (!policyName) continue;

      const policy = this.graph.get('ValidatingAdmissionPolicy', null, policyName);
      if (!policy) continue;

      // Check match criteria
      const matchConstraints = policy.spec && policy.spec.matchConstraints;
      if (matchConstraints && matchConstraints.resourceRules) {
        if (!this._matchesRules(matchConstraints.resourceRules, operation, kind)) continue;
      }

      // Check namespace match
      if (binding.spec.matchResources && binding.spec.matchResources.namespaceSelector) {
        if (!this._matchesNamespaceSelector(binding.spec.matchResources.namespaceSelector, namespace)) continue;
      }

      // Evaluate CEL validations
      const validations = (policy.spec && policy.spec.validations) || [];
      const celContext = { object: resource, oldObject: oldResource };

      for (const val of validations) {
        const pass = evaluateCEL(val.expression, celContext);
        if (!pass) {
          return {
            allowed: false,
            status: {
              code: 403,
              message: val.message || `ValidatingAdmissionPolicy "${policyName}" denied request: ${val.expression}`
            }
          };
        }
      }
    }

    return { allowed: true, resource };
  }

  _matchesRules(rules, operation, kind) {
    if (!Array.isArray(rules) || rules.length === 0) return true;
    const normKind = kind ? kind.toLowerCase() : '';
    const normOp = operation ? operation.toUpperCase() : 'CREATE';

    return rules.some((rule) => {
      const ops = (rule.operations || []).map((o) => o.toUpperCase());
      const opsMatch = ops.includes('*') || ops.includes(normOp);

      const resources = (rule.resources || []).map((r) => r.toLowerCase());
      const resMatch = resources.includes('*') || resources.includes(normKind) || resources.includes(`${normKind}s`);

      return opsMatch && resMatch;
    });
  }

  _matchesNamespaceSelector(selector, namespace) {
    if (!selector || !this.graph) return true;
    const nsObj = this.graph.get('Namespace', null, namespace);
    if (!nsObj) return true;
    return this.graph.matchesLabelSelector(nsObj, selector);
  }
}

// Dual CommonJS & Browser export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AdmissionController,
    applyJsonPatch,
    evaluateCEL,
    validatePodSecurityStandards
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.AdmissionController = AdmissionController;
  globalThis.applyJsonPatch = applyJsonPatch;
  globalThis.evaluateCEL = evaluateCEL;
  globalThis.validatePodSecurityStandards = validatePodSecurityStandards;
}

