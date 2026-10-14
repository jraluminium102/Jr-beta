#!/usr/bin/env node
/**
 * gen-net-report — รายงาน "ราคาขายใหม่ (ยึดกำไรสุทธิตาราง R4.1) เทียบราคาขายเดิมในตาราง R4.1"
 *   node scripts/gen-net-report.mjs --new <cmp-net.json> [--old <cmp-old.json>] [--out docs/ราคาตามกำไรสุทธิR41.html]
 *   cmp-*.json = ผลจาก scripts/gen-r41-compare-data.mjs (new = หลังเปิดกำไรสุทธิ · old = ก่อนเปิด ใช้โชว์ "ขายเว็บก่อนแก้")
 *
 * เจ้าของขอ 13 ต.ค.69: "เอากำไรสุทธิจากไฟล์ R4.1 เป็นหลัก เป็นตัวตัดสินราคาขายของทุน · ยึดกำไรสุทธิให้ตรงตามไฟล์เป๊ะ ๆ
 *   แล้วค่อยเทียบราคากับราคาขายเดิมของ R4.1 ว่าอันไหนต่างเยอะ ต่างน้อย"
 */
import fs from "node:fs";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const NEW = JSON.parse(fs.readFileSync(arg("--new"), "utf8")).rows;
const OLD = arg("--old") ? JSON.parse(fs.readFileSync(arg("--old"), "utf8")).rows : null;
const OUT = arg("--out") || "docs/ราคาตามกำไรสุทธิR41.html";
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
// 14 ต.ค.69 ใช้คำอธิบายภาษาง่าย (เจ้าของอ่านข้อความเทคนิคเดิมไม่เข้าใจ)
const WHY = JSON.parse(fs.readFileSync("scripts/fixtures/r41-why-plain.json", "utf8"));
const reasonOf = (id, vk) => WHY[id + "|" + (vk || "")] || WHY[id] || "";
const netT = (id, vk) => { const N = PB.R41.net[id]; return N == null ? null : typeof N === "number" ? N : N[vk] ?? N._ ?? null; };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
const sp = (p, d = 1) => (p == null ? "—" : (p > 0.05 ? "+" : p < -0.05 ? "−" : "") + Math.abs(p).toFixed(d) + "%");
const net = (sT, cT) => (sT > 0 ? ((sT - (sT * 30) / 130 - cT) / sT) * 100 : null);
const band = (a) => (a == null ? "na" : a <= 3 ? "lo" : a <= 8 ? "mid" : "hi");
const BAND = { lo: "ต่างน้อย", mid: "ต่างกลาง", hi: "ต่างเยอะ", na: "—" };
const chip = (p) => { const b = band(p == null ? null : Math.abs(p)); return `<span class="chip ${b}">${sp(p)}</span>`; };
// เหตุผลแบบสั้น — ประโยคแรกหลัง "Excel ยืนยัน:" (ตัดคำนำ) · เต็มอยู่ใน title
const shortWhy = (t) => String(t || "");

// กลุ่มรุ่น/แบบย่อย (ลำดับตามตาราง)
const groups = new Map();
NEW.forEach((r, i) => {
  if (!r.id) return;
  const k = r.id + "|" + (r.vk || "");
  if (!groups.has(k)) groups.set(k, { id: r.id, vk: r.vk || "", name: (r.name || r.head) + (r.vk ? " · " + r.vk : ""), rows: [] });
  groups.get(k).rows.push({ ...r, old: OLD ? OLD[i] : null });
});

const models = [];
for (const g of groups.values()) {
  const ok = g.rows.filter((r) => r.web && !r.small);
  if (!ok.length) continue;
  const d = ok.map((r) => pct(r.web.sT, r.pdf.sT));
  const dc = ok.map((r) => pct(r.web.cT, r.pdf.cT));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const absAvg = avg(d.map(Math.abs));
  models.push({ ...g, ok, nt: netT(g.id, g.vk), avgD: avg(d), absAvg, min: Math.min(...d), max: Math.max(...d), avgC: avg(dc),
    nets: ok.map((r) => net(r.web.sT, r.web.cT)), why: reasonOf(g.id, g.vk) });
}
models.sort((a, b) => b.absAvg - a.absAvg);
const cnt = { lo: 0, mid: 0, hi: 0 };
for (const m of models) cnt[band(m.absAvg)]++;
const allRows = models.flatMap((m) => m.ok);
const rc = { lo: 0, mid: 0, hi: 0 };
for (const r of allRows) rc[band(Math.abs(pct(r.web.sT, r.pdf.sT)))]++;
const netMin = Math.min(...models.flatMap((m) => m.nets.map((n, i) => n - (m.nt ?? n))));

