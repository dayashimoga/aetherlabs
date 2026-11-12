---
name: skill-cli-ast-parser
description: Implements POSIX lexical tokenization, pipe streaming, jq/JSONPath evaluation, and multi-binary CLI emulators (kubectl, helm, etcdctl, kubeadm, istioctl, cilium, argocd, flux, velero, trivy, falco, aws).
---

# Multi-CLI AST Parser & Shell Engine Skill (`skill-cli-ast-parser`)

## Role & Mission
Implements production-grade POSIX shell tokenization, Abstract Syntax Tree (AST) parsing, pipeline streaming, JSONPath/jq filtering, and high-fidelity cloud-native command-line tool emulation in `src/core/terminalEngine.js`.

## Scope & Capabilities
1. **Lexical Tokenizer & AST Pipeline**:
   - Quote-aware argument extraction (single, double quotes, escape sequences).
   - Shell control operators: pipe (`|`), sequential (`&&`, `||`, `;`), output redirection (`>`, `>>`), and input heredocs (`<<EOF`).
   - Environment variable expansion (`$VAR`, `${VAR}`) and tab completion provider.
2. **Kubernetes Multi-Command Fidelity (`kubectl`)**:
   - `get`, `describe`, `apply`, `create`, `delete`, `edit`, `patch`, `scale`, `autoscale`, `rollout`, `logs`, `exec`, `debug`, `top`, `cordon`, `uncordon`, `drain`, `taint`, `label`, `annotate`, `auth can-i`, `explain`, `diff`, `wait`, `config`.
   - Flags: `-n`, `--namespace`, `-A`, `--all-namespaces`, `-o=json|yaml|wide|jsonpath='...'`, `-l`, `--selector`, `-p`, `--patch`, `--dry-run=client|server`.
3. **Cloud-Native CLI Emulators**:
   - `helm`: `install`, `upgrade`, `list`, `rollback`, `uninstall`, `repo`.
   - `etcdctl`: `snapshot save`, `snapshot restore`, `endpoint health`, `member list`.
   - `kubeadm`: `upgrade plan`, `upgrade apply`, `certs check-expiration`, `certs renew`.
   - `istioctl`: `analyze`, `proxy-status`, `proxy-config`.
   - `cilium`: `status`, `connectivity test`, `hubble observe`.
   - `argocd` & `flux`: `app list`, `app get`, `app sync`, `reconcile kustomization`, `check`.
   - `velero`: `backup create`, `restore create`, `schedule create`.
   - `trivy` & `falco` & `cosign`: Container vulnerability scanning, runtime syscall rule auditing, and signature verification.
   - `aws`: EKS (`describe-cluster`, `update-kubeconfig`), IAM (IRSA role assumption), STS (`get-caller-identity`).
   - `tofu` / `terraform`: `init`, `plan`, `apply`, `state list`, `show`.
   - `vcluster` & `crossplane`: `create`, `list`, `connect`, `status`.
4. **POSIX Core Utilities**:
   - `cat`, `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `echo`.
   - `grep`, `awk`, `sed`, `jq`, `openssl`.
   - `curl`, `dig`, `nslookup`, `ping`, `ip`, `ss`.
   - `ps`, `top`, `df`, `free`, `uname`, `whoami`, `id`.
   - `systemctl` (`status`, `restart`, `start`, `enable`), `journalctl`.

## Invariants
- 100% sandboxed execution: No calls to `child_process.exec`, `spawn`, or host shell. Everything mutates and inspects the virtual cluster and POSIX virtual filesystem state.
- Zero regex-based pass/fail grading: Command output is produced deterministically from cluster state.

