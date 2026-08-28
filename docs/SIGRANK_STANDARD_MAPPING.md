# SigRank Compatibility → Upsilon Enterprise Mapping

## Purpose

This document defines the **internal lineage contract** between the stable SigRank wire vocabulary, the Upsilon commercial measurement engine, and the MO§ES™ enterprise governance methodology used by mos2es.org.

It is not a public-copy requirement.

mos2es.org intentionally uses professional enterprise terminology and its own derived metrics. The purpose of this mapping is to make sure the commercial product can remain enterprise-native without losing mathematical provenance.

## Product boundary

```text
SigRank compatibility record (`sigrank/0.1-draft`)
portable operator-measurement wire vocabulary
        ↓
shared source telemetry
        ↓
Upsilon enterprise derivation layer
enterprise metrics + cohort/workflow context
        ↓
mos2es.org
public Upsilon pilot offer under MO§ES™ governance
```

The systems share evidence. They do not need to share every public label or formula.

## Shared telemetry primitives

| Primitive | SigRank wire | MO§ES symbol | Meaning |
|---|---|---|---|
| Input | `input` | `I` | fresh input tokens |
| Output | `output` | `O` | output tokens |
| Cache Write / Creation | `cache_write` | `W` | cache-creation tokens |
| Cache Read | `cache_read` | `R` | cached-context tokens read |

These four source measurements are the interoperability bridge.

## SigRank Standard core

The draft SigRank portable core currently defines:

- Yield: `(R × O) / I²`
- Leverage: `R / I`
- Velocity: `O / I`
- SNR: `O / (I + O)`
- 10xDEV: `log10(R / I)` under the reference implementation null policy

These definitions belong to the SigRank measurement vocabulary.

## Upsilon enterprise metric layer

The current mos2es.org methodology uses its own enterprise-facing calculations, including:

- Leverage: `(R + W) / I`
- Yield: `O / (I + O + R + W)`
- Token SNR
- Log Leverage
- Construction: `W / R`

These MUST NOT be silently represented as mathematically identical to the SigRank compatibility metrics with similar names.

## Required lineage representation

Internally, every enterprise metric should be representable as:

```text
source telemetry
    +
derivation identifier
    +
derivation version
    +
observation window
    +
cohort/workflow context
    =
enterprise measurement
```

Recommended machine-readable shape:

```json
{
  "source": {
    "telemetry_schema": "sigrank/0.1-draft",
    "input": 0,
    "output": 0,
    "cache_write": 0,
    "cache_read": 0
  },
  "enterprise_metric": {
    "namespace": "mos2es",
    "metric": "yield",
    "definition_version": "mos2es/enterprise-metrics/v1",
    "value": 0
  },
  "context": {
    "window": "30d",
    "cohort": "internal",
    "workflow": null
  }
}
```

The exact schema may evolve. The invariant is that the derivation remains explicit.

## Translation rule

Public commercial copy MAY say:

- operator evaluation;
- performative benchmark;
- bespoke enterprise eval;
- capability distribution;
- workflow fit;
- model/operator fit;
- organizational AI topology;
- learning curve;
- intervention benchmark.

It does NOT need to expose SigRank's standards terminology everywhere.

When a public claim depends directly on a SigRank metric or SignalAF reference field, the methodology/docs layer SHOULD identify that dependency precisely.

## Reference-field use

SignalAF reference data can serve as an external comparison source where cohort compatibility supports the comparison.

The enterprise system MUST distinguish:

- internal MO§ES cohort benchmark;
- external SignalAF reference comparison;
- bespoke workflow benchmark;
- intervention benchmark;
- external business outcome.

These should never collapse into one unnamed "score."

## Outcome joins

External outcomes can include:

- PR acceptance;
- review time;
- cycle time;
- deployment events;
- incident/rollback rates;
- cost;
- business KPIs.

Outcome joins remain **ASSOCIATION** unless experimental design supports stronger causal inference.

## Governance

Preserve the existing mos2es.org commercial guardrails:

- DEVELOPMENTAL, not PERSONNEL;
- HYPOTHESIS, not fact, for diagnoses;
- ASSOCIATION, not CAUSATION, for outcome joins;
- no bottom-employee leaderboard;
- no automatic adverse employment action;
- no punitive labels;
- no prompt-content inspection for base telemetry.

## Why this separation is valuable

The SigRank namespace can remain a reusable compatibility layer while Upsilon becomes the commercial measurement product and MO§ES™ remains the governing framework.

That creates a clean stack:

```text
portable measurement
        ↓
enterprise interpretation
        ↓
commercial pilot
        ↓
organizational intervention
        ↓
remeasurement
```
