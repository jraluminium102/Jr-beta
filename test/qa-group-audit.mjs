// qa-group-audit.mjs — อ่าน accordion buckets จาก buildItemOpts output โดยตรง
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "../public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) console.error("jsdomErr:", e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

const TESTS = [
  [1, "sliding_euro", null, 2.4, 2.2, 2],
  [1, "casement_euro", "door", 2.0, 2.2, 2],
  [1, "awning_euro", null, 1.2, 0.6, 1],
  [1, "folding", "door", 2.4, 2.4, 4],
  [1, "curved_single", null, 1.5, 2.2, 1],
  [1, "shower", null, 1.2, 2.0, 1],
  [1, "inner_top_stack", null, 2.0, 2.4, 2],
  [1, "frameless_door", null, 0.9, 2.1, 1],
  [2, "rn_bt_3535", null, 3.0, 2.5, 1],
  [2, "imp1", null, 6.0, 1.0, 1],
  [2, "grid_line", null, 1.0, 1.0, 1],
  [3, "roof_vinyl", null, 4.0, 3.0, 1],
  [3, "roof_polyton", null, 3.0, 3.0, 1],
  [4, "cabinet_alu", null, 1.2, 2.4, 1],
  [5, "imp21", null, 1.5, 2.0, 1],
  [6, "sliding_euro", null, 3.0, 2.4, 2],
];

const EXPECTED = {
  "o-digi": "ล็อค", "o-stainless": "ล็อค", "o-handlename": "ล็อค",
  "o-handleprice": "ล็อค", "o-cmech": "ล็อค", "o-cmechcolor": "ล็อค",
  "o-closer": "ล็อค", "o-cmechawn": "ล็อค", "o-xhandle": "ล็อค",
  // v7A: ธรณี/ครอบวงกบ/รางยู ย้ายไป "อุปกรณ์เสริม (ใช้ไม่บ่อย)" แล้ว
  "o-thresh": "อุปกรณ์เสริม", "o-threshf": "อุปกรณ์เสริม", "o-fcsides": "อุปกรณ์เสริม", "o-fcm": "อุปกรณ์เสริม",
  "o-uchannel": "อุปกรณ์เสริม", "o-dfm": "อุปกรณ์เสริม", "o-solidlight": "ติดตาย", "o-fullgrid": "ติดตาย",
  "o-mosq": "มุ้ง", "o-mosqfabric": "มุ้ง", "o-mosqcolor": "มุ้ง",
  "o-mosqpanels-stepper": "มุ้ง", "o-mosqw": "มุ้ง", "o-mosqh": "มุ้ง",
  "o-mosqpanels": "มุ้ง", "o-mosqopenstyle": "มุ้ง",
  "o-gridmark": "คาดตาราง", "o-gm-nh": "คาดตาราง", "o-gm-nv": "คาดตาราง",
  "o-gm-rate": "คาดตาราง", "o-gm-curve": "คาดตาราง",
  "o-gridcolor": "คาดตาราง", "o-nh": "คาดตาราง", "o-nv": "คาดตาราง", "o-nc": "คาดตาราง",
  // v7A: เสริมคาน/รางยู ย้ายไป "อุปกรณ์เสริม (ใช้ไม่บ่อย)" · ซ่อนคาน/ซ่อนราง/Soft Close/สลิง ยังอยู่ "โครงสร้าง"
  "o-beam_support": "อุปกรณ์เสริม", "o-beam_support-len": "อุปกรณ์เสริม",
  "o-hide_beam": "โครงสร้าง", "o-hide_beam-len": "โครงสร้าง",
  "o-hide_track": "โครงสร้าง", "o-hide_track-len": "โครงสร้าง",
  "o-u_track": "อุปกรณ์เสริม", "o-u_track-len": "อุปกรณ์เสริม",
  "o-soft_close": "โครงสร้าง", "o-sling": "โครงสร้าง",
  "o-hmode": "โครงสร้าง", "o-doortype": "โครงสร้าง", "o-doorprice": "โครงสร้าง",
  "o-solidlower": "แผ่นทึบ", "o-sl-w": "แผ่นทึบ", "o-sl-h": "แผ่นทึบ", "o-sl-color": "แผ่นทึบ",
  "o-remark-add": "งานเสริม", "o-extrawork": "งานเสริม",
  "o-removeold": "อุปกรณ์เสริม", "o-optdelta": "งานเสริม", // v7A: รื้อของเดิม ย้ายไป "อุปกรณ์เสริม"
  "o-roofcolor": "วัสดุมุง", "o-roofbatten": "วัสดุมุง", "o-roofframe": "วัสดุมุง",
  "o-lamfilm": "วัสดุมุง", "o-lamthick": "วัสดุมุง",
  "o-roofend": "ปลายหลังคา", "o-rfgut": "ปลายหลังคา",
  "o-guttersys": "ปลายหลังคา", "o-rfeave": "ปลายหลังคา",
  "o-rfpolep": "ของเสริม", "o-rfbeam": "ของเสริม", "o-rfplate": "ของเสริม",
  "o-rfhs": "ของเสริม", "o-rfsealer": "ของเสริม", "o-rfchain": "ของเสริม", "o-rfpvc": "ของเสริม",
  "o-roof2": "หลังคาผสม",
  "o-cabtype": "รายละเอียดตู้", "o-cabdoors": "รายละเอียดตู้",
  "o-cabwallmat": "รายละเอียดตู้", "o-shelfmat": "รายละเอียดตู้",
  "o-depth": "รายละเอียดตู้", "o-shelves": "รายละเอียดตู้", "o-backwall": "รายละเอียดตู้",
};

