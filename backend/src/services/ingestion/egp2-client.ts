/**
 * Client for the BMA's own procurement disclosure system.
 *
 *   https://egp2.bangkok.go.th/appapi/api
 *
 * This is a plain JSON API with no authentication, no api-key and — unlike the
 * announcement search on process5.gprocurement.go.th — no Cloudflare Turnstile.
 * The site is a Next.js app whose bundle ships a Zodios contract, so the routes
 * and their query parameters below are taken from that contract rather than
 * guessed.
 *
 * Why this matters: the govspending egp-contract API only exposes step 5
 * (signed contracts), so everything it returns is already awarded. This API
 * exposes procurement *plans* and the draft/invitation announcement stages,
 * which is what the product actually needs in order to alert users before a
 * deadline.
 *
 * Scope note: this service only covers กรุงเทพมหานคร, which matches the SRS.
 *
 * Gotcha: `masterBudgetYearId` takes the Buddhist-era year as a plain number
 * (2569), NOT the GUID returned by /MasterBudgetYears. Passing the GUID
 * silently returns zero rows instead of an error.
 */

const BASE = "https://egp2.bangkok.go.th/appapi/api";
const DEFAULT_DELAY_MS = 300;

/** Announce-type ids from /MasterAnnounceTypes. */
export const ANNOUNCE_TYPE = {
  /** แผนการจัดซื้อจัดจ้าง */
  PLAN: "c88c8d7c-0a07-4194-ab14-cea4c6695f40",
  /** ประกาศราคากลาง */
  MEDIAN_PRICE: "9863983d-44e1-4eee-b38a-bb0b495762c5",
  /** ร่างเอกสารประกวดราคา (e-Bidding) — still open for comment */
  DRAFT_BIDDING: "417bddc2-c971-465f-b419-23847e27bcba",
  /** ประกาศเชิญชวน — open for bids */
  INVITATION: "705f1ffb-82e2-4beb-bdd2-2746f0783bf0",
  /** ประกาศรายชื่อผู้ชนะ — already awarded */
  WINNER: "8a879a96-9fcc-48a0-aa06-8a39450d02bb",
} as const;

/** The stages a bidder can still act on. */
export const OPEN_ANNOUNCE_TYPES = [
  ANNOUNCE_TYPE.DRAFT_BIDDING,
  ANNOUNCE_TYPE.INVITATION,
] as const;

export interface Paged<T> {
  totalCount: number;
  currentPage: number;
  pageCount: number;
  hasNextPage: boolean;
  data: T[];
}

export interface Egp2ProjectRow {
  no: number;
  projectId: string;
  /** e-GP project number — the join key to govspending and process5. */
  projectNumber: string;
  projectName: string;
  masterOrgGroupName?: string | null;
  masterOrgDepartmentName?: string | null;
  masterOrgDivisionName?: string | null;
  masterContractAvailableCode?: string | null;
  masterContractAvailableName?: string | null;
  projectBudget?: number | null;
  projectPaymentIsLate?: boolean;
  createdBy?: string | null;
}

export interface Egp2PlanRow {
  no: number;
  planProjectId: string;
  planProjectPlanProjectName: string;
  planProjectPlanProjectsCode: string;
  /** "MM/YYYY" in Buddhist era — when the agency expects to announce. */
  planProjectExpectedAnnounce?: string | null;
  planProjectAnnounceDate?: string | null;
  masterOrgGroupName?: string | null;
  masterOrgDepartmentName?: string | null;
  planProjectBudget?: number | null;
  createdBy?: string | null;
}

export interface ProjectFilter {
  pageNo?: number;
  pageSize?: number;
  projectSearchText?: string;
  /** Buddhist-era year as a number, e.g. 2569. */
  budgetYear?: number;
  masterAnnounceTypeId?: string;
  masterOrgGroupId?: string;
  masterOrgDepartmentId?: string;
  masterMethodIdId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: "publishDateDesc" | "publishDateAsc" | "budgetDesc" | "budgetAsc";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getJson<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const url = `${BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} จาก egp2 ${path} — ${body.slice(0, 200)}`);
  }
  return JSON.parse(body) as T;
}

