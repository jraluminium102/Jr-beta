"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { baht } from "@/lib/money";
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
import { ALU_COLOR_LABEL, aluColorKeysFor } from "@/lib/calculator40/alu-colors";
import { compareCut, COMPARABLE, cutOptionsFor, type AluRow, type HwRow } from "@/lib/calculator40/compare-cut";

/* eslint-disable @typescript-eslint/no-explicit-any */
const TONE = {
  "ตรง": "emerald", "จำนวนต่าง": "red", "มีแต่คิดราคา": "amber", "มีแต่ใบตัด": "red", "ไม่มีรหัส": "gray",
  // ของสั่งตามงาน = ตั้งใจไม่ผูกสโตร์ ราคาอยู่ในสูตร → เขียว ไม่ใช่ปัญหา
  "ไม่สต็อก สั่งใหม่": "emerald",
} as const;

const n1 = (n: number) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 });
const cell = "px-2 py-1.5 tabular-nums";

export default function CompareClient({ pb, stockCount }: { pb: any; stockCount: number }) {
  const prods = useMemo(
    () => COMPARABLE.map((id) => (PRODUCTS as any)[id]).filter(Boolean),
    [],
  );
  const [prodId, setProdId] = useState<string>("sms_slide");
  const prod: any = (PRODUCTS as any)[prodId];

  const [w, setW] = useState("600");
  const [h, setH] = useState("300");
  const [p, setP] = useState("3");
  const [form, setForm] = useState<string>(prod?.defForm ?? "");
  const [color, setColor] = useState("white");
  const [material, setMaterial] = useState<string>(prod?.defMaterial ?? "");   // วัสดุมุง (หลังคา/กันสาด)
  const [spec, setSpec] = useState<Record<string, string>>(
    Object.fromEntries((prod?.specOpts ?? []).map((o: any) => [o.key, o.def ?? o.opts?.[0] ?? ""])),
  );
  // ตัวเลือกฝั่งใบตัด = ของรุ่นที่เลือกจริง ๆ (ไม่ใช่รายการมือจับ SMS ยัดไว้ทุกรุ่น)
  const [cut, setCut] = useState<Record<string, string>>({});

  function pickProduct(id: string) {
    const x: any = (PRODUCTS as any)[id];
    setProdId(id);
    setForm(x?.defForm ?? "");
    setW(String(x?.defaults?.w ?? 200));
    setH(String(x?.defaults?.h ?? 200));
    setP(String(x?.defaults?.p ?? 1));
    setMaterial(x?.defMaterial ?? "");
    setSpec(Object.fromEntries((x?.specOpts ?? []).map((o: any) => [o.key, o.def ?? o.opts?.[0] ?? ""])));
  }

  // ตัวเลือกฝั่งใบตัดของรุ่นที่เลือก — เปลี่ยนรุ่น/รูปแบบแล้วรายการเปลี่ยนตาม
  const cutOpts = useMemo(
    () => cutOptionsFor({ prodId, w: Number(w) || 0, h: Number(h) || 0, p: Number(p) || 1, form, spec, material }),
    [prodId, w, h, p, form, spec, material],
  );

  const r: any = useMemo(() => {
    try {
      return compareCut(pb, {
        prodId, w: Number(w) || 0, h: Number(h) || 0, p: Number(p) || 1,
        form, color, material, spec, cut,
      });
    } catch (e) { return { error: String((e as Error).message || e) }; }
  }, [pb, prodId, w, h, p, form, color, material, spec, cut]);

  const aluBad = (r?.alu ?? []).filter((x: AluRow) => x.status !== "ตรง").length;
  const hwBad = (r?.hardware ?? []).filter((x: HwRow) => x.status !== "ตรง").length;

  const num = (label: string, v: string, set: (s: string) => void) => (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type="number" value={v} onChange={(e) => set(e.target.value)}
        className="mt-1.5 w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none tabular-nums text-sm" />
    </label>
  );
  const sel = (label: string, v: string, set: (s: string) => void, opts: string[], labels?: Record<string, string>) => (
    <label className="block">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)}
        className="mt-1.5 w-full min-h-[44px] glass-soft rounded-lg px-3 py-2 outline-none text-sm">
        {opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold text-brand-dark">🔍 เทียบคิดราคา 4.0 ↔ ใบตัด</h1>
          <Link href="/calculator40" className="text-xs text-brand underline">← กลับคิดราคา</Link>
          <Link href="/calculator40/stock-audit" className="text-xs text-brand underline">ตรวจผูกสโตร์</Link>
          <span className="ml-auto text-xs text-ink-3">ราคาจากสโตร์ {stockCount.toLocaleString("th-TH")} รายการ</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          ใส่ขนาดแล้วดูว่า <b>คิดราคาขึ้นของครบเท่าใบตัดไหม</b> — ทั้งสองฝั่งเรียกสูตรตัวจริงของระบบ
          ไม่ได้คำนวณใหม่ในหน้านี้ แก้สูตรที่ต้นทางที่เดียวหน้านี้เปลี่ยนตามทันที
        </p>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sel("รุ่น", prodId, pickProduct, prods.map((x: any) => x.id),
            Object.fromEntries(prods.map((x: any) => [x.id, x.name])))}
          {num("กว้าง (ซม.)", w, setW)}
          {num("สูง (ซม.)", h, setH)}
          {num("จำนวนบาน", p, setP)}
          {prod?.forms?.length > 0 && sel("รูปแบบ", form, setForm, prod.forms)}
          {prod?.materials?.length > 0 && sel(prod.materialLabel ?? "วัสดุ", material, setMaterial, prod.materials)}
          {sel("สีอลู", color, setColor, aluColorKeysFor(prodId), ALU_COLOR_LABEL as any)}
          {(prod?.specOpts ?? []).filter((o: any) => o.type !== "number").map((o: any) => (
            <div key={o.key}>{sel(o.label, spec[o.key] ?? o.def ?? o.opts?.[0] ?? "", (v) => setSpec((s) => ({ ...s, [o.key]: v })), o.opts ?? [])}</div>
          ))}
          {cutOpts.map((f) => (
            <div key={f.key}>{sel(f.label, cut[f.key] ?? f.def, (v) => setCut((c) => ({ ...c, [f.key]: v })), f.choices)}</div>
          ))}
        </div>
      </Card>

      {r?.error && <Card className="p-5 text-red-700">คิดไม่ผ่าน: {r.error}</Card>}

      {r && !r.error && (
        <>
          {/* สรุปหัวตาราง */}
          <Card className="p-5">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge tone={aluBad + hwBad === 0 ? "emerald" : "red"}>
                {aluBad + hwBad === 0 ? "✓ ตรงกันทุกรายการ" : `ไม่ตรง ${aluBad + hwBad} รายการ`}
              </Badge>
              <Badge tone="gray">สูตรใบตัด: {r.cutSpecName || "—"}</Badge>
              <Badge tone="gray">
                เรตอลู {r.aluRate.brand} {baht(r.aluRate.rate)} ฿/กก.
                {r.aluRate.mult !== 1 && ` · ตัวคูณ ${r.aluRate.mult}`}
              </Badge>
              <Badge tone={r.hwFromCutlist ? "emerald" : "amber"}>
                {r.hwFromCutlist ? "อุปกรณ์คิดจากใบตัดแล้ว" : "อุปกรณ์ยังใช้รายการเดิมในสูตร"}
              </Badge>
            </div>
            {r.note && <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{r.note}</p>}
            {r.hwMissing?.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ ยังไม่มีราคา {r.hwMissing.length} รหัส (สโตร์และไฟล์ถอดทุนไม่มีทั้งคู่) → ค่าของยังใช้ราคาเดิมในสูตร:
                <span className="font-mono"> {r.hwMissing.map((m: any) => m.sku || m.name).join(" · ")}</span>
              </p>
            )}
            {r.hwFileFallback?.length > 0 && (
              <p className="mt-2 text-[11px] text-ink-3">
                ⓘ ใช้ราคาจากไฟล์ถอดทุน (สโตร์ยังไม่ตั้งราคา):
                <span className="font-mono"> {r.hwFileFallback.map((m: any) => m.sku).join(" · ")}</span>
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
              {([
                ["ทุนอลู", r.totals.aluCost], ["ค่าอบสี", r.totals.bakeCost], ["กระจก", r.totals.glassCost],
                ["ค่าของ (อุปกรณ์)", r.totals.hwCost], ["ทุนรวม", r.totals.costTotal],
                ["ขาย (ผลิต)", r.totals.sellMfg], ["ขาย (พร้อมติดตั้ง)", r.totals.sellInstall],
              ] as [string, number][]).map(([k, v]) => (
                <div key={k} className="glass-soft rounded-lg px-3 py-2">
                  <div className="text-[11px] text-ink-3">{k}</div>
                  <div className="font-bold tabular-nums">฿{baht(v)}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              น้ำหนักอลูที่เข้ากองคิดค่าอบ {n1(r.totals.aluKg)} กก. ·
              เส้นรวม คิดราคา <b>{n1(r.totals.calcAluBars)}</b> เส้น · ใบตัด <b>{r.totals.cutBarsByCode}</b> เส้น ·
              ค่าแรง ผลิต ฿{baht(r.totals.laborProd)} + ติดตั้ง ฿{baht(r.totals.laborInstall)}
            </p>
          </Card>

          {/* ① อลูรายเส้น */}
          <Card className="p-5">
            <h2 className="font-bold text-brand-dark mb-2">① อลูรายเส้น — ของที่ใช้ตรงกันไหม</h2>
            <p className="text-xs text-ink-3 mb-2">
              บรรทัดที่มีเลขในช่อง <b>ชิ้น</b> → เทียบ <b>ชิ้น</b> (ช่างตัดกี่ท่อน คิดราคาต้องคิดเงินเท่านั้นท่อน) ·
              ช่อง <b>เส้น</b> ไม่ต้องตรง เพราะคิดราคานับแบบไฟล์ถอดทุน (ยาวรวม ÷ 6.4 + เศษ 30%) ส่วนใบตัดนับเส้นเต็มที่หยิบมาตัด
              <br />
              บรรทัดที่ช่อง <b>ชิ้น</b> ขึ้น “—” → ไฟล์ถอดทุนเขียนมาเป็น “จำนวนเส้น” ไม่ได้บอกความยาวชิ้น คิดราคาเลยไม่รู้จำนวนท่อน
              — บรรทัดพวกนี้เทียบที่ช่อง <b>เส้น</b> แทน
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-brand-soft text-brand-dark">
                    <th className="p-2 rounded-l-lg">รหัส</th><th>ชื่อ</th>
                    <th className="text-right">คิดราคา<br /><span className="font-normal text-[11px]">ชิ้น</span></th>
                    <th className="text-right">ใบตัด<br /><span className="font-normal text-[11px]">ชิ้น</span></th>
                    <th className="text-right">คิดราคา<br /><span className="font-normal text-[11px]">เส้น</span></th>
                    <th className="text-right">ใบตัด<br /><span className="font-normal text-[11px]">เส้น</span></th>
                    <th className="text-right">฿/เส้น</th><th className="text-right">กก./เส้น</th>
                    <th className="text-right">฿/กก.</th><th className="text-right">รวม ฿</th>
                    <th className="text-right">ใบตัด ยาวรวม (ซม.)</th>
                    <th className="p-2 rounded-r-lg">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {r.alu.map((a: AluRow, i: number) => (
                    <tr key={(a.code || a.name) + i} className="border-t border-line/60">
                      <td className="p-2 font-mono text-xs">{a.code || "—"}</td>
                      <td className="text-xs">{a.name}</td>
                      <td className={cell + " text-right font-semibold"}>{a.calcPieces || "—"}</td>
                      <td className={cell + " text-right font-semibold"}>{a.cutPieces || "—"}</td>
                      <td className={cell + " text-right text-ink-3"}>{a.calcBars ? n1(a.calcBars) : "—"}</td>
                      <td className={cell + " text-right text-ink-3"}>{a.cutBars || "—"}</td>
                      <td className={cell + " text-right"}>{a.calcPricePerBar ? baht(a.calcPricePerBar) : "—"}</td>
                      <td className={cell + " text-right"}>{a.kgPerBar ? n1(a.kgPerBar) : "—"}</td>
                      <td className={cell + " text-right"}>{a.bahtPerKg ? baht(a.bahtPerKg) : "—"}</td>
                      <td className={cell + " text-right"}>{a.calcAmount ? baht(a.calcAmount) : "—"}</td>
                      <td className={cell + " text-right text-ink-3"}>{a.cutTotalLenCm ? n1(a.cutTotalLenCm) : "—"}</td>
                      <td className="p-2"><Badge tone={TONE[a.status]}>{a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ② อุปกรณ์ */}
          <Card className="p-5">
            <h2 className="font-bold text-brand-dark mb-2">② อุปกรณ์/สิ้นเปลือง — ของที่คิดเงิน = ของที่ช่างเบิกไหม</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-brand-soft text-brand-dark">
                    <th className="p-2 rounded-l-lg">รหัสสโตร์</th><th>ชื่อ</th>
                    <th className="text-right">คิดราคา</th><th className="text-right">ใบตัด</th>
                    <th>หน่วย</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">รวม ฿</th>
                    <th className="p-2 rounded-r-lg">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {r.hardware.map((x: HwRow, i: number) => (
                    <tr key={(x.sku || x.name) + i} className="border-t border-line/60">
                      <td className="p-2 font-mono text-xs">{x.sku || "—"}</td>
                      <td className="text-xs">{x.name}</td>
                      <td className={cell + " text-right font-semibold"}>{x.calcQty || "—"}</td>
                      <td className={cell + " text-right font-semibold"}>{x.cutQty || "—"}</td>
                      <td className="px-2 text-xs">{x.calcUnit || x.cutUnit}</td>
                      <td className={cell + " text-right"}>{x.calcPrice ? baht(x.calcPrice) : "—"}</td>
                      <td className={cell + " text-right"}>{x.calcAmount ? baht(x.calcAmount) : "—"}</td>
                      <td className="p-2"><Badge tone={TONE[x.status]}>{x.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ③ ใบตัดรายบรรทัด (ความยาวจริงที่ช่างตัด) */}
          {r.cutRows?.length > 0 && (
            <Card className="p-5">
              <h2 className="font-bold text-brand-dark mb-2">③ ใบตัดรายบรรทัด (ความยาวที่ช่างตัดจริง)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left bg-brand-soft text-brand-dark">
                      <th className="p-2 rounded-l-lg">รายการ</th><th>รหัส</th>
                      <th className="text-right">ยาว (ซม.)</th><th className="text-right">ชิ้น</th>
                      <th className="text-right">เส้น</th><th className="p-2 rounded-r-lg">เส้นสต็อก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.cutRows.filter((c: any) => c.qty > 0).map((c: any, i: number) => (
                      <tr key={c.name + i} className="border-t border-line/60">
                        <td className="p-2 text-xs">{c.name}</td>
                        <td className="font-mono text-xs">{c.code || "—"}</td>
                        <td className={cell + " text-right"}>{n1(c.len)}</td>
                        <td className={cell + " text-right"}>{c.qty}</td>
                        <td className={cell + " text-right"}>{c.bars}</td>
                        <td className={cell}>{c.stockLen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
