# Sprint 10.2 Automated Entry Review

## Current Decision

**INCOMPLETE / NOT_READY — manual rehearsal and entry gates pending.** Sprint 10.2 is not complete.
This is an automated pre-rehearsal assessment, not the final Evaluation Entry
Review. No human observation, consent, accessibility result, timing result,
scenario completion or cleanup confirmation has been recorded.

The user authorized Sprint 10.2 internal rehearsal with Curt Vance as moderator
and evidence/cleanup owner. The automated dependency audit triggered the
[runbook](evaluation/sprint-10/moderator-runbook.md) entry rule: unresolved
critical/high findings block progression and require owner review. Curt then
explicitly authorized bounded dependency remediation. That dependency blocker
is now resolved with fresh passing audits and compatibility checks below.
No application server, human rehearsal or Sprint 10.3 session was started.

## Initial Candidate Inspected (Before Remediation)

- Base HEAD: `96d205c976ed8413686df2dd28ca144df04eb5f7`.
- Working tree: uncommitted Sprint 10.0/10.1 documentation, verification and
  package-script changes; it is not a clean commit identifying those milestones.
- Generated local build ID: `aRO92kl517NcXL52ZT_ei`.
- Materials version: `sprint-10.1-materials-v1`.
- No changes to application code, fixtures, migrations or package-lock.json
  were found in the inspected diff. Candidate acceptance is withheld; any
  dependency remediation requires a new build and renewed entry evidence.
- Report clock reading: `2026-09-09 14:49:32 UTC`, obtained from the clock tool
  after automated commands. This is not a timestamp for any human action.

## Initial Automated Results (Before Remediation)

- PASS: Sprint 10 planning and materials verifiers, including all six mappings,
  blank template values, negative checks and automated fixture contracts.
- PASS: 24 existing verifier entry points covering prototype, AI foundation,
  execution, read model, journal, progress, end-to-end contracts, grounding,
  deterministic workflow, fictional experience, provider deferral, runtime,
  identity, migration-source readiness, operational evidence, hardening,
  validation gate, integrated verification and Sprint 9 certification.
- PASS: ESLint, non-incremental no-emit TypeScript, diff whitespace and local
  production build. Build-only network access fetched existing Google fonts;
  this was not deployment or evaluation runtime traffic.
- FAIL: fresh `npm audit --json`, exit code 1, reported one critical and two
  high-severity affected packages. Historical dependency-audit PASS statements
  do not replace this current result.
- REVIEW REQUIRED: `npm ls --depth=0` exited 0 but reported six extraneous
  optional/WASM-related packages; this is not a clean dependency-inventory PASS.
- No `.env*` files or credential-like variable names were detected by the
  scoped preflight in the tool process. This does not certify Curt's future
  terminal environment or browser profile.
- No listener on port 3000 was returned by the local listener check. A future
  server's binding and browser requests still require verification.

## Initial Blocking Dependency Findings (Historical)

These are the fresh npm audit findings, not an exploit reproduction:

