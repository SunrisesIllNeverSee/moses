# Upsilon Product Architecture

Status: locked owner decision, 2026-08-28.

## Roles

```text
SignalAF (umbrella brand)
  └── MO§ES™ (governance + methodology)
        └── Upsilon (commercial measurement engine + enterprise pilot)
              └── SigRank (public leaderboard + proof surface)
```

Upsilon is the name used for the measurement engine, diagnostic product, and 30-day enterprise pilot. MO§ES™ describes the constitutional governance and methodology around that product. SigRank describes the public leaderboard and proof surface.

## Compatibility boundary

This product migration does not rename the existing `sigrank/0.1-draft` wire record, `sigrank` package, CLI command, or MCP tool identifiers. Those are compatibility surfaces and require a separately versioned migration.

## Primary metric

Upsilon's portable Yield metric uses four content-free integers:

```text
Yield (Υ) = (cache_read × output) / input²
```

The enterprise methodology may expose additional derived metrics only with explicit namespaces and formula lineage.

## EKG claim and boundary

> Baseline your company's systems intelligence with Upsilon. Get the EKG for how your people process with AI.

The EKG metaphor describes continuous observation of token-processing rhythm. Upsilon does not read prompts or code and the telemetry alone does not prove cognition, work quality, employee productivity, or business outcomes.
