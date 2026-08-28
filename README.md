# Upsilon — Enterprise AI Processing Diagnostics

> Models have evals. Operators should too.

Upsilon is the commercial measurement engine enterprises deploy to baseline how people process with AI. It uses content-free token telemetry to produce operator evaluations, performative benchmarks, bespoke enterprise evals, workflow-fit analysis, and intervention re-evaluation. MO§ES™ supplies the governance and methodology; SigRank is the public leaderboard and proof surface.

## What this repo is

This is the public commercial front face for Upsilon pilots, live at **[mos2es.org](https://mos2es.org)**.

It contains:
- 9 HTML pages (home, product, pilot, methodology, research, contact, about, privacy, docs)
- Shared stylesheet
- `llms.txt` — AI agent instructions (when to use, when not to use, how to call)
- `openapi.json` — OpenAPI 3.1 spec for the platform API surface
- `robots.txt` — explicitly allowlists all AI crawlers
- `sitemap.xml` — all indexable URLs
- `favicon.svg` + `og-image.svg`

## Live site

- **mos2es.org** — this site, deployed via Cloudflare Workers
- **enterprise.mos2es.org** — enterprise demo website (separate deployment)

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| Home | `/` | Hero, commercial proposition, four levels, use cases, pricing, FAQ |
| Product | `/product` | 14 modules — operator evals, benchmarks, bespoke evals, workflow fit, governance |
| Pilot | `/pilot` | 30-day enterprise pilot — 25-100 users, 7-step sequence, 6 packages |
| Methodology | `/methodology` | Eval framework — 5 questions, canonical telemetry, metrics, percentile bands |
| Research | `/research` | Commitment Theory, Conservation Law, epistemic status |
| About | `/about` | Company background, founder, research foundation |
| Privacy | `/privacy` | Data minimization, pseudonymous IDs, no prompt inspection, governance |
| Contact | `/contact` | Build a bespoke eval, best-fit buyers, what to expect |
| Docs | `/docs` | Developer docs — OpenAPI, MCP server (21 tools), CLI, telemetry, metrics |

## AI agent integration

### MCP server

Upsilon exposes an MCP (Model Context Protocol) server at **`https://mcp.mos2es.org`** with 21 tools (16 read + 5 write). Write tools require authorization and all operations are governed by MO§ES™.

### OpenAPI spec

The full API specification is at **[`/openapi.json`](https://mos2es.org/openapi.json)** — 16 read endpoints and 5 write endpoints.

### llms.txt

AI agents should read **[`/llms.txt`](https://mos2es.org/llms.txt)** for when-to-use guidance, key concepts, and integration instructions.

## Canonical telemetry

The platform operates on content-free token counts — no prompt text required:

- **INPUT (I):** tokens sent to the AI system
- **OUTPUT (O):** tokens received from the AI system
- **CACHE READ (R):** tokens reused from context cache
- **CACHE WRITE (W):** tokens written to context cache

## Metrics

- **Leverage:** (R + W) / I — context reuse and building relative to new input
- **Yield:** O / (I + O + R + W) — productive output share of total token flow
- **Token SNR:** signal-to-noise ratio in token flow
- **Log Leverage:** log-scaled leverage variant
- **Construction:** W / R — ratio of new context built to context reused

## Governance

- All composite scores labeled DEVELOPMENTAL, not PERSONNEL
- All diagnoses labeled HYPOTHESIS, never fact
- All outcome joins labeled ASSOCIATION, never CAUSATION
- No bottom-employee leaderboard
- No automatic adverse employment actions
- No punitive labels
- No prompt-content inspection (structurally impossible)

## Research foundation

- Commitment Theory: [GitHub](https://github.com/SunrisesIllNeverSee/Commitment_Theory)
- Conservation Law paper: [Zenodo DOI 10.5281/zenodo.20029607](https://doi.org/10.5281/zenodo.20029607)
- Patent: Serial No. 63/877,177 (Provisional, pending)

## Ecosystem

- **SignalAF** — umbrella brand — [signalaf.com](https://signalaf.com)
- **Upsilon** — commercial measurement engine and enterprise pilot
- **SigRank** — public leaderboard and proof surface
- **MO§ES™** — governance, commitment conservation, and enforcement framework
- **Signomy** — dual-governance agentic marketplace — [signomy.xyz](https://signomy.xyz)
- **AQUA** — applications, questions, answers — [mos2es.xyz](https://mos2es.xyz)

## License

Content (HTML, CSS, text, images) is licensed under **CC-BY-4.0**.
The MO§ES™ name, brand, and methodology are proprietary.
See [LICENSE](LICENSE).

## Links

- Website: [mos2es.org](https://mos2es.org)
- MCP server: [mcp.mos2es.org](https://mcp.mos2es.org)
- Enterprise demo: [enterprise.mos2es.org](https://enterprise.mos2es.org)
- GitHub: [SunrisesIllNeverSee](https://github.com/SunrisesIllNeverSee)
- ORCID: [0009-0002-9904-5390](https://orcid.org/0009-0002-9904-5390)
- Contact: burnmydays@proton.me
