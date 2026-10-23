// สร้างเฉลยแบบโครงสร้าง (JSON) จาก cmp-net.json ด้วยกฎเดียวกับ gen-audit-worksheet.mjs (ลำดับบาน/แถว = ใบที่พิมพ์)
//   node scripts/gen-audit-key.mjs <cmp-net.json> <key.json>
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
const DATA = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const SKIP = new Set(["shower", "frameless_door", "curve_open"]);
const groups = new Map();
for (const r of DATA.rows) {
  if (!r.id || SKIP.has(r.id) || !Array.isArray(r.bom) || !r.bom.length || r.small || !r.web) continue;
  if (/^roof/.test(r.id) && r.vk !== "ไวนิล") continue;
  const k = r.id + "|" + (r.vk || "");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const jobs = [];
for (const rows of groups.values()) {
  const s = [...rows].sort((a, b) => a.w * a.h * (a.p || 1) - b.w * b.h * (b.p || 1));
  const mid = s[Math.floor((s.length - 1) / 2)], big = s[s.length - 1];
  jobs.push({ mid, big: big !== mid ? big : null });
}
const cleanName = (n) => String(n).replace(/\s*\((อบขาว\/ดำ|อบขาว|ดำ)\)\s*$/, "");
const cm = (m) => Math.round(m * 1000) / 10;
const kindOf = (row) => (row[0] !== "alu" ? row[0] : row[8] && row[8].mode === "waste" ? "aluA" : "aluB");
const SECTIONS = ["aluA", "aluB", "glass", "hardware", "consum", "bake", "addon"];
const r2 = (v) => Math.round(v * 100) / 100;
const mergeBom = (a, b) => {
  const out = [], idx = new Map();
  const add = (row, side) => {
    const [, name, code, qty, unit, price, amt, how, C] = row;
    const kind = kindOf(row), pool = kind === "aluB" && C && C.mode === "pool";
    const key = kind + "|" + (pool ? "pool" : cleanName(name)) + "|" + code;
    let e = idx.get(key);
    if (!e) { e = { kind, names: [], code, unit, stock: C ? C.stock : null, pool, m: null, b: null }; idx.set(key, e); out.push(e); }
    if (!e.names.includes(cleanName(name))) e.names.push(cleanName(name));
    const s = e[side] || (e[side] = { qty: 0, price, amt: 0, cm: 0, pcs: [], waste: C?.waste || 1 });
    s.qty += qty; s.amt += amt;
    if (C) { s.cm += cm(C.seg * C.pieces); s.pcs.push(`${Math.round(C.pieces * 100) / 100}×${cm(C.seg)}`); }
  };
  for (const r of a.bom) add(r, "m");
  if (b) for (const r of b.bom) add(r, "b");
  return SECTIONS.flatMap((c) => out.filter((e) => e.kind === c));
};
const out = jobs.map(({ mid, big }, i) => {
  const p = PRODUCTS[mid.id];
  const items = mergeBom(mid, big);
  const sumA = { m: 0, b: 0 };
  const rows = items.map((e, k) => {
    const side = (s) => {
      if (!s) return null;
      if (e.kind === "aluA") return { qty: Math.round(s.cm * 10) / 10, unit: "ซม.", price: s.price, amt: r2(s.amt / s.waste), amtW: r2(s.amt), pcs: s.pcs.join(" + ") };
      return { qty: r2(s.qty), unit: e.kind === "aluB" ? "เส้น" : e.unit, price: s.price, amt: r2(s.amt) };
    };
    const m = side(e.m), b = side(e.b);
    if (e.kind === "aluA") { if (m) sumA.m += m.amt; if (b) sumA.b += b.amt; }
    return { n: k + 1, kind: e.kind, name: e.names.join(" + "), code: e.code, stock: e.stock, m, b };
  });
  return {
    no: i + 1, id: mid.id, name: (p?.name || mid.name) + (mid.vk ? " · " + mid.vk : ""),
    mid: { w: mid.w, h: mid.h, p: mid.p, web: mid.web }, big: big ? { w: big.w, h: big.h, p: big.p, web: big.web } : null,
    aluA: { m: r2(sumA.m), mW: r2(sumA.m * 1.3), b: r2(sumA.b), bW: r2(sumA.b * 1.3) },
    rows,
  };
});
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(out.length, "jobs");
for (const j of out) console.log(j.no, j.id, j.name, `กลาง ${j.mid.w}×${j.mid.h}${j.mid.p ? "×" + j.mid.p : ""}`, j.big ? `ใหญ่ ${j.big.w}×${j.big.h}${j.big.p ? "×" + j.big.p : ""}` : "-", "rows", j.rows.length);
