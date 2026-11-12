'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Observability & SRE Performance Engine
 * Subphase 3.2.1: PromQL Evaluator, LogQL Parser, OTel Pipeline Validator,
 *                 Jaeger Trace Generator & SLI/SLO Burn-Rate Calculator.
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let yamlParser;
try {
  yamlParser = require('./yamlParser');
} catch {
  yamlParser = (typeof globalThis !== 'undefined' && globalThis.yamlParser) || {};
}

// ---------------------------------------------------------------------------
// 1. PROMQL TIME-SERIES EVALUATION ENGINE
// ---------------------------------------------------------------------------

class PromQLEngine {
  constructor(options = {}) {
    this.series = new Map(); // seriesKey -> { metric: { __name__, ...labels }, samples: [{ time, value }] }
    if (options.initialMetrics) {
      this.bootstrapMetrics(options.initialMetrics);
    }
  }

  _makeSeriesKey(metricName, labels = {}) {
    const sorted = Object.keys(labels)
      .filter((k) => k !== '__name__')
      .sort()
      .map((k) => `${k}="${labels[k]}"`)
      .join(',');
    return `${metricName}{${sorted}}`;
  }

  recordSample(metricName, labels = {}, value, time = Date.now() / 1000) {
    const key = this._makeSeriesKey(metricName, labels);
    let s = this.series.get(key);
    if (!s) {
      s = {
        metric: { __name__: metricName, ...labels },
        samples: []
      };
      this.series.set(key, s);
    }
    s.samples.push({ time: Number(time), value: Number(value) });
    // Keep samples sorted by time
    s.samples.sort((a, b) => a.time - b.time);
  }

  setSamples(metricName, labels = {}, samples = []) {
    const key = this._makeSeriesKey(metricName, labels);
    const sorted = [...samples].sort((a, b) => a.time - b.time);
    this.series.set(key, {
      metric: { __name__: metricName, ...labels },
      samples: sorted
    });
  }

  bootstrapMetrics(metricsList = []) {
    for (const m of metricsList) {
      this.recordSample(m.name, m.labels || {}, m.value, m.time);
    }
  }

  /**
   * Main query entrypoint (instant query)
   * Evaluates expressions such as:
   *   - http_requests_total{status="500", service="payment"}
   *   - rate(http_requests_total[5m])
   *   - irate(http_requests_total[1m])
   *   - sum by (service) (rate(http_requests_total[5m]))
   *   - histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
   */
  query(expr, queryTime = Date.now() / 1000) {
    const trimmed = String(expr || '').trim();
    if (!trimmed) {
      return { status: 'success', data: { resultType: 'vector', result: [] } };
    }

    try {
      const result = this._evalExpr(trimmed, queryTime);
      return {
        status: 'success',
        data: result
      };
    } catch (err) {
      return {
        status: 'error',
        errorType: 'bad_data',
        error: err.message
      };
    }
  }

