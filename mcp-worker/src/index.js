// Upsilon MCP Server — Streamable HTTP transport, governed by MO§ES™
// SigRank is the public leaderboard and proof surface for eligible observations.
// Computes all outputs from raw demo input data at request time.
// No pre-computed snapshots — the worker runs the same analysis logic
// as the Python platform (src/metrics/, src/analysis/).
//
// Raw input files (loaded at startup):
//   observations.jsonl  — 1668 raw token observations (I, O, R, W)
//   operators.json      — 50 operators (team, role, level, platform)
//   cohort.json         — cohort metadata + window
//   metric_registry.json — metric definitions
//   reference_field.json — percentile distributions for normalization
//   lineages.jsonl      — 50 lineage chains with micro_eval
//   outcomes.json       — 50 outcomes (quality score, cycle time)
//   interventions.json  — 12 interventions
//   teams.json          — 6 teams
//   workflows.json      — workflow definitions

import operatorsData from "./operators.json";
import cohortData from "./cohort.json";
import metricRegistryData from "./metric_registry.json";
import referenceFieldData from "./reference_field.json";
import outcomesData from "./outcomes.json";
import interventionsData from "./interventions.json";
import teamsData from "./teams.json";
import workflowsData from "./workflows.json";

// ─── Load JSONL-derived data (converted to JS modules for Wrangler) ─
import observations from "./observations.js";
import lineages from "./lineages.js";

// ─── Constants ──────────────────────────────────────────────────────
const CANONICAL_METRICS = ["leverage", "yield", "token_snr", "log_leverage", "construction"];
const COMPOSITE_METRICS = ["leverage", "yield", "token_snr", "construction"];
const METRIC_WEIGHTS = { leverage: 0.30, yield: 0.30, token_snr: 0.20, construction: 0.20 };
const INTERPRETATION_LIMIT_METRICS = new Set(["token_snr", "construction"]);
const METRIC_STATUS = {
  leverage: "CANONICAL",
  yield: "CANONICAL",
  token_snr: "CANONICAL_WITH_INTERPRETATION_LIMIT",
  log_leverage: "CANONICAL",
  construction: "CANONICAL_WITH_INTERPRETATION_LIMIT",
};
const SYNTHETIC = true;
const WINDOW_START = cohortData.window_start;
const WINDOW_END = cohortData.window_end;

// ─── Metric Formulas (ported from src/metrics/formulas.py) ──────────
function leverage(I, R) {
  if (I <= 0) return null;
  return R / I;
}
function yieldMetric(I, O, R) {
  if (I <= 0) return null;
  return (R * O) / (I * I);
}
function tokenSnr(I, O) {
  if (I + O <= 0) return null;
  return O / (I + O);
}
function logLeverage(I, R) {
  const L = leverage(I, R);
  if (L === null || L <= 0) return null;
  return Math.log10(L);
}
function construction(R, W) {
  if (R <= 0) return null;
  return W / R;
}

const METRIC_FNS = {
  leverage: (I, O, R, W) => leverage(I, R),
  yield: (I, O, R, W) => yieldMetric(I, O, R),
  token_snr: (I, O, R, W) => tokenSnr(I, O),
  log_leverage: (I, O, R, W) => logLeverage(I, R),
  construction: (I, O, R, W) => construction(R, W),
};

// ─── Scoring Engine (ported from src/metrics/engine.py) ─────────────
function scoreOperator(operatorId, obs) {
  // Filter by operator_id AND cohort window (matching Python's _date_in_window)
  const inWindow = obs.filter(o => {
    if (o.operator_id !== operatorId) return false;
    const d = o.timestamp.slice(0, 10); // "2026-07-01"
    return d >= WINDOW_START && d <= WINDOW_END;
  });
  if (inWindow.length === 0) return {};

  const I = inWindow.reduce((s, o) => s + o.input_tokens, 0);
  const O = inWindow.reduce((s, o) => s + o.output_tokens, 0);
  const R = inWindow.reduce((s, o) => s + o.cache_read_tokens, 0);
  const W = inWindow.reduce((s, o) => s + o.cache_write_tokens, 0);

  const measurements = {};
  for (const metricId of CANONICAL_METRICS) {
    const value = METRIC_FNS[metricId](I, O, R, W);
    measurements[metricId] = value;
  }
  return measurements;
}

// ─── Reference Population (ported from src/domain/reference_population.py) ─
function percentileFromReference(metricId, value) {
  const dist = referenceFieldData.distributions[metricId];
  if (!dist || value === null) return null;

  const points = Object.entries(dist)
    .filter(([k]) => k.startsWith("p") && /^\d+$/.test(k.slice(1)))
    .map(([k, v]) => [parseInt(k.slice(1)), v])
    .sort((a, b) => a[0] - b[0]);

  if (points.length === 0) return null;

  if (value <= points[0][1]) return points[0][0];
  if (value >= points[points.length - 1][1]) return points[points.length - 1][0];

  for (let i = 1; i < points.length; i++) {
    const [pLo, vLo] = points[i - 1];
    const [pHi, vHi] = points[i];
    if (vLo <= value && value <= vHi) {
      if (vHi === vLo) return pLo;
      const frac = (value - vLo) / (vHi - vLo);
      return pLo + frac * (pHi - pLo);
    }
  }
  return null;
}

// ─── Percentile Rank (for similarity search) ────────────────────────
function percentileRank(value, allValues) {
  if (!allValues || allValues.length === 0) return 0;
  let countBelow = 0, countEqual = 0;
  for (const v of allValues) {
    if (v < value) countBelow++;
    else if (v === value) countEqual++;
  }
  return 100.0 * (countBelow + 0.5 * countEqual) / allValues.length;
}

// ─── Composite Score (ported from src/metrics/composite_score.py) ───
function computeCompositeScore(operatorId, measurements) {
  const components = {};
  const caveats = [];
  let weightedSum = 0;
  let totalWeightUsed = 0;

  for (const [metricId, weight] of Object.entries(METRIC_WEIGHTS)) {
    const value = measurements[metricId];
    if (value === null || value === undefined) {
      components[metricId] = { value: null, percentile: null, normalized: null, weight, status: "missing" };
      continue;
    }

    const normalized = percentileFromReference(metricId, value);
    if (normalized === null) {
      components[metricId] = { value: round(value, 6), percentile: null, normalized: null, weight, status: METRIC_STATUS[metricId] };
      continue;
    }

    weightedSum += normalized * weight;
    totalWeightUsed += weight;
    components[metricId] = {
      value: round(value, 6),
      percentile: round(normalized, 2),
      normalized: round(normalized, 2),
      weight,
      status: METRIC_STATUS[metricId],
    };

    if (INTERPRETATION_LIMIT_METRICS.has(metricId)) {
      caveats.push(`${metricId} has CANONICAL_WITH_INTERPRETATION_LIMIT status — interpret with caution; context-dependent metric.`);
    }
  }

  let score;
  if (totalWeightUsed > 0 && totalWeightUsed < 1.0) {
    score = (weightedSum / totalWeightUsed) * 100;
    caveats.push(`Score based on ${Math.round(totalWeightUsed * 100)}% of available metrics — some canonical metrics were missing or uncomputable.`);
  } else if (totalWeightUsed === 0) {
    score = 0;
    caveats.push("No canonical metrics available — score is 0 (insufficient data).");
  } else {
    score = weightedSum;
  }

  return {
    operator_id: operatorId,
    score: round(score, 2),
    score_id: "dev_index",
    name: "AI Operator Development Index",
    components,
    label: "DEVELOPMENTAL — for development use; not a personnel performance rating",
    caveats,
    synthetic: SYNTHETIC,
  };
}

// ─── Divergence (ported from src/analysis/divergence.py) ────────────
function classifyDivergence(usagePct, yieldPct) {
  if (usagePct >= 60 && yieldPct <= 40) return "HIGH_USAGE_LOW_OPERATION";
  if (usagePct <= 40 && yieldPct >= 60) return "LOW_USAGE_HIGH_OPERATION";
  if (usagePct <= 40 && yieldPct <= 40) return "LOW_LOW";
  return "MIXED";
}

function computeDivergence(allMeasurements) {
  // Usage tokens per operator (window-filtered, matching Python service)
  const usageTokens = {};
  for (const op of operatorsData) {
    const opObs = observations.filter(o => {
      if (o.operator_id !== op.operator_id) return false;
      const d = o.timestamp.slice(0, 10);
      return d >= WINDOW_START && d <= WINDOW_END;
    });
    usageTokens[op.operator_id] = opObs.reduce((s, o) => s + o.input_tokens + o.output_tokens + o.cache_read_tokens + o.cache_write_tokens, 0);
  }

  // Usage percentile (rank by total tokens)
  const sortedUsage = Object.entries(usageTokens).sort((a, b) => a[1] - b[1]);
  const n = sortedUsage.length;
  const usagePctMap = {};
  for (let i = 0; i < n; i++) {
    usagePctMap[sortedUsage[i][0]] = round(100.0 * i / Math.max(n - 1, 1), 1);
  }

  const results = [];
  for (const op of operatorsData) {
    const oid = op.operator_id;
    const ms = allMeasurements[oid];
    if (!ms) continue;

    const usagePct = usagePctMap[oid];
    const yieldPct = percentileFromReference("yield", ms.yield);
    const levPct = percentileFromReference("leverage", ms.leverage);

    if (usagePct === null || usagePct === undefined || yieldPct === null) continue;

    const divPp = round(usagePct - yieldPct, 1);
    results.push({
      operator_id: oid,
      usage_percentile: usagePct,
      yield_percentile: round(yieldPct, 1),
      leverage_percentile: levPct !== null ? round(levPct, 1) : null,
      divergence_pp: divPp,
      divergence_class: classifyDivergence(usagePct, yieldPct),
    });
  }

  results.sort((a, b) => Math.abs(b.divergence_pp) - Math.abs(a.divergence_pp));
  return results;
}

// ─── Org Topology (ported from src/analysis/org_topology.py) ────────
function gini(values) {
  const sorted = values.filter(v => v !== null && v >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let cumulative = 0, weightedSum = 0;
  for (let i = 0; i < n; i++) {
    cumulative += sorted[i];
    weightedSum += (i + 1) * sorted[i];
  }
  const g = (2 * weightedSum) / (n * total) - (n + 1) / n;
  return Math.max(0, Math.min(1, g));
}

function median(values) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[Math.floor(n / 2)];
}

