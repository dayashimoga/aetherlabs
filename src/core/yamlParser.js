'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic Multi-Document YAML Parser & Serializer
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and WebViews.
 */

// Helper to strip comments outside of quoted strings
function stripComments(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

// Parses scalar values: numbers, booleans, null, strings, anchors, aliases
function parseScalar(val, anchors = {}) {
  if (val === undefined || val === null) return null;
  val = String(val).trim();
  if (val === '' || val === '~' || val === 'null' || val === 'Null' || val === 'NULL') {
    return null;
  }

  // Check alias (*anchor)
  if (val.startsWith('*')) {
    const aliasName = val.slice(1).trim();
    if (aliasName in anchors) {
      return structuredClone ? structuredClone(anchors[aliasName]) : JSON.parse(JSON.stringify(anchors[aliasName]));
    }
    return val;
  }

  // Single-quoted string
  if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
    return val.slice(1, -1).replace(/''/g, "'");
  }

  // Double-quoted string
  if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    try {
      return JSON.parse(val);
    } catch {
      return val.slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
    }
  }

  // Booleans
  const lower = val.toLowerCase();
  if (lower === 'true' || lower === 'yes' || lower === 'on') return true;
  if (lower === 'false' || lower === 'no' || lower === 'off') return false;

  // Numbers (Integer, Float, Hex, Octal)
  if (/^-?0x[0-9a-fA-F]+$/.test(val)) return parseInt(val, 16);
  if (/^-?0o[0-7]+$/.test(val)) return parseInt(val.replace(/^-?0o/, ''), 8);
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(val)) {
    const num = Number(val);
    if (!isNaN(num)) return num;
  }
  if (val === '.nan' || val === '.NaN') return NaN;
  if (val === '.inf' || val === '+.inf') return Infinity;
  if (val === '-.inf') return -Infinity;

  // Inline Flow Array [a, b, c]
  if (val.startsWith('[') && val.endsWith(']')) {
    return parseFlowSequence(val, anchors);
  }

  // Inline Flow Object {a: 1, b: 2}
  if (val.startsWith('{') && val.endsWith('}')) {
    return parseFlowMapping(val, anchors);
  }

  return val;
}

// Flow sequence parser [a, b, "c"]
function parseFlowSequence(str, anchors) {
  const inner = str.slice(1, -1).trim();
  if (!inner) return [];
  const items = splitFlowItems(inner);
  return items.map((item) => parseScalar(item, anchors));
}

// Flow mapping parser {a: 1, b: "c"}
function parseFlowMapping(str, anchors) {
  const inner = str.slice(1, -1).trim();
  if (!inner) return {};
  const items = splitFlowItems(inner);
  const obj = {};
  for (const item of items) {
    const colonIdx = findColonIndex(item);
    if (colonIdx !== -1) {
      const k = parseScalar(item.slice(0, colonIdx).trim(), anchors);
      const v = parseScalar(item.slice(colonIdx + 1).trim(), anchors);
      obj[String(k)] = v;
    }
  }
  return obj;
}

