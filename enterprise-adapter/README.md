# Upsilon Enterprise Lineage Adapter

**Version:** `upsilon/enterprise-adapter/0.1-draft`
**Accepts:** `sigrank/0.1-draft` portable observations
**Governance:** MO§ES™
**Product:** Upsilon
**Proof surface:** SigRank (for eligible observations only)

## Purpose

The enterprise lineage adapter bridges the portable SigRank Standard
(`sigrank/0.1-draft`) into Upsilon's governed enterprise observation
namespace. It preserves the portable core (I/O/W/R + five metrics) while
adding enterprise derivations in a **separate namespace** that never
leaks into the portable record.

## Namespace separation

```text
sigrank/0.1-draft portable record
  spec, timestamp, source, telemetry, metrics, warnings
        ↓ (adapter accepts this as input)
upsilon/enterprise-adapter/0.1-draft enterprise observation
  portable:   (preserved verbatim — spec, telemetry, metrics, warnings)
  enterprise: (separate namespace — cohort, window, lineage, derivations)
```

The portable record is never mutated. Enterprise fields are added in a
separate `enterprise` object. A consumer that only reads the portable
fields gets exactly the `sigrank/0.1-draft` record.

## What the adapter preserves

- source I/O/W/R telemetry (non-negative integers, null for unavailable)
- observed zero versus unavailable/null (distinct semantics)
- timestamp and observation window
- provider/model/tool source
- collector version
- Standard version (`sigrank/0.1-draft`)
- provenance and warnings

## What the adapter adds (enterprise namespace only)

- `cohort_id` — tenant-scoped cohort identifier
- `window` — observation window (start, end)
- `lineage` — chain of observations linking to outcomes
- `derivations` — MO§ES-governed enterprise metrics (construction, composite
  scores, outcome correlations) — **never** in the portable namespace
- `collector_version` — adapter version that produced this observation
- `privacy_mode` — anonymous, pseudonymous, private, or identified

## Excluded from portable compatibility

Construction, Build Archetypes, RS05, Scale V, rank, percentile, quality
scores, cycle times, bug counts, and outcome data remain enterprise-only.
They cannot enter the portable metric namespace.

## Validation

The adapter validates pilot manifests against the canonical pilot schema
(`docs/pilot-manifest.schema.json`). Fixtures cover:

- complete telemetry (all four pillars)
- partial cache (cache_write or cache_read unavailable)
- zero values (zero cache_read distinct from unavailable)
- invalid version (rejects records not declaring `sigrank/0.1-draft`)

## Interpretation boundary

Upsilon describes observable token-processing patterns. Enterprise
derivations are MO§ES-governed and labeled DEVELOPMENTAL. Neither the
portable metrics nor the enterprise derivations prove cognition, work
quality, employee productivity, or business outcomes.
