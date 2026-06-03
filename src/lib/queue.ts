// ตรรกะคิวงาน — parse 3 tab ของ Google Sheet + กฎการจัดคิว (ดึงมาจากที่เขียนไว้ในชีต)
//  - Tab คิวลูกค้า : คิวจริง
//  - Tab วันหยุด/ลา : เซลล์คนไหนลา/วันหยุด วันไหน
//  - Tab โควตา : โควตาประเมิน/เดือน + สถานะ R2/R3 ("Workflow อ่าน Tab นี้ตรวจ R2/R3 ก่อนจัดคิว")

export type Sheet = { headers: string[]; rows: string[][] };
export type QueueData = { queue: Sheet; leave: Sheet; quota: Sheet };

export type LeaveEntry = { date: string; sales: string; span: string; type: string; note: string };
export type QuotaEntry = { sales: string; assessed: number; showroom: number; remaining: number; r2: string; r3: string };

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

const strip = (s: string) => (s ?? "").replace(/\s+/g, "");

// หา index คอลัมน์จากชื่อหัว (จับแบบ contains หลังตัดช่องว่าง)
export function colIndex(headers: string[], ...names: string[]): number {
  return headers.findIndex((h) => names.some((n) => strip(h).includes(strip(n))));
}

// "2026-06-01" -> { thai: "1/6/2569", dow: "จันทร์" } (ปี พ.ศ., ไม่มีเลขศูนย์นำหน้า)
export function isoToSheetDate(iso: string): { thai: string; dow: string } {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return { thai: "", dow: "" };
  const dt = new Date(y, m - 1, d);
  return { thai: `${d}/${m}/${y + 543}`, dow: DOW_TH[dt.getDay()] };
}

// normalize วันที่ไทยให้เทียบกันได้ "01/6/2569" == "1/6/2569" -> "1/6/2569"
export function normThaiDate(s: string): string {
  const parts = (s ?? "").trim().split(/[/.-]/).map((p) => p.trim());
  if (parts.length < 3) return (s ?? "").trim();
  const [d, m, y] = parts;
  return `${Number(d)}/${Number(m)}/${Number(y)}`;
}

export function parseLeave(sheet: Sheet): LeaveEntry[] {
  const h = sheet.headers;
  const di = colIndex(h, "วันที่");
  const si = colIndex(h, "เซลล์");
  const ci = colIndex(h, "ช่วง");
  const ti = colIndex(h, "ประเภท");
  const ni = colIndex(h, "หมายเหตุ");
  if (di < 0) return [];
  return sheet.rows
    .filter((r) => (r[di] ?? "").trim() !== "")
    .map((r) => ({
      date: normThaiDate(r[di] ?? ""),
      sales: (r[si] ?? "").trim(),
      span: (r[ci] ?? "").trim(),
      type: (r[ti] ?? "").trim(),
      note: (r[ni] ?? "").trim(),
    }));
}

// Tab โควตามี title row ด้านบน — สแกนหาแถวหัวที่ช่องแรก = "เซลล์"
export function parseQuota(sheet: Sheet): QuotaEntry[] {
  const all = [sheet.headers, ...sheet.rows];
  const hi = all.findIndex((r) => strip(r[0] ?? "") === "เซลล์");
  if (hi < 0) return [];
  const head = all[hi];
  const ai = colIndex(head, "ประเมินเดือน");
  const si = colIndex(head, "โชว์รูมเดือน");
  const ri = colIndex(head, "โควตาคงเหลือ", "คงเหลือ");
  const r2i = colIndex(head, "R2");
  const r3i = colIndex(head, "R3");
  const out: QuotaEntry[] = [];
  for (let i = hi + 1; i < all.length; i++) {
    const r = all[i];
    const name = (r[0] ?? "").trim();
    if (name === "" || name.startsWith("📌")) break; // จบบล็อกข้อมูล
    out.push({
      sales: name,
      assessed: Number(r[ai]) || 0,
      showroom: Number(r[si]) || 0,
      remaining: Number(r[ri]) || 0,
      r2: (r[r2i] ?? "").trim(),
      r3: (r[r3i] ?? "").trim(),
    });
  }
  return out;
}

// รายชื่อเซลล์ (จาก quota ก่อน ไม่งั้น derive จากคิว)
export function salesList(quota: QuotaEntry[], queue: Sheet): string[] {
  if (quota.length) return quota.map((q) => q.sales);
  const si = colIndex(queue.headers, "เซลล์");
  if (si < 0) return [];
  return Array.from(new Set(queue.rows.map((r) => (r[si] ?? "").trim()).filter(Boolean)));
}