function splitFlowItems(str) {
  const items = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        items.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function findColonIndex(str) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ':' && !inSingle && !inDouble) {
      // Must be followed by space or end of string
      if (i === str.length - 1 || /\s/.test(str[i + 1])) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parses a single YAML document text into a JavaScript structure
 */
function parseYamlDocument(docText) {
  const trimmed = docText.trim();
  if (!trimmed) return null;

  // Direct JSON compatibility
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to YAML parser
    }
  }

  const rawLines = docText.split(/\r?\n/);
  const lines = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx];
    const stripped = stripComments(raw);
    const content = stripped.trimEnd();
    const indent = raw.search(/\S/);
    lines.push({
      raw,
      trimmed: content.trim(),
      indent: indent === -1 ? 0 : indent,
      isEmpty: indent === -1
    });
  }

  const anchors = {};

  function parseBlock(startIdx, baseIndent) {
    let i = startIdx;
    while (i < lines.length && lines[i].isEmpty) i++;
    if (i >= lines.length) return [null, i];

    const currentIndent = lines[i].indent;
    if (currentIndent < baseIndent) return [null, i];

    const firstLine = lines[i];

    // Determine if sequence or mapping
    if (firstLine.trimmed.startsWith('- ') || firstLine.trimmed === '-') {
      return parseSequence(i, currentIndent);
    } else {
      return parseMapping(i, currentIndent);
    }
  }

  function parseSequence(startIdx, seqIndent) {
    const list = [];
    let i = startIdx;

    while (i < lines.length) {
      while (i < lines.length && lines[i].isEmpty) i++;
      if (i >= lines.length) break;

      const line = lines[i];
      if (line.indent < seqIndent) break;
      if (line.indent !== seqIndent || (!line.trimmed.startsWith('- ') && line.trimmed !== '-')) {
        break;
      }

      // Found a sequence item
      const itemText = line.trimmed === '-' ? '' : line.trimmed.slice(2).trim();
      i++;

      if (itemText === '') {
        // Child block
        while (i < lines.length && lines[i].isEmpty) i++;
        if (i < lines.length && lines[i].indent > seqIndent) {
          const [val, nextIdx] = parseBlock(i, seqIndent + 1);
          list.push(val);
          i = nextIdx;
        } else {
          list.push(null);
        }
      } else {
        // Check if itemText contains a key: value (mapping within sequence item)
        const colonIdx = findColonIndex(itemText);
        if (colonIdx !== -1) {
          const keyRaw = itemText.slice(0, colonIdx).trim();
          const key = parseKey(keyRaw);
          let valRaw = itemText.slice(colonIdx + 1).trim();
          let itemAnchor = null;
          if (valRaw.startsWith('&')) {
            const spaceIdx = valRaw.indexOf(' ');
            if (spaceIdx !== -1) {
              itemAnchor = valRaw.slice(1, spaceIdx).trim();
              valRaw = valRaw.slice(spaceIdx + 1).trim();
            } else {
              itemAnchor = valRaw.slice(1).trim();
              valRaw = '';
            }
          }

          const itemMap = {};
          if (valRaw === '' || valRaw === '|' || valRaw.startsWith('|-') || valRaw.startsWith('|+') || valRaw === '>' || valRaw.startsWith('>-')) {
            if (valRaw.startsWith('|') || valRaw.startsWith('>')) {
              const [blockStr, nextIdx] = parseBlockScalar(i, seqIndent + 2, valRaw);
              itemMap[key] = blockStr;
              if (itemAnchor) anchors[itemAnchor] = blockStr;
              i = nextIdx;
            } else {
              while (i < lines.length && lines[i].isEmpty) i++;
              if (i < lines.length && lines[i].indent > seqIndent) {
                const [nestedVal, nextIdx] = parseBlock(i, lines[i].indent);
                itemMap[key] = nestedVal;
                if (itemAnchor) anchors[itemAnchor] = nestedVal;
                i = nextIdx;
              } else {
                itemMap[key] = null;
                if (itemAnchor) anchors[itemAnchor] = null;
              }
            }
          } else {
            const parsedVal = parseValueWithAnchor(valRaw);
            itemMap[key] = parsedVal;
            if (itemAnchor) anchors[itemAnchor] = parsedVal;
          }

          // Gather remaining keys belonging to this sequence item at indent > seqIndent
          while (i < lines.length) {
            while (i < lines.length && lines[i].isEmpty) i++;
            if (i >= lines.length) break;
            const subLine = lines[i];
            if (subLine.indent <= seqIndent) break;
            if (subLine.trimmed.startsWith('- ')) break;

            const subColon = findColonIndex(subLine.trimmed);
            if (subColon !== -1) {
              const subKey = parseKey(subLine.trimmed.slice(0, subColon).trim());
              let subValRaw = subLine.trimmed.slice(subColon + 1).trim();
              let subAnchor = null;
              if (subValRaw.startsWith('&')) {
                const spaceIdx = subValRaw.indexOf(' ');
                if (spaceIdx !== -1) {
                  subAnchor = subValRaw.slice(1, spaceIdx).trim();
                  subValRaw = subValRaw.slice(spaceIdx + 1).trim();
                } else {
                  subAnchor = subValRaw.slice(1).trim();
                  subValRaw = '';
                }
              }
              i++;
              if (subValRaw === '' || subValRaw.startsWith('|') || subValRaw.startsWith('>')) {
                if (subValRaw.startsWith('|') || subValRaw.startsWith('>')) {
                  const [blockStr, nextIdx] = parseBlockScalar(i, subLine.indent + 1, subValRaw);
                  itemMap[subKey] = blockStr;
                  if (subAnchor) anchors[subAnchor] = blockStr;
                  i = nextIdx;
                } else {
                  while (i < lines.length && lines[i].isEmpty) i++;
                  if (i < lines.length && lines[i].indent > subLine.indent) {
                    const [subNested, nextIdx] = parseBlock(i, lines[i].indent);
                    itemMap[subKey] = subNested;
                    if (subAnchor) anchors[subAnchor] = subNested;
                    i = nextIdx;
                  } else {
                    itemMap[subKey] = null;
                    if (subAnchor) anchors[subAnchor] = null;
                  }
                }
              } else {
                const parsedVal = parseValueWithAnchor(subValRaw);
                itemMap[subKey] = parsedVal;
                if (subAnchor) anchors[subAnchor] = parsedVal;
              }
            } else {
              i++;
            }
          }
          list.push(itemMap);
        } else {
          // Plain scalar or flow collection item
          list.push(parseValueWithAnchor(itemText));
        }
      }
    }

    return [list, i];
  }

  function parseMapping(startIdx, mapIndent) {
    const map = {};
    let i = startIdx;

    while (i < lines.length) {
      while (i < lines.length && lines[i].isEmpty) i++;
      if (i >= lines.length) break;

      const line = lines[i];
      if (line.indent < mapIndent) break;
      if (line.indent !== mapIndent) {
        break;
      }

      const colonIdx = findColonIndex(line.trimmed);
      if (colonIdx === -1) {
        // Line without colon at map indent? Advance
        i++;
        continue;
      }

      let keyRaw = line.trimmed.slice(0, colonIdx).trim();
      let anchorName = null;
      if (keyRaw.startsWith('&')) {
        const spaceIdx = keyRaw.indexOf(' ');
        if (spaceIdx !== -1) {
          anchorName = keyRaw.slice(1, spaceIdx).trim();
          keyRaw = keyRaw.slice(spaceIdx + 1).trim();
        }
      }
      const key = parseKey(keyRaw);
      let valRaw = line.trimmed.slice(colonIdx + 1).trim();
      if (valRaw.startsWith('&')) {
        const spaceIdx = valRaw.indexOf(' ');
        if (spaceIdx !== -1) {
          anchorName = valRaw.slice(1, spaceIdx).trim();
          valRaw = valRaw.slice(spaceIdx + 1).trim();
        } else {
          anchorName = valRaw.slice(1).trim();
          valRaw = '';
        }
      }
      i++;

      if (valRaw === '' || valRaw.startsWith('|') || valRaw.startsWith('>')) {
        if (valRaw.startsWith('|') || valRaw.startsWith('>')) {
          const [blockStr, nextIdx] = parseBlockScalar(i, mapIndent + 1, valRaw);
          map[key] = blockStr;
          if (anchorName) anchors[anchorName] = blockStr;
          i = nextIdx;
        } else {
          // Check next lines for nested block
          while (i < lines.length && lines[i].isEmpty) i++;
          if (i < lines.length && lines[i].indent > mapIndent) {
            const [nestedVal, nextIdx] = parseBlock(i, lines[i].indent);
            map[key] = nestedVal;
            if (anchorName) anchors[anchorName] = nestedVal;
            i = nextIdx;
          } else {
            map[key] = null;
            if (anchorName) anchors[anchorName] = null;
          }
        }
      } else {
        const val = parseValueWithAnchor(valRaw);
        map[key] = val;
        if (anchorName) anchors[anchorName] = val;
      }
    }

    return [map, i];
  }

  function parseKey(raw) {
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  function parseValueWithAnchor(valRaw) {
    if (valRaw.startsWith('&')) {
      const spaceIdx = valRaw.indexOf(' ');
      if (spaceIdx !== -1) {
        const anchor = valRaw.slice(1, spaceIdx).trim();
        const actualVal = parseScalar(valRaw.slice(spaceIdx + 1).trim(), anchors);
        anchors[anchor] = actualVal;
        return actualVal;
      }
    }
    return parseScalar(valRaw, anchors);
  }

  function parseBlockScalar(startIdx, minIndent, header) {
    const isFolded = header.startsWith('>');
    const chompStrip = header.includes('-');
    const chompKeep = header.includes('+');

    const scalarLines = [];
    let i = startIdx;
    let blockIndent = -1;

    while (i < lines.length) {
      const line = lines[i];
      if (line.isEmpty) {
        scalarLines.push({ text: '', isEmpty: true });
        i++;
        continue;
      }

      if (blockIndent === -1) {
        if (line.indent < minIndent) break;
        blockIndent = line.indent;
      } else if (line.indent < blockIndent) {
        break;
      }

      scalarLines.push({
        text: line.raw.slice(blockIndent),
        isEmpty: false
      });
      i++;
    }

    // Strip trailing empty lines based on chomping
    if (chompStrip) {
      while (scalarLines.length > 0 && scalarLines[scalarLines.length - 1].isEmpty) {
        scalarLines.pop();
      }
    } else if (!chompKeep) {
      while (scalarLines.length > 0 && scalarLines[scalarLines.length - 1].isEmpty) {
        scalarLines.pop();
      }
      scalarLines.push({ text: '', isEmpty: true });
    }

    let result = '';
    if (isFolded) {
      // Folded style (>)
      let buffer = [];
      for (const line of scalarLines) {
        if (line.isEmpty) {
          if (buffer.length > 0) {
            result += buffer.join(' ') + '\n';
            buffer = [];
          }
          result += '\n';
        } else {
          buffer.push(line.text);
        }
      }
      if (buffer.length > 0) {
        result += buffer.join(' ');
      }
    } else {
      // Literal style (|)
      result = scalarLines.map((l) => l.text).join('\n');
    }

    if (!chompStrip && !result.endsWith('\n') && scalarLines.length > 0) {
      result += '\n';
    }

    return [result, i];
  }

  const [res] = parseBlock(0, 0);
  return res;
}

