// OPTION ในข้อใบเสนอ — "ข้อความล้วน ไม่รวมยอด" วางในช่องรายละเอียด ก่อนหัวข้อ หมายเหตุ/รายละเอียดงาน
// เจ้าของเคาะ 22 ก.ค.69 · 3 แบบ:
//   add   = เพิ่มราคา    → "ราคาเพิ่ม X บาท"
//   reduce= ลดราคา       → "ราคาลดลง X บาท"
//   set   = เปลี่ยนราคา  → "ราคา X บาท" (เปลี่ยนรูปแบบไปเลย · ราคาใหม่ทั้งข้อ)
// ⚠ ไม่แตะยอดรวม/VAT — เป็นแค่ข้อความในช่อง detail (ไหลผ่าน Zod/RPC เดิมได้ ไม่ต้อง migrate)

export type OptionMode = "add" | "reduce" | "set";

export const OPTION_MODES: { value: OptionMode; label: string; hint: string }[] = [
  { value: "add", label: "เพิ่มราคา", hint: "ราคาเพิ่ม X บาท" },
  { value: "reduce", label: "ลดราคา", hint: "ราคาลดลง X บาท" },
  { value: "set", label: "เปลี่ยนราคา", hint: "ราคา X บาท (เปลี่ยนรูปแบบ)" },
];

// prefix อัตโนมัติ "หากลูกค้าต้องการ..." — ข้ามถ้าผู้ใช้พิมพ์ขึ้นต้น "หาก" มาเอง (พิมพ์เต็มเองได้)
const PREFIX: Record<OptionMode, string> = {
  add: "หากลูกค้าต้องการเพิ่ม",
  reduce: "หากลูกค้าต้องการเปลี่ยนเป็น",
  set: "หากลูกค้าต้องการเปลี่ยนเป็น",
};

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");

export function buildOptionBody(mode: OptionMode, desc: string, amount: number): string {
  const d = desc.trim();
  const body = /^หาก/.test(d) ? d : `${PREFIX[mode]} ${d}`;
  const price =
    mode === "add" ? `ราคาเพิ่ม ${fmt(amount)} บาท`
      : mode === "reduce" ? `ราคาลดลง ${fmt(amount)} บาท`
        : `ราคา ${fmt(amount)} บาท`;
  return `${body} ${price}`;
}

const isOptionLine = (l: string) => /^\s*OPTION\b/i.test(l);
const HEADINGS = ["หมายเหตุ", "รายละเอียดงาน", "เงื่อนไข", "สเปก", "รายละเอียด"];
const isHeadingLine = (l: string) => {
  const t = l.trim().replace(/^#/, "").replace(/[:：]\s*$/, "").trim();
  return HEADINGS.includes(t);
};

export function countOptions(detail: string): number {
  return (detail || "").split("\n").filter(isOptionLine).length;
}

// เติมบรรทัด "OPTION (n) : ..." — เลข n อัตโนมัติ
// ตำแหน่ง: ต่อจาก OPTION เดิม (ถ้ามี) → ไม่งั้นก่อนหัวข้อแรก (หมายเหตุ/รายละเอียดงาน) → ไม่งั้นท้ายสุด
export function insertOption(detail: string, mode: OptionMode, desc: string, amount: number): string {
  const no = countOptions(detail) + 1;
  const line = `OPTION (${no}) : ${buildOptionBody(mode, desc, amount)}`;
  const lines = detail ? detail.split("\n") : [];
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) { if (isOptionLine(lines[i])) { idx = i + 1; break; } }
  if (idx === -1) {
    const h = lines.findIndex(isHeadingLine);
    idx = h === -1 ? lines.length : h;
  }
  lines.splice(idx, 0, line);
  return lines.join("\n");
}
