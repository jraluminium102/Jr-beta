"use client";
import { useMemo, useState } from "react";

// เรตอลูต่อโล — จัดกลุ่ม แบรนด์ × สี · แก้เรต ฿/กก. แล้วอัปเดตราคาทุกเส้นในกลุ่ม (unit_cost = น้ำหนัก × เรต)
type Row = { id: number; sku: string; name: string; color?: string | null; supplier: string; weight_per_unit: number; unit_cost: number; price_per_kg: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

// 9 ต.ค.69 เจ้าของสั่ง: หน้านี้มีแค่ 3 หมวด = แบรนด์ (SMS / Euro Fuji / ตลาด) × สี
//   ไม่แยกตามโปรไฟล์อีกแล้ว (เดิมแยก B20/B22/B24/F78… ทำให้เรตเดียวกันกระจายเป็นสิบกลุ่ม)
const BRAND_LABEL: Record<string, string> = {
  fuji: "Euro Fuji",
  sms: "SMS",
  market: "ตลาด",
  "": "ซื้อเป็นเส้น — ไม่คิดต่อโล",
};
const BRAND_ORDER = ["fuji", "sms", "market", ""];
// ลำดับสีมาตรฐาน — เรียงเหมือนกันทุกแบรนด์ (ไล่จากสีพื้น → ซาฮาร่า → แอทแทค → ลายไม้ → มิว)
const COLOR_ORDER = [
  "อบขาว", "ขาว", "ขาว NA", "ดำ", "เทาซาฮาร่า", "ดำซาฮาร่า", "Aztec gray", "Aztecgray",
  "ลายไม้สักทอง", "มะฮอกกานี", "ไวท์โอ็ค", "ไวท์โอ๊ค", "สีชา", "มิว",
];
const colorRank = (c: string) => { const i = COLOR_ORDER.indexOf(c); return i < 0 ? 900 : i; };
// รหัสที่ pricebook ระบุแบรนด์ไว้ (คิดราคา 4.0 ใช้ตารางนี้) — ตั้งจาก props ตอน render
let BRAND_OF: Record<string, string> = {};
/** ชื่อแถวสโตร์ → "รหัสกลาง" ที่สูตรใช้ (ตัดรหัสหน้า/สีท้าย) เช่น "เส้นกลาง-ดำ" → "เส้นกลาง" */
function codeOfRow(sku: string, name: string): string[] {
  const out = [sku];
  const p = String(name ?? "").split("-").map((x) => x.trim()).filter(Boolean);
  if (p.length > 1 && /^(JR\d{5}|B\d{5}|F\d{4}[A-Z]?)$/i.test(p[0])) p.shift();
  if (p.length > 1) p.pop();                       // ท้ายสุด = สี
  out.push(p.join("-"));
  const head = String(name ?? "").trim().match(/^([A-Za-z]{0,3}\d{3,5}[A-Za-z]?)\b/);
  if (head) out.push(head[1]);
  return out.filter(Boolean);
}
function seriesOf(sku: string, name = ""): string {
  for (const c of codeOfRow(sku, name)) { const b = BRAND_OF[c]; if (b && b !== "fixed") return BRAND_LABEL[b] ?? BRAND_LABEL[""]; }
  return BRAND_LABEL[brandOfSku(sku, name)] ?? BRAND_LABEL[""];
}
// สีจากท้ายชื่อ "รหัส-ชื่อ-สี" · ชื่อแบบเก่า "เฟรมบน (B22001)" = ไม่ระบุสี
// 9 ต.ค.69: stock_items.color เติมครบแล้ว → ใช้ช่องสีเป็นหลัก เดาจากท้ายชื่อเฉพาะตอนช่องว่าง
//   (เดิมเดาอย่างเดียว เลยได้ "สี" เป็น ตัวตบรางมุ้ง / ฝาปิดเฟรมข้าง / เฟรมบนบานเลื่อน)
function colorRow(r: Row): string {
  const c = String(r.color ?? "").replace(/[()]/g, "").trim();
  return c || colorOf(r.name);
}
// เรตแบรนด์: B2x = SMS · F7x = ยูโรฟูจิ · กล่อง/ฉาก/Z = ตลาด · ที่เหลือซื้อเป็นเส้น (ไม่คิดต่อโล)
// กล่อง/ฉาก ไซส์ที่เป็นฟูจิ (ลิสต์เจ้าของ) — ไซส์นอกลิสต์ หรือกล่องที่มีชื่อเรียก = ตลาด
const FUJI_BOX = ["1X1", "1X1.6", "1X2", "1X4", "1.6X1.6", "1.6X3", "1.6X4", "2X2", "2X4", "4X4"];
const FUJI_ANG = ["3หุน", "4หุน", "6หุน", "1", "2", "3", "4"];
const sizeKey = (t: string) => t.toUpperCase().replace(/["”]/g, "").replace(/\s+/g, "").replace(/นิ้ว/g, "").replace(/×/g, "X");
function brandOfSku(sku: string, name: string): string {
  const s = (sku || "").toUpperCase(), n = (name || "").trim();
  if (/^(WM-|OPK|XSW|E-)/i.test(s) || /^(WM-|OPK|XSW|E-|VELORA)/i.test(n)) return "";
  // ⚠ สโตร์หลายแถวใส่ sku เป็น JR0xxxx แต่รหัสจริงอยู่หน้าชื่อ ("B24013-คิ้วตบกระจก 14-22 มม.-ดำ")
  //   เดิมดูแต่ sku → B24013 / B24016 / F7860 / F7948 / F7971 ตกไปกอง "ซื้อเป็นเส้น" 40 แถว
  //   ทั้งที่ซื้อเป็นกิโลตามแบรนด์ (เจ้าของทัก 10 ต.ค.69 "มีรหัส B รหัส F อยู่เลย ทั้งที่ซื้อเป็นกิโล")
  const head = (n.match(/^([A-Za-z]{1,3}\d{3,5}[A-Za-z]?)\b/)?.[1] ?? "").toUpperCase();
  if (/^B\d/.test(s) || /^B\d/.test(head)) return "sms";
  if (/^F\d/.test(s) || /^F\d/.test(head)) return "fuji";
  if (/^(Z |ตัวZ|แซด)/i.test(n)) return "market";
  const bx = n.match(/^กล่อง\s*([\d."x×\/ ]+?)\s*(?:-|\(|$)/i);
  if (bx) return FUJI_BOX.includes(sizeKey(bx[1])) ? "fuji" : "market";
  const ag = n.match(/^ฉาก\s*([\d."x×\/ ]+?|\d+\s*หุน)\s*(?:-|\(|$)/i);
  if (ag) return FUJI_ANG.includes(sizeKey(ag[1])) ? "fuji" : "market";
  if (/^(กล่อง|ฉาก)/.test(n)) return "market";   // กล่อง/ฉากที่มีชื่อเรียก (กล่องเรียบ/แจ๊คสัน/ร่อง) = ตลาด
  return "";
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

export default function AluRatesClient({ items, noWeightCount, canEdit, rateLog = [], brandRates = {}, brandOfCode = {} }: { items: Row[]; noWeightCount: number; canEdit: boolean; rateLog?: RateLog[]; brandRates?: Record<string, Record<string, number>>; brandOfCode?: Record<string, string> }) {
  BRAND_OF = brandOfCode;   // ตารางแบรนด์ของคิดราคา 4.0 — ใช้ก่อนการเดาจากรหัส/ชื่อ
  const [rows, setRows] = useState<Row[]>(items);
  const [log, setLog] = useState<RateLog[]>(rateLog);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null);
  const [openSeries, setOpenSeries] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const series = seriesOf(r.sku, r.name), color = colorRow(r);
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
  }, [rows, brandRates, brandOfCode]);

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