/**
 * Parses all documents in a multi-document YAML stream separated by ---
 * @param {string} yamlText 
 * @returns {Array<any>} Array of parsed documents
 */
function parseAllYaml(yamlText) {
  if (!yamlText || typeof yamlText !== 'string') return [];
  const rawDocs = yamlText.split(/^(?:---|\.\.\.)\s*$/m);
  const results = [];

  for (const rawDoc of rawDocs) {
    const trimmed = rawDoc.trim();
    if (!trimmed) continue;
    // Skip YAML directives like %YAML 1.2
    if (trimmed.startsWith('%')) {
      const filtered = trimmed.split('\n').filter((l) => !l.trim().startsWith('%')).join('\n');
      if (!filtered.trim()) continue;
      const parsed = parseYamlDocument(filtered);
      if (parsed !== null) results.push(parsed);
    } else {
      const parsed = parseYamlDocument(rawDoc);
      if (parsed !== null) results.push(parsed);
    }
  }

  return results;
}

/**
 * Parses single YAML document (or first document if multi-document)
 * @param {string} yamlText 
 * @returns {any}
 */
function parseYaml(yamlText) {
  const docs = parseAllYaml(yamlText);
  return docs.length > 0 ? docs[0] : null;
}

/**
 * Serializes a JavaScript value to standardized Kubernetes-style YAML
 * @param {any} value 
 * @param {number} indentStep 
 * @returns {string}
 */
