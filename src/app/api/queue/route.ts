import { getContext, Http, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// คิวงาน — ดึงสดจาก Google Sheet ที่แชร์เป็นสาธารณะ (3 tab)
// ตั้งค่า env เพื่อชี้ชีต/แท็บอื่นได้
const SHEET_ID = process.env.QUEUE_SHEET_ID ?? "1EzZSHZQCW8P8BdP76jnhjXcPzVNcbaHMeYsDeX9rMPQ";
const GID_QUEUE = process.env.QUEUE_SHEET_GID ?? "1355331641"; // Tab "คิวลูกค้า"
const GID_LEAVE = process.env.QUEUE_LEAVE_GID ?? "1793277287"; // Tab "วันหยุด/ลา"
const GID_QUOTA = process.env.QUEUE_QUOTA_GID ?? "1868951225"; // Tab "โควตา/สถิติเซลล์"

// route นี้ต้องสดเสมอ (ไม่ cache) เพื่อให้ปุ่มรีเฟรชได้ข้อมูลล่าสุดจริง
export const dynamic = "force-dynamic";
export const revalidate = 0;

export type Sheet = { headers: string[]; rows: string[][] };

// CSV parser รองรับฟิลด์ที่มี comma/ขึ้นบรรทัดใหม่ภายใน "..." และ escaped quote ("")
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ดึงแท็บเดียว → {headers, rows} (ตัดคอลัมน์/แถวว่างทั้งหมดทิ้ง)
async function fetchTab(gid: string): Promise<Sheet> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // Google คืน HTML 400 เมื่อ gid ไม่มีอยู่ — แจ้งให้ชัด แทน "Internal error"
    throw new HttpError(502, `ดึง Google Sheet ไม่สำเร็จ (gid=${gid}, HTTP ${res.status}) — ตรวจสอบว่าแชร์เป็น "ทุกคนที่มีลิงก์" และ gid ถูกต้อง`);
  }
  const csv = await res.text();
  // กันกรณี Google ส่ง HTML แทน CSV (เช่น ต้องล็อกอิน)
  if (csv.trimStart().startsWith("<!DOCTYPE") || csv.trimStart().startsWith("<html")) {
    throw new HttpError(502, "Google Sheet ไม่ได้แชร์เป็นสาธารณะ — ตั้งค่าแชร์เป็น \"ทุกคนที่มีลิงก์ ดูได้\"");
  }

  const all = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  const headers = all[0] ?? [];
  const body = all.slice(1);
  const keep = headers.map((_, ci) => body.some((r) => (r[ci] ?? "").trim() !== "") || (headers[ci] ?? "").trim() !== "");
  const cleanHeaders = headers.filter((_, ci) => keep[ci]);
  const cleanRows = body.map((r) => headers.map((_, ci) => r[ci] ?? "").filter((_, ci) => keep[ci]));
  return { headers: cleanHeaders, rows: cleanRows };
}

// GET /api/queue — คืนคิวลูกค้า + วันหยุด/ลา + โควตาเซลล์
export const GET = withRoute(async () => {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();

  // คิวลูกค้าคือหัวใจ — ถ้าดึงไม่ได้ ให้ error; ส่วนวันหยุด/โควตา ถ้าพลาดให้ว่าง (ไม่ทำให้หน้าพัง)
  const queue = await fetchTab(GID_QUEUE);
  const [leave, quota] = await Promise.all([
    fetchTab(GID_LEAVE).catch(() => ({ headers: [], rows: [] } as Sheet)),
    fetchTab(GID_QUOTA).catch(() => ({ headers: [], rows: [] } as Sheet)),
  ]);

  return ok(
    { queue, leave, quota },
    {
      total: queue.rows.length,
      fetched_at: new Date().toISOString(),
      sheet_url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${GID_QUEUE}`,
    }
  );
});