  _evalExpr(expr, queryTime) {
    const trimmed = expr.trim();

    // 1. histogram_quantile(q, vector)
    const hqMatch = trimmed.match(/^histogram_quantile\s*\(\s*([0-9.]+)\s*,\s*(.+)\)$/s);
    if (hqMatch) {
      const q = parseFloat(hqMatch[1]);
      const innerExpr = hqMatch[2].trim();
      const innerRes = this._evalExpr(innerExpr, queryTime);
      return this._evalHistogramQuantile(q, innerRes.result);
    }

    // 2. Aggregations: (sum|avg|count|min|max) (by|without)? (labels)? (vector)
    const aggMatch = trimmed.match(/^(sum|avg|count|min|max)\s*(?:by\s*\(([^)]+)\)|without\s*\(([^)]+)\))?\s*\((.+)\)$/s);
    if (aggMatch) {
      const aggFn = aggMatch[1];
      const byLabels = aggMatch[2] ? aggMatch[2].split(',').map((s) => s.trim()) : null;
      const withoutLabels = aggMatch[3] ? aggMatch[3].split(',').map((s) => s.trim()) : null;
      const innerExpr = aggMatch[4].trim();

      const innerRes = this._evalExpr(innerExpr, queryTime);
      return this._evalAggregation(aggFn, innerRes.result, byLabels, withoutLabels);
    }

    // 3. rate(v[range]) or irate(v[range])
    const rateMatch = trimmed.match(/^(rate|irate)\s*\((.+)\)$/s);
    if (rateMatch) {
      const isInstant = rateMatch[1] === 'irate';
      const rangeExpr = rateMatch[2].trim();
      return this._evalRate(rangeExpr, queryTime, isInstant);
    }

    // 4. Binary Arithmetic: e.g. vector / vector, vector * 100, vector > 50
    const binOpRegex = /([+\-*\/><]|>=|<=|==)/;
    if (binOpRegex.test(trimmed)) {
      const parsedBin = this._splitBinaryOp(trimmed);
      if (parsedBin) {
        const leftRes = this._evalExpr(parsedBin.left, queryTime);
        const rightRes = this._evalExpr(parsedBin.right, queryTime);
        return this._evalBinaryOp(parsedBin.op, leftRes, rightRes);
      }
    }

    // 5. Raw Instant Vector Selector
    return this._evalInstantVector(trimmed, queryTime);
  }

  _splitBinaryOp(expr) {
    let parenDepth = 0;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '(' || ch === '{' || ch === '[') parenDepth++;
      else if (ch === ')' || ch === '}' || ch === ']') parenDepth--;
      else if (parenDepth === 0) {
        const twoChar = expr.slice(i, i + 2);
        if (['>=', '<=', '=='].includes(twoChar)) {
          return { op: twoChar, left: expr.slice(0, i).trim(), right: expr.slice(i + 2).trim() };
        }
        if (['+', '-', '*', '/', '>', '<'].includes(ch)) {
          return { op: ch, left: expr.slice(0, i).trim(), right: expr.slice(i + 1).trim() };
        }
      }
    }
    return null;
  }

  _evalInstantVector(expr, queryTime) {
    const parsed = this._parseMetricSelector(expr);
    const result = [];

    for (const [key, s] of this.series.entries()) {
      if (this._metricMatches(s.metric, parsed.metricName, parsed.matchers)) {
        // Find sample at or immediately before queryTime
        let lastSample = null;
        for (const sample of s.samples) {
          if (sample.time <= queryTime) {
            lastSample = sample;
          } else {
            break;
          }
        }

        if (lastSample) {
          result.push({
            metric: { ...s.metric },
            value: [lastSample.time, String(lastSample.value)]
          });
        }
      }
    }

    return { resultType: 'vector', result };
  }

  _evalRate(rangeExpr, queryTime, isInstant) {
    // Parse metric[range]: e.g. http_requests_total[5m] or {app="web"}[1m]
    const rangeMatch = rangeExpr.match(/^(.+)\[([0-9]+)([smhd])\]$/);
    if (!rangeMatch) {
      throw new Error(`Invalid range vector expression: ${rangeExpr}`);
    }

    const metricSelector = rangeMatch[1].trim();
    const durationNum = parseInt(rangeMatch[2], 10);
    const unit = rangeMatch[3];
    const unitMultipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    const rangeSeconds = durationNum * (unitMultipliers[unit] || 60);

    const parsed = this._parseMetricSelector(metricSelector);
    const result = [];
    const startTime = queryTime - rangeSeconds;

    for (const [key, s] of this.series.entries()) {
      if (this._metricMatches(s.metric, parsed.metricName, parsed.matchers)) {
        const windowSamples = s.samples.filter((samp) => samp.time >= startTime && samp.time <= queryTime);

        if (windowSamples.length >= 2) {
          let rateValue = 0;
          if (isInstant) {
            // irate uses last two samples
            const s1 = windowSamples[windowSamples.length - 2];
            const s2 = windowSamples[windowSamples.length - 1];
            const timeDiff = s2.time - s1.time;
            const valDiff = Math.max(0, s2.value - s1.value); // counter reset check
            rateValue = timeDiff > 0 ? valDiff / timeDiff : 0;
          } else {
            // rate uses first and last samples over range
            const sFirst = windowSamples[0];
            const sLast = windowSamples[windowSamples.length - 1];
            const timeDiff = sLast.time - sFirst.time;
            const valDiff = Math.max(0, sLast.value - sFirst.value);
            rateValue = timeDiff > 0 ? valDiff / timeDiff : 0;
          }

          const outMetric = { ...s.metric };
          delete outMetric.__name__;

          result.push({
            metric: outMetric,
            value: [queryTime, String(Number(rateValue.toFixed(6)))]
          });
        }
      }
    }

    return { resultType: 'vector', result };
  }

  _evalAggregation(fn, vectorResult = [], byLabels, withoutLabels) {
    const groups = new Map();

    for (const item of vectorResult) {
      const metric = item.metric || {};
      const groupMetric = {};

      if (byLabels) {
        for (const l of byLabels) {
          if (metric[l] !== undefined) groupMetric[l] = metric[l];
        }
      } else if (withoutLabels) {
        for (const [k, v] of Object.entries(metric)) {
          if (!withoutLabels.includes(k) && k !== '__name__') {
            groupMetric[k] = v;
          }
        }
      }

      const groupKey = Object.entries(groupMetric).sort().map(([k, v]) => `${k}="${v}"`).join(',');
      let group = groups.get(groupKey);
      if (!group) {
        group = { metric: groupMetric, values: [] };
        groups.set(groupKey, group);
      }
      group.values.push(parseFloat(item.value[1]));
    }

    const outResult = [];
    for (const group of groups.values()) {
      let finalVal = 0;
      const vals = group.values;
      if (fn === 'sum') {
        finalVal = vals.reduce((a, b) => a + b, 0);
      } else if (fn === 'count') {
        finalVal = vals.length;
      } else if (fn === 'avg') {
        finalVal = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      } else if (fn === 'min') {
        finalVal = Math.min(...vals);
      } else if (fn === 'max') {
        finalVal = Math.max(...vals);
      }

      outResult.push({
        metric: group.metric,
        value: [Date.now() / 1000, String(Number(finalVal.toFixed(6)))]
      });
    }

    return { resultType: 'vector', result: outResult };
  }

  _evalHistogramQuantile(q, vectorResult = []) {
    // Group buckets by all labels EXCEPT `le`
    const bucketGroups = new Map();

    for (const item of vectorResult) {
      const metric = item.metric || {};
      const leStr = metric.le;
      if (leStr === undefined) continue;

      const upperLe = leStr === '+Inf' ? Infinity : parseFloat(leStr);
      if (isNaN(upperLe)) continue;

      const groupLabels = {};
      for (const [k, v] of Object.entries(metric)) {
        if (k !== 'le' && k !== '__name__') groupLabels[k] = v;
      }
      const groupKey = Object.entries(groupLabels).sort().map(([k, v]) => `${k}="${v}"`).join(',');

      let group = bucketGroups.get(groupKey);
      if (!group) {
        group = { metric: groupLabels, buckets: [] };
        bucketGroups.set(groupKey, group);
      }
      group.buckets.push({
        upperBound: upperLe,
        count: parseFloat(item.value[1])
      });
    }

    const result = [];
    for (const group of bucketGroups.values()) {
      const buckets = group.buckets.sort((a, b) => a.upperBound - b.upperBound);
      if (buckets.length === 0) continue;

      const totalCount = buckets[buckets.length - 1].count;
      if (totalCount === 0) {
        result.push({ metric: group.metric, value: [Date.now() / 1000, '0'] });
        continue;
      }

      const rank = q * totalCount;
      let quantileVal = 0;

      // Find first bucket where count >= rank
      let bucketIdx = buckets.findIndex((b) => b.count >= rank);
      if (bucketIdx === -1) {
        quantileVal = buckets[buckets.length - 1].upperBound;
      } else if (bucketIdx === 0) {
        const b = buckets[0];
        quantileVal = b.count > 0 ? (rank / b.count) * b.upperBound : 0;
      } else {
        const bLower = buckets[bucketIdx - 1];
        const bUpper = buckets[bucketIdx];
        const countDiff = bUpper.count - bLower.count;
        if (countDiff > 0) {
          const fraction = (rank - bLower.count) / countDiff;
          quantileVal = bLower.upperBound + fraction * (bUpper.upperBound - bLower.upperBound);
        } else {
          quantileVal = bLower.upperBound;
        }
      }

      result.push({
        metric: group.metric,
        value: [Date.now() / 1000, String(Number(quantileVal.toFixed(6)))]
      });
    }

    return { resultType: 'vector', result };
  }

  _evalBinaryOp(op, leftRes, rightRes) {
    const leftItems = leftRes.result || [];
    const rightItems = rightRes.result || [];

    // Scalar right-hand operand: e.g. vector * 100
    if (rightItems.length === 0 && !isNaN(parseFloat(rightRes))) {
      const scalar = parseFloat(rightRes);
      const res = leftItems.map((item) => {
        const v = parseFloat(item.value[1]);
        const calculated = this._calcOp(op, v, scalar);
        return { metric: item.metric, value: [item.value[0], String(calculated)] };
      });
      return { resultType: 'vector', result: res };
    }

    // Vector-to-vector matching
    const result = [];
    for (const lItem of leftItems) {
      for (const rItem of rightItems) {
        // One-to-one match on identical labels (excluding __name__)
        const lLabels = { ...lItem.metric };
        const rLabels = { ...rItem.metric };
        delete lLabels.__name__;
        delete rLabels.__name__;

        const isMatch = Object.keys(lLabels).every((k) => lLabels[k] === rLabels[k]);
        if (isMatch) {
          const lVal = parseFloat(lItem.value[1]);
          const rVal = parseFloat(rItem.value[1]);
          const calculated = this._calcOp(op, lVal, rVal);
          result.push({
            metric: lLabels,
            value: [lItem.value[0], String(calculated)]
          });
        }
      }
    }

    return { resultType: 'vector', result };
  }

  _calcOp(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? 0 : a / b;
      case '>': return a > b ? 1 : 0;
      case '<': return a < b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '==': return a === b ? 1 : 0;
      default: return a;
    }
  }

  _parseMetricSelector(selector) {
    const trimmed = selector.trim();
    const braceIdx = trimmed.indexOf('{');

    if (braceIdx === -1) {
      return { metricName: trimmed, matchers: [] };
    }

    const metricName = trimmed.slice(0, braceIdx).trim();
    const labelStr = trimmed.slice(braceIdx + 1, trimmed.lastIndexOf('}')).trim();

    const matchers = [];
    if (labelStr) {
      const matcherRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"([^"]*)"/g;
      let m;
      while ((m = matcherRegex.exec(labelStr)) !== null) {
        matchers.push({
          name: m[1],
          op: m[2],
          value: m[3]
        });
      }
    }

    return { metricName, matchers };
  }

  _metricMatches(metric, targetName, matchers = []) {
    if (targetName && metric.__name__ !== targetName) {
      return false;
    }

    for (const m of matchers) {
      const val = metric[m.name];
      if (m.op === '=') {
        if (val !== m.value) return false;
      } else if (m.op === '!=') {
        if (val === m.value) return false;
      } else if (m.op === '=~') {
        const re = new RegExp(m.value);
        if (!re.test(val || '')) return false;
      } else if (m.op === '!~') {
        const re = new RegExp(m.value);
        if (re.test(val || '')) return false;
      }
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// 2. LOKI LOGQL STREAM FILTERING & PARSING ENGINE
// ---------------------------------------------------------------------------

class LogQLEngine {
  constructor() {
    this.streams = new Map(); // streamKey -> { labels: {}, entries: [{ timestamp, line, json, logfmt }] }
  }

  pushLog(labels = {}, line, timestamp = Date.now() * 1000000) {
    const streamKey = Object.entries(labels).sort().map(([k, v]) => `${k}="${v}"`).join(',');
    let stream = this.streams.get(streamKey);
    if (!stream) {
      stream = { labels, entries: [] };
      this.streams.set(streamKey, stream);
    }

    let parsedJson = null;
    try {
      if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
        parsedJson = JSON.parse(line);
      }
    } catch {
      // not json
    }

    stream.entries.push({
      timestamp: Number(timestamp),
      line: String(line),
      json: parsedJson
    });
  }

  /**
   * Executes a LogQL query:
   * e.g.:
   *   - {app="frontend"} |= "error" != "debug"
   *   - {env="prod"} | json | status >= 500
   *   - {app="payment"} |~ "timeout|connection reset"
   */
  query(expr, options = {}) {
    const limit = options.limit || 100;
    const trimmed = String(expr || '').trim();

    // 1. Extract stream selector: {app="frontend", env="prod"}
    const streamMatch = trimmed.match(/^\{([^}]*)\}/);
    if (!streamMatch) {
      return { status: 'error', error: 'Missing stream selector {...} in LogQL expression' };
    }

    const labelMatcherStr = streamMatch[1].trim();
    const streamMatchers = this._parseMatchers(labelMatcherStr);
    const pipelineStr = trimmed.slice(streamMatch[0].length).trim();

    // 2. Collect matching stream entries
    let matchedEntries = [];
    for (const [key, stream] of this.streams.entries()) {
      if (this._streamMatches(stream.labels, streamMatchers)) {
        for (const entry of stream.entries) {
          matchedEntries.push({
            stream: stream.labels,
            timestamp: entry.timestamp,
            line: entry.line,
            json: entry.json
          });
        }
      }
    }

    // 3. Process pipeline stages: line filters, json parsing, label filters
    if (pipelineStr) {
      matchedEntries = this._processPipeline(pipelineStr, matchedEntries);
    }

    // Sort by timestamp descending
    matchedEntries.sort((a, b) => b.timestamp - a.timestamp);
    const limited = matchedEntries.slice(0, limit);

    return {
      status: 'success',
      data: {
        resultType: 'streams',
        result: limited.map((e) => ({
          stream: e.stream,
          values: [[String(e.timestamp), e.line]]
        }))
      }
    };
  }

  _parseMatchers(str) {
    if (!str) return [];
    const matchers = [];
    const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      matchers.push({ name: m[1], op: m[2], value: m[3] });
    }
    return matchers;
  }

  _streamMatches(labels, matchers) {
    for (const m of matchers) {
      const val = labels[m.name];
      if (m.op === '=' && val !== m.value) return false;
      if (m.op === '!=' && val === m.value) return false;
      if (m.op === '=~' && !new RegExp(m.value).test(val || '')) return false;
      if (m.op === '!~' && new RegExp(m.value).test(val || '')) return false;
    }
    return true;
  }

  _processPipeline(pipelineStr, entries) {
    let current = entries;
    const stageRegex = /(\|=|!=|\|~|!~|\|)\s*("[^"]*"|[^|!]+)/g;
    let match;

    while ((match = stageRegex.exec(pipelineStr)) !== null) {
      const op = match[1];
      const rest = match[2].trim();

      if (op === '|=') {
        const needle = rest.replace(/^"|"$/g, '');
        current = current.filter((e) => e.line.includes(needle));
      } else if (op === '!=') {
        const needle = rest.replace(/^"|"$/g, '');
        current = current.filter((e) => !e.line.includes(needle));
      } else if (op === '|~') {
        const pattern = new RegExp(rest.replace(/^"|"$/g, ''));
        current = current.filter((e) => pattern.test(e.line));
      } else if (op === '!~') {
        const pattern = new RegExp(rest.replace(/^"|"$/g, ''));
        current = current.filter((e) => !pattern.test(e.line));
      } else if (op === '|') {
        if (rest === 'json') {
          for (const e of current) {
            if (!e.json) {
              try { e.json = JSON.parse(e.line); } catch { e.json = {}; }
            }
          }
        } else {
          // Label / JSON field comparisons (e.g. status >= 500 or level == "warn")
          const cmpMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
          if (cmpMatch) {
            const field = cmpMatch[1];
            const cmpOp = cmpMatch[2];
            const targetRaw = cmpMatch[3].trim().replace(/^"|"$/g, '');
            const targetNum = parseFloat(targetRaw);

            current = current.filter((e) => {
              const val = e.json ? e.json[field] : undefined;
              if (val === undefined) return false;
              if (!isNaN(targetNum) && typeof val === 'number') {
                if (cmpOp === '>=') return val >= targetNum;
                if (cmpOp === '<=') return val <= targetNum;
                if (cmpOp === '>') return val > targetNum;
                if (cmpOp === '<') return val < targetNum;
                if (cmpOp === '==') return val === targetNum;
                if (cmpOp === '!=') return val !== targetNum;
              }
              if (cmpOp === '==') return String(val) === targetRaw;
              if (cmpOp === '!=') return String(val) !== targetRaw;
              return false;
            });
          }
        }
      }
    }

    return current;
  }
}

