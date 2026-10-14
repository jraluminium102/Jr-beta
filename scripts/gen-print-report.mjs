#!/usr/bin/env node
/**
 * gen-print-report — ทำ "ตรวจราคา 4.0" ฉบับพิมพ์ A4 แนวนอน (กะทัดรัด อ่านตรวจบนกระดาษ) จากข้อมูลชุดเดียวกับหน้าเทียบ
 *   node scripts/gen-print-report.mjs [docs/เทียบค่าอบสี.html] [--out docs/ตรวจราคา4.0-พิมพ์A4.html]
 *   แล้วสั่ง Chrome headless --print-to-pdf (ดู docs/ วิธีในคอมเมนต์ท้ายไฟล์)
 * เจ้าของขอ 13 ต.ค.69 "เอาไฟล์ html มาทำเป็น pdf เหมาะกับการปริ้น a4 อ่านตรวจ" — หน้าเทียบตัวเต็มพิมพ์ได้ 131 หน้า → ทำตารางย่อแทน
 */
import fs from "node:fs";
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = process.argv.slice(2).find((a) => a.endsWith(".html") && a !== arg("--out")) || "docs/เทียบค่าอบสี.html";
const OUT = arg("--out") || "docs/ตรวจราคา4.0-พิมพ์A4.html";
const D = JSON.parse(fs.readFileSync(SRC, "utf8").match(/const DATA = (\{[\s\S]*?\});\n/)[1]);
const R41 = D.r41;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—");
const pct = (a, b) => (typeof a === "number" && typeof b === "number" && Math.abs(b) > 0.5 ? Math.round(((a - b) / b) * 1000) / 10 : null);
const pc = (p, tol = 2) => (p == null ? "—" : `<span class="${p > tol ? "up" : p < -tol ? "dn" : "fl"}">${p > 0 ? "+" : ""}${p}%</span>`);
const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
const mul = (s, c) => (s > 0 && c > 0 ? s / c : null);
const mtxt = (m) => (m == null ? "—" : "×" + m.toFixed(2));
const avg = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
// กำไร (คิดแบบชีตคิดทุน): แยกก้อน = (ขาย − ทุน) ÷ ขาย · สุทธิ = (ขายรวม − ค่าดำเนินการ 30/130 − ทุนรวม) ÷ ขายรวม
const mg = (sv, c) => (sv > 0 && c >= 0 ? Math.round(((sv - c) / sv) * 100) : null);
const netOf = (sT, cT) => (sT > 0 ? Math.round(((sT - (sT * 30) / 130 - cT) / sT) * 100) : null);
const pp = (v) => (v == null ? "—" : v + "%");
const prof = (x) => ({ net: netOf(x.sT, x.cT), m: mg(x.sM, x.cM), p: mg(x.sP, x.cP), i: mg(x.sI, x.cI) });
const ptxt = (o) => `${pp(o.m)}/${pp(o.p)}/${pp(o.i)}`;
// 14 ต.ค.69 เลิกข้อความเทคนิค (✓ Excel · ไฟล์ v1 ± · เรตแบรนด์ ±) — ใช้ "ทำไมราคาต่าง" ภาษาง่ายจาก scripts/fixtures/r41-why-plain.json
const reasonOf = (r) => { const t = (R41.why || {})[(r.id || "") + "|" + (r.vk || "")] || (R41.why || {})[r.id || ""]; return t ? { text: t } : null; };

// กลุ่มรุ่น
const groups = new Map();
for (const r of R41.rows) { const k = (r.name || r.head) + (r.vk ? " · " + r.vk : ""); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }

