// วางข้อความลูกค้า → เติมฟอร์มคิวอัตโนมัติ (ย้ายออกจาก QueueModal.tsx 20 พ.ย.69 ให้ทดสอบได้ด้วย scripts/verify-lead-source.mjs)
//   ⚠ แก้ไฟล์นี้ต้องรัน: node scripts/verify-lead-source.mjs
import { parseLeadCode, stripLeadCode } from "./queue";

// แยกข้อมูลจาก "ข้อความที่วางมา" → ชื่อ/เบอร์/ที่อยู่/ลิงก์แมพ/ช่องทาง (heuristic · เว้นวันนัดให้กรอกเอง)
export type ParsedContact = { customer_name?: string; tel?: string; address?: string; location_url?: string; contact_channel?: string; line_contact?: string; lead_source?: string; lead_source_code?: string };
// บรรทัดที่เป็น "ข้อความทักจากแอด" (ไม่ใช่ชื่อลูกค้า) เช่น "สนใจหน้าต่างบานยกครับ" — ใช้ตอนตัดรหัสแอดออกแล้วเหลือข้อความ
const AD_GREETING_RE = /สนใจ|สอบถาม|ขอราคา|ขอทราบ|รายละเอียด|ครับ|ค่ะ|คะ\s*$|คับ\s*$|จ้า\s*$|hello|interested/i;
const ADDR_RE = /(เลขที่|หมู่ ?\d|หมู่บ้าน|ซอย|ถ\.|ถนน|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|แขวง|เขต|กรุงเทพ|\d{5})/;
export function parseContactBlob(text: string): ParsedContact {
  const out: ParsedContact = {};
  const urlRe = /(https?:\/\/[^\s]+)/i;
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return out;

  // (0175) รหัสแอดในวงเล็บท้ายบรรทัด เช่น "สนใจหน้าต่างบานยกครับ (A12)" → รหัส + เดาที่มาจากตัวอักษรนำ (A/T/Y/G)
  //   ไม่เจอ = ไม่เติมอะไร (ห้ามเดา) · ข้ามบรรทัดที่อยู่ (กัน "คอนโด … (A2)" ถูกอ่านเป็นรหัส)
  //   เจอแล้วตัดรหัสออกจากบรรทัดนั้น — ถ้าที่เหลือเป็นข้อความทัก ("สนใจ…ครับ") ทิ้งทั้งบรรทัด ไม่ให้กลายเป็นชื่อลูกค้า
  //   ⚠ ตัดเบอร์โทรออกก่อนเช็คว่าเป็นบรรทัดที่อยู่ — เบอร์ไม่มีขีด (0812345678) มีเลข 5 หลักติดกัน จะถูกมองเป็นรหัสไปรษณีย์
  const lead = parseLeadCode(lines.join("\n"), (l) => ADDR_RE.test(l.replace(/0\d[\d\s\-]{7,11}\d/g, " ")));
  if (lead) {
    out.lead_source_code = lead.code;
    out.lead_source = lead.source;
    const rest = stripLeadCode(lines[lead.line]);
    //   (บรรทัดนั้นมีเบอร์โทรอยู่ด้วย → เก็บไว้ ไม่ให้เบอร์หาย)
    const keep = !!rest && (!AD_GREETING_RE.test(rest) || /0\d[\d\s\-]{7,11}\d/.test(rest));
    lines = lines.flatMap((l, i) => (i !== lead.line ? [l] : keep ? [rest] : []));
    if (!lines.length) return out;
  }

  // ลิงก์แมพ (เอาลิงก์แรก · ถ้าเป็นลิงก์แมพยิ่งชัวร์)
  let mapUrl = "";
  for (const l of lines) { const m = l.match(urlRe); if (m) { mapUrl = m[1]; if (/goo\.gl|maps|map/i.test(m[1])) break; } }
  if (mapUrl) out.location_url = mapUrl;

  // เบอร์โทร (0xx-xxx-xxxx / 0xxxxxxxxx) — ข้ามบรรทัดที่เป็นลิงก์
  const phoneRe = /0\d[\d\s\-]{7,11}\d/;
  let phone = "";
  for (const l of lines) { if (urlRe.test(l)) continue; const m = l.match(phoneRe); if (m) { phone = m[0].trim(); break; } }
  if (phone) out.tel = phone;

  // ช่องทาง + ชื่อ/handle (FB / Line / IG) — คิวรองรับ LINE/FB (IG เก็บชื่อไว้ ไม่เปลี่ยนช่อง)
  const chanRe = /^(fb|facebook|เฟส\S*|เฟซ\S*|line|ไลน์|ig|instagram|อินสตา\S*)\b[\s:：]*(.*)$/i;
  for (const l of lines) {
    const m = l.match(chanRe); if (!m) continue;
    const key = m[1].toLowerCase();
    if (/fb|face|เฟส|เฟซ/.test(key)) out.contact_channel = "FB";
    else if (/line|ไลน์/.test(key)) out.contact_channel = "LINE";
    const handle = (m[2] ?? "").trim();
    if (handle) out.line_contact = handle;
    break;
  }

  // ที่อยู่ — บรรทัดที่มีคำบอกที่อยู่ (ไม่ใช่ลิงก์/ช่องทาง/บรรทัดเบอร์)
  const addrRe = ADDR_RE;
  const addrLines = lines.filter((l) => !urlRe.test(l) && !chanRe.test(l) && !(phone && l.includes(phone)) && addrRe.test(l));
  if (addrLines.length) out.address = addrLines.join(" ");

  // ชื่อลูกค้า — บรรทัดที่มีเบอร์ (ตัดเบอร์ออก) หรือบรรทัดแรกที่ไม่ใช่ที่อยู่/ลิงก์/ช่องทาง
  let name = "";
  if (phone) { const pl = lines.find((l) => l.includes(phone)); if (pl) name = pl.replace(phone, "").replace(/[·|,]/g, " ").trim(); }
  if (!name) name = lines.find((l) => !urlRe.test(l) && !chanRe.test(l) && !addrRe.test(l)) ?? "";
  name = name.replace(/^[·|,\-–\s]+|[·|,\-–\s]+$/g, "").trim();
  if (name) out.customer_name = name;

  return out;
}