// ---------------------------------------------------------------------------
// 3. OPENTELEMETRY COLLECTOR PIPELINE VALIDATOR
// ---------------------------------------------------------------------------

class OTelPipelineValidator {
  static validate(rawConfig) {
    const errors = [];
    const warnings = [];

    let cfg = rawConfig;
    if (typeof rawConfig === 'string') {
      try {
        cfg = yamlParser.parseYaml ? yamlParser.parseYaml(rawConfig) : JSON.parse(rawConfig);
      } catch (err) {
        return { valid: false, errors: [`YAML parsing error: ${err.message}`], warnings: [] };
      }
    }

    if (!cfg || typeof cfg !== 'object') {
      return { valid: false, errors: ['Configuration root must be an object'], warnings: [] };
    }

    const receivers = cfg.receivers || {};
    const processors = cfg.processors || {};
    const exporters = cfg.exporters || {};
    const service = cfg.service || {};
    const pipelines = service.pipelines || {};

    if (Object.keys(receivers).length === 0) {
      errors.push('No receivers defined in configuration');
    }
    if (Object.keys(exporters).length === 0) {
      errors.push('No exporters defined in configuration');
    }
    if (Object.keys(pipelines).length === 0) {
      errors.push('No service pipelines configured under service.pipelines');
    }

    // Check pipeline references
    for (const [pName, pDef] of Object.entries(pipelines)) {
      if (!pDef.receivers || pDef.receivers.length === 0) {
        errors.push(`Pipeline "${pName}" must have at least one receiver`);
      } else {
        for (const r of pDef.receivers) {
          if (!receivers[r]) {
            errors.push(`Pipeline "${pName}" references undefined receiver: "${r}"`);
          }
        }
      }

      if (pDef.processors) {
        for (const pr of pDef.processors) {
          if (!processors[pr]) {
            errors.push(`Pipeline "${pName}" references undefined processor: "${pr}"`);
          }
        }
        // Best practice check: memory_limiter before batch
        const memIdx = pDef.processors.indexOf('memory_limiter');
        const batchIdx = pDef.processors.indexOf('batch');
        if (memIdx !== -1 && batchIdx !== -1 && memIdx > batchIdx) {
          warnings.push(`Pipeline "${pName}": "memory_limiter" should precede "batch" processor to prevent OOM`);
        }
      }

      if (!pDef.exporters || pDef.exporters.length === 0) {
        errors.push(`Pipeline "${pName}" must have at least one exporter`);
      } else {
        for (const ex of pDef.exporters) {
          if (!exporters[ex]) {
            errors.push(`Pipeline "${pName}" references undefined exporter: "${ex}"`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// ---------------------------------------------------------------------------
// 4. JAEGER DISTRIBUTED TRACE SPAN GENERATOR
// ---------------------------------------------------------------------------

class JaegerTraceGenerator {
  constructor() {
    this.traces = new Map(); // traceID -> traceObj
  }

  generateTrace(options = {}) {
    const traceId = options.traceId || this._randomHex(32);
    const rootSpanId = this._randomHex(16);
    const rootService = options.serviceName || 'api-gateway';
    const rootOp = options.operationName || 'GET /api/v1/checkout';
    const totalDurationMs = options.durationMs || 120;
    const hasError = options.error || false;

    const spans = [];
    const startTime = Date.now() * 1000;

    // 1. Root Ingress Span
    spans.push({
      traceID: traceId,
      spanID: rootSpanId,
      operationName: rootOp,
      references: [],
      startTime,
      duration: totalDurationMs * 1000,
      tags: [
        { key: 'http.method', type: 'string', value: 'GET' },
        { key: 'http.status_code', type: 'int64', value: hasError ? 500 : 200 },
        { key: 'error', type: 'bool', value: hasError },
        { key: 'span.kind', type: 'string', value: 'server' }
      ],
      processID: 'p1'
    });

    // 2. Downstream Child Spans (e.g. auth-service, payment-service, postgres)
    const downstream = options.dependencies || [
      { service: 'auth-service', op: 'VerifyToken', durationMs: 25, error: false },
      { service: 'payment-service', op: 'ProcessCharge', durationMs: 70, error: hasError },
      { service: 'postgres-db', op: 'INSERT INTO orders', durationMs: 15, error: false }
    ];

    let currentOffsetMs = 5;
    for (let i = 0; i < downstream.length; i++) {
      const dep = downstream[i];
      const spanId = this._randomHex(16);
      spans.push({
        traceID: traceId,
        spanID: spanId,
        operationName: dep.op,
        references: [{ refType: 'CHILD_OF', traceID: traceId, spanID: rootSpanId }],
        startTime: startTime + currentOffsetMs * 1000,
        duration: dep.durationMs * 1000,
        tags: [
          { key: 'error', type: 'bool', value: dep.error || false },
          { key: 'span.kind', type: 'string', value: 'client' }
        ],
        processID: `p${i + 2}`
      });
      currentOffsetMs += dep.durationMs;
    }

    const traceObj = {
      traceID: traceId,
      spans,
      processes: {
        p1: { serviceName: rootService, tags: [{ key: 'host.name', value: 'gateway-node' }] },
        p2: { serviceName: 'auth-service', tags: [{ key: 'host.name', value: 'auth-pod' }] },
        p3: { serviceName: 'payment-service', tags: [{ key: 'host.name', value: 'payment-pod' }] },
        p4: { serviceName: 'postgres-db', tags: [{ key: 'db.system', value: 'postgresql' }] }
      }
    };

    this.traces.set(traceId, traceObj);
    return traceObj;
  }

  findTraces({ service, operation, minDurationMs, maxDurationMs, limit = 20 }) {
    const results = [];
    for (const trace of this.traces.values()) {
      let match = true;
      if (service) {
        const hasService = Object.values(trace.processes).some((p) => p.serviceName === service);
        if (!hasService) match = false;
      }
      if (operation) {
        const hasOp = trace.spans.some((s) => s.operationName === operation);
        if (!hasOp) match = false;
      }
      if (minDurationMs) {
        const root = trace.spans.find((s) => s.references.length === 0);
        if (root && root.duration < minDurationMs * 1000) match = false;
      }
      if (maxDurationMs) {
        const root = trace.spans.find((s) => s.references.length === 0);
        if (root && root.duration > maxDurationMs * 1000) match = false;
      }
      if (match) results.push(trace);
      if (results.length >= limit) break;
    }
    return results;
  }

  _randomHex(length) {
    const chars = '0123456789abcdef';
    let str = '';
    for (let i = 0; i < length; i++) {
      str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
  }
}

// ---------------------------------------------------------------------------
// 5. SLI/SLO ERROR BUDGET BURN-RATE CALCULATOR
// ---------------------------------------------------------------------------

class SloBurnRateCalculator {
  /**
   * Calculates SRE multi-window error budget burn rate and time to exhaustion
   * @param {object} params
   *   - totalEvents: number of total requests/events
   *   - badEvents: number of failed/5xx events
   *   - sloTarget: target percentage (e.g. 0.999 for 99.9%)
   *   - windowDays: SLO window length in days (default: 30)
   *   - periodHours: duration of measured period in hours (default: 1)
   */
  static calculate({ totalEvents, badEvents, sloTarget = 0.999, windowDays = 30, periodHours = 1 }) {
    if (!totalEvents || totalEvents <= 0) {
      return {
        currentAvailability: 1.0,
        errorBudgetPercentRemaining: 100.0,
        burnRate: 0.0,
        hoursToExhaustion: Infinity,
        alertSeverity: 'NORMAL'
      };
    }

    const goodEvents = Math.max(0, totalEvents - badEvents);
    const currentAvailability = Number((goodEvents / totalEvents).toFixed(6));
    const errorRate = badEvents / totalEvents;
    const errorBudget = 1 - sloTarget;

    // Burn rate = (errorRate) / (allowed errorBudget)
    const burnRate = errorBudget > 0 ? Number((errorRate / errorBudget).toFixed(2)) : 0;

    // Budget consumed over this specific window
    const budgetConsumedPercent = errorBudget > 0
      ? Number(((errorRate * (periodHours / (windowDays * 24))) / errorBudget * 100).toFixed(2))
      : 0;

    const remainingPercent = Math.max(0, Number((100 - (badEvents / (totalEvents * errorBudget)) * 100).toFixed(2)));

    // Time to complete budget exhaustion in hours
    const totalWindowHours = windowDays * 24;
    const hoursToExhaustion = burnRate > 0 ? Number((totalWindowHours / burnRate).toFixed(1)) : Infinity;

    // SRE Google Cloud alert tiering:
    // Burn Rate >= 14.4 (Consumes 2% in 1 hour) -> CRITICAL_PAGE
    // Burn Rate >= 6.0  (Consumes 5% in 6 hours) -> HIGH_PAGE
    // Burn Rate >= 1.0  (Consumes 100% in 30 days) -> TICKET
    // Burn Rate < 1.0   -> NORMAL
    let alertSeverity = 'NORMAL';
    if (burnRate >= 14.4) alertSeverity = 'CRITICAL_PAGE';
    else if (burnRate >= 6.0) alertSeverity = 'HIGH_PAGE';
    else if (burnRate >= 1.0) alertSeverity = 'TICKET';

    return {
      currentAvailability,
      errorRate: Number(errorRate.toFixed(6)),
      errorBudgetPercentRemaining: remainingPercent,
      budgetConsumedPercent,
      burnRate,
      hoursToExhaustion,
      alertSeverity
    };
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Exports
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PromQLEngine,
    LogQLEngine,
    OTelPipelineValidator,
    JaegerTraceGenerator,
    SloBurnRateCalculator
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.PromQLEngine = PromQLEngine;
  globalThis.LogQLEngine = LogQLEngine;
  globalThis.OTelPipelineValidator = OTelPipelineValidator;
  globalThis.JaegerTraceGenerator = JaegerTraceGenerator;
  globalThis.SloBurnRateCalculator = SloBurnRateCalculator;
}
