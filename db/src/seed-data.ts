/**
 * Meridian Group demo tenant — seed data matching the reference prototype
 * (Eye_on_Fat_SaaS_Portal_v3.html). Amounts in 000s USD unless noted.
 */

export const TENANT = {
  slug: 'meridian',
  name: 'Meridian Group',
  settings: {
    fyStartMonth: 4,
    baseCurrency: 'USD',
    enabledCurrencies: ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'],
    fxSource: 'seed',
    fairMarginFloorPct: 8,
    g0CompletenessTargetPct: 95,
    // Demo tenant: MFA optional. Production recommendation: ['finance', 'admin'].
    mfaRequiredForRoles: [],
  },
};

/** Demo password for every seeded user (see README): */
export const DEMO_PASSWORD = 'EyeOnFat!2026';

export const USERS = [
  { email: 'admin@meridiangroup.com', name: 'R. Haddad', roles: ['owner', 'admin'], awardAuthority: false },
  { email: 'k.menon@meridiangroup.com', name: 'K. Menon', roles: ['pm', 'analyst'], awardAuthority: false },
  { email: 's.iyer@meridiangroup.com', name: 'S. Iyer', roles: ['finance'], awardAuthority: false },
  { email: 'a.dsouza@meridiangroup.com', name: "A. D'Souza", roles: ['procurement', 'pm'], awardAuthority: true },
  { email: 'retail.ops@meridiangroup.com', name: 'Head of Retail Ops', roles: ['manager'], awardAuthority: false },
  { email: 'sc.director@meridiangroup.com', name: 'Supply Chain Director', roles: ['manager'], awardAuthority: true },
  { email: 'p.rao@meridiangroup.com', name: 'P. Rao', roles: ['pm'], awardAuthority: false },
] as const;

export const FX = [
  { currency: 'EUR', rate: 0.92 },
  { currency: 'GBP', rate: 0.79 },
  { currency: 'AED', rate: 3.67 },
  { currency: 'SAR', rate: 3.75 },
  { currency: 'INR', rate: 83.2 },
  { currency: 'USD', rate: 1 },
];

export const MODEL_REGISTRY = [
  { modelId: 'demo-engine', provider: 'demo', capabilities: ['complete', 'toolCall'], contextWindow: 1000000, costIn: 0, costOut: 0, status: 'active' },
  { modelId: 'claude-sonnet-4-5', provider: 'anthropic', capabilities: ['complete', 'stream', 'toolCall'], contextWindow: 200000, costIn: 3, costOut: 15, status: 'active' },
  { modelId: 'claude-haiku-4-5', provider: 'anthropic', capabilities: ['complete', 'stream', 'toolCall'], contextWindow: 200000, costIn: 1, costOut: 5, status: 'canary' },
  { modelId: 'gpt-4o', provider: 'openai', capabilities: ['complete', 'stream', 'toolCall'], contextWindow: 128000, costIn: 2.5, costOut: 10, status: 'active' },
];

export const CONNECTORS = [
  { key: 'sap_b1', name: 'SAP Business One', status: 'ok', statusLine: 'Synced 22 min ago', detail: 'GL + AP lines · 148k rows/mo · mapped to 8-level taxonomy' },
  { key: 'tally', name: 'Tally Prime', status: 'ok', statusLine: 'Synced 1 hr ago', detail: 'India entities · voucher-level · auto GST split' },
  { key: 'zoho', name: 'Zoho Books', status: 'ok', statusLine: 'Synced 3 hr ago', detail: 'E-commerce BU · bills & expenses' },
  { key: 'qbo', name: 'QuickBooks Online', status: 'ok', statusLine: 'Synced daily', detail: 'UK entity · chart-of-accounts mapped 96%' },
  { key: 'xero', name: 'Xero', status: 'amber', statusLine: 'Not connected', detail: 'Connect to pull AU pilot entity' },
  { key: 'odoo', name: 'Odoo', status: 'ok', statusLine: 'Synced 2 hr ago', detail: 'Manufacturing BOM & PO lines' },
  { key: 'netsuite', name: 'NetSuite', status: 'ok', statusLine: 'Synced 40 min ago', detail: 'Corporate consolidations' },
  { key: 'd365bc', name: 'Dynamics 365 BC', status: 'red', statusLine: 'Sync error', detail: 'Token expired — reauthorise to resume' },
  { key: 'coupa', name: 'Coupa / Ariba', status: 'ok', statusLine: 'Synced daily', detail: 'PO + catalogue prices for price-variance checks' },
  { key: 'banking', name: 'Banking feeds', status: 'ok', statusLine: 'Synced 15 min ago', detail: 'Cash-out reconciliation vs AP' },
  { key: 'email_ocr', name: 'Email drop + OCR', status: 'ok', statusLine: 'Live', detail: 'invoices@meridian… · scans parsed by SCALE' },
];

