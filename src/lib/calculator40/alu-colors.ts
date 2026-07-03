// alu-colors.ts — จานสีอลูมิเนียมเต็ม (พาริตี้ R3.9 13 สี) สำหรับคิดราคา 4.0
// ─────────────────────────────────────────────────────────────
// R4.0 คิดค่าอบตาม "หมวดค่าอบ" (BAKE key: white/sahara/special/woodSpecial/woodStock)
// แต่ผู้ใช้ควรเลือก "ชื่อสีจริง" ได้ครบเหมือน R3.9 → แต่ละสี map ไปหมวดค่าอบที่ถูกต้อง
//   • bake = หมวดค่าอบ (ราคา) · label = ชื่อสีพิมพ์ลงใบ (colorName)
//   • สีที่ยังไม่มีทุน R4.0 เฉพาะ (เช่น สีชุบ) → ใช้เรตใกล้เคียง + note รีมาร์ค (รอถอดทุน)
export type AluColor = { key: string; label: string; bake: string; note?: string };

export const ALU_COLORS: AluColor[] = [
  { key: "white", label: "อบขาว", bake: "white" },
  { key: "black", label: "อบดำ", bake: "white" },
  { key: "sahara", label: "เทาซาฮาร่า", bake: "sahara" },
  { key: "sahara_black", label: "ดำซาฮาร่า", bake: "sahara" },
  { key: "aztec", label: "Aztec Gray", bake: "special", note: "Aztec — L=สต็อก · M/S=อบพิเศษ (ราคา R3.9 อ้างอิงอบพิเศษ · รอถอดทุน 4.0)" },
  { key: "wood_teak", label: "ลายไม้ สักทอง", bake: "woodStock" },
  { key: "wood_maho", label: "ลายไม้ มะฮอกกานี", bake: "woodStock" },
  { key: "wood_whiteoak", label: "ลายไม้ ไวท์โอ๊ค", bake: "woodStock" },
  { key: "wood_fuji_oak", label: "ลายไม้อบพิเศษ Fuji Oak", bake: "woodSpecial" },
  { key: "wood_fuji_makha", label: "ลายไม้อบพิเศษ Fuji Makha", bake: "woodSpecial" },
  { key: "special", label: "สีอบพิเศษ (ระบุรหัส)", bake: "special" },
  { key: "wood_special", label: "ลายไม้อบพิเศษ (ระบุรหัส)", bake: "woodSpecial" },
  { key: "plated", label: "สีชุบ", bake: "special", note: "สีชุบ — R3.9 ขั้นต่ำ 16,000 · ต้องให้ลูกค้าเห็นตัวอย่างจริง + ถ่ายรูปยืนยัน · ราคา R3.9 รอถอดทุน 4.0" },
];

const BY_KEY: Record<string, AluColor> = Object.fromEntries(ALU_COLORS.map((c) => [c.key, c]));

// รับได้ทั้ง key ใหม่ (wood_teak) และ bake key เดิม (white/sahara/…) — ให้เข้ากันย้อนหลัง
export function resolveAluColor(key: string): AluColor {
  return BY_KEY[key] || { key, label: key, bake: key };
}

export const ALU_COLOR_LABEL: Record<string, string> = Object.fromEntries(ALU_COLORS.map((c) => [c.key, c.label]));
export const ALU_COLOR_KEYS: string[] = ALU_COLORS.map((c) => c.key);
