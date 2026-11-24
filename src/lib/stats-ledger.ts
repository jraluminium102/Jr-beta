/**
 * แก้สมุดบัญชี (ยอดมัดจำ) ในหน้าสถิติด้วยมือ — เจ้าของสั่ง 24 พ.ย.69
 *   เทียบกับไฟล์ยอดมัดจำของบัญชีแล้วเจอ 4 แบบที่ระบบคิดเองไม่ได้:
 *     1) งานที่ไม่มีในระบบ (เช่น งานบ้าน K.อ้อ)        → เพิ่มรายการเอง (manual)
 *     2) ยอดไม่ตรง (เช่น ใบวางบิลออกไม่ครบยอดงาน)      → แก้ยอดงาน / ยอดมัดจำ ทับค่าที่ระบบคิด (net / deposit)
 *     3) รายการที่ไม่ใช่ยอดขาย (เช่น จ่ายแค่ค่าแบบ)     → เอาออกจากยอดมัดจำ (excluded) — เอากลับได้
 *     4) ระบบเดาว่ามัดจำหน้างานแต่ไม่ใช่ (หรือกลับกัน)   → ตั้งเอง (onsite)
 *   เก็บเป็น JSON ก้อนเดียวใน app_config (key ด้านล่าง) — ไม่ต้องรัน migration · ไม่แตะข้อมูลงาน/บิล/การเงินจริง
 *   มีผลเฉพาะตัวเลขหน้าสถิติ (API /api/stats อ่านก้อนนี้ทุกครั้ง)
 */

export const LEDGER_ADJUST_KEY = "stats_ledger_adjust";
export const LEDGER_KINDS = ["NEW", "OLD", "ADDON", "SPECIAL"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** ค่าที่ตั้งทับของงานในระบบ — ไม่มี key = ใช้ค่าที่ระบบคิด */
export type LedgerJobAdj = {
  net?: number;        // ยอดงานทั้งหมด (ก่อน VAT)
  deposit?: number;    // ยอดมัดจำ (ก่อน VAT แบบที่บัญชีจด)
  onsite?: boolean;    // มัดจำหน้างาน ใช่/ไม่ใช่
  excluded?: boolean;  // เอาออกจากยอดมัดจำ/ยอดขาย
  at?: string; by?: string;
};
/** รายการที่เพิ่มเอง (งานที่ไม่มีในระบบ) */
export type LedgerManual = {
  id: string;
  customer_name: string; line: string;
  deposit_date: string; assess_date: string | null;
  deposit: number; net: number; fee: number;
  vat: boolean; kind: LedgerKind; sales: string; onsite: boolean; note: string;
  at?: string; by?: string;
};
export type LedgerAdjust = { jobs: Record<string, LedgerJobAdj>; manual: LedgerManual[] };

/** id ของแถวที่เพิ่มเอง ในรายการที่ส่งให้หน้าเว็บ ("m:<id>") — กันชนกับ id งานจริง (uuid) */
export const MANUAL_PREFIX = "m:";
export const isManualRowId = (id: string) => id.startsWith(MANUAL_PREFIX);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? Math.round(n * 100) / 100 : undefined;
};
const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

/** อ่านค่าจาก app_config อย่างทนทาน — ของเสีย/ผิดรูป = ข้ามเฉพาะตัวนั้น ไม่ทำให้หน้าสถิติล้ม */
export function parseLedgerAdjust(raw: unknown): LedgerAdjust {
  let o: unknown = raw;
  if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { o = null; } }
  const out: LedgerAdjust = { jobs: {}, manual: [] };
  if (!o || typeof o !== "object") return out;
  const src = o as { jobs?: unknown; manual?: unknown };
  if (src.jobs && typeof src.jobs === "object") {
    for (const [id, v] of Object.entries(src.jobs as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const a = v as Record<string, unknown>; const adj: LedgerJobAdj = {};
      const net = money(a.net); if (net !== undefined) adj.net = net;
      const dep = money(a.deposit); if (dep !== undefined) adj.deposit = dep;
      if (typeof a.onsite === "boolean") adj.onsite = a.onsite;
      if (a.excluded === true) adj.excluded = true;
      if (!Object.keys(adj).length) continue;
      if (typeof a.at === "string") adj.at = a.at;
      if (typeof a.by === "string") adj.by = a.by;
      out.jobs[id] = adj;
    }
  }
  if (Array.isArray(src.manual)) {
    for (const v of src.manual) {
      if (!v || typeof v !== "object") continue;
      const m = v as Record<string, unknown>;
      const id = str(m.id, 80), name = str(m.customer_name, 200), dd = str(m.deposit_date, 10);
      if (!id || !name || !ISO.test(dd)) continue;
      const ad = str(m.assess_date, 10);
      out.manual.push({
        id, customer_name: name, line: str(m.line, 200), deposit_date: dd, assess_date: ISO.test(ad) ? ad : null,
        deposit: money(m.deposit) ?? 0, net: money(m.net) ?? 0, fee: money(m.fee) ?? 0,
        vat: m.vat === true, kind: (LEDGER_KINDS as readonly string[]).includes(String(m.kind)) ? (m.kind as LedgerKind) : "NEW",
        sales: str(m.sales, 80), onsite: m.onsite === true, note: str(m.note, 500),
        ...(typeof m.at === "string" ? { at: m.at } : {}), ...(typeof m.by === "string" ? { by: m.by } : {}),
      });
    }
  }
  return out;
}

type Sb = { from: (t: string) => any };

export async function loadLedgerAdjust(sb: Sb): Promise<LedgerAdjust> {
  const { data, error } = await sb.from("app_config").select("value").eq("key", LEDGER_ADJUST_KEY).maybeSingle();
  if (error) throw new Error(error.message ?? "อ่านรายการแก้สมุดบัญชีไม่สำเร็จ");
  return parseLedgerAdjust(data?.value ?? null);
}

export async function saveLedgerAdjust(sb: Sb, adj: LedgerAdjust): Promise<void> {
  const { error } = await sb.from("app_config").upsert(
    { key: LEDGER_ADJUST_KEY, value: JSON.stringify(adj), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message ?? "บันทึกรายการแก้สมุดบัญชีไม่สำเร็จ");
}

/** รวมค่าที่ส่งมาเข้ากับของเดิมของงานหนึ่ง: undefined = ไม่แตะ · null/false(excluded) = ลบ key (กลับไปใช้ค่าระบบ) */
export function mergeJobAdj(cur: LedgerJobAdj | undefined, patch: { net?: number | null; deposit?: number | null; onsite?: boolean | null; excluded?: boolean }): LedgerJobAdj | null {
  const next: LedgerJobAdj = { ...(cur ?? {}) };
  if (patch.net !== undefined) { if (patch.net === null) delete next.net; else next.net = patch.net; }
  if (patch.deposit !== undefined) { if (patch.deposit === null) delete next.deposit; else next.deposit = patch.deposit; }
  if (patch.onsite !== undefined) { if (patch.onsite === null) delete next.onsite; else next.onsite = patch.onsite; }
  if (patch.excluded !== undefined) { if (patch.excluded) next.excluded = true; else delete next.excluded; }
  const has = next.net !== undefined || next.deposit !== undefined || next.onsite !== undefined || next.excluded === true;
  return has ? next : null;
}
