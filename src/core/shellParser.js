'use strict';

/**
 * KubeLabs v3.0 - Unified Isomorphic POSIX Lexer, Shell AST Parser & Flag Engine
 * Pure ES2024 module with zero external dependencies.
 * Runs identically in Node.js 22+, Web Workers, and WebViews.
 */

// Helper: Expands environment variables inside a string
function expandEnvVars(text, env = {}) {
  if (typeof text !== 'string') return '';

  return text.replace(/\$(?:\{([a-zA-Z_][a-zA-Z0-9_]*)(?::-([^}]+))?\}|([a-zA-Z_][a-zA-Z0-9_]*)|(\?|\$))/g, (match, bracedVar, defaultVal, bareVar, special) => {
    if (special === '?') {
      return env['?'] !== undefined ? String(env['?']) : '0';
    }
    if (special === '$') {
      return env['$'] !== undefined ? String(env['$']) : '1000';
    }
    const varName = bracedVar || bareVar;
    if (varName in env && env[varName] !== undefined && env[varName] !== null) {
      return String(env[varName]);
    }
    return defaultVal !== undefined ? defaultVal : '';
  });
}

/**
 * POSIX Shell Lexer / Tokenizer
 * Tokenizes raw command string respecting quotes, escapes, subshells, and operators.
 * @param {string} cmdString 
 * @param {object} env Environment variables for interpolation
 * @returns {Array<string>} Tokens
 */
