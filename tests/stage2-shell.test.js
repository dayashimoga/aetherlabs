'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  tokenize,
  parseAST,
  parseFlags,
  expandEnvVars
} = require('../src/core/shellParser');

test('Subphase 2.1.1: expandEnvVars handles bare, braced, defaults, and special variables', () => {
  const env = {
    USER: 'learner',
    APP: 'web-api',
    '?': '0',
    '$': '4242'
  };

  assert.equal(expandEnvVars('Hello $USER', env), 'Hello learner');
  assert.equal(expandEnvVars('Deploy ${APP}-v1', env), 'Deploy web-api-v1');
  assert.equal(expandEnvVars('Namespace: ${NAMESPACE:-default}', env), 'Namespace: default');
  assert.equal(expandEnvVars('Namespace: ${APP:-default}', env), 'Namespace: web-api');
  assert.equal(expandEnvVars('Status: $?, PID: $$', env), 'Status: 0, PID: 4242');
});

test('Subphase 2.1.1: tokenize handles single quotes, double quotes, ANSI C, subshells, and escapes', () => {
  const env = { TARGET: 'production' };

  // Single quotes: no expansion
  const t1 = tokenize("kubectl get pods -l 'app=$TARGET'", env);
  assert.deepEqual(t1, ['kubectl', 'get', 'pods', '-l', 'app=$TARGET']);

  // Double quotes: expands variables
  const t2 = tokenize('kubectl get pods -n "$TARGET"', env);
  assert.deepEqual(t2, ['kubectl', 'get', 'pods', '-n', 'production']);

  // ANSI C quoting and escape sequences
  const t3 = tokenize("echo $'line1\\nline2'");
  assert.deepEqual(t3, ['echo', 'line1\nline2']);

  // Subshell $(...)
  const t4 = tokenize('kubectl describe pod $(kubectl get pods -o jsonpath={.items[0].metadata.name})');
  assert.equal(t4[0], 'kubectl');
  assert.equal(t4[1], 'describe');
  assert.equal(t4[2], 'pod');
  assert.equal(t4[3], '$(kubectl get pods -o jsonpath={.items[0].metadata.name})');
});

test('Subphase 2.1.1: parseAST generates Command, Pipeline, BinaryOp, and Redirection nodes', () => {
  // Simple command with leading env and output redirection
  const tokens1 = tokenize('KUBECONFIG=/root/admin.conf kubectl get nodes > /tmp/nodes.txt');
  const ast1 = parseAST(tokens1);

  assert.equal(ast1.type, 'Command');
  assert.deepEqual(ast1.env, { KUBECONFIG: '/root/admin.conf' });
  assert.deepEqual(ast1.argv, ['kubectl', 'get', 'nodes']);
  assert.deepEqual(ast1.redirects, [{ type: 'stdout', mode: 'overwrite', target: '/tmp/nodes.txt' }]);

  // Pipeline: cmd1 | cmd2 | cmd3
  const tokens2 = tokenize('kubectl get pods | grep Running | wc -l');
  const ast2 = parseAST(tokens2);

  assert.equal(ast2.type, 'Pipeline');
  assert.equal(ast2.commands.length, 3);
  assert.equal(ast2.commands[0].bin, 'kubectl');
  assert.equal(ast2.commands[1].bin, 'grep');
  assert.equal(ast2.commands[2].bin, 'wc');

  // BinaryOp: cmd1 && cmd2 || cmd3
  const tokens3 = tokenize('terraform apply -auto-approve && kubectl get pods');
  const ast3 = parseAST(tokens3);

  assert.equal(ast3.type, 'BinaryOp');
  assert.equal(ast3.operator, '&&');
  assert.equal(ast3.left.bin, 'terraform');
  assert.equal(ast3.right.bin, 'kubectl');

  // Redirection: append >> and stderr_to_stdout 2>&1
  const tokens4 = tokenize('app >> /var/log/app.log 2>&1');
  const ast4 = parseAST(tokens4);
  assert.equal(ast4.redirects.length, 2);
  assert.equal(ast4.redirects[0].mode, 'append');
  assert.equal(ast4.redirects[1].type, 'stderr_to_stdout');
});

test('Subphase 2.1.1: parseFlags parses long flags, short flags, combined flags, and coercion', () => {
  const argv = [
    'kubectl',
    'run',
    'web',
    '--image=nginx:1.27',
    '-n',
    'production',
    '--replicas',
    '3',
    '-it',
    '-v',
    '-v',
    '--privileged=false',
    '--',
    'arg1',
    '--not-a-flag'
  ];

  const parsed = parseFlags(argv);

  assert.equal(parsed.flags.image, 'nginx:1.27');
  assert.equal(parsed.flags.n, 'production');
  assert.equal(parsed.flags.replicas, 3);
  assert.equal(parsed.flags.i, true);
  assert.equal(parsed.flags.t, true);
  assert.equal(parsed.flags.v, 2); // Repeated flag counts
  assert.equal(parsed.flags.privileged, false);

  // Positionals (including post -- items)
  assert.deepEqual(parsed.positional, ['kubectl', 'run', 'web', 'arg1', '--not-a-flag']);
});
