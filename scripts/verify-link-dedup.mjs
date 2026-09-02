/**
 * verify-link-dedup — กันหน้า "สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0" กลับไปโชว์แถวซ้ำซ้อนอีก
 *
 * ที่มา (เจ้าของท้วง 2 ก.ย.69):
 *   "Velora จำนวนบานพับคุณก็รู้อยู่แล้ว ในเว็บยังเขียนอยู่เลย บานพับ (4 ตัว/บาน)
 *    แต่ไม่ใส่จำนวนให้ในคิดราคา กับใบตัดซะงั้น ... เช็คส่วนอื่นด้วยนะ ทุกบานเลย อย่าให้กรอกซ้ำซ้อน"
 *   ต้นเหตุ = บรรทัดที่มี "หลายรหัสสลับตามสี/สเปค" (บานพับ ดำ JR00560 / ขาว JR00561)
 *   ตัวอย่างที่ระบบลองใช้ได้สีเดียว → อีกรหัสเด้งเป็นแถวใหม่ "ชื่อซ้ำ จำนวนว่าง" ทำเจ้าของงง
 *
  * เช็ค 4 ข้อ (รันกับสูตรจริงทั้งคลัง ไม่ใช่ fixture — ต้องจับของจริงที่หลุดเข้ามาใหม่ได้)
 *   ① ไม่มีแถว "ยังไม่ได้ตรวจ" ที่ชื่อซ้ำกับแถวที่มีเลขอยู่แล้วในรุ่นเดียวกัน
 *   ② ไม่มีแถว "ไม่มีรหัสทั้ง 2 ฝั่ง" ที่ชื่อต่างกันแค่ตัวเลข ทั้งที่มาจากรูปแบบเดียวกัน
 *   ③ ชื่อที่บอกจำนวนไว้ในตัวเอง เช่น "(4 ตัว/บาน)" ต้องได้จำนวนตรงกับที่ชื่อบอก
 *      (ยกเว้นหน่วยเป็นแพ็ก — ถุง/ชุด/บาน — ที่ 1 หน่วยมีหลายชิ้นอยู่แล้ว)
 */
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import PRICEBOOK from "../src/lib/calculator40/pricebook.json" with { type: "json" };
import { buildLinkRowsWithPricebook } from "../src/lib/calculator40/link-rows.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";

