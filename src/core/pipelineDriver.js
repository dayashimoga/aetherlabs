'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic In-Memory Pipeline Driver & Virtual PTY Engine
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and Desktop WebViews.
 */

let shellParser;
try {
  shellParser = require('./shellParser');
} catch {
  shellParser = (typeof globalThis !== 'undefined' && globalThis.shellParser) || {};
}

let VirtualFileSystem;
try {
  VirtualFileSystem = require('./virtualFileSystem').VirtualFileSystem;
} catch {
  VirtualFileSystem = (typeof globalThis !== 'undefined' && globalThis.VirtualFileSystem);
}

// ---------------------------------------------------------------------------
// Isomorphic UTF-8 and Base64 Utilities
// ---------------------------------------------------------------------------

function utf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(str, 'utf8');
  }
  return encodeURI(str).split(/%(?:u[0-9A-F]{4}|[0-9A-F]{2})/i).length - 1;
}

function utf8ToBase64(str) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  if (typeof TextEncoder !== 'undefined' && typeof btoa !== 'undefined') {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  throw new Error('No base64 encoder available in environment');
}

function base64ToUtf8(b64) {
  const clean = String(b64).replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(clean, 'base64').toString('utf8');
  }
  if (typeof TextDecoder !== 'undefined' && typeof atob !== 'undefined') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  throw new Error('No base64 decoder available in environment');
}

/**
 * Strips all ANSI VT100 / xterm escape sequences from a string
 */
function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// ---------------------------------------------------------------------------
// POSIX Streaming Tools Implementation
// ---------------------------------------------------------------------------

/**
 * Helper: Reads content from arguments (files in VFS) or stdin
 */
function readFilesOrStdin(args, stdin, vfs, cwd = '/home/learner') {
  if (!args || args.length === 0 || (args.length === 1 && args[0] === '-')) {
    return [{ name: '(standard input)', content: String(stdin || '') }];
  }

  const results = [];
  for (const filename of args) {
    if (filename === '-') {
      results.push({ name: '(standard input)', content: String(stdin || '') });
    } else if (vfs) {
      try {
        const resolved = vfs.normalizePath(filename, cwd);
        const content = vfs.readFile(resolved);
        results.push({ name: filename, content: String(content) });
      } catch (err) {
        throw new Error(`${filename}: No such file or directory`);
      }
    } else {
      throw new Error(`${filename}: No such file or directory`);
    }
  }
  return results;
}

/**
 * grep: search for patterns in input or files
 */
function grepTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let invert = false;
  let ignoreCase = false;
  let countOnly = false;
  let lineNumbers = false;
  let filesOnly = false;
  let quiet = false;
  let wordRegexp = false;
  let onlyMatching = false;
  let maxCount = Infinity;
  let pattern = null;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-v' || arg === '--invert-match') invert = true;
    else if (arg === '-i' || arg === '--ignore-case') ignoreCase = true;
    else if (arg === '-c' || arg === '--count') countOnly = true;
    else if (arg === '-n' || arg === '--line-number') lineNumbers = true;
    else if (arg === '-l' || arg === '--files-with-matches') filesOnly = true;
    else if (arg === '-q' || arg === '--quiet' || arg === '--silent') quiet = true;
    else if (arg === '-w' || arg === '--word-regexp') wordRegexp = true;
    else if (arg === '-o' || arg === '--only-matching') onlyMatching = true;
    else if (arg === '-E' || arg === '--extended-regexp') { /* regex mode */ }
    else if (arg === '-e' && i + 1 < argv.length) {
      pattern = argv[++i];
    } else if (arg.startsWith('-e')) {
      pattern = arg.slice(2);
    } else if (arg === '-m' && i + 1 < argv.length) {
      maxCount = parseInt(argv[++i], 10) || Infinity;
    } else if (arg.startsWith('-m')) {
      maxCount = parseInt(arg.slice(2), 10) || Infinity;
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Combined flags like -vi or -vn
      for (let c = 1; c < arg.length; c++) {
        const flag = arg[c];
        if (flag === 'v') invert = true;
        else if (flag === 'i') ignoreCase = true;
        else if (flag === 'c') countOnly = true;
        else if (flag === 'n') lineNumbers = true;
        else if (flag === 'l') filesOnly = true;
        else if (flag === 'q') quiet = true;
        else if (flag === 'w') wordRegexp = true;
        else if (flag === 'o') onlyMatching = true;
        else if (flag === 'E') { /* regex mode */ }
      }
    } else if (pattern === null) {
      pattern = arg;
    } else {
      files.push(arg);
    }
  }

  if (pattern === null) {
    return { stdout: '', stderr: 'grep: missing pattern\n', code: 2 };
  }

  let regex;
  try {
    let regStr = pattern;
    if (wordRegexp) {
      regStr = `\\b(?:${regStr})\\b`;
    }
    const flags = (ignoreCase ? 'i' : '') + (onlyMatching ? 'g' : '');
    regex = new RegExp(regStr, flags);
  } catch (err) {
    return { stdout: '', stderr: `grep: invalid regular expression: ${err.message}\n`, code: 2 };
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `grep: ${err.message}\n`, code: 2 };
  }

  let totalMatches = 0;
  const outLines = [];
  const multipleFiles = inputs.length > 1;

  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    // If the last line is empty and content ended with \n, drop the trailing empty segment
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }

    let fileMatches = 0;
    const fileOutLines = [];

    for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
      if (fileMatches >= maxCount) break;
      const line = rawLines[lIdx];
      const lineNum = lIdx + 1;

      // Reset regex state if global
      regex.lastIndex = 0;
      const matches = regex.test(line);
      const isSelected = invert ? !matches : matches;

      if (isSelected) {
        fileMatches++;
        totalMatches++;

        if (filesOnly) {
          outLines.push(item.name);
          break;
        }

        if (quiet || countOnly) continue;

        if (onlyMatching && !invert) {
          regex.lastIndex = 0;
          let m;
          while ((m = regex.exec(line)) !== null) {
            let matchedText = m[0];
            let prefix = '';
            if (multipleFiles) prefix += `${item.name}:`;
            if (lineNumbers) prefix += `${lineNum}:`;
            fileOutLines.push(prefix + matchedText);
            if (m.index === regex.lastIndex) regex.lastIndex++; // Avoid infinite loops
          }
        } else {
          let prefix = '';
          if (multipleFiles) prefix += `${item.name}:`;
          if (lineNumbers) prefix += `${lineNum}:`;
          fileOutLines.push(prefix + line);
        }
      }
    }

    if (countOnly) {
      let prefix = multipleFiles ? `${item.name}:` : '';
      outLines.push(`${prefix}${fileMatches}`);
    } else if (!filesOnly && !quiet) {
      outLines.push(...fileOutLines);
    }
  }

  if (quiet) {
    return { stdout: '', stderr: '', code: totalMatches > 0 ? 0 : 1 };
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: totalMatches > 0 ? 0 : 1 };
}

/**
 * awk: pattern scanning and text processing language
 */
function awkTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let fs = null; // field separator
  let script = null;
  const userVars = {};
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-F' && i + 1 < argv.length) {
      fs = argv[++i];
    } else if (arg.startsWith('-F')) {
      fs = arg.slice(2);
    } else if (arg === '-v' && i + 1 < argv.length) {
      const vPair = argv[++i];
      const eq = vPair.indexOf('=');
      if (eq !== -1) userVars[vPair.slice(0, eq)] = vPair.slice(eq + 1);
    } else if (script === null) {
      script = arg;
    } else {
      files.push(arg);
    }
  }

  if (!script) {
    return { stdout: '', stderr: 'awk: missing program script\n', code: 2 };
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `awk: ${err.message}\n`, code: 2 };
  }

  // Parse AWK blocks: BEGIN, END, and line patterns
  let beginAction = null;
  let endAction = null;
  const rules = [];

  let remaining = script.trim();

  // Extract BEGIN { ... }
  const beginMatch = remaining.match(/BEGIN\s*\{([^}]*)\}/);
  if (beginMatch) {
    beginAction = beginMatch[1].trim();
    remaining = remaining.replace(beginMatch[0], '');
  }

  // Extract END { ... }
  const endMatch = remaining.match(/END\s*\{([^}]*)\}/);
  if (endMatch) {
    endAction = endMatch[1].trim();
    remaining = remaining.replace(endMatch[0], '');
  }

  // Extract remaining pattern-action or simple action blocks
  const ruleRegex = /(?:(\/[^\/]+\/|[^{]+))?\s*\{([^}]*)\}/g;
  let rMatch;
  let foundAny = false;
  while ((rMatch = ruleRegex.exec(remaining)) !== null) {
    foundAny = true;
    const cond = rMatch[1] ? rMatch[1].trim() : null;
    const action = rMatch[2].trim();
    rules.push({ cond, action });
  }

  // If no block with braces was found, but there's a simple pattern or print
  if (!foundAny && remaining.trim()) {
    const trimmed = remaining.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      rules.push({ cond: null, action: trimmed.slice(1, -1).trim() });
    } else {
      // Pattern only, default action is { print $0 }
      rules.push({ cond: trimmed, action: 'print $0' });
    }
  }

  const outLines = [];
  const vars = { ...userVars, OFS: ' ', FS: fs || ' ' };
  let nr = 0; // Record Number across all files

  function evaluatePrint(actionStr, fields, rawLine) {
    if (!actionStr) return;
    const statements = actionStr.split(';').map((s) => s.trim()).filter(Boolean);

    for (const stmt of statements) {
      if (stmt.startsWith('print')) {
        const exprPart = stmt.slice(5).trim();
        if (!exprPart) {
          outLines.push(rawLine);
          continue;
        }

        // Parse comma-separated print arguments
        const args = [];
        let curr = '';
        let inQ = false;
        for (let i = 0; i < exprPart.length; i++) {
          const ch = exprPart[i];
          if (ch === '"') inQ = !inQ;
          else if (ch === ',' && !inQ) {
            args.push(curr.trim());
            curr = '';
            continue;
          }
          curr += ch;
        }
        if (curr.trim()) args.push(curr.trim());

        const evaluated = args.map((arg) => {
          if (arg.startsWith('"') && arg.endsWith('"')) {
            return arg.slice(1, -1);
          }
          if (arg === '$0') return rawLine;
          if (arg.startsWith('$')) {
            const fIndex = parseInt(arg.slice(1), 10);
            return fields[fIndex - 1] !== undefined ? fields[fIndex - 1] : '';
          }
          if (arg === 'NF') return String(fields.length);
          if (arg === 'NR') return String(nr);
          if (arg in vars) return String(vars[arg]);
          // Number literal
          if (!isNaN(Number(arg))) return arg;
          return arg;
        });

        outLines.push(evaluated.join(vars.OFS));
      } else if (stmt.includes('+=')) {
        const [vName, vVal] = stmt.split('+=').map((s) => s.trim());
        let addend = 0;
        if (vVal.startsWith('$')) {
          const fIndex = parseInt(vVal.slice(1), 10);
          addend = parseFloat(fields[fIndex - 1]) || 0;
        } else {
          addend = parseFloat(vVal) || 0;
        }
        vars[vName] = (parseFloat(vars[vName]) || 0) + addend;
      } else if (stmt.endsWith('++')) {
        const vName = stmt.slice(0, -2).trim();
        vars[vName] = (parseInt(vars[vName], 10) || 0) + 1;
      }
    }
  }

  // Execute BEGIN block
  if (beginAction) {
    evaluatePrint(beginAction, [], '');
  }

  // Process lines
  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }

    for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
      const line = rawLines[lIdx];
      nr++;

      // Split fields
      let fields;
      if (fs) {
        fields = line.split(fs);
      } else {
        // Standard awk whitespace delimiter: trim and split by whitespace
        fields = line.trim().length > 0 ? line.trim().split(/\s+/) : [];
      }

      for (const rule of rules) {
        let matches = true;
        if (rule.cond) {
          const c = rule.cond.trim();
          if (c.startsWith('/') && c.endsWith('/')) {
            const re = new RegExp(c.slice(1, -1));
            matches = re.test(line);
          } else if (c.startsWith('!/') && c.endsWith('/')) {
            const re = new RegExp(c.slice(2, -1));
            matches = !re.test(line);
          } else if (c.includes('>')) {
            const [left, right] = c.split('>').map((s) => s.trim());
            const lVal = left === 'NR' ? nr : left === 'NF' ? fields.length : parseFloat(left);
            matches = lVal > parseFloat(right);
          } else if (c.includes('<')) {
            const [left, right] = c.split('<').map((s) => s.trim());
            const lVal = left === 'NR' ? nr : left === 'NF' ? fields.length : parseFloat(left);
            matches = lVal < parseFloat(right);
          } else if (c.includes('==')) {
            const [left, right] = c.split('==').map((s) => s.trim());
            const cleanRight = right.replace(/^["']|["']$/g, '');
            let lVal = left;
            if (left === 'NR') lVal = nr;
            else if (left === 'NF') lVal = fields.length;
            else if (left.startsWith('$')) {
              const idx = parseInt(left.slice(1), 10);
              lVal = fields[idx - 1] || '';
            }
            matches = String(lVal) === cleanRight;
          } else if (c.includes('!=')) {
            const [left, right] = c.split('!=').map((s) => s.trim());
            const cleanRight = right.replace(/^["']|["']$/g, '');
            let lVal = left;
            if (left === 'NR') lVal = nr;
            else if (left === 'NF') lVal = fields.length;
            else if (left.startsWith('$')) {
              const idx = parseInt(left.slice(1), 10);
              lVal = fields[idx - 1] || '';
            }
            matches = String(lVal) !== cleanRight;
          }
        }

        if (matches) {
          evaluatePrint(rule.action, fields, line);
        }
      }
    }
  }

  // Execute END block
  if (endAction) {
    evaluatePrint(endAction, [], '');
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * sed: stream editor for filtering and transforming text
 */
function sedTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let quiet = false;
  let inPlace = false;
  const scripts = [];
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n' || arg === '--quiet' || arg === '--silent') quiet = true;
    else if (arg === '-i' || arg === '--in-place') inPlace = true;
    else if (arg === '-e' && i + 1 < argv.length) {
      scripts.push(argv[++i]);
    } else if (arg.startsWith('-e')) {
      scripts.push(arg.slice(2));
    } else if (scripts.length === 0 && !arg.startsWith('-')) {
      scripts.push(arg);
    } else {
      files.push(arg);
    }
  }

  if (scripts.length === 0) {
    return { stdout: '', stderr: 'sed: missing script\n', code: 2 };
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `sed: ${err.message}\n`, code: 2 };
  }

  const fullScript = scripts.join(';');
  const commands = fullScript.split(';').map((s) => s.trim()).filter(Boolean);

  const outLines = [];

  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }

    const transformedLines = [];

    for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
      let line = rawLines[lIdx];
      const lineNum = lIdx + 1;
      const isLast = lIdx === rawLines.length - 1;
      let shouldDelete = false;
      let explicitlyPrint = false;

      for (const cmd of commands) {
        // Line number or pattern address matching e.g. 1d, 1,3d, /foo/d, $d, s/foo/bar/
        let targetCmd = cmd;
        let addrMatches = true;

        const addrMatch = targetCmd.match(/^(\d+|\$|\/[^\/]+\/)(?:,(\d+|\$|\/[^\/]+\/))?(.*)$/);
        if (addrMatch) {
          const startAddr = addrMatch[1];
          const endAddr = addrMatch[2];
          targetCmd = addrMatch[3].trim();

          const checkSingle = (addr) => {
            if (addr === '$') return isLast;
            if (addr.startsWith('/') && addr.endsWith('/')) {
              return new RegExp(addr.slice(1, -1)).test(line);
            }
            return parseInt(addr, 10) === lineNum;
          };

          if (endAddr) {
            const startNum = parseInt(startAddr, 10) || 1;
            const endNum = endAddr === '$' ? Infinity : parseInt(endAddr, 10) || 1;
            addrMatches = lineNum >= startNum && lineNum <= endNum;
          } else {
            addrMatches = checkSingle(startAddr);
          }
        }

        if (!addrMatches) continue;

        // Command: Delete 'd'
        if (targetCmd === 'd') {
          shouldDelete = true;
          break;
        }

        // Command: Print 'p'
        if (targetCmd === 'p') {
          explicitlyPrint = true;
        }

        // Command: Substitution 's'
        if (targetCmd.startsWith('s') && targetCmd.length >= 3) {
          const delim = targetCmd[1];
          // Split by delim respecting escaped delims
          const parts = [];
          let cur = '';
          let esc = false;
          for (let pIdx = 2; pIdx < targetCmd.length; pIdx++) {
            const ch = targetCmd[pIdx];
            if (esc) {
              cur += ch;
              esc = false;
            } else if (ch === '\\') {
              esc = true;
            } else if (ch === delim) {
              parts.push(cur);
              cur = '';
            } else {
              cur += ch;
            }
          }
          parts.push(cur);

          const pattern = parts[0] || '';
          let replacement = parts[1] || '';
          const flags = parts[2] || '';

          // Expand escape sequences in replacement
          replacement = replacement.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

          const isGlobal = flags.includes('g');
          const isInsensitive = flags.includes('i');
          const isPrintOnSub = flags.includes('p');

          try {
            const re = new RegExp(pattern, (isGlobal ? 'g' : '') + (isInsensitive ? 'i' : ''));
            // Support sed & character (whole match replacement)
            const safeReplacement = replacement.replace(/(^|[^\\])&/g, '$1$$&');
            const before = line;
            line = line.replace(re, safeReplacement);
            if (isPrintOnSub && before !== line) {
              explicitlyPrint = true;
            }
          } catch (err) {
            return { stdout: '', stderr: `sed: regex error: ${err.message}\n`, code: 2 };
          }
        }
      }

      if (!shouldDelete) {
        if (!quiet) {
          transformedLines.push(line);
        }
        if (explicitlyPrint) {
          transformedLines.push(line);
        }
      }
    }

    if (inPlace && item.name !== '(standard input)' && vfs) {
      const resolved = vfs.normalizePath(item.name, cwd);
      vfs.writeFile(resolved, transformedLines.join('\n') + '\n');
    } else {
      outLines.push(...transformedLines);
    }
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * head: output the first part of files or stdin
 */
function headTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let lines = 10;
  let bytes = null;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n' && i + 1 < argv.length) {
      lines = parseInt(argv[++i], 10);
    } else if (arg.startsWith('-n')) {
      lines = parseInt(arg.slice(2), 10);
    } else if (arg === '-c' && i + 1 < argv.length) {
      bytes = parseInt(argv[++i], 10);
    } else if (arg.startsWith('-c')) {
      bytes = parseInt(arg.slice(2), 10);
    } else if (/^-\d+$/.test(arg)) {
      lines = parseInt(arg.slice(1), 10);
    } else {
      files.push(arg);
    }
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `head: ${err.message}\n`, code: 1 };
  }

  const out = [];
  for (const item of inputs) {
    if (bytes !== null) {
      out.push(item.content.slice(0, bytes));
    } else {
      const rawLines = item.content.split('\n');
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
        rawLines.pop();
      }
      let selected;
      if (lines < 0) {
        // All but the last |lines| lines
        selected = rawLines.slice(0, Math.max(0, rawLines.length + lines));
      } else {
        selected = rawLines.slice(0, lines);
      }
      out.push(selected.length > 0 ? selected.join('\n') + '\n' : '');
    }
  }

  return { stdout: out.join(''), stderr: '', code: 0 };
}

/**
 * tail: output the last part of files or stdin
 */
function tailTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let lines = 10;
  let fromStart = false;
  let bytes = null;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n' && i + 1 < argv.length) {
      const val = argv[++i];
      if (val.startsWith('+')) {
        fromStart = true;
        lines = parseInt(val.slice(1), 10);
      } else {
        lines = parseInt(val, 10);
      }
    } else if (arg.startsWith('-n+')) {
      fromStart = true;
      lines = parseInt(arg.slice(3), 10);
    } else if (arg.startsWith('-n')) {
      lines = parseInt(arg.slice(2), 10);
    } else if (arg === '-c' && i + 1 < argv.length) {
      bytes = parseInt(argv[++i], 10);
    } else if (arg.startsWith('-c')) {
      bytes = parseInt(arg.slice(2), 10);
    } else if (/^-\d+$/.test(arg)) {
      lines = parseInt(arg.slice(1), 10);
    } else {
      files.push(arg);
    }
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `tail: ${err.message}\n`, code: 1 };
  }

  const out = [];
  for (const item of inputs) {
    if (bytes !== null) {
      out.push(item.content.slice(-bytes));
    } else {
      const rawLines = item.content.split('\n');
      if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
        rawLines.pop();
      }
      let selected;
      if (fromStart) {
        selected = rawLines.slice(Math.max(0, lines - 1));
      } else {
        selected = rawLines.slice(Math.max(0, rawLines.length - lines));
      }
      out.push(selected.length > 0 ? selected.join('\n') + '\n' : '');
    }
  }

  return { stdout: out.join(''), stderr: '', code: 0 };
}

/**
 * wc: print newline, word, and byte counts
 */
function wcTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let countLines = false;
  let countWords = false;
  let countBytes = false;
  let countChars = false;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-l' || arg === '--lines') countLines = true;
    else if (arg === '-w' || arg === '--words') countWords = true;
    else if (arg === '-c' || arg === '--bytes') countBytes = true;
    else if (arg === '-m' || arg === '--chars') countChars = true;
    else if (arg.startsWith('-') && arg.length > 1) {
      for (let c = 1; c < arg.length; c++) {
        if (arg[c] === 'l') countLines = true;
        else if (arg[c] === 'w') countWords = true;
        else if (arg[c] === 'c') countBytes = true;
        else if (arg[c] === 'm') countChars = true;
      }
    } else {
      files.push(arg);
    }
  }

  const defaultAll = !countLines && !countWords && !countBytes && !countChars;
  if (defaultAll) {
    countLines = true;
    countWords = true;
    countBytes = true;
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `wc: ${err.message}\n`, code: 1 };
  }

  const outLines = [];
  for (const item of inputs) {
    const lineCount = (item.content.match(/\n/g) || []).length;
    const words = item.content.trim().length > 0 ? item.content.trim().split(/\s+/).length : 0;
    const byteCount = utf8ByteLength(item.content);
    const charCount = item.content.length;

    const parts = [];
    if (countLines) parts.push(String(lineCount).padStart(7));
    if (countWords) parts.push(String(words).padStart(7));
    if (countBytes) parts.push(String(byteCount).padStart(7));
    if (countChars && !countBytes) parts.push(String(charCount).padStart(7));
    if (files.length > 0 && item.name !== '(standard input)') parts.push(item.name);

    outLines.push(parts.join(' '));
  }

  return { stdout: outLines.join('\n') + '\n', stderr: '', code: 0 };
}

/**
 * sort: sort lines of text files
 */
function sortTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let reverse = false;
  let numeric = false;
  let unique = false;
  let ignoreCase = false;
  let delimiter = null;
  let keyCol = null;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-r' || arg === '--reverse') reverse = true;
    else if (arg === '-n' || arg === '--numeric-sort') numeric = true;
    else if (arg === '-u' || arg === '--unique') unique = true;
    else if (arg === '-f' || arg === '--ignore-case') ignoreCase = true;
    else if (arg === '-t' && i + 1 < argv.length) {
      delimiter = argv[++i];
    } else if (arg.startsWith('-t')) {
      delimiter = arg.slice(2);
    } else if (arg === '-k' && i + 1 < argv.length) {
      keyCol = argv[++i];
    } else if (arg.startsWith('-k')) {
      keyCol = arg.slice(2);
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (let c = 1; c < arg.length; c++) {
        if (arg[c] === 'r') reverse = true;
        else if (arg[c] === 'n') numeric = true;
        else if (arg[c] === 'u') unique = true;
        else if (arg[c] === 'f') ignoreCase = true;
      }
    } else {
      files.push(arg);
    }
  }

  let colIdx = null;
  let colNumeric = numeric;
  let colReverse = reverse;
  if (keyCol) {
    const kMatch = keyCol.match(/^(\d+)(?:,(\d+))?([nrf]*)$/);
    if (kMatch) {
      colIdx = parseInt(kMatch[1], 10) - 1;
      const flags = kMatch[3] || '';
      if (flags.includes('n')) colNumeric = true;
      if (flags.includes('r')) colReverse = true;
      if (flags.includes('f')) ignoreCase = true;
    }
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `sort: ${err.message}\n`, code: 1 };
  }

  let lines = [];
  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }
    lines.push(...rawLines);
  }

  function getField(line) {
    if (colIdx === null) return line;
    const parts = delimiter ? line.split(delimiter) : line.trim().split(/\s+/);
    return parts[colIdx] !== undefined ? parts[colIdx] : '';
  }

  lines.sort((a, b) => {
    let valA = getField(a);
    let valB = getField(b);

    if (ignoreCase) {
      valA = typeof valA === 'string' ? valA.toLowerCase() : valA;
      valB = typeof valB === 'string' ? valB.toLowerCase() : valB;
    }

    let cmp = 0;
    if (colNumeric) {
      const numA = parseFloat(valA) || 0;
      const numB = parseFloat(valB) || 0;
      cmp = numA - numB;
    } else {
      cmp = String(valA).localeCompare(String(valB));
    }

    return colReverse ? -cmp : cmp;
  });

  if (unique) {
    lines = lines.filter((line, idx) => idx === 0 || line !== lines[idx - 1]);
  }

  const stdout = lines.length > 0 ? lines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * uniq: report or omit repeated lines
 */
function uniqTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let countOnly = false;
  let repeatedOnly = false;
  let uniqueOnly = false;
  let ignoreCase = false;
  let skipFields = 0;
  let skipChars = 0;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-c' || arg === '--count') countOnly = true;
    else if (arg === '-d' || arg === '--repeated') repeatedOnly = true;
    else if (arg === '-u' || arg === '--unique') uniqueOnly = true;
    else if (arg === '-i' || arg === '--ignore-case') ignoreCase = true;
    else if (arg === '-f' && i + 1 < argv.length) {
      skipFields = parseInt(argv[++i], 10) || 0;
    } else if (arg.startsWith('-f')) {
      skipFields = parseInt(arg.slice(2), 10) || 0;
    } else if (arg === '-s' && i + 1 < argv.length) {
      skipChars = parseInt(argv[++i], 10) || 0;
    } else if (arg.startsWith('-s')) {
      skipChars = parseInt(arg.slice(2), 10) || 0;
    } else {
      files.push(arg);
    }
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `uniq: ${err.message}\n`, code: 1 };
  }

  const rawLines = inputs.map((i) => i.content).join('\n').split('\n');
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  function getCompareKey(line) {
    let l = line;
    if (skipFields > 0) {
      const parts = l.trim().split(/\s+/);
      l = parts.slice(skipFields).join(' ');
    }
    if (skipChars > 0) {
      l = l.slice(skipChars);
    }
    return ignoreCase ? l.toLowerCase() : l;
  }

  const groups = [];
  for (const line of rawLines) {
    const key = getCompareKey(line);
    if (groups.length === 0 || groups[groups.length - 1].key !== key) {
      groups.push({ key, line, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  }

  const outLines = [];
  for (const g of groups) {
    if (repeatedOnly && g.count <= 1) continue;
    if (uniqueOnly && g.count > 1) continue;

    if (countOnly) {
      outLines.push(`${String(g.count).padStart(7)} ${g.line}`);
    } else {
      outLines.push(g.line);
    }
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * cut: remove sections from each line of files
 */
function cutTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let delimiter = '\t';
  let fields = null;
  let chars = null;
  let onlyDelimited = false;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-d' && i + 1 < argv.length) {
      delimiter = argv[++i];
    } else if (arg.startsWith('-d')) {
      delimiter = arg.slice(2);
    } else if (arg === '-f' && i + 1 < argv.length) {
      fields = argv[++i];
    } else if (arg.startsWith('-f')) {
      fields = arg.slice(2);
    } else if (arg === '-c' && i + 1 < argv.length) {
      chars = argv[++i];
    } else if (arg.startsWith('-c')) {
      chars = arg.slice(2);
    } else if (arg === '-s' || arg === '--only-delimited') {
      onlyDelimited = true;
    } else {
      files.push(arg);
    }
  }

  function parseRange(spec) {
    const ranges = [];
    const parts = spec.split(',');
    for (const p of parts) {
      if (p.includes('-')) {
        const [startStr, endStr] = p.split('-');
        const start = startStr ? parseInt(startStr, 10) : 1;
        const end = endStr ? parseInt(endStr, 10) : Infinity;
        ranges.push({ start, end });
      } else {
        const val = parseInt(p, 10);
        ranges.push({ start: val, end: val });
      }
    }
    return ranges;
  }

  function inRange(index1Based, ranges) {
    return ranges.some((r) => index1Based >= r.start && index1Based <= r.end);
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `cut: ${err.message}\n`, code: 1 };
  }

  const fieldRanges = fields ? parseRange(fields) : null;
  const charRanges = chars ? parseRange(chars) : null;

  const outLines = [];
  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }

    for (const line of rawLines) {
      if (charRanges) {
        let selectedChars = '';
        for (let cIdx = 0; cIdx < line.length; cIdx++) {
          if (inRange(cIdx + 1, charRanges)) {
            selectedChars += line[cIdx];
          }
        }
        outLines.push(selectedChars);
      } else if (fieldRanges) {
        if (!line.includes(delimiter)) {
          if (!onlyDelimited) outLines.push(line);
          continue;
        }
        const parts = line.split(delimiter);
        const selectedParts = parts.filter((_, idx) => inRange(idx + 1, fieldRanges));
        outLines.push(selectedParts.join(delimiter));
      } else {
        outLines.push(line);
      }
    }
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * tr: translate or delete characters
 */