export const INTAKE = [
  { name: 'SAP B1 · July GL extract', rows: 148204, status: 'classified', mappedPct: 98 },
  { name: 'Tally · IN vouchers Q1', rows: 61882, status: 'classified', mappedPct: 95 },
  { name: 'scan_freight_inv_0722.pdf', rows: 1, status: 'classified', mappedPct: 100 },
];

export interface SeedSupplier {
  name: string; amtK: number; insight: string; flag: boolean;
}
export interface SeedCategory {
  name: string; amtK: number; volShare: number; flag: boolean; bu: string; country: string;
  suppliers: SeedSupplier[];
}

/** Spend tree per prototype TREE (amounts 000s/yr). volume_share + price_share = 100. */
export const SPEND_TREE: SeedCategory[] = [
  {
    name: 'Raw materials', amtK: 18400, volShare: 62, flag: true, bu: 'Manufacturing', country: 'UAE',
    suppliers: [
      { name: 'Gulf Polymers', amtK: 6200, insight: '+3.1% price YoY vs resin index −1.8%', flag: true },
      { name: 'Emirates Steel Trading', amtK: 4100, insight: 'volume −4%, price flat', flag: false },
      { name: 'Al Rams Chemicals', amtK: 3600, insight: 'price +6.4% — no index justification', flag: true },
      { name: 'Others (14)', amtK: 4500, insight: 'fragmented tail', flag: false },
    ],
  },
  {
    name: 'Packaging', amtK: 6100, volShare: 55, flag: true, bu: 'Retail', country: 'UAE',
    suppliers: [
      { name: 'FlexiPack FZE', amtK: 2900, insight: '27μ vs look-alike 25μ — over-spec', flag: true },
      { name: 'CorruBox India', amtK: 1800, insight: '14% gap to clean-sheet', flag: true },
      { name: 'Others (6)', amtK: 1400, insight: 'tail', flag: false },
    ],
  },
  {
    name: 'Logistics & freight', amtK: 7900, volShare: 48, flag: true, bu: 'Corporate', country: 'UAE',
    suppliers: [
      { name: 'TransGulf Lines', amtK: 3900, insight: 'single-lane dependence UAE–KSA', flag: true },
      { name: 'SwiftHaul USA', amtK: 2300, insight: 'rate −18% quote models 2.1% carrier margin — below floor', flag: true },
      { name: 'Others (9)', amtK: 1700, insight: 'spot buys 22%', flag: false },
    ],
  },
  {
    name: 'Rent & utilities', amtK: 9800, volShare: 71, flag: false, bu: 'Hospitality', country: 'UAE',
    suppliers: [
      { name: 'DEWA / SEWA', amtK: 3100, insight: 'tariff band review due', flag: true },
      { name: 'Landlords (12)', amtK: 6700, insight: 'renewals FY27', flag: false },
    ],
  },
  {
    name: 'Marketing', amtK: 4700, volShare: 40, flag: false, bu: 'Retail', country: 'UAE',
    suppliers: [
      { name: 'MediaCo MENA', amtK: 2100, insight: 'agency fee vs benchmark +2.1pp', flag: true },
      { name: 'Others (11)', amtK: 2600, insight: '', flag: false },
    ],
  },
  {
    name: 'IT & telecom', amtK: 3900, volShare: 52, flag: true, bu: 'Corporate', country: 'UAE',
    suppliers: [
      { name: 'SaaS portfolio (14)', amtK: 2200, insight: '31% seats inactive 90+ days', flag: true },
      { name: 'Etisalat / du', amtK: 1700, insight: 'contract renewal Q4', flag: false },
    ],
  },
  {
    name: 'Travel & admin', amtK: 2300, volShare: 58, flag: false, bu: 'Corporate', country: 'UAE',
    suppliers: [
      { name: 'TMC + airlines', amtK: 1600, insight: 'advance-purchase compliance 61%', flag: true },
      { name: 'Office supplies', amtK: 700, insight: 'catalogue leakage 8%', flag: true },
    ],
  },
  {
    name: 'Manpower services', amtK: 5600, volShare: 66, flag: false, bu: 'Retail', country: 'UAE',
    suppliers: [
      { name: 'StaffPro Gulf', amtK: 3400, insight: 'merchandiser coverage — see FFG case', flag: false },
      { name: 'Others (5)', amtK: 2200, insight: '', flag: false },
    ],
  },
];