let pass = 0, fail = 0;
const okTrue = (name, cond, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : `\n       ${detail}`}`);
  cond ? pass++ : fail++;
};

const norm = (s) => String(s ?? "").replace(/[\s\-–—()"'·.]/g, "").toLowerCase();
const skel = (s) => norm(s).replace(/\d+/g, "#");
const formOf = (lbl) => { const i = String(lbl).indexOf(" · "); return i < 0 ? "" : String(lbl).slice(i + 3); };

const rows = buildLinkRowsWithPricebook(PRODUCTS, PRICEBOOK, CUT_SPEC_BY_ID);
const byProd = new Map();
for (const r of rows) {
  if (!byProd.has(r.productId)) byProd.set(r.productId, []);
  byProd.get(r.productId).push(r);
}
console.log(`\nอ่านสูตรจริง ${byProd.size} รุ่น · ${rows.length} แถว\n`);

// ── ① แถว "ยังไม่ได้ตรวจ" ที่จริง ๆ เป็นบรรทัดเดิมที่มีเลขอยู่แล้ว ──
console.log("① แถว 'ยังไม่ได้ตรวจ' ต้องไม่ซ้ำกับบรรทัดที่มีเลขอยู่แล้ว");
{
  const bad = [];
  for (const [pid, rs] of byProd) {
    const shown = new Set();
    for (const r of rs) if (r.status !== "untested") for (const nm of String(r.name).split(" + ")) shown.add(norm(nm));
    for (const r of rs) if (r.status === "untested" && shown.has(norm(r.name))) bad.push(`${pid} · ${r.name} (${r.calcSku})`);
  }
  okTrue(`ไม่มีแถวซ้ำซ้อน (เจอ ${bad.length})`, bad.length === 0, bad.slice(0, 8).join("\n       "));
  okTrue("รหัสสำรองถูกเก็บไว้บนแถวเดิม (altCodes) ไม่หายไปเฉย ๆ", rows.some((r) => (r.altCodes || []).length > 0));
}

// ── ② แถวไม่มีรหัส ชื่อต่างกันแค่ตัวเลข ในรูปแบบเดียวกัน = ของชิ้นเดียวกันคนละขนาด ──
console.log("\n② แถวไม่มีรหัส ที่ชื่อต่างแค่ตัวเลข ต้องถูกยุบเป็นแถวเดียว");
{
  const bad = [];
  for (const [pid, rs] of byProd) {
    const seen = new Map();
    for (const r of rs) {
      if (r.calcSku || r.cutSku) continue;
      const k = `${skel(r.name)}|${formOf(r.sizeLabel)}`;
      const cur = seen.get(k);
      if (cur && cur !== r.name) bad.push(`${pid} · ${cur}  ||  ${r.name}`);
      else seen.set(k, r.name);
    }
  }
  okTrue(`ไม่มีแถวชื่อซ้ำแบบต่างแค่ตัวเลข (เจอ ${bad.length})`, bad.length === 0, bad.slice(0, 8).join("\n       "));
}

// ── ③ ชื่อบอกจำนวนไว้เอง → จำนวนต้องตรง (เจ้าของจะได้ไม่ต้องกรอกซ้ำสิ่งที่ชื่อบอกอยู่แล้ว) ──
console.log("\n③ ชื่อที่บอกจำนวนไว้เอง เช่น '(4 ตัว/บาน)' จำนวนต้องตรงกับที่ชื่อบอก");
{
  const RE = /\((\d+(?:\.\d+)?)\s*(?:ตัว|ชิ้น|ชุด|ลูก|เส้น)?\s*\/\s*บาน\)/;
  // หน่วยแบบ "แพ็ก" — 1 หน่วยมีหลายชิ้นอยู่แล้ว ชื่อกับจำนวนจึงคนละหน่วยโดยตั้งใจ
  const PACK = /^(ถุง|ชุด|บาน|กล่อง|แพ็?ค)$/;
  const bad = [];
  for (const r of rows) {
    const m = RE.exec(r.name);
    if (!m) continue;
    const mp = /(\d+)\s*บาน/.exec(r.sizeLabel);
    if (!mp) continue;
    const want = Number(m[1]) * Number(mp[1]);
    if (PACK.test(String(r.calcUnit).trim()) || PACK.test(String(r.cutUnit).trim())) continue;
    if (r.calcQty == null && r.cutQty == null) { bad.push(`${r.productId} · ${r.name} — ไม่มีจำนวนทั้ง 2 ฝั่ง`); continue; }
    for (const [side, got] of [["คิดราคา", r.calcQty], ["ใบตัด", r.cutQty]]) {
      if (got != null && Math.abs(got - want) > 0.01)
        bad.push(`${r.productId} · ${r.name} [${r.sizeLabel}] ชื่อบอก ${want} แต่${side}ได้ ${got}`);
    }
  }
  // euro_slide มือจับ Align รูปแบบ "อิสระ" ยังต่างกันจริง (คิดราคา 4 · ใบตัด 2) — เป็นงานที่เจ้าของต้องเคาะ
  //   ไม่ปิดเทสให้ผ่านมั่ว ๆ แต่กันไม่ให้ "งอกใหม่" — ล็อกรายการที่รู้อยู่แล้วไว้เป็น baseline
  const KNOWN = ["euro_slide · มือจับ Align (2/บาน)"];
  const fresh = bad.filter((b) => !KNOWN.some((k) => b.startsWith(k)));
  okTrue(`ไม่มีรายการใหม่ที่ชื่อกับจำนวนขัดกัน (เจอ ${fresh.length})`, fresh.length === 0, fresh.slice(0, 8).join("\n       "));
  if (bad.length) console.log(`     (baseline เดิมที่ยังรอเจ้าของเคาะ ${bad.length - fresh.length} รายการ)`);
}

// ── ④ dropdown "รูปแบบ" ที่กดแล้วไม่มีอะไรเปลี่ยนเลย = หลอกตา ──
//   เจ้าของจับได้ 2 ก.ย.69: "Velora เลือกรูปแบบคู่ บานพับยังใช้ 4 แทนที่จะ 8"
//   ต้นเหตุ = ตัวเลือกนั้นไม่มีสูตรไหนอ่าน form เลย → ทุน/จำนวนเท่าเดิมเป๊ะทุกตัวเลือก
console.log("\n④ ทุกตัวเลือกใน dropdown 'รูปแบบ' ต้องทำให้อะไรบางอย่างเปลี่ยนจริง");
{
  // รุ่นที่รู้อยู่แล้วว่ายังไม่แยกสูตร — รอเจ้าของเคาะว่าควรต่างกันตรงไหน (ห้ามเดาจำนวนเอง)
  //   ไม่ปิดเทสให้ผ่านมั่ว ๆ แต่กันไม่ให้รุ่นใหม่หลุดเข้ามาเพิ่ม
  const KNOWN = new Set(["awning", "bar_grid_z", "roof_slide", "wall_corrugated"]);
  const dead = [];
  for (const p of Object.values(PRODUCTS)) {
    if (!p.forms || p.forms.length < 2) continue;
    const d = p.defaults || { w: 150, h: 150, p: 1 };
    const sig = new Set();
    for (const f of p.forms) {
      try {
        const r = computeCost(PRICEBOOK, p, { w: d.w, h: d.h, p: d.p || 1, form: f, color: "white", colorKey: "white" });
        sig.add(`${r.cost}|` + (r.lines || []).map((l) => `${l.name}:${l.qty}`).join(","));
      } catch { sig.add("ERR"); }
    }
    if (sig.size === 1) dead.push(`${p.id} (${p.name}) → ${p.forms.join(" / ")}`);
  }
  const fresh = dead.filter((s) => !KNOWN.has(s.split(" ")[0]));
  okTrue(`ไม่มีรุ่นใหม่ที่ dropdown รูปแบบไม่ทำอะไร (เจอ ${fresh.length})`, fresh.length === 0, fresh.join("\n       "));
  okTrue("velora ไม่มี dropdown รูปแบบหลอกตาแล้ว (จำนวนบานคุมอย่างเดียว)", !(PRODUCTS.velora.forms || []).length);
  if (dead.length) console.log(`     (baseline เดิมที่รอเจ้าของเคาะ ${dead.length} รุ่น: ${dead.map((s) => s.split(" ")[0]).join(", ")})`);
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
