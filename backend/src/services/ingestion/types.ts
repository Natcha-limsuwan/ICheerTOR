/**
 * Shared types for the data.go.th ingestion layer.
 *
 * PDPA: ข้อมูลที่ดึงมาจาก API อาจมีข้อมูลส่วนบุคคลของเจ้าหน้าที่ติดมาด้วย
 * (ชื่อ-นามสกุลผู้ติดต่อ เบอร์โทร อีเมล) — ห้ามบันทึกลง DB จริงโดยตรง
 * ต้องผ่าน field filtering ก่อนเสมอ ดู lib/services/ingestion/pdpa-filter.ts
 */

/* ─── CKAN discovery (data.go.th) ───────────────────────────────────── */

export interface CkanDataset {
  id: string;
  name: string;
  title: string;
  notes?: string;
  organizationTitle?: string;
  resourceCount: number;
}

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

/* ─── Datastore rows (opend.data.go.th) ─────────────────────────────── */

/** A row as returned by datastore_search — field names are unknown until probed. */
export type DatastoreRecord = Record<string, unknown>;

export interface FetchResourceOptions {
  /** Rows per request. CKAN caps this; 1000 is the practical maximum. */
  limit?: number;
  /** Starting offset for pagination. */
  offset?: number;
  /** Full-text filter applied server-side. Thai tokenisation is unreliable —
   *  treat this as a volume reducer only, never as the authoritative filter. */
  q?: string;
  /** Stop after this many rows in total. Guards against multi-million-row sets. */
  maxRecords?: number;
}

export interface FetchResourceResult {
  records: DatastoreRecord[];
  /** Total reported by CKAN, when available. */
  total: number | null;
  /** Field metadata reported by CKAN, when available. */
  fields: Array<{ id: string; type: string }>;
  truncated: boolean;
}

/* ─── Errors ────────────────────────────────────────────────────────── */

export class DataGoThAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataGoThAuthError";
  }
}

export class DataGoThApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DataGoThApiError";
  }
}