export type BookingInput = { sales: string; dateThai: string; time: string };

// กฎการจัดคิว — errors = ห้ามจัด, warnings = จัดได้แต่ควรรู้
export function validateBooking(
  input: BookingInput,
  parsed: { leave: LeaveEntry[]; quota: QuotaEntry[]; queue: Sheet }
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const date = normThaiDate(input.dateThai);
  const sales = input.sales.trim();
  const time = input.time.trim();

  // 1) เซลล์ลา / วันหยุด
  parsed.leave
    .filter((l) => l.date === date && (l.sales === sales || l.sales === "ทุกคน"))
    .forEach((l) => {
      const who = l.sales === "ทุกคน" ? "วันหยุด" : `${sales} ลา`;
      errors.push(`${who} (${l.type || l.span || "ทั้งวัน"}) วันที่ ${l.date} — จัดคิวไม่ได้`);
    });

  // 2) ช่วงเวลาชนกัน (เซลล์เดิม วันเดิม เวลาเดิม)
  const h = parsed.queue.headers;
  const di = colIndex(h, "วันที่"), ti = colIndex(h, "เวลา"), si = colIndex(h, "เซลล์"), ni = colIndex(h, "ชื่อลูกค้า");
  if (di >= 0 && ti >= 0 && si >= 0 && time) {
    const clash = parsed.queue.rows.find(
      (r) => normThaiDate(r[di] ?? "") === date && (r[ti] ?? "").trim() === time && (r[si] ?? "").trim() === sales
    );
    if (clash) errors.push(`${sales} มีคิวเวลา ${time} วันที่ ${date} อยู่แล้ว (${ni >= 0 ? clash[ni] : "—"})`);
  }

  // 3) โควตา + สถานะ R2/R3 (เตือน ไม่บล็อก)
  const q = parsed.quota.find((x) => x.sales === sales);
  if (q) {
    if (q.remaining <= 0) warnings.push(`โควตาประเมินเดือนนี้ของ ${sales} เต็มแล้ว (เหลือ ${q.remaining})`);
    if (q.r2.includes("⚠️")) warnings.push(`สถานะ R2 ของ ${sales}: ${q.r2}`);
    if (q.r3.includes("⚠️")) warnings.push(`สถานะ R3 ของ ${sales}: ${q.r3}`);
  }

  return { errors, warnings };
}

// สร้างแถวตามลำดับคอลัมน์จริงของ Tab คิวลูกค้า (ค่าที่ไม่รู้ = ว่าง)
export function buildQueueRow(headers: string[], fields: Record<string, string>): string[] {
  // map ชื่อหัวคอลัมน์ -> key ใน fields
  const MAP: { keys: string[]; field: string }[] = [
    { keys: ["สถานะ"], field: "status" },
    { keys: ["วัน"], field: "dow" },
    { keys: ["วันที่"], field: "dateThai" },
    { keys: ["เวลา"], field: "time" },
    { keys: ["ประเภท"], field: "jobType" },
    { keys: ["เซลล์"], field: "sales" },
    { keys: ["Line", "FB", "IG", "ช่องทาง"], field: "channel" },
    { keys: ["ชื่อลูกค้า"], field: "customer" },
    { keys: ["เบอร์"], field: "tel" },
    { keys: ["ที่อยู่"], field: "address" },
    { keys: ["โลเคชั่น", "แผนที่", "พิกัด"], field: "location" },
    { keys: ["ขนาด"], field: "size" },
    { keys: ["ค่าประเมิน"], field: "fee" },
    { keys: ["การชำระ"], field: "payment" },
    { keys: ["ใบเสร็จ"], field: "receipt" },
    { keys: ["หมายเหตุ admin", "หมายเหตุadmin"], field: "noteAdmin" },
    { keys: ["หมายเหตุ AI", "หมายเหตุai"], field: "noteAI" },
  ];
  return headers.map((hd) => {
    // เลือก mapping ที่ "วันที่" ต้องไม่โดน "วัน" แย่ง — เช็คตัวที่จับยาวสุดก่อน
    const exact =
      MAP.find((m) => m.keys.some((k) => strip(hd) === strip(k))) ??
      MAP.find((m) => m.keys.some((k) => strip(hd).includes(strip(k))));
    return exact ? fields[exact.field] ?? "" : "";
  });
}
