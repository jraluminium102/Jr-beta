// dump-r40-spec.mjs — dump "สเปค UI ต่อรุ่น" ของหน้า /calculator40 (Calculator40Client.tsx + AddonsSection.tsx)
// ใช้เทียบกับ mockup — replicate logic การ render จริงแบบ static (อ่านจากโค้ด component เป๊ะ ๆ ไม่เดา)
// รัน: node scripts/dump-r40-spec.mjs
/* eslint-disable */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PRODUCTS, PRODUCTS_TODO } from "../src/lib/calculator40/products.mjs";
import { applyBootstrap } from "../src/lib/calculator40/bootstrap.mjs";
import R39DATA from "../src/lib/calculator40/r39-data.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH =
  "C:/Users/jralu/AppData/Local/Temp/claude/C--Users-jralu-JR-beta/eeca9777-d3a5-4945-a11b-7e8b62a5e18f/scratchpad/r40/our-spec.json";

// ── รันบูตสแตรป (เหมือน Calculator40Client.tsx บรรทัด 30) ──
applyBootstrap(PRODUCTS, R39DATA);

/* ══════════════════════════════════════════════════════════════════════
 * ค่าคงที่ก๊อปตรงจาก AddonsSection.tsx (การจัดกลุ่มของเสริม)
 * ══════════════════════════════════════════════════════════════════════ */
const OPENING_ADDONS = ["closer", "thresh", "hide_track", "inner_track", "motor", "awn_tt", "awn_brace"];
const HANDLE_ADDONS = ["cmech", "stainless", "digihandle"];
const SCREEN_ADDONS = ["mosquito", "zip_motor", "zip_noremote", "zip_smart", "zip_remote"];
const MAIN_EXTRA_ADDONS = ["grid", "solid_panel", "shower_corner", "shower_hw"];
const AUTO_ADDONS = ["slide_motor", "slide_auto", "awn_auto", "banklet_motor"];

function addonsIn(prodAddons, ids) {
  return prodAddons.filter((a) => ids.includes(a));
}
function addonsRest(prodAddons) {
  const used = [...OPENING_ADDONS, ...HANDLE_ADDONS, ...SCREEN_ADDONS, ...MAIN_EXTRA_ADDONS, ...AUTO_ADDONS];
  return prodAddons.filter((a) => !used.includes(a));
}

// จัดกลุ่ม addons ต่อรุ่น — ตรง AddonsSection.tsx บรรทัด ~589-603 (groups.filter ตัดกลุ่มว่างทิ้ง)
function buildAddonGroups(prod) {
  const list = prod?.addons || [];
  if (!list.length) return [];
  const opening = addonsIn(list, OPENING_ADDONS);
  const handle = addonsIn(list, HANDLE_ADDONS);
  const screen = addonsIn(list, SCREEN_ADDONS);
  const mainExtra = addonsIn(list, MAIN_EXTRA_ADDONS);
  const auto = addonsIn(list, AUTO_ADDONS);
  const rest = addonsRest(list);
  const groups = [
    { label: "OPENING", ids: opening },
    { label: "HANDLE", ids: handle },
    { label: "SCREEN", ids: screen },
    { label: "AUTO", ids: auto },
    { label: "MAIN_EXTRA", ids: mainExtra },
    { label: "REST", ids: rest },
  ].filter((g) => g.ids.length > 0);
  return groups;
}

// id ที่ engine.mjs computeAddon() รู้จัก แต่ AddonsSection.tsx AddonField() "ไม่มี branch เลย" (บั๊ก UI หายจริง)
// เช็คซ้ำ 2ก.ค.: node -e "เทียบ if(id==='...') ใน engine.mjs กับ ad==='...' ใน AddonsSection.tsx" → ว่างเปล่า (ครบทุก id แล้ว)
// คงตัวแปรนี้ไว้เป็นด่านกันถอยหลัง — ถ้าอนาคตเพิ่ม id ใหม่ใน computeAddon แล้วลืมเติม UI จะโผล่ใน dump ทันที
const NO_BRANCH_IDS = new Set([]);

/* ══════════════════════════════════════════════════════════════════════
 * AddonField ต่อ addon id หนึ่งตัว — ตรง AddonsSection.tsx function AddonField()
 * แต่ละ branch คืนค่า null (ไม่ render field ให้ addon นั้น เช่น zip_motor ที่ prod.zip.motor ไม่มี)
 * หรือ label สรุปสั้น ๆ (ไม่ต้องคัดลอก JSX เต็ม แค่บอกว่า "มี field อะไร")
 * ══════════════════════════════════════════════════════════════════════ */
