// HANDOFF-G6 เฟส B — ธง①③⑤⑥①⑥② (engine ร่วม G1+G6) · ราคา/เมนูถูกต้อง ไม่ regress
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errs = [];
vc.on("jsdomError", e => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errs.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
function sf(ch, sel, v) { const e = ch.querySelector(sel); if (!e) return; e.value = String(v); e.dispatchEvent(new w.Event('input', { bubbles: true })); e.dispatchEvent(new w.Event('change', { bubbles: true })); }
function add(g, p) { w.addItem(); const chs = doc.querySelectorAll('#items .ch'); const d = chs[chs.length - 1]; sf(d, '.i-group', g); if (p) sf(d, '.i-prod', p); return d; }
const C = []; const want = (n, ok, d) => C.push({ n, ok: !!ok, d: d || '' });

// ===== ธง① มุ้ง imp28/imp30 ติดบาน + ราคาตรงเรต =====
const dk = add('1', 'casement_euro'); sf(dk, '.i-w', '2'); sf(dk, '.i-h', '1');
const mq = dk.querySelector('.o-mosq');
want('① บานเปิดมี o-mosq', !!mq);
want('① o-mosq มี imp28', !!(mq && mq.querySelector('option[value="imp28"]')));
want('① o-mosq มี imp30', !!(mq && mq.querySelector('option[value="imp30"]')));
sf(dk, '.o-mosq', 'imp28');
if (dk.querySelector('.o-mosqw')) { sf(dk, '.o-mosqw', '2'); sf(dk, '.o-mosqh', '1'); }
if (dk.querySelector('.o-mosqpanels')) sf(dk, '.o-mosqpanels', '1');
const line28 = (w.readItem(dk).r.addonLines || []).find(x => /ตีนตะขาบ|จีบ/.test(x.n || ''));
want('① imp28 ราคา base = 2×4500 = 9000', line28 && Math.abs(line28.p - 9000) < 1, line28 ? 'p=' + line28.p : 'no line');

// ===== ธง③ เฟี้ยม X ตัดมุ้ง =====
want('③ folding_xseries ไม่มี o-mosq', !add('1', 'folding_xseries').querySelector('.o-mosq'));
want('③ folding ปกติ ยังมี o-mosq', !!add('1', 'folding').querySelector('.o-mosq'));

// ===== ธง⑤ เลื่อนรางล่าง ซ่อนจากเมนู + รางเตี้ย → ใบ "(งานภายใน)" =====
const g6opts = w.prodOptionsG6('1');
want('⑤ inner_bottom_sms ซ่อนจากเมนู', g6opts.indexOf('inner_bottom_sms') < 0);
want('⑤ inner_bottom_euro ซ่อนจากเมนู', g6opts.indexOf('inner_bottom_euro') < 0);
want('⑤ inner_top_stack ยังอยู่ (รางบนไม่ตัด)', g6opts.indexOf('inner_top_stack') >= 0);
// รางเตี้ย quote — บานเลื่อนที่มี o-bottomrail
const dsl = add('1', 'sliding_sms'); sf(dsl, '.i-w', '2'); sf(dsl, '.i-h', '2');
const br = dsl.querySelector('.o-bottomrail');
if (br) { sf(dsl, '.o-bottomrail', 'เตี้ย'); w.genQuote(); const qc = doc.querySelector('#quoteContent').textContent;
  want('⑤ ใบมี "งานภายใน" เมื่อเลือกรางเตี้ย', /งานภายใน/.test(qc), ''); }
else want('⑤ sliding_sms มี o-bottomrail', false, 'no o-bottomrail (อาจคนละรุ่น)');

// ===== ธง⑥① ตัด o-solidlower · เก็บ o-solidlight =====
const dpane = add('1', 'sliding_euro');
want('⑥① บานทั่วไปไม่มี o-solidlower (แผ่นทึบล่าง)', !dpane.querySelector('.o-solidlower'));
const dsolid = add('1', 'casement_flush_solid');
want('⑥① บานโซลิดมี o-solidlight (ช่องแสง)', !!dsolid.querySelector('.o-solidlight'), 'ช่องแสงต้องเก็บไว้');
want('⑥① บานโซลิดไม่มี o-solidlower', !dsolid.querySelector('.o-solidlower'));

// ===== ธง⑥② คาดตาราง เปิดให้ ติดตาย/บานเปลือย =====
want('⑥② ติดตาย มี o-gridmark', !!add('1', 'fixed_glass').querySelector('.o-gridmark'));
want('⑥② บานเปลือย มี o-gridmark', !!add('1', 'frameless_fixed').querySelector('.o-gridmark'));
want('⑥② บานเลื่อน ยังมี o-gridmark (ไม่ regress)', !!add('1', 'sliding_euro').querySelector('.o-gridmark'));
want('⑥② shower ยังไม่มี o-gridmark (คงเดิม)', !add('1', 'shower').querySelector('.o-gridmark'));

// ===== ธง④ ผนังเบา wall_ext/wall_int เข้าถึงได้ในกลุ่ม 6 =====
const g6list = w.prodOptionsG6('6');
want('④ กลุ่ม 6 มี wall_ext', g6list.indexOf('wall_ext') >= 0);
want('④ กลุ่ม 6 มี wall_int', g6list.indexOf('wall_int') >= 0);
want('④ กลุ่ม 6 มี isowall', g6list.indexOf('isowall') >= 0);

// ===== ธง⑥③ เฟี้ยม เปิดซ้าย/ขวา (label-only) =====
const dfd = add('1', 'folding'); sf(dfd, '.i-w', '2'); sf(dfd, '.i-h', '2');
const fdChips = dfd.querySelectorAll('.chip[onclick*="o-folddir"]');
want('⑥③ เฟี้ยม มีชิปทิศเปิด (3 ตัว)', fdChips.length === 3, 'n=' + fdChips.length);
const sellFd0 = w.readItem(dfd).r.sell;
const cL = [].find.call(fdChips, c => c.dataset.val === 'เปิดซ้าย'); if (cL) cL.click();
want('⑥③ เลือกเปิดซ้าย → folddir=เปิดซ้าย', w.readItem(dfd).optSel.folddir === 'เปิดซ้าย');
want('⑥③ ทิศเปิด ไม่กระทบราคา (label-only)', w.readItem(dfd).r.sell === sellFd0, '0=' + sellFd0 + ' after=' + w.readItem(dfd).r.sell);
w.genQuote(); want('⑥③ ใบมี "เปิดซ้าย"', /เปิดซ้าย/.test(doc.querySelector('#quoteContent').textContent));
want('⑥③ บานเลื่อน ไม่มีทิศเปิดเฟี้ยม', !add('1', 'sliding_euro').querySelector('.o-folddir'));

// ===== ธง② นิรภัย/กันแมว/กันหนู = ผ้ามุ้ง ไม่ใช่ชนิด addon =====
const dm = add('1', 'casement_euro');
const mqSel = dm.querySelector('.o-mosq');
const mqIds = mqSel ? [].map.call(mqSel.options, o => o.value) : [];
want('② เมนูมุ้งชนิด (addon) ไม่มี imp31(นิรภัย)/imp33(กันแมว)/imp35(กันหนู)', !mqIds.includes('imp31') && !mqIds.includes('imp33') && !mqIds.includes('imp35'), mqIds.join(','));
sf(dm, '.o-mosq', 'imp21'); // เลือกมุ้งสักตัวให้ผ้าโผล่
const fabSel = dm.querySelector('.o-mosqfabric');
const fabVals = fabSel ? [].map.call(fabSel.options, o => o.value) : [];
want('② ผ้ามุ้งมี กันแมว(anti_pet)/กันหนู(stainless)/นิรภัย(safety08)', fabVals.includes('anti_pet') && fabVals.includes('stainless') && fabVals.includes('safety08'), fabVals.join(','));

want('ไม่มี JS error', errs.length === 0, errs.slice(0, 2).join(' / '));

let pass = 0;
console.log('\n=== HANDOFF-G6 เฟส B (ธง①③⑤⑥①⑥②④) ===');
for (const c of C) { console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.n + (c.d ? '  [' + c.d + ']' : '')); if (c.ok) pass++; }
console.log('\nสรุป: ผ่าน ' + pass + '/' + C.length);
process.exit(pass === C.length ? 0 : 1);
