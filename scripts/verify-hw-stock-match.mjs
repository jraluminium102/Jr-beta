#!/usr/bin/env node
/**
 * verify-hw-stock-match — อุปกรณ์ในใบตัดต้อง "หาเจอในสโตร์" ตอนกดตัดออกสโตร์
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี (เจ้าของทัก 24 ส.ค.69): ใบตัดเฟี้ยมยูโร/เฟี้ยมยก เขียนรหัสผู้ผลิต HD-640 ตรง ๆ
 *   สโตร์มีของจริงแต่เก็บรหัสไว้ในชื่อ ("HD-640 บานพับล้อบนเฟี้ยม") ส่วน sku เป็น JR#####
 *   ฝั่งราคาอ่านรหัสจากชื่อได้อยู่แล้ว แต่ฝั่งหักสต็อกจับ sku ตรงตัวอย่างเดียว
 *   → อุปกรณ์เฟี้ยมยูโรไม่เคยถูกหักออกจากสต็อกเลย (เงียบ ๆ ไม่มี error)
 *
 *   node scripts/verify-hw-stock-match.mjs
 */
import { resolveHwStock } from "../src/lib/cutlist/stock-match.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";

let pass = 0, fail = 0;
const ok = (label, cond, got = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`);
};

// สต็อกจำลองตามรูปแบบจริง: sku = JR##### รันอัตโนมัติ · รหัสผู้ผลิตอยู่ในชื่อ
const STOCK = [
  { id: 1, sku: "JR09001", name: "HD-640 บานพับล้อบนเฟี้ยม", qty: 5 },
  { id: 2, sku: "JR09002", name: "HD-641 บานพับเฟี้ยม", qty: 50 },
  { id: 3, sku: "JR09003", name: "HD-642 บานพับมือจับเฟี้ยม", qty: 5 },
  { id: 4, sku: "JR09004", name: "HD-643 บานพับไกด์ล่างเฟี้ยม", qty: 5 },
  { id: 5, sku: "JR09005", name: "HD-312 ตลับกลอนก้านโยกมัลติล็อค", qty: 5 },
  { id: 6, sku: "JR09006", name: "HD-1180 ก้าน AL สไลด์ 19.5 mm", qty: 9 },
  { id: 7, sku: "JR09007", name: "HD-213 ฉากเข้ามุมปรับได้", qty: 40 },
  { id: 8, sku: "JR09008", name: "HD-200 ฉากประคองมุม", qty: 99 },
  { id: 9, sku: "JR00213", name: "HD-474 มือจับกลอนรุ่นก้านโยก", qty: 7 },
  // ตัวล่อ: ห้ามให้ HD-200 ไปแมชตัวนี้
  { id: 10, sku: "JR09010", name: "HD-2000 อะไหล่คนละตัว", qty: 3 },
];

console.log("\n═══ ① sku ตรงตัวยังทำงานเหมือนเดิม ═══");
ok("JR00213 → เจอด้วย sku ตรง", resolveHwStock(STOCK, "JR00213")?.id === 9);
ok("JR99999 (ไม่มีจริง) → null ไม่เดาจากชื่อ", resolveHwStock(STOCK, "JR99999") === null);

console.log("\n═══ ② รหัสผู้ผลิตในชื่อ — หาเจอแล้ว ═══");
for (const [code, id] of [["HD-640", 1], ["HD-641", 2], ["HD-642", 3], ["HD-643", 4],
  ["HD-312", 5], ["HD-1180", 6], ["HD-213", 7], ["HD-200", 8]]) {
  const hit = resolveHwStock(STOCK, code);
  ok(`${code} → ${STOCK[id - 1].name}`, hit?.id === id, String(hit?.name ?? "ไม่เจอ"));
}

console.log("\n═══ ③ กันหักผิดตัว ═══");
ok("HD-200 ไม่ไปแมช HD-2000 (ขอบคำ)", resolveHwStock(STOCK, "HD-200")?.id === 8);
ok("HD-999 ไม่มีในสโตร์ → null", resolveHwStock(STOCK, "HD-999") === null);
ok("เจอ 2 ตัว → null (ยอมข้าม ดีกว่าหักผิด)",
  resolveHwStock([{ id: 1, sku: "A", name: "HD-500 ตัวหนึ่ง", qty: 1 },
    { id: 2, sku: "B", name: "HD-500 อีกตัว", qty: 1 }], "HD-500") === null);
ok("sku ว่าง → null", resolveHwStock(STOCK, "") === null);

console.log("\n═══ ④ ใบตัดจริง: เฟี้ยมยูโร + เฟี้ยมยก ต้องหักได้ครบทุกบรรทัด ═══");
for (const id of ["euro_bifold", "euro_lift"]) {
  const spec = CUT_SPEC_BY_ID[id];
  const r = computeCutList(spec, spec.defaults, 1);
  const withSku = r.hardware.filter((h) => h.sku && !h.noStock);
  const miss = withSku.filter((h) => !resolveHwStock(STOCK, h.sku));
  ok(`${spec.name}: อุปกรณ์ ${withSku.length} บรรทัด หักได้ครบ`, miss.length === 0,
    miss.map((h) => `${h.sku} ${h.name}`).join(" · "));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
