const fs = require('fs');
const path = require('path');
const { IncidentEngine } = require('../src/core/incidentEngine');
const { ProjectEngine } = require('../src/core/projectEngine');
const { CertificationEngine } = require('../src/core/certificationEngine');

const incidentEngine = new IncidentEngine();
const projectEngine = new ProjectEngine();
const certEngine = new CertificationEngine();

const domainsDir = path.join(__dirname, '..', 'src', 'curriculum', 'domains');
const files = fs.readdirSync(domainsDir).filter(f => f.endsWith('.json')).sort();

let md = '# Master Curriculum Catalog & Learning Path Matrix\n\n';
md += '**Document ID**: CURR-KUBELABS-2026-001  \n';
md += '**Version**: 4.0.0 (Full-Stack Transformation Edition)  \n';
md += '**Coverage**: 45 Domains | 7 Tiers | 6 Guided Role Tracks | 90 Hands-On Labs | 25 Live Production Incident Simulations | 8 Production Capstone Projects (26 Milestones) | 8 Enterprise Reference Architectures | 6 Verifiable Performance Certification Simulators\n\n';
md += '---\n\n';

md += '## 1. Guided Role Learning Paths\n\n';
md += '```mermaid\n';
md += 'flowchart LR\n';
md += '    T1["Track 1: Cloud-Native Foundations"] --> T2["Track 2: Kubernetes & GitOps Admin (CKA/CKAD)"]\n';
md += '    T2 --> T3["Track 3: DevSecOps & Zero-Trust (CKS)"]\n';
md += '    T2 --> T4["Track 4: SRE, Service Mesh & Resilience"]\n';
md += '    T3 --> T5["Track 5: Platform Engineering & Cloud Architect"]\n';
md += '    T4 --> T5\n';
md += '    T5 --> T6["Track 6: Multi-Cloud, Cloud Architecture & Autonomous AI-Ops"]\n';
md += '```\n\n';

md += '| Track ID | Role Title | Primary Focus | Performance Certification Simulator |\n';
md += '|---|---|---|---|\n';
md += '| `track-foundations` | Cloud-Native Systems Engineer | Linux, Cgroups v2, Containers, Networking, Git | `perf-exam-kcna` (KCNA-SIM, 60m, 4 tasks) |\n';
md += '| `track-k8s-admin` | Kubernetes & GitOps Administrator | Kubernetes Core, CKA/CKAD, Helm, GitOps, CI/CD | `perf-exam-cka` (CKA-SIM, 120m, 5 tasks) |\n';
md += '| `track-devsecops` | DevSecOps & Zero-Trust Specialist | CKS Security, Policy-as-Code, Tetragon, SPIFFE | `perf-exam-cks` (CKS-SIM, 120m, 5 tasks) |\n';
md += '| `track-sre` | Principal SRE & Chaos Engineer | Observability, SLOs, Prometheus, Chaos, KEDA | `perf-exam-ckre` (CKRE-SIM, 90m, 4 tasks) |\n';
md += '| `track-platform` | Platform Engineering & Architect | IDP, Backstage, Crossplane, OpenTofu, CAPI, Arch | `perf-exam-cpa` (CPA-SIM, 90m, 4 tasks) |\n';
md += '| `track-multicloud-aiops` | Multi-Cloud & AI-Ops Principal | Multi-Cloud, CQRS, C4, GPU Serving & AI-Ops | `perf-exam-cmaos` (CMAOS-SIM, 90m, 4 tasks) |\n\n';
md += '---\n\n';

md += '## 2. 7-Tier Curriculum Specification (Domains 01–45 & 90 Labs)\n\n';

