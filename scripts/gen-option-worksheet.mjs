#!/usr/bin/env node
/**
 * gen-option-worksheet — แบบฟอร์มตรวจ "จำลองออปชั่นบาน" (โจทย์ + เฉลย ในแผ่นเดียวกัน · พิมพ์ A4)
 *   เจ้าของ 19 ต.ค.69: "ทำเป็นแบบฟอร์มให้คนตรวจ รอบนี้เอารวมเฉลย และโจทย์ ในแผ่นเดียวกันเลย"
 *   ตัวคิดชุดเดียวกับหน้า จำลองออปชั่นบาน (scripts/gen-option-sim.mjs) — ตัวเลขเฉลย = ตัวเลขในหน้านั้นเป๊ะ
 *   node scripts/gen-option-worksheet.mjs docs/ใบตรวจออปชั่นบาน.html → พิมพ์ PDF ด้วย Chrome
 */
import fs from "node:fs";
import { PRICE, EX, PH, INSET, calc, svgDoor } from "./gen-option-sim.mjs";

const f0 = (v) => Math.round(v).toLocaleString("en-US");
const f2 = (v) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const cm = (m) => Math.round(m * 100);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// แถวเส้น: [ชื่อ, คำอธิบาย, barRow] → 4 คู่ช่อง (ชิ้น×ยาว · ยาวรวม · เส้น · บาท)
const bar = (label, sub, r) => ({ label, sub, code: r.item.code || "", a: [`${r.pieces} × ${cm(r.lenEach)}`, `${f2(r.total)} ม.`, `${f2(r.bars)}`, f0(r.amt)],
  hint: `÷ ${r.item.bar || 6} × 1.3 · ${f0(r.item.per)}/เส้น` });

function blocks(e) {
  const { div, sell, o } = calc(e);
  const P = o.panel;
  const out = [];
  const glass = { label: "หักกระจกที่ไม่ต้องใช้", sub: `ช่องล่าง ${cm(e.lw)}×80 ซม. × ${e.p} บาน`, code: "", a: ["", `${f2(P.area)} ตร.ม.`, "", "−" + f0(P.glassSave)], hint: "× 264/ตร.ม." };
  const wave = bar("ลูกฟูก 2 หน้า เรียงตั้ง", `กว้างช่อง ${cm(e.lw)} ÷ 10 ซม. ปัดขึ้น = แผ่น/บาน · สูง 80`, P.wave);
  const comp = { label: "แผ่นคอมโพสิต", sub: `${cm(e.lw)}×80 ซม. × ${e.p} บาน`, code: "", a: [`${e.p} แผ่น`, `${f2(P.area)} ตร.ม.`, "", f0(P.compAmt)], hint: "× 1,650/ตร.ม. (สมมติ)" };
  const beadH = bar("+ คิ้วนอน (กรอบบนแผ่น)", `กว้างช่อง − 10 − 10 · 2 เส้น/กรอบ × 2 ฝั่ง`, P.bead.h);
  const beadV = bar("+ คิ้วตั้ง (กรอบบนแผ่น)", `80 − 10 − 10 · 2 เส้น/กรอบ × 2 ฝั่ง`, P.bead.v);
  const r39 = (qty, unit, rate, sell39, note) => ({ qty: `${f2(qty)} ${unit}`, rate, sell: f0(sell39), note });
  out.push({ key: "grid", title: "คาดตาราง · 2 เส้นนอน + 1 เส้นตั้ง ทุกบาน · ติด 2 ฝั่ง", show: { grid: 1 },
    given: `เส้นคาดยาวเท่าช่องกระจก (นอน ${cm(e.lw)} · ตั้ง ${cm(e.gh)} ซม.) · เส้นกลาง ${PRICE.mid.per}/เส้น 6 ม.`,
    rows: o.grid.rows.map(([l, s, r]) => bar(l, s, r)), cost: o.grid.cost,
    r39: r39(2 * e.W + e.p * e.H, "ม.", "× 200/ม.", o.grid.r39.sell, `นอน 2 × กว้างทั้งชุด + ตั้ง ${e.p} × สูง`) });
  out.push({ key: "wrap", title: "ครอบวงกบ 3 ด้าน (บน + ข้าง 2)", show: { wrap: 1 },
    given: `กล่องเรียบ 1.6"×4" ${PRICE.wrap.per}/เส้น 6 ม. · ยาวเท่าวงกบ`,
    rows: o.wrap.rows.map(([l, s, r]) => bar(l, s, r)), cost: o.wrap.cost,
    r39: r39(e.W + 2 * e.H, "ม.", "× 700/ม.", o.wrap.r39.sell, "กว้าง + สูง × 2") });
  const pg = `ทึบล่างสูง 80 ซม. ทุกบาน · ลูกฟูก ${PRICE.wave.per}/เส้น 6 ม. (แผ่นกว้าง 10 ซม.) · กระจก 264/ตร.ม.`;
  const bg = ` · คิ้วเป็นกรอบสี่เหลี่ยมห่างขอบแผ่น ${cm(INSET)} ซม. ติด 2 ฝั่ง · ราคาคิ้วตัวอย่าง F7996 ${PRICE.bead.per}/เส้น 6.4 ม.`;
  const rW = r39(e.W * PH, "ตร.ม.", "× 3,500/ตร.ม.", P.r39.wave, "กว้างทั้งชุด × 0.8 · ไม่มีตัวเลือกคิ้ว");
  const rC = r39(e.W * PH, "ตร.ม.", "× 3,300/ตร.ม.", P.r39.comp, "กว้างทั้งชุด × 0.8 · ไม่มีตัวเลือกคิ้ว");
  out.push({ key: "wave", title: "ทึบล่างลูกฟูก · ไม่บวกคิ้ว", show: { panel: "wave" }, given: pg, rows: [wave, glass], cost: P.waveCost, r39: rW });
  out.push({ key: "waveb", title: "ทึบล่างลูกฟูก · บวกคิ้ว", show: { panel: "wave", bead: 1 }, given: pg + bg, rows: [wave, glass, beadH, beadV], cost: P.waveCost + P.bead.amt, r39: rW });
  out.push({ key: "comp", title: "ทึบล่างคอมโพสิต · ไม่บวกคิ้ว", show: { panel: "comp" }, given: pg.replace(/ลูกฟูก [^·]+· /, "คอมโพสิต 1,650/ตร.ม. (สมมติ) · "), rows: [comp, glass], cost: P.compCost, r39: rC });
  out.push({ key: "compb", title: "ทึบล่างคอมโพสิต · บวกคิ้ว", show: { panel: "comp", bead: 1 }, given: pg.replace(/ลูกฟูก [^·]+· /, "คอมโพสิต 1,650/ตร.ม. (สมมติ) · ") + bg, rows: [comp, glass, beadH, beadV], cost: P.compCost + P.bead.amt, r39: rC });
  return out.map((b) => ({ ...b, e, div, sellReal: sell(b.cost) }));
}

