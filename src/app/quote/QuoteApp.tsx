"use client";

import { useEffect, useMemo, useState } from "react";
import { calcItem, usesArea, tierFor, baht, type Pricebook, type Product } from "@/lib/quick-quote/engine";
// เครื่องคิดงานพื้น — ใช้ engine เดิม (ลอกมาตรง ๆ ตามที่เจ้าของสั่ง)
import { planFloor, draftItems, PILE_TYPES } from "@/lib/floor-calc/engine.mjs";

// ─────────────── localStorage ───────────────
const LS = { pb: "qq.pb.v1", cur: "qq.cur.v1", saved: "qq.saved.v1" };
const readLS = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const writeLS = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// ─────────────── types ───────────────
type Line = {
  id: string;
  productKey: string;   // "custom" = กรอกเอง
  label: string;        // ชื่อที่โชว์
  detail: string;       // ขนาด/สเปคย่อ
  qty: number;
  perSet: number;
  total: number;
};
type Quote = { id: string; customer: string; note: string; createdAt: string; lines: Line[] };
const emptyQuote = (): Quote => ({ id: uid(), customer: "", note: "", createdAt: todayISO(), lines: [] });
const grandOf = (q: Quote) => q.lines.reduce((a, l) => a + (l.total || 0), 0);

// ═══════════════════════════════════════════════════════════
export default function QuoteApp() {
  const [pb, setPb] = useState<Pricebook | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"calc" | "floor" | "saved">("calc");
  const [cur, setCur] = useState<Quote>(emptyQuote);

  // โหลดจากเครื่องตอนเปิด
  useEffect(() => {
    const cached = readLS<Pricebook | null>(LS.pb, null);
    if (cached?.products?.length) setPb(cached);
    const c = readLS<Quote | null>(LS.cur, null);
    if (c?.lines) setCur(c);
    setReady(true);
  }, []);
  // เซฟใบปัจจุบันอัตโนมัติ
  useEffect(() => { if (ready) writeLS(LS.cur, cur); }, [cur, ready]);

  if (!ready) return <Splash />;
  if (!pb) return <PinGate onUnlock={(p) => { writeLS(LS.pb, p); setPb(p); }} />;

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-800">
      <Header cur={cur} pb={pb} onRefreshPrices={(p) => { writeLS(LS.pb, p); setPb(p); }} />
      <TabBar tab={tab} setTab={setTab} savedCount={readLS<Quote[]>(LS.saved, []).length} />
      <main className="mx-auto max-w-2xl px-3 pb-28 pt-3">
        {tab === "calc" && <CalcTab pb={pb} cur={cur} setCur={setCur} />}
        {tab === "floor" && <FloorTab cur={cur} setCur={setCur} goCalc={() => setTab("calc")} />}
        {tab === "saved" && <SavedTab loadInto={(q) => { setCur(q); setTab("calc"); }} />}
      </main>
      {tab !== "saved" && <BottomBar cur={cur} setCur={setCur} />}
    </div>
  );
}

// ─────────────── Splash / PIN ───────────────
function Splash() {
  return <div className="grid min-h-[100dvh] place-items-center bg-slate-100 text-slate-400">กำลังโหลด…</div>;
}

