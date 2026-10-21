/**
 * บัญชีช่าง — ล็อกอินลิงก์ช่างด้วยรหัสพนักงาน (0161 · เจ้าของสั่ง 21 ต.ค.69)
 *   ฝั่ง server แปลง "รหัส → ชื่อไทย" เอง (หน้าเว็บส่งแค่รหัสมาใน header x-chang-code)
 *   → ชื่อในใบเบิก/สมุดสโตร์/audit มาจากตารางนี้ ไม่ใช่ชื่อที่ช่างพิมพ์เอง
 *   ยังไม่รัน 0161 → ใช้รายชื่อตั้งต้น STAFF_SEED แทน (ช่างล็อกอินได้ตั้งแต่ deploy)
 */
import { createServiceClient } from "@/lib/supabase/admin";

export type ChangStaff = { code: string; name: string };

/** รายชื่อตั้งต้น = ชุดเดียวกับ migration 0161 */
export const STAFF_SEED: ChangStaff[] = [
  { code: "JR000", name: "แอดมิน" },
  { code: "JR002", name: "เป" },
  { code: "JR004", name: "เนียน" },
  { code: "JR009", name: "แบ้ง" },
  { code: "JR012", name: "ต้น" },
  { code: "JR017", name: "บอม" },
  { code: "JR040", name: "ชัย" },
  { code: "JR046", name: "จอย" },
  { code: "JR999", name: "สโตร์" },
];

/** "jr 002" / "JR-002" / "002" / "2" → "JR002" · ไม่ใช่รหัส → "" */
export function normStaffCode(raw: unknown): string {
  const t = String(raw ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
  const m = t.match(/^(?:JR)?(\d{1,4})$/);
  if (!m) return "";
  return "JR" + m[1].padStart(3, "0");
}

let cache: { at: number; list: ChangStaff[] } | null = null;
/** รายชื่อช่างที่ใช้งานอยู่ (แคช 60 วิ) · ตารางยังไม่มี → STAFF_SEED */
export async function listStaff(): Promise<ChangStaff[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.list;
  let list = STAFF_SEED;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceClient() as any;
    const { data, error } = await sb.from("chang_staff").select("code, name").eq("is_active", true).order("code");
    if (!error && Array.isArray(data)) list = (data as ChangStaff[]).map((r) => ({ code: r.code, name: String(r.name ?? "").trim() }));
  } catch { /* ใช้ STAFF_SEED */ }
  cache = { at: Date.now(), list };
  return list;
}

export async function staffByCode(raw: unknown): Promise<ChangStaff | null> {
  const code = normStaffCode(raw);
  if (!code) return null;
  return (await listStaff()).find((s) => s.code === code) ?? null;
}

/**
 * ชื่อคนกดจากลิงก์ช่าง: มีรหัส (x-chang-code) → ชื่อจากตาราง · ไม่มี → ชื่อจาก header เดิม (x-chang-name)
 *   ⚠ header เดิม encodeURIComponent มา (ไทยใส่ header ดิบไม่ได้)
 */
export async function changIdentity(req: Request): Promise<{ code: string; name: string; invalid?: boolean }> {
  const sent = req.headers.get("x-chang-code");
  const s = await staffByCode(sent);
  if (s) return { code: s.code, name: s.name };
  // ส่งรหัสมาแต่ไม่มีในระบบ/ถูกปิดบัญชี → ไม่ยอมให้ใช้ชื่อที่เครื่องจำไว้ (ต้องล็อกอินใหม่)
  if (sent && sent.trim()) return { code: "", name: "", invalid: true };
  const raw = req.headers.get("x-chang-name") ?? "";
  let name = "";
  try { name = decodeURIComponent(raw); } catch { name = raw; }
  return { code: "", name: name.trim() };
}
