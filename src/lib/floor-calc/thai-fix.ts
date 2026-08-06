/**
 * แก้คำผิดในใบเสนอราคาที่ผู้รับเหมาพิมพ์มา
 *
 * หลักการ: **ไม่แก้เงียบ ๆ** — คืนรายการ "แก้อะไรเป็นอะไร" กลับไปให้หน้าจอโชว์ กดยกเลิกรายคำได้
 * (ช่างเป็นผู้ใหญ่ พิมพ์ตกหล่นบ่อย แต่บางคำเป็นชื่อเฉพาะ/สเปคที่เราไม่ควรเดาแทน)
 *
 * คำในตารางนี้เก็บจากใบจริงของช่างเพยาว์ 4 ใบ (คุณนฤมิตร · คุณกาญจนา · คุณภวพร · คุณพิทยารัตน์)
 */

/** label = ข้อความที่โชว์ในรายการ "แก้อะไร" (ถ้าไม่ใส่ = ใช้คำที่เจอจริง) */
type Rule = { from: RegExp; to: string; why: string; label?: [string, string] };

/** คำที่มั่นใจ — แก้อัตโนมัติ (ติ๊กมาให้แล้ว แต่ยกเลิกได้) */
const SURE: Rule[] = [
  // สะกดผิดที่เจอซ้ำ ๆ
  { from: /ลื้อ/g, to: "รื้อ", why: "รื้อ (ไม่ใช่ ลื้อ)" },
  { from: /รื้อ(?:\s*รื้อ)+/g, to: "รื้อ", why: "ตัดคำซ้ำ (พิมพ์ ‘ลื้อลื้อ’ ติดกัน)", label: ["รื้อรื้อ", "รื้อ"] },
  { from: /บันใด/g, to: "บันได", why: "บันได" },
  { from: /เทฟรุตติ้ง|ฟรุตติ้ง/g, to: "ฟุตติ้ง", why: "ฟุตติ้ง (footing)" },
  { from: /ววด/g, to: "งวด", why: "งวด" },
  { from: /บริเณ/g, to: "บริเวณ", why: "บริเวณ" },
  { from: /ปะปา/g, to: "ประปา", why: "ประปา" },
  { from: /ฉาลเรียบ/g, to: "ฉาบเรียบ", why: "ฉาบเรียบ" },
  { from: /คิบปูน/g, to: "คิ้วปูน", why: "คิ้วปูน" },
  { from: /จะคิด\s*ป็น/g, to: "จะคิดเป็น", why: "เป็น (ตก ‘เ’)" },
  { from: /ใบเสนาราคา/g, to: "ใบเสนอราคา", why: "ใบเสนอราคา" },
  { from: /ชัยพฤก์/g, to: "ชัยพฤกษ์", why: "ชัยพฤกษ์" },

  // ทับศัพท์ช่าง
  { from: /ดาว์นไลท์|ดาว์ไลท์|ดาว์ลท์|ดาวไลท์/g, to: "ดาวน์ไลท์", why: "ดาวน์ไลท์ (downlight)" },
  { from: /สวิทย์|สวิทช์|สวิท(?![ยช])/g, to: "สวิตช์", why: "สวิตช์ (switch)" },
  { from: /สมาทร์บรอด์|สมาทร์บอร์ด|สมาร์ทบรอด์|สมาทบอร์ด/g, to: "สมาร์ทบอร์ด", why: "สมาร์ทบอร์ด (SmartBoard)" },
  { from: /กัมวาในย์|กัลวาไนท์|กันวาไนซ์/g, to: "กัลวาไนซ์", why: "กัลวาไนซ์ (galvanized)" },
  { from: /จั้ม(?=ไฟ)/g, to: "จั๊ม", why: "จั๊ม (jump)", label: ["จั้มไฟ", "จั๊มไฟ"] },
  { from: /พนานา(สี|โซ)?/g, to: "พานาโซนิค", why: "พานาโซนิค (Panasonic)", label: ["พนานา", "พานาโซนิค"] },

  // หน่วย/รูปแบบ
  { from: /ตร\.ม(?!\.)/g, to: "ตร.ม.", why: "ตร.ม. (ใส่จุดท้าย)" },
  { from: /(\d)\s*มิล(?![ลิ])/g, to: "$1 มม.", why: "มม. (มิลลิเมตร)", label: ["มิล", "มม."] },
  { from: /(\d)\s*cm\.?/gi, to: "$1 ซม.", why: "ซม. (เซนติเมตร)", label: ["cm", "ซม."] },
  { from: /(\d)\s*mm\.?/gi, to: "$1 มม.", why: "มม. (มิลลิเมตร)", label: ["mm", "มม."] },
  { from: /\brb(?=\d)/gi, to: "RB", why: "RB ตัวพิมพ์ใหญ่ (เหล็กกลม)", label: ["rb9", "RB9"] },
  { from: /\bdb(?=\d)/gi, to: "DB", why: "DB ตัวพิมพ์ใหญ่ (เหล็กข้ออ้อย)", label: ["db12", "DB12"] },
];