function trTool({ argv = [], stdin = '' }) {
  let deleteMode = false;
  let squeezeMode = false;
  let complementMode = false;
  const args = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-d' || arg === '--delete') deleteMode = true;
    else if (arg === '-s' || arg === '--squeeze-repeats') squeezeMode = true;
    else if (arg === '-c' || arg === '-C' || arg === '--complement') complementMode = true;
    else {
      args.push(arg);
    }
  }

  function expandSet(spec) {
    if (!spec) return '';
    let expanded = spec;
    // Replace POSIX character classes
    expanded = expanded.replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expanded = expanded.replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz');
    expanded = expanded.replace(/\[:digit:\]/g, '0123456789');
    expanded = expanded.replace(/\[:space:\]/g, ' \t\r\n\v\f');
    expanded = expanded.replace(/\[:alpha:\]/g, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expanded = expanded.replace(/\[:alnum:\]/g, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');

    // Handle escape characters
    expanded = expanded.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');

    // Expand ranges like a-z or 0-9
    let result = '';
    for (let i = 0; i < expanded.length; i++) {
      if (i + 2 < expanded.length && expanded[i + 1] === '-') {
        const start = expanded.charCodeAt(i);
        const end = expanded.charCodeAt(i + 2);
        if (start <= end) {
          for (let code = start; code <= end; code++) {
            result += String.fromCharCode(code);
          }
          i += 2;
          continue;
        }
      }
      result += expanded[i];
    }
    return result;
  }

  const set1 = expandSet(args[0] || '');
  const set2 = expandSet(args[1] || '');

  let out = '';
  const set1Set = new Set(set1.split(''));

  if (deleteMode) {
    for (const ch of stdin) {
      const match = set1Set.has(ch);
      const shouldDelete = complementMode ? !match : match;
      if (!shouldDelete) out += ch;
    }
  } else if (squeezeMode && args.length === 1) {
    let lastChar = null;
    for (const ch of stdin) {
      if (set1Set.has(ch) && ch === lastChar) continue;
      out += ch;
      lastChar = ch;
    }
  } else {
    // Translation mode
    const map = new Map();
    for (let i = 0; i < set1.length; i++) {
      const target = i < set2.length ? set2[i] : set2.length > 0 ? set2[set2.length - 1] : '';
      map.set(set1[i], target);
    }

    let lastChar = null;
    for (const ch of stdin) {
      let replaced = map.has(ch) ? map.get(ch) : ch;
      if (squeezeMode && set1Set.has(ch) && replaced === lastChar) {
        continue;
      }
      out += replaced;
      lastChar = replaced;
    }
  }

  return { stdout: out, stderr: '', code: 0 };
}

/**
 * tee: read from standard input and write to standard output and files
 */
function teeTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let append = false;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-a' || arg === '--append') append = true;
    else if (!arg.startsWith('-')) files.push(arg);
  }

  if (vfs) {
    for (const filename of files) {
      const resolved = vfs.normalizePath(filename, cwd);
      if (append) {
        vfs.appendFile(resolved, stdin);
      } else {
        vfs.writeFile(resolved, stdin);
      }
    }
  }

  return { stdout: stdin, stderr: '', code: 0 };
}

/**
 * base64: base64 encode/decode data and print to standard output
 */
function base64Tool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let decode = false;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-d' || arg === '-D' || arg === '--decode') decode = true;
    else if (!arg.startsWith('-')) files.push(arg);
  }

  let inputData = stdin;
  if (files.length > 0 && files[0] !== '-') {
    if (vfs) {
      try {
        const resolved = vfs.normalizePath(files[0], cwd);
        inputData = vfs.readFile(resolved);
      } catch (err) {
        return { stdout: '', stderr: `base64: ${err.message}\n`, code: 1 };
      }
    }
  }

  try {
    if (decode) {
      const decoded = base64ToUtf8(inputData);
      return { stdout: decoded, stderr: '', code: 0 };
    } else {
      const encoded = utf8ToBase64(inputData);
      return { stdout: encoded + '\n', stderr: '', code: 0 };
    }
  } catch (err) {
    return { stdout: '', stderr: `base64: error: ${err.message}\n`, code: 1 };
  }
}

/**
 * xargs: build and execute command lines from standard input
 */
function xargsTool({ argv = [], stdin = '', driver = null, env = {}, vfs = null, cwd = '/home/learner' }) {
  let maxArgs = Infinity;
  let placeholder = null;
  let nullTerminated = false;
  let noRunIfEmpty = false;
  const cmdTokens = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n' && i + 1 < argv.length) {
      maxArgs = parseInt(argv[++i], 10) || Infinity;
    } else if (arg.startsWith('-n')) {
      maxArgs = parseInt(arg.slice(2), 10) || Infinity;
    } else if (arg === '-I' && i + 1 < argv.length) {
      placeholder = argv[++i];
    } else if (arg.startsWith('-I')) {
      placeholder = arg.slice(2);
    } else if (arg === '-0' || arg === '--null') {
      nullTerminated = true;
    } else if (arg === '-r' || arg === '--no-run-if-empty') {
      noRunIfEmpty = true;
    } else {
      cmdTokens.push(arg);
    }
  }

  if (cmdTokens.length === 0) {
    cmdTokens.push('echo');
  }

  // Split stdin items
  let items = [];
  if (nullTerminated) {
    items = stdin.split('\0').map((s) => s.trim()).filter(Boolean);
  } else {
    items = stdin.trim().length > 0 ? stdin.trim().split(/\s+/) : [];
  }

  if (items.length === 0 && noRunIfEmpty) {
    return { stdout: '', stderr: '', code: 0 };
  }

  let finalStdout = '';
  let finalStderr = '';
  let lastCode = 0;

  if (placeholder) {
    // Replace placeholder once per item
    for (const item of items) {
      const replacedCmd = cmdTokens.map((t) => t.replaceAll(placeholder, item));
      const res = driver._executeCommand({
        type: 'Command',
        bin: replacedCmd[0],
        argv: replacedCmd,
        env: {},
        redirects: []
      }, { stdin: '', env, vfs, cwd });

      finalStdout += res.stdout;
      finalStderr += res.stderr;
      lastCode = res.code;
    }
  } else {
    // Batch items by maxArgs
    for (let i = 0; i < (items.length || 1); i += maxArgs) {
      const slice = items.slice(i, i + maxArgs);
      const batchCmd = [...cmdTokens, ...slice];
      const res = driver._executeCommand({
        type: 'Command',
        bin: batchCmd[0],
        argv: batchCmd,
        env: {},
        redirects: []
      }, { stdin: '', env, vfs, cwd });

      finalStdout += res.stdout;
      finalStderr += res.stderr;
      lastCode = res.code;
    }
  }

  return { stdout: finalStdout, stderr: finalStderr, code: lastCode };
}

