// dev-status.mjs — "เช็คสถานะงาน dev" อ่านของจริง (index.html + docs/) บอกว่าอะไรเสร็จ/รอ/ยังไม่เตรียม
// ใช้: node scripts/dev-status.mjs
// ไม่ต้องอัปเดตมือ — มันอ่าน git/โค้ดเอง · เพิ่มงานใหม่ = เพิ่ม 1 บรรทัดใน TASKS ข้างล่าง
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HTML = readFileSync("public/calculator/index.html", "utf8");

// ── รายการงาน: name=ชื่องาน · marker=คำที่จะมีใน index.html "เมื่อ Chat B แก้เสร็จ" · doc=คำในชื่อไฟล์ CODE-READY (docs/) ──
const TASKS = [
  { name: "G3 ฝ้าระแนงอลู 3 รุ่น",      marker: /ceil_ranae_1x5/,    doc: "ฝ้าระแนงอลู" },
  { name: "G3 ใบ 5 บล็อก (หลังคา/ฝ้า)", marker: /สีหลังคา:/,         doc: "ใบ5บล็อก" },
  { name: "G1 ใบ 5 บล็อก",             marker: /สีอลูมิเนียม:/,     doc: null },
  { name: "G4 ใบ 5 บล็อก (ตู้)",        marker: /บานหน้า Future Tech /, doc: null },
  // เพิ่มงานใหม่ที่นี่:  { name:"...", marker:/คำในโค้ด/, doc:"คำในชื่อไฟล์" },
];

// หาไฟล์ใน docs/ ที่ชื่อมีคำว่า kw (เดินทุกโฟลเดอร์ย่อย)
function docExists(kw) {
  if (!kw) return false;
  const stack = ["docs"];
  while (stack.length) {
    const dir = stack.pop();
    let entries; try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) stack.push(p);
      else if (e.includes(kw)) return true;
    }
  }
  return false;
}

const rows = TASKS.map((t) => {
  const inCode = t.marker.test(HTML);
  let status, icon;
  if (inCode) { icon = "✅"; status = "Chat B แก้แล้ว (อยู่ในเว็บ)"; }
  else if (docExists(t.doc)) { icon = "🔴"; status = "เตรียมโค้ดแล้ว · รอ Chat B แก้"; }
  else { icon = "⚪"; status = "ยังไม่เตรียม"; }
  return { icon, name: t.name, status };
});

const done = rows.filter((r) => r.icon === "✅").length;
const waiting = rows.filter((r) => r.icon === "🔴").length;

console.log("\n📋 สถานะงาน dev (อ่านจาก index.html + docs/ จริง · " + rows.length + " งาน)\n");
for (const r of rows) console.log("  " + r.icon + "  " + r.name.padEnd(28) + " — " + r.status);
console.log("\n  สรุป: ✅ เสร็จ " + done + " · 🔴 รอ Chat B " + waiting + " · ⚪ ยังไม่เตรียม " + (rows.length - done - waiting));
console.log("  (🔴 = พี่เตรียมโค้ดไว้แล้ว ยังไม่ได้แก้ → บอก Chat B ทำได้เลย)\n");