/** คำที่ "น่าจะผิด" แต่เป็นชื่อเฉพาะ/สเปค — เสนอแต่ไม่ติ๊กให้ ต้องกดเอง */
const SUGGEST: Rule[] = [
  { from: /ใวฮอลลพ์|ไวฮอลลพ์/g, to: "ไวฮอลล์", why: "ชื่อโครงการ — เดาว่า ‘ไวฮอลล์’ ตรวจกับลูกค้าก่อน" },
  { from: /เจอาร์/g, to: "JR", why: "ชื่อบริษัท — ใช้ JR ตัวอังกฤษให้ตรงกับเอกสารอื่น" },
  { from: /\bjr\b/g, to: "JR", why: "JR ตัวพิมพ์ใหญ่" },
];

export type FixChange = {
  from: string;
  to: string;
  why: string;
  /** true = มั่นใจ ติ๊กมาให้เลย · false = แค่เสนอ ต้องกดเอง */
  sure: boolean;
};

export type FixResult = { text: string; changes: FixChange[] };

/**
 * แก้คำในข้อความหนึ่งก้อน
 * @param applySuggest true = ใช้กฎกลุ่ม "เสนอ" ด้วย (ปกติ false — หน้าจอให้ผู้ใช้ติ๊กเอง)
 */
export function fixThai(input: string, applySuggest = false): FixResult {
  let text = String(input ?? "");
  const changes: FixChange[] = [];

  const run = (rules: Rule[], sure: boolean, apply: boolean) => {
    for (const r of rules) {
      const hits = text.match(r.from);
      if (!hits?.length) continue;
      // label = ข้อความอธิบายที่เขียนไว้เอง (กฎที่มี lookahead/กลุ่มจับ แสดงผลเองแล้วงง)
      const [before, after] = r.label ?? (() => {
        const b = [...new Set(hits)].join(" / ");
        return [b, b.replace(r.from, r.to)];
      })();
      changes.push({ from: before, to: after, why: r.why, sure });
      if (apply) text = text.replace(r.from, r.to);
    }
  };
  run(SURE, true, true);
  run(SUGGEST, false, applySuggest);

  // จัดช่องไฟ: ตัดเว้นวรรคซ้ำ/หัวท้าย (ไม่นับเป็น "แก้คำ" — ไม่ต้องรายงาน)
  text = text.replace(/[ \t ]+/g, " ").replace(/\s*·\s*/g, " · ").trim();
  return { text, changes };
}

/** แก้ทั้งชุดรายการ — คืนข้อความใหม่ + สรุปการแก้ทั้งใบ (ไม่ซ้ำคำ) */
export function fixAll(texts: string[], applySuggest = false): { texts: string[]; changes: FixChange[] } {
  const out: string[] = [];
  const seen = new Map<string, FixChange>();
  for (const t of texts) {
    const r = fixThai(t, applySuggest);
    out.push(r.text);
    for (const c of r.changes) {
      const key = `${c.from}→${c.to}`;
      if (!seen.has(key)) seen.set(key, c);
    }
  }
  return { texts: out, changes: [...seen.values()] };
}