const NOTE = {
  roof_slide: "กำไรสุทธิ 25% เฉพาะตัวหลังคา + มอเตอร์ขายฟิก ตามที่ PDF เขียน (27–31% ที่หัวตารางรวมมอเตอร์แล้ว) · ต่ำกว่าตาราง 5–7% เพราะ ① เว็บขายมอเตอร์ 80 กก. 30,000 ตารางใช้ 35,000 (ข้อค้างเคาะ) ② ทุนค่าแรงเว็บต่ำกว่าตาราง ~1,400 บาท",
  louver_rotate: "ตารางคิดมอเตอร์ผ่านกำไรสุทธิ 26% → ใช้แบบเดียวกัน (เดิมขายมอเตอร์ฟิก 12,000 แล้วตัวบานกำไรติดลบถ้าไม่เอามอเตอร์)",
  gate: "มอเตอร์ประตูรั้วคิดผ่านกำไรสุทธิ 35% ตามตาราง (ถอดมอเตอร์ ราคาลด ≈ 23,900 แทน 25,000 ฟิก)",
  shower: "ยังมีขั้นต่ำ/ชุด 14,000 (บานตาย) · 15,000 (มีบานเปิด/เลื่อน) ตามไฟล์ — ขนาดเล็กติดขั้นต่ำ กำไรจึงเกินเป้า",
  cabinet_face: "ตาราง R4.1 คิดตอนชีตยังไม่เลือกสี/แบบ (ทุนต่ำเกินจริง) — ราคาใหม่สูงกว่าเพราะทุนจริงสูงกว่า",
};

const sumRows = models.map((m) => {
  const b = band(m.absAvg);
  return `<tr class="b-${b}"><td class="nm">${esc(m.name)}${NOTE[m.id] ? `<div class="note">${esc(NOTE[m.id])}</div>` : ""}</td>
  <td class="n">${m.nt}%</td><td class="n">${m.ok.length}</td>
  <td class="n">${chip(m.avgD)}</td><td class="n rng">${sp(m.min)} … ${sp(m.max)}</td>
  <td class="n">${sp(m.avgC)}</td><td class="c"><span class="tag ${b}">${BAND[b]}</span></td>
  <td class="why" title="${esc(m.why)}">${esc(shortWhy(m.why))}</td></tr>`;
}).join("\n");

