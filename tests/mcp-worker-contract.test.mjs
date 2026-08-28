import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Import the catalog directly to inspect tool/resource/prompt arrays
// without parsing source text with eval(). The catalog is extracted from
// index.js into catalog.mjs so contract tests can import it without
// loading the full Worker module (which imports JSON data files).
import { TOOLS, RESOURCES, PROMPTS, WRITE_TOOLS } from "../mcp-worker/src/catalog.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// ─── Contract: production-equivalent 0.4.0 tool/resource/prompt counts ───────
// Production mcp.mos2es.org serves 27 tools, 6 resources, 5 prompts at version
// 0.4.0. The recovered source in mcp-worker/src/index.js MUST match these
// counts exactly so redeployment cannot lose tools, resources, or prompts.

const REQUIRED_TOOLS = [
  "assign_intervention",
  "attach_outcome_dataset",
  "close_intervention",
  "compare_operator_to_reference",
  "create_experiment",
  "create_pilot_configuration",
  "find_usage_operation_divergence",
  "get_cohort_distribution",
  "get_composite_score",
  "get_composite_score_summary",
  "get_data_quality",
  "get_diagnostics",
  "get_executive_dashboard",
  "get_intervention_status",
  "get_lineage_chain",
  "get_lineage_summary",
  "get_operator_profile",
  "get_operator_similarity",
  "get_operator_system_decomposition",
  "get_org_topology",
  "get_outcome_correlation",
  "get_pilot_status",
  "get_workflow_fit",
  "list_pilot_options",
  "record_workflow_observation",
  "validate_pilot_configuration",
  "verify_change",
];

const REQUIRED_RESOURCES = [
  "moses://metrics/canonical",
  "moses://metrics/registry",
  "moses://pilot/status",
  "moses://pilot/options",
  "moses://governance/conventions",
  "moses://cohort/operators",
];

const REQUIRED_PROMPTS = [
  "operator_evaluation_summary",
  "intervention_recommendation",
  "cohort_health_report",
  "workflow_fit_analysis",
  "pilot_scoping_guide",
];

test("mcp-worker declares exactly 27 tools (production parity)", () => {
  assert.equal(TOOLS.length, 27, `Expected 27 tools, got ${TOOLS.length}`);
});

test("mcp-worker preserves every production tool name", () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const required of REQUIRED_TOOLS) {
    assert.ok(names.has(required), `Missing required tool: ${required}`);
  }
  assert.equal(names.size, REQUIRED_TOOLS.length, "Tool name set has duplicates or extras");
});

test("mcp-worker declares exactly 6 resources (production parity)", () => {
  assert.equal(RESOURCES.length, 6, `Expected 6 resources, got ${RESOURCES.length}`);
});

test("mcp-worker preserves every production resource URI", () => {
  const uris = new Set(RESOURCES.map((r) => r.uri));
  for (const required of REQUIRED_RESOURCES) {
    assert.ok(uris.has(required), `Missing required resource: ${required}`);
  }
});

test("mcp-worker declares exactly 5 prompts (production parity)", () => {
  assert.equal(PROMPTS.length, 5, `Expected 5 prompts, got ${PROMPTS.length}`);
});

test("mcp-worker preserves every production prompt name", () => {
  const names = new Set(PROMPTS.map((p) => p.name));
  for (const required of REQUIRED_PROMPTS) {
    assert.ok(names.has(required), `Missing required prompt: ${required}`);
  }
});

// ─── Contract: Upsilon product identity with MO§ES™ governance + SigRank proof ─

test("mcp-worker health endpoint presents Upsilon as the product", async () => {
  const source = await read("mcp-worker/src/index.js");
  assert.match(source, /server: "Upsilon MCP Server"/);
  assert.match(source, /product: "Upsilon"/);
  assert.match(source, /governance: "MO§ES™"/);
  assert.match(source, /proof_surface: "SigRank"/);
});

test("mcp-worker initialize presents Upsilon serverInfo with product roles", async () => {
  const source = await read("mcp-worker/src/index.js");
  assert.match(source, /name: "upsilon-mcp"/);
  assert.match(source, /title: "Upsilon — Enterprise Measurement Engine"/);
});

test("mcp-worker carries the interpretation-limits boundary", async () => {
  const source = await read("mcp-worker/src/index.js");
  assert.match(source, /not proof of cognition, work quality, employee productivity, or business outcomes/);
});

test("mcp-worker version is 0.4.0 (production parity)", async () => {
  const source = await read("mcp-worker/src/index.js");
  assert.match(source, /version: "0.4.0"/);
});

// ─── Contract: write tools require authorization (no silent mutation) ────────

test("mcp-worker write tools are gated by authorization", async () => {
  const source = await read("mcp-worker/src/index.js");
  // WRITE_TOOLS set must exist and be referenced in the auth gate
  assert.match(source, /WRITE_TOOLS/);
  assert.match(source, /AUTHORIZATION_REQUIRED/);
  assert.match(source, /isError: true/);
});

test("WRITE_TOOLS set is non-empty and all members are in TOOLS", () => {
  assert.ok(WRITE_TOOLS.size > 0, "WRITE_TOOLS set is empty");
  const toolNames = new Set(TOOLS.map((t) => t.name));
  for (const writeTool of WRITE_TOOLS) {
    assert.ok(toolNames.has(writeTool), `WRITE_TOOLS references unknown tool: ${writeTool}`);
  }
});
