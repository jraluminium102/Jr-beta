// จำลองออปชั่น คาดตาราง / ครอบวงกบ / ทึบล่าง (ลูกฟูก · คอมโพสิต · บวก/ไม่บวกคิ้ว) — ของจริง vs เหมา R3.9
// node gen-sim.mjs <out.html>
import fs from "node:fs";

const PRICE = {
  mid: { code: "JR01678", name: "เส้นกลาง (อบขาว)", per: 150 },
  wrap: { code: "JR01984", name: "กล่องเรียบ 1.6\"×4\" (อบขาว)", per: 996 },
  wave: { code: "JR01993", name: "ลูกฟูกเรียบ 2 หน้า (อบขาว) · แผ่นกว้าง 10 ซม.", per: 491 },
  comp: { name: "แผ่นคอมโพสิต", perM2: 1650 },
  glass: { name: "กระจกเขียว 6 มม.", perM2: 264 },
  // คิ้วกรอบสี่เหลี่ยมบนแผ่นทึบ — ยังไม่รู้รุ่นที่ใช้จริง · ใช้ F7996 คิ้วลอยช่องแสง (455/เส้น 6.4 ม.) เป็นราคาตัวอย่าง
  bead: { code: "F7996", name: "คิ้วลอยช่องแสง (ตัวอย่างราคา)", per: 455, bar: 6.4 },
};
const BAR = 6, WASTE = 1.3, PH = 0.8, INSET = 0.10;   // เส้นเมืองทอง 6 ม. · เผื่อเศษ · ทึบล่างสูง 80 ซม. · คิ้วห่างขอบแผ่น 10 ซม. (เจ้าของ: 7-15 ซม.)
const EX = [
  { id: "d1", kind: "door", name: "บานเปิด 90×240 · 1 บาน", W: 0.9, H: 2.4, p: 1, lw: 0.74, gh: 2.2, net: 31, src: "ช่องกระจกกว้าง 74 ซม. สูง 220 ซม. (ยาวคิ้วขวาง/คิ้วตั้งของบาน)" },
  { id: "d2", kind: "door", name: "บานเปิด 200×240 · 2 บาน", W: 2.0, H: 2.4, p: 2, lw: 0.86, gh: 2.2, net: 31, src: "ช่องกระจกบานละ 86 × 220 ซม. (ยาวคิ้วขวาง/คิ้วตั้งของบาน)" },
  { id: "s1", kind: "slide", name: "บานเลื่อน SMS 250×240 · 2 บาน", W: 2.5, H: 2.4, p: 2, lw: 1.15, gh: 2.2, net: 40, src: "บานละกว้าง 115 ซม. (ยาวขวางบน/ล่าง) · ช่องกระจกสูงประมาณ 220 ซม." },
  { id: "s2", kind: "slide", name: "บานเลื่อน SMS 400×240 · 4 บาน", W: 4.0, H: 2.4, p: 4, lw: 0.93, gh: 2.2, net: 40, src: "บานละกว้าง 93 ซม. (ยาวขวางบน/ล่าง) · ช่องกระจกสูงประมาณ 220 ซม." },
];