const detail = models.map((m) => {
  const body = m.rows.map((r) => {
    const sz = `${r.w}×${r.h}${r.p > 1 ? ` · ${r.p} บาน` : ""}`;
    if (!r.web) return `<tr class="na"><td>${sz}</td><td colspan="8">${esc(r.na || "เทียบไม่ได้")}</td></tr>`;
    if (r.small) return `<tr class="sm"><td>${sz} <small>(ไซซ์เล็ก)</small></td><td class="n">${fmt(r.pdf.cT)}</td><td class="n">${fmt(r.web.cT)}</td><td class="n">${sp(pct(r.web.cT, r.pdf.cT))}</td><td class="n">${fmt(r.pdf.sT)}</td><td class="n b">${fmt(r.web.sT)}</td><td class="n">${sp(pct(r.web.sT, r.pdf.sT))}</td><td class="n">${net(r.web.sT, r.web.cT).toFixed(1)}%</td><td class="n">${net(r.pdf.sT, r.pdf.cT).toFixed(1)}%</td></tr>`;
    const d = pct(r.web.sT, r.pdf.sT);
    return `<tr><td>${sz}</td><td class="n">${fmt(r.pdf.cT)}</td><td class="n">${fmt(r.web.cT)}</td><td class="n">${sp(pct(r.web.cT, r.pdf.cT))}</td><td class="n">${fmt(r.pdf.sT)}</td><td class="n b">${fmt(r.web.sT)}</td><td class="n">${chip(d)}</td><td class="n">${net(r.web.sT, r.web.cT).toFixed(1)}%</td><td class="n mute">${net(r.pdf.sT, r.pdf.cT).toFixed(1)}%</td></tr>`;
  }).join("");
  const b = band(m.absAvg);
  return `<section class="blk"><h3><span class="tag ${b}">${BAND[b]}</span> ${esc(m.name)} <small>· กำไรสุทธิ ${m.nt}% · ราคาเฉลี่ย ${sp(m.avgD)}</small></h3>
  <div class="tw"><table class="dt"><thead><tr><th>ขนาด</th><th class="n">ทุนรวม R4.1</th><th class="n">ทุนรวมเว็บ</th><th class="n">ทุนต่าง</th><th class="n">ขาย R4.1</th><th class="n">ขายใหม่</th><th class="n">ราคาต่าง</th><th class="n">กำไรสุทธิใหม่</th><th class="n">กำไรสุทธิ R4.1</th></tr></thead><tbody>${body}</tbody></table></div>
  <p class="why2">${esc(m.why)}</p></section>`;
}).join("\n");

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ราคาตามกำไรสุทธิ R4.1</title>
<style>
:root{--bg:#f5f7f8;--card:#fff;--ink:#17212b;--ink2:#4a5866;--ink3:#7d8a97;--line:#dfe5ea;--acc:#1d6a82;--lo:#2c7a4b;--lo-bg:#e3f2e8;--mid:#9a6512;--mid-bg:#fbf0d9;--hi:#b03535;--hi-bg:#f9e1e1;--sm:#eef2f5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#11171c;--card:#182129;--ink:#e6edf2;--ink2:#b3c0cb;--ink3:#7f8d99;--line:#2a3640;--acc:#5fb3cc;--lo:#7fd3a0;--lo-bg:#1d3527;--mid:#e6b45c;--mid-bg:#3a2f18;--hi:#f08c8c;--hi-bg:#3d2121;--sm:#1e2932}}
:root[data-theme="dark"]{--bg:#11171c;--card:#182129;--ink:#e6edf2;--ink2:#b3c0cb;--ink3:#7f8d99;--line:#2a3640;--acc:#5fb3cc;--lo:#7fd3a0;--lo-bg:#1d3527;--mid:#e6b45c;--mid-bg:#3a2f18;--hi:#f08c8c;--hi-bg:#3d2121;--sm:#1e2932}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Sarabun","Leelawadee UI","Noto Sans Thai","Tahoma",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 48px;display:grid;gap:20px}main>*{min-width:0}
h1{font-size:24px;margin:0;text-wrap:balance}h2{font-size:17px;margin:0 0 8px}h3{font-size:15px;margin:0 0 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}h3 small{color:var(--ink3);font-weight:400}
.lead{color:var(--ink2);max-width:75ch;margin:4px 0 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}
.rule{font-variant-numeric:tabular-nums;background:var(--sm);border-radius:8px;padding:10px 12px;margin-top:10px}
.rule b{color:var(--acc)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.st{border-radius:10px;padding:12px 14px;border:1px solid var(--line);background:var(--card)}
.st .k{font-size:12px;color:var(--ink3);letter-spacing:.02em}.st .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.st .s{font-size:12px;color:var(--ink2)}
.st.lo .v{color:var(--lo)}.st.mid .v{color:var(--mid)}.st.hi .v{color:var(--hi)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{font-size:12px;color:var(--ink3);font-weight:600;white-space:nowrap}
td.n,th.n{text-align:right;white-space:nowrap}td.c{text-align:center}td.b{font-weight:700}td.mute{color:var(--ink3)}
td.nm{font-weight:600;min-width:170px}td.why{font-size:12px;color:var(--ink2);min-width:260px}.note{font-weight:400;font-size:11.5px;color:var(--acc);margin-top:2px}
.rng{color:var(--ink2);font-size:12.5px}
.chip{display:inline-block;padding:1px 7px;border-radius:999px;font-weight:600;font-size:12.5px}
.chip.lo{background:var(--lo-bg);color:var(--lo)}.chip.mid{background:var(--mid-bg);color:var(--mid)}.chip.hi{background:var(--hi-bg);color:var(--hi)}
.tag{display:inline-block;padding:1px 8px;border-radius:5px;font-size:12px;font-weight:600;border:1px solid currentColor}
.tag.lo{color:var(--lo)}.tag.mid{color:var(--mid)}.tag.hi{color:var(--hi)}
tr.sm td{background:var(--sm);color:var(--ink2)}tr.na td{color:var(--ink3)}
.blk{break-inside:avoid;padding:12px 0;border-top:1px solid var(--line)}.why2{font-size:12px;color:var(--ink2);margin:6px 0 0;max-width:110ch}
ul.notes{margin:6px 0 0;padding-left:20px;color:var(--ink2)}ul.notes li{margin:3px 0}
@media print{@page{size:A4 landscape;margin:10mm}body{background:#fff;font-size:11px}main{max-width:none;padding:0;gap:10px}.card{border:none;padding:0}th,td{padding:3px 5px}h1{font-size:18px}.st .v{font-size:20px}td.why{min-width:200px}}
</style></head><body><main>
<header class="card">
<h1>ราคาขายใหม่ ยึดกำไรสุทธิตาราง R4.1</h1>
<p class="lead">ราคาใหม่ตั้งให้กำไรสุทธิเท่ากับตัวเลข "กำไรสุทธิ X%" ในไฟล์ ★ ตารางราคาขาย R4.1 ทุกรุ่น แล้วเทียบกับราคาขายเดิมในตาราง (ขาย รวมทั้งชุด) ว่ารุ่นไหนต่างเยอะ ต่างน้อย</p>
<div class="rule">ขายรวม = <b>ทุนรวม (ของ + ผลิต + ติดตั้ง) ÷ (1 − ค่าดำเนินการ 30/130 − กำไรสุทธิ)</b> แล้วปัดขึ้นหลักร้อย ·
ค่าผลิต/ค่าติดตั้ง (ขาย) = ตัวเลขในตารางเหมือนเดิม · ค่าของ (ขาย) = ส่วนที่เหลือ · เช่น SMS กำไรสุทธิ 40% → ขาย = ทุนรวม ÷ 0.369</div>
</header>
<section class="stats">
<div class="st"><div class="k">รุ่น/แบบย่อยที่เทียบได้</div><div class="v">${models.length}</div><div class="s">${allRows.length} ขนาด (ไม่นับไซซ์เล็กราคาตายตัว)</div></div>
<div class="st lo"><div class="k">ต่างน้อย (เฉลี่ย ≤ 3%)</div><div class="v">${cnt.lo}</div><div class="s">${rc.lo} ขนาด</div></div>
<div class="st mid"><div class="k">ต่างกลาง (3–8%)</div><div class="v">${cnt.mid}</div><div class="s">${rc.mid} ขนาด</div></div>
<div class="st hi"><div class="k">ต่างเยอะ (เกิน 8%)</div><div class="v">${cnt.hi}</div><div class="s">${rc.hi} ขนาด</div></div>
</section>
<section class="card">
<h2>ทำไมราคาต่าง</h2>
<ul class="notes">
<li>กำไรสุทธิของราคาใหม่เท่าตารางทุกขนาดแล้ว (ปัดร้อยขึ้นเกินได้ไม่ถึง 1%) เพราะฉะนั้น <b>ราคาที่ต่าง = ทุนที่ต่าง</b> ล้วน ๆ ทุนสูงกว่าตาราง ราคาก็สูงกว่า</li>
<li>ทุนเว็บตรงไฟล์ v1 (ตรวจด้วย Excel แล้ว) ส่วนตาราง R4.1 ทำจากไฟล์ v20.1 ซึ่งเก่ากว่า + ระบบเรตแบรนด์อลู (8 ต.ค.) — สาเหตุรายรุ่นอยู่คอลัมน์ขวาสุด</li>
<li>ไซซ์เล็กยังใช้ราคาตายตัวตามตาราง · Shower ยังมีขั้นต่ำ/ชุด</li>
</ul>
</section>
<section class="card">
<h2>สรุปรายรุ่น เรียงจากต่างมากไปน้อย</h2>
<div class="tw"><table><thead><tr><th>รุ่น</th><th class="n">กำไรสุทธิ</th><th class="n">ขนาด</th><th class="n">ราคาต่างเฉลี่ย</th><th class="n">ต่ำสุด … สูงสุด</th><th class="n">ทุนต่างเฉลี่ย</th><th>ระดับ</th><th>ทำไมราคาต่าง</th></tr></thead>
<tbody>${sumRows}</tbody></table></div>
</section>
<section class="card">
<h2>รายขนาด</h2>
<p class="lead">ราคาต่าง = ขายใหม่ เทียบ ขาย R4.1 · ไซซ์เล็ก: ตารางตั้งราคาตายตัว เว็บคิดตามเป้ากำไรเหมือนขนาดอื่น</p>
${detail}
</section>
<p class="lead" style="font-size:12px">สร้างจาก scripts/gen-net-report.mjs · ${new Date().toISOString().slice(0, 10)} · ทุนเว็บ = สีขาว ค่าเริ่มต้นของรุ่น ราคาสโตร์จริง</p>
</main></body></html>`;
fs.writeFileSync(OUT, html);
console.log(OUT + " · รุ่น " + models.length + " · น้อย " + cnt.lo + " กลาง " + cnt.mid + " เยอะ " + cnt.hi + " · กำไรสุทธิต่ำกว่าเป้าสุด " + netMin.toFixed(2));
