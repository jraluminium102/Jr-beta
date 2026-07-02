"use client";

/**
 * เครื่องคิดราคา 4.0 — คิดจาก "ต้นทุนจริง" (R4.0 cost engine)
 * ราคาขาย = ทุน × (1 + กำไร%) ปัดร้อย · แก้ราคาวัสดุที่เดียว ทุกรุ่นขยับตาม
 * engine/products/pricebook ก๊อปตรงจากแพ็คเกจส่งต่อ (ผ่าน verify 63/63) — ห้ามแก้ไฟล์ engine โดยไม่รัน scripts/verify-r40.mjs
 * แยกเอกเทศจากเครื่องคิดราคา R3.9 เดิม (/calculator) — ไม่แตะของเก่า
 */
import { useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
// @ts-expect-error — engine เป็น ESM JS ล้วน (คงไฟล์เดิมเป๊ะเพื่อ parity 63/63)
import { computeCost } from "@/lib/calculator40/engine.mjs";
// @ts-expect-error — products เป็น ESM JS ล้วน
import { PRODUCTS, PRODUCTS_TODO } from "@/lib/calculator40/products.mjs";
import PRICEBOOK from "@/lib/calculator40/pricebook.json";

/* eslint-disable @typescript-eslint/no-explicit-any */

const GROUPS: { g: number; label: string }[] = [
  { g: 1, label: "G1 บาน" },
  { g: 2, label: "G2 ระแนง·รั้ว·ราว" },
  { g: 3, label: "G3 หลังคา·ฝ้า·ผนัง" },
  { g: 4, label: "G4 ตู้" },
  { g: 5, label: "G5 มุ้ง" },
  { g: 6, label: "G6 ห้องกระจก" },
  { g: 7, label: "G7 ม่านซิป" },
];

const COLOR_LABEL: Record<string, string> = {
  white: "อบขาว/ดำ", sahara: "เทาซาฮาร่า", special: "สีอบพิเศษ",
  woodSpecial: "ลายไม้อบพิเศษ", woodStock: "ลายไม้สต็อค",
};

type QuoteItem = {
  key: number;
  name: string;
  desc: string;       // ขนาด/รูปแบบ/สี/กระจก
  qty: number;        // จำนวนชุด
  perUnit: number;    // ราคาขาย+ติดตั้ง/ชุด
  cost: number;       // ทุน/ชุด (ไว้ดูกำไรรวม)
};

export default function Calculator40Client() {
  // pricebook แก้ได้ในหน้า (in-memory — รีเฟรชกลับค่าไฟล์ เหมือน mockup)
  const [pb, setPb] = useState<any>(() => JSON.parse(JSON.stringify(PRICEBOOK)));
  const [group, setGroup] = useState(1);
  const [prodId, setProdId] = useState<string>("sms_slide");
  const [showCost, setShowCost] = useState(false);   // โหมดดูทุน/กำไร
  const [adminOpen, setAdminOpen] = useState(false); // แผงแก้ราคา
  const [linesOpen, setLinesOpen] = useState(false);

  // อินพุตต่อรายการ
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [p, setP] = useState("");
  const [form, setForm] = useState<string>("");
  const [color, setColor] = useState("white");
  const [glassType, setGlassType] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [spec, setSpec] = useState<Record<string, string>>({});
  const [profit, setProfit] = useState("100");
  const [sets, setSets] = useState("1");

  // ใบเสนอราคาอย่างย่อ
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [keySeq, setKeySeq] = useState(1);

  const prod: any = (PRODUCTS as any)[prodId];
  const prodList = useMemo(
    () => Object.values(PRODUCTS as Record<string, any>).filter((x: any) => x && x.group === group),
    [group]
  );
  const todoList = useMemo(
    () => ((PRODUCTS_TODO as any[]) || []).filter((t: any) => t.group === group),
    [group]
  );

  function pickProduct(x: any) {
    setProdId(x.id);
    setW(String(x.defaults?.w ?? 200));
    setH(String(x.defaults?.h ?? 200));
    setP(String(x.defaults?.p ?? 1));
    setForm(x.defForm ?? (x.forms?.[0] ?? ""));
    setColor("white");
    setGlassType(x.defGlass ?? "");
    setMaterial(x.defMaterial ?? (x.materials?.[0] ?? ""));
    const s: Record<string, string> = {};
    (x.specOpts ?? []).forEach((o: any) => { s[o.key] = o.def ?? o.opts?.[0] ?? ""; });
    setSpec(s);
  }

  // คิดราคาสด
  const result = useMemo(() => {
    if (!prod) return null;
    try {
      const opt: any = {
        w: Number(w) || prod.defaults?.w || 200,
        h: Number(h) || prod.defaults?.h || 200,
        p: Number(p) || prod.defaults?.p || 1,
        form: form || prod.defForm,
        color,
        profitPct: Number(profit) || 100,
        spec,
      };
      if (glassType) opt.glassType = glassType;
      if (material) opt.material = material;
      return computeCost(pb, prod, opt);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as any;
    }
  }, [pb, prod, w, h, p, form, color, glassType, material, spec, profit]);

  const ok = result && !("error" in result);
  const glassKeys = useMemo(() => Object.keys((pb.GLASS ?? {}) as Record<string, number>), [pb]);

  function addToQuote() {
    if (!ok || !prod) return;
    const n = Math.max(1, Number(sets) || 1);
    const desc = `${w}×${h} ซม.`
      + (prod.forms?.length ? ` · ${form}` : "")
      + ((Number(p) || 1) > 1 ? ` · ${p} บาน` : "")
      + ` · ${COLOR_LABEL[color] ?? color}`
      + (glassType ? ` · ${glassType}` : "")
      + (material ? ` · ${material}` : "");
    setQuote((q) => [...q, {
      key: keySeq, name: prod.name, desc, qty: n,
      perUnit: result.sell.withInstall, cost: result.cost.total,
    }]);
    setKeySeq((k) => k + 1);
  }

  const quoteTotal = quote.reduce((s, it) => s + it.perUnit * it.qty, 0);
  const quoteCost = quote.reduce((s, it) => s + it.cost * it.qty, 0);

  function printQuote() {
    const rows = quote.map((it, i) =>
      `<tr><td>${i + 1}</td><td>${it.name}<div class="d">${it.desc}</div></td><td class="r">${it.qty}</td><td class="r">${baht(it.perUnit)}</td><td class="r">${baht(it.perUnit * it.qty)}</td></tr>`
    ).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ใบเสนอราคา (R4.0)</title><style>
      body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#1f2937}h2{color:#b3151d;margin:0 0 2px}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#fdecec;color:#7d0f15}
      .r{text-align:right}.d{font-size:11px;color:#6b7280}.t{font-weight:700}
      .note{margin-top:14px;font-size:11px;color:#9ca3af}</style></head><body>
      <h2>ใบเสนอราคา (ร่าง — เครื่องคิดราคา 4.0)</h2>
      <div style="font-size:12px;color:#6b7280">ราคารวมติดตั้ง · ยังไม่ใช่เอกสารทางการ — ออกใบเสนอราคาจริงที่เมนูใบเสนอราคา</div>
      <table><thead><tr><th>#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/ชุด</th><th class="r">รวม</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="t"><td colspan="4" class="r">รวมทั้งสิ้น</td><td class="r">฿${baht(quoteTotal)}</td></tr></tfoot></table>
      <div class="note">คิดโดยเครื่องคิดราคา R4.0 (ต้นทุนจริง × กำไร) · ${new Date().toLocaleDateString("th-TH")}</div>
      <script>window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  // ── แผงแก้ราคา (in-memory) ──
  function setAlu(brand: string, v: string) {
    setPb((old: any) => ({ ...old, ALU: { ...old.ALU, [brand]: Number(v) || 0 } }));
  }
  function setBake(k: string, v: string) {
    setPb((old: any) => ({ ...old, BAKE: { ...old.BAKE, [k]: Number(v) || 0 } }));
  }
  function setGlassPrice(k: string, v: string) {
    setPb((old: any) => ({ ...old, GLASS: { ...old.GLASS, [k]: Number(v) || 0 } }));
  }
  const [glassSearch, setGlassSearch] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="calculator" size={18} />
          </span>
          คิดราคา 4.0 <Badge tone="emerald">ต้นทุนจริง</Badge>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCost((v) => !v)}
            className={`press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${showCost ? "text-white bg-brand shadow-brand" : "glass-soft text-ink-2"}`}>
            💰 {showCost ? "ซ่อนทุน/กำไร" : "ดูทุน/กำไร"}
          </button>
          <button onClick={() => setAdminOpen((v) => !v)}
            className={`press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold ${adminOpen ? "text-white bg-brand shadow-brand" : "glass-soft text-ink-2"}`}>
            ⚙️ แก้ราคา
          </button>
        </div>
      </div>
      <p className="text-sm text-ink-3 -mt-3">
        ราคาขาย = ทุนจริง × (1 + กำไร%) ปัดร้อย — อลูขึ้นราคา แก้ที่ ⚙️ ทุกรุ่นขยับตามทันที · R3.9 เดิมยังใช้ได้ที่เมนูเครื่องคิดราคา
      </p>

      {/* ── แผงแก้ราคา (in-memory เหมือน mockup — รีเฟรชคืนค่าเดิม) ── */}
      {adminOpen && (
        <Card className="p-5 border-2 border-brand/25">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">⚙️ แก้ราคากลาง (ชั่วคราว — รีเฟรชหน้าแล้วคืนค่าจากไฟล์)</h3>
            <button onClick={() => setPb(JSON.parse(JSON.stringify(PRICEBOOK)))} className="press text-xs font-semibold glass-soft rounded-lg px-2.5 py-1.5 text-ink-2">↺ คืนค่าเดิม</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-ink-3 mb-1.5">ราคาอลูมิเนียม (฿/กก.)</div>
              <div className="space-y-1.5">
                {Object.keys(pb.ALU).map((b) => (
                  <label key={b} className="flex items-center gap-2">
                    <span className="w-24 text-ink-2">{b}</span>
                    <input type="number" value={pb.ALU[b]} onChange={(e) => setAlu(b, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-28 outline-none tabular-nums" />
                    <span className="text-xs text-ink-3">ฐาน {pb.ALU_BASE?.[b] ?? "—"}</span>
                  </label>
                ))}
              </div>
              <div className="text-xs font-semibold text-ink-3 mt-3 mb-1.5">ค่าอบสี (฿/กก.)</div>
              <div className="space-y-1.5">
                {Object.keys(pb.BAKE).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="w-32 text-ink-2">{COLOR_LABEL[k] ?? k}</span>
                    <input type="number" value={pb.BAKE[k]} onChange={(e) => setBake(k, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-28 outline-none tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-ink-3 mb-1.5">ราคากระจก (฿/ตร.ม.) — ค้นแล้วแก้</div>
              <input value={glassSearch} onChange={(e) => setGlassSearch(e.target.value)} placeholder="ค้นชื่อกระจก เช่น เทมเปอร์ 6"
                className="w-full glass-soft rounded-lg px-3 py-2 mb-2 outline-none" />
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {glassKeys.filter((k) => k.toLowerCase().includes(glassSearch.toLowerCase())).slice(0, 25).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="flex-1 text-ink-2 text-xs truncate">{k}</span>
                    <input type="number" value={pb.GLASS[k]} onChange={(e) => setGlassPrice(k, e.target.value)}
                      className="glass-soft rounded-lg px-3 py-1.5 w-24 outline-none tabular-nums" />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-ink-3 mt-3">* แก้ถาวร (อัปเดตไฟล์ราคา) = เฟสถัดไป — ตอนนี้ใช้ทดลอง/เช็คราคา ถ้าราคาจริงเปลี่ยนแจ้งเดฟอัปเดต pricebook</p>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── ซ้าย: เลือกกลุ่ม + รุ่น ── */}
        <Card className="p-4 lg:col-span-1">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {GROUPS.map((g) => (
              <button key={g.g} onClick={() => setGroup(g.g)}
                className={`press text-xs font-semibold rounded-full px-3 py-1.5 ${group === g.g ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 max-h-[62vh] overflow-y-auto">
            {prodList.map((x: any) => (
              <button key={x.id} onClick={() => pickProduct(x)} aria-current={prodId === x.id}
                className={`press w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 ${prodId === x.id ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
                <span className="text-lg">{x.icon ?? "▫️"}</span>
                <span className="font-semibold text-sm">{x.name}</span>
              </button>
            ))}
            {todoList.map((t: any, i: number) => (
              <div key={i} className="rounded-xl px-3 py-2 text-xs text-ink-3 border border-dashed border-gray-300">
                ⏳ {t.name} — ยังไม่ลงระบบ
              </div>
            ))}
            {prodList.length === 0 && todoList.length === 0 && <p className="text-sm text-ink-3 text-center py-4">กลุ่มนี้ยังไม่มีรุ่น</p>}
          </div>
        </Card>

        {/* ── ขวา: ฟอร์ม + ราคา ── */}
        <Card className="p-6 lg:col-span-2">
          {prod ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-brand-dark">{prod.icon} {prod.name}</h3>
                {prod.note && <span className="text-[11px] text-ink-3 max-w-[45%] text-right">{prod.note.slice(0, 90)}</span>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-4">
                <Field label="กว้าง (ซม.)" value={w} onChange={setW} />
                <Field label="สูง (ซม.)" value={h} onChange={setH} />
                {(prod.maxP ?? 1) > 1 || (prod.defaults?.p ?? 1) > 1 ? (
                  <Field label={`จำนวนบาน${prod.minP ? ` (${prod.minP}–${prod.maxP})` : ""}`} value={p} onChange={setP} />
                ) : <div />}
                <Field label="กำไร %" value={profit} onChange={setProfit} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
                {prod.forms?.length > 0 && (
                  <Select label="รูปแบบ" value={form} onChange={setForm} opts={prod.forms} />
                )}
                <Select label="สี" value={color} onChange={setColor}
                  opts={Object.keys(pb.BAKE)} labels={COLOR_LABEL} />
                {prod.defGlass && (
                  <Select label="กระจก" value={glassType} onChange={setGlassType} opts={glassKeys} />
                )}
                {prod.materials?.length > 0 && (
                  <Select label="วัสดุ" value={material} onChange={setMaterial} opts={prod.materials} />
                )}
                {(prod.specOpts ?? []).map((o: any) => (
                  <Select key={o.key} label={o.label} value={spec[o.key] ?? ""} onChange={(v) => setSpec((s) => ({ ...s, [o.key]: v }))} opts={o.opts} />
                ))}
              </div>

              {prod.addons?.length > 0 && (
                <p className="text-[11px] text-ink-3 mt-2">⏳ ของเสริม ({prod.addons.length} รายการ เช่น มอเตอร์/เสา/รางน้ำ) — เฟสถัดไป · ตอนนี้คิดตัวงานหลักก่อน</p>
              )}

              {/* ราคา */}
              {ok ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl px-5 py-4 glass-soft">
                    <div className="text-xs font-medium text-ink-3">ขายผลิตอย่างเดียว</div>
                    <div className="text-2xl font-bold text-brand-dark">฿{baht(result.sell.mfgOnly)}</div>
                  </div>
                  <div className="rounded-2xl px-5 py-4 bg-brand text-white shadow-brand">
                    <div className="text-xs font-medium text-red-100">ขาย + ติดตั้ง</div>
                    <div className="text-3xl font-bold leading-tight">฿{baht(result.sell.withInstall)}</div>
                    <div className="text-[11px] text-red-100 mt-0.5">พื้นที่ {result.input.area} ตร.ม. · อลู {result.aluKg} กก.</div>
                  </div>
                  {showCost && (
                    <div className="col-span-2 rounded-2xl px-5 py-4 bg-amber-50 border border-amber-200">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                        <span>ทุนรวม <b className="tabular-nums">฿{baht(result.cost.total)}</b></span>
                        <span className="text-emerald-700">กำไร <b className="tabular-nums">฿{baht(result.profit)}</b></span>
                        <span className="text-ink-3 text-xs">อลู {baht(result.cost.alu)} · สี {baht(result.cost.bake)} · กระจก {baht(result.cost.glass)} · อุปกรณ์ {baht(result.cost.hardware)} · สิ้นเปลือง {baht(result.cost.consum)} · ค่าแรงผลิต {baht(result.labor.prod)} · ติดตั้ง {baht(result.labor.install)}</span>
                      </div>
                      <button onClick={() => setLinesOpen((v) => !v)} className="press text-xs font-semibold text-brand-dark mt-2">
                        {linesOpen ? "ซ่อน" : "ดู"}รายละเอียด BOM ({result.lines.length} รายการ) →
                      </button>
                      {linesOpen && (
                        <div className="mt-2 max-h-56 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-left text-ink-3"><th className="py-1">รายการ</th><th className="text-right">จำนวน</th><th className="text-right">฿</th></tr></thead>
                            <tbody>
                              {result.lines.map((l: any, i: number) => (
                                <tr key={i} className="border-t border-black/5">
                                  <td className="py-1">{l.name} <span className="text-ink-3">({l.cat})</span></td>
                                  <td className="text-right tabular-nums">{baht(l.qty)} {l.unit}</td>
                                  <td className="text-right tabular-nums">{baht(l.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-5 text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3">คิดราคาไม่ได้: {(result as any)?.error ?? "ตรวจอินพุต"}</p>
              )}

              {/* เพิ่มลงรายการ */}
              <div className="mt-4 flex items-end gap-3">
                <Field label="จำนวน (ชุด)" value={sets} onChange={setSets} narrow />
                <button onClick={addToQuote} disabled={!ok}
                  className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  + เพิ่มลงรายการ
                </button>
              </div>
            </div>
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกรุ่นทางซ้าย</p>
          )}
        </Card>
      </div>

      {/* ── รายการที่คิดไว้ (ใบเสนอราคาอย่างย่อ) ── */}
      {quote.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-brand-dark">🧾 รายการที่คิดไว้ ({quote.length})</h3>
            <div className="flex items-center gap-2">
              <button onClick={printQuote} className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold glass-soft text-ink-2">
                <Icon name="printer" size={15} /> พิมพ์ (ร่าง)
              </button>
              <button onClick={() => setQuote([])} className="press text-xs text-ink-3 hover:text-red-600 px-2">ล้างทั้งหมด</button>
            </div>
          </div>
          <div className="overflow-x-auto glass-soft rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                  <th className="px-3 py-2 font-medium">รายการ</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                  <th className="px-3 py-2 font-medium text-right">ราคา/ชุด</th>
                  <th className="px-3 py-2 font-medium text-right">รวม</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {quote.map((it) => (
                  <tr key={it.key} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs text-ink-3">{it.desc}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(it.perUnit)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{baht(it.perUnit * it.qty)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setQuote((q) => q.filter((x) => x.key !== it.key))} className="text-ink-3 hover:text-red-600"><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="px-3 py-2.5" colSpan={3}>รวมทั้งสิ้น (รวมติดตั้ง)</td>
                  <td className="px-3 py-2.5 text-right text-brand-dark tabular-nums">฿{baht(quoteTotal)}</td>
                  <td></td>
                </tr>
                {showCost && (
                  <tr className="text-xs text-ink-3">
                    <td className="px-3 pb-2" colSpan={3}>ทุนรวม ฿{baht(quoteCost)} · กำไรรวม ฿{baht(quoteTotal - quoteCost)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-ink-3 mt-2">* ร่างสำหรับคิดราคาหน้างาน — ออกใบเสนอราคาจริง (มีเลขเอกสาร/หัวบิล) ที่เมนูใบเสนอราคา</p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange, narrow }: { label: string; value: string; onChange: (v: string) => void; narrow?: boolean }) {
  return (
    <label className={`block ${narrow ? "w-28" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none tabular-nums" />
    </label>
  );
}

function Select({ label, value, onChange, opts, labels }: {
  label: string; value: string; onChange: (v: string) => void; opts: string[]; labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
        {opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );
}
