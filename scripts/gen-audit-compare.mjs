// ผลเทียบใบตรวจราคา (คนตรวจ vs เว็บ) — รูปแบบ "เขียน | เฉลย" คู่กัน แบบใบตรวจออปชั่นบาน
//   node scripts/gen-audit-compare.mjs docs/ผลตรวจเทียบ-ใบตรวจราคา.html [โฟลเดอร์ data] → พิมพ์ PDF ด้วย Edge/Chrome
//   data = key.json (จาก gen-audit-key.mjs cmp-net.json key.json) + pNN-NN.json (ถอดลายมือจาก PDF ที่คนตรวจกรอก)
import fs from "node:fs";
const S = process.argv[3] || "docs/ใบตรวจราคา-ผลเทียบ-data";   // โฟลเดอร์ key.json + ไฟล์ถอดลายมือ (tx)
const key = JSON.parse(fs.readFileSync(`${S}/key.json`, "utf8"));
const tx = fs.readdirSync(`${S}`).filter((f) => /^p\d.*\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(`${S}/${f}`, "utf8")).jobs);
const filled = tx.filter((j) => j.filled).sort((a, b) => a.job - b.job);
const OUT = process.argv[2];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (s) => { if (s == null) return null; const t = String(s).replace(/[,\s%]/g, ""); if (t === "" || t === "–" || t === "-") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const isDash = (s) => /^[–-]$/.test(String(s ?? "").trim());
const qtyCm = (s) => { if (s == null) return null; const t = String(s).replace(/,/g, ""); if (t === "" || isDash(t)) return null; let tot = 0, ok = false; for (const part of t.split(/\s*[\/+]\s*|\n/)) { const m = part.match(/([\d.]+)\s*[×x*]\s*([\d.]+)/); if (m) { tot += Number(m[1]) * Number(m[2]); ok = true; } else { const n = Number(part.trim()); if (Number.isFinite(n)) { tot += n; ok = true; } } } return ok ? tot : null; };
const f0 = (v) => (v == null ? "" : Math.round(v).toLocaleString("en-US"));
const f2 = (v) => (v == null ? "" : Math.abs(v - Math.round(v)) < 0.005 ? f0(v) : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pctDiff = (web, man) => (man ? Math.round(((web - man) / man) * 100) : null);
const pctTxt = (p) => (p == null ? "" : p === 0 ? "เท่ากัน" : p > 0 ? `เว็บแพงกว่า ${p}%` : `เว็บถูกกว่า ${-p}%`);

// ── เซลล์คู่ เขียน|เฉลย · ต่าง = แดง ──
const pair = (manTxt, webTxt, diff, raw) => `<td class="w${diff ? " d" : ""}">${raw ? manTxt : esc(manTxt)}</td><td class="a${diff ? " d" : ""}">${raw ? webTxt : esc(webTxt)}</td>`;
const rel = (a, b, tol) => (a == null || b == null ? false : Math.abs(a - b) > Math.max(tol, Math.abs(b) * 0.015));

function jobHtml(t) {
  const k = key[t.job - 1];
  let rows = "", last = "", nDiff = 0, nRows = 0;
  const SEC = { aluA: "อลูมิเนียม — คิดตามยาว (ซม.)", aluB: "อลูมิเนียม — เส้นเต็ม", glass: "กระจก / แผ่น", hardware: "อุปกรณ์", consum: "โครง / วัสดุอื่น", bake: "ค่าอบสี", addon: "ของเสริม" };
  for (const r of k.rows) {
    if (r.kind !== last) { rows += `<tr class="gh"><td colspan="11">${SEC[r.kind] || r.kind}</td></tr>`; last = r.kind; }
    const w = t.rows[String(r.n)] || {};
    const isAlu = r.kind === "aluA" || r.kind === "aluB";
    const webPrice = (r.m || r.b)?.price;
    const mp = num(w.price);
    const priceDiff = mp != null && webPrice != null && Math.abs(mp - webPrice) > 0.5;
    const side = (s, wq, wa) => {
      // s = ข้อมูลเว็บ (null = เว็บไม่ใช้) · wq/wa = ที่เขียน
      const manQ = isAlu ? qtyCm(wq) : num(wq), manA = num(wa);
      const webQtyTxt = !s ? "—" : r.kind === "aluA" ? `${f2(s.qty)}<span class="sub">${esc(s.pcs)}</span>` : r.kind === "aluB" ? `${f2(s.qty)} เส้น` : f2(s.qty);
      const manQtyTxt = wq == null || wq === "" ? "" : isDash(wq) ? "—" : isAlu && manQ != null && /[×x]/.test(wq) ? `${f2(manQ)}<span class="sub">${esc(wq)}</span>` : esc(String(wq));
      const webAmt = !s ? null : s.amt;
      let qd = false, ad = false;
      if (s && manQ != null) qd = r.kind === "aluB" ? true : rel(manQ, s.qty, 1);   // เส้นเต็ม: คนตรวจเขียน ซม. เว็บนับเส้น = วิธีต่าง
      if (!s && (manQ != null || manA != null)) { qd = true; ad = true; }
      if (s && (wq === "" || isDash(wq)) && manA == null && (wq !== undefined)) { qd = true; ad = true; }
      if (s && manA != null) ad = rel(manA, webAmt, 1);
      if (qd || ad) nDiff++;
      return pair(manQtyTxt, webQtyTxt, qd, true) + pair(wa == null || wa === "" ? "" : isDash(wa) ? "—" : f2(manA ?? 0) || String(wa), s ? f2(webAmt) : "—", ad);
    };
    nRows++;
    if (priceDiff) nDiff++;
    const name = esc(r.name) + (r.stock && Math.abs(r.stock - 6.4) > 1e-9 && isAlu ? `<span class="sub">เส้น ${r.stock} ม.</span>` : "") + ((m) => (m ? `<span class="sub">คนตรวจเขียนรวมกับแถว ${m[1]}</span>` : ""))(String(w.note || "").match(/bracketed with rows? ([\d-]+)/));
    rows += `<tr><td class="c">${r.n}</td><td class="nm">${name}</td><td class="code">${esc(r.code)}</td>
      ${pair(w.price == null || w.price === "" ? "" : isDash(w.price) ? "—" : String(w.price), f2(webPrice), priceDiff)}
      ${side(r.m, w.mQty, w.mAmt)}${side(r.b, w.bQty, w.bAmt)}</tr>`;
  }
  const W = k.mid.web, B = k.big.web;
  const tot = (lbl, manM, webM, manB, webB, cls = "tot") => {
    const dm = rel(manM, webM, 1), db = rel(manB, webB, 1);
    return `<tr class="${cls}"><td colspan="5">${lbl}</td><td colspan="2" class="w${dm ? " d" : ""}">${f2(manM)}</td><td colspan="2" class="a${dm ? " d" : ""}">${f2(webM)}${manM != null && webM != null ? `<span class="pd">${pctTxt(pctDiff(webM, manM))}</span>` : ""}</td><td class="w${db ? " d" : ""}">${f2(manB)}</td><td class="a${db ? " d" : ""}">${f2(webB)}${manB != null && webB != null ? `<span class="pd">${pctTxt(pctDiff(webB, manB))}</span>` : ""}</td></tr>`;
  };
  let foot = "";
  if (k.aluA.mW > 0) {
    foot += tot("รวมค่าเส้น (ยังไม่เผื่อเศษ)", num(t.aluSum?.mRaw), k.aluA.m, num(t.aluSum?.bRaw), k.aluA.b, "sub1");
    foot += tot("× 1.3 เผื่อเศษ = ค่าเส้นรวม", num(t.aluSum?.mW), k.aluA.mW, num(t.aluSum?.bW), k.aluA.bW, "sub1");
  }
  // ทุนคนตรวจ: ใช้ช่องสรุป (ค่าของ/ทุน) ก่อน · ช่องรวมทุนท้ายตารางเป็นตัวสำรอง (งาน 16 เขียนเลขเว็บคร่อมช่องรวมทุน)
  foot += tot("รวมทุนวัสดุ", num(t.summary?.mat?.mC) ?? num(t.matTotal?.m), W.cM, num(t.summary?.mat?.bC) ?? num(t.matTotal?.b), B.cM);
  foot += tot("ราคาขายค่าของ (กำไร 52%)", num(t.summary?.mat?.mS), W.sM, num(t.summary?.mat?.bS), B.sM);
  const notes = [...(t.side || []).map((s) => s.replace(/\s*\(.*$/, "")), ...(t.remarks ? [] : [])].filter((s) => !/^\d[\d,.]*$/.test(s)).filter((s) => !/ปากกา|เครื่องหมาย|loose|scan/i.test(s));
  const noteTxt = notes.length ? `<p class="note"><b>คนตรวจเขียนไว้:</b> ${notes.map(esc).join(" · ")}</p>` : "";
  return { html: `<section class="job"><div class="jh"><h2><span class="no">${t.job}/32</span> ${esc(k.name)}${t.filled ? "" : ` <span class="blank">ยังไม่ได้กรอก</span>`}</h2>
  <div class="meta"><span><b>กลาง</b> ${k.mid.w}×${k.mid.h} ซม.${k.mid.p ? " " + k.mid.p + " บาน" : ""}</span><span><b>ใหญ่</b> ${k.big.w}×${k.big.h} ซม.${k.big.p ? " " + k.big.p + " บาน" : ""}</span><span><b>สี</b> อบขาว</span><span>${t.filled ? `ช่องขาว = คนตรวจเขียน · ช่องเทา = เว็บ · <span class="dd">ตัวแดง</span> = ไม่ตรงกัน` : "ช่องขาว = ว่างไว้ให้กรอก · ช่องเทา = เว็บ"}</span></div></div>
  <table class="bom"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="cp"><col class="cp"><col class="cq"><col class="cq"><col class="ca"><col class="ca"><col class="cq"><col class="cq"><col class="ca"><col class="ca"></colgroup>
  <thead><tr><th rowspan="2" class="c">#</th><th rowspan="2">รายการ</th><th rowspan="2">รหัส</th><th colspan="2">ราคา/หน่วย</th><th colspan="4" class="m">ขนาดกลาง ${k.mid.w}×${k.mid.h}</th><th colspan="4" class="b">ขนาดใหญ่ ${k.big.w}×${k.big.h}</th></tr>
  <tr><th>คนตรวจ</th><th class="a">เว็บ</th><th class="m">จำนวน คนตรวจ</th><th class="a m">จำนวน เว็บ</th><th class="m">บาท คนตรวจ</th><th class="a m">บาท เว็บ</th><th class="b">จำนวน คนตรวจ</th><th class="a b">จำนวน เว็บ</th><th class="b">บาท คนตรวจ</th><th class="a b">บาท เว็บ</th></tr></thead>
  <tbody>${rows}${foot}</tbody></table>${noteTxt}</section>`, nDiff, nRows };
}

// ── สรุปหน้าแรก ──
const sumRows = filled.map((t) => {
  const k = key[t.job - 1], W = k.mid.web, B = k.big.web;
  const mC = num(t.summary?.mat?.mC) ?? num(t.matTotal?.m), bC = num(t.summary?.mat?.bC) ?? num(t.matTotal?.b);
  const mS = num(t.summary?.mat?.mS), bS = num(t.summary?.mat?.bS);
  return { t, k, mC, bC, mS, bS, pm: pctDiff(W.cM, mC), pb: pctDiff(B.cM, bC) };
});
const big = (p) => (p == null ? "" : Math.abs(p) >= 20 ? " big" : Math.abs(p) >= 10 ? " mid" : "");
const summaryTable = `<table class="sum"><thead><tr><th rowspan="2">บาน</th><th rowspan="2">ขนาด</th><th colspan="3">ทุนวัสดุ (บาท)</th><th colspan="2">ราคาขายค่าของ (บาท)</th></tr>
<tr><th>คนตรวจ</th><th class="a">เว็บ</th><th>ต่างกัน</th><th>คนตรวจ</th><th class="a">เว็บ</th></tr></thead><tbody>${sumRows.map(({ t, k, mC, bC, mS, bS, pm, pb }) => `
<tr><td rowspan="2" class="nm"><b>${esc(k.name)}</b><span class="sub">งาน ${t.job}/32</span></td><td>กลาง ${k.mid.w}×${k.mid.h}${k.mid.p ? " · " + k.mid.p + " บาน" : ""}</td><td class="n">${f0(mC)}</td><td class="n a">${f0(k.mid.web.cM)}</td><td class="n${big(pm)}">${pctTxt(pm)}</td><td class="n">${f0(mS)}</td><td class="n a">${f0(k.mid.web.sM)}</td></tr>
<tr><td>ใหญ่ ${k.big.w}×${k.big.h}${k.big.p ? " · " + k.big.p + " บาน" : ""}</td><td class="n">${f0(bC)}</td><td class="n a">${f0(k.big.web.cM)}</td><td class="n${big(pb)}">${pctTxt(pb)}</td><td class="n">${f0(bS)}</td><td class="n a">${f0(k.big.web.sM)}</td></tr>`).join("")}</tbody></table>`;

const unfilled = key.filter((k) => !filled.some((t) => t.job === k.no));
const cover = `<div class="top"><h1>ผลตรวจเทียบ ใบตรวจราคา คิดราคา 4.0 <span class="ed">คนตรวจ vs เว็บ</span></h1><div>ตรวจเทียบ 23 ต.ค. 2569</div></div>
<p class="lead">คนตรวจกรอกมา <b>${filled.length} บาน</b> จาก 32 บาน (${filled.map((t) => key[t.job - 1].name).join(" · ")}) · อีก ${unfilled.length} บานยังว่าง · คนตรวจกรอกเฉพาะทุนวัสดุและราคาขายค่าของ (บวกกำไร 52% เหมือนเว็บ) ค่าแรงผลิต/ติดตั้งไม่ได้กรอก · ตัวเลขคนตรวจอ่านจากลายมือ</p>
<h2 class="h">1. ทุนวัสดุ คนตรวจ vs เว็บ</h2>${summaryTable}
<h2 class="h">2. ทำไมถึงต่าง (เรียงจากผลมากไปน้อย)</h2>
<div class="why">
<div class="box"><h3>① ราคาเส้นอลูที่คนตรวจใช้ ถูกกว่าเว็บเกือบทุกเส้น 5–15%</h3><p>คนตรวจเขียนไว้เองว่า "ราคาเส้น ERP แพงกว่าทุกแบบ"</p>
<table class="mini"><tr><th>เส้น</th><th>คนตรวจ</th><th class="a">เว็บ</th><th>เส้น</th><th>คนตรวจ</th><th class="a">เว็บ</th></tr>
<tr><td>F7980 เสา/ขวาง ยูโร</td><td>1,370</td><td class="a">1,508</td><td>F7859 เฟรม บานเปิด</td><td>1,075</td><td class="a">1,280</td></tr>
<tr><td>F7869 เฟรมบน ยูโร</td><td>2,525</td><td class="a">2,888</td><td>F7864 กรอบบาน 10 ซม.</td><td>1,970</td><td class="a">2,186</td></tr>
<tr><td>F7977 เฟรม 2 ราง</td><td>1,420</td><td class="a">1,523</td><td>F7938B ธรณี</td><td>1,350</td><td class="a">1,472</td></tr>
<tr><td>F7990 ต่อราง</td><td>940</td><td class="a">1,010</td><td>F7968 เฟรมบน เฟี้ยมยูโร</td><td>3,140</td><td class="a">3,418</td></tr>
<tr><td>F7972 กรอบบาน เฟี้ยมยูโร</td><td>1,670</td><td class="a">1,842</td><td>F7969 เฟรมล่าง เฟี้ยมยูโร</td><td>1,730</td><td class="a">1,894</td></tr>
<tr><td>F7988 ตบยู (เว็บถูกกว่า)</td><td>120</td><td class="a">59</td><td>F7993 ตบปิดราง (เว็บถูกกว่า)</td><td>120</td><td class="a">61</td></tr>
<tr><td>บังใบ 4 หุน SlimLux</td><td>456</td><td class="a">156</td><td>XSW400023 ฝาปิดล่างใหญ่</td><td>223</td><td class="a">132</td></tr>
<tr><td>กระจกเทมเปอร์ 6 มม. /ตร.ม.</td><td>439</td><td class="a">403</td><td>B24003 ธรณี เฟี้ยม</td><td>1,760</td><td class="a">1,657</td></tr></table></div>
<div class="box"><h3>② วิธีนับเส้นต่างกัน (เฟี้ยม + เฟี้ยมยูโร)</h3><ul>
<li>เว็บคิดเฟรมเฟี้ยม (B24001–B24006, F7968–F7972) เป็น<b>เส้นเต็ม</b>ตามไฟล์ถอดทุน · คนตรวจคิดตามความยาวที่ใช้จริงเป็น ซม. → บานเล็ก 120×200 เว็บแพงกว่ามาก (เฟรมบน F7968 เว็บ 1 เส้น 3,418 · คนตรวจ 120 ซม. = 589)</li>
<li>เฟี้ยมใหญ่ 10 บาน คนตรวจเอาเฟรมพวกนี้ไปคูณเผื่อเศษ 1.3 ด้วย เว็บไม่คูณ (ซื้อเต็มเส้นอยู่แล้ว) → คนตรวจแพงกว่า 14%</li></ul></div>
<div class="box"><h3>③ จำนวนชิ้นที่นับต่างกัน</h3><ul>
<li><b>บานเปิดใหญ่ 2 บาน:</b> เว็บนับเสากรอบบาน 4 ต้น (1,024 ซม.) คนตรวจนับ 520 ซม. ต้นเดียว · คิ้วตั้งก็เช่นกัน → ต่าง 37%</li>
<li><b>ยูโรใหญ่ 4 บาน:</b> ต่อราง F7990 เว็บ 1,984 ซม. คนตรวจ 500 ซม. · เฟรมบน/ล่าง เว็บใช้ F7977 (2 ราง) คนตรวจยังใช้ F7869</li>
<li><b>ของเล็กทุกบาน:</b> ซิลิโคน เว็บ 3 หลอด / คนตรวจ 1 · มือจับล็อค เว็บ 2 / คนตรวจ 1 · ยางรูน้ำ+วาวรูน้ำ เว็บ 7 / คนตรวจ 3 · สักหลาด เว็บ 73 ม. / คนตรวจ 50 ม.</li></ul></div>
<div class="box"><h3>④ ของที่คนตรวจบอกว่า "ไม่มีใน ERP"</h3><ul>
<li>ต่อกลางเฟี้ยม B24009 คนตรวจ 810 / เว็บ 320 · บังใบเฟี้ยมยูโร F7975 (เว็บ 558) · น็อต 1" (เว็บคิดตัวละ 1 บาท 48–248 ตัว)</li></ul>
<h3>⑤ อุปกรณ์บานเปิด ราคาไม่ตรง</h3><ul><li>บานพับ hyda คนตรวจ 85 / เว็บ 117 · ตลับกุญแจ 180 / 285 · ไส้กุญแจ 400 / 429 · แผ่นรับล็อค 62 / 15 · ยางเฟี้ยม 15 / 11 ต่อ ม.</li></ul></div>
</div>
<h2 class="h">3. สิ่งที่ต้องเคาะ</h2>
<ol class="todo">
<li>ราคาเส้นอลู จะยึดของเว็บ (ตามไฟล์ถอดทุน) หรือยึดราคาที่คนตรวจใช้</li>
<li>เฟรมเฟี้ยม / เฟี้ยมยูโร จะนับเส้นเต็มเหมือนเว็บ หรือคิดตาม ซม. เหมือนคนตรวจ</li>
<li>บานเปิด 2 บาน เสากรอบบานต้องนับ 4 ต้น (เว็บ) ใช่ไหม</li>
<li>ซิลิโคน 3 หลอด / มือจับล็อค 2 ชุด ต่อบานเลื่อน จะคงไว้หรือลด</li>
<li>ต่อกลางเฟี้ยม B24009 ราคาจริง 810 หรือ 320</li>
<li>บานที่ยังว่าง ${unfilled.length} บาน จะให้คนตรวจกรอกต่อไหม (ตารางอยู่ต่อท้ายบานที่กรอกแล้ว · ช่องขาวว่างไว้ให้เขียน)</li>
</ol><div class="cover-end"></div>`;

// บานที่กรอกแล้วขึ้นก่อน · บานที่ยังว่างต่อท้าย (ช่องคนตรวจว่าง ไม่ขึ้นแดง) — เจ้าของ 23 ต.ค.69 "เอาช่องเปล่าที่ยังไม่เคยเขียนด้วย"
const all = [...filled, ...unfilled.map((k) => ({ job: k.no, filled: false, rows: {} }))];
const jobsHtml = all.map((t) => jobHtml(t).html).join("\n");
const tail = "";

const css = `
@page { size: A4 portrait; margin: 8mm 8mm 9mm; }
* { box-sizing: border-box; }
:root { --ink:#16202c; --muted:#566273; --line:#b9c3d1; --ans:#eef1f6; --red:#c0392b; }
body { margin: 0; color: var(--ink); background: #fff; font: 8.2pt/1.3 "Leelawadee UI", "IBM Plex Sans Thai", Tahoma, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--ink); padding-bottom: 2px; margin-bottom: 3px; }
.top h1 { font-size: 12.5pt; margin: 0; } .ed { font-size: 8pt; font-weight: 700; color: #fff; background: #3b5b8c; border-radius: 3px; padding: 1px 6px; margin-left: 6px; }
.lead { margin: 0 0 6px; font-size: 7.8pt; color: var(--muted); }
h2.h { font-size: 10.5pt; margin: 6px 0 3px; border-top: 1.5px solid var(--ink); padding-top: 3px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 0 3px; vertical-align: middle; overflow: hidden; }
th { background: #e9eef5; font-size: 7pt; text-align: center; line-height: 1.15; } th.a { background: #dfe5ee; }
td { height: 5.4mm; } td.n { text-align: right; } td.c { text-align: center; }
td.a { background: var(--ans); text-align: right; color: #26364a; line-height: 1.1; } td.w { background: #fff; text-align: right; line-height: 1.1; }
td.d { color: var(--red); font-weight: 700; } .dd { color: var(--red); font-weight: 700; }
td.nm { line-height: 1.12; } .sub { display: block; font-size: 6.4pt; color: var(--muted); font-weight: 400; }
td.code { font-size: 6.6pt; color: #34425a; word-break: break-all; }
.sum td { height: 5.4mm; font-size: 8.2pt; } .sum td.big { color: var(--red); font-weight: 700; } .sum td.mid { color: #b26a00; font-weight: 700; }
.why { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.box { border: 1px solid var(--line); border-radius: 2mm; padding: 2mm 3mm; break-inside: avoid; } .box h3 { font-size: 8.6pt; margin: 0 0 1mm; } .box p { margin: 0 0 1mm; color: var(--muted); }
.box ul { margin: 0; padding-left: 4mm; } .box li { margin: .5mm 0; }
.mini td, .mini th { height: 4.1mm; font-size: 7.2pt; padding: 0 2px; line-height: 1.1; } .mini td:nth-child(2), .mini td:nth-child(3), .mini td:nth-child(5), .mini td:nth-child(6) { text-align: right; }
.todo { margin: 0; padding-left: 5mm; font-size: 8.2pt; } .todo li { margin: .3mm 0; }
.job { margin-top: 6px; border-top: 1.5px solid var(--ink); padding-top: 3px; } tr { break-inside: avoid; } .cover-end { break-after: page; }
.jh h2 { font-size: 10.5pt; margin: 0 0 1px; } .blank { font-size: 7.6pt; color: #b26a00; background: #fff3e0; border-radius: 3px; padding: 0 5px; vertical-align: 1px; font-weight: 600; } .no { font-size: 7.6pt; color: #fff; background: var(--ink); border-radius: 3px; padding: 0 4px; vertical-align: 1px; }
.meta { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 7.5pt; margin-bottom: 2px; } .meta b { color: var(--muted); font-weight: 600; margin-right: 2px; }
th.m, td.m { background-color: rgba(59,91,140,.045); } th.b, td.b { background-color: rgba(176,112,20,.05); }
col.c1 { width: 5.5mm; } col.c2 { width: auto; } col.c3 { width: 12mm; } col.cp { width: 10.5mm; } col.cq { width: 16mm; } col.ca { width: 14.5mm; }
tr.gh td { background: #f1f4f9; font-weight: 700; height: 4.2mm; font-size: 7.3pt; }
tr.tot td { font-weight: 700; background-color: #eef1f6; } tr.sub1 td { font-weight: 600; }
.pd { display: block; font-size: 6.2pt; font-weight: 400; color: var(--muted); }
.note { margin: 2px 0 0; font-size: 7.4pt; color: var(--muted); }
`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ผลตรวจเทียบใบตรวจราคา</title><style>${css}</style></head><body>${cover}${jobsHtml}${tail}</body></html>`;
fs.writeFileSync(OUT, html);
console.log("ok", filled.length, "jobs");
