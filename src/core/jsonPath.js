'use strict';

/**
 * KubeLabs v3.0 - RFC 9535 & Kubernetes JSONPath Query Engine
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and WebViews.
 */

/**
 * Evaluates filter expression on an item (@)
 */
function evaluateFilter(item, filterExpr) {
  const expr = filterExpr.trim();

  // Handle logical operators && and ||
  // Look for top-level && or ||
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
          return evaluateFilter(item, left) && evaluateFilter(item, right);
        }
        if (ch === '|' && expr[i + 1] === '|') {
          const left = expr.slice(0, i);
          const right = expr.slice(i + 2);
          return evaluateFilter(item, left) || evaluateFilter(item, right);
        }
      }
    }
  }

  // Handle parenthesis wrapping
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evaluateFilter(item, expr.slice(1, -1));
  }

  // Handle negation !
  if (expr.startsWith('!')) {
    return !evaluateFilter(item, expr.slice(1));
  }

  // Operators: ==, !=, <=, >=, <, >
  const opMatch = expr.match(/^(.*?)\s*(==|!=|<=|>=|<|>)\s*(.*)$/);
  if (opMatch) {
    const leftRaw = opMatch[1].trim();
    const op = opMatch[2];
    const rightRaw = opMatch[3].trim();

    const leftVal = resolveOperand(item, leftRaw);
    const rightVal = resolveOperand(item, rightRaw);

    switch (op) {
      case '==':
        return leftVal == rightVal;
      case '!=':
        return leftVal != rightVal;
      case '<=':
        return Number(leftVal) <= Number(rightVal);
      case '>=':
        return Number(leftVal) >= Number(rightVal);
      case '<':
        return Number(leftVal) < Number(rightVal);
      case '>':
        return Number(leftVal) > Number(rightVal);
    }
  }

  // Existence check: e.g. @.spec.containers
  const val = resolveOperand(item, expr);
  return val !== undefined && val !== null && val !== false && val !== '';
}

function resolveOperand(item, raw) {
  raw = raw.trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

  // String literals
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }

  // @-prefixed path relative to item
  if (raw.startsWith('@')) {
    let propPath = raw.slice(1);
    if (propPath.startsWith('.')) propPath = propPath.slice(1);
    return getNestedValue(item, propPath);
  }

  // Fallback direct property
  return getNestedValue(item, raw);
}

function getNestedValue(obj, path) {
  if (!path || obj === undefined || obj === null) return obj;
  const segments = parsePathSegments(path);
  let current = obj;
  for (const seg of segments) {
    if (current === undefined || current === null) return undefined;
    if (seg.type === 'property') {
      current = current[seg.key];
    } else if (seg.type === 'index') {
      const idx = seg.index < 0 ? current.length + seg.index : seg.index;
      current = current[idx];
    }
  }
  return current;
}

/**
 * Parses path into tokens: property, index, wildcard, slice, filter, recursiveDescent
 */
function parsePathSegments(pathStr) {
  const segments = [];
  let i = 0;
  const len = pathStr.length;

  while (i < len) {
    // Check recursive descent ..
    if (pathStr[i] === '.' && pathStr[i + 1] === '.') {
      segments.push({ type: 'recursiveDescent' });
      i += 2;
      continue;
    }

    if (pathStr[i] === '.') {
      i++;
      continue;
    }

    // Bracket notation [ ... ]
    if (pathStr[i] === '[') {
      const closeBracket = findMatchingBracket(pathStr, i);
      if (closeBracket === -1) {
        break;
      }
      const bracketContent = pathStr.slice(i + 1, closeBracket).trim();
      i = closeBracket + 1;

      // Filter [?( ... )]
      if (bracketContent.startsWith('?')) {
        let filterBody = bracketContent.slice(1).trim();
        if (filterBody.startsWith('(') && filterBody.endsWith(')')) {
          filterBody = filterBody.slice(1, -1).trim();
        }
        segments.push({ type: 'filter', expression: filterBody });
      }
      // Wildcard [*]
      else if (bracketContent === '*') {
        segments.push({ type: 'wildcard' });
      }
      // Quoted property ['prop'] or ["prop"]
      else if (
        (bracketContent.startsWith("'") && bracketContent.endsWith("'")) ||
        (bracketContent.startsWith('"') && bracketContent.endsWith('"'))
      ) {
        segments.push({ type: 'property', key: bracketContent.slice(1, -1) });
      }
      // Slice [start:end:step]
      else if (bracketContent.includes(':')) {
        const parts = bracketContent.split(':');
        const start = parts[0] ? Number(parts[0]) : 0;
        const end = parts[1] ? Number(parts[1]) : undefined;
        const step = parts[2] ? Number(parts[2]) : 1;
        segments.push({ type: 'slice', start, end, step });
      }
      // Array Index [0] or [-1]
      else if (/^-?\d+$/.test(bracketContent)) {
        segments.push({ type: 'index', index: Number(bracketContent) });
      } else {
        segments.push({ type: 'property', key: bracketContent });
      }
      continue;
    }

    // Wildcard *
    if (pathStr[i] === '*') {
      segments.push({ type: 'wildcard' });
      i++;
      continue;
    }

    // Property name until next dot or bracket
    let start = i;
    while (i < len && pathStr[i] !== '.' && pathStr[i] !== '[') {
      i++;
    }
    const prop = pathStr.slice(start, i).trim();
    if (prop) {
      segments.push({ type: 'property', key: prop });
    }
  }

  return segments;
}