const tiers = [
  { name: 'Tier 1: Linux & OS Foundations', range: [1, 4] },
  { name: 'Tier 2: Container Runtime & Packaging', range: [5, 8] },
  { name: 'Tier 3: Kubernetes Core & Certification Track', range: [9, 15] },
  { name: 'Tier 4: GitOps, CI/CD & Infrastructure as Code', range: [16, 22] },
  { name: 'Tier 5: Service Mesh, Observability & Reliability', range: [23, 34] },
  { name: 'Tier 6: High-Scale Ops, Multi-Cluster, Platform & Security', range: [35, 42] },
  { name: 'Tier 7: Architecture Patterns, FinOps & Autonomous AIOps', range: [43, 45] }
];

files.forEach((f, i) => {
  const domainNum = i + 1;
  const d = JSON.parse(fs.readFileSync(path.join(domainsDir, f), 'utf8'));

  const matchingTier = tiers.find(t => domainNum >= t.range[0] && domainNum <= t.range[1]);
  if (matchingTier && (domainNum === matchingTier.range[0])) {
    md += `### ${matchingTier.name}\n\n`;
  }

  const paddedNum = String(domainNum).padStart(2, '0');
  md += `#### Domain ${paddedNum}: ${d.title} (\`${d.id}\`)\n\n`;
  md += `- **Track**: \`${d.trackId}\` | **Category**: ${d.category} | **Difficulty**: ${d.difficulty || 'Intermediate'}\n`;
  md += `- **Prerequisites**: ${(d.prerequisites && d.prerequisites.length) ? d.prerequisites.join(', ') : 'None'}\n`;
  md += `- **Summary**: ${d.summary || 'Master enterprise cloud-native patterns and practices.'}\n`;
  md += `- **Interactive Hands-On Labs (2)**:\n`;
  d.labs.forEach((l, lIdx) => {
    md += `  ${lIdx + 1}. \`${l.id}\`: **${l.title}** — ${l.description || l.summary || 'Hands-on deterministic terminal scenario.'}\n`;
  });
  md += '\n';
});

md += '---\n\n';
md += '## 3. Real-World Multi-Milestone Capstone Projects (26 Milestones)\n\n';
md += '| Project ID | Career Track | Project Title | Milestones | Total XP |\n';
md += '|---|---|---|---|---|\n';

const projects = projectEngine.listProjects();
projects.forEach(p => {
  const msList = p.milestones.map((m, idx) => `${idx + 1}. ${m.title}`).join('<br/>');
  const totalXp = p.milestones.reduce((acc, m) => acc + (m.xp || 100), 0);
  md += `| \`${p.id}\` | \`${p.trackId}\` | ${p.title} | ${msList} | ${totalXp} XP |\n`;
});

md += '\n---\n\n';
md += '## 4. Live Production Incident Simulations (25 Chaos War Room Outages)\n\n';
md += '| Incident ID | Severity | Category | MTTR Budget | Root Cause & Resolution |\n';
md += '|---|---|---|---|---|\n';

const incidents = incidentEngine.getWarRoomScenarios();
incidents.forEach(inc => {
  md += `| \`${inc.id}\` | ${inc.severity} | \`${inc.category}\` | ${inc.mttrBudgetMinutes || 10} min | ${inc.title}: ${inc.description ? inc.description.slice(0, 140) + '...' : 'Remediate cluster outage and verify recovery.'} |\n`;
});

md += '\n---\n\n';
md += '## 5. Hands-On Practical Performance Certification Simulators\n\n';
md += '| Exam Code | Exam ID | Role Track | Duration | Passing Score | Tasks | Verification Engine |\n';
md += '|---|---|---|---|---|---|---|\n';

const exams = certEngine.listPerformanceExams();
exams.forEach(e => {
  md += `| **${e.code}** | \`${e.id}\` | \`${e.trackId}\` | ${e.durationMinutes} min | ${e.passingScorePercent}% | ${e.taskCount} tasks | Dual Ed25519 & HMAC-SHA256 |\n`;
});

md += '\n';
fs.writeFileSync(path.join(__dirname, '..', 'docs', '07-CURRICULUM-CATALOG.md'), md, 'utf8');
console.log('Successfully generated docs/07-CURRICULUM-CATALOG.md (' + md.length + ' bytes)');