function tokenize(cmdString, env = {}) {
  if (!cmdString || typeof cmdString !== 'string') return [];
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inAnsi = false;
  let inSubshell = false;
  let subshellDepth = 0;

  for (let i = 0; i < cmdString.length; i++) {
    const ch = cmdString[i];
    const next = cmdString[i + 1];

    // Handle escape \
    if (ch === '\\' && !inSingle) {
      if (i + 1 < cmdString.length) {
        const escaped = cmdString[++i];
        if (escaped === 'n') current += '\n';
        else if (escaped === 't') current += '\t';
        else if (escaped === 'r') current += '\r';
        else current += escaped;
        continue;
      }
    }

    // Handle ANSI C quotes: $'...'
    if (ch === '$' && next === "'" && !inSingle && !inDouble && !inAnsi) {
      inAnsi = true;
      i++;
      continue;
    }
    if (inAnsi) {
      if (ch === "'") {
        inAnsi = false;
      } else if (ch === '\\' && next) {
        const esc = cmdString[++i];
        if (esc === 'n') current += '\n';
        else if (esc === 't') current += '\t';
        else if (esc === 'r') current += '\r';
        else current += esc;
      } else {
        current += ch;
      }
      continue;
    }

    // Single quotes: '...' (literal, no variable expansion)
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    // Double quotes: "..." (variable expansion & escapes)
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    // Subshell: $( ... )
    if (ch === '$' && next === '(' && !inSingle) {
      inSubshell = true;
      subshellDepth = 1;
      current += '$(';
      i++;
      continue;
    }
    if (inSubshell) {
      current += ch;
      if (ch === '(') subshellDepth++;
      else if (ch === ')') {
        subshellDepth--;
        if (subshellDepth === 0) {
          inSubshell = false;
        }
      }
      continue;
    }

    // Variable expansion outside single quotes: $VAR, ${VAR}, ${VAR:-def}, $?, $$
    if (ch === '$' && !inSingle && !inAnsi) {
      if (next === '{') {
        const closeBrace = cmdString.indexOf('}', i + 2);
        if (closeBrace !== -1) {
          const inner = cmdString.slice(i + 2, closeBrace);
          i = closeBrace;
          const colonDash = inner.indexOf(':-');
          if (colonDash !== -1) {
            const vName = inner.slice(0, colonDash);
            const defVal = inner.slice(colonDash + 2);
            const val = (vName in env && env[vName] !== undefined && env[vName] !== null) ? String(env[vName]) : defVal;
            current += val;
          } else {
            const val = (inner in env && env[inner] !== undefined && env[inner] !== null) ? String(env[inner]) : '';
            current += val;
          }
          continue;
        }
      } else if (next === '?' || next === '$') {
        const special = next;
        i++;
        if (special === '?') {
          current += env['?'] !== undefined ? String(env['?']) : '0';
        } else {
          current += env['$'] !== undefined ? String(env['$']) : '1000';
        }
        continue;
      } else if (next && /[a-zA-Z_]/.test(next)) {
        let vName = '';
        let j = i + 1;
        while (j < cmdString.length && /[a-zA-Z0-9_]/.test(cmdString[j])) {
          vName += cmdString[j];
          j++;
        }
        i = j - 1;
        const val = (vName in env && env[vName] !== undefined && env[vName] !== null) ? String(env[vName]) : '';
        current += val;
        continue;
      }
    }

    // Operators outside quotes: |, &&, ||, ;, >, >>, <, 2>, 2>&1, &>
    if (!inSingle && !inDouble) {
      // 2>&1
      if (ch === '2' && next === '>' && cmdString.slice(i, i + 4) === '2>&1') {
        if (current) { tokens.push(current); current = ''; }
        tokens.push('2>&1');
        i += 3;
        continue;
      }

      // 2>
      if (ch === '2' && next === '>') {
        if (current) { tokens.push(current); current = ''; }
        tokens.push('2>');
        i++;
        continue;
      }

      // &>
      if (ch === '&' && next === '>') {
        if (current) { tokens.push(current); current = ''; }
        tokens.push('&>');
        i++;
        continue;
      }

      // >>
      if (ch === '>' && next === '>') {
        if (current) { tokens.push(current); current = ''; }
        tokens.push('>>');
        i++;
        continue;
      }

      // &&, ||
      if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
        if (current) { tokens.push(current); current = ''; }
        tokens.push(ch + next);
        i++;
        continue;
      }

      // Single char operators: |, ;, >, <, &
      if (ch === '|' || ch === ';' || ch === '>' || ch === '<' || ch === '&') {
        if (current) { tokens.push(current); current = ''; }
        tokens.push(ch);
        continue;
      }

      // Whitespace
      if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
    }

    // Normal character accumulation
    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Shell AST Parser
 * Converts stream of tokens into an Abstract Syntax Tree (AST)
 */
function parseAST(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;

  // Split by statement delimiters: ';' and '&'
  const statementChunks = [];
  let currentChunk = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === ';' || t === '&') {
      if (currentChunk.length > 0) {
        statementChunks.push({ tokens: currentChunk, sep: t });
        currentChunk = [];
      }
    } else {
      currentChunk.push(t);
    }
  }
  if (currentChunk.length > 0) {
    statementChunks.push({ tokens: currentChunk, sep: ';' });
  }

  // Build binary/pipeline trees
  const parsedStatements = statementChunks.map((chunk) => parseBinaryExpression(chunk.tokens));
  if (parsedStatements.length === 1) return parsedStatements[0];

  return {
    type: 'Block',
    statements: parsedStatements
  };
}

function parseBinaryExpression(tokens) {
  // Find top-level && or ||
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '&&' || t === '||') {
      const leftTokens = tokens.slice(0, i);
      const rightTokens = tokens.slice(i + 1);
      return {
        type: 'BinaryOp',
        operator: t,
        left: parseBinaryExpression(leftTokens),
        right: parseBinaryExpression(rightTokens)
      };
    }
  }

  // If no && or ||, parse pipeline
  return parsePipeline(tokens);
}

function parsePipeline(tokens) {
  const commands = [];
  let currentCmdTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '|') {
      if (currentCmdTokens.length > 0) {
        commands.push(parseCommandNode(currentCmdTokens));
        currentCmdTokens = [];
      }
    } else {
      currentCmdTokens.push(t);
    }
  }
  if (currentCmdTokens.length > 0) {
    commands.push(parseCommandNode(currentCmdTokens));
  }

  if (commands.length === 1) return commands[0];

  return {
    type: 'Pipeline',
    commands
  };
}