function findMatchingBracket(str, startIdx) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Executes JSONPath query against input data. Returns array of matching values.
 * @param {any} data 
 * @param {string} pathExpr 
 * @returns {Array<any>}
 */
function jsonPath(data, pathExpr) {
  if (data === undefined || data === null || !pathExpr) return [];

  let expr = String(pathExpr).trim();
  // Strip outer { ... } if passed as Kubernetes template
  if (expr.startsWith('{') && expr.endsWith('}')) {
    expr = expr.slice(1, -1).trim();
  }
  // Strip root $
  if (expr.startsWith('$')) {
    expr = expr.slice(1);
  }
  if (expr.startsWith('.') && !expr.startsWith('..')) {
    expr = expr.slice(1);
  }
  if (!expr) {
    return [data];
  }

  const segments = parsePathSegments(expr);
  let currentNodes = [data];

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const nextNodes = [];

    if (seg.type === 'recursiveDescent') {
      const nextSeg = segments[s + 1];
      s++; // Consume next segment with recursive scan
      if (!nextSeg) break;

      function collectRecursive(node) {
        if (!node || typeof node !== 'object') return;
        if (nextSeg.type === 'property' && nextSeg.key in node) {
          nextNodes.push(node[nextSeg.key]);
        }
        if (Array.isArray(node)) {
          for (const item of node) collectRecursive(item);
        } else {
          for (const val of Object.values(node)) collectRecursive(val);
        }
      }

      for (const node of currentNodes) {
        collectRecursive(node);
      }
      currentNodes = nextNodes;
      continue;
    }

    for (const node of currentNodes) {
      if (node === undefined || node === null) continue;

      if (seg.type === 'property') {
        if (typeof node === 'object' && seg.key in node) {
          nextNodes.push(node[seg.key]);
        }
      } else if (seg.type === 'index') {
        if (Array.isArray(node)) {
          const idx = seg.index < 0 ? node.length + seg.index : seg.index;
          if (idx >= 0 && idx < node.length && node[idx] !== undefined) {
            nextNodes.push(node[idx]);
          }
        }
      } else if (seg.type === 'wildcard') {
        if (Array.isArray(node)) {
          for (const item of node) nextNodes.push(item);
        } else if (typeof node === 'object') {
          for (const val of Object.values(node)) nextNodes.push(val);
        }
      } else if (seg.type === 'slice') {
        if (Array.isArray(node)) {
          const start = seg.start < 0 ? Math.max(0, node.length + seg.start) : seg.start;
          const end = seg.end !== undefined
            ? (seg.end < 0 ? node.length + seg.end : seg.end)
            : node.length;
          const step = seg.step || 1;
          for (let i = start; i < end; i += step) {
            if (i < node.length) nextNodes.push(node[i]);
          }
        }
      } else if (seg.type === 'filter') {
        if (Array.isArray(node)) {
          for (const item of node) {
            if (evaluateFilter(item, seg.expression)) {
              nextNodes.push(item);
            }
          }
        } else if (typeof node === 'object') {
          if (evaluateFilter(node, seg.expression)) {
            nextNodes.push(node);
          }
        }
      }
    }

    currentNodes = nextNodes;
  }

  return currentNodes;
}

/**
 * Formats JSONPath output matching kubectl -o jsonpath=... behavior
 * Handles literal template strings {"\t"}, {"\n"}, {" "}, and {range ...}{end}
 * @param {any} data 
 * @param {string} template 
 * @returns {string}
 */
function formatJsonPath(data, template) {
  if (data === undefined || data === null || !template) return '';

  let tpl = String(template).trim();

  // Handle {range ...}...{end} blocks
  const rangeRegex = /\{range\s+([^\}]+)\}([\s\S]*?)\{end\}/g;
  if (rangeRegex.test(tpl)) {
    return tpl.replace(/\{range\s+([^\}]+)\}([\s\S]*?)\{end\}/g, (_, rangeExpr, body) => {
      const items = jsonPath(data, rangeExpr);
      if (!Array.isArray(items)) return '';
      let out = '';
      for (const item of items) {
        out += interpolateTemplate(item, body);
      }
      return out;
    });
  }

  // Handle single or multi-expression templates
  return interpolateTemplate(data, tpl);
}

function interpolateTemplate(context, tpl) {
  return tpl.replace(/\{([^\}]+)\}/g, (match, inner) => {
    inner = inner.trim();

    // Literal string {"\t"}, {"\n"}, {" "}
    if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
      try {
        return JSON.parse(inner);
      } catch {
        return inner.slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');
      }
    }

    // Subpath evaluation
    const results = jsonPath(context, inner);
    if (results.length === 0) return '';
    return results.map((r) => (typeof r === 'object' ? JSON.stringify(r) : String(r))).join(' ');
  });
}

// Dual ESM and CommonJS export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    jsonPath,
    formatJsonPath,
    evaluateFilter
  };
}
export { jsonPath, formatJsonPath, evaluateFilter };