function iqr(values) {
  if (!values || values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const q1 = n > 3 ? s[Math.floor(n / 4)] : s[0];
  const q3 = n > 3 ? s[Math.floor(3 * n / 4)] : s[s.length - 1];
  return q3 - q1;
}

function shareOfTotal(values, topFraction) {
  const s = values.filter(v => v !== null && v >= 0).sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  const total = s.reduce((sum, v) => sum + v, 0);
  if (total === 0) return 0;
  const topN = Math.max(1, Math.floor(n * topFraction));
  const topSum = s.slice(-topN).reduce((sum, v) => sum + v, 0);
  return topSum / total;
}

function computeOrgTopology(allMeasurements) {
  const operators = operatorsData;
  const totalOps = operators.length;

  // Team groupings
  const teams = {};
  for (const op of operators) {
    const team = op.team || "unassigned";
    if (!teams[team]) teams[team] = [];
    teams[team].push(op);
  }

  const teamTopologies = [];
  for (const [teamName, teamOps] of Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0]))) {
    const medians = {}, spreads = {};
    for (const mid of CANONICAL_METRICS) {
      const vals = teamOps.map(o => allMeasurements[o.operator_id]?.[mid]).filter(v => v !== null && v !== undefined);
      const med = median(vals);
      if (med !== null) medians[mid] = round(med, 4);
      spreads[mid] = round(iqr(vals), 4);
    }

    const platforms = [...new Set(teamOps.map(o => o.primary_platform).filter(Boolean))].sort();
    const roles = {}, levels = {};
    for (const o of teamOps) {
      const r = o.role_family || "unknown";
      roles[r] = (roles[r] || 0) + 1;
      const lv = o.level || "unknown";
      levels[lv] = (levels[lv] || 0) + 1;
    }

    teamTopologies.push({ team: teamName, operator_count: teamOps.length, median_metrics: medians, metric_spread: spreads, platforms_used: platforms, role_composition: roles, level_composition: levels });
  }

  // Capability concentration
  const concentration = [];
  for (const mid of CANONICAL_METRICS) {
    const vals = operators.map(o => allMeasurements[o.operator_id]?.[mid]).filter(v => v !== null && v !== undefined && v >= 0);
    if (vals.length === 0) continue;
    const g = gini(vals);
    const top10 = shareOfTotal(vals, 0.10);
    const top20 = shareOfTotal(vals, 0.20);
    const bot50 = shareOfTotal([...vals].reverse(), 0.50);
    let interp;
    if (g > 0.5) interp = "Highly concentrated — a few operators account for most capability.";
    else if (g > 0.3) interp = "Moderately concentrated — capability is unevenly distributed.";
    else interp = "Distributed — capability is spread across the organization.";
    concentration.push({ metric_id: mid, gini: round(g, 4), top_10pct_share: round(top10, 4), top_20pct_share: round(top20, 4), bottom_50pct_share: round(bot50, 4), interpretation: interp });
  }

  // Platform adoption
  const platformGroups = {};
  for (const op of operators) {
    const p = op.primary_platform || "unknown";
    if (!platformGroups[p]) platformGroups[p] = [];
    platformGroups[p].push(op);
  }

  const platformAdoption = [];
  for (const [platform, platOps] of Object.entries(platformGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    const medians = {};
    for (const mid of CANONICAL_METRICS) {
      const vals = platOps.map(o => allMeasurements[o.operator_id]?.[mid]).filter(v => v !== null && v !== undefined);
      const med = median(vals);
      if (med !== null) medians[mid] = round(med, 4);
    }
    platformAdoption.push({ platform, operator_count: platOps.length, share: round(platOps.length / totalOps, 4), median_metrics: medians });
  }

  // Single points of failure
  const spofs = [];
  for (const [teamName, teamOps] of Object.entries(teams)) {
    for (const mid of CANONICAL_METRICS) {
      const vals = teamOps.map(o => [o.operator_id, allMeasurements[o.operator_id]?.[mid] || 0]).filter(([, v]) => v !== null && v >= 0);
      if (vals.length < 3) continue;
      const total = vals.reduce((s, [, v]) => s + v, 0);
      if (total === 0) continue;
      const major = vals.filter(([, v]) => v / total > 0.40);
      if (major.length <= 2 && major.length > 0) {
        spofs.push({
          capability: mid,
          operator_ids: major.map(([oid]) => oid),
          team: teamName,
          risk_level: major.length <= 1 ? "high" : "moderate",
          description: `${major.length} operator(s) account for >40% of ${mid} in ${teamName}`,
        });
      }
    }
  }

  // Cross-team complementarity
  const complementarity = {};
  const teamMedians = {};
  for (const tt of teamTopologies) teamMedians[tt.team] = tt.median_metrics;
  const teamNames = Object.keys(teamMedians);
  for (let i = 0; i < teamNames.length; i++) {
    for (let j = i + 1; j < teamNames.length; j++) {
      const t1 = teamNames[i], t2 = teamNames[j];
      const m1 = teamMedians[t1], m2 = teamMedians[t2];
      if (!m1 || !m2) continue;
      const allMetrics = Object.keys(m1).filter(k => k in m2);
      if (allMetrics.length === 0) continue;
      const orgMedians = {};
      for (const mid of allMetrics) {
        const allVals = operators.map(o => allMeasurements[o.operator_id]?.[mid]).filter(v => v !== null && v !== undefined);
        orgMedians[mid] = median(allVals) || 0;
      }
      const t1HighT2Low = allMetrics.some(mid => m1[mid] > orgMedians[mid] && m2[mid] < orgMedians[mid]);
      const t2HighT1Low = allMetrics.some(mid => m2[mid] > orgMedians[mid] && m1[mid] < orgMedians[mid]);
      if (t1HighT2Low && t2HighT1Low) {
        complementarity[`${t1} ↔ ${t2}`] = `Complementary: ${t1} and ${t2} have offsetting strengths across metrics.`;
      }
    }
  }

  // Summary
  const highConc = concentration.filter(c => c.gini > 0.4);
  const highSpof = spofs.filter(s => s.risk_level === "high");
  const parts = [`${totalOps} operators across ${Object.keys(teams).length} teams.`, `${platformAdoption.length} platforms in use.`];
  if (highConc.length > 0) parts.push(`High capability concentration in ${highConc.length} metric(s): ${highConc.map(c => c.metric_id).join(", ")}.`);
  if (highSpof.length > 0) parts.push(`${highSpof.length} high-risk single point(s) of failure detected.`);
  if (Object.keys(complementarity).length > 0) parts.push(`${Object.keys(complementarity).length} complementary team pair(s) identified.`);

  return {
    total_operators: totalOps,
    total_teams: Object.keys(teams).length,
    team_topologies: teamTopologies,
    capability_concentration: concentration,
    platform_adoption: platformAdoption,
    single_points_of_failure: spofs,
    cross_team_complementarity: complementarity,
    summary: parts.join(" "),
  };
}

// ─── Operator Similarity (ported from src/analysis/similarity.py) ───
function euclidean(a, b) {
  return Math.sqrt(a.reduce((s, ai, i) => s + (ai - b[i]) ** 2, 0));
}

function computeOperatorSimilarity(queryOperatorId, allMeasurements, nNeighbors = 5) {
  const operators = operatorsData;
  const opMap = Object.fromEntries(operators.map(o => [o.operator_id, o]));

  // Collect all values per metric for percentile normalization
  const allValuesByMetric = {};
  for (const mid of CANONICAL_METRICS) {
    allValuesByMetric[mid] = operators.map(o => allMeasurements[o.operator_id]?.[mid]).filter(v => v !== null && v !== undefined);
  }

  // Build percentile-rank vectors
  const vectors = {};
  for (const op of operators) {
    const vec = [];
    for (const mid of CANONICAL_METRICS) {
      const val = allMeasurements[op.operator_id]?.[mid];
      vec.push(val === null || val === undefined ? 50.0 : percentileRank(val, allValuesByMetric[mid]));
    }
    vectors[op.operator_id] = vec;
  }

  const queryVec = vectors[queryOperatorId];
  if (!queryVec) {
    return {
      query_operator_id: queryOperatorId,
      normalization: "percentile_rank",
      distance_metric: "euclidean",
      nearest_neighbors: [],
      cluster_quality: "unknown",
      cluster_description: `Operator ${queryOperatorId} not found.`,
      note: "Metric similarity, not personality match. Operators with similar operating patterns, not similar people.",
    };
  }

  // Compute distances
  const distances = [];
  for (const op of operators) {
    if (op.operator_id === queryOperatorId) continue;
    const otherVec = vectors[op.operator_id];
    if (!otherVec) continue;
    distances.push([op.operator_id, euclidean(queryVec, otherVec)]);
  }
  distances.sort((a, b) => a[1] - b[1]);

  const topN = distances.slice(0, nNeighbors);
  const maxDist = Math.sqrt(CANONICAL_METRICS.length * 100 ** 2);

  const matches = topN.map(([oid, dist]) => {
    const op = opMap[oid];
    const similarity = Math.max(0, 1 - dist / maxDist);
    const metricVec = {};
    for (const mid of CANONICAL_METRICS) {
      const val = allMeasurements[oid]?.[mid];
      if (val !== null && val !== undefined) metricVec[mid] = round(val, 4);
    }
    return {
      operator_id: oid,
      pseudonym: op?.pseudonym || oid,
      team: op?.team || null,
      distance: round(dist, 4),
      similarity: round(similarity, 4),
      metric_vector: metricVec,
    };
  });

  let clusterQuality, clusterDescription;
  if (matches.length < 2) {
    clusterQuality = "insufficient";
    clusterDescription = "Not enough neighbors to assess cluster quality.";
  } else {
    const meanDist = matches.reduce((s, m) => s + m.distance, 0) / matches.length;
    if (meanDist < 50) {
      clusterQuality = "tight";
      clusterDescription = `Nearest ${matches.length} operators are very similar — mean distance ${meanDist.toFixed(1)} in percentile space. This operator has a clear peer group.`;
    } else if (meanDist < 100) {
      clusterQuality = "moderate";
      clusterDescription = `Nearest ${matches.length} operators are moderately similar — mean distance ${meanDist.toFixed(1)} in percentile space. Some peer overlap but not a tight cluster.`;
    } else {
      clusterQuality = "dispersed";
      clusterDescription = `Nearest ${matches.length} operators are dispersed — mean distance ${meanDist.toFixed(1)} in percentile space. This operator's pattern is relatively unique.`;
    }
  }

  return {
    query_operator_id: queryOperatorId,
    normalization: "percentile_rank",
    distance_metric: "euclidean",
    nearest_neighbors: matches,
    cluster_quality: clusterQuality,
    cluster_description: clusterDescription,
    note: "Metric similarity, not personality match. Operators with similar operating patterns, not similar people.",
  };
}

