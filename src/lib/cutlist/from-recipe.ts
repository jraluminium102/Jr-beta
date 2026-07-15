/**
 * cutlist/from-recipe — แปลง "สูตรคิดราคา" (calc_recipe 0093) ของข้อในใบเสนอ → อินพุตใบตัด
 * ใช้ตอนสร้างใบตัดจากงานลูกค้า: ดึงข้อจากใบเสนอ → ข้อไหน map ได้ = ตั้งต้นให้อัตโนมัติ
 * ข้อไหน map ไม่ได้ (รุ่นยังไม่มีสูตรตัด / G6 ห้องกระจก / ข้อพิมพ์มือ) → ข้าม + รายงานชื่อข้อ
 *
 * ขยายรุ่น: เพิ่ม case ใน switch ให้ตรง spec_id ใน products.ts (พอร์ตจาก Excel "ตัดประกอบ")
 */
import { CUT_SPEC_BY_ID } from "./products";
import type { CutInput } from "./engine";
import { calcColorToStock } from "./stock-match";

// multiplier = ตัวคูณจำนวนชุด (เช่น Velora: ใบตัด 1 บาน/ชุด แต่ใบเสนอสั่ง N บาน → sets ×N) — ผู้เรียกต้องคูณเข้า sets
export type RecipeCutMap = { spec_id: string; input: Partial<CutInput> & Record<string, unknown>; multiplier?: number };

// ดึงความหนากระจก (มม.) จากชื่อกระจกในใบเสนอ เช่น "เทมเปอร์ใส 10มม." → 10 (ไม่เจอ = 6)
const glassMm = (s: unknown): number => {
  const m = /(\d+)\s*มม/.exec(String(s ?? ""));
  return m ? Number(m[1]) : 6;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cutInputFromRecipe(recipe: any): RecipeCutMap | null {
  if (!recipe || recipe.kind !== "std") return null; // room (G6) แตกเป็นบานย่อยจาก recipe รวมไม่ได้ — เฟสถัดไป
  const W = Number(recipe.w) || 0;
  const H = Number(recipe.h) || 0;
  const N = Math.max(1, Number(recipe.p) || 1);
  if (W <= 0 || H <= 0) return null;

  let m: RecipeCutMap | null = null;
  switch (String(recipe.prodId)) {
    case "sms_slide": {
      // ราง: คิดราคาใช้ "รางกันน้ำ/รางเตี้ย (งานใน)" → ใบตัดใช้ "3รางเสียบ/รางเตี้ย7มม"
      const rail = recipe.spec?.bottomrail === "รางเตี้ย (งานใน)" ? "รางเตี้ย7มม" : "3รางเสียบ";
      const form = String(recipe.form ?? "");
      if (form === "ลากจูง") m = { spec_id: "sms_slide_tow", input: { W, H, N, rail, honk: false } };
      else if (form === "เปิดคู่กลาง") {
        // สูตรใบตัด Excel เปิดคู่กลาง = คงที่ 4 บานเท่านั้น (QA HIGH: N อื่นคำนวณผิดเงียบ)
        // N ≠ 4 → ไม่ map (เข้า skipped ให้ผู้ใช้กรอกมือ) — ห้ามฝืนคิดผิด
        m = N === 4 ? { spec_id: "sms_slide_center", input: { W, H, N: 4, rail, honk: false } } : null;
      }
      else m = { spec_id: "sms_slide_free", input: { W, H, N, rail, honk: false } }; // อิสระ/สลับ
      break;
    }
    case "slimlux": {
      // รูปแบบบาน: คิดราคา form อิสระ/สลับ/ลากจูง/เปิดคู่กลาง → ใบตัด sashMode (สลับ ≈ อิสระ)
      const form = String(recipe.form ?? "");
      const sashMode = form === "ลากจูง" ? "ลากจูง" : form === "เปิดคู่กลาง" ? "เปิดคู่กลาง" : "อิสระ";
      m = { spec_id: "slimlux_slide", input: { W, H, N, sashMode, fit: "ยัดในช่อง", beam: "1×4", handle: "X-J" } };
      break;
    }
    case "fixed": {
      // จำนวนบาน (p) ≈ จำนวนช่อง n ของใบตัด
      m = { spec_id: "fixed_panel", input: { W, H, N, box: "กล่อง 1.6×3 + 9014" } };
      break;
    }
    case "folding": {
      // เฟี้ยม (calc = EURO) → เฟี้ยมยูโร 45° · ทิศพับจาก spec.folddir → จำนวนบานพับซ้าย L
      const dir = String(recipe.spec?.folddir ?? "");
      const L = dir === "เปิดขวา" ? 0 : dir === "แยกกลาง" ? Math.ceil(N / 2) : N; // เปิดซ้าย (default) = พับซ้ายทั้งหมด
      const rail = recipe.spec?.threshf === "รางยู" ? "รางยู" : "เฟรมล่าง";
      m = { spec_id: "euro_bifold", input: { W, H, N, L, rail, glass: glassMm(recipe.glassType) } };
      break;
    }
    case "velora": {
      // Velora ใบตัด = 1 บาน/ชุด → W ต่อบาน (W รวม ÷ N) + multiplier = N (ผู้เรียกคูณเข้า sets — QA HIGH: เดิมได้ 1 บานทั้งที่สั่ง N)
      m = { spec_id: "velora_swing", input: { W: N > 1 ? Math.round((W / N) * 10) / 10 : W, H, N: 1, rail: "ยัดในช่อง" }, multiplier: N };
      break;
    }
    case "pcdoor": {
      const split = String(recipe.form ?? "") === "แบ่ง 4" ? "แบ่ง 4" : "แบ่ง 2";
      const sill = recipe.spec?.pcsill === "ไม่มีธรณี" ? "ไม่มีธรณี" : "มีธรณี";
      // คิดราคาไม่มี dropdown คาน → default 1×4 (ปรับในใบตัดเองถ้าเป็น 2×4)
      m = { spec_id: "pc_door", input: { W, H, N: split === "แบ่ง 4" ? 4 : 2, split, sill, beam: "1×4" } };
      break;
    }
    case "gate": {
      // คิดราคาเก็บแค่แนวระแนง (form) — ด้านโชว์/ช่องห่าง/โหมดสลับ ต้องกรอกในใบตัดเอง
      m = { spec_id: "gate_slide", input: { W, H, N: 1, slatDir: String(recipe.form ?? "") === "ตั้ง" ? "ตั้ง" : "นอน", slatType: "ระแนง", fit: "ยัดใน" } };
      break;
    }
    // ⚠ ไม่ auto-map: open_door (บานเปิดยูโร) ใช้ดายชุดเดียวกับบานโซลิดแต่เป็น "บานกระจก" (เรขาคณิตต่าง) →
    //   จับคู่อัตโนมัติจะผิด · บานโซลิด/วงกบไม้ ให้สร้างข้อในใบตัดเอง
    default:
      m = null;
  }
  // กัน map ไป spec ที่ไม่มีจริง (พิมพ์ผิด/ยังไม่พอร์ต)
  if (m && !CUT_SPEC_BY_ID[m.spec_id]) return null;
  // ตั้งค่าสีเริ่มจากสูตร (best-effort) — token สต็อก · ผู้ใช้ปรับใน dropdown ได้ทีหลัง
  if (m) { const col = calcColorToStock(recipe.color); if (col) m.input.color = col; }
  return m;
}