| Package | Installed version | Audit severity | Reported advisories |
| --- | --- | --- | --- |
| next | 16.3.0 | critical | [Windows-hosted server RCE](https://github.com/advisories/GHSA-p293-qw3h-jr36); [AVIF image optimization RCE](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) |
| sharp | 0.35.3 | high | [libheif vulnerabilities](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) |
| js-yaml | 4.3.1 (subsequently confirmed by inventory) | high | [CPU exhaustion through empty merge sources](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |

Issue reference: `S10.2-ENTRY-DEPENDENCIES`. This initially blocked progression
pending Curt's review. The authorized remediation below resolves this dependency
issue; it does not waive any manual entry gate.

## Authorized Bounded Dependency Remediation

| Package | Before | After | Scope |
| --- | --- | --- | --- |
| next | 16.3.0 | 16.3.3 | Minimum patched floor on the existing 16.x line for both reported critical advisories; exact direct pin |
| sharp | 0.35.3 | 0.35.4 | Minimum patched floor; existing Next.js optional range `^0.35.3` admits it |
| js-yaml | 4.3.1 | 4.3.2 | Minimum patched 4.x floor; existing `@eslint/eslintrc` range `^4.3.0` admits it |

The advisory links above identify these patched floors; published npm metadata
confirms compatible Node/React peer requirements and transitive ranges. Normal
npm commands updated package.json and package-lock.json:

```powershell
npm.cmd install next@16.3.3 --save-exact --ignore-scripts --no-audit --no-fund
npm.cmd update sharp js-yaml --ignore-scripts --no-audit --no-fund
npm.cmd ci --ignore-scripts --no-audit --no-fund
```

No forced audit fix, dependency override, direct Sharp/js-yaml declaration,
application code change, major framework upgrade or architecture change was
introduced. React/React DOM, PostgreSQL, ESLint/eslint-config-next, TypeScript,
Tailwind, PostCSS and nanoid versions remain unchanged. Framework security
behavior changes include patched AVIF handling; this app has no `next/image`
or untrusted image-processing workflow requiring a compatibility change.

The lockfile review found 40 changed package entries plus the root Next.js pin,
with no package paths added or removed. Besides the three targets, changes are
the matching `@next/env`/eight SWC builds, required `@swc/helpers` 0.5.15 to
0.5.23, Sharp's platform binaries/libvips 1.3.2 to 1.3.3, and required WASM
support `@emnapi/runtime` 1.11.2 to 1.11.3. Sharp's new WASM package explicitly
requires `^1.11.3`; this is not an unrelated upgrade. An executable diff check
confirmed no changed package outside these dependency families.

## Patched Candidate Verification

- PASS: reproducible `npm ci` from the updated lockfile with lifecycle scripts
  disabled; installed Next.js/Sharp/js-yaml versions match the patched lockfile.
- PASS: full `npm audit --json` and production-only `npm audit --omit=dev --json`
  after that install, both exit 0 with zero critical, high, moderate, low or
  informational findings. The dependency-security entry gate is satisfied.
- PASS: both Sprint 10 package verifiers and the same 24 regression entry points
  listed in the initial automated results, rerun from fresh TypeScript output.
- PASS: ESLint, non-incremental no-emit TypeScript, local production build and
  diff whitespace. Static route output remains unchanged. No server was started.
- Inventory note: `npm ls --depth=0` exits 0 and still labels two optional
  packages (`@img/sharp-wasm32` 0.35.4 and `@emnapi/runtime` 1.11.3) extraneous
  on this Windows install, including after `npm ci`. Both match the lockfile's
  Sharp WASM chain; neither is an unexpected upgrade or a remaining audit finding.
  This is not described as an extraneous-free installation.
- Patched build ID: `r9QZ01ir5ClfIwZUrtit4`.
- Lockfile SHA-256: `694b99e8ae578f80e30d12ea03181616386707a754e02dd83137e35b4f0e5081`.
- Base HEAD remains `96d205c976ed8413686df2dd28ca144df04eb5f7`; the candidate
  includes uncommitted preparation, dependency and documentation changes.
- Report clock reading after verification: `2026-09-09 15:01:41 UTC`.
  This is automated evidence timing only, not a human observation timestamp.

The earlier build and dependency evidence is superseded for candidate selection.
No manual result has been created, inferred or converted into a PASS.

## Pending Manual Work

All manual gates remain unperformed: approval of evidence location and browser/
device coverage; local surface verification; moderator/task rehearsal;
accessibility/usability; actual timing and observation recording; stop drill;
evidence procedure; reset and cleanup confirmation; and final entry review.

The proposed evidence location has not been approved or created. No local human
evidence file has been populated. The repository master templates remain blank.
This document contains automated findings only and must never be counted as
participant evidence or a completed internal rehearsal.

The intended future URL remains `http://127.0.0.1:3000/prototype`, fixture mode
only. Do not start the server as part of this remediation. Manual setup and
rehearsal checkpoints remain pending. READY, if later supported,
will remain a recommendation for consideration only; Sprint 10.3 needs separate
explicit authorization.