let no = 0;
const W = (v) => `<td class="w"></td><td class="a">${v}</td>`;   // ช่องเขียน + เฉลย
function blockHtml(b) {
  no++;
  const e = b.e;
  const rows = b.rows.map((r) => `<tr><td class="nm">${esc(r.label)}<span class="sub">${esc(r.sub)}${r.code ? " · " + r.code : ""} · <i>${esc(r.hint)}</i></span></td>${r.a.map(W).join("")}</tr>`).join("");
  return `<section class="blk">
  <div class="bh"><b class="no">ข้อ ${no}</b> <b>${esc(e.name)}</b> · ${esc(b.title)}</div>
  <div class="bb"><div class="pic">${svgDoor(e, b.show)}</div><div class="cal">
  <p class="given"><b>โจทย์</b> ${esc(b.given)} · กำไรสุทธิ ${e.net}% → ขาย = ทุน ÷ ${b.div.toFixed(3)}</p>
  <table><colgroup><col class="c0"><col class="cw"><col class="ca"><col class="cw"><col class="ca"><col class="cw"><col class="ca"><col class="cw"><col class="ca"></colgroup>
  <thead><tr><th rowspan="2">ชิ้นงาน</th><th colspan="2">ชิ้น × ยาว (ซม.)</th><th colspan="2">ยาวรวม</th><th colspan="2">เส้น (เผื่อเศษ)</th><th colspan="2">บาท</th></tr>
  <tr>${"<th>เขียน</th><th class=\"a\">เฉลย</th>".repeat(4)}</tr></thead>
  <tbody>${rows}
  <tr class="tot"><td>ทุนรวม</td><td colspan="6"></td>${W(f0(b.cost))}</tr>
  <tr class="tot"><td>ราคาขาย ของจริง <span class="sub">ทุน ÷ ${b.div.toFixed(3)}</span></td><td colspan="6"></td>${W(f0(b.sellReal))}</tr>
  <tr class="r39"><td>R3.9 เหมา <span class="sub">${esc(b.r39.note)} ${esc(b.r39.rate)}</span></td><td colspan="2"></td>${W(b.r39.qty)}<td colspan="2"></td>${W(b.r39.sell)}</tr>
  </tbody></table>
  <p class="chk">ถูก / ผิด ......  หมายเหตุ .....................................................................................</p>
  </div></div></section>`;
}