/** Clean-sheet — HDPE shopping bag, 27μ reinforced top-fold (per 1,000 bags, USD). */
export const SHOULD_COST_BAG = {
  item: 'HDPE shopping bag, 27μ reinforced top-fold',
  unit: 'per 1,000 bags',
  currentPriceUsd: 104.5,
  fairMarginFloorPct: 8,
  zbc: {
    question: 'Should this spend exist at all?',
    outcome: 'exists_justified',
    rationale: 'Regulated retail carry requirement; demand policy reviewed — volumes justified by transaction counts.',
  },
  structure: [
    { name: 'Resin (HDPE, index-linked)', agentValue: 41.2, prov: 'ICIS SE-Asia HDPE index', asOf: '2026-08-04' },
    { name: 'Extrusion & conversion', agentValue: 14.6, prov: 'Three regional converter quotes', asOf: '2026-07-28' },
    { name: 'Printing (2-colour flexo)', agentValue: 6.1, prov: 'Converter rate cards', asOf: '2026-07-28' },
    { name: 'Cutting, sealing & top-fold', agentValue: 5.4, prov: 'Converter rate cards', asOf: '2026-07-28' },
    { name: 'Packing & palletisation', agentValue: 3.2, prov: 'Regional 3PL benchmark', asOf: '2026-07-15' },
    { name: 'Freight to DC', agentValue: 4.7, prov: 'Lane benchmark UAE domestic', asOf: '2026-08-01' },
    { name: 'Overheads (absorbed)', agentValue: 6.9, prov: 'Industry look-alike P&L structure', asOf: '2026-06-30' },
    { name: 'Fair supplier margin (floor 8%)', agentValue: 6.6, prov: 'Tenant fair-margin floor policy', asOf: '2026-04-01' },
  ],
  sentinelChecks: [
    { check: 'Resin cost / kg', model: '$1.06', benchmark: 'Index band $1.02–$1.09', status: 'ok' },
    { check: 'Conversion cost', model: '$14.60', benchmark: 'Peer band $13.80–$15.10', status: 'ok' },
    { check: 'Film gauge', model: '27μ', benchmark: 'Look-alike runs 25μ', status: 'amber' },
    { check: 'Freight / 1,000', model: '$4.70', benchmark: 'Lane benchmark $4.10', status: 'amber' },
    { check: 'Supplier margin', model: '8.0%', benchmark: 'Floor 8.0%', status: 'ok' },
  ],
};

/** Frozen (G2-signed) freight lane model backing the live Procura event. */
export const SHOULD_COST_FREIGHT = {
  item: 'Line-haul freight UAE–KSA, per lane',
  unit: 'per lane',
  currentPriceUsd: 189,
  fairMarginFloorPct: 8,
  zbc: {
    question: 'Should this spend exist at all?',
    outcome: 'exists_justified',
    rationale: 'Core replenishment lane; demand validated against store network plan.',
  },
  structure: [
    { name: 'Fuel & tolls', agentValue: 68, prov: 'Platts diesel MENA', asOf: '2026-06-20' },
    { name: 'Driver & crew', agentValue: 41, prov: 'Regional wage benchmark', asOf: '2026-06-15' },
    { name: 'Equipment & maintenance', agentValue: 27, prov: 'Fleet cost model', asOf: '2026-06-15' },
    { name: 'Insurance & compliance', agentValue: 9, prov: 'Broker quotes', asOf: '2026-06-10' },
    { name: 'Overheads', agentValue: 12, prov: 'Carrier look-alike P&L', asOf: '2026-05-31' },
    { name: 'Fair carrier margin (floor 8%)', agentValue: 14, prov: 'Tenant fair-margin floor policy', asOf: '2026-04-01' },
  ],
  sentinelChecks: [
    { check: 'Rate / lane', model: '$171', benchmark: 'Corridor band $158–$176', status: 'ok' },
    { check: 'Carrier margin (SwiftHaul −18% quote)', model: '2.1%', benchmark: 'Floor 8.0%', status: 'red' },
  ],
};

