'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TerminalView = require('../src/core/terminalView');

test('1.3.1 - ANSI 256-Color & TrueColor Engine', () => {
  const { ansiToHtml, stripAnsi, get256ColorHex } = TerminalView;

  // 1. stripAnsi removes all codes
  const colored = '\x1b[1m\x1b[31mError:\x1b[0m \x1b[38;5;196mFatal Crash\x1b[0m';
  assert.equal(stripAnsi(colored), 'Error: Fatal Crash');

  // 2. 256-Color mapping verification
  assert.equal(get256ColorHex(0), '#1e293b'); // Black
  assert.equal(get256ColorHex(1), '#ef4444'); // Red
  assert.equal(get256ColorHex(2), '#10b981'); // Green
  assert.equal(get256ColorHex(15), '#ffffff'); // Bright White
  // Cube color index 16 (0,0,0) -> #000000
  assert.equal(get256ColorHex(16), '#000000');
  // Cube color index 196 (5,0,0) -> #ff0000
  assert.equal(get256ColorHex(196), '#ff0000');
  // Grayscale index 232 -> 8 + 10*0 = 8 -> #080808
  assert.equal(get256ColorHex(232), '#080808');
  // Grayscale index 255 -> 8 + 10*23 = 238 -> #eeeeee
  assert.equal(get256ColorHex(255), '#eeeeee');

  // 3. ansiToHtml renders standard colors and styles
  const boldRed = ansiToHtml('\x1b[1;31mAlert\x1b[0m');
  assert.ok(boldRed.includes('style="color:#ef4444;font-weight:700"'));
  assert.ok(boldRed.includes('Alert'));

  // 4. ansiToHtml renders 256-color foreground (38;5;N) and background (48;5;N)
  const color256 = ansiToHtml('\x1b[38;5;196;48;5;28mHighlight\x1b[0m');
  assert.ok(color256.includes('color:#ff0000'));
  assert.ok(color256.includes('background-color:#008700'));
  assert.ok(color256.includes('Highlight'));

  // 5. ansiToHtml renders 24-bit TrueColor RGB (38;2;R;G;B)
  const trueColor = ansiToHtml('\x1b[38;2;56;189;248mCyanFocus\x1b[0m');
  assert.ok(trueColor.includes('color:#38bdf8'));
  assert.ok(trueColor.includes('CyanFocus'));

  // 6. Text formatting: italic, underline, dim, strikethrough, inverse
  const formatted = ansiToHtml('\x1b[3;4;2mNotes\x1b[0m');
  assert.ok(formatted.includes('font-style:italic'));
  assert.ok(formatted.includes('text-decoration:underline'));
  assert.ok(formatted.includes('opacity:0.65'));
  assert.ok(formatted.includes('Notes'));

  // 7. HTML escaping for security
  const dangerous = ansiToHtml('\x1b[32m<script>alert("hack")</script>\x1b[0m');
  assert.ok(!dangerous.includes('<script>'));
  assert.ok(dangerous.includes('&lt;script&gt;'));
});

test('1.3.1 - Multi-Tab Shell Sessions (createTab, switchTab, closeTab, renameTab)', () => {
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    prompt: 'learner@kubelabs:~$ '
  });

  // Default state: 1 tab
  assert.equal(termView.tabs.length, 1);
  assert.equal(termView.activeTab.title, 'bash:1');

  // Set command on Tab 1
  termView.setCommand('kubectl get pods');
  assert.equal(termView.lineBuffer, 'kubectl get pods');

  // Create Tab 2
  const tab2 = termView.createTab('logs');
  assert.equal(termView.tabs.length, 2);
  assert.equal(termView.activeTabId, tab2.id);
  assert.equal(termView.activeTab.title, 'logs');
  assert.equal(termView.lineBuffer, ''); // fresh buffer in Tab 2

  // Type in Tab 2
  termView.insertAtCursor('stern -n production api');
  assert.equal(termView.lineBuffer, 'stern -n production api');

  // Switch back to Tab 1
  termView.switchTab('tab-1');
  assert.equal(termView.activeTabId, 'tab-1');
  assert.equal(termView.lineBuffer, 'kubectl get pods'); // Preserved in Tab 1!

  // Switch back to Tab 2
  termView.switchTab(tab2.id);
  assert.equal(termView.lineBuffer, 'stern -n production api'); // Preserved in Tab 2!

  // Rename Tab 2
  termView.renameTab(tab2.id, 'prod-logs');
  assert.equal(termView.activeTab.title, 'prod-logs');

  // Create Tab 3
  const tab3 = termView.createTab('debug');
  assert.equal(termView.tabs.length, 3);
  assert.equal(termView.activeTabId, tab3.id);

  // Close Tab 3
  termView.closeTab(tab3.id);
  assert.equal(termView.tabs.length, 2);
  assert.equal(termView.activeTabId, tab2.id); // Switches to adjacent active tab

  // Query tab metadata
  const tabInfos = termView.getTabs();
  assert.equal(tabInfos.length, 2);
  assert.equal(tabInfos[0].id, 'tab-1');
  assert.equal(tabInfos[1].id, tab2.id);
  assert.equal(tabInfos[1].active, true);

  // Close all until 1 tab remains
  termView.closeTab('tab-1');
  assert.equal(termView.tabs.length, 1);

  // Closing the last tab resets rather than deletes
  termView.closeTab(termView.activeTabId);
  assert.equal(termView.tabs.length, 1);
  assert.equal(termView.lineBuffer, '');
});

