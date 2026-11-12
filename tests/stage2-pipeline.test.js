'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PipelineDriver, VirtualPTY, stripAnsi, utf8ToBase64, base64ToUtf8 } = require('../src/core/pipelineDriver');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');

test('Subphase 2.1.2: Streaming pipeline connects stdout to stdin across grep, awk, and sed without disk writes', () => {
  const driver = new PipelineDriver();

  const podList = [
    'NAME               READY   STATUS             RESTARTS   AGE',
    'auth-service-0     1/1     Running            0          2d',
    'payment-api-7b8c   0/1     CrashLoopBackOff   12         1h',
    'web-frontend-9f1   1/1     Running            1          5d',
    'cache-redis-0      1/1     Running            0          10d'
  ].join('\n');

  // Test 1: grep Running | awk '{print $1, $4}'
  const p1 = driver.execute(`echo "${podList}" | grep Running | awk '{print $1, $4}'`);
  assert.equal(p1.code, 0);
  assert.equal(p1.stderr, '');
  const p1Lines = p1.stdout.trim().split('\n');
  assert.deepEqual(p1Lines, [
    'auth-service-0 0',
    'web-frontend-9f1 1',
    'cache-redis-0 0'
  ]);

  // Test 2: grep invert (-v) and line counting (-c)
  const p2 = driver.execute(`echo "${podList}" | grep -v CrashLoopBackOff | grep -c Running`);
  assert.equal(p2.code, 0);
  assert.equal(p2.stdout.trim(), '3');

  // Test 3: sed global replacement and deletion
  const p3 = driver.execute('echo "foo bar foo" | sed "s/foo/baz/g"');
  assert.equal(p3.code, 0);
  assert.equal(p3.stdout.trim(), 'baz bar baz');

  const p4 = driver.execute(`echo "${podList}" | sed "1d" | grep CrashLoopBackOff | awk '{print $1}'`);
  assert.equal(p4.code, 0);
  assert.equal(p4.stdout.trim(), 'payment-api-7b8c');
});

test('Subphase 2.1.2: Streaming tools (sort, uniq, cut, tr, head, tail, wc) adhere to POSIX semantics', () => {
  const driver = new PipelineDriver();

  // Test sort -n -r (numeric reverse)
  const sortRes = driver.execute('echo "10\n2\n50\n1\n25" | sort -n -r');
  assert.equal(sortRes.code, 0);
  assert.deepEqual(sortRes.stdout.trim().split('\n'), ['50', '25', '10', '2', '1']);

  // Test uniq -c (counting repeated runs)
  const uniqRes = driver.execute('echo "alpha\nalpha\nbeta\ngamma\ngamma\ngamma" | uniq -c');
  assert.equal(uniqRes.code, 0);
  const uniqLines = uniqRes.stdout.trim().split('\n').map((l) => l.trim());
  assert.deepEqual(uniqLines, ['2 alpha', '1 beta', '3 gamma']);

  // Test cut with delimiter and field selection
  const cutRes = driver.execute('echo "root:x:0:0:root:/root:/bin/bash" | cut -d: -f1,7');
  assert.equal(cutRes.code, 0);
  assert.equal(cutRes.stdout.trim(), 'root:/bin/bash');

  // Test tr character classes and deletion
  const trUpper = driver.execute("echo 'hello world 123' | tr '[:lower:]' '[:upper:]'");
  assert.equal(trUpper.code, 0);
  assert.equal(trUpper.stdout.trim(), 'HELLO WORLD 123');

  const trDelete = driver.execute("echo 'k u b e r n e t e s' | tr -d ' '");
  assert.equal(trDelete.code, 0);
  assert.equal(trDelete.stdout.trim(), 'kubernetes');

  // Test head and tail
  const seqRes = driver.execute('seq 1 10 | head -n 3');
  assert.equal(seqRes.code, 0);
  assert.deepEqual(seqRes.stdout.trim().split('\n'), ['1', '2', '3']);

  const tailRes = driver.execute('seq 1 10 | tail -n 2');
  assert.equal(tailRes.code, 0);
  assert.deepEqual(tailRes.stdout.trim().split('\n'), ['9', '10']);

  // Test wc line count
  const wcRes = driver.execute('seq 1 15 | wc -l');
  assert.equal(wcRes.code, 0);
  assert.equal(wcRes.stdout.trim(), '15');
});

