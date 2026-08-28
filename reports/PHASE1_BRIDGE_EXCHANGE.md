# Phase 1 Bridge: Merged Standard → Governed Upsilon Operating System

**Report date:** 2026-08-28
**Baseline:** merged commits from Phase 0/1 (sigrank-standard `224505a`, sigrank-mcp `6437824`, sigrank-app `3e2e10c`, sigarena `897201b`, moses `7b57cea`)
**Authority files read:** COURSE_OF_SHIP.md, REPO_DOMAIN_OWNERSHIP_MAP.md, 90_DAY_RECONCILED_ROADMAP.md, EXECUTION_HANDOFF.md

## Executive summary

Built the bridge from the merged portable Standard into the governed Upsilon operating system across four work packages. All work is on non-main branches with PRs opened for owner review. No PRs were merged. No production was redeployed.

## PRs opened

| PR | Repo | Branch | Work package | Status |
|----|------|--------|--------------|--------|
| [#3](https://github.com/SunrisesIllneverSee/moses/pull/3) | moses | `feat/upsilon-worker-recovery` | WP1: Worker source recovery | Open |
| [#4](https://github.com/SunrisesIllneverSee/moses/pull/4) | moses | `feat/enterprise-lineage-adapter` | WP3: Enterprise lineage adapter | Open |
| [#5](https://github.com/SunrisesIllneverSee/moses/pull/5) | moses | `feat/discovery-docs-reconciliation` | WP4: Discovery/docs reconciliation | Open |
| [#44](https://github.com/SunrisesIllneverSee/sigrank-mcp/pull/44) | sigrank-mcp | `feat/standalone-conformance-gate` | WP2: Conformance gates | Open |
| [#79](https://github.com/SunrisesIllneverSee/sigrank-app/pull/79) | sigrank-app | `feat/standalone-conformance-gate` | WP2: Conformance gates | Open |

## Work package 1: Worker source recovery

**Goal:** Recover the deployed 0.4.0 MCP Worker source and reconcile it into the moses repo with Upsilon identity.

### Findings

- The `moses` repo snapshot was v0.2.0 with 21 tools, no resources, no prompts.
- The production-equivalent source was in `Moses_Enterprise_B2BPilot_/_workers/mcp-worker` at v0.4.0 with 27 tools, 6 resources, 5 prompts.
- The production source adds 6 tools: `get_lineage_chain`, `get_lineage_summary`, `get_operator_similarity`, `get_operator_system_decomposition`, `get_org_topology`, `get_outcome_correlation`.
- No tools were removed.
- The production source computes outputs from raw observations at request time (no pre-computed snapshots).

### Changes applied

- Recovered all source files: `index.js` (2338 lines), `observations.js`, `lineages.js`, and 8 JSON data files.
- Removed stale `demo_data.json` (pre-computed snapshot from v0.2.0).
- Applied Upsilon identity:
  - Health endpoint: `server: "Upsilon MCP Server"`, `product: "Upsilon"`, `governance: "MO§ES™"`, `proof_surface: "SigRank"`, interpretation-limits boundary.
  - Initialize `serverInfo`: `name: "upsilon-mcp"`, `title: "Upsilon — Enterprise Measurement Engine"`, governance + proof_surface.
  - Server card: same Upsilon identity.
- Added contract test (`tests/mcp-worker-contract.test.mjs`) asserting:
  - Exactly 27 tools, 6 resources, 5 prompts (production parity).
  - Every production tool name, resource URI, prompt name preserved.
  - Upsilon product roles present in health + initialize endpoints.
  - Interpretation-limits boundary present.
  - Write tools gated by `AUTHORIZATION_REQUIRED` + `isError: true`.

### Verification

- `node --test tests/mcp-worker-contract.test.mjs` → 11/11 pass
- `node --test tests/upsilon-architecture.test.mjs` → 4/4 pass
- `wrangler deploy --dry-run` → success (664 KiB upload)
- Live `https://mcp.mos2es.org/` confirms 27 tools / 6 resources / 5 prompts / v0.4.0

### Unresolved

- Redeployment of `moses/mcp-worker` awaits owner approval.
- The b2bpilot repo still holds a copy of the Worker source; the ownership boundary should be clarified (single source of truth in `moses` vs. b2bpilot).

## Work package 2: Cross-repository conformance gates

**Goal:** Pin the standalone Standard fixture pack in sigrank-mcp and sigrank-app CI so upstream Standard changes cannot silently alter consumer builds.

### Changes applied

#### sigrank-mcp (PR #44)

- Added `__tests__/contract/standalone-conformance.test.mjs` — validates `get_sigrank_standard_record` tool output against all 13 fixtures from sigrank-standard.
- Fixed warning order in `tools/standard-record.mjs` — cache-unavailability warnings now precede `dev10x_undefined` (matching the standalone Standard).
- CI checks out sigrank-standard at pinned ref `224505a` (configurable via `SIGRANK_STANDARD_REF` var).

#### sigrank-app (PR #79)

- Added `__tests__/mcp/standalone-conformance.test.mjs` — validates the HTTP MCP producer against all 13 fixtures.
- Fixed warning order in `lib/mcp/standard.ts` — same fix as sigrank-mcp.
- CI checks out sigrank-standard at pinned ref `224505a`.

### Conformance gate coverage

Both gates check all 13 fixtures for:
1. Schema validity (self-contained validator mirroring the standalone runner)
2. Primitive semantics (non-negative integers, null for unavailable)
3. Metric values (approximate equality)
4. Warning order (ordered array comparison)
5. Version declaration (`sigrank/0.1-draft`)
6. Alias translation (`cache_creation` → `cache_write`, no alias leak)
7. Content independence (no forbidden fields in telemetry or record)
8. Required fields (spec, timestamp, source, telemetry, metrics)
9. Extension exclusion (no Construction, RS05, Scale V, rank, percentile)
10. Required metrics (yield, leverage, velocity, snr, dev10x)
11. Provenance (provider, model, tool)

Additional tests assert:
- Construction/Build Archetypes/RS05/Scale V/rank/percentile cannot leak into portable record.
- Null/zero cache telemetry preserves distinct semantics.

### Verification

**sigrank-mcp:**
- `node __tests__/contract/standalone-conformance.test.mjs` → 3/3 pass
- `npm test` → all pass (cascade, badges, sign, standard-record, standard-cli, product-architecture, tui-input, omp-cache)
- `npm run test:packaged` → ok

**sigrank-app:**
- `npx tsc --noEmit` → 0 errors
- `npm run test:canonical` → 11/11 pass
- `node --test __tests__/mcp/*.test.mjs` → 70/70 pass

### Pin mechanism

The Standard ref is pinned via the `SIGRANK_STANDARD_REF` GitHub variable (default `224505a`). Bumping the ref is a reviewable commit that explicitly signals "we are consuming a new version of the fixture pack."

## Work package 3: Enterprise lineage adapter

**Goal:** Build a versioned Upsilon enterprise-observation adapter accepting `sigrank/0.1-draft`.

### Changes applied

- Created `enterprise-adapter/adapter.mjs` — the adapter module.
- Created `enterprise-adapter/upsilon-enterprise-observation.schema.json` — the enterprise observation schema.
- Created `enterprise-adapter/README.md` — documentation.
- Created 4 fixtures: complete-telemetry, partial-cache, zero-values, invalid-version.
- Created `tests/enterprise-adapter.test.mjs` — 15 tests.

### Namespace separation

```text
sigrank/0.1-draft portable record
  spec, timestamp, source, telemetry, metrics, warnings
        ↓ (adapter accepts this as input)
upsilon/enterprise-adapter/0.1-draft enterprise observation
  portable:   (preserved verbatim — spec, telemetry, metrics, warnings)
  enterprise: (separate namespace — cohort, window, lineage, derivations)
```

### What the adapter preserves

- Source I/O/W/R telemetry (non-negative integers, null for unavailable)
- Observed zero versus unavailable/null (distinct semantics)
- Timestamp and observation window
- Provider/model/tool source
- Collector version
- Standard version (`sigrank/0.1-draft`)
- Provenance and warnings

### What the adapter adds (enterprise namespace only)

- `cohort_id`, `window`, `lineage`, `derivations`, `collector_version`, `privacy_mode`, `governance_label`
- Construction, composite scores, outcome correlations — **never** in the portable namespace

### What the adapter rejects

- Records not declaring `sigrank/0.1-draft`
- Records with enterprise leaks in portable metrics/fields
- Records missing required fields
- Records with negative telemetry
- Pilot manifests with `personnel_action: true` or `content_inspection: true`

### Verification

- `node --test tests/enterprise-adapter.test.mjs` → 15/15 pass
- `node --test tests/` (all) → 30/30 pass

## Work package 4: Discovery/docs reconciliation

**Goal:** Align mos2es.org discovery metadata with the Upsilon identity applied in WP1.

### Changes applied

- Added `.well-known/mcp.json` with Upsilon product roles, correct counts (27 tools, 6 resources, 5 prompts), and interpretation-limits boundary.
- Updated `openapi.json` with `x-product`, `x-governance`, `x-proof-surface`, `x-interpretation-limits` extensions.
- Fixed `docs.html`: 21→27 tools, added 6 resources + 5 prompts.
- Fixed `llms.txt`: 21→27 tools, 16→22 read, added resources + prompts counts.

### What this reconciles

The live `mos2es.org/.well-known/mcp.json` still shows `MO§ES™ MCP Server` and `prompts: false`. The static source is now reconciled; redeployment of the static site is required for the live endpoint to reflect these changes.

### Verification

- `node --test tests/` (all) → 30/30 pass
- `.well-known/mcp.json` matches Worker health metadata

## Test summary

| Repo | Test suite | Result |
|------|-----------|--------|
| moses | `tests/mcp-worker-contract.test.mjs` | 11/11 pass |
| moses | `tests/upsilon-architecture.test.mjs` | 4/4 pass |
| moses | `tests/enterprise-adapter.test.mjs` | 15/15 pass |
| moses | all tests | 30/30 pass |
| sigrank-mcp | `standalone-conformance.test.mjs` | 3/3 pass |
| sigrank-mcp | `npm test` (full suite) | all pass |
| sigrank-mcp | `npm run test:packaged` | ok |
| sigrank-app | `npx tsc --noEmit` | 0 errors |
| sigrank-app | `npm run test:canonical` | 11/11 pass |
| sigrank-app | `node --test __tests__/mcp/*.test.mjs` | 70/70 pass |

## Schema/fixture versions

- Standard ref consumed: `224505a` (sigrank-standard merged baseline)
- Standard wire identifier: `sigrank/0.1-draft`
- Adapter version: `upsilon/enterprise-adapter/0.1-draft`
- Pilot manifest version: `mos2es/pilot-manifest/0.1-draft`
- Worker version: `0.4.0`
- Fixture count: 13 (including enterprise-adapter-lineage fixture)

## Unresolved decisions (owner)

1. **Worker redeployment:** The recovered 0.4.0 source is ready to redeploy but awaits owner approval.
2. **Static site redeployment:** The discovery metadata changes await owner approval to deploy.
3. **b2bpilot ownership boundary:** The b2bpilot repo still holds a copy of the Worker source. Should `moses` be the single source of truth, or should b2bpilot remain authoritative?
4. **PR merges:** All 5 PRs are open and await owner review/approval.
5. **Standard ref bump policy:** Should the `SIGRANK_STANDARD_REF` variable be set as a repo variable or an org-level variable?

## Claims and evidence level

| Claim | Evidence |
|-------|----------|
| Production Worker has 27 tools, 6 resources, 5 prompts | Live `https://mcp.mos2es.org/` health endpoint + `tools/list` |
| Recovered source matches production | Contract test 11/11 pass + `wrangler deploy --dry-run` success |
| MCP producer passes standalone fixtures | Conformance gate 3/3 pass (sigrank-mcp) + 3/3 pass (sigrank-app) |
| Enterprise adapter preserves namespace separation | 15/15 adapter tests pass |
| Discovery metadata is reconciled | `.well-known/mcp.json` matches Worker health metadata |

## Next dependency

The next dependency (not just next available ticket) is **owner approval to merge PR #3** (Worker source recovery). Once merged, the Worker can be redeployed to production, and the discovery metadata (PR #5) can be deployed to the static site. The conformance gates (PR #44, #79) and enterprise adapter (PR #4) can merge independently but are most valuable when the Worker is redeployed.