function stringifyYaml(value, indentStep = 2) {
  function serialize(val, indentLevel) {
    const pad = ' '.repeat(indentLevel);
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      if (val.includes('\n')) {
        const lines = val.split('\n');
        const blockPad = ' '.repeat(indentLevel + indentStep);
        return '|\n' + lines.map((l) => (l ? blockPad + l : '')).join('\n');
      }
      if (val === '' || /[:#\[\]\{\},&*\?!|>'"%@`]/.test(val) || /^(true|false|null|yes|no|on|off)$/i.test(val) || !isNaN(Number(val))) {
        return JSON.stringify(val);
      }
      return val;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const lines = [];
      for (const item of val) {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const entries = Object.entries(item);
          if (entries.length === 0) {
            lines.push(`${pad}- {}`);
          } else {
            const [firstKey, firstVal] = entries[0];
            const firstSerialized = serialize(firstVal, indentLevel + indentStep);
            if (typeof firstVal === 'object' && firstVal !== null && (Array.isArray(firstVal) || Object.keys(firstVal).length > 0)) {
              lines.push(`${pad}- ${firstKey}:`);
              lines.push(serialize(firstVal, indentLevel + indentStep));
            } else {
              lines.push(`${pad}- ${firstKey}: ${firstSerialized}`);
            }
            for (let e = 1; e < entries.length; e++) {
              const [k, v] = entries[e];
              const s = serialize(v, indentLevel + indentStep);
              if (typeof v === 'object' && v !== null && (Array.isArray(v) || Object.keys(v).length > 0)) {
                lines.push(`${pad}  ${k}:`);
                lines.push(serialize(v, indentLevel + indentStep));
              } else {
                lines.push(`${pad}  ${k}: ${s}`);
              }
            }
          }
        } else {
          lines.push(`${pad}- ${serialize(item, indentLevel + indentStep)}`);
        }
      }
      return lines.join('\n');
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return '{}';
      const lines = [];
      for (const k of keys) {
        const v = val[k];
        const keyStr = /[:#\s\[\]\{\}]/.test(k) ? JSON.stringify(k) : k;
        if (typeof v === 'object' && v !== null && (Array.isArray(v) || Object.keys(v).length > 0)) {
          lines.push(`${pad}${keyStr}:`);
          lines.push(serialize(v, indentLevel + indentStep));
        } else {
          lines.push(`${pad}${keyStr}: ${serialize(v, indentLevel + indentStep)}`);
        }
      }
      return lines.join('\n');
    }

    return String(val);
  }

  return serialize(value, 0) + '\n';
}

// Dual ESM and CommonJS export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseYaml,
    parseAllYaml,
    stringifyYaml
  };
}
export { parseYaml, parseAllYaml, stringifyYaml };
