// SPEC-G4-color-pricing verify — ค่าสีโครงตู้ (ผนัง/พื้น/ชั้นอลู) · อัปเดตโมเดลผนัง 3 ด้าน (G4 wall-sides 16มิ.ย.)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole(); const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const checks = []; const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(d, s, v) { const e = d.querySelector(s); if (!e) return; e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); e.dispatchEvent(new w.Event("input", { bubbles: true })); }
function chk(d,s,on){ const e=d.querySelector(s); if(!e)return; e.checked=!!on; e.dispatchEvent(new w.Event("change",{bubbles:true})); }
function setWallMat(d,mat){ ['left','right','back'].forEach(k=>sf(d,'.o-cabwall-'+k+'-mat',mat)); }
// cab() : ตู้ + ติ๊กผนัง 3 ด้าน (อลู) เพื่อทดสอบค่าสีโครง
function cab() { doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const d = doc.querySelector("#items .ch"); sf(d, ".i-group", "4"); sf(d, ".i-prod", "cabinet_alu"); sf(d, ".i-w", "1.2"); sf(d, ".i-h", "2.4"); sf(d, ".o-depth", "0.6"); sf(d, ".o-shelves", "5"); ['left','right','back'].forEach(k=>chk(d,'.o-cabwall-'+k+'-on',true)); setWallMat(d,'alu'); return d; }
const msgOf = (d) => (w.readItem(d).r.msgs || []).join(" | ");
const d = cab();
want("มีกล่องวัสดุผนังต่อด้าน (o-cabwall-left-mat)", !!d.querySelector(".o-cabwall-left-mat"));
sf(d, ".i-color", "0");
const white = w.readItem(d).r.sell;
want("สีขาว(idx0): ไม่มีค่าสีโครง", !/ค่าสีโครง/.test(msgOf(d)), msgOf(d).slice(0, 60));
sf(d, ".i-color", "10");
const aluPrem = w.readItem(d).r.sell;
want("สีพิเศษ(idx10): ค่าสีโครงเพิ่ม", aluPrem > white && /ค่าสีโครง/.test(msgOf(d)), "ขาว=" + white + " พิเศษ=" + aluPrem);
want("ผนังอลูทึบ ระบุในใบ", /อลูทึบ/.test(msgOf(d)));
sf(d, ".i-color", "4");
const aztec = w.readItem(d).r.sell;
want("Aztec(idx4): ค่าสีโครงเพิ่ม > ขาว", aztec > white && /ค่าสีโครง/.test(msgOf(d)), "ขาว=" + white + " aztec=" + aztec);
want("Aztec(idx4=950) < อบพิเศษ(idx10=1600)", aztec < aluPrem, "aztec=" + aztec + " พิเศษ=" + aluPrem);
sf(d, ".i-color", "10");
setWallMat(d,'glass');
const glassPrem = w.readItem(d).r.sell;
want("สลับผนังกระจก → ราคาเปลี่ยน", glassPrem !== aluPrem, "อลู=" + aluPrem + " กระจก=" + glassPrem);
want("ผนังกระจก ระบุในใบ", /กระจก/.test(msgOf(d)));
setWallMat(d,'alu');
const aluAluShelf = w.readItem(d).r.sell;
sf(d, ".o-shelfmat", "glass");
const aluGlassShelf = w.readItem(d).r.sell;
want("ชั้นกระจก: ค่าสีชั้นไม่คิด (ถูกกว่าชั้นอลู หรือเท่า)", aluGlassShelf <= aluAluShelf, "ชั้นอลู=" + aluAluShelf + " ชั้นกระจก=" + aluGlassShelf);
want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));
let pass = 0;
console.log("\n=== SPEC-G4-color-pricing (ผนัง 3 ด้าน) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