// ① สรุปรายรุ่น
const ovRows = [];
for (const [k, rs] of groups) {
  const ok = rs.filter((r) => r.web && !r.small);
  const rsn = reasonOf(rs[0]);
  // 14 ต.ค.69 เลิกคอลัมน์ "ตัวคูณ" (เจ้าของงง อยากได้แบบหัวตาราง R4.1) — กำไรสุทธิ + กำไร ของ/ผลิต/ติดตั้ง (ขาย − ทุน) ÷ ขาย พอ
  if (!ok.length) { ovRows.push(`<tr class="na"><td class="nm">${esc(k)}</td><td colspan="5">${esc(rs[0].na || "เทียบไม่ได้")}</td><td class="rs">${esc(rsn?.text || "")}</td></tr>`); continue; }
  const c = Math.round(avg(ok.map((r) => pct(r.web.cM, r.pdf.cM))) * 10) / 10;
  const lab = ok.every((r) => r.web.sP === r.pdf.sP && r.web.sI === r.pdf.sI);
  const sW = Math.round(avg(ok.map((r) => pct(r.web.sT, r.pdf.sT))) * 10) / 10;
  const xlOk = ok.filter((r) => r.xl).length;
  const PT = ok.map((r) => prof(r.pdf)), PW = ok.map((r) => prof(r.web));
  const av = (A, k) => { const v = avg(A.map((o) => o[k])); return v == null ? null : Math.round(v); };
  // 14 ต.ค.69 โชว์ 3 บรรทัดแบบหัวตาราง R4.1: เป้า (หัวตาราง) / ตาราง (คิดจากราคาในตาราง) / เว็บ
  const tgt = rs.find((r) => r.target != null)?.target, tp = rs.find((r) => r.targetParts)?.targetParts;
  const netCell = `<td class="n"><small>เป้า ${tgt != null ? tgt + "%" : "—"}<br>ตาราง ${pp(av(PT, "net"))}</small><br><b>เว็บ ${pp(av(PW, "net"))}</b></td>`;
  const partCell = `<td class="n"><small>เป้า ${tp ? tp.join("/") + "%" : "—"}<br>ตาราง ${av(PT, "m")}/${av(PT, "p")}/${av(PT, "i")}%</small><br><b>เว็บ ${av(PW, "m")}/${av(PW, "p")}/${av(PW, "i")}%</b></td>`;
  ovRows.push(`<tr><td class="nm">${esc(k)}</td><td class="n">${pc(c, 5)}</td><td class="c">${lab ? "✓" : "ต่าง"}</td><td class="n">${pc(sW, 5)}</td>${netCell}${partCell}<td class="rs">${esc(rsn?.text || (Math.abs(sW || 0) < 2 ? "ใกล้ตาราง" : ""))}</td></tr>`);
}

// ② รายขนาด
const sizeBlocks = [];
for (const [k, rs] of groups) {
  const body = rs.map((r) => {
    const sz = `${r.w}×${r.h}${r.p > 1 ? ` · ${r.p} บาน` : ""}${r.small ? " (เล็ก)" : ""}`;
    if (!r.web) return `<tr class="na"><td>${sz}</td><td class="n">${fmt(r.pdf?.cM)}</td><td colspan="8">${esc(r.na || "—")}</td></tr>`;
    return `<tr><td>${sz}</td><td class="n">${fmt(r.pdf.cM)}</td><td class="n b">${fmt(r.web.cM)}</td><td class="n">${pc(pct(r.web.cM, r.pdf.cM))}</td><td class="n">${fmt(r.web.sP + r.web.sI)}${r.web.sP === r.pdf.sP && r.web.sI === r.pdf.sI ? "" : `<br><small>ตาราง ${fmt(r.pdf.sP + r.pdf.sI)}</small>`}</td><td class="n">${fmt(r.pdf.sT)}</td><td class="n b">${fmt(r.web.sT)}</td><td class="n">${pc(pct(r.web.sT, r.pdf.sT))}</td><td class="n"><b>${pp(prof(r.web).net)}</b><br><small>ตาราง ${pp(prof(r.pdf).net)}</small></td><td class="n">${ptxt(prof(r.web))}<br><small>ตาราง ${ptxt(prof(r.pdf))}</small></td></tr>`;
  }).join("");
  sizeBlocks.push(`<tbody class="grp"><tr class="gh"><td colspan="10">${esc(k)}</td></tr>${body}</tbody>`);
}

