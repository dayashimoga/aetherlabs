'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TerminalEngine } = require('../src/core/terminalEngine');
const { VirtualCluster } = require('../src/core/virtualCluster');
const { VirtualFileSystem } = require('../src/core/virtualFileSystem');
const TerminalView = require('../public/js/terminalView');

test('Subphase 1.2.1: TerminalEngine multi-line YAML heredoc parsing and execution', () => {
  const cluster = new VirtualCluster();
  const engine = new TerminalEngine(cluster);
  const vfs = engine.vfs;

  // 1. cat <<EOF > file.yaml (writes file in VFS)
  const heredocWriteCmd = [
    'cat <<EOF > /home/learner/deployment.yaml',
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web-api',
    '  namespace: default',
    'spec:',
    '  replicas: 2',
    'EOF'
  ].join('\n');

  const writeRes = engine.execute(heredocWriteCmd);
  assert.equal(writeRes.exitCode, 0);
  assert.ok(vfs.exists('/home/learner/deployment.yaml'));
  const savedYaml = vfs.readFile('/home/learner/deployment.yaml');
  assert.ok(savedYaml.includes('kind: Deployment'));
  assert.ok(savedYaml.includes('name: web-api'));

  // 2. cat <<EOF >> file.yaml (appends to file in VFS)
  const heredocAppendCmd = [
    'cat <<EOF >> /home/learner/deployment.yaml',
    '# appended note',
    'EOF'
  ].join('\n');
  const appendRes = engine.execute(heredocAppendCmd);
  assert.equal(appendRes.exitCode, 0);
  const appendedYaml = vfs.readFile('/home/learner/deployment.yaml');
  assert.ok(appendedYaml.includes('# appended note'));

  // 3. cat <<EOF | kubectl apply -f - (applies to cluster)
  const heredocApplyCmd = [
    'cat <<EOF | kubectl apply -f -',
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    '  name: app-config',
    '  namespace: default',
    'data:',
    '  DB_HOST: "postgres.internal"',
    'EOF'
  ].join('\n');

  const applyRes = engine.execute(heredocApplyCmd);
  assert.equal(applyRes.exitCode, 0);
  assert.ok(applyRes.output.includes('configmap/app-config created') || applyRes.output.includes('configmap/app-config configured'));
  const cm = cluster.getResource('ConfigMap', 'app-config', 'default');
  assert.ok(cm);
  assert.equal(cm.metadata.name, 'app-config');

  // 4. cat <<EOF (standard heredoc prints content to stdout)
  const heredocEchoCmd = [
    'cat <<EOF',
    'Hello Cloud-Native World',
    'EOF'
  ].join('\n');
  const echoRes = engine.execute(heredocEchoCmd);
  assert.equal(echoRes.exitCode, 0);
  assert.equal(echoRes.output.trim(), 'Hello Cloud-Native World');
});

test('Subphase 1.2.1: TerminalView authentic inline terminal emulator state machine', async () => {
  const executedCommands = [];
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    prompt: 'learner@kubelabs:~$ ',
    continuationPrompt: '> ',
    onExecute: async (cmd) => {
      executedCommands.push(cmd);
      return { exitCode: 0, output: `executed: ${cmd}` };
    }
  });

  assert.equal(termView.prompt, 'learner@kubelabs:~$ ');
  assert.equal(termView.lineBuffer, '');
  assert.equal(termView.cursorPos, 0);

  // 1. Typing and cursor navigation
  termView.insertAtCursor('kubectl get pods');
  assert.equal(termView.lineBuffer, 'kubectl get pods');
  assert.equal(termView.cursorPos, 16);

  // Move left 4 times (before 'pods')
  termView.handleKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  termView.handleKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  termView.handleKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  termView.handleKeyDown({ key: 'ArrowLeft', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 12);

  // Insert '-n production '
  termView.insertAtCursor('-n production ');
  assert.equal(termView.lineBuffer, 'kubectl get -n production pods');

  // Home key
  termView.handleKeyDown({ key: 'Home', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 0);

  // End key
  termView.handleKeyDown({ key: 'End', preventDefault: () => {} });
  assert.equal(termView.cursorPos, termView.lineBuffer.length);

  // Backspace
  termView.handleKeyDown({ key: 'Backspace', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, 'kubectl get -n production pod');

  // 2. Submit command
  await termView.submitLine();
  assert.equal(executedCommands.length, 1);
  assert.equal(executedCommands[0], 'kubectl get -n production pod');
  assert.equal(termView.lineBuffer, '');
  assert.equal(termView.cursorPos, 0);

  // 3. Command History Navigation (Arrow Up / Down)
  termView.insertAtCursor('unsubmitted command');
  termView.handleKeyDown({ key: 'ArrowUp', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, 'kubectl get -n production pod');

  termView.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, 'unsubmitted command');

  // 4. Reverse History Search (Ctrl+R)
  termView.startReverseSearch();
  assert.equal(termView.isReverseSearch, true);

  termView.searchQuery = 'prod';
  termView.performReverseSearch();
  assert.equal(termView.searchMatch, 'kubectl get -n production pod');

  // Accept reverse search
  termView.acceptReverseSearch();
  assert.equal(termView.isReverseSearch, false);
  assert.equal(termView.lineBuffer, 'kubectl get -n production pod');

  // 5. Ctrl+C Interrupt
  termView.insertAtCursor('some draft command');
  termView.interrupt();
  assert.equal(termView.lineBuffer, '');
  assert.ok(termView.scrollback.some((s) => s.text.includes('^C')));

  // 6. Ctrl+L Clear
  termView.writeLine('log 1');
  termView.writeLine('log 2');
  assert.ok(termView.scrollback.length > 0);
  termView.clear();
  assert.equal(termView.scrollback.length, 0);

  // 7. Multi-line YAML Heredoc continuation mode
  termView.lineBuffer = 'cat <<EOF > app.yaml';
  await termView.submitLine();
  assert.equal(termView.isHeredoc, true);
  assert.equal(termView.heredocDelimiter, 'EOF');

  // Next line entered
  termView.lineBuffer = 'kind: Pod';
  await termView.submitLine();
  assert.equal(termView.isHeredoc, true);
  assert.deepEqual(termView.heredocLines, ['kind: Pod']);

  // Delimiter line entered (EOF)
  termView.lineBuffer = 'EOF';
  await termView.submitLine();
  assert.equal(termView.isHeredoc, false);
  assert.equal(executedCommands.length, 2);
  assert.equal(executedCommands[1], 'cat <<EOF > app.yaml\nkind: Pod\nEOF');
});