const css = `
@page { size: A4 portrait; margin: 8mm 8mm 9mm; }
* { box-sizing: border-box; }
:root { --ink:#16202c; --muted:#566273; --line:#b9c3d1; --ans:#eef1f6; --glass:#d6e7f3; --panel:#c9ccd2; --comp:#e0d0ae; --old:#5b4fa6; --real:#0f6b5c; --hi:#c0392b; }
body { margin: 0; color: var(--ink); background: #fff; font: 8.4pt/1.3 "Leelawadee UI", "IBM Plex Sans Thai", Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--ink); padding-bottom: 2px; margin-bottom: 3px; }
.top h1 { font-size: 12.5pt; margin: 0; } .lead { margin: 0 0 5px; font-size: 7.6pt; color: var(--muted); }
.blk { break-inside: avoid; border-top: 1.5px solid var(--ink); padding-top: 3px; margin-bottom: 6px; }
.bh { font-size: 9pt; margin-bottom: 2px; } .no { background: var(--ink); color: #fff; border-radius: 3px; padding: 0 4px; font-size: 7.8pt; }
.bb { display: grid; grid-template-columns: 30mm 1fr; gap: 3mm; } .cal { min-width: 0; }
svg.door { width: 100%; height: auto; display: block; }
.frame{fill:none;stroke:var(--ink);stroke-width:3} .leaf{fill:none;stroke:var(--muted);stroke-width:1.5} .meet{stroke:var(--ink);stroke-width:2}
.glass{fill:var(--glass);stroke:none} .panel{stroke:var(--ink);stroke-width:1} .panel.wave{fill:var(--panel)} .panel.comp{fill:var(--comp)}
.strip{stroke:var(--ink);stroke-width:.5;opacity:.5} .bead{fill:none;stroke:var(--hi);stroke-width:3} .grid{stroke:var(--old);stroke-width:2.5;stroke-dasharray:6 3}
.wrap{fill:none;stroke:var(--real);stroke-width:7} .knob{fill:var(--ink)} .arrow{fill:none;stroke:var(--muted);stroke-width:1.5} .dim{fill:var(--muted);font:11px sans-serif}
.given { margin: 0 0 2px; font-size: 7.5pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 0 3px; vertical-align: middle; }
th { background: #e9eef5; font-size: 7pt; text-align: center; line-height: 1.15; } th.a { background: #dfe5ee; }
td { height: 6.4mm; } td.nm { font-size: 7.8pt; line-height: 1.15; } .sub { display: block; font-size: 6.4pt; color: var(--muted); }
td.a { background: var(--ans); text-align: right; font-size: 7.6pt; color: #26364a; white-space: nowrap; } td.w { background: #fff; }
col.c0 { width: auto; } col.cw { width: 15mm; } col.ca { width: 15mm; }
tr.tot td:first-child, tr.r39 td:first-child { font-weight: 700; font-size: 7.8pt; } tr.r39 td:first-child { color: var(--old); }
.chk { margin: 2px 0 0; font-size: 7.4pt; color: var(--muted); white-space: nowrap; overflow: hidden; }
`;

const all = EX.flatMap(blocks);
const body = all.map(blockHtml).join("\n");
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ใบตรวจออปชั่นบาน</title><style>${css}</style></head><body>
<div class="top"><h1>ใบตรวจ จำลองออปชั่นบาน (โจทย์ + เฉลย)</h1><div>ผู้ตรวจ ........................ วันที่ ..................</div></div>
<p class="lead">${all.length} ข้อ · บานเปิด 2 แบบ บานเลื่อน SMS 2 แบบ · สีอบขาว · เขียนในช่อง "เขียน" แล้วเทียบกับช่อง "เฉลย" (สีเทา) · เส้นยาวรวม ÷ ยาวเส้น × 1.3 = จำนวนเส้น · จำนวนเส้น × ราคาเส้น = บาท</p>
${body}</body></html>`;
fs.writeFileSync(process.argv[2] || "docs/ใบตรวจออปชั่นบาน.html", html);
console.log("ok", all.length, "ข้อ");