function addonFieldLabel(ad, prod) {
  switch (ad) {
    case "frame_wrap":
      return "addon:frame_wrap[ไม่มี|3 ด้าน|4 ด้าน]";
    case "handrail_grip":
      return "addon:handrail_grip[ไม่มี|ยู 5 หุน|กล่อง 1x2]";
    case "zip_motor": {
      // ต้องมี prod.zip && prod.zip.motor ไม่งั้น return null (ไม่ render)
      const Z = prod?.zip;
      if (!Z || !Z.motor) return null;
      return `addon:zip_motor[select ${Object.keys(Z.motor).join("|")}]`;
    }
    case "zip_noremote":
      return "addon:zip_noremote[มีรีโมท 1 ตัว|ไม่เอารีโมท]";
    case "zip_smart":
      return "addon:zip_smart[ไม่มี|มี(+800)]";
    case "zip_remote":
      return "addon:zip_remote[number]";
    case "pullrod":
      return "addon:pullrod[number]";
    case "mosquito":
      // renderMosqDetails — field ย่อยขึ้นกับค่า mosquito ที่เลือก (dynamic ตอน runtime)
      // static: มี ChipRow เลือกชนิดหลักเสมอ + sub-fields (mqFabric/mqVariant/mqSize/mqW/mqH/mqPanels/mqFrameColor/mqPrice) โผล่แบบมีเงื่อนไข
      return "addon:mosquito[none|small|big|pleat|honey|roll] (+sub: mqFabric/mqVariant/mqSize/mqPanels/mqFrameColor/mqPrice ตามค่าที่เลือก)";
    case "gutter":
      return "addon:gutter{rate[0|1000|2000|3000],len}";
    case "chain_drain":
      return "addon:chain_drain[number]";
    case "pipe_cover":
      return "addon:pipe_cover[number]";
    case "gutter_cover":
      return "addon:gutter_cover{gw,gh,gll}";
    case "hide_slope":
      return "addon:hide_slope{type[none|comp|smart],h,l,n}";
    case "gate_curve":
      return "addon:gate_curve[none|yes]";
    case "gate_motor":
      return "addon:gate_motor[number]";
    case "gate_wire":
      return "addon:gate_wire[number]";
    case "ms_color":
      return "addon:ms_color[none|สีพิเศษ]";
    case "solid_panel":
      return "addon:solid_panel{type[none|corr|comp],w,h}";
    case "soft_close":
      return "addon:soft_close[none|yes]";
    case "sling":
      return "addon:sling[none|yes]";
    case "hide_beam":
      return "addon:hide_beam[none|yes]";
    case "u_track":
      return "addon:u_track[none|yes]";
    case "beam_support":
      return "addon:beam_support[none|yes]";
    case "demolish":
      return "addon:demolish[number]";
    case "shower_corner":
      return "addon:shower_corner[none|yes]";
    case "shower_hw":
      return "addon:shower_hw[silver|black|gold]";
    case "drop_floor":
      return "addon:drop_floor[number]";
    case "screen_demo":
      return "addon:screen_demo[none|yes]";
    case "screen_existing":
      return "addon:screen_existing[number]";
    case "roof_pole":
      return "addon:roof_pole{polep,pole4,pole15}";
    case "truss_beam":
      return "addon:truss_beam{rate[0|2400|3600|4400],len}";
    case "roof_eave":
      return "addon:roof_eave{on,len}";
    case "beam_cover":
      return "addon:beam_cover{on,bcw,bcl}";
    case "roof_sealer":
      return "addon:roof_sealer{on,len}";
    case "roof_film":
      return "addon:roof_film[number]";
    case "roof_2nd":
      return "addon:roof_2nd{mat[ไวนิล|ดีไลท์|โพลีฯ/กระจก|เมทัลชีท|ชินโค],len,proj,rate}";
    case "ceil_under":
      return "addon:ceil_under{on,type,insul,area,pos,dir,code}";
    case "louver_door":
      return "addon:louver_door[ติดตาย|บานเลื่อน|บานเฟี้ยม|บานเปิด]";
    case "slide_motor":
      return "addon:slide_motor{kw[1500|300|80], +sub(gearLen,sensor) ถ้า kw=1500}";
    // ── เติม 2ก.ค. (แก้ผล QA "ปุ่มหายจริง") — branch UI ใหม่ครบทุก id ที่เคย no-field ──
    case "closer":
      return "addon:closer[none|arm|slide|fold]";
    case "thresh":
      return "addon:thresh[none|turtle|turtle_felt|nothresh]";
    case "grid":
      return "addon:grid{nh,nv,nc,rate[200|250|300|350] (auto=สีเฟรม จนกว่าจะแตะเอง)}";
    // มือจับ (cmech/stainless/digihandle) — AddonsSection รวมเป็นกล่องเดียว "ชนิดมือจับ" ตรง app.js renderHandleSection
    // เรนเดอร์เฉพาะ id แรกที่เจอใน prod.addons ตามลำดับ HANDLE_ADDONS (cmech→stainless→digihandle) กันซ้ำ 3 กล่อง
    case "cmech":
    case "stainless":
    case "digihandle": {
      const HANDLE_ORDER = ["cmech", "stainless", "digihandle"];
      const avail = HANDLE_ORDER.filter((id) => (prod.addons || []).includes(id));
      if (avail[0] !== ad) return null; // ไม่ใช่ตัวแรก — ไม่ render กล่องซ้ำ (แต่ไม่ใช่ "no-field": มีกล่องรวมโผล่จาก id แรกแล้ว)
      return `addon:handleType[none|${avail.join("|")}] (กล่องรวม 🤚 มือจับ · เลือกชนิดแล้วโชว์ dropdown รุ่นของ${avail.map((a) => a).join("/")})`;
    }
    case "motor":
      return "addon:motor[none|80|300] (80 + พื้นที่>3.5 → warn เปลี่ยนเป็น300)";
    case "hide_track":
      return "addon:hide_track[none|yes]";
    case "inner_track":
      return "addon:inner_track[none|yes]";
    case "awn_tt":
      return "addon:awn_tt[none|yes]";
    case "awn_brace":
      // แสดงเฉพาะ form==='เปิดล่าง' — dump แบบ static ใช้ prod.defForm เป็นตัวแทน (ไม่มี user input ตอน dump)
      return prod.defForm === "เปิดล่าง" ? "addon:awn_brace[none|yes] (เฉพาะ form=เปิดล่าง)" : null;
    case "awn_auto":
      return "addon:awn_auto[none|choke50|choke80|chain1|chain2]";
    case "banklet_motor":
      return "addon:banklet_motor[none|yes]";
    case "slide_auto":
      return "addon:slide_auto{brand[none|evecca|changsaek|slimlux], +sub ตาม brand}";
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * ฟิลด์หลักของฟอร์ม — ตรง Calculator40Client.tsx JSX บรรทัด ~330-375
 * ══════════════════════════════════════════════════════════════════════ */
function buildFields(prod) {
  const fields = [];
  const name = prod.name || "";

  // กว้าง/สูง เสมอ (Field label="กว้าง (ซม.)" / "สูง (ซม.)")
  fields.push("กว้าง");
  fields.push("สูง");

  // จำนวนบาน — เงื่อนไข: (prod.maxP ?? 1) > 1 || (prod.defaults?.p ?? 1) > 1
  const maxP = prod.maxP ?? 1;
  const defP = prod.defaults?.p ?? 1;
  if (maxP > 1 || defP > 1) {
    const rangeSuffix = prod.minP ? ` (${prod.minP}-${prod.maxP})` : "";
    fields.push(`จำนวนบาน${rangeSuffix}`);
  }

  // กำไร % เสมอ
  fields.push("กำไร%");

  // รูปแบบ — prod.forms?.length > 0
  if (prod.forms?.length > 0) {
    fields.push(`รูปแบบ[${prod.forms.join("|")}]`);
  }

  // สี — เสมอ (ตัวเลือกมาจาก pb.BAKE keys — ไม่ผูกกับ colorKeys ที่ bootstrap เติม! Select ใน client ใช้ Object.keys(pb.BAKE) ตรง ๆ ไม่กรองด้วย prod.colorKeys)
  fields.push("สี[BAKE ทั้งหมด]");

  // กระจก — prod.defGlass (truthy)
  if (prod.defGlass) {
    fields.push("กระจก[glassKeys ทั้งหมดจาก pb.GLASS]");
  }

  // วัสดุ — prod.materials?.length > 0
  if (prod.materials?.length > 0) {
    fields.push(`วัสดุ[${prod.materials.join("|")}]`);
  }

  // specOpts (รวม lock ที่ bootstrap เติม) — (prod.specOpts ?? []).map(...)
  // optsByMaterial: ตัวเลือกล็อกตามวัสดุที่เลือก (เช่น สีผ้ามุ้ง) ตรง Calculator40Client.tsx ~467-474 (แก้ 2ก.ค.)
  // dump แบบ static ใช้ defMaterial เป็นตัวแทน (ไม่มี user input ตอน dump)
  (prod.specOpts ?? []).forEach((o) => {
    const opts = (o.optsByMaterial && o.optsByMaterial[prod.defMaterial]) || o.opts || [];
    const tag = o.optsByMaterial ? ` (optsByMaterial ตาม defMaterial="${prod.defMaterial}")` : "";
    fields.push(`spec:${o.label}[${opts.join("|")}]${tag}`);
  });

  // kindOpts (G4 ตู้/ฝาตู้/shower) — ตรง Calculator40Client.tsx ~477-495 (แก้ 2ก.ค.)
  (prod.kindOpts ?? []).forEach((ko) => {
    const opts = ko.opts.map((pair) => pair[0]);
    const cond = ko.showIf ? ` (showIf ${ko.showIf.key}=${ko.showIf.val})` : ko.hideIf ? ` (hideIf ${ko.hideIf.key}=${ko.hideIf.val})` : "";
    fields.push(`kind:${ko.label}[${opts.join("|")}]${cond}`);
  });
  if ((prod.kindOpts ?? []).some((ko) => ko.key === "faceColor")) {
    fields.push("kind:รหัสสีหน้าบานพิเศษ[text] (โผล่เฉพาะ faceColor=special)");
  }

  // G4 ตู้: ความลึก/จำนวนชั้น/กั้นด้านตู้ — ตรง Calculator40Client.tsx ~498-511 (แก้ 2ก.ค.)
  if (prod.sellCabinet) {
    fields.push(`depth[number] (เว้น=defDepth ${prod.defDepth ?? "0.6"})`);
    if (!prod.faceOnly) {
      fields.push("shelves[number] (เว้น=อัตโนมัติตามสูง)");
      fields.push("cabSides:กั้นด้านซ้าย[none|alu|glass|smart]");
      fields.push("cabSides:กั้นด้านขวา[none|alu|glass|smart]");
      fields.push("cabSides:กั้นด้านหลัง[none|alu|glass|smart]");
    }
  }
  if (prod.faceHint) {
    fields.push(`faceHint:คำเตือนพื้นที่/บาน>1.7ตร.ม. (${prod.faceHint})`);
  }

  // หลังคา: roofShape switcher + สีวัสดุมุง + หลังคาหลายช่วง — ตรง Calculator40Client.tsx ~426-628 (แก้ 2ก.ค.)
  if (prod.roofShape) {
    fields.push("roofShape:ทรงหลังคา[roof|roof_gable|roof_slide] (เลือกก่อน · สลับ prodId)");
  }
  if (prod.sheetColors && prod.defMaterial) {
    let sc = prod.sheetColors[prod.defMaterial];
    if (typeof sc === "string") sc = (prod.sheetColorSets || {})[sc] || [];
    if (sc && sc.length) {
      fields.push(`sheetColor:สีวัสดุมุง[${sc.map((x) => x.n).join("|")}] (ตาม defMaterial="${prod.defMaterial}" · label เท่านั้น)`);
    }
  }
  // roofSegments (หลังคาหลายช่วง/ขยัก) ถอดออกแล้ว 27 ส.ค.69 — ทรงหักมุมใช้รุ่น *_multi ที่ดึงของจากใบตัดจริง
  if (prod.multiSide) {
    fields.push(`ด้านหลังคา:${prod.multiSide === "d" ? "ยาวช่วงรายด้าน" : "กว้าง+ยื่นรายด้าน"} ×6 + รอยต่อ ×5 (RoofSidesEditor · เส้นอลูดึงจากใบตัด)`);
  }

  // บานติดตาย — เงื่อนไขเต็ม ตรง Calculator40Client.tsx บรรทัด 357-358:
  // prod.group === 1 && !prod.composite && !prod.sellDirect && !prod.pFromForm &&
  // (Number(p) || prod.defaults?.p || 1) > 1 && !/ติดตาย|ดัดโค้ง/.test(prod.name || "")
  // (ใช้ p = defaults.p เพราะ dump แบบ static ไม่มี user input; "Number(p)||defaults.p||1" ตอน default state ตรงกับ defaults.p เสมอ)
  const pForCheck = prod.defaults?.p || 1;
  if (
    prod.group === 1 &&
    !prod.composite &&
    !prod.sellDirect &&
    !prod.pFromForm &&
    pForCheck > 1 &&
    !/ติดตาย|ดัดโค้ง/.test(name)
  ) {
    fields.push("บานติดตาย");
  }

  // ── ของเสริม (AddonsSection) ──
  // NO_BRANCH_IDS = engine.mjs computeAddon() รู้จัก id นี้ แต่ AddonsSection.tsx AddonField() ไม่มี branch เลย
  // (ต่างจาก "conditionally hidden" เช่น zip_motor ไม่มี prod.zip.motor / awn_brace ไม่ใช่ form เปิดล่อง / handle ที่ไม่ใช่ id แรก
  //  — พวกนี้ "มี branch" แต่โผล่แบบมีเงื่อนไข ไม่ใช่บั๊ก UI หาย)
  const groups = buildAddonGroups(prod);
  groups.forEach((g) => {
    g.ids.forEach((ad) => {
      const label = addonFieldLabel(ad, prod);
      if (label) {
        fields.push(label);
      } else if (NO_BRANCH_IDS.has(ad)) {
        fields.push(`addon:${ad}(no-field · AddonField return null · ไม่มี branch UI)`);
      } else {
        fields.push(`addon:${ad}(hidden-by-condition · มี branch แต่เงื่อนไข default ไม่โผล่ · ไม่ใช่บั๊ก)`);
      }
    });
  });

  // ➕ ผสมบาน (G1) — ตรง SubPanesSection.tsx + Calculator40Client.tsx ~625-635 (แก้ 2ก.ค.)
  // ทุกรุ่น G1 ที่ไม่ใช่ composite (ห้องกระจก) มี section นี้ — ไม่ขึ้นกับ prod.addons
  if (prod.group === 1 && !prod.composite) {
    fields.push("subpanes:ผสมบาน[+บานเปิด|+บานเลื่อน|+เฟี้ยม|+กระทุ้ง|+ช่องแสงบน|+บานข้างติดตาย|+ช่องแสงติดตาย|+อื่นๆ(กรอกเอง)] (คิดราคาจริงตามชนิด สี/กระจกตามบานหลัก)");
  }

  return fields;
}

/* ══════════════════════════════════════════════════════════════════════
 * main
 * ══════════════════════════════════════════════════════════════════════ */
const result = [];
Object.values(PRODUCTS).forEach((prod) => {
  if (!prod || !prod.id) return;
  result.push({
    id: prod.id,
    group: prod.group,
    name: prod.name,
    isR39Fallback: !!prod.isR39Fallback,
    // pickerHide: true = ไม่โผล่การ์ดแยกในลิสต์ปกติ (เข้าถึงผ่าน roofShape switcher ของ "หลังคา" หรือใช้ภายใน mosquito เท่านั้น)
    // แก้ 2ก.ค.: Calculator40Client.tsx กรอง pickerHide ออกจาก prodList แล้ว (เดิมเคยหลุดโผล่เป็นการ์ดซ้ำ)
    pickerHide: !!prod.pickerHide,
    fields: buildFields(prod),
  });
});

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 1), "utf8");

// ── รายงานสรุป ──
const byGroup = {};
result.forEach((r) => {
  byGroup[r.group] = (byGroup[r.group] || 0) + 1;
});

console.log(`เขียนไฟล์: ${OUT_PATH}`);
console.log(`รวมทั้งหมด: ${result.length} รุ่น (pickerHide=${result.filter((r) => r.pickerHide).length} ไม่โผล่การ์ดแยกในลิสต์)`);
console.log(`จำนวนรุ่นต่อ group:`);
Object.keys(byGroup)
  .sort((a, b) => Number(a) - Number(b))
  .forEach((g) => console.log(`  G${g}: ${byGroup[g]} รุ่น`));

console.log(`\nตัวอย่าง fields:`);
["sms_slide", "roof", "roof_gable", "louver", "screen_ready", "zipscreen", "cabinet"].forEach((id) => {
  const r = result.find((x) => x.id === id);
  if (!r) {
    console.log(`  [${id}] — ไม่พบรุ่นนี้ใน PRODUCTS`);
    return;
  }
  console.log(`  [${id}] group=${r.group} name="${r.name}" isR39Fallback=${r.isR39Fallback} pickerHide=${r.pickerHide}`);
  r.fields.forEach((f) => console.log(`    - ${f}`));
});
