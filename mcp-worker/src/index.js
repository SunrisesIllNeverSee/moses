// MO§ES™ MCP Server — Streamable HTTP transport
// Public tool listing + read-only demo data responses
// Write tools return 401 (require authorization)

const TOOLS = [
  {
    name: "get_pilot_status",
    description: "Get pilot status overview — cohort size, observation count, date range, data quality, active interventions.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_operator_profile",
    description: "Get operator profile — metrics, percentiles, benchmark availability, divergence flags. Operator IDs are pseudonymous (e.g., op_001).",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string", description: "Pseudonymous operator ID (e.g., op_001)" } }
    }
  },
  {
    name: "get_cohort_distribution",
    description: "Get cohort metric distribution — percentile bands (median, p25, p10, p5, p1) for a given metric.",
    inputSchema: {
      type: "object",
      properties: { metric: { type: "string", default: "leverage", description: "Metric: leverage, yield, token_snr, log_leverage, construction" } }
    }
  },
  {
    name: "get_composite_score",
    description: "Get developmental composite score (0-100). Labeled DEVELOPMENTAL, not PERSONNEL. No punitive use.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string" } }
    }
  },
  {
    name: "get_composite_score_summary",
    description: "Get cohort composite score summary — aggregate distribution. No individual rankings exposed.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_diagnostics",
    description: "Get operator diagnostics — pattern detections and diagnoses. All diagnoses are HYPOTHESIS, never fact.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: { operator_id: { type: "string" } }
    }
  },
  {
    name: "get_data_quality",
    description: "Get data quality report — completeness, coverage, validity metrics.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "find_usage_operation_divergence",
    description: "Find operators with usage-operation divergence (high usage but low operation performance, or vice versa).",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_workflow_fit",
    description: "Get workflow fit analysis — operator/workflow fit scores.",
    inputSchema: {
      type: "object",
      properties: { operator_id: { type: "string" } }
    }
  },
  {
    name: "get_intervention_status",
    description: "Get intervention status — active and closed interventions.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "list_pilot_options",
    description: "List available pilot options — metrics, eval families, benchmark classes, intervention types.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "validate_pilot_configuration",
    description: "Validate a pilot configuration before deployment.",
    inputSchema: {
      type: "object",
      properties: { configuration: { type: "object" } }
    }
  },
  {
    name: "compare_operator_to_reference",
    description: "Compare an operator to a reference population.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string" },
        reference: { type: "string", description: "Reference population name" }
      }
    }
  },
  {
    name: "get_executive_dashboard",
    description: "Get executive dashboard — self-contained HTML with cohort overview, score distribution, patterns, interventions, workflow fit.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "verify_change",
    description: "Verify a measured change after intervention — pre/post comparison.",
    inputSchema: {
      type: "object",
      required: ["operator_id"],
      properties: {
        operator_id: { type: "string" },
        intervention_id: { type: "string" }
      }
    }
  },
  {
    name: "create_pilot_configuration",
    description: "Generate a pilot configuration from parameters.",
    inputSchema: {
      type: "object",
      properties: {
        cohort_size: { type: "integer" },
        duration_days: { type: "integer" },
        metrics: { type: "array", items: { type: "string" } }
      }
    }
  },
  // ─── Write tools (require authorization) ───
  {
    name: "assign_intervention",
    description: "Assign a targeted intervention to an operator. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["operator_id", "intervention_type"],
      properties: {
        operator_id: { type: "string" },
        intervention_type: { type: "string" },
        notes: { type: "string" }
      }
    }
  },
  {
    name: "close_intervention",
    description: "Close an intervention with outcome notes. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["intervention_id"],
      properties: {
        intervention_id: { type: "string" },
        outcome_notes: { type: "string" }
      }
    }
  },
  {
    name: "create_experiment",
    description: "Create an experiment configuration. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        configuration: { type: "object" }
      }
    }
  },
  {
    name: "record_workflow_observation",
    description: "Record a workflow fit observation. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["operator_id", "workflow_id"],
      properties: {
        operator_id: { type: "string" },
        workflow_id: { type: "string" },
        fit_score: { type: "number" },
        notes: { type: "string" }
      }
    }
  },
  {
    name: "attach_outcome_dataset",
    description: "Attach external outcome dataset for join analysis. Outcome joins are ASSOCIATION, never CAUSATION. REQUIRES AUTHORIZATION.",
    inputSchema: {
      type: "object",
      required: ["source"],
      properties: {
        source: { type: "string" },
        format: { type: "string" }
      }
    }
  }
];

