'use strict';

/**
 * KubeLabs v4.0 - Isomorphic Interactive Terminal View & Emulator
 * 
 * Features:
 * 1. Full ANSI 256-Color & 24-Bit RGB TrueColor Parser & HTML Styler
 * 2. Multi-Tab Shell Sessions (createTab, switchTab, closeTab, renameTab)
 * 3. Command History Navigation (Arrow Up/Down, max depth, buffer preservation)
 * 4. Real-time Reverse-i-Search (Ctrl+R, backward cycle, match accept/cancel)
 * 5. Interactive Cursor Navigation & Line Editing (Arrow Left/Right, Home/End, Word Jumps, Backspace/Delete)
 * 6. Multi-Line YAML Heredoc Continuation (cat <<EOF > manifest.yaml) with continuation prompt (> )
 * 7. Terminal Clear (Ctrl+L) & Interrupt Handling (Ctrl+C with onInterrupt callback)
 * 8. Word Operations & Shortcuts (Ctrl+W, Ctrl+U, Ctrl+K, Alt+B, Alt+F)
 * 9. Isomorphic execution: 100% functional in Browser DOM and headless Node.js test runners
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const mod = factory();
    root.TerminalView = mod;
    root.TerminalEmulator = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // ---------------------------------------------------------------------------
  // ANSI 256-Color & Style Parser Engine
  // ---------------------------------------------------------------------------

  const STANDARD_16_COLORS = [
    '#1e293b', // 0: Black
    '#ef4444', // 1: Red
    '#10b981', // 2: Green
    '#f59e0b', // 3: Yellow
    '#3b82f6', // 4: Blue
    '#d946ef', // 5: Magenta
    '#06b6d4', // 6: Cyan
    '#cbd5e1', // 7: White
    '#64748b', // 8: Bright Black (Gray)
    '#f87171', // 9: Bright Red
    '#34d399', // 10: Bright Green
    '#fbbf24', // 11: Bright Yellow
    '#60a5fa', // 12: Bright Blue
    '#e879f9', // 13: Bright Magenta
    '#38bdf8', // 14: Bright Cyan
    '#ffffff'  // 15: Bright White
  ];

  const COLOR_STEPS_6 = [0, 95, 135, 175, 215, 255];

  function rgbToHex(r, g, b) {
    const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function get256ColorHex(code) {
    const idx = parseInt(code, 10);
    if (isNaN(idx) || idx < 0 || idx > 255) return null;
    if (idx < 16) return STANDARD_16_COLORS[idx];
    if (idx >= 16 && idx <= 231) {
      // 6x6x6 color cube
      const n = idx - 16;
      const b = n % 6;
      const g = Math.floor(n / 6) % 6;
      const r = Math.floor(n / 36);
      return rgbToHex(COLOR_STEPS_6[r], COLOR_STEPS_6[g], COLOR_STEPS_6[b]);
    }
    // 232-255: grayscale ramp (24 shades)
    const gray = 8 + 10 * (idx - 232);
    return rgbToHex(gray, gray, gray);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripAnsi(str) {
    if (!str) return '';
    return String(str).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  function ansiToHtml(str) {
    if (!str) return '';
    const text = String(str);
    const ansiRegex = /\x1b\[([0-9;]*)m/g;

    let html = '';
    let lastIndex = 0;
    let match;

    const currentStyle = {
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
      strikethrough: false,
      fg: null,
      bg: null
    };

    function buildStyleString() {
      const parts = [];
      let fgColor = currentStyle.fg;
      let bgColor = currentStyle.bg;

      if (currentStyle.inverse) {
        const temp = fgColor;
        fgColor = bgColor || '#ffffff';
        bgColor = temp || '#0f172a';
      }

      if (fgColor) parts.push(`color:${fgColor}`);
      if (bgColor) parts.push(`background-color:${bgColor}`);
      if (currentStyle.bold) parts.push('font-weight:700');
      if (currentStyle.dim) parts.push('opacity:0.65');
      if (currentStyle.italic) parts.push('font-style:italic');
      if (currentStyle.underline && currentStyle.strikethrough) {
        parts.push('text-decoration:underline line-through');
      } else if (currentStyle.underline) {
        parts.push('text-decoration:underline');
      } else if (currentStyle.strikethrough) {
        parts.push('text-decoration:line-through');
      }

      return parts.join(';');
    }

    let openSpan = false;

    function closeSpan() {
      if (openSpan) {
        html += '</span>';
        openSpan = false;
      }
    }

    function openNewSpan() {
      closeSpan();
      const style = buildStyleString();
      if (style) {
        html += `<span style="${style}">`;
        openSpan = true;
      }
    }

    while ((match = ansiRegex.exec(text)) !== null) {
      // Append text before this code
      const segment = text.slice(lastIndex, match.index);
      if (segment) {
        html += escapeHtml(segment);
      }
      lastIndex = ansiRegex.lastIndex;

      const codeStr = match[1] || '0';
      const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];

        if (code === 0) {
          // Reset
          currentStyle.bold = false;
          currentStyle.dim = false;
          currentStyle.italic = false;
          currentStyle.underline = false;
          currentStyle.inverse = false;
          currentStyle.strikethrough = false;
          currentStyle.fg = null;
          currentStyle.bg = null;
        } else if (code === 1) {
          currentStyle.bold = true;
        } else if (code === 2) {
          currentStyle.dim = true;
        } else if (code === 3) {
          currentStyle.italic = true;
        } else if (code === 4) {
          currentStyle.underline = true;
        } else if (code === 7) {
          currentStyle.inverse = true;
        } else if (code === 9) {
          currentStyle.strikethrough = true;
        } else if (code === 22) {
          currentStyle.bold = false;
          currentStyle.dim = false;
        } else if (code === 23) {
          currentStyle.italic = false;
        } else if (code === 24) {
          currentStyle.underline = false;
        } else if (code === 27) {
          currentStyle.inverse = false;
        } else if (code === 29) {
          currentStyle.strikethrough = false;
        } else if (code >= 30 && code <= 37) {
          // Standard foreground
          currentStyle.fg = STANDARD_16_COLORS[code - 30];
        } else if (code === 38) {
          // Extended foreground: 38;5;n or 38;2;r;g;b
          if (codes[i + 1] === 5 && i + 2 < codes.length) {
            currentStyle.fg = get256ColorHex(codes[i + 2]);
            i += 2;
          } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
            currentStyle.fg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4]);
            i += 4;
          }
        } else if (code === 39) {
          currentStyle.fg = null;
        } else if (code >= 40 && code <= 47) {
          // Standard background
          currentStyle.bg = STANDARD_16_COLORS[code - 40];
        } else if (code === 48) {
          // Extended background: 48;5;n or 48;2;r;g;b
          if (codes[i + 1] === 5 && i + 2 < codes.length) {
            currentStyle.bg = get256ColorHex(codes[i + 2]);
            i += 2;
          } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
            currentStyle.bg = rgbToHex(codes[i + 2], codes[i + 3], codes[i + 4]);
            i += 4;
          }
        } else if (code === 49) {
          currentStyle.bg = null;
        } else if (code >= 90 && code <= 97) {
          // Bright foreground
          currentStyle.fg = STANDARD_16_COLORS[code - 90 + 8];
        } else if (code >= 100 && code <= 107) {
          // Bright background
          currentStyle.bg = STANDARD_16_COLORS[code - 100 + 8];
        }
      }

      openNewSpan();
    }

    // Trailing text
    if (lastIndex < text.length) {
      html += escapeHtml(text.slice(lastIndex));
    }
    closeSpan();

    return html;
  }

  // ---------------------------------------------------------------------------
  // TerminalTab Session State
  // ---------------------------------------------------------------------------

  class TerminalTab {
    constructor(id, title = 'bash:1', options = {}) {
      this.id = id;
      this.title = title;
      this.cwd = options.cwd || '/home/learner';
      this.scrollback = []; // array of { type, text, html }
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
    }
  }

  // ---------------------------------------------------------------------------
  // Main TerminalView Emulator Class
  // ---------------------------------------------------------------------------

  class TerminalView {
    constructor(container, options = {}) {
      this.container = typeof container === 'string'
        ? (typeof document !== 'undefined' ? document.getElementById(container) : null)
        : container;

      if (!this.container) {
        throw new Error('TerminalView container element not found');
      }

      this.prompt = options.prompt || 'learner@kubelabs:~$ ';
      this.continuationPrompt = options.continuationPrompt || '> ';
      this.onExecute = options.onExecute || (async () => ({ output: '' }));
      this.onClusterStateUpdate = options.onClusterStateUpdate || (() => {});
      this.onTabChange = options.onTabChange || (() => {});
      this.onInterrupt = options.onInterrupt || (() => {});
      this.onTabComplete = options.onTabComplete || null;
      this.maxHistory = options.maxHistory || 1000;
      this.welcomeMessage = options.welcomeMessage !== undefined
        ? options.welcomeMessage
        : 'Sandboxed Cloud-Native Shell (kubectl | helm | docker | argocd | istioctl | tofu | aws | az | gcloud | trivy | aiops)\nType "help" to view available tools, or run "kubectl get pods -A" to inspect cluster.';

      // Tab Management
      this.tabCounter = 1;
      this.tabs = [new TerminalTab(`tab-${this.tabCounter}`, 'bash:1', { history: options.history })];
      this.activeTabId = this.tabs[0].id;

      this.initDom();
      this.bindEvents();

      if (this.welcomeMessage) {
        this.writeLine(this.welcomeMessage, 'system');
      }
      this.render();
    }

    // -------------------------------------------------------------------------
    // Active Tab Proxies (Backward Compatibility)
    // -------------------------------------------------------------------------

    get activeTab() {
      return this.tabs.find((t) => t.id === this.activeTabId) || this.tabs[0];
    }

    get scrollback() {
      return this.activeTab.scrollback;
    }

    set scrollback(val) {
      this.activeTab.scrollback = val;
    }

    get lineBuffer() {
      return this.activeTab.lineBuffer;
    }

    set lineBuffer(val) {
      this.activeTab.lineBuffer = val;
    }

    get cursorPos() {
      return this.activeTab.cursorPos;
    }

    set cursorPos(val) {
      this.activeTab.cursorPos = val;
    }

    get history() {
      return this.activeTab.history;
    }

    set history(val) {
      this.activeTab.history = val;
    }

    get historyIndex() {
      return this.activeTab.historyIndex;
    }

    set historyIndex(val) {
      this.activeTab.historyIndex = val;
    }

    get savedBuffer() {
      return this.activeTab.savedBuffer;
    }

    set savedBuffer(val) {
      this.activeTab.savedBuffer = val;
    }

    get isHeredoc() {
      return this.activeTab.isHeredoc;
    }

    set isHeredoc(val) {
      this.activeTab.isHeredoc = val;
    }

    get heredocDelimiter() {
      return this.activeTab.heredocDelimiter;
    }

    set heredocDelimiter(val) {
      this.activeTab.heredocDelimiter = val;
    }

    get heredocHeader() {
      return this.activeTab.heredocHeader;
    }

    set heredocHeader(val) {
      this.activeTab.heredocHeader = val;
    }

    get heredocLines() {
      return this.activeTab.heredocLines;
    }

    set heredocLines(val) {
      this.activeTab.heredocLines = val;
    }

    get isReverseSearch() {
      return this.activeTab.isReverseSearch;
    }

    set isReverseSearch(val) {
      this.activeTab.isReverseSearch = val;
    }

    get searchQuery() {
      return this.activeTab.searchQuery;
    }

    set searchQuery(val) {
      this.activeTab.searchQuery = val;
    }

    get searchMatch() {
      return this.activeTab.searchMatch;
    }

    set searchMatch(val) {
      this.activeTab.searchMatch = val;
    }

    get searchMatchIndex() {
      return this.activeTab.searchMatchIndex;
    }

    set searchMatchIndex(val) {
      this.activeTab.searchMatchIndex = val;
    }

    // -------------------------------------------------------------------------
    // Multi-Tab Management
    // -------------------------------------------------------------------------

    createTab(title, options = {}) {
      this.tabCounter += 1;
      const tabTitle = title || `bash:${this.tabCounter}`;
      const newTab = new TerminalTab(`tab-${this.tabCounter}`, tabTitle, {
        history: this.activeTab.history ? [...this.activeTab.history] : [],
        ...options
      });
      this.tabs.push(newTab);
      this.switchTab(newTab.id);
      return newTab;
    }

    switchTab(tabId) {
      const target = this.tabs.find((t) => t.id === tabId);
      if (!target || target.id === this.activeTabId) return;

      this.activeTabId = target.id;
      this.rebuildScrollbackDom();
      this.renderTabBar();
      this.render();
      this.focus();
      if (typeof this.onTabChange === 'function') {
        this.onTabChange(target);
      }
    }

    closeTab(tabId) {
      if (this.tabs.length <= 1) {
        // Reset single tab to fresh session rather than removing it
        const single = this.tabs[0];
        single.scrollback = [];
        single.lineBuffer = '';
        single.cursorPos = 0;
        single.isHeredoc = false;
        single.isReverseSearch = false;
        if (this.welcomeMessage) {
          this.writeLine(this.welcomeMessage, 'system');
        }
        this.rebuildScrollbackDom();
        this.renderTabBar();
        this.render();
        return;
      }

      const closeIdx = this.tabs.findIndex((t) => t.id === tabId);
      if (closeIdx === -1) return;

      this.tabs.splice(closeIdx, 1);

      if (this.activeTabId === tabId) {
        const nextIdx = Math.min(closeIdx, this.tabs.length - 1);
        this.activeTabId = this.tabs[nextIdx].id;
      }

      this.rebuildScrollbackDom();
      this.renderTabBar();
      this.render();
      this.focus();
    }

    renameTab(tabId, newTitle) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab && newTitle) {
        tab.title = String(newTitle).trim();
        this.renderTabBar();
      }
    }

    getTabs() {
      return this.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        active: t.id === this.activeTabId,
        cwd: t.cwd,
        scrollbackLength: t.scrollback.length
      }));
    }

    // -------------------------------------------------------------------------
    // DOM Initialization & Rendering
    // -------------------------------------------------------------------------

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
        this.tabBarEl = createMock();
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
          <div class="terminal-tab-bar" id="terminal-tab-bar" role="tablist" aria-label="Terminal Shell Sessions"></div>
          <div class="inline-terminal-scrollback" id="terminal-scrollback" role="log" aria-live="polite"></div>
          <div class="inline-terminal-active-line" id="terminal-active-line">
            <span class="inline-prompt" id="terminal-prompt-text">${escapeHtml(this.prompt)}</span>
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
      this.tabBarEl = this.container.querySelector('#terminal-tab-bar');
      this.scrollbackEl = this.container.querySelector('#terminal-scrollback');
      this.promptEl = this.container.querySelector('#terminal-prompt-text');
      this.beforeEl = this.container.querySelector('.term-text-before');
      this.cursorEl = this.container.querySelector('.term-cursor');
      this.afterEl = this.container.querySelector('.term-text-after');
      this.captureInput = this.container.querySelector('#terminal-capture-input');

      this.renderTabBar();
    }

    renderTabBar() {
      if (!this.tabBarEl || typeof document === 'undefined') return;

      const tabsHtml = this.tabs
        .map((t) => {
          const isActive = t.id === this.activeTabId;
          return `
            <button class="terminal-tab ${isActive ? 'active' : ''}" role="tab" aria-selected="${isActive}" data-tab-id="${t.id}" title="${escapeHtml(t.title)}">
              <span class="tab-indicator ${isActive ? 'active-dot' : ''}"></span>
              <span class="tab-title">${escapeHtml(t.title)}</span>
              ${this.tabs.length > 1 ? `<span class="tab-close" data-close-tab-id="${t.id}" title="Close tab">&times;</span>` : ''}
            </button>
          `;
        })
        .join('');

      this.tabBarEl.innerHTML = `
        <div class="terminal-tab-list">${tabsHtml}</div>
        <button class="terminal-tab-new" id="terminal-tab-new" title="New Terminal Session (Ctrl+Shift+T)">+ New Tab</button>
      `;

      // Wire Tab Bar Click Handlers
      this.tabBarEl.querySelectorAll('.terminal-tab').forEach((el) => {
        el.addEventListener('click', (e) => {
          const closeBtn = e.target.closest('.tab-close');
          if (closeBtn) {
            e.stopPropagation();
            const closeId = closeBtn.getAttribute('data-close-tab-id');
            if (closeId) this.closeTab(closeId);
            return;
          }
          const tabId = el.getAttribute('data-tab-id');
          if (tabId) this.switchTab(tabId);
        });
      });

      const newBtn = this.tabBarEl.querySelector('#terminal-tab-new');
      if (newBtn) {
        newBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.createTab();
        });
      }
    }

    rebuildScrollbackDom() {
      if (!this.scrollbackEl || typeof document === 'undefined') return;
      this.scrollbackEl.innerHTML = '';
      for (const item of this.scrollback) {
        this.renderScrollbackItemToDom(item);
      }
      this.scrollToBottom();
    }

    renderScrollbackItemToDom(item) {
      if (!this.scrollbackEl || typeof document === 'undefined') return;

      const lineDiv = document.createElement('div');
      lineDiv.className = `term-line term-${item.type}`;

      if (item.type === 'command') {
        lineDiv.style.color = '#f8fafc';
        lineDiv.style.fontWeight = '600';
      } else if (item.type === 'error') {
        lineDiv.style.color = '#f87171';
      } else if (item.type === 'system') {
        lineDiv.style.color = '#38bdf8';
        lineDiv.style.fontStyle = 'italic';
      } else {
        lineDiv.style.color = '#cbd5e1';
      }

      lineDiv.style.whiteSpace = 'pre-wrap';
      lineDiv.style.wordBreak = 'break-word';
      lineDiv.style.marginBottom = '0.35rem';

      // Parse ANSI escape codes into styled spans
      if (item.html) {
        lineDiv.innerHTML = item.html;
      } else {
        lineDiv.innerHTML = ansiToHtml(item.text);
      }

      this.scrollbackEl.appendChild(lineDiv);
    }

    bindEvents() {
      if (!this.wrapperEl || !this.captureInput) return;

      this.wrapperEl.addEventListener('click', () => {
        this.focus();
      });

      this.captureInput.addEventListener('input', () => {
        if (this.isReverseSearch) {
          const val = this.captureInput.value;
          this.searchQuery = val;
          this.performReverseSearch();
          this.render();
          return;
        }

        const insertChars = this.captureInput.value;
        this.captureInput.value = '';
        if (insertChars) {
          this.insertAtCursor(insertChars);
        }
      });

      this.captureInput.addEventListener('keydown', (e) => {
        this.handleKeyDown(e);
      });

      this.wrapperEl.addEventListener('keydown', (e) => {
        if (document.activeElement !== this.captureInput) {
          this.focus();
          this.handleKeyDown(e);
        }
      });

      this.captureInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
          if (text.includes('\n')) {
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

    // -------------------------------------------------------------------------
    // Keyboard Event Handling & Navigation
    // -------------------------------------------------------------------------

    handleKeyDown(e) {
      // Tab Navigation Shortcuts:
      // Ctrl+Shift+T: New Tab
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        this.createTab();
        return;
      }

      // Ctrl+Shift+W: Close Tab
      if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        this.closeTab(this.activeTabId);
        return;
      }

      // Alt+1 .. Alt+9: Switch Tab
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const targetIdx = parseInt(e.key, 10) - 1;
        if (targetIdx >= 0 && targetIdx < this.tabs.length) {
          e.preventDefault();
          this.switchTab(this.tabs[targetIdx].id);
          return;
        }
      }

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
          this.cycleReverseSearch();
        }
        return;
      }

      // 4. Ctrl+U: Clear from beginning of line to cursor
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        this.lineBuffer = this.lineBuffer.slice(this.cursorPos);
        this.cursorPos = 0;
        this.render();
        return;
      }

      // 5. Ctrl+K: Clear from cursor to end of line
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        this.lineBuffer = this.lineBuffer.slice(0, this.cursorPos);
        this.render();
        return;
      }

      // 6. Ctrl+W: Kill backward word
      if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        this.killBackwardWord();
        return;
      }

      // Reverse Search Mode Handling
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
        if (e.key === 'ArrowRight' || e.key === 'Tab') {
          e.preventDefault();
          if (this.searchMatch) {
            this.lineBuffer = this.searchMatch;
            this.cursorPos = this.lineBuffer.length;
          }
          this.cancelReverseSearch();
          this.render();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (this.searchQuery.length > 0) {
            this.searchQuery = this.searchQuery.slice(0, -1);
            if (this.captureInput) this.captureInput.value = this.searchQuery;
            this.performReverseSearch();
            this.render();
          }
          return;
        }
        return;
      }

      // Standard Navigation & Actions
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

      // Word Jump Backward: Ctrl+Left or Alt+B
      if ((e.ctrlKey && e.key === 'ArrowLeft') || (e.altKey && (e.key === 'b' || e.key === 'B'))) {
        e.preventDefault();
        this.jumpWordBackward();
        return;
      }

      // Word Jump Forward: Ctrl+Right or Alt+F
      if ((e.ctrlKey && e.key === 'ArrowRight') || (e.altKey && (e.key === 'f' || e.key === 'F'))) {
        e.preventDefault();
        this.jumpWordForward();
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

    jumpWordBackward() {
      if (this.cursorPos <= 0) return;
      let pos = this.cursorPos;
      // Skip trailing spaces
      while (pos > 0 && /\s/.test(this.lineBuffer[pos - 1])) pos--;
      // Skip word characters
      while (pos > 0 && !/\s/.test(this.lineBuffer[pos - 1])) pos--;
      this.cursorPos = pos;
      this.render();
    }

    jumpWordForward() {
      if (this.cursorPos >= this.lineBuffer.length) return;
      let pos = this.cursorPos;
      // Skip word characters
      while (pos < this.lineBuffer.length && !/\s/.test(this.lineBuffer[pos])) pos++;
      // Skip trailing spaces
      while (pos < this.lineBuffer.length && /\s/.test(this.lineBuffer[pos])) pos++;
      this.cursorPos = pos;
      this.render();
    }

    killBackwardWord() {
      if (this.cursorPos <= 0) return;
      let pos = this.cursorPos;
      while (pos > 0 && /\s/.test(this.lineBuffer[pos - 1])) pos--;
      while (pos > 0 && !/\s/.test(this.lineBuffer[pos - 1])) pos--;
      const before = this.lineBuffer.slice(0, pos);
      const after = this.lineBuffer.slice(this.cursorPos);
      this.lineBuffer = before + after;
      this.cursorPos = pos;
      this.render();
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

    setLineAndCursor(line, pos) {
      this.lineBuffer = String(line || '');
      this.cursorPos = typeof pos === 'number'
        ? Math.max(0, Math.min(this.lineBuffer.length, pos))
        : this.lineBuffer.length;
      this.render();
      this.focus();
    }

    handleMultiLinePaste(text) {
      const lines = text.split(/\r?\n/);
      if (lines.length === 1) {
        this.insertAtCursor(lines[0]);
        return;
      }

      const firstLine = lines[0];
      if (firstLine.includes('<<')) {
        this.lineBuffer = firstLine;
        this.submitLine();
        for (let i = 1; i < lines.length; i++) {
          this.lineBuffer = lines[i];
          this.submitLine();
        }
      } else {
        this.insertAtCursor(lines.join(' '));
      }
    }

    handleTabCompletion() {
      if (typeof this.onTabComplete === 'function') {
        const res = this.onTabComplete(this.lineBuffer, this.cursorPos);
        if (typeof res === 'string') {
          this.setCommand(res);
        } else if (res && typeof res === 'object') {
          if (res.line !== undefined) {
            const nextPos = typeof res.cursor === 'number' ? res.cursor : (res.cursorPos ?? res.line.length);
            this.setLineAndCursor(res.line, nextPos);
          }
          if (Array.isArray(res.completions) && res.completions.length > 1) {
            const now = Date.now();
            if (this._lastTabTime && now - this._lastTabTime < 800) {
              this.appendScrollback(`${this.prompt}${this.lineBuffer}`, 'command');
              this.appendScrollback(res.completions.join('  '), 'system');
              this.render();
              this.scrollToBottom();
            }
            this._lastTabTime = now;
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Command Submission & Execution Pipeline
    // -------------------------------------------------------------------------

    async submitLine() {
      const line = this.lineBuffer;

      // 1. Heredoc accumulation
      if (this.isHeredoc) {
        this.appendScrollback(`${this.continuationPrompt}${line}`, 'command');

        if (line.trim() === this.heredocDelimiter) {
          this.isHeredoc = false;
          const fullCommand = [this.heredocHeader, ...this.heredocLines, line.trim()].join('\n');
          this._pushHistory(fullCommand);

          this.lineBuffer = '';
          this.cursorPos = 0;
          this.heredocLines = [];
          this.heredocHeader = '';
          this.render();

          await this.executeRaw(fullCommand);
        } else {
          this.heredocLines.push(line);
          this.lineBuffer = '';
          this.cursorPos = 0;
          this.render();
        }
        return;
      }

      // 2. Check for start of Heredoc
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

      // 3. Normal single-line submission
      this.appendScrollback(`${this.prompt}${line}`, 'command');
      if (line.trim()) {
        this._pushHistory(line);
      }

      const cmdToRun = this.lineBuffer;
      this.lineBuffer = '';
      this.cursorPos = 0;
      this.render();

      if (cmdToRun.trim()) {
        await this.executeRaw(cmdToRun);
      }
    }

    _pushHistory(cmd) {
      if (!cmd || !cmd.trim()) return;
      // Deduplicate consecutive identical commands
      if (this.history.length === 0 || this.history[this.history.length - 1] !== cmd) {
        this.history.push(cmd);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }
      }
      this.historyIndex = -1;
    }

    async executeRaw(cmd) {
      try {
        const res = await this.onExecute(cmd);
        if (res) {
          if (res.clearScreen) {
            this.clear();
          } else if (res.output !== undefined && res.output !== '') {
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

    // -------------------------------------------------------------------------
    // History Navigation
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Reverse-i-search (Ctrl+R)
    // -------------------------------------------------------------------------

    startReverseSearch() {
      this.isReverseSearch = true;
      this.searchQuery = '';
      this.searchMatch = '';
      this.searchMatchIndex = -1;
      if (this.captureInput) this.captureInput.value = '';
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
      if (!q || this.history.length === 0) return;

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

      // Wrap around from end of history if not found earlier
      for (let i = this.history.length - 1; i > this.searchMatchIndex; i--) {
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
      if (this.captureInput) this.captureInput.value = '';
      this.render();
    }

    // -------------------------------------------------------------------------
    // Interrupt & Clear
    // -------------------------------------------------------------------------

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

      if (typeof this.onInterrupt === 'function') {
        this.onInterrupt();
      }
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
      const strText = String(text);
      const html = ansiToHtml(strText);
      const item = { type, text: strText, html };
      this.scrollback.push(item);
      this.renderScrollbackItemToDom(item);
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

  // Attach ANSI utility methods to TerminalView
  TerminalView.ansiToHtml = ansiToHtml;
  TerminalView.stripAnsi = stripAnsi;
  TerminalView.get256ColorHex = get256ColorHex;
  TerminalView.rgbToHex = rgbToHex;
  TerminalView.STANDARD_16_COLORS = STANDARD_16_COLORS;
  TerminalView.TerminalTab = TerminalTab;

  return TerminalView;
});
