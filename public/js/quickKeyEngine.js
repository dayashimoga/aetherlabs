'use strict';

/**
 * KubeLabs Context-Aware Quick-Key Engine (v3.0.0)
 * 
 * Provides grammar-aware token insertion for mobile and desktop quick-key bars.
 * 
 * Guarantees:
 * 1. Correct syntax order: Always ensures root binary (kubectl) before action verbs
 *    (preventing "describe kubectl" bug).
 * 2. Intelligent verb replacement: Tapping "describe" when line has "kubectl get"
 *    cleanly swaps the verb without duplication.
 * 3. Resource chaining: Tapping "svc" after "pods" generates valid multi-resource "pods,svc".
 * 4. Automatic pipe wrapping: Tapping "grep" inserts " | grep " when needed.
 * 5. Space normalization: Zero double-spaces and clean cursor positioning.
 * 6. Non-premature execution: Never auto-executes incomplete commands.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ContextAwareQuickKeyEngine = factory();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  const VERBS = ['get', 'describe', 'apply -f', 'delete', 'scale', 'logs', 'top', 'explain'];
  const RESOURCES = ['pods', 'svc', 'deploy', 'nodes', 'namespaces', 'services', 'deployments', 'configmaps', 'secrets', 'networkpolicies'];

  class ContextAwareQuickKeyEngine {
    static normalizeToken(raw) {
      if (!raw) return '';
      return String(raw).trim();
    }

    /**
     * Intelligently computes the new command buffer and cursor position.
     * 
     * @param {string} currentLine Current command line buffer
     * @param {number} cursorPos Current cursor position
     * @param {string} rawToken Tapped chip token
     * @returns {{ line: string, cursorPos: number }}
     */
    static insertToken(currentLine = '', cursorPos = 0, rawToken = '') {
      const token = this.normalizeToken(rawToken);
      if (!token) return { line: currentLine, cursorPos };

      const line = String(currentLine || '');
      const pos = typeof cursorPos === 'number' ? Math.max(0, Math.min(line.length, cursorPos)) : line.length;
      const trimmed = line.trim();

      // ------------------------------------------------------------------
      // Rule 1: Empty command line -> Autoprefix root binary (kubectl)
      // ------------------------------------------------------------------
      if (!trimmed) {
        if (token === 'kubectl') {
          return { line: 'kubectl ', cursorPos: 8 };
        }
        if (VERBS.includes(token)) {
          const newLine = `kubectl ${token} `;
          return { line: newLine, cursorPos: newLine.length };
        }
        if (RESOURCES.includes(token)) {
          const newLine = `kubectl get ${token} `;
          return { line: newLine, cursorPos: newLine.length };
        }
        if (token === '-n') {
          const newLine = `kubectl get pods -n `;
          return { line: newLine, cursorPos: newLine.length };
        }
        if (token === 'grep') {
          const newLine = `kubectl get pods | grep `;
          return { line: newLine, cursorPos: newLine.length };
        }
        if (token === '|') {
          return { line: '', cursorPos: 0 };
        }
        const newLine = `${token} `;
        return { line: newLine, cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 2: Token is 'kubectl'
      // ------------------------------------------------------------------
      if (token === 'kubectl') {
        if (trimmed.startsWith('kubectl') || trimmed.startsWith('k ') || trimmed === 'k') {
          const finalLine = line.endsWith(' ') ? line : `${line} `;
          return { line: finalLine, cursorPos: finalLine.length };
        }
        // If line started with bare verb due to manual typing, prefix kubectl
        const newLine = `kubectl ${line}`.replace(/\s+/g, ' ');
        return { line: newLine, cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 3: Action Verbs (get, describe, apply -f, delete, scale, logs)
      // ------------------------------------------------------------------
      if (VERBS.includes(token)) {
        if (trimmed === 'kubectl' || trimmed === 'k') {
          const newLine = `kubectl ${token} `;
          return { line: newLine, cursorPos: newLine.length };
        }

        // Check if command already has a verb right after kubectl: e.g. "kubectl get"
        const verbMatch = trimmed.match(/^(k|kubectl)\s+([a-z-]+)(.*)$/);
        if (verbMatch) {
          const existingVerb = verbMatch[2];
          const rest = verbMatch[3];

          // If different verb: swap cleanly (prevent "kubectl get describe")
          if (VERBS.includes(existingVerb) && existingVerb !== token) {
            const newLine = `kubectl ${token}${rest}`.trim() + ' ';
            return { line: newLine, cursorPos: newLine.length };
          }
          if (existingVerb === token) {
            const finalLine = line.endsWith(' ') ? line : `${line} `;
            return { line: finalLine, cursorPos: finalLine.length };
          }
        }

        // If after pipe (e.g. `cat file.yaml | `)
        if (trimmed.endsWith('|')) {
          const newLine = `${trimmed} kubectl ${token} `;
          return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
        }

        const newLine = line.endsWith(' ') ? `${line}${token} ` : `${line} ${token} `;
        return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 4: Resource Kinds (pods, svc, deploy, etc.)
      // ------------------------------------------------------------------
      if (RESOURCES.includes(token)) {
        if (trimmed === 'kubectl' || trimmed === 'k') {
          const newLine = `kubectl get ${token} `;
          return { line: newLine, cursorPos: newLine.length };
        }

        // If line ends with a verb: e.g. "kubectl get", "kubectl describe"
        const endsWithVerb = VERBS.some((v) => trimmed.endsWith(` ${v}`) || trimmed === v);
        if (endsWithVerb) {
          const newLine = line.endsWith(' ') ? `${line}${token} ` : `${line} ${token} `;
          return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
        }

        // Multi-resource comma concatenation: e.g. "kubectl get pods" + "svc" -> "kubectl get pods,svc "
        const words = trimmed.split(/\s+/);
        const lastWord = words[words.length - 1];
        if (RESOURCES.includes(lastWord)) {
          if (lastWord === token) {
            const finalLine = line.endsWith(' ') ? line : `${line} `;
            return { line: finalLine, cursorPos: finalLine.length };
          }
          if (words.includes('get')) {
            const newLine = `${trimmed},${token} `;
            return { line: newLine, cursorPos: newLine.length };
          }
        }

        const newLine = line.endsWith(' ') ? `${line}${token} ` : `${line} ${token} `;
        return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 5: Flag '-n'
      // ------------------------------------------------------------------
      if (token === '-n') {
        if (trimmed.includes(' -n ') || trimmed.endsWith(' -n')) {
          const finalLine = line.endsWith(' ') ? line : `${line} `;
          return { line: finalLine, cursorPos: finalLine.length };
        }
        const newLine = line.endsWith(' ') ? `${line}-n ` : `${line} -n `;
        return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 6: Pipe '|'
      // ------------------------------------------------------------------
      if (token === '|') {
        if (trimmed.endsWith('|')) {
          return { line: `${trimmed} `, cursorPos: trimmed.length + 1 };
        }
        const newLine = line.endsWith(' ') ? `${line}| ` : `${line} | `;
        return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 7: Filter 'grep'
      // ------------------------------------------------------------------
      if (token === 'grep') {
        if (trimmed.endsWith('|')) {
          const newLine = `${trimmed} grep `;
          return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
        }
        if (trimmed.includes('| grep') || trimmed.endsWith('| grep')) {
          const finalLine = line.endsWith(' ') ? line : `${line} `;
          return { line: finalLine, cursorPos: finalLine.length };
        }
        const newLine = line.endsWith(' ') ? `${line}| grep ` : `${line} | grep `;
        return { line: newLine.replace(/\s+/g, ' '), cursorPos: newLine.length };
      }

      // ------------------------------------------------------------------
      // Rule 8: Generic Token Insertion (Cursor-aware)
      // ------------------------------------------------------------------
      const before = line.slice(0, pos);
      const after = line.slice(pos);
      const needLeadingSpace = before.length > 0 && !before.endsWith(' ');
      const needTrailingSpace = after.length > 0 && !after.startsWith(' ');
      const inserted = `${needLeadingSpace ? ' ' : ''}${token}${needTrailingSpace ? ' ' : ' '}`;
      const newLine = `${before}${inserted}${after}`;
      const newPos = before.length + inserted.length;

      return { line: newLine, cursorPos: newPos };
    }
  }

  return ContextAwareQuickKeyEngine;
});
