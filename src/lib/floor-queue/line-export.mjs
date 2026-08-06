// line-export.mjs — สร้างข้อความ "อัปเดตคิวงานพื้น" ให้ก๊อปวางไลน์ได้เป๊ะ
//   pure JS ไม่มี type (เหมือน src/lib/cover-sheet/generate.mjs) — ใช้ได้ทั้งฝั่งเว็บ (UI ปุ่มคัดลอก) และ node (golden test)
//
// รูปแบบ (อ้างอิงข้อความจริงที่ส่งเข้าไลน์):
//   ☀️🌤️ อัพเดทคิวเดือน{เดือนไทย} 🌤️✨
//
//   {emoji} วันที่ {D} {เดือนไทย} {ปีพ.ศ.} , {H.MM} น.{ (รอCF)/(รอCFJR) ถ้ามี}
//   - คุณ{ชื่อ} : {งาน}{ (durationNote) ถ้ามี}
//
//   งานที่รอต่อหลังJRเสร็จ
//   - คุณ{ชื่อ}{ : งาน ถ้ามี}{ (note) ถ้ามี}
//
//   ลูกค้ามัดจำมาแล้ว รอลงคิว
//   - คุณ{ชื่อ}{ : งาน ถ้ามี}{ (note) ถ้ามี}

const TH_MONTHS = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const KIND_EMOJI = { work: "🔴", assess: "🟣" };
const STATUS_SUFFIX = { confirmed: "", wait_cf: " (รอCF)", wait_cf_jr: " (รอCFJR)" };

/** ISO "YYYY-MM-DD" → { y, m, d } (เลขล้วน ไม่ padding) */
function splitIso(iso) {
  const [y, m, d] = String(iso).split("-").map((s) => parseInt(s, 10));
  return { y, m, d };
}

/** "HH:MM" → "H.MM" (ตัดศูนย์นำหน้าชั่วโมง เก็บนาที 2 หลัก) เช่น "09:00" → "9.00" */
export function fmtQueueTime(t) {
  const s = String(t || "09:00").trim();
  const [h, m] = s.split(":");
  const hour = parseInt(h, 10) || 0;
  const min = (m ?? "00").padStart(2, "0").slice(0, 2);
  return `${hour}.${min}`;
}

/** วันที่หัวบล็อก: "วันที่ 4 สิงหาคม 2569 , 9.00 น." */
function dateHeaderLine(entry) {
  const { y, m, d } = splitIso(entry.scheduled_date);
  const beYear = y + 543;
  const emoji = KIND_EMOJI[entry.kind] || KIND_EMOJI.work;
  const suffix = STATUS_SUFFIX[entry.status] ?? "";
  return `${emoji} วันที่ ${d} ${TH_MONTHS[m]} ${beYear} , ${fmtQueueTime(entry.start_time)} น.${suffix}`;
}

/** ชื่อ + คำนำหน้า "คุณ" — กันซ้ำ (ชื่อจากงาน JR มักมี "คุณ" มาแล้ว · พิมพ์เองอาจไม่มี) */
function nameWithPrefix(name) {
  const n = String(name || "").trim();
  return n.startsWith("คุณ") ? n : `คุณ${n}`;
}

/** บรรทัดคนในบล็อกวันที่ (bucket=scheduled) — ไม่มีงาน = ไม่ขึ้น " : " ลอย */
function scheduledPersonLine(e) {
  const work = e.work_desc ? ` : ${e.work_desc}` : "";
  const dur = e.duration_note ? ` (${e.duration_note})` : "";
  return `- ${nameWithPrefix(e.customer_name)}${work}${dur}`;
}

/** บรรทัดคนในถังท้าย (after_jr / deposit_wait) */
function bucketPersonLine(e) {
  const work = e.work_desc ? ` : ${e.work_desc}` : "";
  const note = e.extra_note ? ` (${e.extra_note})` : "";
  return `- ${nameWithPrefix(e.customer_name)}${work}${note}`;
}

/** key จัดกลุ่มบล็อกวันที่ (วัน+เวลา+สถานะ+ประเภท เหมือนกัน = หัวเดียวกัน) */
function groupKey(e) {
  return `${e.scheduled_date}|${e.start_time || "09:00"}|${e.status || "confirmed"}|${e.kind || "work"}`;
}

/** จัดกลุ่ม scheduled entries → บล็อกวันที่ (เรียงวันจากน้อยไปมาก) ภายใน 1 เดือน */
function buildDateBlocks(monthEntries) {
  const groups = new Map();
  for (const e of monthEntries) {
    const k = groupKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const keys = [...groups.keys()].sort(); // "YYYY-MM-DD|HH:MM|status|kind" → เรียงวัน/เวลาได้ตรง ๆ ด้วย string sort
  return keys.map((k) => {
    const people = groups.get(k).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const head = dateHeaderLine(people[0]);
    return [head, ...people.map(scheduledPersonLine)].join("\n");
  });
}

/** จัดกลุ่ม scheduled entries → ต่อเดือน (เรียงเดือนจากน้อยไปมาก) */
function buildMonthSections(scheduled) {
  const byMonth = new Map(); // "YYYY-MM" → entries[]
  for (const e of scheduled) {
    if (!e.scheduled_date) continue;
    const { y, m } = splitIso(e.scheduled_date);
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(e);
  }
  const monthKeys = [...byMonth.keys()].sort();
  return monthKeys.map((k) => {
    const m = parseInt(k.split("-")[1], 10);
    const header = `☀️🌤️ อัพเดทคิวเดือน${TH_MONTHS[m]} 🌤️✨`;
    const blocks = buildDateBlocks(byMonth.get(k));
    return [header, ...blocks].join("\n\n");
  });
}

function buildBucketSection(title, items) {
  const sorted = items.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return [title, ...sorted.map(bucketPersonLine)].join("\n");
}

/**
 * buildLineExport(entries) → ข้อความเต็มพร้อมก๊อปวางไลน์
 * entries = FloorQueueEntry[] (ทุกแถว ไม่ต้องกรองมาก่อน — ฟังก์ชันนี้แยก bucket เอง)
 */
export function buildLineExport(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const scheduled = list.filter((e) => e.bucket === "scheduled" && e.scheduled_date);
  const afterJr = list.filter((e) => e.bucket === "after_jr");
  const depositWait = list.filter((e) => e.bucket === "deposit_wait");

  const sections = [...buildMonthSections(scheduled)];
  if (afterJr.length) sections.push(buildBucketSection("งานที่รอต่อหลังJRเสร็จ", afterJr));
  if (depositWait.length) sections.push(buildBucketSection("ลูกค้ามัดจำมาแล้ว รอลงคิว", depositWait));

  return sections.join("\n\n\n");
}