function parseCommandNode(tokens) {
  const env = {};
  const argv = [];
  const redirects = [];
  let i = 0;

  // Leading environment assignments e.g. KUBECONFIG=/path app=test cmd
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.includes('=') && !t.startsWith('-') && !t.startsWith('>')) {
      const eqIdx = t.indexOf('=');
      const k = t.slice(0, eqIdx);
      const v = t.slice(eqIdx + 1);
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) {
        env[k] = v;
        i++;
        continue;
      }
    }
    break;
  }

  // Process command argv and redirects
  while (i < tokens.length) {
    const t = tokens[i];

    if (t === '>' || t === '1>') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'stdout', mode: 'overwrite', target });
    } else if (t === '>>' || t === '1>>') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'stdout', mode: 'append', target });
    } else if (t === '<') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'stdin', mode: 'read', target });
    } else if (t === '2>') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'stderr', mode: 'overwrite', target });
    } else if (t === '2>>') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'stderr', mode: 'append', target });
    } else if (t === '&>' || t === '>&') {
      const target = tokens[++i] || '';
      redirects.push({ type: 'all', mode: 'overwrite', target });
    } else if (t === '2>&1') {
      redirects.push({ type: 'stderr_to_stdout' });
    } else {
      argv.push(t);
    }
    i++;
  }

  return {
    type: 'Command',
    bin: argv[0] || '',
    argv,
    env,
    redirects
  };
}

/**
 * Production-Grade GNU Flag & Argument Parser
 * Parses long flags (--name, --name=val), short flags (-n val, -it, -v -v), and positionals.
 * @param {Array<string>} argv 
 * @returns {{ flags: object, positional: Array<string>, raw: Array<string> }}
 */
function parseFlags(argv) {
  if (!Array.isArray(argv)) return { flags: {}, positional: [], raw: [] };

  const flags = {};
  const positional = [];
  let stopFlags = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (stopFlags) {
      positional.push(arg);
      continue;
    }

    if (arg === '--') {
      stopFlags = true;
      continue;
    }

    // Long flag: --flag or --flag=val
    if (arg.startsWith('--') && arg.length > 2) {
      const body = arg.slice(2);
      const eqIdx = body.indexOf('=');

      if (eqIdx !== -1) {
        const k = body.slice(0, eqIdx);
        const v = body.slice(eqIdx + 1);
        flags[k] = coerceValue(v);
      } else {
        // Look ahead for value if next arg doesn't start with -
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[body] = coerceValue(next);
          i++;
        } else {
          // Boolean flag
          flags[body] = true;
        }
      }
      continue;
    }

    // Short flag: -f, -f=val, or combined -it
    if (arg.startsWith('-') && arg.length > 1 && !/^-\d+$/.test(arg)) {
      const body = arg.slice(1);
      const eqIdx = body.indexOf('=');

      if (eqIdx !== -1) {
        const k = body.slice(0, eqIdx);
        const v = body.slice(eqIdx + 1);
        flags[k] = coerceValue(v);
      } else if (body.length === 1) {
        // Single char short flag: check lookahead
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[body] = coerceValue(next);
          i++;
        } else {
          if (flags[body] && typeof flags[body] === 'number') {
            flags[body]++;
          } else if (flags[body] === true) {
            flags[body] = 2;
          } else {
            flags[body] = true;
          }
        }
      } else {
        // Combined short flags: -it -> { i: true, t: true }
        for (const ch of body) {
          flags[ch] = true;
        }
      }
      continue;
    }

    positional.push(arg);
  }

  return {
    flags,
    positional,
    raw: argv
  };
}

function coerceValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  return val;
}

// Dual CommonJS & Browser export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tokenize,
    parseAST,
    parseFlags,
    expandEnvVars
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.tokenize = tokenize;
  globalThis.parseAST = parseAST;
  globalThis.parseFlags = parseFlags;
  globalThis.expandEnvVars = expandEnvVars;
}