export interface SeedProject {
  key: string;
  name: string; bu: string; country: string; pnl: string;
  lever: 'Price' | 'Specifications' | 'Demand' | 'Eliminate' | 'Automate' | 'Consolidate' | 'RightSource';
  leadEmail: string; stage: 'Pipeline' | 'Forecast' | 'Committed';
  annualK: number; probabilityPct: number; savingsStart: string;
  team: string[]; needsNewSupplier: boolean; description: string;
  milestones: Array<[string, string, number]>;
  meetings: Array<[string, string]>;
  classification?: 'FAT' | 'MUSCLE' | 'BONE';
}

export const PROJECTS: SeedProject[] = [
  {
    key: 'bag', name: 'Shopping bag gauge & design optimisation', bu: 'Retail', country: 'UAE', pnl: 'Packaging',
    lever: 'Specifications', leadEmail: 'k.menon@meridiangroup.com', stage: 'Committed',
    annualK: 175, probabilityPct: 100, savingsStart: '2026-06-01',
    team: ['K. Menon', 'P. Rao', 'supplier QA'], needsNewSupplier: false,
    description: 'Film gauge 32μ→27μ with reinforced top-fold on non-SM bags; supplier collaboration on tooling. Cleared Fuel-for-Growth as FAT.',
    milestones: [['Lab & drop test at 27μ', 'K. Menon', 100], ['Pilot 3 stores', 'P. Rao', 100], ['Tooling change 2 lines', 'Supplier', 60], ['Full rollout', 'K. Menon', 0]],
    meetings: [['Kick-off', '2026-05-12'], ['Tooling review', '2026-06-30']],
    classification: 'FAT',
  },
  {
    key: 'freight', name: 'Freight two-carrier Right-Source event', bu: 'Corporate', country: 'USA', pnl: 'Logistics & freight',
    lever: 'RightSource', leadEmail: 'a.dsouza@meridiangroup.com', stage: 'Forecast',
    annualK: 140, probabilityPct: 75, savingsStart: '2026-08-15',
    team: ["A. D'Souza", 'logistics', 'finance'], needsNewSupplier: true,
    description: 'Rejected as BONE in single-carrier form (sub-margin-floor, single-lane dependence); redesigned as a two-carrier Right-Source event. Converted to a Procurement project — Procura Crew running, should-cost target $171/lane pre-loaded into the RFQ.',
    milestones: [['Procura event opened', "A. D'Souza", 100], ['Bids in & evaluated', 'Crew', 40], ['Award & contract', 'Director', 0]],
    meetings: [['Sourcing kick-off', '2026-07-02']],
    classification: 'BONE',
  },
  {
    key: 'roster', name: 'Merchandiser smart rostering (redesigned)', bu: 'Retail', country: 'UAE', pnl: 'Manpower services',
    lever: 'Demand', leadEmail: 'k.menon@meridiangroup.com', stage: 'Forecast',
    annualK: 113, probabilityPct: 70, savingsStart: '2026-10-01',
    team: ['K. Menon', 'Retail Ops'], needsNewSupplier: false,
    description: 'Original 25% hours cut held at Fuel-for-Growth as MUSCLE; redesigned as roster optimisation protecting peak-hour coverage.',
    milestones: [['Roster model built', 'Ops analyst', 80], ['2-store pilot', 'Store mgr', 20]],
    meetings: [['FFG redesign review', '2026-07-15']],
    classification: 'MUSCLE',
  },
  {
    key: 'corrugate', name: 'Corrugate & void-fill price renegotiation', bu: 'E-commerce', country: 'India', pnl: 'Packaging',
    lever: 'Price', leadEmail: 'p.rao@meridiangroup.com', stage: 'Pipeline',
    annualK: 96, probabilityPct: 60, savingsStart: '2026-11-01',
    team: ['P. Rao', 'category team'], needsNewSupplier: false,
    description: 'Should-cost shows 14% gap to clean-sheet on corrugate; negotiation fact-base ready. Price lever — qualifies to convert to a Procurement project if negotiation stalls.',
    milestones: [['Clean-sheet signed (G2)', 'Analyst', 100], ['Negotiation round 1', 'P. Rao', 0]],
    meetings: [],
  },
  {
    key: 'saas', name: 'SaaS licence rationalisation', bu: 'Corporate', country: 'UK', pnl: 'IT & telecom',
    lever: 'Eliminate', leadEmail: 'admin@meridiangroup.com', stage: 'Committed',
    annualK: 88, probabilityPct: 100, savingsStart: '2026-05-01',
    team: ['IT', 'Finance'], needsNewSupplier: false,
    description: 'ZBC challenge: 31% of seats inactive 90+ days across 14 tools. Eliminate & downgrade tiers.',
    milestones: [['Usage audit', 'IT', 100], ['Renegotiate top 5 renewals', 'IT', 70]],
    meetings: [['Renewal calendar review', '2026-05-20']],
  },
  {
    key: 'ap', name: 'AP invoice processing automation', bu: 'Corporate', country: 'India', pnl: 'Manpower services',
    lever: 'Automate', leadEmail: 'p.rao@meridiangroup.com', stage: 'Forecast',
    annualK: 74, probabilityPct: 80, savingsStart: '2026-12-01',
    team: ['Finance shared services'], needsNewSupplier: false,
    description: 'OCR + 3-way match automation for 9k invoices/month; redeploy 4 FTE to analysis roles.',
    milestones: [['Vendor PoC', 'R. Nair', 50]],
    meetings: [],
  },
  {
    key: 'fitout', name: 'Store fit-out supplier consolidation', bu: 'Retail', country: 'KSA', pnl: 'Raw materials',
    lever: 'Consolidate', leadEmail: 'a.dsouza@meridiangroup.com', stage: 'Pipeline',
    annualK: 132, probabilityPct: 55, savingsStart: '2027-01-01',
    team: ['Projects', 'procurement'], needsNewSupplier: true,
    description: '11 fragmented fit-out vendors → 3 framework partners. Needs new suppliers — qualifies to convert into a Procurement project and launch the Procura Crew.',
    milestones: [['Baseline demand map', 'S. AlHarbi', 30]],
    meetings: [],
  },
  {
    key: 'utilities', name: 'Utilities tariff & load optimisation', bu: 'Hospitality', country: 'UAE', pnl: 'Rent & utilities',
    lever: 'Price', leadEmail: 'k.menon@meridiangroup.com', stage: 'Pipeline',
    annualK: 64, probabilityPct: 65, savingsStart: '2027-02-01',
    team: ['Engineering'], needsNewSupplier: false,
    description: 'Tariff re-banding + load shifting across 6 properties; benchmark shows 9% gap to look-alike hotels.',
    milestones: [['Interval-meter data pulled', 'Engineering', 100]],
    meetings: [],
  },
];