test('Subphase 2.1.2: Base64 UTF-8 round-trip, tee, and xargs command expansion', () => {
  const vfs = new VirtualFileSystem();
  const driver = new PipelineDriver({ vfs });

  // Base64 encoding and decoding with UTF-8
  const original = 'Kubernetes ☸ Cloud Native 🚀 Rocks!';
  const b64Encoded = utf8ToBase64(original);
  assert.equal(base64ToUtf8(b64Encoded), original);

  const b64Cli = driver.execute(`echo -n "${original}" | base64`);
  assert.equal(b64Cli.code, 0);
  const b64Dec = driver.execute(`echo -n "${b64Cli.stdout.trim()}" | base64 -d`);
  assert.equal(b64Dec.code, 0);
  assert.equal(b64Dec.stdout, original);

  // tee writes to stdout and VFS file simultaneously
  const teeRes = driver.execute('echo "cluster-state-active" | tee /var/run/cluster.status');
  assert.equal(teeRes.code, 0);
  assert.equal(teeRes.stdout.trim(), 'cluster-state-active');
  assert.equal(vfs.readFile('/var/run/cluster.status').trim(), 'cluster-state-active');

  // xargs batching and placeholder replacement
  const xargsRes = driver.execute('echo "worker-1 worker-2 worker-3" | xargs -n 1 echo "drain node:"');
  assert.equal(xargsRes.code, 0);
  assert.deepEqual(xargsRes.stdout.trim().split('\n'), [
    'drain node: worker-1',
    'drain node: worker-2',
    'drain node: worker-3'
  ]);

  const xargsReplace = driver.execute('echo "app-1\napp-2" | xargs -I {} echo "kubectl rollout restart deployment/{}"');
  assert.equal(xargsReplace.code, 0);
  assert.deepEqual(xargsReplace.stdout.trim().split('\n'), [
    'kubectl rollout restart deployment/app-1',
    'kubectl rollout restart deployment/app-2'
  ]);
});

test('Subphase 2.1.2: Redirection engine (> >> < 2> 2>&1) and control-flow operators (&& || ;)', () => {
  const vfs = new VirtualFileSystem();
  const driver = new PipelineDriver({ vfs });

  // Overwrite redirection (>)
  driver.execute('echo "line 1" > /tmp/app.log');
  assert.equal(vfs.readFile('/tmp/app.log'), 'line 1\n');

  // Append redirection (>>)
  driver.execute('echo "line 2" >> /tmp/app.log');
  assert.equal(vfs.readFile('/tmp/app.log'), 'line 1\nline 2\n');

  // Input redirection (<)
  const catInput = driver.execute('cat < /tmp/app.log');
  assert.equal(catInput.code, 0);
  assert.equal(catInput.stdout, 'line 1\nline 2\n');

  // Pipeline with input redirection and pipe
  const pipedRes = driver.execute('cat < /tmp/app.log | grep "line 2"');
  assert.equal(pipedRes.code, 0);
  assert.equal(pipedRes.stdout.trim(), 'line 2');

  // Conditional execution && and ||
  const andSuccess = driver.execute('true && echo "success"');
  assert.equal(andSuccess.code, 0);
  assert.equal(andSuccess.stdout.trim(), 'success');

  const andSkip = driver.execute('false && echo "should-not-run"');
  assert.equal(andSkip.code, 1);
  assert.equal(andSkip.stdout, '');

  const orFallback = driver.execute('false || echo "fallback"');
  assert.equal(orFallback.code, 0);
  assert.equal(orFallback.stdout.trim(), 'fallback');

  const orSkip = driver.execute('true || echo "never-run"');
  assert.equal(orSkip.code, 0);
  assert.equal(orSkip.stdout, '');

  // Statement list with semicolon
  const seqExec = driver.execute('echo "step1" ; echo "step2"');
  assert.equal(seqExec.code, 0);
  assert.equal(seqExec.stdout, 'step2\n');
});

test('Subphase 2.1.2: VirtualPTY VT100 escape sequence handling, screen buffer and line discipline', () => {
  const pty = new VirtualPTY({ cols: 40, rows: 10 });

  // Test ANSI escape sequences and cursor positioning
  pty.write('Initial line\r\n');
  pty.write('\x1b[32mGreen Text\x1b[0m\r\n');

  // Move cursor to row 1, col 1 and overwrite
  pty.write('\x1b[1;1HHeader');

  const plainText = pty.getPlainText();
  assert.ok(plainText.startsWith('Header'));
  assert.ok(plainText.includes('Green Text'));

  // Test stripAnsi
  const rawAnsi = '\x1b[1;31mERROR:\x1b[0m \x1b[4mConnection refused\x1b[0m';
  assert.equal(stripAnsi(rawAnsi), 'ERROR: Connection refused');

  // Test Canonical mode line discipline
  let receivedLine = '';
  pty.onLine((line) => {
    receivedLine = line;
  });

  pty.sendInput('kubectl get pods\r');
  assert.equal(receivedLine, 'kubectl get pods');

  // Test clear and resize
  pty.clear();
  assert.equal(pty.cursorX, 0);
  assert.equal(pty.cursorY, 0);

  pty.resize(60, 15);
  assert.equal(pty.cols, 60);
  assert.equal(pty.rows, 15);
});