function PinGate({ onUnlock }: { onUnlock: (pb: Pricebook) => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/quick-quote/unlock", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j?.error || "เข้าไม่ได้"); return; }
      onUnlock(j.pricebook);
    } catch { setErr("เชื่อมต่อไม่ได้ ลองใหม่"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-gradient-to-b from-slate-800 to-slate-900 px-6 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="mb-1 text-2xl font-bold tracking-tight">JR Aluminium</div>
        <div className="mb-8 text-sm text-slate-300">คิดราคาประเมินหน้างาน</div>
        <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
          <label className="mb-2 block text-left text-sm text-slate-200">รหัสผ่าน</label>
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full rounded-xl border border-white/20 bg-white/90 px-4 py-3 text-center text-lg tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="••••"
          />
          {err && <div className="mt-2 text-sm text-rose-300">{err}</div>}
          <button
            onClick={submit} disabled={busy || pin.length < 3}
            className="mt-4 w-full rounded-xl bg-sky-500 py-3 text-base font-semibold text-white active:bg-sky-600 disabled:opacity-40"
          >
            {busy ? "กำลังตรวจ…" : "เข้าใช้งาน"}
          </button>
        </div>
        <div className="mt-4 text-xs text-slate-400">ใส่ครั้งเดียว เครื่องนี้จะจำไว้</div>
      </div>
    </div>
  );
}

// ─────────────── Header + Tabs + Bars ───────────────
function Header({ cur, pb, onRefreshPrices }: { cur: Quote; pb: Pricebook; onRefreshPrices: (p: Pricebook) => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);   // แถวใส่รหัสอัปเดตราคา (inline · ไม่ใช้ prompt เพราะ LINE in-app บล็อกได้)
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = async () => {
    if (!pin) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/quick-quote/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
      const j = await res.json();
      if (res.ok) { onRefreshPrices(j.pricebook); setMsg("อัปเดตแล้ว ✓"); setOpen(false); setPin(""); }
      else setMsg(j?.error || "อัปเดตไม่ได้");
    } catch { setMsg("เชื่อมต่อไม่ได้"); }
    finally { setBusy(false); }
  };
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-3 py-2.5">
        <div>
          <div className="text-[15px] font-bold leading-tight text-slate-800">JR Aluminium</div>
          <button onClick={() => { setOpen((v) => !v); setMsg(null); }} className="text-[11px] text-slate-400 underline decoration-dotted underline-offset-2">
            คิดราคาประเมิน · {pb.version} · อัปเดตราคา
          </button>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">รวม</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">฿{baht(grandOf(cur))}</div>
        </div>
      </div>
      {open && (
        <div className="mx-auto flex max-w-2xl items-center gap-2 border-t border-slate-100 px-3 py-2">
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refresh()}
            placeholder="ใส่รหัสเพื่อดึงราคาล่าสุด" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400" />
          <button onClick={refresh} disabled={busy || pin.length < 3} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "…" : "ตกลง"}</button>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      )}
    </header>
  );
}