/**
 * echo: display a line of text
 */
function echoTool({ argv = [] }) {
  let newline = true;
  let interpretEscapes = false;
  const words = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n' && words.length === 0) newline = false;
    else if (arg === '-e' && words.length === 0) interpretEscapes = true;
    else if (arg === '-ne' && words.length === 0) { newline = false; interpretEscapes = true; }
    else words.push(arg);
  }

  let out = words.join(' ');
  if (interpretEscapes) {
    out = out
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\');
  }

  if (newline) out += '\n';
  return { stdout: out, stderr: '', code: 0 };
}

/**
 * cat: concatenate files and print on standard output
 */
function catTool({ argv = [], stdin = '', vfs = null, cwd = '/home/learner' }) {
  let numberLines = false;
  let numberNonBlank = false;
  let squeezeBlank = false;
  const files = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-n') numberLines = true;
    else if (arg === '-b') numberNonBlank = true;
    else if (arg === '-s') squeezeBlank = true;
    else files.push(arg);
  }

  let inputs;
  try {
    inputs = readFilesOrStdin(files, stdin, vfs, cwd);
  } catch (err) {
    return { stdout: '', stderr: `cat: ${err.message}\n`, code: 1 };
  }

  let lineCounter = 1;
  const outLines = [];

  for (const item of inputs) {
    const rawLines = item.content.split('\n');
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '' && item.content.endsWith('\n')) {
      rawLines.pop();
    }

    let prevBlank = false;
    for (const line of rawLines) {
      const isBlank = line.trim() === '';
      if (squeezeBlank && isBlank && prevBlank) continue;
      prevBlank = isBlank;

      if (numberNonBlank) {
        if (!isBlank) {
          outLines.push(`${String(lineCounter++).padStart(6)}\t${line}`);
        } else {
          outLines.push('');
        }
      } else if (numberLines) {
        outLines.push(`${String(lineCounter++).padStart(6)}\t${line}`);
      } else {
        outLines.push(line);
      }
    }
  }

  const stdout = outLines.length > 0 ? outLines.join('\n') + '\n' : '';
  return { stdout, stderr: '', code: 0 };
}

/**
 * seq: print a sequence of numbers
 */
function seqTool({ argv = [] }) {
  const nums = argv.slice(1).map((s) => parseFloat(s)).filter((n) => !isNaN(n));
  let start = 1;
  let step = 1;
  let end = 1;

  if (nums.length === 1) {
    end = nums[0];
  } else if (nums.length === 2) {
    start = nums[0];
    end = nums[1];
  } else if (nums.length >= 3) {
    start = nums[0];
    step = nums[1];
    end = nums[2];
  }

  const res = [];
  if (step > 0) {
    for (let i = start; i <= end; i += step) res.push(i);
  } else if (step < 0) {
    for (let i = start; i >= end; i += step) res.push(i);
  }

  return { stdout: res.length > 0 ? res.join('\n') + '\n' : '', stderr: '', code: 0 };
}

/**
 * Common simple POSIX built-ins
 */
function trueTool() {
  return { stdout: '', stderr: '', code: 0 };
}

function falseTool() {
  return { stdout: '', stderr: '', code: 1 };
}

function pwdTool({ cwd = '/home/learner' }) {
  return { stdout: cwd + '\n', stderr: '', code: 0 };
}

function dirnameTool({ argv = [] }) {
  const p = argv[1] || '.';
  const normalized = p.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return { stdout: '.\n', stderr: '', code: 0 };
  if (lastSlash === 0) return { stdout: '/\n', stderr: '', code: 0 };
  return { stdout: normalized.slice(0, lastSlash) + '\n', stderr: '', code: 0 };
}

function basenameTool({ argv = [] }) {
  const p = argv[1] || '';
  const suffix = argv[2] || '';
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  let name = lastSlash !== -1 ? normalized.slice(lastSlash + 1) : normalized;
  if (suffix && name.endsWith(suffix)) {
    name = name.slice(0, -suffix.length);
  }
  return { stdout: (name || '/') + '\n', stderr: '', code: 0 };
}

function envTool({ env = {} }) {
  const lines = Object.entries(env)
    .filter(([k]) => k !== '?' && k !== '$')
    .map(([k, v]) => `${k}=${v}`);
  return { stdout: lines.length > 0 ? lines.join('\n') + '\n' : '', stderr: '', code: 0 };
}

// ---------------------------------------------------------------------------
// Virtual PTY Stream & Terminal Screen Buffer
// ---------------------------------------------------------------------------

class VirtualPTY {
  constructor(options = {}) {
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.maxHistory = options.maxHistory || 1000;
    this.rawMode = Boolean(options.rawMode);

    this.cursorX = 0;
    this.cursorY = 0;
    this.history = [];
    this.screen = this._createBlankScreen();
    this.styles = this._createBlankStyles();

    this.inputBuffer = '';
    this.dataListeners = new Set();
    this.lineListeners = new Set();
  }