test('1.3.1 - Line Editing & Word Navigation Shortcuts', () => {
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer);
  termView.setCommand('kubectl apply -f manifest.yaml');
  assert.equal(termView.cursorPos, 30);

  // Jump word backward: Ctrl+Left
  termView.handleKeyDown({ ctrlKey: true, key: 'ArrowLeft', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 17); // Before 'manifest.yaml'

  termView.handleKeyDown({ ctrlKey: true, key: 'ArrowLeft', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 14); // Before '-f'

  // Jump word forward: Ctrl+Right
  termView.handleKeyDown({ ctrlKey: true, key: 'ArrowRight', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 17); // After '-f '

  // Alt+B and Alt+F word navigation parity
  termView.handleKeyDown({ altKey: true, key: 'b', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 14);

  termView.handleKeyDown({ altKey: true, key: 'f', preventDefault: () => {} });
  assert.equal(termView.cursorPos, 17);

  // Kill backward word (Ctrl+W)
  termView.handleKeyDown({ ctrlKey: true, key: 'w', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, 'kubectl apply manifest.yaml');
  assert.equal(termView.cursorPos, 14);

  // Clear from cursor to end (Ctrl+K)
  termView.handleKeyDown({ ctrlKey: true, key: 'k', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, 'kubectl apply ');

  // Clear from beginning to cursor (Ctrl+U)
  termView.cursorPos = 7; // after 'kubectl'
  termView.handleKeyDown({ ctrlKey: true, key: 'u', preventDefault: () => {} });
  assert.equal(termView.lineBuffer, ' apply ');
  assert.equal(termView.cursorPos, 0);
});

test('1.3.1 - Tab Keyboard Shortcuts (Ctrl+Shift+T, Ctrl+Shift+W, Alt+1/2)', () => {
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer);
  assert.equal(termView.tabs.length, 1);

  // Ctrl+Shift+T creates new tab
  termView.handleKeyDown({ ctrlKey: true, shiftKey: true, key: 'T', preventDefault: () => {} });
  assert.equal(termView.tabs.length, 2);
  assert.equal(termView.activeTabId, 'tab-2');

  // Alt+1 switches to Tab 1
  termView.handleKeyDown({ altKey: true, key: '1', preventDefault: () => {} });
  assert.equal(termView.activeTabId, 'tab-1');

  // Alt+2 switches to Tab 2
  termView.handleKeyDown({ altKey: true, key: '2', preventDefault: () => {} });
  assert.equal(termView.activeTabId, 'tab-2');

  // Ctrl+Shift+W closes Tab 2
  termView.handleKeyDown({ ctrlKey: true, shiftKey: true, key: 'W', preventDefault: () => {} });
  assert.equal(termView.tabs.length, 1);
  assert.equal(termView.activeTabId, 'tab-1');
});

test('1.3.1 - History Buffer Deduplication & Navigation', async () => {
  const executed = [];
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    onExecute: async (cmd) => {
      executed.push(cmd);
      return { exitCode: 0, output: 'ok' };
    }
  });

  // Submit commands
  termView.setCommand('kubectl get nodes');
  await termView.submitLine();

  // Submit identical command consecutive (should deduplicate)
  termView.setCommand('kubectl get nodes');
  await termView.submitLine();
  assert.equal(termView.history.length, 1);

  termView.setCommand('kubectl get pods');
  await termView.submitLine();
  assert.equal(termView.history.length, 2);

  // Arrow up navigation
  termView.setCommand('draft');
  termView.historyUp();
  assert.equal(termView.lineBuffer, 'kubectl get pods');

  termView.historyUp();
  assert.equal(termView.lineBuffer, 'kubectl get nodes');

  // Top of history remains at first item
  termView.historyUp();
  assert.equal(termView.lineBuffer, 'kubectl get nodes');

  // Arrow down returns to draft
  termView.historyDown();
  assert.equal(termView.lineBuffer, 'kubectl get pods');

  termView.historyDown();
  assert.equal(termView.lineBuffer, 'draft');
});

test('1.3.1 - Reverse History Search (Ctrl+R) Navigation & Cycling', () => {
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    history: [
      'git status',
      'kubectl get pods -n kube-system',
      'docker ps -a',
      'kubectl get pods -n production',
      'kubectl describe node'
    ]
  });

  // Start reverse search
  termView.startReverseSearch();
  assert.equal(termView.isReverseSearch, true);

  // Search query 'pods'
  termView.searchQuery = 'pods';
  termView.performReverseSearch();
  assert.equal(termView.searchMatch, 'kubectl get pods -n production'); // Most recent match

  // Cycle to previous match (Ctrl+R again)
  termView.cycleReverseSearch();
  assert.equal(termView.searchMatch, 'kubectl get pods -n kube-system');

  // Cycle wraps around
  termView.cycleReverseSearch();
  assert.equal(termView.searchMatch, 'kubectl get pods -n production');

  // Accept with Tab or RightArrow
  termView.handleKeyDown({ key: 'ArrowRight', preventDefault: () => {} });
  assert.equal(termView.isReverseSearch, false);
  assert.equal(termView.lineBuffer, 'kubectl get pods -n production');

  // Cancel reverse search with Escape
  termView.setCommand('original draft');
  termView.startReverseSearch();
  termView.searchQuery = 'docker';
  termView.performReverseSearch();
  termView.handleKeyDown({ key: 'Escape', preventDefault: () => {} });
  assert.equal(termView.isReverseSearch, false);
});