// ③ ค่าสี
const colorRows = [];
for (const p of D.data) {
  const head = `<tr class="gh"><td colspan="9">${esc(p.name)} · ${esc(p.size)} ซม.${/\d/.test(p.panels) ? ` · ${esc(p.panels)} บาน` : ""}${p.note?.text ? ` <span class="nt">— ${esc(p.note.text)}</span>` : ""}</td></tr>`;
  const rows = p.rows.map((r) => {
    if (r.na) return `<tr class="na"><td>${esc(r.color)}</td><td>${esc(r.type)}</td><td colspan="7">ไม่มีสีนี้ขาย</td></tr>`;
    if (r.base) return `<tr class="base"><td>${esc(r.color)}</td><td>${esc(r.type)}</td><td class="n">${fmt(r.costWeb)}</td><td class="n">ฐาน</td><td class="n">—</td><td class="n">—</td><td class="n">${fmt(r.t39)}</td><td class="n b">${fmt(r.tWeb)}</td><td class="n">${pc(pct(r.tWeb, r.t39))}</td></tr>`;
    const m = r.cWeb > 0 && r.aWeb > 0 ? `<br><small>ทุน ${fmt(r.cWeb)} · กำไร ${Math.round((1 - r.cWeb / r.aWeb) * 100)}%</small>` : "";
    return `<tr><td>${esc(r.color)}</td><td>${esc(r.type)}</td><td class="n">${fmt(r.cost?.mat)}</td><td class="n">+${fmt(r.cWeb)}</td><td class="n">+${fmt(r.aWeb)}${m}</td><td class="n">+${fmt(r.a39)}</td><td class="n">${fmt(r.t39)}</td><td class="n b">${fmt(r.tWeb)}</td><td class="n">${pc(pct(r.tWeb, r.t39))}</td></tr>`;
  }).join("");
  colorRows.push(`<tbody class="grp">${head}${rows}</tbody>`);
}