  _createBlankScreen() {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      grid.push(new Array(this.cols).fill(' '));
    }
    return grid;
  }

  _createBlankStyles() {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      grid.push(new Array(this.cols).fill(''));
    }
    return grid;
  }

  _scroll() {
    // Top line moves to history
    const topLine = this.screen[0].join('').trimEnd();
    this.history.push(topLine);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.screen.shift();
    this.screen.push(new Array(this.cols).fill(' '));

    this.styles.shift();
    this.styles.push(new Array(this.cols).fill(''));

    this.cursorY = Math.max(0, this.rows - 1);
  }

  write(text) {
    if (typeof text !== 'string' || text.length === 0) return;

    let i = 0;
    let currentStyle = '';

    while (i < text.length) {
      const ch = text[i];

      // Handle ANSI Escape Sequences \x1b[ ...
      if (ch === '\x1b' && text[i + 1] === '[') {
        const csiStart = i + 2;
        let csiEnd = csiStart;
        while (csiEnd < text.length && !/[a-zA-Z]/.test(text[csiEnd])) {
          csiEnd++;
        }
        if (csiEnd < text.length) {
          const params = text.slice(csiStart, csiEnd);
          const command = text[csiEnd];
          this._handleCSI(params, command);
          i = csiEnd + 1;
          continue;
        }
      }

      // Handle control characters
      if (ch === '\r') {
        this.cursorX = 0;
        i++;
        continue;
      }
      if (ch === '\n') {
        this.cursorY++;
        if (this.cursorY >= this.rows) {
          this._scroll();
        }
        i++;
        continue;
      }
      if (ch === '\b' || ch === '\x7f') {
        this.cursorX = Math.max(0, this.cursorX - 1);
        if (this.screen[this.cursorY]) {
          this.screen[this.cursorY][this.cursorX] = ' ';
        }
        i++;
        continue;
      }
      if (ch === '\t') {
        this.cursorX = Math.min(this.cols - 1, (Math.floor(this.cursorX / 8) + 1) * 8);
        i++;
        continue;
      }

      // Normal printable character
      if (this.cursorY >= this.rows) {
        this._scroll();
      }
      if (this.cursorX >= this.cols) {
        this.cursorX = 0;
        this.cursorY++;
        if (this.cursorY >= this.rows) {
          this._scroll();
        }
      }

      if (this.screen[this.cursorY]) {
        this.screen[this.cursorY][this.cursorX] = ch;
        this.styles[this.cursorY][this.cursorX] = currentStyle;
      }
      this.cursorX++;
      i++;
    }
  }

  _handleCSI(params, command) {
    const parts = params ? params.split(';').map((p) => parseInt(p, 10) || 0) : [0];

    switch (command) {
      case 'm': // SGR Color & Styling
        // Styles are tracked or stripped for render
        break;
      case 'H':
      case 'f': { // Cursor position \x1b[row;colH (1-based)
        const r = (parts[0] || 1) - 1;
        const c = (parts[1] || 1) - 1;
        this.cursorY = Math.max(0, Math.min(this.rows - 1, r));
        this.cursorX = Math.max(0, Math.min(this.cols - 1, c));
        break;
      }
      case 'A': { // Cursor Up
        const count = parts[0] || 1;
        this.cursorY = Math.max(0, this.cursorY - count);
        break;
      }
      case 'B': { // Cursor Down
        const count = parts[0] || 1;
        this.cursorY = Math.min(this.rows - 1, this.cursorY + count);
        break;
      }
      case 'C': { // Cursor Forward
        const count = parts[0] || 1;
        this.cursorX = Math.min(this.cols - 1, this.cursorX + count);
        break;
      }
      case 'D': { // Cursor Backward
        const count = parts[0] || 1;
        this.cursorX = Math.max(0, this.cursorX - count);
        break;
      }
      case 'J': { // Erase in Display
        const mode = parts[0] || 0;
        if (mode === 2) {
          this.screen = this._createBlankScreen();
          this.cursorX = 0;
          this.cursorY = 0;
        } else if (mode === 0) {
          // Cursor to end
          for (let c = this.cursorX; c < this.cols; c++) this.screen[this.cursorY][c] = ' ';
          for (let r = this.cursorY + 1; r < this.rows; r++) {
            this.screen[r].fill(' ');
          }
        }
        break;
      }
      case 'K': { // Erase in Line
        const mode = parts[0] || 0;
        if (mode === 2) {
          this.screen[this.cursorY].fill(' ');
        } else if (mode === 0) {
          for (let c = this.cursorX; c < this.cols; c++) this.screen[this.cursorY][c] = ' ';
        } else if (mode === 1) {
          for (let c = 0; c <= this.cursorX; c++) this.screen[this.cursorY][c] = ' ';
        }
        break;
      }
      default:
        break;
    }
  }

  writeln(text) {
    this.write(text + '\r\n');
  }

  sendInput(data) {
    if (this.rawMode) {
      for (const listener of this.dataListeners) listener(data);
      return;
    }

    // Canonical mode line buffering
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '\r' || ch === '\n') {
        const line = this.inputBuffer;
        this.inputBuffer = '';
        this.writeln('');
        for (const listener of this.lineListeners) listener(line);
      } else if (ch === '\b' || ch === '\x7f') {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.write('\b \b');
        }
      } else {
        this.inputBuffer += ch;
        this.write(ch);
      }
    }
  }

  onData(cb) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  onLine(cb) {
    this.lineListeners.add(cb);
    return () => this.lineListeners.delete(cb);
  }

  render() {
    return this.screen.map((row) => row.join('').trimEnd()).join('\n');
  }

  getLines() {
    return this.screen.map((row) => row.join('').trimEnd());
  }

  getPlainText() {
    return stripAnsi(this.render());
  }

  clear() {
    this.screen = this._createBlankScreen();
    this.styles = this._createBlankStyles();
    this.cursorX = 0;
    this.cursorY = 0;
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.clear();
  }

  static stripAnsi(text) {
    return stripAnsi(text);
  }
}

// ---------------------------------------------------------------------------
// Pipeline Driver & Execution Engine
// ---------------------------------------------------------------------------

class PipelineDriver {
  constructor(options = {}) {
    this.vfs = options.vfs || (VirtualFileSystem ? new VirtualFileSystem() : null);
    this.env = {
      PATH: '/bin:/usr/bin:/usr/local/bin',
      HOME: '/home/learner',
      USER: 'learner',
      SHELL: '/bin/bash',
      '?': '0',
      '$': '1000',
      ...(options.env || {})
    };
    this.cwd = options.cwd || '/home/learner';
    this.pty = options.pty || new VirtualPTY();
    this.commands = new Map();

    this._registerBuiltins();
  }

  _registerBuiltins() {
    this.registerCommand('grep', grepTool);
    this.registerCommand('awk', awkTool);
    this.registerCommand('sed', sedTool);
    this.registerCommand('head', headTool);
    this.registerCommand('tail', tailTool);
    this.registerCommand('wc', wcTool);
    this.registerCommand('sort', sortTool);
    this.registerCommand('uniq', uniqTool);
    this.registerCommand('cut', cutTool);
    this.registerCommand('tr', trTool);
    this.registerCommand('tee', teeTool);
    this.registerCommand('base64', base64Tool);
    this.registerCommand('xargs', xargsTool);
    this.registerCommand('echo', echoTool);
    this.registerCommand('cat', catTool);
    this.registerCommand('seq', seqTool);
    this.registerCommand('true', trueTool);
    this.registerCommand('false', falseTool);
    this.registerCommand('pwd', pwdTool);
    this.registerCommand('dirname', dirnameTool);
    this.registerCommand('basename', basenameTool);
    this.registerCommand('env', envTool);
  }

