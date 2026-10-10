"use client";
import { useMemo, useState } from "react";
import { ALU_BRAND_LABEL, ALU_BRAND_ORDER, aluBrandLabel } from "@/lib/calculator40/alu-brand";

// เรตอลูต่อโล — จัดกลุ่ม แบรนด์ × สี · แก้เรต ฿/กก. แล้วอัปเดตราคาทุกเส้นในกลุ่ม (unit_cost = น้ำหนัก × เรต)
type Row = { id: number; sku: string; name: string; color?: string | null; supplier: string; weight_per_unit: number; unit_cost: number; price_per_kg: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

// 9 ต.ค.69 เจ้าของสั่ง: หน้านี้มีแค่ 3 หมวด = แบรนด์ (SMS / Euro Fuji / ตลาด) × สี
//   ไม่แยกตามโปรไฟล์อีกแล้ว (เดิมแยก B20/B22/B24/F78… ทำให้เรตเดียวกันกระจายเป็นสิบกลุ่ม)
// แบรนด์ของแถวอลู — ใช้ตัวกลางที่อ่าน PB.ALU_BRAND_OF (แหล่งเดียวกับคิดราคา 4.0)
//   ⚠ ห้ามเขียนตัวเดาแบรนด์ซ้ำในไฟล์นี้ — 10 ต.ค.69 เคยมี 2 ตัวแล้วไม่ตรงกัน
//     เส้นกลาง/ลูกฟูก/รหัส B,F ที่ซ่อนหน้าชื่อ ตกกอง "ซื้อเป็นเส้น" ไม่มีเรตให้กด
const BRAND_LABEL = ALU_BRAND_LABEL;
const BRAND_ORDER = ALU_BRAND_ORDER;

// ลำดับสีมาตรฐาน — เรียงเหมือนกันทุกแบรนด์ (ไล่จากสีพื้น → ซาฮาร่า → แอทแทค → ลายไม้ → มิว)
const COLOR_ORDER = [
  "อบขาว", "ขาว", "ขาว NA", "ดำ", "เทาซาฮาร่า", "ดำซาฮาร่า", "Aztec gray", "Aztecgray",
  "ลายไม้สักทอง", "มะฮอกกานี", "ไวท์โอ็ค", "ไวท์โอ๊ค", "สีชา", "มิว",
];
const colorRank = (c: string) => { const i = COLOR_ORDER.indexOf(c); return i < 0 ? 900 : i; };
const seriesOf = (sku: string, name = "", color = "") => aluBrandLabel(sku, name, color);
// สีจากท้ายชื่อ "รหัส-ชื่อ-สี" · ชื่อแบบเก่า "เฟรมบน (B22001)" = ไม่ระบุสี
// 9 ต.ค.69: stock_items.color เติมครบแล้ว → ใช้ช่องสีเป็นหลัก เดาจากท้ายชื่อเฉพาะตอนช่องว่าง
//   (เดิมเดาอย่างเดียว เลยได้ "สี" เป็น ตัวตบรางมุ้ง / ฝาปิดเฟรมข้าง / เฟรมบนบานเลื่อน)
function colorRow(r: Row): string {
  const c = String(r.color ?? "").replace(/[()]/g, "").trim();
  return c || colorOf(r.name);
}
// ชื่อสีในสโตร์ → ชื่อสีในตารางเรต
const COLOR_KEY: Record<string, string> = {
  "อบขาว": "อบขาว", "ขาว": "อบขาว", "ดำ": "ดำ", "เทาซาฮาร่า": "เทาซาฮาร่า", "ดำซาฮาร่า": "ดำซาฮาร่า",
  "Aztec gray": "แอทแทคเกรย์", "Aztecgray": "แอทแทคเกรย์", "ลายไม้สักทอง": "ลายไม้สักทอง",
  "มะฮอกกานี": "มะฮอกกานี", "ไวท์โอ็ค": "ไวท์โอ๊ค", "ไวท์โอ๊ค": "ไวท์โอ๊ค", "มิว": "มิว",
};
function colorOf(name: string): string {
  const i = name.lastIndexOf("-");
  if (i < 0) return "ไม่ระบุสี";
  const c = name.slice(i + 1).trim();
  return c && c.length <= 20 ? c : "ไม่ระบุสี";
}

type Group = { key: string; series: string; color: string; items: Row[]; rate: number; brandRate?: number };
type RateLog = { id: number; series: string; color: string; prev_rate: number | null; rate: number; item_count: number; changed_by_name: string; created_at: string };

type ChkRow = { sku: string; name: string; color: string | null; brand: string; kg: number; rate: number; cost: number; rateWant: number; costWant?: number; why?: string };
type ChkResult = { total: number; same: number; costOff: ChkRow[]; rateOff: ChkRow[]; noRate: ChkRow[]; noWeight: ChkRow[]; note: string };

export default function AluRatesClient({ items, noWeightCount, canEdit, rateLog = [], brandRates = {} }: { items: Row[]; noWeightCount: number; canEdit: boolean; rateLog?: RateLog[]; brandRates?: Record<string, Record<string, number>> }) {
  const [rows, setRows] = useState<Row[]>(items);
  const [log, setLog] = useState<RateLog[]>(rateLog);
  // ตรวจว่า "กดอัปเดตแล้วราคาเปลี่ยนจริงทั้งระบบไหม" (เจ้าของถาม 10 ต.ค.69 "ชั้นไม่ชัวร์")
  const [chk, setChk] = useState<ChkResult | null>(null);
  const [chkBusy, setChkBusy] = useState(false);
  async function runCheck() {
    setChkBusy(true);
    try {
      const r = await fetch("/api/stock/alu-rate-check", { credentials: "include" });
      const j = await r.json().catch(() => null);
      setChk(r.ok ? (j?.data ?? null) : null);
    } finally { setChkBusy(false); }
  }
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null);
  const [openSeries, setOpenSeries] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const color = colorRow(r), series = seriesOf(r.sku, r.name, color);
      const key = series + "‖" + color;
      const g = m.get(key) || { key, series, color, items: [], rate: 0 };
      g.items.push(r);
      m.set(key, g);
    }
    for (const g of m.values()) {
      const kg = g.items.reduce((s, r) => s + Number(r.weight_per_unit), 0);
      const cost = g.items.reduce((s, r) => s + Number(r.unit_cost), 0);
      g.rate = kg > 0 ? round2(cost / kg) : 0;   // เรตเฉลี่ยถ่วงน้ำหนักปัจจุบัน
      // เรตที่ "ควรเป็น" ตามตาราง 3 แบรนด์ (ถ้าทุกเส้นในกลุ่มเป็นแบรนด์เดียวกันและแบรนด์นั้นมีสีนี้ขาย)
      const b = BRAND_ORDER.find((x) => BRAND_LABEL[x] === g.series) ?? "";
      const ck = COLOR_KEY[g.color];
      g.brandRate = b && ck ? (brandRates[b] ?? {})[ck] : undefined;
    }
    const rank = (lbl: string) => BRAND_ORDER.findIndex((b) => BRAND_LABEL[b] === lbl);
    return [...m.values()].sort((a, b) =>
      rank(a.series) - rank(b.series)
      || colorRank(a.color) - colorRank(b.color)
      || a.color.localeCompare(b.color, "th"));
  }, [rows, brandRates]);

  const seriesList = useMemo(() => [...new Set(groups.map((g) => g.series))], [groups]);

  async function apply(g: Group) {
    const rate = Number(inputs[g.key]);
    if (!(rate > 0)) { setMsg({ key: g.key, text: "ใส่เรต ฿/กก. ก่อน", ok: false }); return; }
    if (!confirm(`ตั้งเรต ${g.series} · ${g.color} = ${rate} ฿/กก.\nจะอัปเดตราคา ${g.items.length} เส้น (ราคา/เส้น = น้ำหนัก × เรต) — ยืนยัน?`)) return;
    setBusy(g.key); setMsg(null);
    const res = await fetch("/api/stock/alu-rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: g.items.map((r) => r.id), rate, series: g.series, color: g.color }),
    });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { setMsg({ key: g.key, text: j?.error || "อัปเดตไม่สำเร็จ", ok: false }); return; }
    setRows((rs) => rs.map((r) => g.items.some((x) => x.id === r.id)
      ? { ...r, unit_cost: round2(Number(r.weight_per_unit) * rate), price_per_kg: rate } : r));
    setInputs((v) => ({ ...v, [g.key]: "" }));
    const warns: string[] = j?.data?.warns ?? [];
    setMsg({
      key: g.key,
      text: `อัปเดตแล้ว ${j?.data?.updated ?? g.items.length} เส้น ✓ (คิดราคา 4.0 ใช้ราคาใหม่ทันที)${warns.length ? " · ⚠ " + warns.join(" · ") : ""}`,
      ok: true,
    });
    setLog((l) => [{ id: Date.now(), series: g.series, color: g.color, prev_rate: j?.data?.prev_rate ?? (g.rate || null), rate,
      item_count: j?.data?.updated ?? g.items.length, changed_by_name: "คุณ", created_at: new Date().toISOString() }, ...l]);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark">⚖️ เรตอลูต่อโล (ราคา/กก. × น้ำหนักรายเส้น)</h1>
        <a href="/stock" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">← กลับหน้าสต๊อก</a>
      </div>

      <p className="text-[13px] text-ink-2 glass-soft rounded-xl px-4 py-3">
        ตั้งราคา <b>฿/กก.</b> ของแต่ละ <b>แบรนด์ × สี</b> แล้วกดอัปเดต — ระบบคูณ<b>น้ำหนักต่อเส้น</b>ของแต่ละรหัส
        อัปเดตราคา/เส้นให้ทั้งกลุ่ม · เส้นที่ผูกรหัสกับคิดราคา 4.0 จะใช้ราคาใหม่ทันที
        {noWeightCount > 0 && <> · ⚠ อลูอีก <b>{noWeightCount}</b> รายการยังไม่มีน้ำหนัก/เส้น (เติมในหน้าสต๊อกแล้วจะโผล่ที่นี่)</>}
      </p>

      {seriesList.map((series) => {
        const sg = groups.filter((g) => g.series === series);
        const total = sg.reduce((s, g) => s + g.items.length, 0);
        const open = openSeries[series] ?? true;
        return (
          <div key={series} className="glass-card rounded-2xl p-4">
            <button onClick={() => setOpenSeries((v) => ({ ...v, [series]: !open }))}
              className="w-full flex items-center justify-between text-left">
              <span className="text-sm font-bold text-brand-dark">{series} <span className="font-normal text-ink-3">· {total} เส้น</span></span>
              <span className="text-ink-3 text-xs">{open ? "▲ ย่อ" : "▼ ขยาย"}</span>
            </button>
            {open && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[12px] text-ink-3 border-b border-brand/10">
                      <th className="py-1.5 pr-3">สี</th>
                      <th className="py-1.5 pr-3 text-right">จำนวนเส้น</th>
                      <th className="py-1.5 pr-3 text-right">เรตตอนนี้ (฿/กก.)</th>
                      <th className="py-1.5 pr-3 text-right">ตารางแบรนด์</th>
                      <th className="py-1.5 pr-3">เรตใหม่</th>
                      <th className="py-1.5 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sg.map((g) => (
                      <RateRow key={g.key} g={g} value={inputs[g.key] ?? ""} busy={busy === g.key}
                        msg={msg?.key === g.key ? msg : null} canEdit={canEdit}
                        onChange={(v) => setInputs((s) => ({ ...s, [g.key]: v }))} onApply={() => apply(g)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!groups.length && (
        <p className="text-sm text-ink-3 glass-soft rounded-xl px-4 py-6 text-center">
          ยังไม่มีเส้นอลูที่มีทั้ง sku และน้ำหนัก/เส้น — รัน SQL seed น้ำหนัก หรือเติมน้ำหนักในหน้าสต๊อกก่อน
        </p>
      )}

      {/* ── ตรวจว่าอัปเดตแล้วราคาเปลี่ยนจริงทั้งระบบไหม ── */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-bold text-brand-dark">🔍 ตรวจราคาทั้งระบบ (คิดราคา 4.0 ↔ สโตร์)</div>
          <button onClick={runCheck} disabled={chkBusy}
            className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand shadow-brand disabled:opacity-40">
            {chkBusy ? "กำลังตรวจ…" : "ตรวจเดี๋ยวนี้"}
          </button>
        </div>
        <p className="text-[12px] text-ink-3 mt-1">
          เทียบ 3 ชั้น: เรตในตาราง 3 แบรนด์ → เรตที่ตั้งในสโตร์ → ทุน/หน่วย (= น้ำหนัก × เรต)
          · คิดราคา 4.0 คูณจากตารางเดียวกันนี้ ถ้า 3 ชั้นตรง แปลว่าทั้งระบบใช้เลขชุดเดียวกัน
        </p>
        {chk && (
          <div className="mt-2 space-y-1.5">
            <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
              <span className="rounded-full px-2 py-0.5 text-green-800 bg-green-100">ตรงกัน {chk.same} เส้น</span>
              <span className={`rounded-full px-2 py-0.5 ${chk.costOff.length ? "text-red-800 bg-red-100" : "text-ink-3 bg-black/5"}`}>ทุนไม่ตรงสูตร {chk.costOff.length}</span>
              <span className={`rounded-full px-2 py-0.5 ${chk.rateOff.length ? "text-red-800 bg-red-100" : "text-ink-3 bg-black/5"}`}>เรตไม่ตรงตาราง {chk.rateOff.length}</span>
              <span className="rounded-full px-2 py-0.5 text-ink-3 bg-black/5">ยังไม่มีเรต {chk.noRate.length}</span>
              <span className="rounded-full px-2 py-0.5 text-ink-3 bg-black/5">ยังไม่มีน้ำหนัก {chk.noWeight.length}</span>
            </div>
            <p className="text-[12px] text-ink-3">{chk.note}</p>
            {[...chk.costOff, ...chk.rateOff].slice(0, 20).map((r, i) => (
              <div key={r.sku + i} className="text-[12px] text-red-800">
                {r.name} · {r.brand} — น้ำหนัก {fmt(r.kg)} × เรต {fmt(r.rate)}
                {r.costWant != null ? ` = ${fmt(r.costWant)} แต่ทุนในสโตร์ ${fmt(r.cost)}` : ` (ตารางบอก ${fmt(r.rateWant)})`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ประวัติการเปลี่ยนเรต (0088) — วันที่ · กลุ่ม · เรตเดิม→ใหม่ · กี่เส้น · ใคร */}
      <div className="glass-card rounded-2xl p-4">
        <div className="text-sm font-bold text-brand-dark mb-2">🕘 ประวัติการเปลี่ยนเรต</div>
        {log.length === 0 ? (
          <p className="text-[13px] text-ink-3">ยังไม่มีประวัติ — จะบันทึกอัตโนมัติทุกครั้งที่กดอัปเดตเรต</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[12px] text-ink-3 border-b border-brand/10">
                  <th className="py-1.5 pr-3">วันที่</th>
                  <th className="py-1.5 pr-3">กลุ่ม</th>
                  <th className="py-1.5 pr-3">สี</th>
                  <th className="py-1.5 pr-3 text-right">เรต (฿/กก.)</th>
                  <th className="py-1.5 pr-3 text-right">เส้น</th>
                  <th className="py-1.5 pr-3">โดย</th>
                </tr>
              </thead>
              <tbody>
                {log.map((h) => {
                  const up = h.prev_rate != null && h.rate > h.prev_rate;
                  const down = h.prev_rate != null && h.rate < h.prev_rate;
                  return (
                    <tr key={h.id} className="border-b border-brand/5">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(h.created_at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-1.5 pr-3">{h.series}</td>
                      <td className="py-1.5 pr-3">{h.color}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {h.prev_rate != null && <span className="text-ink-3">{fmt(Number(h.prev_rate))} → </span>}
                        <b className={up ? "text-red-700" : down ? "text-green-700" : "text-brand-dark"}>{fmt(Number(h.rate))}</b>
                        {up && " ▲"}{down && " ▼"}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{h.item_count}</td>
                      <td className="py-1.5 pr-3">{h.changed_by_name || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RateRow({ g, value, busy, msg, canEdit, onChange, onApply }: {
  g: Group; value: string; busy: boolean; msg: { text: string; ok: boolean } | null; canEdit: boolean;
  onChange: (v: string) => void; onApply: () => void;
}) {
  const [show, setShow] = useState(false);
  const preview = Number(value) > 0 ? Number(value) : null;
  return (
    <>
      <tr className="border-b border-brand/5 align-top">
        <td className="py-2 pr-3">
          <button onClick={() => setShow((v) => !v)} className="font-semibold text-brand-dark underline decoration-dotted underline-offset-2">
            {g.color}
          </button>
          {msg && <div className={`text-[11px] mt-1 ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
        </td>
        <td className="py-2 pr-3 text-right">{g.items.length}</td>
        <td className="py-2 pr-3 text-right font-semibold">{g.rate > 0 ? fmt(g.rate) : "-"}</td>
        <td className="py-2 pr-3 text-right">
          {g.brandRate ? (
            <button type="button" onClick={() => onChange(String(g.brandRate))} disabled={!canEdit}
              title="ใส่เรตนี้ลงช่องเรตใหม่"
              className={`press rounded-lg px-2 py-1 text-xs font-bold ${Math.abs((g.rate || 0) - g.brandRate) < 0.5 ? "text-green-700 bg-green-50" : "text-brand-dark bg-brand-soft"}`}>
              {fmt(g.brandRate)}
            </button>
          ) : <span className="text-ink-3 text-xs">—</span>}
        </td>
        <td className="py-2 pr-3">
          {canEdit ? (
            <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
              placeholder={g.rate > 0 ? String(g.rate) : "฿/กก."}
              className="w-24 glass-soft rounded-lg px-2 py-1.5 text-sm outline-none" />
          ) : <span className="text-ink-3 text-xs">ดูอย่างเดียว</span>}
        </td>
        <td className="py-2 pr-3">
          {canEdit && (
            <button onClick={onApply} disabled={busy || !(Number(value) > 0)}
              className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand shadow-brand disabled:opacity-40">
              {busy ? "กำลังอัปเดต…" : `อัปเดต ${g.items.length} เส้น`}
            </button>
          )}
        </td>
      </tr>
      {show && (
        <tr className="border-b border-brand/5">
          <td colSpan={6} className="pb-2">
            <div className="rounded-xl bg-brand/5 border border-brand/10 px-3 py-2 text-[12px] text-ink-2 grid sm:grid-cols-2 gap-x-4">
              {g.items.map((r) => (
                <div key={r.id} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{r.sku} · {r.name}</span>
                  <span className="shrink-0">
                    {fmt(Number(r.weight_per_unit))} กก. → {fmt(Number(r.unit_cost))}฿
                    {preview && <b className="text-brand-dark"> ⇒ {fmt(round2(Number(r.weight_per_unit) * preview))}฿</b>}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
