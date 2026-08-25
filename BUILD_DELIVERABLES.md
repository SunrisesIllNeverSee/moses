# MO§ES™ Promo Site — Build Deliverables

Companion document to the category rework. Covers the four planning
artifacts the prompt's FINAL DELIVERABLE section requires that are not
themselves rendered HTML:

1. Revised sitemap
2. Visual / chart placement plan
3. Section hierarchy
4. Implementation notes (mobile behavior, CTA map, copy-line map)

The five full pages (homepage, Product, Pilot, Methodology, Contact) are
delivered as HTML in this directory and are the authoritative source;
this document describes their structure and the decisions behind it.

---

## 1. Revised Sitemap

```
/                     index.html      Homepage (14 sections)
/product              product.html    Product (14 modules)
/pilot                pilot.html      30-Day Operator Eval Pilot
/methodology          methodology.html  Methodology (5 questions)
/research             research.html   Research (Commitment Theory)
/contact              contact.html    Contact
/llms.txt             llms.txt        LLM-readable summary
/sitemap.xml          sitemap.xml     XML sitemap
/robots.txt           robots.txt      Crawler directives
```

Navigation (every page): Product · Pilot · Methodology · Research · Contact

The legacy demo pages (evaluate, diagnose, workflow, develop, verify,
enterprise, data, compare) remain in the `ENTERPRISE_BUILD_PACKAGE`
submodule's `website/` directory as the runnable product demo. They are
not part of the promo site and are not linked from the promo nav.

---

## 2. Visual / Chart Placement Plan

All visuals are inline SVG, clearly labeled "illustrative," and
accessible via `role="img"` + `aria-label`. No fake SaaS dashboards.
No charts implying unsupported functionality.

### Charts on the Homepage (index.html)

| Section | Chart | Type | Purpose |
|---------|-------|------|---------|
| §7 What can be benchmarked | Team topology diagram | node-link diagram | Show 3 teams, operator capability as node size, concentration risk in Team B |
| §8 Top operator story | Cohort distribution | histogram | Right-skewed distribution with median / top 5% / top 1% markers |
| §8 Top operator story | Usage × leverage scatter | scatter plot | High-volume ≠ high-performance; call out the off-diagonal points |
| §9 Operator × Model × Task | Operator field map | 2D scatter with cluster ellipses | Archetype clusters + top-performer tail |
| §11 Interventions | Before/after comparison | grouped bar chart | Target metrics rise, non-target metric stable |

### Charts on other pages

| Page | Chart | Type | Purpose |
|------|-------|------|---------|
| Methodology §Q3 | Percentile bands ladder | diagram (existing) | median → top 0.1% |
| Pilot | 7-step pipeline | pipeline (existing) | Instrument → Re-evaluate |
| Pilot | 6 benchmark types | card grid (existing) | Standard / Internal / External / Bespoke / Longitudinal / Intervention |

### Visual system principles (per prompt)

- Percentile ladders, ranked distributions, scatter plots, field maps,
  operator clusters, benchmark bands, cohort distributions, before/after
  comparisons, operator × model × task diagrams, workflow maps, team
  topology diagrams — all represented.
- Every chart carries an "(illustrative)" label in its title text.
- No chart implies a validated causal claim. Outcome-join charts carry
  ASSOCIATION labels.
- Charts are CSS-responsive (`.chart { width:100%; max-width:480px }`)
  and collapse to full width on mobile.

### Charts NOT used (and why)

- No fake SaaS dashboard screenshots.
- No real operator data (the pilot runs on synthetic data).
- No charts implying personnel ranking or productivity scoring.

---

## 3. Section Hierarchy

### Homepage (index.html) — 14 sections

1. **Hero** — eyebrow, headline, subhead, supporting line, pilot proof line, primary + secondary CTA, proof strip
2. **Category thesis** — "Models have evals. Operators should too." + MODEL × OPERATOR × TASK × CONTEXT + "Measure the humans operating your AI."
3. **Usage vs performance** — "Usage is not an eval." + USAGE = ACTIVITY / OPERATOR EVAL = PERFORMANCE / PERFORMATIVE BENCHMARK = COMPARATIVE PERFORMANCE + "From adoption metrics to performative benchmarks."
4. **What is an Operator Evaluation** — definition + 16 dimensions + standard vs bespoke
5. **Performative Benchmarks** — definition + TASK × MODEL × OPERATOR × CONTEXT + 13 comparison types + "Best at what?"
6. **Bespoke evals** — "Your company should not inherit someone else's definition of AI proficiency." + YOUR PEOPLE · YOUR WORKFLOWS · YOUR MODELS · YOUR OBJECTIVES · YOUR EVALS
7. **What can be benchmarked** — 4 levels (Operator, Team, Workflow, Organization) + team topology diagram
8. **Top operator story** — "AI capability is not evenly distributed." + cohort distribution histogram + usage × leverage scatter + percentile ladder
9. **Operator × Model × Task** — "Performance belongs to the system, not the model alone." + operator field map + what this enables / when to intervene
10. **Pilot** — "Baseline. Benchmark. Intervene. Re-evaluate." + 7-step pipeline + delivery note
11. **Interventions** — "Evaluation should change what happens next." + 12 intervention types + before/after comparison chart
12. **Privacy** — "Evaluate operation without turning every conversation into surveillance." + content-free signals + governance controls
13. **Architecture** — Commitment Theory + Conservation Law + how MO§ES™ uses it
14. **Ecosystem** — SignalAF / SigRank, Signomy, AQUA