/** Fuel-for-Growth cases (five tests each) per prototype. */
export const FFG_CASES = [
  {
    projectKey: 'bag',
    classification: 'FAT',
    tests: [
      { test: 'Customer experience', score: 92, tone: 'lean', evidence: 'Blind panel (n=120): no perceived difference in carry feel at 27μ with reinforced top-fold.' },
      { test: 'Quality & spec integrity', score: 84, tone: 'lean', evidence: 'Drop & load tests passed at 27μ; failure rate 0.4% vs 0.5% baseline.' },
      { test: 'Growth capacity', score: 95, tone: 'lean', evidence: 'No capacity or capability removed; tooling change only.' },
      { test: 'Supply continuity', score: 88, tone: 'lean', evidence: 'Supplier margin unchanged; two qualified converters.' },
      { test: 'Brand, safety & compliance', score: 90, tone: 'lean', evidence: 'Meets municipal bag regulations; recyclate share unchanged.' },
    ],
    verdict: 'FUEL FOR GROWTH: strategic look-alike runs 25μ with equal carry-capacity; lab test passed at 27μ with reinforced top-fold. Genuine over-spec — classified FAT. Recommend proceed with staged rollout & failure-rate monitoring.',
    redesignProposal: null,
    decision: 'proceed', signedBy: ['k.menon@meridiangroup.com', 'retail.ops@meridiangroup.com'],
  },
  {
    projectKey: 'roster',
    classification: 'MUSCLE',
    tests: [
      { test: 'Customer experience', score: 38, tone: 'fat', evidence: 'Shelf-availability correlates with coverage (r=0.71 from POS data); OOS drives switch behaviour.' },
      { test: 'Quality & spec integrity', score: 70, tone: 'amber', evidence: 'Planogram compliance dips 9pp in low-coverage pilots.' },
      { test: 'Growth capacity', score: 31, tone: 'fat', evidence: 'Q4 growth plan adds 2 stores that depend on this coverage.' },
      { test: 'Supply continuity', score: 90, tone: 'lean', evidence: 'No supplier impact.' },
      { test: 'Brand, safety & compliance', score: 85, tone: 'lean', evidence: 'No regulatory exposure.' },
    ],
    verdict: 'FUEL FOR GROWTH: this cuts muscle, not fat. Recommend HOLD — redesign as roster optimisation (smart scheduling) that protects peak-hour coverage: est. $113k with no availability impact.',
    redesignProposal: 'Roster optimisation (smart scheduling) protecting peak-hour coverage — est. $113k with no availability impact.',
    decision: null, signedBy: [], // open G3 gate — demo the dual-sign here
  },
  {
    projectKey: 'freight',
    classification: 'BONE',
    tests: [
      { test: 'Customer experience', score: 75, tone: 'amber', evidence: 'OTIF risk if the single carrier fails on the UAE–KSA lane.' },
      { test: 'Quality & spec integrity', score: 80, tone: 'lean', evidence: 'Service spec unchanged on paper.' },
      { test: 'Growth capacity', score: 66, tone: 'amber', evidence: 'Growth plan depends on the very lane being concentrated.' },
      { test: 'Supply continuity', score: 22, tone: 'fat', evidence: '−18% quote models the carrier at 2.1% net margin — below the fair-margin floor; single-carrier dependence.' },
      { test: 'Brand, safety & compliance', score: 82, tone: 'lean', evidence: 'No exposure.' },
    ],
    verdict: 'FUEL FOR GROWTH + SENTINEL: the −18% quote models the carrier below the fair-margin floor and creates single-carrier dependence on the lane your growth depends on. This is bone. Recommend REJECT as-is; re-route via the project’s Procura conversion as a two-carrier Right-Source event with should-cost target loaded.',
    redesignProposal: 'Two-carrier Right-Source event with should-cost target $171/lane loaded into the RFQ.',
    decision: 'reject', signedBy: ['a.dsouza@meridiangroup.com', 'sc.director@meridiangroup.com'],
  },
];