const WRITE_TOOLS = new Set([
  "assign_intervention", "close_intervention", "create_experiment",
  "record_workflow_observation", "attach_outcome_dataset"
]);

// ─── Demo data for read-only responses ─────────────────────────────────
const DEMO_STATUS = {
  cohort_size: 50,
  observation_count: 1668,
  artifact_count: 200,
  lineage_count: 50,
  system_count: 5,
  workflow_count: 4,
  intervention_count: 12,
  date_range: { start: "2026-07-01", end: "2026-07-30" },
  data_quality: "GOOD — 94% completeness, 88% coverage"
};

const DEMO_METRICS = {
  leverage: { median: 2.34, p25: 1.67, p10: 3.21, p5: 4.55, p1: 6.12 },
  yield: { median: 0.28, p25: 0.22, p10: 0.35, p5: 0.41, p1: 0.48 },
  token_snr: { median: 0.71, p25: 0.62, p10: 0.81, p5: 0.88, p1: 0.93 },
  log_leverage: { median: 0.85, p25: 0.51, p10: 1.17, p5: 1.52, p1: 1.81 },
  construction: { median: 0.44, p25: 0.31, p10: 0.67, p5: 0.82, p1: 1.05 }
};

function handleToolCall(name, args) {
  // Write tools require auth
  if (WRITE_TOOLS.has(name)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "AUTHORIZATION_REQUIRED",
          message: "This write tool requires authorization. Contact burnmydays@proton.me for pilot access.",
          tool: name
        })
      }],
      isError: true
    };
  }

  // Read tools return demo data
  let result;
  switch (name) {
    case "get_pilot_status":
      result = DEMO_STATUS;
      break;
    case "get_operator_profile":
      result = {
        operator_id: args?.operator_id || "op_001",
        metrics: { leverage: 2.45, yield: 0.31, token_snr: 0.74, log_leverage: 0.90, construction: 0.47 },
        percentiles: { leverage: 65, yield: 72, token_snr: 68, log_leverage: 70, construction: 63 },
        benchmarks_available: ["peer", "cohort", "role", "self_vs_prior", "repeated_task"],
        divergence_flags: []
      };
      break;
    case "get_cohort_distribution":
      result = {
        metric: args?.metric || "leverage",
        bands: DEMO_METRICS[args?.metric || "leverage"] || DEMO_METRICS.leverage
      };
      break;
    case "get_composite_score":
      result = {
        operator_id: args?.operator_id || "op_001",
        score: 48.57,
        label: "DEVELOPMENTAL",
        components: { leverage: 30, yield: 30, token_snr: 20, construction: 20 },
        caveats: ["Score is DEVELOPMENTAL, not PERSONNEL", "No punitive use", "No individual ranking"]
      };
      break;
    case "get_composite_score_summary":
      result = {
        cohort_size: 50,
        distribution: { median: 50.2, p25: 42.1, p75: 58.7, p10: 35.3, p90: 65.4 },
        label: "DEVELOPMENTAL",
        individual_rankings: false
      };
      break;
    case "get_diagnostics":
      result = {
        operator_id: args?.operator_id || "op_001",
        patterns: [{ type: "LOW_USAGE_HIGH_OPERATION", confidence: 0.72 }],
        diagnoses: [{ pattern: "LOW_USAGE_HIGH_OPERATION", status: "HYPOTHESIS", evidence: "Operator shows high operation performance relative to usage volume" }],
        status: "HYPOTHESIS"
      };
      break;
    case "get_data_quality":
      result = { completeness: 0.94, coverage: 0.88, validity: 0.96, issues: [] };
      break;
    case "find_usage_operation_divergence":
      result = {
        divergent_operators: [
          { operator_id: "op_012", type: "LOW_USAGE_HIGH_OPERATION", severity: "MEDIUM" },
          { operator_id: "op_034", type: "HIGH_USAGE_LOW_OPERATION", severity: "HIGH" }
        ]
      };
      break;
    case "get_workflow_fit":
      result = {
        operator_id: args?.operator_id || "op_001",
        workflow_fit: [{ workflow_id: "wf_001", fit_score: 0.78, notes: "Good fit for code review workflow" }]
      };
      break;
    case "get_intervention_status":
      result = {
        active: [{ id: "intv_001", operator_id: "op_034", type: "TARGETED_TRAINING", status: "ACTIVE" }],
        closed: [{ id: "intv_002", operator_id: "op_012", type: "WORKFLOW_REDESIGN", status: "CLOSED", outcome: "IMPROVED" }]
      };
      break;
    case "list_pilot_options":
      result = {
        metrics: ["leverage", "yield", "token_snr", "log_leverage", "construction"],
        eval_families: 15,
        benchmark_classes: ["self_vs_prior", "repeated_task", "matched_task", "peer", "role", "cohort", "team", "organization", "system", "workflow", "model", "intervention", "external_field"],
        intervention_types: ["TARGETED_TRAINING", "WORKFLOW_REDESIGN", "MODEL_SWITCH", "PROMPT_LIBRARY", "PAIR_PROGRAMMING"]
      };
      break;
    case "validate_pilot_configuration":
      result = { valid: true, warnings: [], errors: [] };
      break;
    case "compare_operator_to_reference":
      result = {
        operator_id: args?.operator_id || "op_001",
        reference: args?.reference || "cohort",
        comparison: { leverage: { operator: 2.45, reference_median: 2.34, percentile: 65 } }
      };
      break;
    case "get_executive_dashboard":
      result = {
        dashboard_url: "https://mos2es.org/docs",
        message: "Executive dashboard is available via the CLI: enterprise export dashboard --output file.html"
      };
      break;
    case "verify_change":
      result = {
        operator_id: args?.operator_id || "op_001",
        pre_intervention: { leverage: 1.82 },
        post_intervention: { leverage: 2.45 },
        change: { leverage: 0.63, direction: "IMPROVED" },
        label: "ASSOCIATION"
      };
      break;
    case "create_pilot_configuration":
      result = {
        configuration: {
          cohort_size: args?.cohort_size || 50,
          duration_days: args?.duration_days || 30,
          metrics: args?.metrics || ["leverage", "yield", "token_snr", "log_leverage", "construction"]
        },
        valid: true
      };
      break;
    default:
      result = { error: "UNKNOWN_TOOL", tool: name };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: false
  };
}

// ─── MCP Streamable HTTP server ─────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Session-Id",
      "Access-Control-Expose-Headers": "MCP-Session-Id",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ─── Health check / info ──────────────────────────────────────────
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        server: "MO§ES™ MCP Server",
        version: "0.1.0",
        transport: "streamable-http",
        tools: TOOLS.length,
        read_tools: TOOLS.length - WRITE_TOOLS.size,
        write_tools: WRITE_TOOLS.size,
        url: "https://mcp.mos2es.org",
        docs: "https://mos2es.org/docs",
        openapi: "https://mos2es.org/openapi.json"
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ─── MCP protocol endpoint ────────────────────────────────────────
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

      // ─── Handle MCP methods ──────────────────────────────────────
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
              name: "moses-mcp",
              version: "0.1.0"
            }
          };
          break;

        case "tools/list":
          result = { tools: TOOLS };
          break;

        case "tools/call":
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

        case "ping":
          result = {};
          break;

        case "resources/list":
          result = { resources: [] };
          break;

        case "prompts/list":
          result = { prompts: [] };
          break;

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

    // ─── 404 ──────────────────────────────────────────────────────────
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
