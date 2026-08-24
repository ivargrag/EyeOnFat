/** snake_case DB rows → camelCase API objects. */

export function mapProject(r: Record<string, any>) {
  return {
    id: r.id, tenantId: r.tenant_id, name: r.name, description: r.description,
    bu: r.bu, country: r.country, fn: r.fn, brand: r.brand, pnlElement: r.pnl_element,
    lever: r.lever, leadId: r.lead_id, leadName: r.lead_name, team: r.team ?? [],
    financeLeadId: r.finance_lead_id, financeLeadName: r.finance_lead_name,
    stage: r.stage, annualSavingsUsdK: Number(r.annual_savings_usd_k),
    probabilityPct: Number(r.probability_pct),
    savingsStart: toDate(r.savings_start), savingsEnd: toDate(r.savings_end),
    timeProbabilityAdjustedUsdK: Number(r.tp_adjusted_usd_k),
    carryForwardUsdK: Number(r.carry_forward_usd_k),
    costToAchieve: r.cost_to_achieve, milestones: r.milestones ?? [], meetings: r.meetings ?? [],
    classification: r.classification, ffgDecision: r.ffg_decision,
    needsNewSupplier: r.needs_new_supplier, procuraEventId: r.procura_event_id,
    duplicatedFrom: r.duplicated_from, shouldCostModelId: r.should_cost_model_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function mapGate(r: Record<string, any>) {
  return {
    id: r.id, tenantId: r.tenant_id, gateId: r.gate_id, objectType: r.object_type,
    objectRef: r.object_ref, requiredRoles: r.required_roles,
    requiredDistinctSignatures: r.required_distinct, signatures: r.signatures ?? [],
    status: r.status, createdAt: r.created_at,
  };
}

export function mapShouldCost(r: Record<string, any>) {
  return {
    id: r.id, tenantId: r.tenant_id, item: r.item, unit: r.unit, zbcChallenge: r.zbc,
    structure: r.structure ?? [], currentPriceUsd: Number(r.current_price_usd),
    fairMarginFloorPct: Number(r.fair_margin_floor_pct), sentinelChecks: r.sentinel_checks ?? [],
    status: r.status, frozenVersion: r.frozen_version, projectId: r.project_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function mapProcura(r: Record<string, any>) {
  return {
    id: r.id, tenantId: r.tenant_id, projectRef: r.project_ref,
    shouldCostTargetUsd: r.should_cost_target_usd == null ? null : Number(r.should_cost_target_usd),
    shouldCostModelRef: r.should_cost_model_ref,
    baselineUsd: r.baseline_usd == null ? null : Number(r.baseline_usd),
    stage: r.stage, crewOutputs: r.crew_outputs, evaluationMatrix: r.evaluation_matrix,
    bids: r.bids ?? [], award: r.award, log: r.log ?? [], createdAt: r.created_at,
  };
}

export function mapAgentRun(r: Record<string, any>) {
  return {
    id: r.id, tenantId: r.tenant_id, agent: r.agent, trigger: r.trigger,
    triggeredByUserId: r.triggered_by, objectType: r.object_type, objectRef: r.object_ref,
    inputsRef: r.inputs, outputsRef: r.outputs, modelUsed: r.model_used,
    tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: Number(r.cost_usd),
    provenance: r.provenance ?? [], status: r.status, gateHolds: r.gate_holds ?? [],
    steps: r.steps ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function mapNode(r: Record<string, any>) {
  return {
    id: r.id, parentId: r.parent_id, level: r.level, name: r.name,
    amountUsdK: Number(r.amount_usd_k), volumeShare: Number(r.volume_share),
    priceShare: Number(r.price_share), lensFlags: r.lens_flags ?? [],
    insight: r.insight, opportunityRank: r.opportunity_rank == null ? null : Number(r.opportunity_rank),
    recordCount: r.record_count,
  };
}

/** Coerce a DB date (Date | string) to YYYY-MM-DD. */
export function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function toDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