  registerCommand(name, handler) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Command name must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Handler for command '${name}' must be a function`);
    }
    this.commands.set(name.trim(), handler);
  }

  hasCommand(name) {
    return this.commands.has(name);
  }

  getCommand(name) {
    return this.commands.get(name);
  }

  /**
   * Main entrypoint to execute a shell command or parsed AST
   * @param {string|object} input Raw shell string or parsed AST
   * @param {object} context Execution context overrides
   * @returns {{ stdout: string, stderr: string, code: number }}
   */
  execute(input, context = {}) {
    let ast = input;
    const currentEnv = { ...this.env, ...(context.env || {}) };
    const currentCwd = context.cwd || this.cwd;
    const currentVfs = context.vfs || this.vfs;

    if (typeof input === 'string') {
      if (!input.trim()) {
        return { stdout: '', stderr: '', code: 0 };
      }
      const tokens = shellParser.tokenize ? shellParser.tokenize(input, currentEnv) : input.trim().split(/\s+/);
      ast = shellParser.parseAST ? shellParser.parseAST(tokens) : { type: 'Command', bin: tokens[0], argv: tokens, env: {}, redirects: [] };
    }

    if (!ast) {
      return { stdout: '', stderr: '', code: 0 };
    }

    const result = this._executeNode(ast, {
      stdin: context.stdin || '',
      env: currentEnv,
      cwd: currentCwd,
      vfs: currentVfs
    });

    this.env['?'] = String(result.code);
    return result;
  }

  _executeNode(node, context) {
    if (!node) return { stdout: '', stderr: '', code: 0 };

    switch (node.type) {
      case 'Block':
        return this._executeBlock(node, context);
      case 'BinaryOp':
        return this._executeBinaryOp(node, context);
      case 'Pipeline':
        return this._executePipeline(node, context);
      case 'Command':
        return this._executeCommand(node, context);
      default:
        return { stdout: '', stderr: `Unknown AST node type: ${node.type}\n`, code: 127 };
    }
  }

  _executeBlock(blockNode, context) {
    let lastResult = { stdout: '', stderr: '', code: 0 };
    for (const stmt of blockNode.statements) {
      lastResult = this._executeNode(stmt, context);
      this.env['?'] = String(lastResult.code);
      context.env['?'] = String(lastResult.code);
    }
    return lastResult;
  }

  _executeBinaryOp(binNode, context) {
    const leftRes = this._executeNode(binNode.left, context);
    this.env['?'] = String(leftRes.code);
    context.env['?'] = String(leftRes.code);

    if (binNode.operator === '&&') {
      if (leftRes.code === 0) {
        const rightRes = this._executeNode(binNode.right, context);
        return {
          stdout: leftRes.stdout + rightRes.stdout,
          stderr: leftRes.stderr + rightRes.stderr,
          code: rightRes.code
        };
      }
      return leftRes;
    }

    if (binNode.operator === '||') {
      if (leftRes.code !== 0) {
        const rightRes = this._executeNode(binNode.right, context);
        return {
          stdout: leftRes.stdout + rightRes.stdout,
          stderr: leftRes.stderr + rightRes.stderr,
          code: rightRes.code
        };
      }
      return leftRes;
    }

    return leftRes;
  }

  _executePipeline(pipelineNode, context) {
    const commands = pipelineNode.commands;
    if (!commands || commands.length === 0) {
      return { stdout: '', stderr: '', code: 0 };
    }

    let currentStdin = context.stdin || '';
    let aggregatedStderr = '';
    let lastCode = 0;
    let lastStdout = '';

    for (let i = 0; i < commands.length; i++) {
      const cmdNode = commands[i];
      const cmdResult = this._executeCommand(cmdNode, {
        ...context,
        stdin: currentStdin
      });

      currentStdin = cmdResult.stdout;
      lastStdout = cmdResult.stdout;
      aggregatedStderr += cmdResult.stderr;
      lastCode = cmdResult.code;

      // Update $? for each stage in pipeline
      this.env['?'] = String(lastCode);
      context.env['?'] = String(lastCode);
    }

    return {
      stdout: lastStdout,
      stderr: aggregatedStderr,
      code: lastCode
    };
  }

  _executeCommand(cmdNode, context) {
    const cmdEnv = { ...context.env, ...(cmdNode.env || {}) };
    let stdin = context.stdin || '';
    const vfs = context.vfs || this.vfs;
    const cwd = context.cwd || this.cwd;

    // Evaluate input redirection '<' before command execution
    if (cmdNode.redirects && cmdNode.redirects.length > 0) {
      for (const redir of cmdNode.redirects) {
        if (redir.type === 'stdin') {
          if (vfs) {
            try {
              const targetPath = vfs.normalizePath(redir.target, cwd);
              stdin = vfs.readFile(targetPath);
            } catch (err) {
              return { stdout: '', stderr: `bash: ${redir.target}: No such file or directory\n`, code: 1 };
            }
          }
        }
      }
    }

    const binName = cmdNode.bin;
    if (!binName) {
      return { stdout: '', stderr: '', code: 0 };
    }

    let result = null;
    const handler = this.commands.get(binName);

    if (handler) {
      try {
        result = handler({
          argv: cmdNode.argv,
          stdin,
          env: cmdEnv,
          vfs,
          cwd,
          pty: this.pty,
          driver: this
        });
      } catch (err) {
        result = { stdout: '', stderr: `${binName}: ${err.message}\n`, code: 1 };
      }
    } else {
      result = { stdout: '', stderr: `bash: ${binName}: command not found\n`, code: 127 };
    }

    // Process output redirections on result: '>', '>>', '2>', '2>>', '&>', '2>&1'
    if (cmdNode.redirects && cmdNode.redirects.length > 0) {
      let finalStdout = result.stdout;
      let finalStderr = result.stderr;

      for (const redir of cmdNode.redirects) {
        if (redir.type === 'stderr_to_stdout') {
          finalStdout += finalStderr;
          finalStderr = '';
        } else if (redir.type === 'stdout') {
          if (vfs) {
            const targetPath = vfs.normalizePath(redir.target, cwd);
            if (redir.mode === 'append') {
              vfs.appendFile(targetPath, finalStdout);
            } else {
              vfs.writeFile(targetPath, finalStdout);
            }
          }
          finalStdout = '';
        } else if (redir.type === 'stderr') {
          if (vfs) {
            const targetPath = vfs.normalizePath(redir.target, cwd);
            if (redir.mode === 'append') {
              vfs.appendFile(targetPath, finalStderr);
            } else {
              vfs.writeFile(targetPath, finalStderr);
            }
          }
          finalStderr = '';
        } else if (redir.type === 'all') {
          const combined = finalStdout + finalStderr;
          if (vfs) {
            const targetPath = vfs.normalizePath(redir.target, cwd);
            if (redir.mode === 'append') {
              vfs.appendFile(targetPath, combined);
            } else {
              vfs.writeFile(targetPath, combined);
            }
          }
          finalStdout = '';
          finalStderr = '';
        }
      }

      return {
        stdout: finalStdout,
        stderr: finalStderr,
        code: result.code
      };
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Isomorphic Module Exports
// ---------------------------------------------------------------------------

const posixTools = {
  grep: grepTool,
  awk: awkTool,
  sed: sedTool,
  head: headTool,
  tail: tailTool,
  wc: wcTool,
  sort: sortTool,
  uniq: uniqTool,
  cut: cutTool,
  tr: trTool,
  tee: teeTool,
  base64: base64Tool,
  xargs: xargsTool,
  echo: echoTool,
  cat: catTool,
  seq: seqTool,
  true: trueTool,
  false: falseTool,
  pwd: pwdTool,
  dirname: dirnameTool,
  basename: basenameTool,
  env: envTool
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PipelineDriver,
    VirtualPTY,
    stripAnsi,
    utf8ToBase64,
    base64ToUtf8,
    posixTools
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.PipelineDriver = PipelineDriver;
  globalThis.VirtualPTY = VirtualPTY;
  globalThis.stripAnsi = stripAnsi;
  globalThis.posixTools = posixTools;
}

