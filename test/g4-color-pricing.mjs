// SPEC-G4-color-pricing verify — ค่าสีโครงตู้ (ผนัง/พื้น/ชั้นอลู) + วัสดุผนัง อลู/กระจก
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => { if (!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;

const checks = [];
const want = (n, ok, d) => checks.push({ n, ok: !!ok, d: d || "" });
function sf(d, s, v) { const e = d.querySelector(s); if (!e) return; e.value = String(v); e.dispatchEvent(new w.Event("change", { bubbles: true })); e.dispatchEvent(new w.Event("input", { bubbles: true })); }
function cab() { w.addItem(); const chs = doc.querySelectorAll("#items .ch"); const d = chs[chs.length - 1]; sf(d, ".i-group", "4"); sf(d, ".i-prod", "cabinet_alu"); sf(d, ".i-w", "1.2"); sf(d, ".i-h", "2.4"); sf(d, ".o-depth", "0.6"); sf(d, ".o-shelves", "5"); const bw = d.querySelector(".o-backwall"); bw.checked = true; bw.dispatchEvent(new w.Event("change", { bubbles: true })); return d; }
const msgOf = (d) => (w.readItem(d).r.msgs || []).join(" | ");

const d = cab();
want("มีชิป วัสดุผนังตู้ (o-cabwallmat)", !!d.querySelector(".o-cabwallmat"));

// ขาว idx0 → ค่าสีโครง = 0
sf(d, ".i-color", "0");
const white = w.readItem(d).r.sell;
want("สีขาว(idx0): ไม่มีค่าสีโครง", !/ค่าสีโครง/.test(msgOf(d)), msgOf(d).slice(0, 60));

// สีอบพิเศษ idx10 → ค่าสีโครง เพิ่ม
sf(d, ".i-color", "10");
const aluPrem = w.readItem(d).r.sell;
want("สีพิเศษ(idx10): ค่าสีโครงเพิ่ม", aluPrem > white && /ค่าสีโครง/.test(msgOf(d)), "ขาว=" + white + " พิเศษ=" + aluPrem);
want("ผนังอลูทึบ ระบุในใบ", /ผนังอลูทึบ/.test(msgOf(d)));

// สลับเป็นผนังกระจก → ราคาเปลี่ยน + ระบุผนังกระจก
sf(d, ".o-cabwallmat", "glass");
const glassPrem = w.readItem(d).r.sell;
want("สลับผนังกระจก → ราคาเปลี่ยน", glassPrem !== aluPrem, "อลู=" + aluPrem + " กระจก=" + glassPrem);
want("ผนังกระจก ระบุในใบ", /ผนังกระจก/.test(msgOf(d)));

// ชั้นกระจก (shelfmat=glass) → ไม่คิดค่าสีชั้น (ค่าสีโครงลดเทียบชั้นอลู)
sf(d, ".o-cabwallmat", "alu");
const aluAluShelf = w.readItem(d).r.sell;
sf(d, ".o-shelfmat", "glass");
const aluGlassShelf = w.readItem(d).r.sell;
want("ชั้นกระจก: ค่าสีชั้นไม่คิด (ถูกกว่าชั้นอลู หรือเท่า)", aluGlassShelf <= aluAluShelf, "ชั้นอลู=" + aluAluShelf + " ชั้นกระจก=" + aluGlassShelf);

want("ไม่มี JS error", errors.length === 0, errors.slice(0, 2).join(" / "));

let pass = 0;
console.log("\n=== SPEC-G4-color-pricing (ค่าสีโครงตู้) ===");
for (const c of checks) { console.log((c.ok ? "  ✓ " : "  ✗ ") + c.n + (c.d ? "  [" + c.d + "]" : "")); if (c.ok) pass++; }
console.log("\nสรุป: ผ่าน " + pass + "/" + checks.length);
process.exit(pass === checks.length ? 0 : 1);