const finds = (R41.finds || []).map((f) => `<li><b>[${esc(f.tag)}] ${esc(f.title)}</b> — ${esc(f.why)}${f.act ? ` <i>→ ${esc(f.act)}</i>` : ""}</li>`).join("");

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ตรวจราคา 4.0 ฉบับพิมพ์</title>
<style>
@page { size: A4 landscape; margin: 8mm 8mm 9mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #13202f; background: #fff; font: 8.6pt/1.35 "Leelawadee UI", "IBM Plex Sans Thai", Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 15pt; margin: 0 0 2px; } h2 { font-size: 11.5pt; margin: 8px 0 4px; padding-bottom: 2px; border-bottom: 2px solid #13202f; break-after: avoid; }
.sub { color: #4a5768; margin: 0 0 6px; font-size: 8.5pt; }
.sec { break-before: page; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid #d3dae6; padding: 2px 4px; vertical-align: top; }
th { background: #eef2f8; font-size: 8pt; text-align: left; }
thead { display: table-header-group; }
td.n, th.n { text-align: right; white-space: nowrap; } td.c { text-align: center; }
td.b { font-weight: 700; } td.nm { font-weight: 600; white-space: nowrap; }
td.rs { font-size: 7.6pt; color: #2c3a4e; } td.ex { font-size: 7.6pt; color: #2c3a4e; } td.ex { min-width: 44mm; } tbody.grp td:first-child { white-space: nowrap; }
tr { break-inside: avoid; } tbody.grp { break-inside: avoid; }
tr.gh td { background: #e4ebff; font-weight: 700; font-size: 8.8pt; border-top: 2px solid #9fb2d9; }
tr.base td { background: #f5f7fb; font-weight: 600; } tr.na td { color: #6b7789; }
.nt { font-weight: 400; font-size: 7.6pt; color: #4a5768; }
.up { color: #b42318; font-weight: 700; } .dn { color: #08714a; font-weight: 700; } .fl { color: #4a5768; }
b.xl { color: #08714a; } small { color: #4a5768; font-size: 7.2pt; }
ul.finds { margin: 4px 0 0 16px; padding: 0; } ul.finds li { margin: 2px 0; }
.legend { font-size: 7.8pt; color: #4a5768; margin: 2px 0 4px; }
@media screen { body { background: #e9edf2; padding: 10px; } .wrap { background: #fff; max-width: 281mm; margin: 0 auto; padding: 8mm; } }
</style></head><body><div class="wrap">
<h1>ตรวจราคา 4.0 — ฉบับพิมพ์</h1>
<p class="sub">เว็บคิดราคา 4.0 เทียบ ตาราง R4.1 และ R3.9 · ราคาสโตร์จริง ${D.meta.nStock.toLocaleString("en-US")} แถว · คำนวณเมื่อ ${esc(D.meta.builtAt)} · ไม่รวม VAT</p>
<h2>1 · ข้อค้นพบ</h2><ul class="finds">${finds}</ul>
<h2>2 · ภาพรวมรายรุ่น (เฉลี่ยทุกขนาดในตาราง R4.1 · สีขาว/ดำ)</h2>
<p class="legend">ราคาเว็บล็อกกำไรสุทธิเท่าตาราง R4.1 (ขายรวม = ทุนรวม ÷ (1 − 30/130 − กำไรสุทธิ) ปัดร้อย · ค่าแรงขาย = ตาราง) → ราคาที่ต่างจากตาราง = ทุนที่ต่าง · ทุน = ทุนค่าของเว็บเทียบตาราง · แดง = เว็บสูงกว่า · เขียว = ต่ำกว่า<br>กำไรสุทธิ = (ราคาขายรวม − ค่าดำเนินการ 30/130 − ทุนรวม ของ+ผลิต+ติดตั้ง) ÷ ราคาขายรวม · กำไรแยก ของ/ผลิต/ติดตั้ง = (ขาย − ทุน) ÷ ขาย ของแต่ละก้อน · เป้า = ตัวเลขที่พิมพ์ในหัวตาราง R4.1 · ตาราง = คิดจากราคาในตารางจริง · เว็บ = คิดจากราคาเว็บ (ตัวหนา)</p>
<table><thead><tr><th>รุ่น</th><th class="n">ทุนค่าของ</th><th>ค่าแรงขาย</th><th class="n">ขายเว็บ</th><th class="n">กำไรสุทธิ</th><th class="n">กำไร ของ/ผลิต/ติดตั้ง</th><th>ทำไมราคาต่าง</th></tr></thead><tbody>${ovRows.join("")}</tbody></table>
<div class="sec"><h2>3 · รายขนาด — ทุน + ขาย เทียบตาราง R4.1</h2>
<p class="legend">ดูรายการค่าของทีละขนาด (ใช้อะไร เท่าไหร่ กี่บาท) ได้ในหน้าเว็บ "ตรวจราคา 4.0" กดปุ่ม ค่าของ ▾</p>
<table><thead><tr><th>ขนาด (ซม.)</th><th class="n">ทุนตาราง</th><th class="n">ทุนเว็บ</th><th class="n">%</th><th class="n">ค่าแรงขาย</th><th class="n">ขายตาราง</th><th class="n">ขายเว็บ</th><th class="n">%</th><th class="n">กำไรสุทธิ</th><th class="n">กำไร ของ/ผลิต/ติดตั้ง</th></tr></thead>${sizeBlocks.join("")}</table></div>
<div class="sec"><h2>4 · ค่าสี เทียบ R3.9</h2>
<p class="legend">ค่าสีที่เพิ่ม (ทุน) = ทุนค่าของสีนั้น − ทุนสีขาว · ค่าสีขาย = ราคาขายสีนั้น − ราคาขายสีขาว (กำไร = (ขาย − ทุน) ÷ ขาย ของส่วนที่เพิ่ม) · % = ราคาขายเว็บเทียบ R3.9</p>
<table><thead><tr><th>สี</th><th>ชนิด</th><th class="n">ทุนค่าของ</th><th class="n">ค่าสี (ทุน)</th><th class="n">ค่าสีขาย เว็บ</th><th class="n">ค่าสีขาย R3.9</th><th class="n">ขาย R3.9</th><th class="n">ขายเว็บ</th><th class="n">%</th></tr></thead>${colorRows.join("")}</table></div>
</div></body></html>`;
fs.writeFileSync(OUT, html);
console.log(OUT, "· รุ่น", groups.size, "· สินค้าสี", D.data.length);
// PDF: "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-pdf-header-footer --print-to-pdf=<out.pdf> file:///<OUT>
