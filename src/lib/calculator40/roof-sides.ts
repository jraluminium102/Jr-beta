/**
 * roof-sides — ตรรกะล้วนของ "ด้านหลังคา" (หลังคาหลายด้าน) แยกจากคอมโพเนนต์
 * ─────────────────────────────────────────────────────────────────────────────
 * แยกออกมาเพราะ .tsx รันในสคริปต์เทสไม่ได้ (node strip types ไม่รองรับ .tsx)
 * และเพราะ "ลบด้านกลางแล้วรอยต่อต้องยุบตาม" เป็นจุดที่เคยพลาดมาก่อน ต้องมีเทสคุม
 *   → ดู scripts/verify-roof-multi.mjs ⑤
 */
export type RoofSide = { w: number; p: number };
export type RoofSidesValue = { sides: RoofSide[]; joints: string[] };

export const MAX_SIDES = 6;
export const MIN_SIDES = 2;

/** ตัดด้านที่ปลายทางยังไม่ใช้ออกจากรอยต่อ + ยุบ joints ให้ยาว = ด้าน−1 เสมอ */
export function normalizeSides(v: RoofSidesValue, jointEnd: string): RoofSidesValue {
  const sides = v.sides.slice(0, MAX_SIDES);
  const joints = Array.from({ length: Math.max(sides.length - 1, 0) }, (_, i) => v.joints[i] ?? jointEnd);
  return { sides, joints };
}

/** ลบด้าน i — รอยต่อต้องเลื่อนตาม ไม่ใช่ลบ index เดียวกันดื้อ ๆ (ไม่งั้นมุมไปโผล่ผิดที่) */
export function removeSide(v: RoofSidesValue, i: number, jointEnd: string): RoofSidesValue {
  const sides = v.sides.filter((_, k) => k !== i);
  // รอยต่อที่หายคือตัวที่ "นำหน้าด้านที่ลบ" (i-1) ถ้าลบด้านแรกให้ตัดตัวแรกแทน
  const drop = i === 0 ? 0 : i - 1;
  const joints = v.joints.filter((_, k) => k !== drop);
  return normalizeSides({ sides, joints }, jointEnd);
}

/** แบน array → คีย์ที่เครื่องคิด/ใบตัดใช้ (side1W…side6P · joint1…joint5) · ด้านที่ไม่ใช้ = 0 */
export function flattenSides(v: RoofSidesValue, kind: "wp" | "d", jointEnd: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= MAX_SIDES; i++) {
    const s = v.sides[i - 1];
    if (kind === "d") out[`side${i}D`] = String(s ? s.w : 0);
    else { out[`side${i}W`] = String(s ? s.w : 0); out[`side${i}P`] = String(s ? s.p : 0); }
    if (i < MAX_SIDES) out[`joint${i}`] = v.joints[i - 1] ?? jointEnd;
  }
  return out;
}

/** อ่านกลับจากคีย์แบน → array (ใช้ตอนโหลดสูตรเก่ากลับมาแก้) */
export function parseSides(spec: Record<string, unknown>, kind: "wp" | "d", jointEnd: string): RoofSidesValue {
  const n = (k: string) => Number(spec[k]) || 0;
  const sides: RoofSide[] = [];
  for (let i = 1; i <= MAX_SIDES; i++) {
    const w = kind === "d" ? n(`side${i}D`) : n(`side${i}W`);
    const p = kind === "d" ? 0 : n(`side${i}P`);
    if (w > 0) sides.push({ w, p });
    else if (sides.length && [...Array(MAX_SIDES - i)].some((_, k) => (kind === "d" ? n(`side${i + k + 1}D`) : n(`side${i + k + 1}W`)) > 0)) {
      sides.push({ w: 0, p: 0 });   // ด้าน 0 คั่นกลาง — เก็บไว้ให้เห็น จะได้เตือนได้ ไม่กลืนเงียบ
    }
  }
  while (sides.length < MIN_SIDES) sides.push({ w: 0, p: 0 });
  const joints = Array.from({ length: sides.length - 1 }, (_, i) => String(spec[`joint${i + 1}`] ?? jointEnd));
  return { sides, joints };
}

// ── ผังมองจากด้านบน ────────────────────────────────────────────────────────
// เดินแบบเต่า: วางด้าน 1 ไปทางขวา · "นูน" หมุน +90° (มุมยื่นออก) · "เว้า" หมุน −90°
// "ชนผนัง/ติดบ้าน" = จบโซ่ → ด้านที่เหลือขึ้นต้นโซ่ใหม่ วางแยกไว้ด้านล่าง
//   ⚠ ห้าม break ทิ้ง — ด้านหลังรอยต่อยังถูกคิดเงินอยู่ ถ้าไม่วาดจะกลายเป็น "จ่ายแต่มองไม่เห็น"
//   (เจอตอนกดเทสหน้าจริง 27 ส.ค.69: 4 ด้านคิดเงินครบ แต่ผังโชว์แค่ 2)
export type Rect = { x: number; y: number; w: number; h: number; deg: number; i: number; hip: boolean; run: number };
export function planRects(sides: RoofSide[], joints: string[], kind: "wp" | "d", depth: number): Rect[] {
  const out: Rect[] = [];
  let x = 0, y = 0, deg = 0, run = 0, maxY = 0;
  for (let i = 0; i < sides.length; i++) {
    const s = sides[i];
    const w = s.w, p = kind === "d" ? depth : s.p;
    if (!(w > 0) || !(p > 0)) continue;
    const j = joints[i] ?? "";
    out.push({ x, y, w, h: p, deg, i, hip: j === "นูน" || j === "เว้า", run });
    // เก็บขอบล่างสุดที่วาดไปแล้ว ไว้ใช้เป็นจุดเริ่มของโซ่ถัดไป
    const rad = (deg * Math.PI) / 180, c = Math.cos(rad), sn = Math.sin(rad);
    for (const [dx, dy] of [[0, 0], [w, 0], [w, p], [0, p]] as [number, number][])
      maxY = Math.max(maxY, y + dx * sn + dy * c);
    x += w * c; y += w * sn;
    if (j === "นูน") deg += 90;
    else if (j === "เว้า") deg -= 90;
    else { run++; x = 0; y = maxY + Math.max(p, 40) * 0.5; deg = 0; }   // จบโซ่ → ขึ้นโซ่ใหม่ข้างล่าง
  }
  return out;
}
