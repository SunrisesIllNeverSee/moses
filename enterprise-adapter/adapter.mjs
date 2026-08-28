/**
 * enterprise-adapter/adapter.mjs
 *
 * Upsilon Enterprise Lineage Adapter — versioned adapter that accepts
 * sigrank/0.1-draft portable observations and produces enterprise
 * observations in a separate namespace.
 *
 * The portable record is preserved verbatim. Enterprise derivations are
 * added in a separate `enterprise` object that never leaks into the
 * portable metric namespace.
 *
 * Adapter version: upsilon/enterprise-adapter/0.1-draft
 * Standard version: sigrank/0.1-draft
 * Governance: MO§ES™
 * Product: Upsilon
 */

export const ADAPTER_VERSION = "upsilon/enterprise-adapter/0.1-draft";
export const STANDARD_VERSION = "sigrank/0.1-draft";

/**
 * Build an enterprise observation from a portable sigrank/0.1-draft record.
 *
 * @param {object} portableRecord - A sigrank/0.1-draft record (spec, timestamp,
 *   source, telemetry, metrics, warnings).
 * @param {object} enterpriseContext - Enterprise context (cohort_id, window,
 *   lineage, derivations, privacy_mode, collector_version).
 * @returns {object} Enterprise observation with portable + enterprise namespaces.
 * @throws {Error} If the portable record does not declare sigrank/0.1-draft.
 */
export function buildEnterpriseObservation(portableRecord, enterpriseContext = {}) {
  // Validate the portable record declares the correct Standard version
  if (!portableRecord || portableRecord.spec !== STANDARD_VERSION) {
    throw new Error(
      `Enterprise adapter requires a ${STANDARD_VERSION} portable record; got spec="${portableRecord?.spec ?? "undefined"}"`,
    );
  }

  // Validate required portable fields are present
  const requiredPortable = ["spec", "timestamp", "source", "telemetry", "metrics"];
  for (const field of requiredPortable) {
    if (!(field in portableRecord)) {
      throw new Error(`Portable record missing required field: ${field}`);
    }
  }

  // Validate telemetry primitives are non-negative integers or null
  const t = portableRecord.telemetry;
  if (!Number.isInteger(t.input) || t.input < 0) {
    throw new Error("Portable telemetry.input must be a non-negative integer");
  }
  if (!Number.isInteger(t.output) || t.output < 0) {
    throw new Error("Portable telemetry.output must be a non-negative integer");
  }
  if (t.cache_write !== null && (!Number.isInteger(t.cache_write) || t.cache_write < 0)) {
    throw new Error("Portable telemetry.cache_write must be a non-negative integer or null");
  }
  if (t.cache_read !== null && (!Number.isInteger(t.cache_read) || t.cache_read < 0)) {
    throw new Error("Portable telemetry.cache_read must be a non-negative integer or null");
  }

  // Validate the five portable metrics are present (values may be null)
  const requiredMetrics = ["yield", "leverage", "velocity", "snr", "dev10x"];
  for (const m of requiredMetrics) {
    if (!(m in portableRecord.metrics)) {
      throw new Error(`Portable metrics missing required metric: ${m}`);
    }
  }

  // Validate no enterprise fields leaked into the portable record
  const forbiddenPortableMetrics = [
    "construction", "scale_v", "rs05", "build_archetype",
    "rank", "percentile", "quality_score", "cycle_time", "bug_count",
    "outcome", "lineage",
  ];
  for (const forbidden of forbiddenPortableMetrics) {
    if (forbidden in portableRecord.metrics) {
      throw new Error(`Enterprise metric "${forbidden}" leaked into portable metrics`);
    }
  }
  const forbiddenPortableFields = [
    "outcome", "lineage", "quality_score", "cycle_time", "bug_count", "enterprise_data",
  ];
  for (const forbidden of forbiddenPortableFields) {
    if (forbidden in portableRecord) {
      throw new Error(`Enterprise field "${forbidden}" leaked into portable record`);
    }
  }

  // Build the enterprise observation — portable is preserved verbatim,
  // enterprise is a separate namespace
  return {
    adapter_version: ADAPTER_VERSION,
    standard_version: STANDARD_VERSION,
    portable: {
      spec: portableRecord.spec,
      timestamp: portableRecord.timestamp,
      source: { ...portableRecord.source },
      telemetry: { ...portableRecord.telemetry },
      metrics: { ...portableRecord.metrics },
      warnings: [...(portableRecord.warnings || [])],
    },
    enterprise: {
      collector_version: enterpriseContext.collector_version || ADAPTER_VERSION,
      cohort_id: enterpriseContext.cohort_id ?? null,
      window: enterpriseContext.window
        ? { start: enterpriseContext.window.start ?? null, end: enterpriseContext.window.end ?? null }
        : { start: null, end: null },
      lineage: enterpriseContext.lineage
        ? {
            chain_id: enterpriseContext.lineage.chain_id ?? null,
            parent_observation_id: enterpriseContext.lineage.parent_observation_id ?? null,
            micro_eval: enterpriseContext.lineage.micro_eval ?? null,
          }
        : { chain_id: null, parent_observation_id: null, micro_eval: null },
      derivations: enterpriseContext.derivations
        ? { ...enterpriseContext.derivations }
        : {},
      privacy_mode: enterpriseContext.privacy_mode || "anonymous",
      governance_label: enterpriseContext.governance_label || "DEVELOPMENTAL",
    },
  };
}

/**
 * Validate a pilot manifest against the canonical pilot schema.
 * Returns a list of errors (empty = valid).
 */
export function validatePilotManifest(manifest, schema) {
  const errors = [];

  function checkNode(value, node, path) {
    if (node.const !== undefined && value !== node.const) {
      errors.push(`${path}: expected const ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`);
      return;
    }
    if (node.enum !== undefined && !node.enum.includes(value)) {
      errors.push(`${path}: expected one of ${JSON.stringify(node.enum)}, got ${JSON.stringify(value)}`);
    }
    if (node.type !== undefined) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      const matched = types.some((ty) => {
        if (value === null) return ty === "null";
        if (ty === "integer") return Number.isInteger(value);
        if (ty === "number") return typeof value === "number" && !Number.isNaN(value);
        if (ty === "string") return typeof value === "string";
        if (ty === "boolean") return typeof value === "boolean";
        if (ty === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
        if (ty === "array") return Array.isArray(value);
        return false;
      });
      if (!matched) errors.push(`${path}: expected type ${JSON.stringify(node.type)}, got ${typeof value}`);
    }
    if (node.minimum !== undefined && typeof value === "number" && value < node.minimum) {
      errors.push(`${path}: value ${value} below minimum ${node.minimum}`);
    }
    if (node.minLength !== undefined && typeof value === "string" && value.length < node.minLength) {
      errors.push(`${path}: string length ${value.length} below minLength ${node.minLength}`);
    }
    if (node.required !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const req of node.required) {
        if (!(req in value)) errors.push(`${path}: missing required field "${req}"`);
      }
    }
    if (node.additionalProperties === false && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const allowed = Object.keys(node.properties || {});
      for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) errors.push(`${path}: additional property "${key}" not allowed`);
      }
    }
    if (node.properties !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [key, subSchema] of Object.entries(node.properties)) {
        if (key in value) checkNode(value[key], subSchema, `${path}.${key}`);
      }
    }
  }

  checkNode(manifest, schema, "manifest");
  return errors;
}