/** One page of projects. Callers that need every page use `fetchAllProjects`. */
export function fetchProjects(filter: ProjectFilter = {}): Promise<Paged<Egp2ProjectRow>> {
  return getJson<Paged<Egp2ProjectRow>>("/Projects/GetProjectFromFilter", {
    pageNo: filter.pageNo ?? 1,
    pageSize: filter.pageSize ?? 50,
    projectSearchText: filter.projectSearchText,
    masterBudgetYearId: filter.budgetYear,
    masterAnnounceTypeId: filter.masterAnnounceTypeId,
    masterOrgGroupId: filter.masterOrgGroupId,
    masterOrgDepartmentId: filter.masterOrgDepartmentId,
    masterMethodIdId: filter.masterMethodIdId,
    startDate: filter.startDate,
    endDate: filter.endDate,
    sortBy: filter.sortBy ?? "publishDateDesc",
  });
}

/** One page of procurement plans — these precede any announcement. */
export function fetchPlans(filter: ProjectFilter = {}): Promise<Paged<Egp2PlanRow>> {
  return getJson<Paged<Egp2PlanRow>>("/PlanProjects/GetPlanProjectFromFilter", {
    pageNo: filter.pageNo ?? 1,
    pageSize: filter.pageSize ?? 50,
    planProjectSearchText: filter.projectSearchText,
    masterBudgetYearId: filter.budgetYear,
    startDate: filter.startDate,
    endDate: filter.endDate,
    sortBy: filter.sortBy ?? "publishDateDesc",
  });
}

/**
 * Follow pagination for a project filter.
 *
 * An unfiltered call scans the whole table and times out server-side, so
 * callers should always narrow by year, announce type or keyword.
 */
export async function fetchAllProjects(
  filter: ProjectFilter,
  options: { maxRecords?: number; delayMs?: number; onPage?: (fetched: number, total: number) => void } = {},
): Promise<Egp2ProjectRow[]> {
  const pageSize = filter.pageSize ?? 200;
  const max = options.maxRecords ?? 20_000;
  const delay = options.delayMs ?? DEFAULT_DELAY_MS;
  const out: Egp2ProjectRow[] = [];

  for (let page = 1; ; page++) {
    const res = await fetchProjects({ ...filter, pageNo: page, pageSize });
    out.push(...res.data);
    options.onPage?.(out.length, res.totalCount);
    if (!res.hasNextPage || out.length >= max) break;
    await sleep(delay);
  }
  return out.slice(0, max);
}

/** Announcement rows carry `projectAnnouncementPath` — the published PDF name. */
export function fetchAnnouncements(projectId: string) {
  return getJson<Paged<Record<string, unknown>>>(
    "/ProjectAnnouncements/GetAnnouncementDetailInProject",
    { projectId },
  );
}

export function fetchPlanDetail(planProjectId: string) {
  return getJson<Record<string, unknown>>("/PlanProjects/GetPlanProjectDetail", { planProjectId });
}

export interface Egp2TorRow {
  no: number;
  projectId: string;
  projectTorTitle?: string | null;
  /** Public-hearing window — the only deadline either API exposes. */
  projectTorHearingStartDate?: string | null;
  projectTorHearingEndDate?: string | null;
  /** File name only; egp2's own file base path is not published, so the
   *  downloadable copy comes from the process5 archive instead. */
  projectTorPath?: string | null;
  id?: string;
}

/**
 * TOR records attached to a project.
 *
 * Only projects that went through a public hearing have one, so an empty
 * result is normal rather than an error — a direct-award purchase never has a
 * hearing. This is the one place either API exposes a real deadline, which the
 * alerting features need.
 */
export function fetchTors(projectId: string): Promise<Paged<Egp2TorRow>> {
  return getJson<Paged<Egp2TorRow>>("/ProjectTors/GetTorInProject", {
    projectId,
    pageNo: 1,
    pageSize: 30,
  });
}

export interface Egp2ProjectDetail {
  projectId: string;
  projectName: string;
  projectNumber: string;
  masterContractAvailableName?: string | null;
  masterOrgGroupName?: string | null;
  masterOrgDepartmentName?: string | null;
  projectBudget?: number | null;
  /** The agency's reference price (ราคากลาง). */
  projectAverageBudget?: number | null;
  masterTypeIdName?: string | null;
  masterGoodsIdName?: string | null;
  masterMethodIdName?: string | null;
  projectPlanProjectId?: string | null;
}

export function fetchDetail(projectId: string): Promise<Egp2ProjectDetail> {
  return getJson<Egp2ProjectDetail>("/Projects/GetProjectDetail", { projectId });
}