test('1.3.1 - Interrupt Handling (Ctrl+C) & Terminal Clear (Ctrl+L)', () => {
  let interruptFired = false;
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    onInterrupt: () => {
      interruptFired = true;
    }
  });

  // Ctrl+C with input
  termView.setCommand('unfinished command');
  termView.handleKeyDown({ ctrlKey: true, key: 'c', preventDefault: () => {} });
  assert.equal(interruptFired, true);
  assert.equal(termView.lineBuffer, '');
  assert.ok(termView.scrollback.some((s) => s.text.includes('^C')));

  // Ctrl+L clears scrollback
  assert.ok(termView.scrollback.length > 0);
  termView.handleKeyDown({ ctrlKey: true, key: 'l', preventDefault: () => {} });
  assert.equal(termView.scrollback.length, 0);
});

test('1.3.1 - Multi-Line YAML Heredoc Continuation & Execution', async () => {
  const executed = [];
  const fakeContainer = {
    innerHTML: '',
    appendChild: () => {},
    querySelector: () => null
  };

  const termView = new TerminalView(fakeContainer, {
    onExecute: async (cmd) => {
      executed.push(cmd);
      return { exitCode: 0, output: 'resource configured' };
    }
  });

  // Line 1: Heredoc start
  termView.setCommand('cat <<EOF > deployment.yaml');
  await termView.submitLine();
  assert.equal(termView.isHeredoc, true);
  assert.equal(termView.heredocDelimiter, 'EOF');
  assert.equal(termView.lineBuffer, '');

  // Line 2: Heredoc body line 1
  termView.setCommand('apiVersion: apps/v1');
  await termView.submitLine();
  assert.equal(termView.isHeredoc, true);
  assert.deepEqual(termView.heredocLines, ['apiVersion: apps/v1']);

  // Line 3: Heredoc body line 2
  termView.setCommand('kind: Deployment');
  await termView.submitLine();
  assert.equal(termView.isHeredoc, true);
  assert.deepEqual(termView.heredocLines, ['apiVersion: apps/v1', 'kind: Deployment']);

  // Line 4: Delimiter line
  termView.setCommand('EOF');
  await termView.submitLine();
  assert.equal(termView.isHeredoc, false);
  assert.equal(executed.length, 1);
  assert.equal(
    executed[0],
    'cat <<EOF > deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nEOF'
  );
  assert.ok(termView.scrollback.some((s) => s.text.includes('resource configured')));
});