// ─── Operator×System Decomposition (ported from src/analysis/operator_system.py) ─
function decomposeMetric(metricId, data) {
  // data: {operator_id: {system: value}}
  const cells = [];
  for (const [opId, systems] of Object.entries(data)) {
    for (const [sysName, val] of Object.entries(systems)) {
      if (val !== null && val !== undefined && !Number.isNaN(val)) cells.push([opId, sysName, val]);
    }
  }
  if (cells.length < 4) return null;

  const operatorIds = [...new Set(cells.map(c => c[0]))].sort();
  const systemNames = [...new Set(cells.map(c => c[1]))].sort();
  if (operatorIds.length < 2 || systemNames.length < 2) return null;

  const grandMean = cells.reduce((s, c) => s + c[2], 0) / cells.length;

  // Operator means
  const opValues = {};
  for (const op of operatorIds) opValues[op] = [];
  for (const [op, , val] of cells) opValues[op].push(val);
  const opMeans = {}, opEffects = {};
  for (const op of operatorIds) {
    opMeans[op] = opValues[op].reduce((s, v) => s + v, 0) / opValues[op].length;
    opEffects[op] = opMeans[op] - grandMean;
  }

  // System means
  const sysValues = {};
  for (const s of systemNames) sysValues[s] = [];
  for (const [, sys, val] of cells) sysValues[sys].push(val);
  const sysMeans = {}, sysEffects = {};
  for (const s of systemNames) {
    sysMeans[s] = sysValues[s].reduce((sum, v) => sum + v, 0) / sysValues[s].length;
    sysEffects[s] = sysMeans[s] - grandMean;
  }

  // Interaction + sum of squares
  const interactionCells = [];
  let ssOperator = 0, ssSystem = 0, ssInteraction = 0, ssTotal = 0;
  for (const [op, sys, val] of cells) {
    const oe = opEffects[op], se = sysEffects[sys];
    const predicted = grandMean + oe + se;
    const interaction = val - predicted;
    interactionCells.push({ operator_id: op, system: sys, observed: round(val, 4), operator_effect: round(oe, 4), system_effect: round(se, 4), interaction: round(interaction, 4), predicted: round(predicted, 4) });
    ssOperator += oe ** 2;
    ssSystem += se ** 2;
    ssInteraction += interaction ** 2;
    ssTotal += (val - grandMean) ** 2;
  }

  const pctOp = ssTotal > 0 ? ssOperator / ssTotal : 0;
  const pctSys = ssTotal > 0 ? ssSystem / ssTotal : 0;
  const pctInt = ssTotal > 0 ? ssInteraction / ssTotal : 0;

  let dominant, label;
  if (pctOp > 0.5) { dominant = "operator"; label = "Operator capability dominates — strong operators stay strong across systems"; }
  else if (pctSys > 0.5) { dominant = "system"; label = "System choice dominates — the tool matters more than who uses it"; }
  else if (pctInt > 0.4) { dominant = "interaction"; label = "Operator×System pairing matters — specific combinations outperform"; }
  else if (Math.abs(pctOp - pctSys) < 0.15 && pctInt < 0.2) { dominant = "balanced"; label = "Operator and system contribute roughly equally"; }
  else { dominant = "mixed"; label = "Effects are mixed — no single dominant factor"; }

  return {
    metric_id: metricId,
    grand_mean: round(grandMean, 4),
    operator_effects: operatorIds.map(op => ({ operator_id: op, mean: round(opMeans[op], 4), effect: round(opEffects[op], 4), system_count: opValues[op].length })),
    system_effects: systemNames.map(s => ({ system: s, mean: round(sysMeans[s], 4), effect: round(sysEffects[s], 4), observation_count: sysValues[s].length })),
    interaction_cells: interactionCells,
    variance_partition: { ss_operator: round(ssOperator, 4), ss_system: round(ssSystem, 4), ss_interaction: round(ssInteraction, 4), ss_total: round(ssTotal, 4), pct_operator: round(pctOp, 4), pct_system: round(pctSys, 4), pct_interaction: round(pctInt, 4) },
    dominant_effect: dominant,
    label,
  };
}