function TabBar({ tab, setTab, savedCount }: { tab: string; setTab: (t: any) => void; savedCount: number }) {
  const T = [
    { k: "calc", label: "คิดราคา" },
    { k: "floor", label: "งานพื้น" },
    { k: "saved", label: `บันทึกไว้${savedCount ? ` (${savedCount})` : ""}` },
  ];
  return (
    <nav className="sticky top-[52px] z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl">
        {T.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex-1 py-2.5 text-sm font-medium transition ${tab === t.k ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// แถบล่าง — จำนวนรายการ + ปุ่มดูใบสรุป
function BottomBar({ cur, setCur }: { cur: Quote; setCur: (q: Quote) => void }) {
  const [summary, setSummary] = useState(false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="text-sm text-slate-500">{cur.lines.length} รายการ · <span className="font-bold text-slate-900">฿{baht(grandOf(cur))}</span></div>
          <button onClick={() => setSummary(true)} disabled={!cur.lines.length}
            className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white active:bg-slate-900 disabled:opacity-40">
            ดูใบสรุป
          </button>
        </div>
      </div>
      {summary && <SummaryModal cur={cur} setCur={setCur} close={() => setSummary(false)} />}
    </>
  );
}

// ─────────────── CalcTab ───────────────
function CalcTab({ pb, cur, setCur }: { pb: Pricebook; cur: Quote; setCur: (q: Quote) => void }) {
  const [cat, setCat] = useState<string>(pb.categories[0]?.label ?? "");
  const [search, setSearch] = useState("");
  const [productKey, setProductKey] = useState<string>("");
  const [w, setW] = useState(""); const [h, setH] = useState(""); const [qty, setQty] = useState("1");
  const [extraPanels, setExtraPanels] = useState("0");
  const [tieredAddLabel, setTieredAddLabel] = useState("");
  const [colorAddName, setColorAddName] = useState("");
  // ตัวเลือกต่อบาน (กระจก/สีโครง/คาดตาราง)
  const [glassKey, setGlassKey] = useState(""); const [frameColorKey, setFrameColorKey] = useState(""); const [gridBaht, setGridBaht] = useState("");
  const [customName, setCustomName] = useState(""); const [customPrice, setCustomPrice] = useState("");

  const products = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pb.products.filter((p) => (s ? (p.name + " " + (p.brand ?? "")).toLowerCase().includes(s) : p.category === cat));
  }, [pb, cat, search]);

  const product: Product | null = useMemo(() => pb.products.find((p) => p.key === productKey) ?? null, [pb, productKey]);
  const isCustom = productKey === "custom";
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  // ตัวเลือกต่อบาน — โชว์เฉพาะบาน/หน้าต่าง/กระจกเปลือย (มีกระจก+สีโครง+คาดตาราง)
  const glassOpts = useMemo(() => pb.products.filter((p) => p.category === "กระจก (เปลี่ยน/เพิ่ม)"), [pb]);
  const colorOpts = useMemo(() => pb.products.filter((p) => p.category === "สี/พื้นผิว (เพิ่ม)"), [pb]);
  const showDoorOptions = !!product && (product.category === "ประตู/หน้าต่าง" || product.category === "กระจกเปลือย/ตู้");

  const result = useMemo(() => {
    if (!product) return null;
    const areaNow = num(w) * num(h);
    const glass = showDoorOptions ? glassOpts.find((g) => g.key === glassKey) : null;
    const color = showDoorOptions ? colorOpts.find((c) => c.key === frameColorKey) : null;
    const frameColorRate = color ? (tierFor(color.tiers, areaNow)?.price ?? color.flatRate ?? 0) : 0;
    return calcItem(product, {
      width: num(w), height: num(h), qty: num(qty) || 1,
      extraPanels: num(extraPanels), tieredAddLabel: tieredAddLabel || null, colorAddName: colorAddName || null,
      glassRate: glass ? glass.flatRate ?? 0 : 0,
      frameColorRate,
      gridBaht: showDoorOptions ? num(gridBaht) : 0,
    });
  }, [product, w, h, qty, extraPanels, tieredAddLabel, colorAddName, glassKey, frameColorKey, gridBaht, showDoorOptions, glassOpts, colorOpts]);

  const resetInputs = () => { setW(""); setH(""); setQty("1"); setExtraPanels("0"); setTieredAddLabel(""); setColorAddName(""); setGlassKey(""); setFrameColorKey(""); setGridBaht(""); setCustomName(""); setCustomPrice(""); };

  const addLine = () => {
    if (isCustom) {
      const price = num(customPrice);
      if (!customName.trim() || price <= 0) return;
      setCur({ ...cur, lines: [...cur.lines, { id: uid(), productKey: "custom", label: customName.trim(), detail: "กรอกเอง", qty: 1, perSet: price, total: price }] });
      resetInputs(); return;
    }
    if (!product || !result || result.total <= 0) return;
    // ต้องกรอกขนาด/จำนวนก่อน (กันกดเผลอได้ราคาขั้นต่ำเข้าใบทั้งที่ยังไม่วัด)
    if (usesArea(product)) { if (num(w) <= 0 || num(h) <= 0) { alert("กรอกกว้าง × สูง ก่อน"); return; } }
    else if (num(w) <= 0) { alert("กรอกจำนวนก่อน"); return; }
    const q = num(qty) || 1;
    const detailParts: string[] = [];
    if (usesArea(product)) detailParts.push(`${w || "?"}×${h || "?"} ม. (${result.area} ตร.ม.)`);
    else detailParts.push(`${w || "?"} ${result.unitLabel}`);
    if (q > 1) detailParts.push(`× ${q} ชุด`);
    if (result.panelAdd) detailParts.push("+เพิ่มบาน");
    if (colorAddName) detailParts.push(`+${colorAddName}`);
    if (showDoorOptions) {
      const g = glassOpts.find((x) => x.key === glassKey); if (g) detailParts.push(`+${g.name.slice(0, 24)}`);
      const c = colorOpts.find((x) => x.key === frameColorKey); if (c) detailParts.push(`+${c.name.replace(/^เพิ่ม/, "")}`);
      if (num(gridBaht) > 0) detailParts.push("+คาดตาราง");
    }
    const label = [product.name, product.brand].filter(Boolean).join(" · ");
    setCur({ ...cur, lines: [...cur.lines, { id: uid(), productKey: product.key, label, detail: detailParts.join(" "), qty: q, perSet: result.perSet, total: result.total }] });
    resetInputs();
  };

  const removeLine = (id: string) => setCur({ ...cur, lines: cur.lines.filter((l) => l.id !== id) });

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setProductKey(""); }}
          placeholder="🔍 ค้นหาสินค้า เช่น บานเลื่อน, ชินโค, มุ้ง…"
          className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />

        {!search.trim() && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {pb.categories.map((c) => (
              <button key={c.label} onClick={() => { setCat(c.label); setProductKey(""); }}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${cat === c.label ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        <select value={productKey} onChange={(e) => { setProductKey(e.target.value); resetInputs(); }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400">
          <option value="">— เลือกสินค้า ({products.length}) —</option>
          <option value="custom">✎ กรอกเอง (รายการอื่น)</option>
          {products.map((p) => <option key={p.key} value={p.key}>{[p.name, p.brand].filter(Boolean).join(" · ")}</option>)}
        </select>

        {isCustom && (
          <div className="mt-3 space-y-2">
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="ชื่อรายการ" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />
            <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} inputMode="numeric" placeholder="ราคา (บาท)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />
          </div>
        )}

        {product && (
          <div className="mt-3 space-y-3">
            {usesArea(product) ? (
              <div className="grid grid-cols-2 gap-2">
                <NumField label="กว้าง (ม.)" value={w} onChange={setW} />
                <NumField label="สูง (ม.)" value={h} onChange={setH} />
              </div>
            ) : (
              <NumField label={`จำนวน (${product.unit === "panel" ? "บาน" : product.unit === "meter" ? "เมตร" : "ชุด"})`} value={w} onChange={setW} />
            )}
            {product.priceMode === "flat_by_area" && <div className="-mt-1 text-[11px] text-slate-400">ราคาต่อชุดตามช่วงพื้นที่ (ไม่คูณพื้นที่)</div>}
            <div className="grid grid-cols-2 gap-2">
              <NumField label="จำนวนชุด/จุด" value={qty} onChange={setQty} />
              {product.perPanelAdd && <NumField label={`เพิ่มบาน (+${baht(product.perPanelAdd.amount)}/บาน)`} value={extraPanels} onChange={setExtraPanels} />}
            </div>
            {product.tieredAdds.length > 0 && (
              <SelField label="เพิ่มบาน" value={tieredAddLabel} onChange={setTieredAddLabel}
                options={[{ v: "", t: "ไม่เพิ่ม" }, ...product.tieredAdds.map((a) => ({ v: a.label, t: `${a.label} (+${baht(a.amount)})` }))]} />
            )}
            {product.colorAdds.length > 0 && (
              <SelField label="สี / พื้นผิว" value={colorAddName} onChange={setColorAddName}
                options={[{ v: "", t: "สีมาตรฐาน" }, ...product.colorAdds.map((a) => ({ v: a.name, t: `${a.name} (+${baht(a.amount)}/ตร.ม.)` }))]} />
            )}

            {/* ── ตัวเลือกต่อบาน (บาน/หน้าต่าง) — กระจก / สีโครง / คาดตาราง ── */}
            {showDoorOptions && (
              <div className="space-y-2 rounded-xl bg-sky-50/60 p-2.5">
                <div className="text-[11px] font-semibold text-sky-700">ตัวเลือกต่อบาน (ถ้ามี)</div>
                <SelField label="เปลี่ยน/เพิ่มกระจก" value={glassKey} onChange={setGlassKey}
                  options={[{ v: "", t: "กระจกมาตรฐาน (รวมในราคาแล้ว)" }, ...glassOpts.map((g) => ({ v: g.key, t: `${g.name} (+${baht(g.flatRate ?? 0)}/ตร.ม.)` }))]} />
                <SelField label="สีโครงอลูมิเนียม" value={frameColorKey} onChange={setFrameColorKey}
                  options={[{ v: "", t: "อบขาว/มาตรฐาน" }, ...colorOpts.map((c) => ({ v: c.key, t: c.name.replace(/^เพิ่ม/, "") }))]} />
                <NumField label="คาดตาราง (กรอกยอดเพิ่ม บาท)" value={gridBaht} onChange={setGridBaht} />
                <div className="text-[10px] text-slate-400">*คาดตารางไม่มีในไฟล์ราคาประเมิน — กรอกยอดที่จะบวกเอง</div>
              </div>
            )}

            {product.note && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">💡 {product.note}</div>}
            {(product.min != null || product.unitNote) && (
              <div className="text-xs text-slate-400">
                {product.min != null && `ขั้นต่ำ ฿${baht(product.min)}/ชุด`}
                {product.unitNote && product.unitNote !== "ขั้นต่ำ" && ` · ${product.unitNote}`}
              </div>
            )}
          </div>
        )}

        {(result || isCustom) && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <div>
              <div className="text-[11px] text-slate-400">ราคาประเมิน</div>
              <div className="text-xl font-bold tabular-nums text-slate-900">฿{baht(isCustom ? num(customPrice) : result?.total ?? 0)}</div>
              {result?.minApplied && <div className="text-[11px] text-sky-500">ใช้ราคาขั้นต่ำ</div>}
            </div>
            <button onClick={addLine} className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white active:bg-sky-600">➕ เพิ่มรายการ</button>
          </div>
        )}
      </section>

      {cur.lines.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {cur.lines.map((l, i) => (
            <div key={l.id} className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
              <div className="mt-0.5 text-xs font-semibold text-slate-300">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug text-slate-800">{l.label}</div>
                <div className="text-xs text-slate-400">{l.detail}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold tabular-nums text-slate-900">฿{baht(l.total)}</div>
                <button onClick={() => removeLine(l.id)} className="text-[11px] text-rose-400 active:text-rose-600">ลบ</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base tabular-nums outline-none focus:border-sky-400" />
    </label>
  );
}
function SelField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400">
        {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
}

// ─────────────── FloorTab (คิดราคางานพื้น — ใช้ engine เดิม) ───────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FItem = { name: string; qty: number; unit: string; unit_price: number; line_total: number };
function FloorTab({ cur, setCur, goCalc }: { cur: Quote; setCur: (q: Quote) => void; goCalc: () => void }) {
  const [w, setW] = useState(""); const [l, setL] = useState("");
  const [pileKey, setPileKey] = useState<string>(PILE_TYPES[0].key);
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  const { items, total, plan } = useMemo(() => {
    const width = num(w), length = num(l);
    if (width <= 0 || length <= 0) return { items: [] as FItem[], total: 0, plan: null as any };
    const p = planFloor(width, length);
    const its = draftItems(p, pileKey) as FItem[];
    return { items: its, total: its.reduce((a, it) => a + (Number(it.line_total) || 0), 0), plan: p };
  }, [w, l, pileKey]);

  const addToQuote = () => {
    if (total <= 0) return;
    const label = `งานพื้น (${w}×${l} ม.)`;
    setCur({ ...cur, lines: [...cur.lines, { id: uid(), productKey: "floor", label, detail: `${plan.area} ตร.ม. · เข็ม ${plan.piles} ต้น`, qty: 1, perSet: total, total }] });
    goCalc();
  };

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-700">งานพื้น — กรอกแค่ กว้าง × ยาว ระบบคิดเข็ม/คาน/พื้นให้</div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="กว้าง (ม.)" value={w} onChange={setW} />
          <NumField label="ยาว (ม.)" value={l} onChange={setL} />
        </div>
        <div className="mt-3">
          <SelField label="ชนิดเข็ม" value={pileKey} onChange={setPileKey}
            options={PILE_TYPES.map((p: any) => ({ v: p.key, t: `${p.label}${p.price ? ` (฿${baht(p.price)}/ต้น)` : ""}` }))} />
        </div>
        {plan && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            พื้นที่ {plan.area} ตร.ม. · เข็ม {plan.piles} ต้น ({plan.rowsW}×{plan.rowsL}) · คานรวม {plan.beamLen} ม.
            {plan.tooTight && <span className="text-amber-600"> · ⚠ พื้นแคบ เข็มชิด</span>}
          </div>
        )}
      </section>

      {items.length > 0 && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {items.map((it, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-slate-700">{it.name}</div>
                  <div className="text-[11px] text-slate-400">{it.qty} {it.unit} × ฿{baht(it.unit_price)}</div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">฿{baht(it.line_total)}</div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="text-sm font-semibold text-slate-600">รวมงานพื้น</div>
              <div className="text-lg font-bold tabular-nums text-slate-900">฿{baht(total)}</div>
            </div>
          </section>
          <button onClick={addToQuote} className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white active:bg-sky-600">
            ➕ เพิ่มงานพื้นเข้าใบคิดราคา
          </button>
          <div className="text-center text-[11px] text-slate-400">ฟอร์มช่างเพยาว์ · ไม่รวม VAT · ราคาประเมิน</div>
        </>
      )}
    </div>
  );
}

// ─────────────── SavedTab ───────────────
function SavedTab({ loadInto }: { loadInto: (q: Quote) => void }) {
  const [list, setList] = useState<Quote[]>([]);
  useEffect(() => { setList(readLS<Quote[]>(LS.saved, [])); }, []);
  const del = (id: string) => { const next = list.filter((q) => q.id !== id); setList(next); writeLS(LS.saved, next); };
  if (!list.length) return <div className="py-16 text-center text-sm text-slate-400">ยังไม่มีใบที่บันทึก<br />กด &quot;ดูใบสรุป → บันทึกใบนี้&quot;</div>;
  return (
    <div className="space-y-2">
      {list.map((q) => (
        <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{q.customer || "(ไม่ระบุชื่อ)"}</div>
              <div className="text-xs text-slate-400">{q.createdAt} · {q.lines.length} รายการ</div>
            </div>
            <div className="text-right"><div className="text-base font-bold tabular-nums text-slate-900">฿{baht(grandOf(q))}</div></div>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => loadInto(q)} className="flex-1 rounded-lg bg-sky-50 py-2 text-xs font-medium text-sky-600 active:bg-sky-100">เปิดใช้งาน</button>
            <button onClick={() => del(q.id)} className="rounded-lg bg-rose-50 px-4 py-2 text-xs font-medium text-rose-500 active:bg-rose-100">ลบ</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────── SummaryModal (โชว์ลูกค้า / คัดลอก / บันทึก) ───────────────
function SummaryModal({ cur, setCur, close }: { cur: Quote; setCur: (q: Quote) => void; close: () => void }) {
  const [customer, setCustomer] = useState(cur.customer);
  const [note, setNote] = useState(cur.note);
  const [copied, setCopied] = useState(false);
  const grand = grandOf(cur);

  const persist = (patch: Partial<Quote>) => setCur({ ...cur, ...patch });

  const textSummary = () => {
    const lines = cur.lines.map((l, i) => `${i + 1}. ${l.label}\n   ${l.detail} = ฿${baht(l.total)}`).join("\n");
    return [
      "JR Aluminium — ราคาประเมินเบื้องต้น",
      customer ? `ลูกค้า: ${customer}` : "",
      `วันที่: ${cur.createdAt}`,
      "",
      lines,
      "",
      `รวมประเมิน: ฿${baht(grand)}`,
      note ? `\nหมายเหตุ: ${note}` : "",
      "\n*ราคาประเมินเบื้องต้น ยังไม่ใช่ใบเสนอราคา อาจเปลี่ยนแปลงหลังวัดหน้างานจริง",
    ].filter((x) => x !== "").join("\n");
  };

  const share = async () => {
    const text = textSummary();
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* ผู้ใช้ยกเลิก */ }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { alert(text); }
  };

  const saveIt = () => {
    const q: Quote = { ...cur, customer, note };
    const list = readLS<Quote[]>(LS.saved, []);
    const idx = list.findIndex((x) => x.id === q.id);
    if (idx >= 0) list[idx] = q; else list.unshift(q);
    writeLS(LS.saved, list.slice(0, 200));
    persist({ customer, note });
    alert("บันทึกใบนี้แล้ว");
  };

  const clearIt = () => {
    if (!confirm("ล้างรายการทั้งหมด เริ่มใบใหม่?")) return;
    setCur(emptyQuote());
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={close}>
      <div className="mt-auto max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div className="text-base font-bold text-slate-800">ใบประเมินราคา</div>
          <button onClick={close} className="text-sm text-slate-400">ปิด</button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-1 gap-2">
            <input value={customer} onChange={(e) => { setCustomer(e.target.value); persist({ customer: e.target.value }); }} placeholder="ชื่อลูกค้า (ไม่บังคับ)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />
          </div>

          <div className="rounded-2xl border border-slate-200">
            {cur.lines.map((l, i) => (
              <div key={l.id} className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
                <div className="mt-0.5 text-xs font-semibold text-slate-300">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug text-slate-800">{l.label}</div>
                  <div className="text-xs text-slate-400">{l.detail}</div>
                </div>
                <div className="shrink-0 text-sm font-bold tabular-nums text-slate-900">฿{baht(l.total)}</div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-slate-50 px-3 py-3">
              <div className="text-sm font-semibold text-slate-600">รวมประเมิน</div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900">฿{baht(grand)}</div>
            </div>
          </div>

          <textarea value={note} onChange={(e) => { setNote(e.target.value); persist({ note: e.target.value }); }} rows={2} placeholder="หมายเหตุ (ไม่บังคับ)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400" />

          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
            ⚠ ราคาประเมินเบื้องต้น — ยังไม่ใช่ใบเสนอราคา อาจเปลี่ยนแปลงหลังวัดหน้างานจริง
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={share} className="rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white active:bg-sky-600">{copied ? "คัดลอกแล้ว ✓" : "📋 แชร์/คัดลอก"}</button>
            <button onClick={saveIt} className="rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white active:bg-slate-900">💾 บันทึกใบนี้</button>
          </div>
          <button onClick={clearIt} className="w-full rounded-xl border border-rose-200 py-2.5 text-sm font-medium text-rose-500 active:bg-rose-50">🗑 ล้าง เริ่มใบใหม่</button>
        </div>
      </div>
    </div>
  );
}
