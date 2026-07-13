"use client";

/**
 * ใบตัด / BOQ (นำร่อง) — เอนจินใบตัดอลู JR
 * input ช่อง (W/H/N/ราง/โหนก) → ตารางตัด (เส้นไหน ยาวเท่าไร กี่เส้น) + สรุปเส้นต่อรหัส
 * "สรุปเส้นต่อรหัส" คือรากของ 2 ระบบถัดไป: BOQ ทั้งงานลูกค้า + ตัดสต็อก (หัก sku=รหัส)
 * นำร่อง: SMS บานเลื่อนอิสระ (พอร์ตสูตรตรงจาก Excel ตัดประกอบ)
 */
import { useEffect, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { computeCutList } from "@/lib/cutlist/engine";
import { CUT_SPECS, CUT_SPEC_BY_ID } from "@/lib/cutlist/products";

export default function CutListClient({ imagesByCode = {} }: { imagesByCode?: Record<string, string> }) {
  const imgOf = (code: string) => imagesByCode[String(code ?? "").trim().toUpperCase()] || "";
  const [specId, setSpecId] = useState(CUT_SPECS[0].id);
  const spec = CUT_SPEC_BY_ID[specId];
  const [W, setW] = useState(String(spec.defaults.W));
  const [H, setH] = useState(String(spec.defaults.H));
  const [N, setN] = useState(String(spec.defaults.N));
  const [rail, setRail] = useState(spec.defaults.rail);
  const [honk, setHonk] = useState(spec.defaults.honk);
  const [sets, setSets] = useState("1");

  // เปลี่ยนรุ่น → รีเซ็ตค่าเริ่มต้นของรุ่นนั้น
  useEffect(() => {
    setW(String(spec.defaults.W)); setH(String(spec.defaults.H)); setN(String(spec.defaults.N));
    setRail(spec.defaults.rail); setHonk(spec.defaults.honk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  const nSets = Math.max(1, Number(sets) || 1);
  const result = useMemo(
    () => computeCutList(spec, { W: Number(W) || 0, H: Number(H) || 0, N: Math.max(1, Number(N) || 1), rail, honk }, nSets),
    [spec, W, H, N, rail, honk, nSets]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="box" size={18} /></span>
          ใบตัด / BOQ <Badge tone="amber">นำร่อง</Badge>
        </h1>
      </div>
      <p className="text-sm text-ink-3 -mt-3">
        กรอกขนาดช่อง → ได้ใบตัดอลู (เส้นไหน ยาวเท่าไร กี่เส้น) + สรุปเส้นต่อรหัส · หน่วย ซม. ·
        รหัส B#### ผูกกับสต็อก → ต่อไปใช้ทำ <b>BOQ ทั้งงานลูกค้า</b> + <b>ตัดสต็อกอัตโนมัติ</b>
      </p>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* อินพุต */}
        <Card className="p-5 lg:col-span-1 space-y-3 h-fit">
          <label className="block"><span className="text-xs font-medium text-ink-3">รุ่น</span>
            <select value={specId} onChange={(e) => setSpecId(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
              {CUT_SPECS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Field label="กว้างช่อง (ซม.)" value={W} onChange={setW} />
            <Field label="สูงช่อง (ซม.)" value={H} onChange={setH} />
            <Field label="จำนวนบาน N" value={N} onChange={setN} />
          </div>
          <label className="block"><span className="text-xs font-medium text-ink-3">ราง</span>
            <select value={rail} onChange={(e) => setRail(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
              {spec.rails.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-1">
              <input type="checkbox" checked={honk} onChange={(e) => setHonk(e.target.checked)} /> มีโหนก
            </label>
            <Field label="จำนวนชุด" value={sets} onChange={setSets} narrow />
          </div>
          <div className="rounded-xl bg-brand/5 border border-brand/15 px-3 py-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-ink-2">รวมเส้นสต็อกที่ใช้</span>
              <span className="font-bold text-brand-dark tabular-nums">{result.barsByCode.reduce((s, b) => s + b.bars, 0)} เส้น</span></div>
            <div className="text-[11px] text-ink-3 mt-0.5">เส้นสต็อก {spec.stockLen / 100} ม. · {result.barsByCode.length} รหัส</div>
          </div>
        </Card>

        {/* ตารางตัด */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5 font-bold text-brand-dark">✂️ ใบตัดอลู ({nSets > 1 ? `${nSets} ชุด` : "1 ชุด"})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                    <th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">โปรไฟล์</th>
                    <th className="px-3 py-2 font-medium">รหัส</th>
                    <th className="px-3 py-2 font-medium text-right">ยาวตัด (ซม.)</th>
                    <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                    <th className="px-3 py-2 font-medium text-right">เส้น {spec.stockLen / 100}ม.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} className={`border-b border-black/5 last:border-0 ${r.qty === 0 ? "opacity-40" : ""}`}>
                      <td className="px-3 py-2 text-ink-3 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProfileThumb url={imgOf(r.code)} code={r.code} />
                          <span className="font-mono text-xs">{r.code}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.qty > 0 ? r.len.toLocaleString("th-TH") : "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.qty || "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.bars || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* สรุปเส้นต่อรหัส — รากของ BOQ + ตัดสต็อก */}
          <Card className="p-0 overflow-hidden border-2 border-emerald-200">
            <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 font-bold text-emerald-800 flex items-center justify-between">
              <span>📦 สรุปเส้นต่อรหัส (เข้า BOQ + ตัดสต็อก)</span>
              <span className="text-xs font-normal text-emerald-700">รวมยาวต่อรหัสแล้วปัดเป็นเส้น</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                    <th className="px-3 py-2 font-medium">รหัสอลู (sku)</th>
                    <th className="px-3 py-2 font-medium text-right">รวมยาว (ซม.)</th>
                    <th className="px-3 py-2 font-medium text-right">เส้นสต็อก</th>
                  </tr>
                </thead>
                <tbody>
                  {result.barsByCode.map((b) => (
                    <tr key={b.code} className="border-b border-black/5 last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProfileThumb url={imgOf(b.code)} code={b.code} />
                          <span className="font-mono font-semibold">{b.code}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-2">{b.totalLenCm.toLocaleString("th-TH")}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{b.bars}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-[11px] text-ink-3 border-t border-black/5">
              * นี่คือยอดที่จะ (1) รวมเป็น BOQ ของทั้งงานลูกค้า · (2) หักออกจากสต็อกอลูตามรหัส (sku) ที่เราผูกไว้แล้วในหน้าสต๊อก
            </p>
          </Card>

          <p className="text-[11px] text-ink-3">
            นำร่องรุ่นเดียวก่อน (SMS เลื่อนอิสระ) — เทียบสูตรตรงกับ Excel ตัดประกอบ · เฟสถัดไป: เพิ่มรุ่นอื่น →
            ดึงงานลูกค้ามาสร้าง BOQ ทั้งงาน → ปุ่มตัดสต็อกจริง (หัก inventory + log)
          </p>
        </div>
      </div>
    </div>
  );
}

// รูปหน้าตัดโปรไฟล์ (ดึงจากสต็อก image_url ต่อ sku=รหัส) — คลิกเปิดรูปเต็ม · ไม่มีรูป = กล่องจาง
function ProfileThumb({ url, code }: { url: string; code: string }) {
  if (!url) return <span className="inline-flex items-center justify-center w-9 h-7 rounded border border-dashed border-gray-300 text-[9px] text-ink-3 shrink-0">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`รูปโปรไฟล์ ${code}`} className="shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={code} className="w-9 h-7 object-cover rounded border border-black/10 hover:ring-2 hover:ring-brand/40" loading="lazy" />
    </a>
  );
}

function Field({ label, value, onChange, narrow }: { label: string; value: string; onChange: (v: string) => void; narrow?: boolean }) {
  return (
    <label className={`block ${narrow ? "w-24" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none tabular-nums" />
    </label>
  );
}