function computeOperatorSystemDecomposition(operatorId) {
  // Build {operator_id: {system: {metric_id: value}}}
  const opSysMetrics = {};
  let totalObs = 0;
  const allSystems = new Set();

  for (const op of operatorsData) {
    // Filter by operator AND cohort window
    const opObs = observations.filter(o => {
      if (o.operator_id !== op.operator_id) return false;
      const d = o.timestamp.slice(0, 10);
      return d >= WINDOW_START && d <= WINDOW_END;
    });
    const bySystem = {};
    for (const o of opObs) {
      const sysName = o.platform || o.model || "unknown";
      if (!bySystem[sysName]) bySystem[sysName] = [];
      bySystem[sysName].push(o);
    }

    for (const [sysName, sysObs] of Object.entries(bySystem)) {
      const I = sysObs.reduce((s, o) => s + o.input_tokens, 0);
      const O = sysObs.reduce((s, o) => s + o.output_tokens, 0);
      const R = sysObs.reduce((s, o) => s + o.cache_read_tokens, 0);
      const W = sysObs.reduce((s, o) => s + o.cache_write_tokens, 0);

      if (!opSysMetrics[op.operator_id]) opSysMetrics[op.operator_id] = {};
      opSysMetrics[op.operator_id][sysName] = {};
      for (const mid of CANONICAL_METRICS) {
        const val = METRIC_FNS[mid](I, O, R, W);
        if (val !== null && val !== undefined) {
          opSysMetrics[op.operator_id][sysName][mid] = val;
          allSystems.add(sysName);
          totalObs++;
        }
      }
    }
  }

  const metricsDecomposed = [];
  for (const mid of CANONICAL_METRICS) {
    const metricData = {};
    for (const [opId, sysDict] of Object.entries(opSysMetrics)) {
      for (const [sysName, metrics] of Object.entries(sysDict)) {
        if (mid in metrics && metrics[mid] !== null) {
          if (!metricData[opId]) metricData[opId] = {};
          metricData[opId][sysName] = metrics[mid];
        }
      }
    }
    if (Object.keys(metricData).length < 2) continue;
    const decomp = decomposeMetric(mid, metricData);
    if (decomp) metricsDecomposed.push(decomp);
  }

  // Summary
  let summary;
  if (metricsDecomposed.length === 0) {
    summary = "Insufficient data for decomposition — need at least 2 operators on 2 systems.";
  } else {
    const dominantCounts = {};
    for (const m of metricsDecomposed) dominantCounts[m.dominant_effect] = (dominantCounts[m.dominant_effect] || 0) + 1;
    const parts = Object.entries(dominantCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`);
    summary = `Decomposed ${metricsDecomposed.length} metrics across ${allSystems.size} systems. Dominant effects: ${parts.join(", ")}.`;
  }

  return {
    operator_id: operatorId || null,
    systems_compared: [...allSystems].sort(),
    operators_analyzed: Object.keys(opSysMetrics).length,
    total_observations: totalObs,
    metrics: metricsDecomposed,
    summary,
  };
}

// ─── Outcome Correlation (ported from src/analysis/outcome_correlation.py) ─
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const sign = x >= 0 ? 1 : -1;
  return sign * (1 - poly * Math.exp(-x * x));
}

function pearsonR(x, y) {
  const n = x.length;
  if (n < 3) return [0, 1];
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  const cov = x.reduce((s, xi, i) => s + (xi - meanX) * (y[i] - meanY), 0);
  const varX = x.reduce((s, xi) => s + (xi - meanX) ** 2, 0);
  const varY = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  if (varX === 0 || varY === 0) return [0, 1];
  let r = cov / Math.sqrt(varX * varY);
  r = Math.max(-1, Math.min(1, r));
  let p;
  if (Math.abs(r) >= 1) p = 0;
  else {
    const tStat = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
    p = 2 * (1 - normalCdf(Math.abs(tStat)));
  }
  return [r, p];
}

function interpretR(r, p, metricId, outcome) {
  if (Math.abs(r) < 0.1 || p > 0.1) return [`No meaningful correlation between ${metricId} and ${outcome}.`, "none", "none"];
  const direction = r > 0 ? "positive" : "negative";
  const absR = Math.abs(r);
  const strength = absR >= 0.7 ? "strong" : absR >= 0.4 ? "moderate" : "weak";
  let interp;
  if (outcome === "cycle_time_minutes") {
    const good = r < 0;
    interp = `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation: higher ${metricId} → ${good ? "better" : "worse"} ${outcome}.`;
  } else if (outcome === "external_quality_score") {
    const good = r > 0;
    interp = `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation: higher ${metricId} → ${good ? "better" : "worse"} ${outcome}.`;
  } else {
    interp = `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation between ${metricId} and ${outcome}.`;
  }
  return [interp, direction, strength];
}

function computeOutcomeCorrelation() {
  const outcomesById = Object.fromEntries(outcomesData.map(o => [o.outcome_id, o]));
  const valid = [];
  for (const lin of lineages) {
    if (lin.outcome_id && outcomesById[lin.outcome_id]) {
      const out = outcomesById[lin.outcome_id];
      if (out.external_quality_score !== null || out.cycle_time_minutes !== null) {
        valid.push([lin.micro_eval || {}, out]);
      }
    }
  }

  if (valid.length < 3) {
    return {
      correlations: [],
      operators_analyzed: valid.length,
      lineages_with_outcomes: valid.length,
      evidence_grade: "OBSERVATIONAL",
      claim_status: "ASSOCIATION",
      summary: "Insufficient data for correlation analysis — need at least 3 lineages with outcomes.",
    };
  }

  // Determine metric set from micro_eval
  const metricSet = new Set();
  for (const [me] of valid) {
    for (const [k, v] of Object.entries(me)) {
      if (typeof v === "number") metricSet.add(k);
    }
  }
  const metricIds = [...metricSet].sort();

  const qualityScores = valid.map(([, out]) => out.external_quality_score);
  const cycleTimes = valid.map(([, out]) => out.cycle_time_minutes);

  const correlations = [];
  for (const mid of metricIds) {
    // Quality score
    const qPairs = valid.map(([me, out]) => [me[mid], out.external_quality_score]).filter(([m, q]) => m !== null && m !== undefined && q !== null && q !== undefined);
    if (qPairs.length >= 3) {
      const [r, p] = pearsonR(qPairs.map(x => x[0]), qPairs.map(x => x[1]));
      const [interp, dir, str] = interpretR(r, p, mid, "external_quality_score");
      correlations.push({ metric_id: mid, outcome_metric: "external_quality_score", correlation: round(r, 4), p_value_approx: round(p, 4), sample_size: qPairs.length, interpretation: interp, direction: dir, strength: str });
    }

    // Cycle time
    const cPairs = valid.map(([me, out]) => [me[mid], out.cycle_time_minutes]).filter(([m, c]) => m !== null && m !== undefined && c !== null && c !== undefined);
    if (cPairs.length >= 3) {
      const [r, p] = pearsonR(cPairs.map(x => x[0]), cPairs.map(x => x[1]));
      const [interp, dir, str] = interpretR(r, p, mid, "cycle_time_minutes");
      correlations.push({ metric_id: mid, outcome_metric: "cycle_time_minutes", correlation: round(r, 4), p_value_approx: round(p, 4), sample_size: cPairs.length, interpretation: interp, direction: dir, strength: str });
    }
  }

  const strong = correlations.filter(c => c.strength === "strong");
  const moderate = correlations.filter(c => c.strength === "moderate");
  const summary = `Computed ${correlations.length} correlations across ${metricIds.length} metrics and 2 outcome measures. ${strong.length} strong, ${moderate.length} moderate. All results are ASSOCIATION (observational), not causation.`;

  return {
    correlations,
    operators_analyzed: valid.length,
    lineages_with_outcomes: valid.length,
    evidence_grade: "OBSERVATIONAL",
    claim_status: "ASSOCIATION",
    summary,
  };
}

// ─── Lineage Chain (ported from src/domain/lineage.py) ──────────────
function buildLineageChain(lin) {
  const links = [
    { link_type: "STATE_A", observation_id: lin.state_a_observation_id },
    { link_type: "BI_ACTION", observation_id: lin.bi_action_observation_id },
    { link_type: "AAI_TRANSFORMATION", observation_id: lin.aai_transformation_observation_id },
    { link_type: "BI_REDIRECTION", observation_id: lin.bi_redirection_observation_id },
    { link_type: "AAI_EXTENSION", observation_id: lin.aai_extension_observation_id },
    { link_type: "COMMITTED_STATE", artifact_id: lin.committed_artifact_id },
  ];

  // Add outcome link if exists
  const outcomesById = Object.fromEntries(outcomesData.map(o => [o.outcome_id, o]));
  if (lin.outcome_id && outcomesById[lin.outcome_id]) {
    const out = outcomesById[lin.outcome_id];
    links.push({
      link_type: "OUTCOME",
      outcome_id: out.outcome_id,
      outcome_type: out.outcome_type,
      outcome_status: out.outcome_status,
      external_quality_score: out.external_quality_score,
      cycle_time_minutes: out.cycle_time_minutes,
    });
  }

  return {
    lineage_id: lin.lineage_id,
    workflow_id: lin.workflow_id,
    workflow_stage: lin.workflow_stage,
    micro_eval: lin.micro_eval,
    links,
  };
}

// ─── Utility ────────────────────────────────────────────────────────
function round(v, decimals) {
  if (v === null || v === undefined) return null;
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

// ─── Pre-compute all operator measurements at startup ───────────────
const allMeasurements = {};
for (const op of operatorsData) {
  allMeasurements[op.operator_id] = scoreOperator(op.operator_id, observations);
}

// ─── Tool Definitions ───────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_pilot_status",
    description: "Get pilot status overview — cohort size, observation count, date range, data quality, active interventions. Computed from raw observations. Data is from a 50-operator synthetic pilot (labeled synthetic).",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        cohort_id: { type: "string" },
        window: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
        eligible_operators: { type: "integer" },
        total_operators: { type: "integer" },
        providers: { type: "array", items: { type: "string" } },
        observation_count: { type: "integer" },
        metric_registry_version: { type: "string" },
        reference_field_version: { type: "string" },
        active_interventions: { type: "integer" },
        data_quality: { type: "object", properties: { OK: { type: "integer" }, WARNING: { type: "integer" }, BLOCKING: { type: "integer" } } },
        synthetic: { type: "boolean" }
      },
      required: ["cohort_id", "total_operators", "observation_count", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_operator_profile",
    description: "Get operator profile — operator details, measurements (5 canonical metrics computed from raw token observations with values, percentiles, status), and benchmark availability. Operator IDs are pseudonymous (e.g., op_001). Data is synthetic.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" } }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        pseudonym: { type: "string" },
        team: { type: "string" },
        role_family: { type: "string" },
        level: { type: "string" },
        primary_platform: { type: "string" },
        measurements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metric_id: { type: "string" },
              value: { type: "number" },
              percentile: { type: "number" },
              status: { type: "string" },
              eligibility: { type: "string" }
            }
          }
        },
        synthetic: { type: "boolean" }
      },
      required: ["operator_id", "measurements", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_cohort_distribution",
    description: "Get cohort metric distribution — min, p10, p25, median, p75, p90, max, mean, std, and outliers for a given metric across the 50-operator cohort. Computed from raw observations.",
    inputSchema: {
      type: "object",
      properties: { metric: { type: "string", default: "leverage", description: "Metric: leverage, yield, token_snr, log_leverage, construction" } }
    },
    outputSchema: {
      type: "object",
      properties: {
        metric: { type: "string" },
        count: { type: "integer" },
        min: { type: "number" },
        p10: { type: "number" },
        p25: { type: "number" },
        median: { type: "number" },
        p75: { type: "number" },
        p90: { type: "number" },
        max: { type: "number" },
        mean: { type: "number" },
        std: { type: "number" },
        outliers: { type: "array", items: { type: "string" } },
        synthetic: { type: "boolean" }
      },
      required: ["metric", "count", "median", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_composite_score",
    description: "Get developmental composite score (0-100) for an operator. Computed from raw metrics normalized via reference percentiles. Labeled DEVELOPMENTAL, not PERSONNEL. Weighted: leverage 30%, yield 30%, token_snr 20%, construction 20%. Data is synthetic.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" } }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        score: { type: "number" },
        score_id: { type: "string" },
        name: { type: "string" },
        components: { type: "object" },
        label: { type: "string" },
        caveats: { type: "array", items: { type: "string" } },
        synthetic: { type: "boolean" }
      },
      required: ["operator_id", "score", "components", "label", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_composite_score_summary",
    description: "Get cohort composite score summary — count, min, max, median, mean, Q1, Q3. Computed from per-operator scores. No individual rankings exposed. Label is DEVELOPMENTAL.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "integer" },
        min: { type: "number" },
        max: { type: "number" },
        median: { type: "number" },
        mean: { type: "number" },
        q1: { type: "number" },
        q3: { type: "number" },
        score_id: { type: "string" },
        name: { type: "string" },
        label: { type: "string" },
        weights: { type: "object" }
      },
      required: ["count", "min", "max", "median", "mean", "score_id", "label"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_diagnostics",
    description: "Get operator diagnostics — pattern detections and diagnoses computed from divergence analysis. All diagnoses are HYPOTHESIS, never fact.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" } }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        patterns: { type: "array", items: { type: "object" } },
        diagnoses: { type: "array", items: { type: "object" } },
        status: { type: "string" },
        synthetic: { type: "boolean" }
      },
      required: ["operator_id", "patterns", "diagnoses", "status", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_data_quality",
    description: "Get data quality summary — completeness, coverage, validity across the cohort. Computed from raw observations.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        total_observations: { type: "integer" },
        operators_covered: { type: "integer" },
        completeness: { type: "number" },
        coverage: { type: "number" },
        validity: { type: "number" },
        issues: { type: "object", properties: { zero_input_observations: { type: "integer" }, zero_output_observations: { type: "integer" } } },
        synthetic: { type: "boolean" }
      },
      required: ["total_observations", "operators_covered", "completeness", "coverage", "validity", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "find_usage_operation_divergence",
    description: "Find operators with usage-operation divergence. Computes usage percentile from raw token totals and compares to yield percentile. Returns all 50 operators with divergence class (LOW_USAGE_HIGH_OPERATION, HIGH_USAGE_LOW_OPERATION, etc.).",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        divergent_operators: { type: "array", items: { type: "object" } },
        all_operators: { type: "array", items: { type: "object" } },
        synthetic: { type: "boolean" }
      },
      required: ["divergent_operators", "all_operators", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_workflow_fit",
    description: "Get workflow fit analysis — operator/workflow fit scores across workflow stages.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "string" },
        stages: { type: "array", items: { type: "object" } },
        observations: { type: "integer" },
        synthetic: { type: "boolean" },
        note: { type: "string" }
      },
      required: ["workflow_id", "stages", "observations", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_intervention_status",
    description: "Get all interventions — 12 active interventions with operator IDs, catalog IDs, reason patterns, target metrics, start dates, followup periods, and synthetic outcomes.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        active: { type: "array", items: { type: "object" } },
        closed: { type: "array", items: { type: "object" } },
        all: { type: "array", items: { type: "object" } },
        count: { type: "integer" },
        synthetic: { type: "boolean" }
      },
      required: ["active", "closed", "all", "count", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "list_pilot_options",
    description: "List available pilot options — 5 canonical metrics, 15 eval families, 13 benchmark classes, 5 intervention types.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        canonical_metrics: { type: "array", items: { type: "object" } },
        eval_families: { type: "integer" },
        benchmark_classes: { type: "integer" },
        intervention_types: { type: "array", items: { type: "string" } },
        synthetic: { type: "boolean" }
      },
      required: ["canonical_metrics", "eval_families", "benchmark_classes", "intervention_types", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "validate_pilot_configuration",
    description: "Validate a pilot configuration before deployment. Returns valid status with warnings and errors.",
    inputSchema: {
      type: "object",
      properties: { configuration: { type: "object", description: "Pilot configuration object (JSON) — see list_pilot_options for available metrics, eval families, and benchmark classes" } }
    },
    outputSchema: {
      type: "object",
      properties: {
        valid: { type: "boolean" },
        warnings: { type: "array", items: { type: "string" } },
        errors: { type: "array", items: { type: "string" } },
        message: { type: "string" }
      },
      required: ["valid", "warnings", "errors"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "compare_operator_to_reference",
    description: "Compare an operator to a reference population. Returns benchmark selection, comparison group, and metric comparison. Computed from raw metrics and reference field.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" },
        reference: { type: "string", description: "Reference population name" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        reference: { type: "string" },
        reference_version: { type: "string" },
        comparisons: { type: "array", items: { type: "object" } },
        synthetic: { type: "boolean" }
      },
      required: ["operator_id", "reference", "comparisons", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_executive_dashboard",
    description: "Get executive dashboard info — the dashboard is a self-contained HTML file generated by the CLI (enterprise export dashboard --output file.html).",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        command: { type: "string" },
        features: { type: "array", items: { type: "string" } },
        governance: { type: "string" }
      },
      required: ["message", "command", "features", "governance"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "verify_change",
    description: "Verify a measured change after intervention — pre/post comparison. Results are ASSOCIATION, never CAUSATION.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" },
        intervention_id: { type: "string", description: "Intervention ID (e.g., intv_001)" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        composite_score: { type: "number" },
        label: { type: "string" },
        message: { type: "string" },
        synthetic: { type: "boolean" }
      },
      required: ["operator_id", "composite_score", "label", "message", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "create_pilot_configuration",
    description: "Generate a saveable pilot configuration JSON from parameters. This is a READ-ONLY tool that assembles a configuration object from the supplied arguments — it does not write to any persistent store. The returned configuration contains cohort_size, duration_days, and the selected metrics list. Use list_pilot_options first to discover available metric IDs, eval families, and benchmark classes, then pass the desired metrics here. The returned configuration can be passed to validate_pilot_configuration for pre-deployment checks, or to create_experiment to pair it with a hypothesis.\n\nWhen to use: when you are scoping a new pilot engagement and need a structured configuration object that captures cohort size, observation window, and metric selection. When NOT to use: when you need to validate an existing configuration (use validate_pilot_configuration), or when you need to create a controlled experiment with a hypothesis (use create_experiment). The output is a JSON object, not a persisted record — save it on the client side if you need to reuse it.\n\nGovernance: all MO§ES configurations carry the DEVELOPMENTAL label (for development use, not personnel performance rating) and the ASSOCIATION-not-CAUSATION evidence standard. Related tools: list_pilot_options (discover available options), validate_pilot_configuration (pre-deployment validation), create_experiment (pair config with a hypothesis).",
    inputSchema: {
      type: "object",
      properties: {
        cohort_size: { type: "integer", description: "Number of operators in the pilot cohort (e.g., 25, 50, 100). Determines statistical power and minimum detectable effect size." },
        duration_days: { type: "integer", description: "Pilot duration in days (e.g., 30, 60, 90). Longer windows improve intervention re-evaluation stability." },
        metrics: { type: "array", items: { type: "string" }, description: "Array of metric IDs to include (e.g., ['leverage', 'yield', 'token_snr', 'construction']). See list_pilot_options for the full catalog." }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        configuration: {
          type: "object",
          description: "The generated pilot configuration object containing cohort size, duration, and selected metrics.",
          properties: {
            cohort_size: { type: "integer", description: "Number of operators in the cohort (defaults to 50 if not supplied)" },
            duration_days: { type: "integer", description: "Pilot duration in days (defaults to 30 if not supplied)" },
            metrics: { type: "array", items: { type: "string" }, description: "Selected metric IDs (defaults to all 5 canonical metrics if not supplied)" }
          }
        },
        valid: { type: "boolean", description: "Whether the configuration is structurally valid (always true for this read-only generator)" },
        synthetic: { type: "boolean", description: "Whether the underlying data is synthetic (always true in the demo pilot)" }
      },
      required: ["configuration", "valid", "synthetic"]
    },
    annotations: { readOnlyHint: true }
  },
  // ─── Write tools (require authorization) ───
  {
    name: "assign_intervention",
    description: "Assign a targeted intervention to an operator. REQUIRES AUTHORIZATION. Contact pilots@mos2es.org for pilot access.",
    inputSchema: {
      type: "object",
      required: ["operator_id", "intervention_type"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" },
        intervention_type: { type: "string", description: "Intervention type from catalog (e.g., prompt_template, context_window_expansion, model_switch)" },
        notes: { type: "string", description: "Free-text notes about the intervention assignment" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
        tool: { type: "string" }
      },
      required: ["error", "message", "tool"]
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "close_intervention",
    description: "Close an intervention with outcome notes and mark it complete. The intervention must exist and be active. Outcome notes should describe observed changes, unintended effects, and whether the target metric moved. After closing, the intervention is no longer eligible for verify_change comparisons. REQUIRES AUTHORIZATION — contact pilots@mos2es.org for pilot access. In the synthetic demo, this returns an authorization notice.\n\nWhen to use: after an intervention period ends and you have outcome observations to record. When NOT to use: while an intervention is still active and being measured — use get_intervention_status to check the current state first.\n\nBehavioral transparency: on success, the intervention status transitions to 'closed' and a closed_at timestamp is recorded. On authorization failure (the demo behavior), the response includes error='AUTHORIZATION_REQUIRED', a human-readable message, and the tool name — no intervention state changes. Related tools: get_intervention_status (list active/closed interventions), verify_change (pre/post comparison for a closed intervention), assign_intervention (create a new intervention).",
    inputSchema: {
      type: "object",
      required: ["intervention_id"],
      properties: {
        intervention_id: { type: "string", description: "Intervention ID to close (e.g., intv_001, intv_007). Must be an active intervention." },
        outcome_notes: { type: "string", description: "Free-text notes about the intervention outcome — observed changes, unintended effects, whether the target metric moved" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        error: { type: "string", description: "Error type if the call fails (e.g., 'AUTHORIZATION_REQUIRED' when no pilot access is granted; absent on success)" },
        message: { type: "string", description: "Human-readable status message describing the outcome or failure reason" },
        tool: { type: "string", description: "Name of the tool that was invoked (always 'close_intervention')" },
        intervention_id: { type: "string", description: "ID of the closed intervention (present on success)" },
        status: { type: "string", description: "New status of the intervention after closing (e.g., 'closed'; present on success)" },
        closed_at: { type: "string", description: "ISO 8601 timestamp recording when the intervention was closed (present on success)" },
        outcome_notes: { type: "string", description: "The outcome notes that were recorded with the closure (present on success)" }
      },
      required: ["error", "message", "tool"]
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "create_experiment",
    description: "Create an experiment configuration for controlled comparison studies. Experiments pair a pilot configuration with a hypothesis and measurement plan. Use create_pilot_configuration first to build the config, then pass it here. Experiments enforce the ASSOCIATION-not-CAUSATION evidence standard — controlled experiments may upgrade evidence to CAUSATION only with proper design (e.g., randomized assignment, pre-registered hypothesis, control group). REQUIRES AUTHORIZATION — contact pilots@mos2es.org for pilot access. In the synthetic demo, this returns an authorization notice.\n\nWhen to use: when you need a controlled comparison (A/B test, before/after with control group, multi-arm trial across AI systems or intervention types). When NOT to use: for simple pre/post observations without a control group, use verify_change instead — it does not require authorization and returns an ASSOCIATION-labeled comparison.\n\nBehavioral transparency: on success, an experiment record is created with a unique experiment_id, initial status 'draft', and a created_at timestamp. On authorization failure (the demo behavior), the response includes error='AUTHORIZATION_REQUIRED', a human-readable message directing you to pilots@mos2es.org, and the tool name — no experiment record is created. Related tools: create_pilot_configuration (build the config to pass in), validate_pilot_configuration (pre-check the config), verify_change (lightweight pre/post without a full experiment).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Experiment name (e.g., 'Q3 Claude vs ChatGPT operator comparison', 'Context window expansion pilot — Team Alpha')" },
        configuration: { type: "object", description: "Pilot configuration object (JSON) — see list_pilot_options for available metrics, eval families, and benchmark classes. Can be generated by create_pilot_configuration." }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        error: { type: "string", description: "Error type if the call fails (e.g., 'AUTHORIZATION_REQUIRED' when no pilot access is granted; absent on success)" },
        message: { type: "string", description: "Human-readable status message describing the outcome or failure reason" },
        tool: { type: "string", description: "Name of the tool that was invoked (always 'create_experiment')" },
        experiment_id: { type: "string", description: "Unique ID assigned to the created experiment (present on success)" },
        status: { type: "string", description: "Initial lifecycle status of the experiment (e.g., 'draft'; present on success)" },
        created_at: { type: "string", description: "ISO 8601 timestamp recording when the experiment was created (present on success)" },
        name: { type: "string", description: "The experiment name that was supplied (present on success)" }
      },
      required: ["error", "message", "tool"]
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "record_workflow_observation",
    description: "Record a workflow fit observation linking an operator to a workflow stage with a fit score. Workflow fit measures how well an operator's AI usage patterns align with a specific workflow stage (e.g., debugging, code review, architecture). Fit scores range 0.0-1.0 where 1.0 indicates perfect alignment. Use get_workflow_fit to read existing observations. REQUIRES AUTHORIZATION — contact pilots@mos2es.org for pilot access. In the synthetic demo, this returns an authorization notice.\n\nWhen to use: when you have observed an operator working in a specific workflow stage and want to record the fit score so it can be analyzed alongside other observations. When NOT to use: for reading existing workflow fit observations, use get_workflow_fit instead — it is read-only and does not require authorization.\n\nBehavioral transparency: on success, a new observation record is created with a unique observation_id and a recorded_at timestamp, echoing back the operator_id and workflow_id. On authorization failure (the demo behavior), the response includes error='AUTHORIZATION_REQUIRED', a human-readable message, and the tool name — no observation is recorded. Related tools: get_workflow_fit (read existing observations), get_operator_profile (operator metric profile used to compute fit).",
    inputSchema: {
      type: "object",
      required: ["operator_id", "workflow_id"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)" },
        workflow_id: { type: "string", description: "Workflow ID (e.g., wf_debugging, wf_code_review, wf_architecture, wf_refactor, wf_testing)" },
        fit_score: { type: "number", description: "Workflow fit score from 0.0 (no alignment) to 1.0 (perfect alignment). Computed from operator metric profile vs workflow requirements." },
        notes: { type: "string", description: "Free-text notes about the observation context — task type, AI system used, environmental factors" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        error: { type: "string", description: "Error type if the call fails (e.g., 'AUTHORIZATION_REQUIRED' when no pilot access is granted; absent on success)" },
        message: { type: "string", description: "Human-readable status message describing the outcome or failure reason" },
        tool: { type: "string", description: "Name of the tool that was invoked (always 'record_workflow_observation')" },
        observation_id: { type: "string", description: "Unique ID assigned to the recorded observation (present on success)" },
        recorded_at: { type: "string", description: "ISO 8601 timestamp recording when the observation was saved (present on success)" },
        operator_id: { type: "string", description: "Operator ID that was observed (present on success, echoes the input)" },
        workflow_id: { type: "string", description: "Workflow ID that was observed (present on success, echoes the input)" },
        fit_score: { type: "number", description: "Fit score that was recorded (present on success, echoes the input)" }
      },
      required: ["error", "message", "tool"]
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "attach_outcome_dataset",
    description: "Attach external outcome dataset for join analysis. Outcome joins are ASSOCIATION, never CAUSATION. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["source"],
      properties: {
        source: { type: "string", description: "External outcome data source name (e.g., 'jira', 'github', 'linear')" },
        format: { type: "string", description: "Data format (e.g., 'json', 'csv', 'jsonl')" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        error: { type: "string" },
        message: { type: "string" },
        tool: { type: "string" }
      },
      required: ["error", "message", "tool"]
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  // ─── Operator×System, Lineage, Topology, Similarity ───
  {
    name: "get_operator_system_decomposition",
    description: "Two-way ANOVA-style decomposition partitioning metric variance into operator effect, system effect, and operator×system interaction. Computed from raw observations grouped by platform. Shows whether operator capability or system choice drives performance.",
    inputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string", description: "Optional: filter to a single operator's decomposition" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        systems_compared: { type: "array", items: { type: "string" } },
        operators_analyzed: { type: "integer" },
        total_observations: { type: "integer" },
        metrics: { type: "array", items: { type: "object" } },
        summary: { type: "string" }
      },
      required: ["systems_compared", "operators_analyzed", "total_observations", "metrics", "summary"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_lineage_chain",
    description: "Get the full lineage chain for an operator: STATE_A → BI_ACTION → AAI_TRANSFORMATION → BI_REDIRECTION → AAI_EXTENSION → COMMITTED_STATE → OUTCOME. Built from raw lineage and outcome data.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_046)" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        lineage: { type: "object", properties: { operator_id: { type: "string" }, chains: { type: "array", items: { type: "object" } } } },
        synthetic: { type: "boolean" },
        metric_registry_version: { type: "string" },
        data_window: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
        reference_version: { type: "string" },
        privacy_class: { type: "string" },
        validation_status: { type: "string" }
      },
      required: ["lineage", "synthetic", "metric_registry_version", "data_window", "reference_version", "privacy_class", "validation_status"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_lineage_summary",
    description: "Get lineage summary across the cohort — total lineages, workflow breakdown, average micro-eval metrics, outcomes linked. Computed from raw lineage data.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        lineage_summary: {
          type: "object",
          properties: {
            total: { type: "integer" },
            by_workflow: { type: "object" },
            avg_micro_eval: { type: "object" },
            outcomes_linked: { type: "integer" },
            outcomes_total: { type: "integer" }
          }
        },
        synthetic: { type: "boolean" },
        metric_registry_version: { type: "string" },
        data_window: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
        reference_version: { type: "string" },
        privacy_class: { type: "string" },
        validation_status: { type: "string" }
      },
      required: ["lineage_summary", "synthetic", "metric_registry_version", "data_window", "reference_version", "privacy_class", "validation_status"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_outcome_correlation",
    description: "Correlate micro-eval metrics with outcome quality scores and cycle times through lineage. Computed via Pearson r from raw lineage + outcome data. Results labeled ASSOCIATION with evidence grade OBSERVATIONAL, never CAUSATION.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        correlations: { type: "array", items: { type: "object" } },
        operators_analyzed: { type: "integer" },
        lineages_with_outcomes: { type: "integer" },
        evidence_grade: { type: "string" },
        claim_status: { type: "string" },
        summary: { type: "string" }
      },
      required: ["correlations", "operators_analyzed", "lineages_with_outcomes", "evidence_grade", "claim_status", "summary"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_org_topology",
    description: "Organization-level AI topology map — team-level metric distributions, median canonical metrics per team, capability concentration (Gini coefficient), platform adoption, single-point-of-failure detection, cross-team complementarity. Computed from raw measurements.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        total_operators: { type: "integer" },
        total_teams: { type: "integer" },
        team_topologies: { type: "array", items: { type: "object" } },
        capability_concentration: { type: "array", items: { type: "object" } },
        platform_adoption: { type: "array", items: { type: "object" } },
        single_points_of_failure: { type: "array", items: { type: "object" } },
        cross_team_complementarity: { type: "object" },
        summary: { type: "string" }
      },
      required: ["total_operators", "total_teams", "team_topologies", "capability_concentration", "platform_adoption", "single_points_of_failure", "cross_team_complementarity", "summary"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_operator_similarity",
    description: "Nearest-neighbor operator search using percentile-rank normalization and Euclidean distance across 5 canonical metrics. Computed from raw measurements. Returns comparable operators/cohorts, NOT personality matching.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001)" },
        n_neighbors: { type: "integer", default: 5, description: "Number of nearest neighbors to return" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        query_operator_id: { type: "string" },
        normalization: { type: "string" },
        distance_metric: { type: "string" },
        nearest_neighbors: { type: "array", items: { type: "object" } },
        cluster_quality: { type: "string" },
        cluster_description: { type: "string" },
        note: { type: "string" }
      },
      required: ["query_operator_id", "normalization", "distance_metric", "nearest_neighbors", "cluster_quality", "cluster_description", "note"]
    },
    annotations: { readOnlyHint: true }
  }
];

const WRITE_TOOLS = new Set([
  "assign_intervention", "close_intervention", "create_experiment",
  "record_workflow_observation", "attach_outcome_dataset"
]);

// ─── Prompt Definitions ─────────────────────────────────────────────
const PROMPTS = [
  {
    name: "operator_evaluation_summary",
    description: "Generate a summary evaluation of an operator's AI usage patterns, strengths, and gaps. Args: operator_id",
    arguments: [
      {
        name: "operator_id",
        description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)",
        required: true
      }
    ]
  },
  {
    name: "intervention_recommendation",
    description: "Generate intervention recommendations for an operator based on their diagnostics and divergence patterns. Args: operator_id",
    arguments: [
      {
        name: "operator_id",
        description: "Pseudonymous operator ID (e.g., op_001, op_003, op_034)",
        required: true
      }
    ]
  },
  {
    name: "cohort_health_report",
    description: "Generate a cohort health report covering data quality, metric distributions, and capability concentration. No args.",
    arguments: []
  },
  {
    name: "workflow_fit_analysis",
    description: "Generate a workflow fit analysis showing which operators fit which workflow stages. No args.",
    arguments: []
  },
  {
    name: "pilot_scoping_guide",
    description: "Generate a pilot scoping guide for a new enterprise engagement. No args.",
    arguments: []
  }
];

// ─── Prompt Handler ──────────────────────────────────────────────────
function handlePromptGet(promptName, args) {
  const operatorId = args?.operator_id || "op_001";

  let text;
  switch (promptName) {
    case "operator_evaluation_summary":
      text = `Generate a summary evaluation for operator ${operatorId}. Follow these steps:\n\n1. Call get_operator_profile with operator_id="${operatorId}" to retrieve the operator's 5 canonical metric measurements and percentiles.\n2. Call get_composite_score with operator_id="${operatorId}" to retrieve the developmental composite score and component breakdown.\n3. Call get_diagnostics with operator_id="${operatorId}" to retrieve pattern detections and diagnoses.\n4. Call get_operator_similarity with operator_id="${operatorId}" to find the operator's nearest peer group.\n5. Synthesize the results into a summary covering: (a) overall developmental score and where the operator sits relative to the cohort, (b) metric-level strengths and gaps with percentile context, (c) any detected divergence patterns (e.g., HIGH_USAGE_LOW_OPERATION), (d) peer group context, and (e) developmental recommendations. Remember: all labels are DEVELOPMENTAL, all diagnoses are HYPOTHESIS.`;
      break;

    case "intervention_recommendation":
      text = `Generate intervention recommendations for operator ${operatorId}. Follow these steps:\n\n1. Call get_diagnostics with operator_id="${operatorId}" to retrieve detected patterns and diagnoses.\n2. Call find_usage_operation_divergence to see where this operator sits in the cohort-wide divergence ranking.\n3. Call get_composite_score with operator_id="${operatorId}" to identify which metrics are weakest.\n4. Call list_pilot_options to retrieve the available intervention types (COA-001 through COA-005).\n5. Call get_intervention_status to see if any interventions are already active for this operator.\n6. Synthesize recommendations: match the detected pattern to the most appropriate intervention type, explain the rationale (which metric is weak, what the intervention targets), and note the ASSOCIATION evidence standard. Remember: all diagnoses are HYPOTHESIS, recommendations are developmental not punitive.`;
      break;

    case "cohort_health_report":
      text = `Generate a cohort health report. Follow these steps:\n\n1. Call get_pilot_status to retrieve the cohort overview, observation count, and data quality summary.\n2. Call get_data_quality to retrieve completeness, coverage, and validity metrics.\n3. Call get_composite_score_summary to retrieve the score distribution (min, max, median, mean, Q1, Q3).\n4. Call get_cohort_distribution with metric="leverage" to see the leverage distribution.\n5. Call get_org_topology to retrieve capability concentration (Gini), platform adoption, and single points of failure.\n6. Synthesize a health report covering: (a) data quality and coverage, (b) score distribution and spread, (c) capability concentration risks, (d) platform adoption balance, (e) any single points of failure. Remember: all data is from a 50-operator synthetic pilot.`;
      break;

    case "workflow_fit_analysis":
      text = `Generate a workflow fit analysis. Follow these steps:\n\n1. Call get_workflow_fit to retrieve the workflow stages and existing fit observations.\n2. Call get_org_topology to understand team-level metric distributions that inform fit.\n3. Call get_operator_system_decomposition to see whether operator capability or system choice drives performance.\n4. Synthesize an analysis covering: (a) which workflow stages have the most observations, (b) how operator metric profiles map to stage requirements, (c) whether operator or system effects dominate, and (d) which operators are likely strong fits for which stages. Remember: fit scores are developmental guidance, not personnel assignments.`;
      break;

    case "pilot_scoping_guide":
      text = `Generate a pilot scoping guide for a new enterprise engagement. Follow these steps:\n\n1. Call list_pilot_options to retrieve available canonical metrics, eval families, benchmark classes, and intervention types.\n2. Call get_pilot_status to see the current demo pilot as a reference example.\n3. Call create_pilot_configuration with cohort_size=50, duration_days=90, and metrics=["leverage","yield","token_snr","construction"] to generate a sample configuration.\n4. Call validate_pilot_configuration with the generated configuration to demonstrate the validation step.\n5. Synthesize a scoping guide covering: (a) recommended cohort size and rationale, (b) observation window length and trade-offs, (c) which metrics to select and why, (d) governance commitments (DEVELOPMENTAL labels, ASSOCIATION evidence standard, no punitive use), and (e) the validation workflow before deployment.`;
      break;

    default:
      return null;
  }

  return {
    description: PROMPTS.find(p => p.name === promptName)?.description || promptName,
    messages: [
      {
        role: "assistant",
        content: { type: "text", text }
      }
    ]
  };
}

// ─── Resource Definitions ───────────────────────────────────────────
const RESOURCES = [
  {
    uri: "moses://metrics/canonical",
    name: "Canonical Metric Definitions",
    description: "The 5 canonical metric definitions (yield, leverage, token SNR, construction, divergence) with formulas, units, and status.",
    mimeType: "application/json"
  },
  {
    uri: "moses://metrics/registry",
    name: "Full Metric Registry",
    description: "Full metric registry with formulas, status, and requirements for all registered metrics.",
    mimeType: "application/json"
  },
  {
    uri: "moses://pilot/status",
    name: "Current Pilot Status",
    description: "Current pilot status as a resource — cohort size, observation count, date range, data quality, and active interventions.",
    mimeType: "application/json"
  },
  {
    uri: "moses://pilot/options",
    name: "Available Pilot Options",
    description: "Available pilot options including canonical metrics, eval families, benchmark classes, and intervention types.",
    mimeType: "application/json"
  },
  {
    uri: "moses://governance/conventions",
    name: "Governance Conventions",
    description: "Key governance conventions: association not causation, developmental not personnel, HYPOTHESIS diagnoses, no punitive use, no operator leaderboards.",
    mimeType: "application/json"
  },
  {
    uri: "moses://cohort/operators",
    name: "Cohort Operator List",
    description: "List of all 50 operators with team, role, level, and platform.",
    mimeType: "application/json"
  }
];

// ─── Resource Handler ────────────────────────────────────────────────
function handleResourceRead(uri) {
  let text;
  switch (uri) {
    case "moses://metrics/canonical": {
      const canonical = metricRegistryData.metrics.filter(m => CANONICAL_METRICS.includes(m.metric_id));
      text = JSON.stringify({
        canonical_metrics: canonical.map(m => ({
          metric_id: m.metric_id,
          name: m.name,
          formula: m.formula,
          unit: m.unit,
          status: m.status,
          requires: m.requires
        })),
        note: "These 5 metrics form the canonical set. token_snr and construction carry CANONICAL_WITH_INTERPRETATION_LIMIT status — interpret with caution as they are context-dependent."
      }, null, 2);
      break;
    }

    case "moses://metrics/registry":
      text = JSON.stringify(metricRegistryData, null, 2);
      break;

    case "moses://pilot/status": {
      const windowObs = observations.filter(o => {
        const d = o.timestamp.slice(0, 10);
        return d >= WINDOW_START && d <= WINDOW_END;
      });
      text = JSON.stringify({
        cohort_id: cohortData.cohort_id,
        window: { start: WINDOW_START, end: WINDOW_END },
        total_operators: operatorsData.length,
        observation_count: windowObs.length,
        metric_registry_version: metricRegistryData.registry_version,
        reference_field_version: referenceFieldData.version,
        active_interventions: interventionsData.filter(i => !i.synthetic_outcome || i.synthetic_outcome === "PENDING").length,
        data_quality: {
          OK: operatorsData.length,
          WARNING: windowObs.filter(o => o.input_tokens === 0).length,
          BLOCKING: 0,
        },
        synthetic: true
      }, null, 2);
      break;
    }

    case "moses://pilot/options":
      text = JSON.stringify({
        canonical_metrics: metricRegistryData.metrics.map(m => ({ metric_id: m.metric_id, name: m.name, status: m.status, formula: m.formula })),
        eval_families: 15,
        benchmark_classes: 13,
        intervention_types: ["COA-001", "COA-002", "COA-003", "COA-004", "COA-005"],
        synthetic: true
      }, null, 2);
      break;

    case "moses://governance/conventions":
      text = JSON.stringify({
        conventions: [
          {
            id: "association_not_causation",
            rule: "All outcome correlations and intervention comparisons are labeled ASSOCIATION, never CAUSATION.",
            rationale: "Observational data without randomized controlled trials cannot establish causality."
          },
          {
            id: "developmental_not_personnel",
            rule: "All scores and labels are DEVELOPMENTAL — for development use, not personnel performance rating.",
            rationale: "AI operator metrics measure tool-use patterns, not employee worth or competence."
          },
          {
            id: "hypothesis_diagnoses",
            rule: "All pattern diagnoses are HYPOTHESIS, never fact.",
            rationale: "Divergence patterns suggest areas for development, not definitive problems."
          },
          {
            id: "no_punitive_use",
            rule: "No automatic adverse actions, no punitive labels, no operator leaderboards.",
            rationale: "Metrics should drive coaching and development, not discipline."
          },
          {
            id: "pseudonymous_operators",
            rule: "Operator IDs are pseudonymous (op_001 through op_050). No real names or PII.",
            rationale: "Privacy protection for pilot participants."
          },
          {
            id: "interpretation_limits",
            rule: "token_snr and construction carry CANONICAL_WITH_INTERPRETATION_LIMIT status — interpret with caution.",
            rationale: "These metrics are context-dependent and may not generalize across workflows."
          }
        ],
        evidence_labels: ["ASSOCIATION", "OBSERVATIONAL", "HYPOTHESIS", "DEVELOPMENTAL"],
        synthetic: true
      }, null, 2);
      break;

    case "moses://cohort/operators":
      text = JSON.stringify({
        cohort_id: cohortData.cohort_id,
        total_operators: operatorsData.length,
        operators: operatorsData.map(o => ({
          operator_id: o.operator_id,
          pseudonym: o.pseudonym,
          team: o.team,
          role_family: o.role_family,
          level: o.level,
          primary_platform: o.primary_platform
        })),
        synthetic: true
      }, null, 2);
      break;

    default:
      return null;
  }

  return { contents: [{ uri, mimeType: "application/json", text }] };
}

// ─── Tool Handlers ──────────────────────────────────────────────────
function handleToolCall(name, args) {
  if (WRITE_TOOLS.has(name)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "AUTHORIZATION_REQUIRED",
          message: "This write tool requires authorization. Contact pilots@mos2es.org for pilot access.",
          tool: name
        })
      }],
      isError: true
    };
  }

  let result;
  switch (name) {
    case "get_pilot_status": {
      const windowObs = observations.filter(o => {
        const d = o.timestamp.slice(0, 10);
        return d >= WINDOW_START && d <= WINDOW_END;
      });
      result = {
        cohort_id: cohortData.cohort_id,
        window: { start: WINDOW_START, end: WINDOW_END },
        eligible_operators: operatorsData.length,
        total_operators: operatorsData.length,
        providers: [...new Set(windowObs.map(o => o.platform))].sort(),
        observation_count: windowObs.length,
        metric_registry_version: metricRegistryData.registry_version,
        reference_field_version: referenceFieldData.version,
        active_interventions: interventionsData.filter(i => !i.synthetic_outcome || i.synthetic_outcome === "PENDING").length,
        data_quality: {
          OK: operatorsData.length,
          WARNING: windowObs.filter(o => o.input_tokens === 0).length,
          BLOCKING: 0,
        },
        synthetic: true,
      };
      break;
    }

    case "get_operator_profile": {
      const opId = args?.operator_id || "op_001";
      const op = operatorsData.find(o => o.operator_id === opId);
      if (!op) {
        result = { error: "OPERATOR_NOT_FOUND", operator_id: opId, message: "Operator not found. Available: op_001 through op_050." };
        break;
      }
      const ms = allMeasurements[opId];
      const measurements = CANONICAL_METRICS.map(mid => {
        const val = ms[mid];
        const pct = val !== null ? percentileFromReference(mid, val) : null;
        return {
          metric_id: mid,
          value: val !== null ? round(val, 6) : null,
          percentile: pct !== null ? round(pct, 1) : null,
          status: METRIC_STATUS[mid],
          eligibility: val === null ? "FAILED" : "OK",
        };
      });
      result = {
        operator_id: opId,
        pseudonym: op.pseudonym,
        team: op.team,
        role_family: op.role_family,
        level: op.level,
        primary_platform: op.primary_platform,
        measurements,
        synthetic: true,
      };
      break;
    }

    case "get_cohort_distribution": {
      const metric = args?.metric || "leverage";
      const vals = operatorsData.map(o => allMeasurements[o.operator_id]?.[metric]).filter(v => v !== null && v !== undefined);
      if (vals.length === 0) {
        result = { error: "METRIC_NOT_FOUND", metric, message: "Metric not found. Available: leverage, yield, token_snr, log_leverage, construction" };
        break;
      }
      const sorted = [...vals].sort((a, b) => a - b);
      const n = sorted.length;
      const mean = sorted.reduce((s, v) => s + v, 0) / n;
      const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
      // Outlier detection (beyond 1.5×IQR)
      const q1 = sorted[Math.floor(n * 0.25)];
      const q3 = sorted[Math.floor(n * 0.75)];
      const iqrVal = q3 - q1;
      const lowerBound = q1 - 1.5 * iqrVal;
      const upperBound = q3 + 1.5 * iqrVal;
      const outliers = operatorsData.filter(o => {
        const v = allMeasurements[o.operator_id]?.[metric];
        return v !== null && v !== undefined && (v < lowerBound || v > upperBound);
      }).map(o => o.operator_id);

      result = {
        metric,
        count: n,
        min: round(sorted[0], 4),
        p10: round(sorted[Math.floor(n * 0.1)], 4),
        p25: round(q1, 4),
        median: round(median(sorted), 4),
        p75: round(q3, 4),
        p90: round(sorted[Math.floor(n * 0.9)], 4),
        max: round(sorted[n - 1], 4),
        mean: round(mean, 4),
        std: round(Math.sqrt(variance), 4),
        outliers,
        synthetic: true,
      };
      break;
    }

    case "get_composite_score": {
      const csId = args?.operator_id || "op_001";
      const ms = allMeasurements[csId];
      if (!ms) {
        result = { error: "OPERATOR_NOT_FOUND", operator_id: csId, message: "Operator not found. 50 operators available (op_001 through op_050)." };
        break;
      }
      result = computeCompositeScore(csId, ms);
      break;
    }

    case "get_composite_score_summary": {
      const scores = operatorsData.map(op => computeCompositeScore(op.operator_id, allMeasurements[op.operator_id]));
      const values = scores.map(s => s.score).filter(s => s !== null).sort((a, b) => a - b);
      const n = values.length;
      result = {
        count: n,
        min: round(values[0], 2),
        max: round(values[n - 1], 2),
        median: round(median(values), 2),
        mean: round(values.reduce((s, v) => s + v, 0) / n, 2),
        q1: round(values[Math.floor(n / 4)], 2),
        q3: round(values[Math.floor(3 * n / 4)], 2),
        score_id: "dev_index",
        name: "AI Operator Development Index",
        label: "DEVELOPMENTAL — cohort distribution, not individual ranking",
        weights: METRIC_WEIGHTS,
      };
      break;
    }

    case "get_diagnostics": {
      const diagId = args?.operator_id || "op_001";
      const divergence = computeDivergence(allMeasurements);
      const divEntry = divergence.find(d => d.operator_id === diagId);
      result = {
        operator_id: diagId,
        patterns: divEntry ? [{
          type: divEntry.divergence_class,
          usage_percentile: divEntry.usage_percentile,
          yield_percentile: divEntry.yield_percentile,
          leverage_percentile: divEntry.leverage_percentile,
          divergence_pp: divEntry.divergence_pp
        }] : [],
        diagnoses: divEntry ? [{
          pattern: divEntry.divergence_class,
          status: "HYPOTHESIS",
          evidence: `Usage percentile ${divEntry.usage_percentile} vs yield percentile ${divEntry.yield_percentile} (divergence: ${divEntry.divergence_pp}pp)`
        }] : [],
        status: "HYPOTHESIS",
        synthetic: true,
      };
      break;
    }

    case "get_data_quality": {
      const windowObs = observations.filter(o => {
        const d = o.timestamp.slice(0, 10);
        return d >= WINDOW_START && d <= WINDOW_END;
      });
      const totalObs = windowObs.length;
      const zeroInput = windowObs.filter(o => o.input_tokens === 0).length;
      const zeroOutput = windowObs.filter(o => o.output_tokens === 0).length;
      result = {
        total_observations: totalObs,
        operators_covered: operatorsData.length,
        completeness: round((totalObs - zeroInput) / totalObs, 4),
        coverage: round(operatorsData.length / operatorsData.length, 4),
        validity: round((totalObs - zeroInput - zeroOutput) / totalObs, 4),
        issues: {
          zero_input_observations: zeroInput,
          zero_output_observations: zeroOutput,
        },
        synthetic: true,
      };
      break;
    }

    case "find_usage_operation_divergence": {
      const divergence = computeDivergence(allMeasurements);
      result = {
        divergent_operators: divergence.filter(d => d.divergence_class !== "ALIGNED" && Math.abs(d.divergence_pp) > 20),
        all_operators: divergence,
        synthetic: true,
      };
      break;
    }

    case "get_workflow_fit":
      result = {
        workflow_id: "software_dev_v1",
        stages: workflowsData[0]?.stages || [],
        observations: lineages.length,
        synthetic: true,
        note: "Full workflow fit analysis available via CLI: enterprise workflow fit",
      };
      break;

    case "get_intervention_status":
      result = {
        active: interventionsData.filter(i => i.synthetic_outcome === "PENDING" || !i.synthetic_outcome),
        closed: interventionsData.filter(i => i.synthetic_outcome && i.synthetic_outcome !== "PENDING"),
        all: interventionsData,
        count: interventionsData.length,
        synthetic: true,
      };
      break;

    case "list_pilot_options":
      result = {
        canonical_metrics: metricRegistryData.metrics.map(m => ({ metric_id: m.metric_id, name: m.name, status: m.status, formula: m.formula })),
        eval_families: 15,
        benchmark_classes: 13,
        intervention_types: ["COA-001", "COA-002", "COA-003", "COA-004", "COA-005"],
        synthetic: true,
      };
      break;

    case "validate_pilot_configuration":
      result = { valid: true, warnings: [], errors: [], message: "Configuration is valid for demo pilot." };
      break;

    case "compare_operator_to_reference": {
      const cmpId = args?.operator_id || "op_001";
      const ms = allMeasurements[cmpId];
      if (!ms) {
        result = { error: "OPERATOR_NOT_FOUND", operator_id: cmpId, message: "Operator not found." };
        break;
      }
      const comparisons = CANONICAL_METRICS.map(mid => {
        const val = ms[mid];
        const pct = val !== null ? percentileFromReference(mid, val) : null;
        return { metric_id: mid, value: val !== null ? round(val, 6) : null, percentile: pct !== null ? round(pct, 1) : null };
      });
      result = {
        operator_id: cmpId,
        reference: args?.reference || "peer",
        reference_version: referenceFieldData.version,
        comparisons,
        synthetic: true,
      };
      break;
    }

    case "get_executive_dashboard":
      result = {
        message: "Executive dashboard is a self-contained HTML file generated by the CLI.",
        command: "enterprise export dashboard --output file.html",
        features: [
          "Cohort overview", "Data quality", "Composite score distribution",
          "Top patterns", "Usage/operation divergence", "Intervention outcomes",
          "Workflow fit", "Next evaluations flywheel"
        ],
        governance: "No operator leaderboard, no automatic adverse actions, no punitive labels."
      };
      break;

    case "verify_change": {
      const vId = args?.operator_id || "op_001";
      const score = computeCompositeScore(vId, allMeasurements[vId]);
      result = {
        operator_id: vId,
        composite_score: score.score,
        label: "ASSOCIATION",
        message: "Pre/post intervention comparison available via CLI: enterprise verify-change <operator_id> --intervention <id>",
        synthetic: true,
      };
      break;
    }

    case "create_pilot_configuration":
      result = {
        configuration: {
          cohort_size: args?.cohort_size || 50,
          duration_days: args?.duration_days || 30,
          metrics: args?.metrics || ["leverage", "yield", "token_snr", "log_leverage", "construction"]
        },
        valid: true,
        synthetic: true
      };
      break;

    case "get_operator_system_decomposition":
      result = computeOperatorSystemDecomposition(args?.operator_id || "");
      break;

    case "get_lineage_chain": {
      const lcId = args?.operator_id || "op_001";
      const opLineages = lineages.filter(l => l.operator_id === lcId);
      if (opLineages.length === 0) {
        result = { error: "OPERATOR_NOT_FOUND", operator_id: lcId, message: "No lineage data for this operator. Available: op_001 through op_050." };
        break;
      }
      result = {
        lineage: {
          operator_id: lcId,
          chains: opLineages.map(buildLineageChain),
        },
        synthetic: true,
        metric_registry_version: metricRegistryData.registry_version,
        data_window: { start: WINDOW_START, end: WINDOW_END },
        reference_version: referenceFieldData.version,
        privacy_class: "pseudonymous_synthetic",
        validation_status: "synthetic_demo",
      };
      break;
    }

    case "get_lineage_summary": {
      const byWorkflow = {};
      for (const lin of lineages) {
        byWorkflow[lin.workflow_id] = (byWorkflow[lin.workflow_id] || 0) + 1;
      }
      // Average micro_eval metrics
      const avgMicroEval = {};
      const metricKeys = new Set();
      for (const lin of lineages) {
        if (lin.micro_eval) {
          for (const k of Object.keys(lin.micro_eval)) {
            if (typeof lin.micro_eval[k] === "number") metricKeys.add(k);
          }
        }
      }
      for (const k of metricKeys) {
        const vals = lineages.map(l => l.micro_eval?.[k]).filter(v => typeof v === "number");
        if (vals.length > 0) avgMicroEval[k] = round(vals.reduce((s, v) => s + v, 0) / vals.length, 4);
      }
      const outcomesById = Object.fromEntries(outcomesData.map(o => [o.outcome_id, o]));
      const linked = lineages.filter(l => l.outcome_id && outcomesById[l.outcome_id]).length;
      result = {
        lineage_summary: {
          total: lineages.length,
          by_workflow: byWorkflow,
          avg_micro_eval: avgMicroEval,
          outcomes_linked: linked,
          outcomes_total: outcomesData.length,
        },
        synthetic: true,
        metric_registry_version: metricRegistryData.registry_version,
        data_window: { start: WINDOW_START, end: WINDOW_END },
        reference_version: referenceFieldData.version,
        privacy_class: "pseudonymous_synthetic",
        validation_status: "synthetic_demo",
      };
      break;
    }

    case "get_outcome_correlation":
      result = { outcome_correlation: computeOutcomeCorrelation() };
      break;

    case "get_org_topology":
      result = computeOrgTopology(allMeasurements);
      break;

    case "get_operator_similarity": {
      const simId = args?.operator_id || "op_001";
      const n = args?.n_neighbors || 5;
      result = computeOperatorSimilarity(simId, allMeasurements, n);
      break;
    }

    default:
      result = { error: "UNKNOWN_TOOL", tool: name };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

// ─── MCP Streamable HTTP server ─────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Session-Id",
      "Access-Control-Expose-Headers": "MCP-Session-Id",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check / info
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        server: "Upsilon MCP Server",
        product: "Upsilon",
        governance: "MO§ES™",
        proof_surface: "SigRank",
        version: "0.4.0",
        transport: "streamable-http",
        tools: TOOLS.length,
        read_tools: TOOLS.length - WRITE_TOOLS.size,
        write_tools: WRITE_TOOLS.size,
        prompts: PROMPTS.length,
        resources: RESOURCES.length,
        url: "https://mcp.mos2es.org",
        docs: "https://mos2es.org/docs",
        openapi: "https://mos2es.org/openapi.json",
        data_source: "50-operator synthetic pilot — outputs computed from raw observations at request time",
        governance_label: "DEVELOPMENTAL labels, HYPOTHESIS diagnoses, ASSOCIATION outcomes, no punitive use",
        interpretation_limits: "Upsilon describes observable token-processing patterns. Metrics are not proof of cognition, work quality, employee productivity, or business outcomes."
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // MCP protocol endpoint
    if (url.pathname === "/mcp" || url.pathname === "/sse") {
      if (method !== "POST") {
        return new Response(JSON.stringify({
          error: "METHOD_NOT_ALLOWED",
          message: "Use POST to interact with the MCP server. GET / for server info."
        }), {
          status: 405,
          headers: { "Content-Type": "application/json", "Allow": "POST", ...corsHeaders }
        });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const { jsonrpc, method: rpcMethod, params, id } = body;

      let result;
      switch (rpcMethod) {
        case "initialize":
          result = {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: { listChanged: false },
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: "upsilon-mcp",
              version: "0.4.0",
              title: "Upsilon — Enterprise Measurement Engine",
              governance: "MO§ES™",
              proof_surface: "SigRank"
            }
          };
          break;

        case "tools/list":
          result = { tools: TOOLS };
          break;

        case "tools/call": {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          const tool = TOOLS.find(t => t.name === toolName);
          if (!tool) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: `Unknown tool: ${toolName}` },
              id
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
          result = handleToolCall(toolName, toolArgs);
          break;
        }

        case "ping":
          result = {};
          break;

        case "resources/list":
          result = { resources: RESOURCES };
          break;

        case "resources/read": {
          const resourceUri = params?.uri;
          if (!resourceUri) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: "Missing uri parameter" },
              id
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
          const resourceResult = handleResourceRead(resourceUri);
          if (!resourceResult) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: `Unknown resource: ${resourceUri}` },
              id
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
          result = resourceResult;
          break;
        }

        case "prompts/list":
          result = { prompts: PROMPTS };
          break;

        case "prompts/get": {
          const promptName = params?.name;
          const promptArgs = params?.arguments || {};
          if (!promptName) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: "Missing name parameter" },
              id
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
          const promptResult = handlePromptGet(promptName, promptArgs);
          if (!promptResult) {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: `Unknown prompt: ${promptName}` },
              id
            }), {
              headers: { "Content-Type": "application/json", ...corsHeaders }
            });
          }
          result = promptResult;
          break;
        }

        default:
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${rpcMethod}` },
            id
          }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
      }

      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        result,
        id
      }), {
        headers: {
          "Content-Type": "application/json",
          "MCP-Session-Id": "moses-mcp-session",
          ...corsHeaders
        }
      });
    }

    // Server card for MCP directories (Smithery, Glama, etc.)
    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(JSON.stringify({
        serverInfo: {
          name: "upsilon-mcp",
          version: "0.4.0",
          title: "Upsilon — Enterprise Measurement Engine",
          governance: "MO§ES™",
          proof_surface: "SigRank"
        },
        authentication: {
          required: false,
          schemes: []
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true
        },
        tools: TOOLS,
        resources: RESOURCES,
        prompts: PROMPTS
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 404
    return new Response(JSON.stringify({
      error: "NOT_FOUND",
      message: "Use POST /mcp for MCP protocol, GET / for server info.",
      endpoints: {
        info: "GET /",
        mcp: "POST /mcp",
        docs: "https://mos2es.org/docs",
        openapi: "https://mos2es.org/openapi.json"
      }
    }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};
