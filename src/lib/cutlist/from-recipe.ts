/**
 * cutlist/from-recipe — แปลง "สูตรคิดราคา" (calc_recipe 0093) ของข้อในใบเสนอ → อินพุตใบตัด
 * ใช้ตอนสร้างใบตัดจากงานลูกค้า: ดึงข้อจากใบเสนอ → ข้อไหน map ได้ = ตั้งต้นให้อัตโนมัติ
 * ข้อไหน map ไม่ได้ (รุ่นยังไม่มีสูตรตัด / G6 ห้องกระจก / ข้อพิมพ์มือ) → ข้าม + รายงานชื่อข้อ
 *
 * ขยายรุ่น: เพิ่ม case ใน switch ให้ตรง spec_id ใน products.ts (พอร์ตจาก Excel "ตัดประกอบ")
 */
import { CUT_SPEC_BY_ID, GATE_BOX_FROM_CALC } from "./products.ts";
import type { CutInput } from "./engine.ts";
import { calcColorToStock } from "./stock-match.ts";
// ค่าตั้งต้นรายด้านของหลังคาหลายด้าน — ดึงจากฝั่งคิดราคา แหล่งเดียว ห้ามพิมพ์ซ้ำสองที่
import { MULTI_SIDE_DEF } from "../calculator40/products.mjs";

// multiplier = ตัวคูณจำนวนชุด (เช่น Velora: ใบตัด 1 บาน/ชุด แต่ใบเสนอสั่ง N บาน → sets ×N) — ผู้เรียกต้องคูณเข้า sets
export type RecipeCutMap = { spec_id: string; input: Partial<CutInput> & Record<string, unknown>; multiplier?: number };

// ดึงความหนากระจก (มม.) จากชื่อกระจกในใบเสนอ เช่น "เทมเปอร์ใส 10มม." → 10 (ไม่เจอ = 6)
const glassMm = (s: unknown): number => {
  const m = /(\d+)\s*มม/.exec(String(s ?? ""));
  return m ? Number(m[1]) : 6;
};

