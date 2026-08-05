/**
 * DetailLines — บรรทัด "รายละเอียด" ของรายการในเอกสาร (ใบเสนอราคา/พรีวิวเครื่องคิด)
 * กติกาที่ผู้ใช้พิมพ์ได้เอง:
 *   · บรรทัดว่าง                = เว้นวรรค (ช่องไฟระหว่างกลุ่ม — เดิมโดนตัดทิ้ง ทำให้ติดกันเป็นพรืด)
 *   · หัวข้อคำที่รู้จัก          = ตัวหนา+สีแดงอัตโนมัติ (รายละเอียดงาน / หมายเหตุ / เงื่อนไข — พิมพ์เดี่ยวบรรทัด มี ":" ท้ายก็ได้)
 *   · ขึ้นต้นด้วย #              = บังคับให้เป็นหัวข้อ หนา+แดง เช่น "#สเปกเพิ่มเติม" (ตัว # ไม่พิมพ์ลงใบ)
 *   · ขึ้นต้นด้วย \             = บังคับให้เป็นข้อความธรรมดา (กันคำที่รู้จักโดนทำหนา-แดง · ตัว \ ไม่พิมพ์ลงใบ)
 *   · เว้นวรรคภายในบรรทัดคงตามที่พิมพ์ (pre-wrap)
 */

import type { Key, ReactNode } from "react";

// หัวข้อที่ทำหนา-แดงอัตโนมัติ (คำที่ในใบเสนอเป็น "หัวข้อ" เกือบตลอด · เทียบแบบตัด ":" ท้ายออก)
const AUTO_HEADINGS = new Set(["รายละเอียดงาน", "หมายเหตุ", "เงื่อนไข", "สเปก", "รายละเอียด"]);
const isAutoHeading = (s: string) => AUTO_HEADINGS.has(s.replace(/[:：]\s*$/, "").trim());

/** เรนเดอร์ "บรรทัดเดียว" ตามกติกา (หัวข้อหนา-แดง / OPTION / บรรทัดว่าง / ข้อความ) — ใช้ร่วมทั้ง DetailLines (บล็อกเดียว)
 *  และการวางแบบ "แถวละบรรทัด" ในหน้าพิมพ์ (กัน Chrome ทิ้งหน้าโล่ง/ตกขอบ — ตัดหน้าได้ทุกบรรทัด) */
export function renderDetailLine(ln: string, key: Key): ReactNode {
  const s = ln.trim();
  if (!s) return <div key={key} aria-hidden style={{ height: "0.6em" }} />; // บรรทัดว่าง = เว้นวรรค
  // บังคับข้อความธรรมดา (\ นำหน้า) — กันคำที่รู้จักโดนทำหัวข้อ
  if (s.startsWith("\\")) {
    const plain = s.slice(1);
    return <div key={key} style={{ color: "#4b5563", marginLeft: plain.startsWith("-") ? 8 : 0, whiteSpace: "pre-wrap" }}>{plain}</div>;
  }
  // OPTION (ทางเลือก · ข้อความล้วน ไม่รวมยอด) — เน้น "OPTION (n) :" ตัวหนาสีเน้น
  if (/^OPTION\b/i.test(s)) {
    const m = s.match(/^(OPTION\s*\([^)]*\)|OPTION)\s*[:：]?\s*([\s\S]*)$/i);
    const head = m ? m[1] : "OPTION";
    const rest = m ? m[2] : s.replace(/^OPTION\s*[:：]?/i, "").trim();
    return (
      <div key={key} style={{ color: "#4b5563", marginTop: 3, whiteSpace: "pre-wrap" }}>
        <span style={{ fontWeight: 700, color: "#b26a00" }}>{head} : </span>{rest}
      </div>
    );
  }
  // หัวข้อ: # นำหน้า (บังคับ) หรือคำที่รู้จักอัตโนมัติ
  const forced = s.startsWith("#");
  const label = forced ? s.slice(1).trim() : s;
  if (label && (forced || isAutoHeading(s))) {
    return <div key={key} style={{ fontWeight: 600, color: "#b3151d", marginTop: 5, whiteSpace: "pre-wrap" }}>{label}</div>;
  }
  if (forced && !label) return <div key={key} aria-hidden style={{ height: "0.6em" }} />;
  return <div key={key} style={{ color: "#4b5563", marginLeft: s.startsWith("-") ? 8 : 0, whiteSpace: "pre-wrap" }}>{s}</div>;
}

/** แยกข้อความรายละเอียดเป็นบรรทัด (สำหรับวางแบบ "แถวละบรรทัด" ในหน้าพิมพ์) */
export function detailLines(text: string): string[] {
  return text ? text.split("\n") : [];
}

export function DetailLines({ text, fontSize = 12 }: { text: string; fontSize?: number }) {
  if (!text) return null;
  return (
    <div style={{ fontSize, lineHeight: 1.5, marginTop: 2 }}>
      {text.split("\n").map((ln, i) => renderDetailLine(ln, i))}
    </div>
  );
}