const f0 = (v) => Math.round(v).toLocaleString("en-US");
const f2 = (v) => (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const cm = (m) => Math.round(m * 100);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// คิดเส้น: ยาวรวม ÷ 6 × 1.3 = จำนวนเส้น × ราคา
const barRow = (item, pieces, lenEach) => {
  const total = pieces * lenEach, bars = (total / (item.bar || BAR)) * WASTE, amt = bars * item.per;
  return { item, pieces, lenEach, total, bars, amt };
};

function calc(e) {
  const div = 1 - 30 / 130 - e.net / 100;
  const sell = (c) => c / div;
  const o = {};
  // คาดตาราง: 2 นอน + 1 ตั้ง ต่อบาน · ติด 2 ฝั่ง (ใน/นอก)
  const gH = barRow(PRICE.mid, 2 * 2 * e.p, e.lw), gV = barRow(PRICE.mid, 1 * 2 * e.p, e.gh);
  o.grid = { rows: [["เส้นนอน", "2 เส้น/บาน × 2 ฝั่ง × " + e.p + " บาน", gH], ["เส้นตั้ง", "1 เส้น/บาน × 2 ฝั่ง × " + e.p + " บาน", gV]],
    cost: gH.amt + gV.amt, r39: { lines: [`เส้นนอน 2 เส้น × กว้างทั้งชุด ${f2(e.W)} ม. = ${f2(2 * e.W)} ม.`, `เส้นตั้ง ${e.p} เส้น × สูง ${f2(e.H)} ม. = ${f2(e.p * e.H)} ม.`, `รวม ${f2(2 * e.W + e.p * e.H)} ม. × 200 บาท/ม. (สีขาว/เทา)`], sell: (2 * e.W + e.p * e.H) * 200 } };
  // ครอบวงกบ 3 ด้าน: บน 1 + ข้าง 2
  const wT = barRow(PRICE.wrap, 1, e.W), wS = barRow(PRICE.wrap, 2, e.H);
  o.wrap = { rows: [["ด้านบน", "1 ท่อน", wT], ["ด้านข้าง", "2 ท่อน", wS]], cost: wT.amt + wS.amt,
    r39: { lines: [`รอบวงกบ 3 ด้าน = กว้าง ${f2(e.W)} + สูง ${f2(e.H)} × 2 = ${f2(e.W + 2 * e.H)} ม.`, `× 700 บาท/ม. (สีขาว/เทา)`], sell: (e.W + 2 * e.H) * 700 } };
  // ทึบล่าง
  const strips = Math.ceil((e.lw * 100) / 10);
  const wave = barRow(PRICE.wave, strips * e.p, PH);
  const area = e.lw * PH * e.p, glassSave = area * PRICE.glass.perM2, compAmt = area * PRICE.comp.perM2;
  // คิ้ว = กรอบสี่เหลี่ยมบนแผ่นทึบ ห่างขอบแผ่น INSET ทุกด้าน · 1 กรอบ/บาน/ฝั่ง × 2 ฝั่ง (เจ้าของ 17 ต.ค.69 "คิ้ววิ่งเป็นรูปสี่เหลี่ยม อยู่บนอลูทึบ เว้นขอบ 7-15 ซม.")
  const bW = e.lw - 2 * INSET, bH = PH - 2 * INSET;
  const beadH = barRow(PRICE.bead, 2 * 2 * e.p, bW), beadV = barRow(PRICE.bead, 2 * 2 * e.p, bH);
  const bead = { amt: beadH.amt + beadV.amt, h: beadH, v: beadV, bW, bH };
  const r39Area = e.W * PH;
  o.panel = { strips, wave, area, glassSave, compAmt, bead,
    waveCost: wave.amt - glassSave, compCost: compAmt - glassSave,
    r39: { area: r39Area, wave: r39Area * 3500, comp: r39Area * 3300 } };
  return { div, sell, o };
}

// ── ภาพบาน (SVG) — มาตราส่วนจริง ──
function svgDoor(e, show) {
  const S = 100, pad = 26, wrapT = 0.06;   // 1 ม. = 100 px · กรอบครอบวงกบ 6 ซม. (ภาพ)
  const Wpx = e.W * S, Hpx = e.H * S, vw = Wpx + pad * 2 + 40, vh = Hpx + pad * 2 + 20;
  const x0 = pad + 20, y0 = pad;
  const leafW = Wpx / e.p, gx = (leafW - e.lw * S) / 2, gyTop = (Hpx - e.gh * S) / 2;
  let g = "";
  if (show.wrap) g += `<path d="M ${x0 - wrapT * S} ${y0 + Hpx} V ${y0 - wrapT * S} H ${x0 + Wpx + wrapT * S} V ${y0 + Hpx}" class="wrap"/>`;
  g += `<rect x="${x0}" y="${y0}" width="${Wpx}" height="${Hpx}" class="frame"/>`;
  for (let i = 0; i < e.p; i++) {
    const lx = x0 + i * leafW;
    if (e.kind === "slide" && i > 0) g += `<line x1="${lx}" y1="${y0}" x2="${lx}" y2="${y0 + Hpx}" class="meet"/>`;
    g += `<rect x="${lx + 4}" y="${y0 + 4}" width="${leafW - 8}" height="${Hpx - 8}" class="leaf"/>`;
    const glx = lx + gx, gly = y0 + gyTop, glw = e.lw * S, glh = e.gh * S;
    const panelH = show.panel ? PH * S : 0;
    g += `<rect x="${glx}" y="${gly}" width="${glw}" height="${glh - panelH}" class="glass"/>`;
    if (show.panel) {
      g += `<rect x="${glx}" y="${gly + glh - panelH}" width="${glw}" height="${panelH}" class="panel ${show.panel}"/>`;
      if (show.panel === "wave") for (let k = 1; k < Math.ceil(e.lw * 10); k++) g += `<line x1="${glx + k * 10}" y1="${gly + glh - panelH}" x2="${glx + k * 10}" y2="${gly + glh}" class="strip"/>`;
      if (show.bead) g += `<rect x="${glx + INSET * S}" y="${gly + glh - panelH + INSET * S}" width="${glw - 2 * INSET * S}" height="${panelH - 2 * INSET * S}" class="bead"/>`;
    }
    if (show.grid) {
      const gTop = gly, gH = glh;
      for (const t of [1 / 3, 2 / 3]) g += `<line x1="${glx}" y1="${gTop + gH * t}" x2="${glx + glw}" y2="${gTop + gH * t}" class="grid"/>`;
      g += `<line x1="${glx + glw / 2}" y1="${gTop}" x2="${glx + glw / 2}" y2="${gTop + gH}" class="grid"/>`;
    }
    if (e.kind === "door") g += `<circle cx="${i % 2 ? lx + 14 : lx + leafW - 14}" cy="${y0 + Hpx * 0.52}" r="3.5" class="knob"/>`;
    else g += `<path d="M ${lx + leafW / 2 - 9} ${y0 + Hpx + 12} h 18 m -5 -4 l 5 4 l -5 4" class="arrow"/>`;
  }
  // มิติ
  g += `<text x="${x0 + Wpx / 2}" y="${y0 - 10}" class="dim" text-anchor="middle">${cm(e.W)} ซม.</text>`;
  g += `<text x="${x0 - 12}" y="${y0 + Hpx / 2}" class="dim" text-anchor="middle" transform="rotate(-90 ${x0 - 12} ${y0 + Hpx / 2})">${cm(e.H)} ซม.</text>`;
  if (show.panel) g += `<text x="${x0 + Wpx + 6}" y="${y0 + Hpx - gyTop - PH * S / 2}" class="dim">80</text>`;
  return `<svg viewBox="0 0 ${vw} ${vh}" class="door" role="img" aria-label="${esc(e.name)}">${g}</svg>`;
}

const bt = (r) => `<tr><td>${esc(r[0])}<span class="sub">${esc(r[1])}</span></td><td class="mono">${r[2].item.code || ""}</td><td class="n">${r[2].pieces} × ${cm(r[2].lenEach)}</td><td class="n">${f2(r[2].total)} ม.</td><td class="n">${f2(r[2].total)} ÷ ${r[2].item.bar || 6} × 1.3 = <b>${f2(r[2].bars)}</b></td><td class="n">${f0(r[2].item.per)}</td><td class="n">${f0(r[2].amt)}</td></tr>`;
const thead = `<thead><tr><th>ชิ้นงาน</th><th>รหัส</th><th class="n">ชิ้น × ยาว (ซม.)</th><th class="n">ยาวรวม</th><th class="n">เส้น (ยาวรวม ÷ ยาวเส้น × 1.3)</th><th class="n">฿/เส้น</th><th class="n">บาท</th></tr></thead>`;

function result(costRows, cost, sell, r39Lines, r39Sell, e, div) {
  const diff = sell - r39Sell, pct = Math.round((sell / r39Sell - 1) * 100);
  return `<div class="cmp">
    <div class="col real"><h5>คิดจากของจริง</h5>${costRows}
      <p class="eq">ทุน <b>${f0(cost)}</b> ÷ ${div.toFixed(3)} <span class="why">(1 − 30/130 − กำไรสุทธิ ${e.net}%)</span> = ขาย <b class="big">${f0(sell)}</b></p></div>
    <div class="col r39"><h5>R3.9 ที่เว็บใช้ตอนนี้ (เหมาราคาขาย)</h5><ol>${r39Lines.map((l) => `<li>${l}</li>`).join("")}</ol>
      <p class="eq">ขาย <b class="big">${f0(r39Sell)}</b> <span class="why">ทุนในระบบ = ขาย ÷ 2 = ${f0(r39Sell / 2)}</span></p></div>
    <div class="verdict ${diff < 0 ? "lo" : "hi"}">ของจริง${diff < 0 ? "ถูกกว่า" : "แพงกว่า"} R3.9 <b>${f0(Math.abs(diff))}</b> บาท (${pct > 0 ? "+" : ""}${pct}%)</div>
  </div>`;
}

function section(e) {
  const { div, sell, o } = calc(e);
  const P = o.panel;
  const opt = (key, title, show, body) => `<article class="opt" id="${e.id}-${key}"><div class="pic">${svgDoor(e, show)}</div><div class="calc"><h4>${title}</h4>${body}</div></article>`;
  const grid = opt("grid", "คาดตาราง · 2 เส้นนอน + 1 เส้นตั้ง ทุกบาน · ติด 2 ฝั่ง (ใน/นอก)", { grid: 1 },
    `<p class="note">เส้นคาดยาวเท่าช่องกระจก: นอน ${cm(e.lw)} ซม. · ตั้ง ${cm(e.gh)} ซม.</p><div class="tw"><table>${thead}<tbody>${o.grid.rows.map(bt).join("")}</tbody></table></div>`
    + result("", o.grid.cost, sell(o.grid.cost), o.grid.r39.lines, o.grid.r39.sell, e, div));
  const wrap = opt("wrap", "ครอบวงกบ 3 ด้าน (บน + ข้าง 2)", { wrap: 1 },
    `<p class="note">กล่องเรียบ 1.6"×4" ครอบรอบวงกบ ยาวเท่าวงกบ (เส้นเมืองทอง 6 ม.)</p><div class="tw"><table>${thead}<tbody>${o.wrap.rows.map(bt).join("")}</tbody></table></div>`
    + result("", o.wrap.cost, sell(o.wrap.cost), o.wrap.r39.lines, o.wrap.r39.sell, e, div));
  const glassLine = `<tr class="minus"><td>หักกระจกที่ไม่ต้องใช้<span class="sub">ช่องล่าง ${cm(e.lw)}×80 ซม. × ${e.p} บาน = ${f2(P.area)} ตร.ม.</span></td><td></td><td></td><td></td><td class="n">${f2(P.area)} ตร.ม. × 264</td><td></td><td class="n">−${f0(P.glassSave)}</td></tr>`;
  const beadLine = bt(["+ คิ้วนอน (กรอบบนแผ่น)", `2 เส้น/กรอบ × 2 ฝั่ง × ${e.p} บาน · ยาว ${cm(e.lw)} − 10 − 10 = ${cm(P.bead.bW)} ซม.`, P.bead.h]).replace('<tr>','<tr class="plus">')
    + bt(["+ คิ้วตั้ง (กรอบบนแผ่น)", `2 เส้น/กรอบ × 2 ฝั่ง × ${e.p} บาน · สูง 80 − 10 − 10 = ${cm(P.bead.bH)} ซม.`, P.bead.v]).replace('<tr>','<tr class="plus">');
  const r39Wave = [`กว้างทั้งชุด ${f2(e.W)} ม. × สูงแผ่น 0.8 ม. = ${f2(P.r39.area)} ตร.ม.`, `× 3,500 บาท/ตร.ม. (ลูกฟูก สีขาว)`, `R3.9 ไม่มีตัวเลือกคิ้ว → บวก/ไม่บวกคิ้ว ราคาเท่ากัน`];
  const r39Comp = [`กว้างทั้งชุด ${f2(e.W)} ม. × สูงแผ่น 0.8 ม. = ${f2(P.r39.area)} ตร.ม.`, `× 3,300 บาท/ตร.ม. (คอมโพสิต ไม่คิดสี)`, `R3.9 ไม่มีตัวเลือกคิ้ว → บวก/ไม่บวกคิ้ว ราคาเท่ากัน`];
  const waveRow = `<tr><td>ลูกฟูก 2 หน้า เรียงตั้ง<span class="sub">${P.strips} แผ่น/บาน (กว้าง ${cm(e.lw)} ÷ 10 ซม. ปัดขึ้น) × ${e.p} บาน · สูง 80</span></td><td class="mono">${PRICE.wave.code}</td><td class="n">${P.wave.pieces} × 80</td><td class="n">${f2(P.wave.total)} ม.</td><td class="n">${f2(P.wave.total)} ÷ 6 × 1.3 = <b>${f2(P.wave.bars)}</b></td><td class="n">491</td><td class="n">${f0(P.wave.amt)}</td></tr>`;
  const compRow = `<tr><td>แผ่นคอมโพสิต<span class="sub">${cm(e.lw)}×80 ซม. × ${e.p} บาน</span></td><td class="mono">—</td><td class="n">${e.p} แผ่น</td><td class="n">${f2(P.area)} ตร.ม.</td><td class="n">${f2(P.area)} ตร.ม. × 1,650 <span class="flag">สมมติ</span></td><td></td><td class="n">${f0(P.compAmt)}</td></tr>`;
  const tbl = (rows) => `<div class="tw"><table>${thead}<tbody>${rows}</tbody></table></div>`;
  const pW0 = opt("wave", "ทึบล่างลูกฟูก · ไม่บวกคิ้ว · สูง 80 ซม. ทุกบาน", { panel: "wave" }, tbl(waveRow + glassLine) + result("", P.waveCost, sell(P.waveCost), r39Wave, P.r39.wave, e, div));
  const pW1 = opt("waveb", "ทึบล่างลูกฟูก · บวกคิ้ว", { panel: "wave", bead: 1 }, tbl(waveRow + glassLine + beadLine) + result("", P.waveCost + P.bead.amt, sell(P.waveCost + P.bead.amt), r39Wave, P.r39.wave, e, div));
  const pC0 = opt("comp", "ทึบล่างคอมโพสิต · ไม่บวกคิ้ว · สูง 80 ซม. ทุกบาน", { panel: "comp" }, tbl(compRow + glassLine) + result("", P.compCost, sell(P.compCost), r39Comp, P.r39.comp, e, div));
  const pC1 = opt("compb", "ทึบล่างคอมโพสิต · บวกคิ้ว", { panel: "comp", bead: 1 }, tbl(compRow + glassLine + beadLine) + result("", P.compCost + P.bead.amt, sell(P.compCost + P.bead.amt), r39Comp, P.r39.comp, e, div));
  // สรุปบนสุดของแต่ละตัวอย่าง
  const S = [["คาดตาราง", sell(o.grid.cost), o.grid.r39.sell, "grid"], ["ครอบวงกบ 3 ด้าน", sell(o.wrap.cost), o.wrap.r39.sell, "wrap"],
    ["ทึบล่างลูกฟูก ไม่บวกคิ้ว", sell(P.waveCost), P.r39.wave, "wave"], ["ทึบล่างลูกฟูก บวกคิ้ว", sell(P.waveCost + P.bead.amt), P.r39.wave, "waveb"],
    ["ทึบล่างคอมโพสิต ไม่บวกคิ้ว", sell(P.compCost), P.r39.comp, "comp"], ["ทึบล่างคอมโพสิต บวกคิ้ว", sell(P.compCost + P.bead.amt), P.r39.comp, "compb"]];
  const sum = `<div class="tw"><table class="sum"><thead><tr><th>ออปชั่น</th><th class="n">ขาย · ของจริง</th><th class="n">ขาย · R3.9</th><th class="n">ต่าง</th></tr></thead><tbody>${S.map(([n, a, b, k]) => `<tr><td><a href="#${e.id}-${k}">${n}</a></td><td class="n">${f0(a)}</td><td class="n">${f0(b)}</td><td class="n ${a < b ? "lo" : "hi"}">${a < b ? "−" : "+"}${f0(Math.abs(a - b))} (${Math.round((a / b - 1) * 100)}%)</td></tr>`).join("")}</tbody></table></div>`;
  return `<section class="ex" id="${e.id}"><header class="exh"><h2>${esc(e.name)}</h2><p>สีอบขาว · กำไรสุทธิรุ่นนี้ ${e.net}% · ${esc(e.src)}</p></header>${sum}${grid}${wrap}${pW0}${pW1}${pC0}${pC1}</section>`;
}

const css = `
/* ผังหน้า: แถบนำทางตัวอย่าง → ตัวอย่างละส่วน (สรุป + ออปชั่นทีละตัว: รูปบานซ้าย · วิธีคิดขวา) */
:root{--bg:#f6f7f9;--paper:#ffffff;--ink:#16202c;--muted:#566273;--line:#d5dbe3;--real:#0f6b5c;--realbg:#e6f3f0;--old:#5b4fa6;--oldbg:#efedf8;--lo:#0f6b5c;--hi:#b03a2e;--glass:#cfe3f1;--panel:#c9ccd2;--comp:#d8c7a6;
--fd:"IBM Plex Sans Thai",Tahoma,sans-serif;--fm:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11161d;--paper:#18202a;--ink:#e6ebf1;--muted:#9aa6b5;--line:#2c3744;--real:#5ec7b2;--realbg:#173a35;--old:#a99cf0;--oldbg:#262245;--lo:#5ec7b2;--hi:#f08a7e;--glass:#24445c;--panel:#4a4f58;--comp:#6b5a3c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#11161d;--paper:#18202a;--ink:#e6ebf1;--muted:#9aa6b5;--line:#2c3744;--real:#5ec7b2;--realbg:#173a35;--old:#a99cf0;--oldbg:#262245;--lo:#5ec7b2;--hi:#f08a7e;--glass:#24445c;--panel:#4a4f58;--comp:#6b5a3c;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--fd)}
.wrapper{max-width:1180px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 60px}
h1{font-size:26px;margin:0 0 6px;text-wrap:balance} h2{font-size:21px;margin:0} h4{font-size:16px;margin:0 0 6px} h5{font-size:13px;margin:0 0 4px;letter-spacing:.02em}
.lead{color:var(--muted);max-width:70ch;margin:0 0 14px}
.box{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:0 0 14px}
.box ul{margin:4px 0 0;padding-left:20px} .box li{margin:2px 0}
.nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px} .nav a{border:1px solid var(--line);background:var(--paper);color:var(--ink);text-decoration:none;padding:5px 10px;border-radius:999px;font-size:14px} .nav a:focus-visible,.nav a:hover{border-color:var(--real)}
.ex{margin:0 0 34px} .exh{border-bottom:2px solid var(--ink);padding-bottom:6px;margin-bottom:10px} .exh p{margin:2px 0 0;color:var(--muted);font-size:14px}
.opt{display:grid;grid-template-columns:minmax(170px,240px) 1fr;gap:16px;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:14px;margin:12px 0}
.opt .calc{min-width:0} .pic{align-self:start}
@media (max-width:720px){.opt{grid-template-columns:1fr}.pic{max-width:240px}}
svg.door{width:100%;height:auto;display:block}
.frame{fill:none;stroke:var(--ink);stroke-width:3} .leaf{fill:none;stroke:var(--muted);stroke-width:1.5} .meet{stroke:var(--ink);stroke-width:2}
.glass{fill:var(--glass);stroke:none} .panel{stroke:var(--ink);stroke-width:1} .panel.wave{fill:var(--panel)} .panel.comp{fill:var(--comp)}
.strip{stroke:var(--ink);stroke-width:.5;opacity:.5} .bead{fill:none;stroke:var(--hi);stroke-width:3} .grid{stroke:var(--old);stroke-width:2.5;stroke-dasharray:6 3}
.wrap{fill:none;stroke:var(--real);stroke-width:7} .knob{fill:var(--ink)} .arrow{fill:none;stroke:var(--muted);stroke-width:1.5} .dim{fill:var(--muted);font:11px var(--fd)}
.note{margin:0 0 6px;color:var(--muted);font-size:14px}
.tw{overflow-x:auto} table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top} th{font-size:12.5px;color:var(--muted);font-weight:600}
td.n,th.n{text-align:right;white-space:nowrap} .mono{font-family:var(--fm);font-size:12.5px;white-space:nowrap}
.sub{display:block;font-size:12px;color:var(--muted)} tr.minus td{color:var(--lo)} tr.plus td{color:var(--hi)}
.flag{font-size:11px;background:var(--oldbg);color:var(--old);border-radius:4px;padding:0 4px}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px} @media (max-width:720px){.cmp{grid-template-columns:1fr}}
.col{border-radius:6px;padding:8px 10px;min-width:0} .col.real{background:var(--realbg)} .col.r39{background:var(--oldbg)} .col.real h5{color:var(--real)} .col.r39 h5{color:var(--old)}
.col ol{margin:0;padding-left:18px;font-size:14px} .eq{margin:6px 0 0;font-size:14px} .eq .big{font-size:18px} .why{color:var(--muted);font-size:12.5px}
.verdict{grid-column:1/-1;font-size:14px;padding:4px 2px;font-weight:600} .verdict.lo,.n.lo{color:var(--lo)} .verdict.hi,.n.hi{color:var(--hi)}
table.sum{background:var(--paper);border:1px solid var(--line);border-radius:8px} table.sum a{color:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;color:var(--muted)} .sw{display:inline-block;width:18px;height:10px;vertical-align:-1px;margin-right:4px;border-radius:2px}
`;

const html = `<title>จำลองออปชั่นบาน</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=IBM+Plex+Mono&display=swap">
<style>${css}</style>
<div class="wrapper">
<h1>จำลองออปชั่น: คาดตาราง · ครอบวงกบ · ทึบล่าง</h1>
<p class="lead">ถ้าคิดออปชั่นจาก "ของจริงที่ใช้" แทนราคาเหมาของ R3.9 จะได้ราคาเท่าไหร่ — บานเปิด 2 ตัวอย่าง บานเลื่อน SMS 2 ตัวอย่าง · ทุกตัวอย่างสีอบขาว · ทึบล่างสูง 80 ซม. ทุกบาน · แต่ละออปชั่นมีรูปบาน ของที่ใช้ทีละชิ้น และวิธีคิดของ R3.9 คู่กัน</p>
<div class="box"><b>หลักคิด 2 แบบ</b><ul>
<li><b style="color:var(--real)">ของจริง</b>: นับของที่ใช้ (ยาว × จำนวนชิ้น) → เส้น 6 ม. เผื่อเศษ × 1.3 → × ราคาสโตร์ = ทุน → ขาย = ทุน ÷ (1 − 30/130 − กำไรสุทธิของรุ่น) แบบเดียวกับตัวบาน · ยังไม่รวมค่าแรงตัด/ประกอบออปชั่น</li>
<li><b style="color:var(--old)">R3.9 (เว็บตอนนี้)</b>: ราคาขายเหมาต่อเมตร/ตร.ม. ตามขนาดทั้งชุด บวกเข้าราคาขายตรง ๆ · ทุนในระบบ = ขาย ÷ 2 · ราคาเหมานี้น่าจะรวมค่าแรงแล้ว</li>
</ul></div>
<div class="box"><b>ราคาของที่ใช้ (สโตร์ · สีอบขาว)</b><ul>
<li>เส้นกลาง JR01678 · 150 บาท/เส้น 6 ม. — คาดตาราง</li>
<li>คิ้วกรอบบนแผ่นทึบ · <span class="flag">ราคาตัวอย่าง</span> F7996 คิ้วลอยช่องแสง 455 บาท/เส้น 6.4 ม.</li>
<li>กล่องเรียบ 1.6"×4" JR01984 · 996 บาท/เส้น 6 ม. — ครอบวงกบ</li>
<li>ลูกฟูกเรียบ 2 หน้า JR01993 · 491 บาท/เส้น 6 ม. · แผ่นกว้าง 10 ซม. เรียงตั้งเต็มช่อง</li>
<li>คอมโพสิต · <span class="flag">สมมติ</span> 1,650 บาท/ตร.ม. (สโตร์ยังไม่มีราคา · ใช้ครึ่งหนึ่งของขาย R3.9)</li>
<li>กระจกเขียว 6 มม. · 264 บาท/ตร.ม. — ทึบล่างแทนที่กระจก จึงหักค่ากระจกช่องล่างออก</li>
</ul></div>
<div class="box legend"><span><i class="sw" style="background:var(--glass)"></i>กระจก</span><span><i class="sw" style="background:var(--panel)"></i>ลูกฟูก</span><span><i class="sw" style="background:var(--comp)"></i>คอมโพสิต</span><span><i class="sw" style="background:var(--old)"></i>คาดตาราง (เส้นประ)</span><span><i class="sw" style="background:var(--real)"></i>ครอบวงกบ</span><span><i class="sw" style="background:var(--hi)"></i>คิ้ว</span></div>
<nav class="nav">${EX.map((e) => `<a href="#${e.id}">${esc(e.name)}</a>`).join("")}</nav>
${EX.map(section).join("\n")}
<div class="box"><b>สิ่งที่สมมติไว้ (รอเจ้าของยืนยัน)</b><ul>
<li>คิ้วของทึบล่าง = กรอบสี่เหลี่ยมบนแผ่น ห่างขอบ 10 ซม. (เจ้าของบอก 7–15 ซม.) · ติด 2 ฝั่ง (ใน/นอก) · <span class="flag">ราคาตัวอย่าง</span> ใช้ F7996 คิ้วลอยช่องแสง 455 บาท/เส้น 6.4 ม. เพราะยังไม่รู้ว่าใช้คิ้วรุ่นไหน (สโตร์มี คิ้วลอยเทเหลี่ยม ตัวเดิน+ตัวตบ แต่ยังไม่มีราคา)</li>
<li>คาดตาราง ติด 2 ฝั่ง (ใน/นอก) · เส้นยาวเท่าช่องกระจก</li>
<li>ครอบวงกบใช้กล่องเรียบ 1.6"×4" แบบเดียวกับบานเปิด · ยังไม่ใส่บังใบ</li>
<li>ราคาคอมโพสิต 1,650 บาท/ตร.ม.</li>
<li>ช่องกระจกของบานคิดจากยาวคิ้ว/ขวางของบานในเว็บ (ประมาณ)</li>
</ul></div>
</div>`;

// ใบตรวจ (gen-option-worksheet.mjs) import ตัวคิดชุดเดียวกัน — รันไฟล์นี้ตรง ๆ ถึงจะเขียนหน้า HTML
if (process.argv[1] && process.argv[1].endsWith("gen-option-sim.mjs") && process.argv[2]) { fs.writeFileSync(process.argv[2], html); console.log("ok", process.argv[2]); }
export { PRICE, EX, BAR, WASTE, PH, INSET, calc, svgDoor, css as simCss };