// opts.rawCompare = อนุญาต "รุ่นดิบ" ที่ยังไม่ยกเครื่อง BOM (กันสาด/roof) ให้ map ได้ — ใช้เฉพาะหน้าเทียบ (read-only)
//   ⚠ /api/cutlists (สร้างใบตัดจริง → หักสต็อก) ห้ามส่ง rawCompare → กันสาดจะตกไป skipped ให้ช่างกรอกเอง
//   (โมเดลราคา↔ใบตัดกันสาดยังคนละแบบ + หลังคาหลายช่วง roofSegs ยังไม่ถูกอ่าน → auto-seed = ตัดสต็อกผิดเงียบ)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cutInputFromRecipe(recipe: any, opts?: { rawCompare?: boolean }): RecipeCutMap | null {
  if (!recipe || recipe.kind !== "std") return null; // room (G6) แตกเป็นบานย่อยจาก recipe รวมไม่ได้ — เฟสถัดไป
  const W = Number(recipe.w) || 0;
  const H = Number(recipe.h) || 0;
  const N = Math.max(1, Number(recipe.p) || 1);
  if (W <= 0 || H <= 0) return null;

  // ── มุ้งบวกบาน: ฝั่งคิดราคาเก็บไว้ใน addons (mosquito = none/small/big/pleat/honey/roll) ──
  //   เดิมไม่ได้ส่งต่อเลย → ใบตัดที่ออกให้ช่าง "ไม่มีเส้นมุ้ง" ทั้งที่ลูกค้าสั่งมุ้ง (เจ้าของท้วง 3 ก.ย.69)
  //   เฟรมเล็ก/เฟรมใหญ่ = มุ้งที่ต้องตัดเส้นเอง → ส่งเข้าใบตัด
  //   จีบ/รังผึ้ง/ม้วน = ของสำเร็จรูป สั่งมาทั้งชุด ไม่มีอะไรต้องตัด → ไม่ส่ง
  const mq = String(recipe.addons?.mosquito ?? "none");
  const meshKind = mq === "small" ? "เฟรมเล็ก" : mq === "big" ? "เฟรมใหญ่" : "ไม่มี";
  const meshCount = Math.max(1, Number(recipe.addons?.mqPanels) || 1);

  let m: RecipeCutMap | null = null;
  switch (String(recipe.prodId)) {
    case "sms_slide": {
      // ราง: คิดราคาใช้ "รางกันน้ำ/รางเตี้ย (งานใน)" → ใบตัดใช้ "3รางเสียบ/รางเตี้ย7มม"
      const rail = recipe.spec?.bottomrail === "รางเตี้ย (งานใน)" ? "รางเตี้ย7มม" : "3รางเสียบ";
      const form = String(recipe.form ?? "");
      const mesh = { mesh: meshKind, meshCount };
      if (form === "ลากจูง") m = { spec_id: "sms_slide_tow", input: { W, H, N, rail, honk: false, ...mesh } };
      else if (form === "เปิดคู่กลาง") {
        // สูตรใบตัด Excel เปิดคู่กลาง = คงที่ 4 บานเท่านั้น (QA HIGH: N อื่นคำนวณผิดเงียบ)
        // N ≠ 4 → ไม่ map (เข้า skipped ให้ผู้ใช้กรอกมือ) — ห้ามฝืนคิดผิด
        m = N === 4 ? { spec_id: "sms_slide_center", input: { W, H, N: 4, rail, honk: false, ...mesh } } : null;
      }
      else m = { spec_id: "sms_slide_free", input: { W, H, N, rail, honk: false, ...mesh } }; // อิสระ/สลับ
      break;
    }
    case "euro_slide": {
      // บานเลื่อน ยูโร = FUJI (โปรไฟล์ F#### ยี่ห้อ Fuji) — ใบตัดอยู่ไฟล์ JR_FUJI_บานเลื่อน.xlsx
      //   ราง: คิดราคาใช้ "รางกันน้ำ / รางเตี้ย (งานใน)" → ใบตัดใช้ตัวเลือก "งาน" ภายนอก/ภายใน
      //   จำนวนราง = จำนวนบาน (ชีต "เลื่อนสลับ" = 2 บาน · "เลื่อน3ราง" = 3 บาน)
      const work = String(recipe.spec?.bottomrail ?? "").includes("รางเตี้ย") ? "ภายใน" : "ภายนอก";
      const form = String(recipe.form ?? "");
      if (form === "เปิดคู่กลาง") {
        // ไฟล์มี 2 ชีต: "เลื่อนแบ่ง4" (4 บาน) และ "เลื่อนแบ่ง6-กลาง" (6 บาน) — บานอื่นไม่มีสูตร
        m = (N === 4 || N === 6) ? { spec_id: "fuji_slide_center", input: { W, H, N, work, glass: glassMm(recipe.glassType) } } : null;
      } else if (form === "ลากจูง") {
        m = null;   // ⚠ ไฟล์ใบตัด FUJI ยังไม่มีชีต "ลากจูง" — รอเจ้าของส่งสูตร (ห้ามเดา)
      } else {
        // อิสระ/สลับ (เจ้าของเคาะ 20 ส.ค.69)
        // 2-3 บาน = เฟรมชุดเดียว · ใช้เฟรม "3 ราง" (F7976/F7978) เป็นหลัก
        //   ไฟล์มีชีต "เลื่อนสลับ2ราง" (F7977/F7979) ด้วย — ไม่เอาเข้าระบบ กันเลือกผิด
        // 4-5 บาน = เฟรม 2 ชุดต่อกัน (ชีต "เลื่อน4 (2)" / "เลื่อน5") — งานนอกเท่านั้น
        //   งานใน 4/5 บาน = เจ้าของตัดออก ไม่รับงาน (ต้องสั่งโปรไฟล์เพิ่มเยอะเกิน)
        // มุ้ง: ไฟล์มีชีตมุ้งเฉพาะ "สลับ 2 บาน" (นอก/ใน) → 3 บานขึ้นไปไม่ส่งมุ้ง (ไม่มีสูตร ห้ามเดา)
        if (N === 2 || N === 3) m = { spec_id: "fuji_slide", input: { W, H, N, rail: `${N}ราง`, work, glass: glassMm(recipe.glassType), honk: false,
          mesh: (N === 2 && meshKind !== "ไม่มี") ? "มี" : "ไม่มี" } };
        else if ((N === 4 || N === 5) && work === "ภายนอก") m = { spec_id: "fuji_slide_multi", input: { W, H, N, glass: glassMm(recipe.glassType) } };
        else m = null;
      }
      break;
    }
    case "slimlux": {
      // รูปแบบบาน: คิดราคา form อิสระ/สลับ/ลากจูง/เปิดคู่กลาง → ใบตัด sashMode (สลับ ≈ อิสระ)
      const form = String(recipe.form ?? "");
      const sashMode = form === "ลากจูง" ? "ลากจูง" : form === "เปิดคู่กลาง" ? "เปิดคู่กลาง" : "อิสระ";
      // มือจับ: คิดราคาเลือกที่ spec.slxhandle → ส่งต่อเข้าใบตัด (เดิมล็อก "X-J" ตายตัว = สองฝั่งไม่ตรงกัน)
      const slx = String(recipe.spec?.slxhandle ?? "");
      const handle = slx === "X-J" ? "X-J" : slx.includes("ลูกค้าเตรียม") ? "ไม่มี" : "มือจับล็อค";
      m = { spec_id: "slimlux_slide", input: {
        W, H, N, sashMode, fit: "ยัดในช่อง", beam: "1×4", receiverBox: "1×3", handle,
        handleColor: recipe.spec?.slxhwcolor === "ดำ" ? "ดำ" : "ขาว",
      } };
      break;
    }
    case "fixed": {
      // จำนวนบาน (p) ≈ จำนวนช่อง n ของใบตัด
      m = { spec_id: "fixed_panel", input: { W, H, N, box: "กล่อง 1.6×3 + 9014" } };
      break;
    }
    case "folding": {
      // ⚠ แก้ 21 ส.ค.69: "บานเฟี้ยม" ในคิดราคา = ตระกูล SMS 240 (รหัส B24xxx) ไม่ใช่ยูโร
      //   เดิมส่งไปเทียบกับสูตรเฟี้ยมยูโร (F79xx) → หน้าเทียบขึ้น "ไม่ตรง" ทั้งแผงทุกรูปแบบ
      //   ทั้งที่เป็นคนละตระกูลกันตั้งแต่ต้น (เจ้าของเจอเอง: ไม่ตรงสักบาน)
      //   fold2 = แบ่งบาน/เดี่ยว ตามชีต HOMELIFE — รูปแบบ "เปิดกลาง" = แบ่งบาน
      //   ⚠ ชีต SMS 240 คิดจำนวนท่อน/อุปกรณ์จาก "config พับ" (xLyR) ไม่ใช่ N
      //     ไม่ส่ง rail = ใช้ค่าตั้งต้น 2L2R (4 บาน) → เพี้ยนทุกเคสที่ไม่ใช่ 4 บาน
      //     ชื่อรูปแบบในคิดราคาเขียน "(2-0)" / "(3-1)" ท้ายชื่อ → แปลงเป็น 2L0R / 3L1R
      const f = String(recipe.form ?? "");
      const lr = /\((\d+)\s*-\s*(\d+)\)/.exec(f);
      const rail = lr ? `${lr[1]}L${lr[2]}R` : `${N}L0R`;
      m = { spec_id: "sms240_bifold", input: { W, H, N, rail, fold2: /เปิดกลาง/.test(f) ? "แบ่งบาน" : "เดี่ยว", glass: glassMm(recipe.glassType), honk: false } };
      break;
    }
    case "fold_euro": {
      // บานเฟี้ยม ยูโร (F79xx) → ชีตเฟี้ยมยูโร 45°
      // ⚠ L (บานพับซ้าย) ต้องอ่านจาก "ชื่อรูปแบบ" — แหล่งเดียวกับที่คิดราคาใช้
      //   เดิมอ่านจาก spec.folddir ที่ปกติไม่ได้ตั้ง → ได้ L=N (รวบชนผนัง) ทุกเคส
      //   ทำให้บานพับ/ชนกลาง/บังใบ เพี้ยนเมื่อเลือก "เปิดกลาง" (เจ้าของเจอ 21 ส.ค.69)
      const ff = String(recipe.form ?? "");
      const lr2 = /\((\d+)\s*-\s*(\d+)\)/.exec(ff);
      const dir = String(recipe.spec?.folddir ?? "");
      const L = lr2 ? Number(lr2[1])
        : dir === "เปิดขวา" ? 0 : dir === "แยกกลาง" ? Math.ceil(N / 2) : N;
      const rail = recipe.spec?.threshf === "รางยู" ? "รางยู" : "เฟรมล่าง";
      m = { spec_id: "euro_bifold", input: { W, H, N, L, rail, glass: glassMm(recipe.glassType) } };
      break;
    }
    case "fold_lift": {
      // บานเฟี้ยมยก (พับขึ้น) — ชีต euro_lift ล็อก 2 บาน · บานอื่นยังไม่มีสูตร
      m = N === 2 ? { spec_id: "euro_lift", input: { W, H, N: 2, glass: glassMm(recipe.glassType) } } : null;
      break;
    }
    case "velora": {
      // Velora ใบตัด = 1 บาน/ชุด → W ต่อบาน (W รวม ÷ N) + multiplier = N (ผู้เรียกคูณเข้า sets — QA HIGH: เดิมได้ 1 บานทั้งที่สั่ง N)
      m = { spec_id: "velora_swing", input: { W: N > 1 ? Math.round((W / N) * 10) / 10 : W, H, N: 1, rail: "ยัดในช่อง" }, multiplier: N };
      break;
    }
    case "bansolid": {
      // บานโซลิด — ใบตัด solid_door (แม่-ลูก/เท่ากัน) · คิดราคาแบ่งบาน "เท่ากัน" ทุกบรรทัด (สูตรใช้ W/P)
      //   จึงส่ง doorSplit=เท่ากัน + บานแม่ = W/N ให้สองฝั่งวัดของชิ้นเดียวกัน (ไม่ใช่ค่าตั้งต้น 80 ในใบตัด)
      //   ตัวเลือกที่คิดราคาไม่มี (สีอุปกรณ์/ตลับกุญแจ/ทิศเปิด/มือจับ) เลือกได้ที่ฝั่งใบตัดในหน้าเทียบ
      m = { spec_id: "solid_door", input: {
        W, H, N,
        sill: String(recipe.form ?? "") === "ไม่มีธรณี" ? "ไม่มี" : "มี",
        doorSplit: "เท่ากัน",
        motherW: Math.round((W / Math.max(1, N)) * 10) / 10,
      } };
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
      // ประตูรั้ว รื้อใหม่ 24 ส.ค.69 — คิดราคาเก็บตัวเลือกครบตามไฟล์แล้ว ส่งต่อใบตัดทั้งชุด
      //   material = กล่องใบระแนง A ("1x1.6") · ใบตัดใช้รูป "1×1.6" → แปลงเครื่องหมายให้ตรง
      const gBox = (v: unknown, fb: string) => GATE_BOX_FROM_CALC[String(v ?? fb)] ?? GATE_BOX_FROM_CALC[fb];
      const gFace = (v: unknown) => ({ "1": "1 cm", "5": "5 cm", "2.54": '1"', "3.81": '1½"', "4.06": '1.6"', "10.16": '4"' })[String(v ?? "4.06")] ?? '1.6"';
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      m = { spec_id: "gate_slide", input: {
        W, H, N: 1,
        slatDir: String(recipe.form ?? "") === "ตั้ง" ? "ตั้ง" : "นอน",
        slatType: String(sp.gslat ?? "") === "ระแนงสลับ" ? "ระแนงสลับ" : "ระแนง",
        fit: String(sp.gfit ?? "") === "แปะนอก" ? "แปะนอก" : "ยัดใน",
        boxA: gBox(recipe.material, "1x1.6"),
        boxB: gBox(sp.gboxB ?? recipe.material, "1x1.6"),
        showA: gFace(sp.rnFace), showB: gFace(sp.gfaceB ?? sp.rnFace),
        gap: Number(sp.rnGap ?? 5) || 5,
        aRun: Number(sp.gaRun ?? 3) || 3, bRun: Number(sp.gbRun ?? 5) || 5,
        gateDrive: String(sp.drive ?? "").includes("มือผลัก") ? "มือผลัก" : "มอเตอร์",
        gateRemote: Number(sp.gremote ?? 0) || 0,
      } };
      break;
    }
    case "roof": {
      if (!opts?.rawCompare) { m = null; break; }   // งานจริง (/api/cutlists) = skip ให้ช่างกรอกเอง · เฉพาะหน้าเทียบเท่านั้นที่ map
      // กันสาด (หลังคาเพิง) — ดึงเข้าหน้าเทียบใบตัด (เจ้าของสั่ง 26 ส.ค.69 "ดึงขึ้นก่อน")
      //   27 ส.ค.69 ยกเครื่อง BOM คิดราคาเสร็จ → โครงตรงใบตัดทุกชิ้น (scripts/verify-roof.mjs)
      //   ยังไม่เปิด map ให้ใบตัดงานจริง — ช่างกรอกเอง (ปลายหลังคา/จันทันกรอกมือ ยังไม่มีในคิดราคา)
      //   หน่วย: คิดราคา W=กว้าง · H=ยื่น/ลึก (ซม.) → awning W / P
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      const mat = String(recipe.material ?? "ไวนิล");
      // วัสดุมุงคิดราคา (18 ชนิด) → ชนิดแผ่นใบตัด (6 ชนิด) · กระจก/ชินโคร์รุ่นย่อย ยังไม่มีในใบตัด → fallback
      const sheet = mat.startsWith("เมทัล") ? "เมทัลชีท"
        : mat === "ชินโคร์ Sup" ? "ชินโคร์ Sup"
        : mat.startsWith("ชินโคร์") ? "ชินโคร์ HC"
        : (mat === "ไวนิล" || mat === "ดีไลท์" || mat === "โพลีตัน") ? mat
        : "ไวนิล";   // กระจก/อื่นๆ ยังไม่มีชนิดแผ่นในใบตัด → ไวนิล (ช่างปรับเอง)
      m = { spec_id: "awning", input: {
        W, H: 0, N: 1, P: H, deg: 7,
        // ค่าตั้งต้นต้องตรงกับ specOpts.batten ของรุ่น roof (= แปเดี่ยว) ไม่งั้นหน้าเทียบเพี้ยนตอนยังไม่ได้เลือก
        sheet, purlin: sp.batten === "แปคู่" ? "แปคู่" : "แปเดี่ยว",
        // ปลายหลังคาตามที่เลือกในคิดราคา (ค่าตั้งต้นในไฟล์ = ยื่นปลาย ทุน 0)
        //   เดิมตรึง "รางน้ำ" → ใบตัดมีรางน้ำเสมอ แต่คิดราคาไม่มี = หน้าเทียบขึ้นแดงลอย ๆ
        roofEnd: (() => { const e = String(recipe.spec?.roofend ?? "ยื่นปลาย"); return e === "รางน้ำอลู" ? "รางน้ำ" : (e === "ปิดปลาย" ? "ปิดปลาย" : "ยื่นปลาย"); })(), rakeTotal: 0,
      } };
      break;
    }
    case "roof_gable": {
      if (!opts?.rawCompare) { m = null; break; }   // งานจริงให้ช่างกรอกเอง เหมือน roof
      // หลังคาจั่ว → ใบตัด gable_straight · หน่วย: คิดราคา W=กว้าง(สแปน) · H=ลึก/ยื่น → D
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      const mat = String(recipe.material ?? "ไวนิล");
      const sheet = mat.startsWith("เมทัล") ? "เมทัลชีท"
        : mat === "ชินโคร์ Sup" ? "ชินโคร์ Sup"
        : mat.startsWith("ชินโคร์") ? "ชินโคร์ HC"
        : (mat === "ไวนิล" || mat === "ดีไลท์" || mat === "โพลีตัน") ? mat
        : "ไวนิล";   // กระจก/อื่นๆ ยังไม่มีชนิดแผ่นในใบตัด → ไวนิล (ช่างปรับเอง)
      const ridge = Number(sp.ridge);
      m = { spec_id: "gable_straight", input: {
        W, H: 0, N: 1, D: H, ridgeH: ridge > 0 ? ridge : 150,   // ค่าตั้งต้นต้องตรง specOpts.ridge (=150)
        sheet, purlin: sp.batten === "แปเดี่ยว" ? "แปเดี่ยว" : "แปคู่",
        roofEnd: sp.roofend === "ปล่อยปลาย" ? "ปล่อยปลาย" : "รางน้ำ",
      } };
      break;
    }
    // บานเลื่อนรางบน (Hafele) — คิดราคาไม่มี BOM ของตัวเองเลย (alu 0 บรรทัด) ของทั้งชุดดึงจากใบตัด
    case "topslide": {
      if (!opts?.rawCompare) { m = null; break; }   // ⏳ ยังไม่เปิดใช้กับงานจริง (รอ JR00558 ตั้งราคา)
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      m = { spec_id: "toprail_frame", input: {
        W, H, N,
        sys: sp.sys === "ยูโร" ? "ยูโร" : "SMS",
        sashMode: sp.sashmode === "ลากจูง" ? "ลากจูง" : sp.sashmode === "เปิดคู่กลาง" ? "เปิดคู่กลาง" : "อิสระ",
        fit: sp.fit === "แปะนอกชนผนัง" ? "แปะนอกชนผนัง" : sp.fit === "แปะนอกไปต่อ" ? "แปะนอกไปต่อ" : "ยัดในช่อง",
        handle: sp.handlekind === "เมโทร" ? "เมโทร" : "ฝัง",
        beam: String(sp.beam ?? "2×4"),
      } };
      break;
    }
    // ── บานยก (FUJI HUNG) — เข้าหน้าเทียบใบตัด (เจ้าของขอ 31 ส.ค.69) ──
    //   คิดราคา W=กว้าง H=สูง (ซม.) → ใบตัด W/H ตรง ๆ · 1 ชุด = 2 บานเสมอ (N=1 ชุด)
    case "banyok": {
      if (!opts?.rawCompare) { m = null; break; }   // งานจริงให้ช่างกรอกเอง
      const gmm = Number(String(recipe.glassType ?? "").replace(/[^0-9.]/g, "")) || 6;
      m = { spec_id: "fuji_hung", input: {
        W, H, N: 1, rail: "", honk: false,
        hungHandleColor: String(recipe.color ?? "").includes("ดำ") ? "ดำ" : "ขาว",
        glass: gmm,
      } };
      break;
    }
    // ── กลาสเฮ้าส์ เพิงตรง — คิดราคา W=กว้าง · H=ยาวทิศลาด (ยื่น) → ใบตัด W / D ──
    case "glasshouse": {
      if (!opts?.rawCompare) { m = null; break; }   // งานจริงให้ช่างกรอกเอง เหมือนหลังคาอื่น
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      const mat = String(recipe.material ?? "ไวนิล");
      const sheet = mat.startsWith("เมทัล") ? "เมทัลชีท"
        : mat === "ชินโคร์ Sup" ? "ชินโคร์ Sup"
        : mat.startsWith("ชินโคร์") ? "ชินโคร์ HC"
        : (mat === "ไวนิล" || mat === "ดีไลท์" || mat === "โพลีตัน") ? mat
        : "ไวนิล";
      const nOr = (k: string, d: number) => { const v = Number(sp[k]); return Number.isFinite(v) && v > 0 ? v : d; };
      m = { spec_id: "glasshouse", input: {
        W, H: 0, N: 1, rail: "", honk: false,
        sheet,
        D: H,                       // ยื่น/ลึก (ซม.) = ยาวทิศลาดของใบตัด
        hiH: nOr("hiH", 270),
        loH: nOr("loH", 240),
      } };
      break;
    }
    // ── หลังคาหลายด้าน 3 ทรง — ช่องกรอกรายด้านอยู่ใน spec ส่งต่อเข้าใบตัดตรง ๆ ──
    //   คิดราคาไม่มี BOM ของตัวเอง (เส้นอลูมาจากเอนจินใบตัด — ดู calculator40/alu-from-cutlist.ts)
    case "roof_multi":
    case "glasshouse_multi":
    case "gable_multi": {
      if (!opts?.rawCompare) { m = null; break; }   // งานจริงให้ช่างกรอกเอง เหมือนหลังคาอื่น
      const sp = (recipe.spec ?? {}) as Record<string, unknown>;
      const mat = String(recipe.material ?? "ไวนิล");
      const sheet = mat.startsWith("เมทัล") ? "เมทัลชีท"
        : mat === "ชินโคร์ Sup" ? "ชินโคร์ Sup"
        : mat.startsWith("ชินโคร์") ? "ชินโคร์ HC"
        : (mat === "ไวนิล" || mat === "ดีไลท์" || mat === "โพลีตัน") ? mat
        : "ไวนิล";
      const nOr = (k: string, d: number) => { const v = Number(sp[k]); return Number.isFinite(v) ? v : d; };
      const isGable = recipe.prodId === "gable_multi";
      const jointEnd = isGable ? "ติดบ้าน" : "ชนผนัง";   // ⚠ จั่วเรียก "ติดบ้าน" — ต้องตรง opts ของ CutSpec
      const sides: Record<string, unknown> = {};
      for (let i = 1; i <= 6; i++) {
        const dd = (MULTI_SIDE_DEF as Record<number, { w: number; p: number; d: number }>)[i];
        if (isGable) sides[`side${i}D`] = nOr(`side${i}D`, dd ? dd.d : 0);
        else { sides[`side${i}W`] = nOr(`side${i}W`, dd ? dd.w : 0); sides[`side${i}P`] = nOr(`side${i}P`, dd ? dd.p : 0); }
        // ค่าตั้งต้นรอยต่อต้องตรง specOpts (ด้าน 1 นูน · ที่เหลือ ชนผนัง) ไม่งั้นหน้าเทียบเพี้ยนตอนยังไม่ได้เลือก
        if (i < 6) sides[`joint${i}`] = String(sp[`joint${i}`] ?? (i === 1 ? "นูน" : jointEnd));
      }
      const end = String(sp.roofend ?? "รางน้ำ");
      m = { spec_id: recipe.prodId === "roof_multi" ? "awning_multi" : recipe.prodId, input: {
        W, H: 0, N: 1, sheet,
        purlin: sp.batten === "แปเดี่ยว" ? "แปเดี่ยว" : "แปคู่",
        roofEnd: end === "ปิดปลาย" || end === "ยื่นปลาย" ? end : "รางน้ำ",
        ...(isGable ? { ridgeH: nOr("ridge", 150) } : { hiH: nOr("hiH", 270), loH: nOr("loH", 240) }),
        ...sides,
      } };
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