/** Live Procura event on the freight project — at distribute_bids per CLAUDE.md seed spec. */
export const PROCURA_FREIGHT = {
  projectKey: 'freight',
  shouldCostTargetUsd: 171,
  baselineUsd: 189,
  stage: 'distribute_bids',
  evaluationMatrix: {
    criteria: [
      { name: 'Total cost of ownership (vs should-cost $171/lane)', weightPct: 40 },
      { name: 'Lane coverage & capacity resilience', weightPct: 20 },
      { name: 'OTIF track record', weightPct: 15 },
      { name: 'Financial health & fair-margin sustainability', weightPct: 15 },
      { name: 'Sustainability & compliance', weightPct: 10 },
    ],
    lockedAt: '2026-07-21T09:00:00Z',
  },
  bids: [
    { id: 'b1', supplier: 'TransGulf Lines', receivedAt: '2026-07-28T10:12:00Z', sealed: true },
    { id: 'b2', supplier: 'Desert Bridge Logistics', receivedAt: '2026-07-30T14:40:00Z', sealed: true },
    { id: 'b3', supplier: 'Falcon Freight KSA', receivedAt: '2026-08-02T08:05:00Z', sealed: true },
    { id: 'b4', supplier: 'Red Sea Carriers', receivedAt: '2026-08-04T16:22:00Z', sealed: true },
    { id: 'b5', supplier: 'SwiftHaul USA', receivedAt: null, sealed: true },
    { id: 'b6', supplier: 'GulfLink Haulage', receivedAt: null, sealed: true },
  ],
  crewOutputs: {
    researcher: [
      {
        title: 'Market view & long-list',
        body: '11 carriers long-listed across the UAE–KSA corridor; market structure is a loose oligopoly on the primary lane with credible mid-tier challengers. Expected price band $158–176/lane vs should-cost $171. Switching cost driven by customs pre-clearance integration.',
        data: { longListCount: 11, priceBand: [158, 176], shouldCost: 171 },
        provenance: [{ source: 'Corridor rate survey', asOf: '2026-07-10' }, { source: 'Frozen should-cost model v1', asOf: '2026-07-02' }],
      },
    ],
    rfp_architect: [
      {
        title: 'RFP & locked evaluation matrix',
        body: 'RFP issued with should-cost target and spec tolerances embedded; two-carrier award structure specified (60/40 volume split). Evaluation matrix locked before distribution — immutable for the life of the event.',
        data: { awardStructure: '2 carriers, 60/40', lockedAt: '2026-07-21' },
        provenance: [{ source: 'P-RFP gate signature', asOf: '2026-07-21' }],
      },
    ],
    bid_handler: [
      {
        title: 'Distribution & bid status',
        body: 'RFP distributed to 6 approved carriers on 21-Jul-26. Equal-information Q&A: 9 questions received, answers published to all bidders. 4 of 6 bids received; bids sealed until the deadline. Clarification round closes Wednesday.',
        data: { distributed: 6, received: 4, sealedUntil: '2026-08-21' },
        provenance: [{ source: 'Bid log', asOf: '2026-08-15' }],
      },
    ],
    recommender: [],
  },
  log: [
    { ts: '2026-07-02T09:00:00Z', line: '◆ P-INTAKE approved · Supply Chain Director · scope, incumbent set and timeline confirmed' },
    { ts: '2026-07-10T11:00:00Z', line: 'RESEARCHER: 11 carriers long-listed; expected band $158–176/lane vs should-cost $171' },
    { ts: '2026-07-21T09:00:00Z', line: '◆ P-RFP signed off · evaluation matrix locked · distributed to 6 carriers' },
    { ts: '2026-08-15T15:30:00Z', line: 'BID HANDLER: 4 of 6 bids received · clarification round open · equal-information rule enforced' },
  ],
};