// คลาสที่ถูก skip ออกจาก accordion โดยตั้งใจ
const SKIP = new Set([
  "o-shtype","o-shdoortype","o-corner","o-showerhw",
  "o-motor","o-frametype","o-framecolor",
  "o-opentype","o-fixed","o-bottomrail","o-track","o-opencount","o-slidelock",
  "o-zgrp","o-zmodel","o-zfab","o-zctrl",
  "o-gatetype","o-gatern","o-gmotor","o-railtype","o-gfin","o-gatethresh","o-gatewood",
  "o-awn_mode","o-spanels","o-sfixed","o-sareaw","o-sareah","o-smotorqty","o-slidetype",
  "o-smotorprice","o-smotor-auto","o-smotor-edit",
  "o-bocdir","o-bocmotor","o-bocfinish","o-bgdir","o-bgcolor","o-grdir",
  "o-bsdoor","o-bsdoorprice","o-bsfinish",
  "o-glassmode","o-glasscost","o-glassprofit",
  "o-gm-wrap","o-solidlower-wrap","o-sl-colorwrap","o-slide-wrap",
  "o-rfgc-toggle","o-rfbc-toggle",
  "o-screen_existing","o-screen_extra",
  "o-insul","o-wallmodel","o-wallpaintprice",
  "o-wallframe","o-isothick","o-isocolor","o-ceilfinish","o-ceilslope","o-smartthick","o-wallpaint",
  "o-ckolor",
  "o-bg_motor",
  "o-mscolor",
  "o-gatern","o-opentype",
  "o-cabtype-chip",
  "o-rfgc-reveal","o-rfbc-reveal",
  "o-finish","o-hmode","o-doortype","o-doorprice",   // ระแนง/gate: skipEls inline ใต้รุ่น (G1G6-C rule) — อยู่นอก accordion โดยตั้งใจ
  "o-slide",    // checkbox เปิด/ซ่อน
  "o-rfleaf","o-rfdrain","o-rfgutlen",
  "o-gutter-pipecolor","o-gutter-chainpat","o-gutter-chaincolor",
  "o-rfbeamlen","o-rfhsh","o-rfhsl","o-rfhsn","o-rfgcw","o-rfgch","o-rfgcl","o-rfbcw","o-rfbcl",
  "o-rfsealercolor",
  "o-rfpolep","o-rfpole4",
  "o-roof2area",
  "o-sfixed","o-spanels","o-smotorqty",
  "o-eave-wrap","o-guttersys-wrap",
  "o-lamfilm","o-lamthick",
]);

const results = [];

