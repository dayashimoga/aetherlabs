'use strict';

/**
 * KubeLabs Authentic Inline Terminal Emulator (v3.0.0)
 * 
 * Features:
 * 1. Inline Prompt: learner@kubelabs:~$ with monospace layout and ANSI/text formatting
 * 2. Real-time Blinking Cursor: with full arrow-key navigation (Left, Right, Home, End)
 * 3. History Navigation: Arrow Up / Down through persistent session command history
 * 4. Reverse History Search (Ctrl+R): Real-time backward substring search across history
 * 5. Multi-Line YAML Heredoc Mode: (cat <<EOF > file.yaml, cat <<EOF | kubectl apply -f -)
 *    Switches to continuation prompt (> ) until matching delimiter is entered
 * 6. Ctrl+C Interrupt: Prints ^C and resets prompt / cancels open heredoc
 * 7. Ctrl+L Clear: Clears scrollback buffer and resets view
 * 8. Cross-Platform Touch & Mobile: Seamless cursor insertion and focus management
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TerminalView = factory();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  class TerminalView {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.getElementById(container) : container;
      if (!this.container) {
        throw new Error('TerminalView container element not found');
      }

      this.prompt = options.prompt || 'learner@kubelabs:~$ ';
      this.continuationPrompt = options.continuationPrompt || '> ';
      this.onExecute = options.onExecute || (async () => ({ output: '' }));
      this.onClusterStateUpdate = options.onClusterStateUpdate || (() => {});
      this.welcomeMessage = options.welcomeMessage || 'Sandboxed Cloud-Native Shell (kubectl | helm | docker | argocd | istioctl | tofu | aws | az | gcloud | trivy | aiops)\nType "help" to view available tools, or run "kubectl get pods -A" to inspect cluster.';

      // Terminal State
      this.scrollback = []; // array of { type: 'prompt'|'command'|'output'|'error'|'system', text: string }
      this.lineBuffer = '';
      this.cursorPos = 0;
      this.history = options.history ? [...options.history] : [];
      this.historyIndex = -1;
      this.savedBuffer = '';

      // Heredoc State
      this.isHeredoc = false;
      this.heredocDelimiter = 'EOF';
      this.heredocHeader = '';
      this.heredocLines = [];

      // Reverse Search State (Ctrl+R)
      this.isReverseSearch = false;
      this.searchQuery = '';
      this.searchMatch = '';
      this.searchMatchIndex = -1;

      // Autocomplete callback
      this.onTabComplete = options.onTabComplete || null;

      this.initDom();
      this.bindEvents();

      if (this.welcomeMessage) {
        this.writeLine(this.welcomeMessage, 'system');
      }
      this.render();
    }

    initDom() {
      if (typeof document === 'undefined') {
        const createMock = () => ({
          style: {},
          textContent: '',
          value: '',
          innerHTML: '',
          addEventListener: () => {},
          appendChild: () => {},
          focus: () => {}
        });
        this.wrapperEl = createMock();
        this.scrollbackEl = createMock();
        this.promptEl = createMock();
        this.beforeEl = createMock();
        this.cursorEl = createMock();
        this.afterEl = createMock();
        this.captureInput = createMock();
        return;
      }

      this.container.innerHTML = `
        <div class="inline-terminal-wrapper" tabindex="0" role="region" aria-label="Interactive Terminal Emulator">
          <div class="inline-terminal-scrollback" id="terminal-scrollback" role="log" aria-live="polite"></div>
          <div class="inline-terminal-active-line" id="terminal-active-line">
            <span class="inline-prompt" id="terminal-prompt-text">${this.prompt}</span>
            <span class="inline-command-display" id="terminal-command-display">
              <span class="term-text-before"></span>
              <span class="term-cursor blink">&nbsp;</span>
              <span class="term-text-after"></span>
            </span>
            <input type="text" class="terminal-capture-input" id="terminal-capture-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Terminal keyboard capture" />
          </div>
        </div>
      `;

      this.wrapperEl = this.container.querySelector('.inline-terminal-wrapper');
      this.scrollbackEl = this.container.querySelector('#terminal-scrollback');
      this.promptEl = this.container.querySelector('#terminal-prompt-text');
      this.beforeEl = this.container.querySelector('.term-text-before');
      this.cursorEl = this.container.querySelector('.term-cursor');
      this.afterEl = this.container.querySelector('.term-text-after');
      this.captureInput = this.container.querySelector('#terminal-capture-input');
    }

    bindEvents() {
      if (!this.wrapperEl || !this.captureInput) return;
      // Clicking anywhere inside terminal focuses capture input
      this.wrapperEl.addEventListener('click', () => {
        this.focus();
      });

      // Synchronize input capture events
      this.captureInput.addEventListener('input', (e) => {
        if (this.isReverseSearch) {
          const val = this.captureInput.value;
          this.searchQuery = val;
          this.performReverseSearch();
          this.render();
          return;
        }

        const val = this.captureInput.value;
        const insertChars = val;
        this.captureInput.value = '';

        if (insertChars) {
          this.insertAtCursor(insertChars);
        }
      });

      // Keydown handler for terminal shortcuts and navigation
      this.captureInput.addEventListener('keydown', (e) => {
        this.handleKeyDown(e);
      });

      // Also listen on wrapper for accessibility
      this.wrapperEl.addEventListener('keydown', (e) => {
        if (document.activeElement !== this.captureInput) {
          this.focus();
          this.handleKeyDown(e);
        }
      });

      // Paste handling
      this.captureInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
          if (text.includes('\n')) {
            // Multi-line paste
            this.handleMultiLinePaste(text);
          } else {
            this.insertAtCursor(text);
          }
        }
      });
    }

    focus() {
      if (this.captureInput) {
        this.captureInput.focus();
      }
    }

    handleKeyDown(e) {
      // 1. Ctrl+C: Interrupt
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        this.interrupt();
        return;
      }

      // 2. Ctrl+L: Clear Screen
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.clear();
        return;
      }

      // 3. Ctrl+R: Reverse History Search
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (!this.isReverseSearch) {
          this.startReverseSearch();
        } else {
          // Cycle to next match
          this.cycleReverseSearch();
        }
        return;
      }

      // Reverse Search Mode Key Handling
      if (this.isReverseSearch) {
        if (e.key === 'Escape' || (e.ctrlKey && (e.key === 'g' || e.key === 'G'))) {
          e.preventDefault();
          this.cancelReverseSearch();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.acceptReverseSearch();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (this.searchQuery.length > 0) {
            this.searchQuery = this.searchQuery.slice(0, -1);
            this.captureInput.value = this.searchQuery;
            this.performReverseSearch();
            this.render();
          }
          return;
        }
        // Let normal typing fall through to input event
        return;
      }

      // Standard Mode Key Handling
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitLine();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.historyUp();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.historyDown();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.cursorPos > 0) {
          this.cursorPos -= 1;
          this.render();
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.cursorPos < this.lineBuffer.length) {
          this.cursorPos += 1;
          this.render();
        }
        return;
      }

      if (e.key === 'Home' || (e.ctrlKey && e.key === 'a')) {
        e.preventDefault();
        this.cursorPos = 0;
        this.render();
        return;
      }

      if (e.key === 'End' || (e.ctrlKey && e.key === 'e')) {
        e.preventDefault();
        this.cursorPos = this.lineBuffer.length;
        this.render();
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.cursorPos > 0) {
          const before = this.lineBuffer.slice(0, this.cursorPos - 1);
          const after = this.lineBuffer.slice(this.cursorPos);
          this.lineBuffer = before + after;
          this.cursorPos -= 1;
          this.render();
        }
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        if (this.cursorPos < this.lineBuffer.length) {
          const before = this.lineBuffer.slice(0, this.cursorPos);
          const after = this.lineBuffer.slice(this.cursorPos + 1);
          this.lineBuffer = before + after;
          this.render();
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        this.handleTabCompletion();
        return;
      }
    }

    insertAtCursor(str) {
      if (!str) return;
      const before = this.lineBuffer.slice(0, this.cursorPos);
      const after = this.lineBuffer.slice(this.cursorPos);
      this.lineBuffer = before + str + after;
      this.cursorPos += str.length;
      this.render();
    }

    setCommand(str) {
      this.lineBuffer = String(str || '');
      this.cursorPos = this.lineBuffer.length;
      this.render();
      this.focus();
    }

    handleMultiLinePaste(text) {
      const lines = text.split(/\r?\n/);
      if (lines.length === 1) {
        this.insertAtCursor(lines[0]);
        return;
      }

      // If pasting multi-line directly while not in heredoc
      const firstLine = lines[0];
      if (firstLine.includes('<<')) {
        this.lineBuffer = firstLine;
        this.submitLine();
        for (let i = 1; i < lines.length; i++) {
          this.lineBuffer = lines[i];
          this.submitLine();
        }
      } else {
        // Concatenate or submit line by line
        this.insertAtCursor(lines.join(' '));
      }
    }

    handleTabCompletion() {
      if (typeof this.onTabComplete === 'function') {
        const completed = this.onTabComplete(this.lineBuffer, this.cursorPos);
        if (completed && typeof completed === 'string') {
          this.setCommand(completed);
        }
      }
    }

    // ----------------------------------------------------
    // Command Submission & Heredoc Processing
    // ----------------------------------------------------
    async submitLine() {
      const line = this.lineBuffer;

      // 1. If currently in Heredoc mode:
      if (this.isHeredoc) {
        this.appendScrollback(`${this.continuationPrompt}${line}`, 'command');

        if (line.trim() === this.heredocDelimiter) {
          // Completed heredoc!
          this.isHeredoc = false;
          const fullCommand = [this.heredocHeader, ...this.heredocLines, line.trim()].join('\n');
          this.history.push(fullCommand);
          this.historyIndex = -1;

          this.lineBuffer = '';
          this.cursorPos = 0;
          this.heredocLines = [];
          this.heredocHeader = '';
          this.render();

          await this.executeRaw(fullCommand);
        } else {
          // Add line to heredoc buffer and wait for more lines
          this.heredocLines.push(line);
          this.lineBuffer = '';
          this.cursorPos = 0;
          this.render();
        }
        return;
      }

      // 2. Check if this line starts a Heredoc:
      const heredocMatch = line.match(/<<\s*['"]?([A-Za-z0-9_-]+)['"]?/);
      if (heredocMatch) {
        this.isHeredoc = true;
        this.heredocDelimiter = heredocMatch[1];
        this.heredocHeader = line;
        this.heredocLines = [];

        this.appendScrollback(`${this.prompt}${line}`, 'command');
        this.lineBuffer = '';
        this.cursorPos = 0;
        this.render();
        return;
      }

      // 3. Normal command execution:
      this.appendScrollback(`${this.prompt}${line}`, 'command');
      if (line.trim()) {
        this.history.push(line);
        this.historyIndex = -1;
      }

      const cmdToRun = this.lineBuffer;
      this.lineBuffer = '';
      this.cursorPos = 0;
      this.render();

      if (cmdToRun.trim()) {
        await this.executeRaw(cmdToRun);
      }
    }

    async executeRaw(cmd) {
      try {
        const res = await this.onExecute(cmd);
        if (res) {
          if (res.clearScreen) {
            this.clear();
          } else if (res.output) {
            this.appendScrollback(res.output, res.exitCode === 0 ? 'output' : 'error');
          }
          if (res.clusterState) {
            this.onClusterStateUpdate(res.clusterState);
          }
        }
      } catch (err) {
        this.appendScrollback(`Error: ${err.message}`, 'error');
      }
      this.scrollToBottom();
      this.render();
    }

    // ----------------------------------------------------
    // History Navigation (Arrow Up / Down)
    // ----------------------------------------------------
    historyUp() {
      if (this.history.length === 0) return;

      if (this.historyIndex === -1) {
        this.savedBuffer = this.lineBuffer;
        this.historyIndex = this.history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex -= 1;
      }

      this.lineBuffer = this.history[this.historyIndex] || '';
      this.cursorPos = this.lineBuffer.length;
      this.render();
    }

    historyDown() {
      if (this.historyIndex === -1) return;

      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex += 1;
        this.lineBuffer = this.history[this.historyIndex] || '';
      } else {
        this.historyIndex = -1;
        this.lineBuffer = this.savedBuffer;
      }

      this.cursorPos = this.lineBuffer.length;
      this.render();
    }

    // ----------------------------------------------------
    // Reverse History Search (Ctrl+R)
    // ----------------------------------------------------
    startReverseSearch() {
      this.isReverseSearch = true;
      this.searchQuery = '';
      this.searchMatch = '';
      this.searchMatchIndex = -1;
      this.captureInput.value = '';
      this.render();
      this.focus();
    }

    performReverseSearch() {
      const q = this.searchQuery.toLowerCase();
      if (!q) {
        this.searchMatch = '';
        this.searchMatchIndex = -1;
        return;
      }

      for (let i = this.history.length - 1; i >= 0; i--) {
        const item = this.history[i];
        if (item && item.toLowerCase().includes(q)) {
          this.searchMatch = item;
          this.searchMatchIndex = i;
          return;
        }
      }
      this.searchMatch = '';
      this.searchMatchIndex = -1;
    }

    cycleReverseSearch() {
      const q = this.searchQuery.toLowerCase();
      if (!q) return;

      const startIdx = this.searchMatchIndex > 0 ? this.searchMatchIndex - 1 : this.history.length - 1;
      for (let i = startIdx; i >= 0; i--) {
        const item = this.history[i];
        if (item && item.toLowerCase().includes(q)) {
          this.searchMatch = item;
          this.searchMatchIndex = i;
          this.render();
          return;
        }
      }
    }

    acceptReverseSearch() {
      if (this.searchMatch) {
        this.lineBuffer = this.searchMatch;
        this.cursorPos = this.lineBuffer.length;
      }
      this.cancelReverseSearch();
      this.render();
    }

    cancelReverseSearch() {
      this.isReverseSearch = false;
      this.searchQuery = '';
      this.searchMatch = '';
      this.searchMatchIndex = -1;
      this.captureInput.value = '';
      this.render();
    }

    // ----------------------------------------------------
    // Terminal Operations: Interrupt & Clear
    // ----------------------------------------------------
    interrupt() {
      if (this.isReverseSearch) {
        this.cancelReverseSearch();
        return;
      }

      const activePrompt = this.isHeredoc ? this.continuationPrompt : this.prompt;
      this.appendScrollback(`${activePrompt}${this.lineBuffer}^C`, 'command');

      this.isHeredoc = false;
      this.heredocLines = [];
      this.heredocHeader = '';
      this.lineBuffer = '';
      this.cursorPos = 0;
      this.historyIndex = -1;
      this.render();
      this.scrollToBottom();
    }

    clear() {
      this.scrollback = [];
      if (this.scrollbackEl) {
        this.scrollbackEl.innerHTML = '';
      }
      this.render();
    }

    writeLine(text, type = 'output') {
      this.appendScrollback(text, type);
      this.scrollToBottom();
    }

    appendScrollback(text, type = 'output') {
      this.scrollback.push({ type, text: String(text) });

      if (typeof document === 'undefined') return;

      const lineDiv = document.createElement('div');
      lineDiv.className = `term-line term-${type}`;

      if (type === 'command') {
        lineDiv.style.color = '#f8fafc';
        lineDiv.style.fontWeight = '600';
      } else if (type === 'error') {
        lineDiv.style.color = '#f87171';
      } else if (type === 'system') {
        lineDiv.style.color = '#38bdf8';
        lineDiv.style.fontStyle = 'italic';
      } else {
        lineDiv.style.color = '#cbd5e1';
      }

      lineDiv.style.whiteSpace = 'pre-wrap';
      lineDiv.style.wordBreak = 'break-word';
      lineDiv.style.marginBottom = '0.35rem';
      lineDiv.textContent = text;

      if (this.scrollbackEl && typeof this.scrollbackEl.appendChild === 'function') {
        this.scrollbackEl.appendChild(lineDiv);
      }
    }

    scrollToBottom() {
      if (this.wrapperEl) {
        this.wrapperEl.scrollTop = this.wrapperEl.scrollHeight;
      }
    }

    render() {
      if (!this.promptEl || !this.beforeEl || !this.cursorEl || !this.afterEl) return;

      if (this.isReverseSearch) {
        this.promptEl.textContent = `(reverse-i-search)\`${this.searchQuery}\`: `;
        this.promptEl.style.color = '#f59e0b';
        this.beforeEl.textContent = this.searchMatch;
        this.cursorEl.textContent = ' ';
        this.afterEl.textContent = '';
        return;
      }

      this.promptEl.style.color = 'var(--accent-green, #4ade80)';
      this.promptEl.textContent = this.isHeredoc ? this.continuationPrompt : this.prompt;

      const before = this.lineBuffer.slice(0, this.cursorPos);
      const at = this.lineBuffer.charAt(this.cursorPos) || ' ';
      const after = this.lineBuffer.slice(this.cursorPos + 1);

      this.beforeEl.textContent = before;
      this.cursorEl.textContent = at === ' ' ? '\u00A0' : at;
      this.afterEl.textContent = after;
    }
  }

  return TerminalView;
});
