/**
 * ERP/accounting connector adapters (F2.1) + OCR pipeline scaffold.
 * Each adapter normalises source rows to RawSpendLine; the API's SCALE
 * pipeline (apps/api/src/services/ingest.ts) classifies and persists them.
 * v1 ships the adapter contract, the CSV/file adapter used by uploads and
 * an e-mail OCR scaffold; OAuth-based SaaS adapters wire per-tenant
 * credentials from the vault (see config keys on each class).
 */

export interface RawSpendLine {
  supplier: string;
  description: string;
  amount: number;
  currency: string;
  date: string;               // YYYY-MM-DD
  invoiceRef: string | null;
  volume: number | null;
  bu?: string;
  country?: string;
  documentId?: string;        // lineage pointer
}

export interface ConnectorAdapter {
  readonly key: string;       // sap_b1 | tally | zoho | qbo | xero | odoo | netsuite | d365bc | coupa | banking | email_ocr
  readonly name: string;
  /** Pull rows changed since the checkpoint; return a new checkpoint. */
  sync(config: Record<string, string>, checkpoint: string | null): Promise<{ lines: RawSpendLine[]; checkpoint: string }>;
}

/** Registry — adding an ERP = adding one adapter class + a registry entry. */
export const CONNECTOR_REGISTRY: Record<string, { name: string; configKeys: string[] }> = {
  sap_b1:   { name: 'SAP Business One',   configKeys: ['service_layer_url', 'company_db', 'username', 'password_vault_key'] },
  tally:    { name: 'Tally Prime',        configKeys: ['gateway_url'] },
  zoho:     { name: 'Zoho Books',         configKeys: ['org_id', 'oauth_vault_key'] },
  qbo:      { name: 'QuickBooks Online',  configKeys: ['realm_id', 'oauth_vault_key'] },
  xero:     { name: 'Xero',               configKeys: ['tenant_id', 'oauth_vault_key'] },
  odoo:     { name: 'Odoo',               configKeys: ['url', 'db', 'api_key_vault_key'] },
  netsuite: { name: 'NetSuite',           configKeys: ['account_id', 'token_vault_key'] },
  d365bc:   { name: 'Dynamics 365 BC',    configKeys: ['tenant_id', 'environment', 'oauth_vault_key'] },
  coupa:    { name: 'Coupa / Ariba (read)', configKeys: ['instance_url', 'api_key_vault_key'] },
  banking:  { name: 'Banking feeds',      configKeys: ['aggregator', 'connection_vault_key'] },
  email_ocr: { name: 'Email drop + OCR',  configKeys: ['inbox_address'] },
};

/**
 * E-mail OCR pipeline scaffold (invoices@tenant… → SpendRecord).
 * SECURITY: OCR text is UNTRUSTED CONTENT (invariant #9) — it is neutralised
 * by packages/agents neutraliseUntrusted() before any agent sees it, and it
 * can never trigger tools without human confirmation.
 */
export interface OcrResult {
  supplier: string | null;
  invoiceRef: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  rawText: string;
  confidence: number;
}

export interface OcrEngine {
  parseInvoice(pdfOrImage: Buffer): Promise<OcrResult>;
}

/** Deterministic dev OCR: extracts simple labelled fields from text-based PDFs. */
export class DevOcrEngine implements OcrEngine {
  async parseInvoice(buf: Buffer): Promise<OcrResult> {
    const text = buf.toString('utf8', 0, Math.min(buf.length, 65536));
    const grab = (re: RegExp) => text.match(re)?.[1]?.trim() ?? null;
    const amount = grab(/total[:\s]+\$?([\d,]+\.?\d*)/i);
    return {
      supplier: grab(/from[:\s]+(.{3,60})/i),
      invoiceRef: grab(/invoice\s*(?:no|#|ref)?[:\s]+([A-Za-z0-9-]{3,24})/i),
      date: grab(/date[:\s]+(\d{4}-\d{2}-\d{2})/i),
      amount: amount ? Number(amount.replace(/,/g, '')) : null,
      currency: grab(/currency[:\s]+([A-Z]{3})/i) ?? 'USD',
      rawText: text.slice(0, 4000),
      confidence: 0.5,
    };
  }
}