/** Recent AgentRun rows for the Agent Crew page ("last activity"). */
export const AGENT_ACTIVITY: Array<{ agent: string; note: string; objectType?: string }> = [
  { agent: 'COACH', note: 'Opened Procura event for freight two-carrier project' },
  { agent: 'SCALE', note: 'Parsed scan_freight_inv_0722.pdf' },
  { agent: 'CUBE', note: 'Rebuilt cube on July close' },
  { agent: 'LENS', note: 'Flagged Al Rams Chemicals +6.4% vs index' },
  { agent: 'SCOPE', note: 'Locked 8-element bag structure v3' },
  { agent: 'PULSE', note: 'Resin repriced off ICIS 04-Aug-26' },
  { agent: 'FORGE', note: 'Stack recomputed after analyst edit' },
  { agent: 'SENTINEL', note: 'Flagged −18% freight quote below floor' },
  { agent: 'FUEL FOR GROWTH', note: 'Redesigned merchandiser cut into smart rostering' },
  { agent: 'LEVER', note: 'Sized utilities tariff idea at $64k' },
  { agent: 'PILOT', note: 'Escalated tooling delay on bag project' },
  { agent: 'SCRIBE', note: 'July SteerCo pack generated' },
  { agent: 'The Researcher', note: '11 carriers long-listed for freight event' },
  { agent: 'The RFP Architect', note: 'Freight RFP distributed 21-Jul-26' },
  { agent: 'The Bid Handler', note: '4 of 6 freight bids received' },
  { agent: 'The Recommender', note: 'Awaiting full bid set' },
];