for (const [grp, prod, itype, wv, hv, panels] of TESTS) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  const sf = (sel, v) => { const el = ch.querySelector(sel); if (!el) return; el.value = String(v); fire(el, "input"); fire(el, "change"); };
  sf(".i-group", String(grp));
  const ps = ch.querySelector(".i-prod");
  if (!ps) continue;
  if (grp === 6 && !ps.querySelector(`option[value="${prod}"]`)) {
    if (w.prodOptionsG6) ps.innerHTML = w.prodOptionsG6("6");
  }
  ps.value = prod;
  fire(ps, "change");
  if (itype) sf(".i-type", itype);
  sf(".i-w", String(wv));
  sf(".i-h", String(hv));
  if (panels > 1) sf(".i-panels", String(panels));

  const box = ch.querySelector(".i-opts");
  if (!box) { results.push({grp: `G${grp}`, prod, cls:"i-opts missing", ok:false, actualBucket:"NO BOX", expKw:"-"}); continue; }

  const buckets = {};
  box.querySelectorAll(".gh-opt-cat-det").forEach((det) => {
    const sm = det.querySelector("summary");
    const key = sm ? sm.textContent.replace(/\s*\(\d+\)\s*$/, "").trim() : "?";
    const clsList = [];
    det.querySelectorAll("[class]").forEach((el) => {
      el.classList.forEach((c) => { if (c.startsWith("o-")) clsList.push(c); });
    });
    buckets[key] = clsList;
  });

  // G5/มุ้ง: groupGHOpts ไม่ถูกเรียก (L4807) → ไม่มี accordion → skip accordion check
  if (Object.keys(buckets).length === 0) continue;

  const allInBox = new Set();
  box.querySelectorAll("[class]").forEach((el) => el.classList.forEach((c) => { if (c.startsWith("o-")) allInBox.add(c); }));

  for (const cls of allInBox) {
    if (SKIP.has(cls)) continue;
    const expKw = EXPECTED[cls];
    if (!expKw) continue;

    let found = null;
    for (const [bk, bv] of Object.entries(buckets)) {
      if (bv.includes(cls)) { found = bk; break; }
    }
    const actualBucket = found || "(ไม่อยู่ใน acc)";
    // roof ใช้ catch-all "📝 งานพิเศษ · รื้อของเดิม" แทน "งานเสริม"/"อุปกรณ์เสริม" ของ G1 → ยอมรับเทียบเท่า
    const ok = found ? (found.includes(expKw) || ((expKw === "งานเสริม" || expKw === "อุปกรณ์เสริม") && /งานพิเศษ|รื้อของเดิม/.test(found))) : false;
    results.push({ grp: `G${grp}`, prod, cls, expKw, actualBucket, ok });
  }

  // catch-all overflow check
  for (const [bk, bv] of Object.entries(buckets)) {
    if (/งานเสริม|หมายเหตุ/.test(bk)) {
      bv.forEach((cls) => {
        const expKw = EXPECTED[cls];
        if (expKw && !expKw.includes("งานเสริม") && !SKIP.has(cls)) {
          const already = results.some(r => r.cls === cls && r.grp === `G${grp}` && r.prod === prod);
          if (!already) {
            results.push({ grp: `G${grp}`, prod, cls, expKw, actualBucket: bk + " [CATCH-ALL OVERFLOW]", ok: false });
          }
        }
      });
    }
  }
}

const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
const failList = results.filter(r => !r.ok);

console.log(`\n=== QA option-group crosscheck (G1-G6) ===`);
console.log(`ทดสอบ: ${results.length} cases | PASS: ${pass} | FAIL: ${fail}`);

if (failList.length === 0) {
  console.log("\n✅ ไม่เจอออปชั่นผิดหมวด — ทุก o-* ถูกหมวดครบ");
} else {
  console.log("\n=== รายการ FAIL (ผิดหมวด / หาย) ===");
  const byGroup = {};
  failList.forEach((r) => {
    if (!byGroup[r.grp]) byGroup[r.grp] = [];
    byGroup[r.grp].push(r);
  });
  for (const [grp, list] of Object.entries(byGroup).sort()) {
    console.log(`\n--- ${grp} (${list.length} รายการ) ---`);
    list.forEach((r) => {
      console.log(`  [${r.prod}] ${r.cls}`);
      console.log(`      คาด: "${r.expKw}"  จริง: "${r.actualBucket}"`);
    });
  }
}

// พิมพ์ทุก PASS ต่อกลุ่มแบบย่อ
console.log("\n=== PASS per product ===");
const byProd = {};
results.filter(r => r.ok).forEach((r) => {
  const k = `${r.grp}|${r.prod}`;
  if (!byProd[k]) byProd[k] = [];
  byProd[k].push(r.cls);
});
for (const [k, list] of Object.entries(byProd)) {
  console.log(`  [${k}] ${list.length} ok`);
}
// gate: fail ถ้ามีออปชั่นผิดหมวด (regression guard)
var _fails=results.filter(r=>!r.ok).length;
console.log("\nสรุป: ผ่าน "+results.filter(r=>r.ok).length+"/"+results.length+(_fails?(" · FAIL "+_fails):""));
process.exit(_fails===0?0:1);
