/**
 * mcp-worker/src/catalog.mjs
 *
 * Static tool, resource, prompt, and write-tool catalogs for the
 * Upsilon MCP Worker. Extracted from index.js so that contract tests
 * can import the catalogs directly without loading the full Worker
 * module (which imports JSON data files that require import attributes
 * in Node.js).
 *
 * Product: Upsilon
 * Governance: MO§ES™
 * Proof surface: SigRank
 */

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

export { TOOLS, RESOURCES, PROMPTS, WRITE_TOOLS };
