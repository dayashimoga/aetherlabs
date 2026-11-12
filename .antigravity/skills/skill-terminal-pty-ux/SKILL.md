---
name: skill-terminal-pty-ux
description: Builds the inline interactive terminal emulator, AST shell parser, tab-completion engine, and context-aware mobile touch bar.
---

# skill-terminal-pty-ux

## Purpose
Delivers an authentic xterm-style inline terminal emulator, robust command AST tokenizer, live autocompletion, and ergonomic mobile touch interactions.

## Guidelines
1. **Inline Terminal Emulator**: Maintain an inline prompt (`learner@kubelabs:~$ `) with blinking cursor, arrow-key navigation, word jumping, history browsing (`↑`/`↓`), reverse-i-search (`Ctrl+R`), interrupt (`Ctrl+C`), and clear (`Ctrl+L`).
2. **Multi-Line Heredoc**: Support `cat <<EOF > manifest.yaml` constructs for writing multi-line YAML files directly from the terminal.
3. **Context-Aware Quick-Key Bar**: Quick-key buttons must insert tokens at the active cursor position with proper spacing and grammar order (preventing syntax inversions like `describe kubectl`).
4. **Live Resource Autocompletion**: Tab completion must introspect the live ResourceGraph to suggest dynamic pod names, namespaces, service names, flags, and VFS file paths.

