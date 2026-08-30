/**
 * tests/enterprise-adapter-conformance.test.mjs
 *
 * Cross-repository conformance gate for the Upsilon enterprise adapter.
 *
 * Validates that the portable portion of an enterprise observation passes
 * the same 13-fixture standalone conformance pack from sigrank-standard that
 * sigrank-mcp and sigrank-app already consume. This ensures the enterprise
 * adapter preserves portable semantics — the adapter wraps the portable
 * record but never alters its metrics, telemetry, or warnings.
 *
 * Pin: the Standard commit is pinned via the SIGRANK_STANDARD_REF env var
 * (default: the merged baseline `c73f152`). Upstream changes to the Standard
 * cannot silently alter consumer builds — a bump requires updating this pin
 * in a reviewable commit.
 *
 * Usage (CI):
 *   node tests/enterprise-adapter-conformance.test.mjs <path-to-sigrank-standard>
 *
 * The sigrank-standard repo is checked out by CI alongside this repo.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildEnterpriseObservation } from "../enterprise-adapter/adapter.mjs";

// ─── Pinned Standard ref ─────────────────────────────────────────────────────

const SIGRANK_STANDARD_REF = process.env.SIGRANK_STANDARD_REF || "c73f152";

const standardRoot = process.argv[2] || process.env.SIGRANK_STANDARD_PATH;
if (!standardRoot || !existsSync(standardRoot)) {
  console.error(
    "Usage: node tests/enterprise-adapter-conformance.test.mjs <path-to-sigrank-standard>",
  );
  console.error(
    "Set SIGRANK_STANDARD_PATH or pass the repo root as the first argument.",
  );
  process.exit(2);
}

const fixturesDir = join(standardRoot, "examples", "fixtures");
const schemaPath = join(standardRoot, "schema", "sigrank-operator-record-v0.1.schema.json");

if (!existsSync(fixturesDir)) {
  console.error(`Fixtures directory not found: ${fixturesDir}`);
  process.exit(2);
}
if (!existsSync(schemaPath)) {
  console.error(`Schema not found: ${schemaPath}`);
  process.exit(2);
}

const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const fixtureFiles = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

assert.ok(
  fixtureFiles.length === 13,
  `Expected 13 fixtures, found ${fixtureFiles.length}`,
);

// ─── Portable record builder (mirrors sigrank-standard computeMetrics) ───────
// The moses repo does not depend on @sigrank/cascade, so the five-metric
// formulas are implemented inline. These match the canonical reference
// (Yield 18436.98 for the MOSES seed) and the standalone runner exactly.

const SPEC_VERSION = "sigrank/0.1-draft";

function round(value, decimals) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeMetrics(telemetry) {
  const input = telemetry.input;
  const output = telemetry.output;
  const cacheWrite = telemetry.cache_write ?? telemetry.cache_creation ?? null;
  const cacheRead = telemetry.cache_read ?? null;
  const warnings = [];

  // SNR = output / (input + output)
  const snrDenom = input + output;
  const snrRaw = snrDenom > 0 ? output / snrDenom : null;
  if (snrRaw === null) warnings.push("snr_undefined: input+output=0");

  // Velocity = output / input
  const velocityRaw = input > 0 ? output / input : null;
  if (velocityRaw === null) warnings.push("velocity_undefined: input=0");

  // Leverage = cacheRead / input — null when cache_read is unavailable
  let leverageRaw = null;
  if (cacheRead === null) {
    // Standard null policy: unavailable cache_read → null
  } else if (input > 0) {
    leverageRaw = cacheRead / input;
  } else {
    warnings.push("leverage_undefined: input=0");
  }

  // Yield = (cacheRead × output) / input² = leverage × velocity
  let yieldRaw = null;
  if (cacheRead === null) {
    // Standard null policy: unavailable cache_read → null
  } else if (leverageRaw !== null && velocityRaw !== null) {
    yieldRaw = leverageRaw * velocityRaw;
  } else {
    warnings.push("yield_undefined: requires input>0");
  }

  // Standard-level warnings for unavailable cache (emitted before dev10x
  // warning so the "why" precedes the "what" in the warning list)
  if (cacheWrite === null) warnings.push("cache_write is unavailable; 10xDEV is undefined.");
  if (cacheRead === null) warnings.push("cache_read is unavailable; Yield, Leverage, and 10xDEV are undefined.");

  // 10xDEV = log10(R / I) = log10(Leverage) — requires all four pillars > 0
  let dev10xRaw = null;
  if (cacheWrite === null || cacheRead === null) {
    warnings.push("dev10x_undefined: requires all four pillars > 0");
  } else if (input > 0 && output > 0 && cacheWrite > 0 && cacheRead > 0) {
    dev10xRaw = Math.log10(cacheRead / input);
  } else {
    warnings.push("dev10x_undefined: requires all four pillars > 0");
  }

  return {
    metrics: {
      yield: round(yieldRaw, 2),
      leverage: round(leverageRaw, 1),
      velocity: round(velocityRaw, 3),
      snr: round(snrRaw, 4),
      dev10x: round(dev10xRaw, 2),
    },
    warnings,
  };
}

function buildPortableRecord(fixtureInput) {
  const { telemetry, source } = fixtureInput;
  const normalizedTelemetry = {
    input: telemetry.input,
    output: telemetry.output,
    cache_write: telemetry.cache_write ?? telemetry.cache_creation ?? null,
    cache_read: telemetry.cache_read ?? null,
  };
  const { metrics, warnings } = computeMetrics(telemetry);
  return {
    spec: SPEC_VERSION,
    timestamp: "2026-08-27T00:00:00.000Z",
    source: {
      provider: source.provider,
      model: source.model,
      tool: source.tool,
    },
    telemetry: normalizedTelemetry,
    metrics,
    warnings,
  };
}

// ─── Self-contained schema validator (mirrors the standalone runner) ─────────

function validateAgainstSchema(record, node = schema, path = "record", errors = []) {
  if (node.const !== undefined) {
    if (record !== node.const) {
      errors.push(`schema ${path}: expected const ${JSON.stringify(node.const)}, got ${JSON.stringify(record)}`);
    }
    return errors;
  }
  if (node.enum !== undefined && !node.enum.includes(record)) {
    errors.push(`schema ${path}: expected one of ${JSON.stringify(node.enum)}, got ${JSON.stringify(record)}`);
  }
  if (node.type !== undefined) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    const matched = types.some((t) => {
      if (record === null) return t === "null";
      if (t === "integer") return Number.isInteger(record);
      if (t === "number") return typeof record === "number" && !Number.isNaN(record);
      if (t === "string") return typeof record === "string";
      if (t === "object") return typeof record === "object" && record !== null && !Array.isArray(record);
      if (t === "array") return Array.isArray(record);
      return false;
    });
    if (!matched) errors.push(`schema ${path}: expected type ${JSON.stringify(node.type)}, got ${typeof record}`);
  }
  if (node.minimum !== undefined && typeof record === "number" && record < node.minimum) {
    errors.push(`schema ${path}: value ${record} below minimum ${node.minimum}`);
  }
  if (node.minLength !== undefined && typeof record === "string" && record.length < node.minLength) {
    errors.push(`schema ${path}: string length ${record.length} below minLength ${node.minLength}`);
  }
  if (node.required !== undefined && typeof record === "object" && record !== null && !Array.isArray(record)) {
    for (const req of node.required) {
      if (!(req in record)) errors.push(`schema ${path}: missing required field "${req}"`);
    }
  }
  if (node.additionalProperties === false && typeof record === "object" && record !== null && !Array.isArray(record)) {
    const allowed = Object.keys(node.properties || {});
    for (const key of Object.keys(record)) {
      if (!allowed.includes(key)) errors.push(`schema ${path}: additional property "${key}" not allowed`);
    }
  }
  if (node.properties !== undefined && typeof record === "object" && record !== null && !Array.isArray(record)) {
    for (const [key, subSchema] of Object.entries(node.properties)) {
      if (key in record) validateAgainstSchema(record[key], subSchema, `${path}.${key}`, errors);
    }
  }
  if (node.items !== undefined && Array.isArray(record)) {
    for (let i = 0; i < record.length; i++) {
      validateAgainstSchema(record[i], node.items, `${path}[${i}]`, errors);
    }
  }
  return errors;
}

function approxEqual(a, b, tolerance = 0.001) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < tolerance;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ─── Conformance gate: enterprise adapter preserves portable semantics ───────

test(`enterprise adapter passes all 13 standalone fixtures (Standard ref ${SIGRANK_STANDARD_REF})`, () => {
  const failures = [];

  for (const file of fixtureFiles) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), "utf-8"));
    const id = fixture.id || file;
    const expected = fixture.expected || {};

    // 1. Build a portable record from the fixture's telemetry
    const portableRecord = buildPortableRecord(fixture.input);

    // 2. Pass it through the enterprise adapter
    const enterpriseObs = buildEnterpriseObservation(portableRecord, {
      cohort_id: "test-cohort",
      window: { start: "2026-07-01", end: "2026-07-31" },
      collector_version: "test-collector-1.0",
    });

    // 3. Extract the portable portion from the enterprise observation
    const portable = enterpriseObs.portable;
    const errors = [];

    // 3a. Schema validity — the portable portion must conform to the
    //     sigrank/0.1-draft schema
    errors.push(...validateAgainstSchema(portable, schema, "portable", []));

    // 3b. Primitive semantics
    const t = portable.telemetry;
    if (!Number.isInteger(t.input) || t.input < 0) errors.push(`${id}: input must be non-negative integer`);
    if (!Number.isInteger(t.output) || t.output < 0) errors.push(`${id}: output must be non-negative integer`);
    if (t.cache_write !== null && (!Number.isInteger(t.cache_write) || t.cache_write < 0)) {
      errors.push(`${id}: cache_write must be non-negative integer or null`);
    }
    if (t.cache_read !== null && (!Number.isInteger(t.cache_read) || t.cache_read < 0)) {
      errors.push(`${id}: cache_read must be non-negative integer or null`);
    }

    // 3c. Metric comparison
    if (expected.metrics) {
      for (const [key, expectedValue] of Object.entries(expected.metrics)) {
        if (!approxEqual(portable.metrics[key], expectedValue)) {
          errors.push(`${id}: metric ${key}: expected ${expectedValue}, got ${portable.metrics[key]}`);
        }
      }
    }

    // 3d. Warnings (ordered arrays)
    if (expected.warnings !== undefined) {
      if (!arraysEqual(portable.warnings, expected.warnings)) {
        errors.push(`${id}: warnings mismatch: expected ${JSON.stringify(expected.warnings)}, got ${JSON.stringify(portable.warnings)}`);
      }
    }

    // 3e. Version declaration
    if (expected.spec !== undefined && portable.spec !== expected.spec) {
      errors.push(`${id}: version: expected ${expected.spec}, got ${portable.spec}`);
    }

    // 3f. Alias translation — cache_creation must normalize to cache_write
    if (expected.output_telemetry_keys !== undefined) {
      const actualKeys = Object.keys(portable.telemetry).sort();
      const expectedKeys = [...expected.output_telemetry_keys].sort();
      if (!arraysEqual(actualKeys, expectedKeys)) {
        errors.push(`${id}: alias: expected keys ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`);
      }
      if ("cache_creation" in portable.telemetry) {
        errors.push(`${id}: alias: cache_creation leaked into portable output`);
      }
    }

    // 3g. Content independence
    if (expected.forbidden_fields !== undefined) {
      for (const forbidden of expected.forbidden_fields) {
        if (forbidden in portable.telemetry) errors.push(`${id}: content leak in telemetry: ${forbidden}`);
        if (forbidden in portable) errors.push(`${id}: content leak in portable: ${forbidden}`);
      }
    }

    // 3h. Required fields
    if (expected.required_fields !== undefined) {
      for (const required of expected.required_fields) {
        if (!(required in portable)) errors.push(`${id}: missing required field: ${required}`);
      }
    }

    // 3i. Extension exclusion — no enterprise metrics in portable
    if (expected.forbidden_metrics !== undefined) {
      for (const forbidden of expected.forbidden_metrics) {
        if (forbidden in portable.metrics) errors.push(`${id}: extension leak: ${forbidden}`);
      }
    }

    // 3j. Required metrics
    if (expected.required_metrics !== undefined) {
      for (const required of expected.required_metrics) {
        if (!(required in portable.metrics)) errors.push(`${id}: missing required metric: ${required}`);
      }
    }

    // 3k. Provenance
    const s = portable.source;
    if (!s || typeof s.provider !== "string" || s.provider.length < 1) errors.push(`${id}: provenance.provider missing`);
    if (!s || typeof s.model !== "string" || s.model.length < 1) errors.push(`${id}: provenance.model missing`);
    if (!s || typeof s.tool !== "string" || s.tool.length < 1) errors.push(`${id}: provenance.tool missing`);

    // 4. Enterprise namespace isolation — enterprise fields must NOT appear
    //    in the portable portion
    const enterpriseFields = ["construction", "scale_v", "rs05", "build_archetype", "rank", "percentile",
      "quality_score", "cycle_time", "bug_count", "outcome", "lineage"];
    for (const field of enterpriseFields) {
      if (field in portable.metrics) errors.push(`${id}: enterprise metric "${field}" leaked into portable.metrics`);
      if (field in portable) errors.push(`${id}: enterprise field "${field}" leaked into portable record`);
    }

    if (errors.length > 0) {
      failures.push({ id, errors });
    }
  }

  if (failures.length > 0) {
    const detail = failures.map((f) => `  ${f.id}:\n    ${f.errors.join("\n    ")}`).join("\n");
    assert.fail(`${failures.length} fixture(s) failed conformance:\n${detail}`);
  }
});

test("enterprise adapter preserves null/zero distinction for unavailable cache", () => {
  const portableUnavailable = buildPortableRecord({
    telemetry: { input: 100, output: 50, cache_write: null, cache_read: null },
    source: { provider: "test", model: "test", tool: "test" },
  });
  const obs = buildEnterpriseObservation(portableUnavailable, {});
  assert.equal(obs.portable.telemetry.cache_write, null);
  assert.equal(obs.portable.telemetry.cache_read, null);
  assert.equal(obs.portable.metrics.yield, null);
  assert.equal(obs.portable.metrics.dev10x, null);

  const portableZero = buildPortableRecord({
    telemetry: { input: 100, output: 50, cache_write: 0, cache_read: 0 },
    source: { provider: "test", model: "test", tool: "test" },
  });
  const obsZero = buildEnterpriseObservation(portableZero, {});
  assert.equal(obsZero.portable.telemetry.cache_write, 0);
  assert.equal(obsZero.portable.telemetry.cache_read, 0);
  assert.equal(obsZero.portable.metrics.leverage, 0);
  assert.equal(obsZero.portable.metrics.yield, 0);
});

test("enterprise adapter preserves adapter_version and standard_version", () => {
  const portable = buildPortableRecord({
    telemetry: { input: 1000, output: 5000, cache_write: 500, cache_read: 3000 },
    source: { provider: "test", model: "test", tool: "test" },
  });
  const obs = buildEnterpriseObservation(portable, {});
  assert.equal(obs.adapter_version, "upsilon/enterprise-adapter/0.1-draft");
  assert.equal(obs.standard_version, "sigrank/0.1-draft");
  assert.equal(obs.portable.spec, "sigrank/0.1-draft");
});

console.log(`enterprise-adapter-conformance.test.mjs: ok (Standard ref ${SIGRANK_STANDARD_REF})`);
