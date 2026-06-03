import { getContext, Http } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// คิวงาน (ตารางนัดประเมิน) ดึงสดจาก Google Sheet ที่แชร์เป็นสาธารณะ
// ตั้งค่า QUEUE_SHEET_ID / QUEUE_SHEET_GID ใน .env.local เพื่อชี้ชีตอื่นได้
const SHEET_ID = process.env.QUEUE_SHEET_ID ?? "1EzZSHZQCW8P8BdP76jnhjXcPzVNcbaHMeYsDeX9rMPQ";
const SHEET_GID = process.env.QUEUE_SHEET_GID ?? "0";

// route นี้ต้องสดเสมอ (ไม่ cache) เพื่อให้ปุ่มรีเฟรชได้ข้อมูลล่าสุดจริง
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  // เก็บฟิลด์/แถวสุดท้าย ถ้าไฟล์ไม่ลงท้ายด้วย newline
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// GET /api/queue — คืน headers + rows (string[][]) ของชีตคิวงาน
export const GET = withRoute(async () => {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`ดึงข้อมูลจาก Google Sheet ไม่สำเร็จ (HTTP ${res.status})`);
  }

  const csv = await res.text();
  const all = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== "")); // ตัดแถวว่าง
  const headers = all[0] ?? [];
  const body = all.slice(1);

  // ซ่อนคอลัมน์ที่ว่างทั้งคอลัมน์ เพื่อลดความกว้างตาราง
  const keep = headers.map((_, ci) => body.some((r) => (r[ci] ?? "").trim() !== ""));
  const cleanHeaders = headers.filter((_, ci) => keep[ci]);
  const cleanRows = body.map((r) => headers.map((_, ci) => r[ci] ?? "").filter((_, ci) => keep[ci]));

  return ok(
    { headers: cleanHeaders, rows: cleanRows },
    { total: cleanRows.length, fetched_at: new Date().toISOString() }
  );
});