### Product page (product.html) — 14 modules

Each module answers: What is it? / What data is required? / What does it produce? / What enterprise question does it answer?

01 Operator Evals · 02 Performative Benchmarks · 03 Bespoke Enterprise Evals · 04 Operator Intelligence · 05 Org AI Topology · 06 Workflow Fit · 07 Operator × Model Fit · 08 Team Composition · 09 Capability Dependency Risk · 10 Operator Similarity · 11 AI Learning Curve · 12 Experiment as Product · 13 Intervention + Re-evaluation · 14 Governance

### Pilot page (pilot.html)

Hero → 7-step pilot sequence → 11 pilot outputs → 6 benchmark types → 12 commercial pilots → bespoke configurator → 15 eval families → 3 deployment levels → 6 commercial packages → delivery (CLI/TUI/MCP) → non-goals

### Methodology page (methodology.html) — 5 questions + supporting sections

Q1 What is an operator eval? → Q2 What is measured? (4 telemetry + 5 derived metrics) → Q3 How are benchmarks created? (6 types + percentile bands + "Best at what?") → Q4 How are bespoke evals constructed? (5-step pipeline) → Q5 How are results interpreted? (MEASURED SIGNAL ≠ DERIVED METRIC ≠ BENCHMARK ≠ HYPOTHESIS ≠ VALIDATED OUTCOME) → cohort analysis → intervention testing → outlier handling → provenance → privacy → limitations → falsifiability

### Contact page (contact.html)

Hero ("Build a bespoke eval.") → what to expect (3 steps) → best-fit buyers (6 roles) → reach out

---

## 4. Implementation Notes

### Mobile behavior

- Breakpoint at `max-width:800px` (style.css).
- All grids (`.grid2`, `.grid3`, `.grid4`, `.cols`, `.footer-grid`)
  collapse to single column.
- `.cols .col-r` drops its left border and gains a top border instead.
- `.proof-strip` stacks vertically.
- `.diagram .row` stacks vertically; cells lose right borders, gain
  bottom borders.
- Nav `.links` hidden on mobile (the footer carries the same links).
- Charts (`.chart`) expand to full container width.

### CTA map

| Page | Primary CTA | Secondary CTA |
|------|-------------|---------------|
| Home | Explore the Operator Eval Pilot → pilot.html | See the Benchmark Methodology → methodology.html |
| Product | See What We Benchmark → methodology.html | Run a 30-Day Operator Eval → pilot.html |
| Pilot | Run a 30-Day Operator Eval → contact.html | See What We Benchmark → product.html |
| Methodology | Review the Eval Framework → contact.html | See the Research → research.html |
| Research | See the Methodology → methodology.html | Build a Bespoke Eval → contact.html |
| Contact | Build a Bespoke Eval → mailto | Run a 30-Day Operator Eval → pilot.html |

Avoided (per prompt): Get Started, Learn More, Transform Your AI,
Unlock AI Potential. None appear anywhere in the promo site.

### Core copy-line map

| Copy line | Where it appears |
|-----------|------------------|
| "Models have evals. Operators should too." | index §2 (h2), llms.txt |
| "Usage is not an eval." | index §3 (eyebrow), llms.txt |
| "Measure the humans operating your AI." | index §2 (blockquote), llms.txt |
| "Your people. Your workflows. Your evals." | index §1, pilot §hero, contact §hero, llms.txt |
| "Your company should not inherit someone else's definition of AI proficiency." | index §6, product §03, llms.txt |
| "Best model for the task. Best operator for the task." | index §9, product §07, llms.txt |
| "Benchmark the interaction, not just the model." | index §5, product §02, llms.txt |
| "AI capability is not evenly distributed." | index §8 (h2), methodology §outliers, llms.txt |
| "The highest-volume users are not necessarily the highest-performing operators." | index §8, methodology §outliers, llms.txt |
| "From adoption metrics to performative benchmarks." | index §3, llms.txt |
| "Baseline. Benchmark. Intervene. Re-evaluate." | index §10, pilot §hero, llms.txt |

All 11 core copy lines now appear on at least one HTML page AND in
llms.txt.

### Category language

- Primary category: ENTERPRISE AI OPERATOR EVALUATIONS (index hero
  eyebrow, llms.txt, JSON-LD serviceType)
- Secondary category: PERFORMATIVE BENCHMARKS (index §5, llms.txt,
  product §02)
- "Operator Evals," "Operator Evaluations," and "Performative
  Benchmarks" used repeatedly and deliberately across all pages.
- Forbidden vague phrases (AI transformation, AI readiness, AI maturity,
  workforce intelligence, AI adoption analytics, digital transformation,
  employee productivity) are absent — verified by grep.

### JSON-LD

- Every page carries Organization + WebSite + BreadcrumbList.
- Product page adds a Service node with
  serviceType "Enterprise AI operator evaluations and performative
  benchmarks."
- Methodology page adds a DefinedTermSet with 10 terms including
  Operator Evaluation and Performative Benchmark.
- Research page adds ScholarlyArticle + CreativeWork (patent).
- Contact page adds ContactPage + ContactPoint.
- All JSON-LD blocks validated as syntactically valid JSON.

### Accessibility

- All SVG charts carry `role="img"` and `aria-label`.
- Color contrast meets WCAG AA for body text (#111 on #fafaf8).
- Nav and footer links are real `<a>` tags (no JS navigation).
- No content is JS-dependent; the site is fully static HTML + CSS.
