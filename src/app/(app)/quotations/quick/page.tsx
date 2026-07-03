"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, computeTotals } from "@/lib/money";
import { bahtText } from "@/lib/baht-text";
import { COMPANY, CONDITIONS_WORK, CONDITIONS_QUOTE } from "@/app/(app)/quotations/[id]/print/quote-constants";

/**
 * ออกใบเสนอราคาด่วน — print-only · กรอกหัวบิล/รายการเอง · ไม่แตะทะเบียน/งาน/การเงิน
 * เหมาะกับลูกค้า walk-in / เสนอราคาหน้างานเร็ว ๆ · พิมพ์เป็น A4 (หัวเอกสาร JR + เงื่อนไข)
 */
type Item = { name: string; detail: string; qty: number; price: number };
const blank = (): Item => ({ name: "", detail: "", qty: 1, price: 0 });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function QuickQuotePage() {
  const [custName, setCustName] = useState("");
  const [custAddr, setCustAddr] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState("");
  const [items, setItems] = useState<Item[]>([blank()]);
  const [vat, setVat] = useState(7);
  const [disc, setDisc] = useState(0);
  const [wht, setWht] = useState(0);
  const [condWork, setCondWork] = useState<string[]>([...CONDITIONS_WORK]);
  const [condQuote, setCondQuote] = useState<string[]>([...CONDITIONS_QUOTE]);
  const [condOpen, setCondOpen] = useState(false);

  const setItem = (i: number, k: keyof Item, v: string | number) => setItems(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= items.length) return; const a = [...items]; [a[i], a[j]] = [a[j], a[i]]; setItems(a); };

  const t = computeTotals({ items: items.map((it) => ({ qty: it.qty, unit_price: it.price })), vat_rate: vat, discount_pct: disc, wht_rate: wht });
  const total = t.wht_amt > 0 ? t.net : t.total;

  function printQuote() {
    const rows = items.filter((it) => it.name.trim() || it.price > 0).map((it, i) =>
      `<tr><td class="c">${i + 1}</td><td><b>${esc(it.name)}</b>${it.detail ? `<div class="d">${esc(it.detail)}</div>` : ""}</td>`
      + `<td class="r">${baht(it.qty)}</td><td class="r">${baht(it.price)}</td><td class="r">${baht((Number(it.qty) || 0) * (Number(it.price) || 0))}</td></tr>`).join("");
    const condRows = (list: string[]) => list.filter((c) => c.trim()).map((c) => `<li>${esc(c).replace(/\n/g, "<br>")}</li>`).join("");
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเสนอราคาด่วน${refNo ? " " + esc(refNo) : ""}</title><style>
      *{box-sizing:border-box}body{font-family:'Sarabun','Segoe UI','Leelawadee UI',Tahoma,sans-serif;color:#1f2937;margin:0;padding:16mm;font-size:13px}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b3151d;padding-bottom:10px;margin-bottom:12px}
      .co{font-weight:800;color:#b3151d;font-size:17px}.cosub{font-size:11px;color:#6b7280;line-height:1.5;margin-top:2px}
      .doc{text-align:right}.doc h1{color:#b3151d;font-size:20px;margin:0}.doc .m{font-size:12px;color:#6b7280}
      .cust{background:#fbf6f5;border:1px solid #f0dede;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;line-height:1.6}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #e5e7eb;padding:6px 8px;vertical-align:top}
      th{background:#fdecec;color:#7d0f15;text-align:left}.r{text-align:right}.c{text-align:center}.d{color:#6b7280;font-size:11px;margin-top:2px}
      .sum{display:flex;justify-content:flex-end;margin-top:8px}.sum table{width:auto}.sum td{border:0;padding:2px 8px}
      .words{color:#b3151d;margin-top:6px}.sign{display:flex;gap:20px;margin-top:26px}.sign>div{flex:1;text-align:center;font-size:12px}
      .sign .l{border-top:1px dashed #999;margin-top:34px;padding-top:4px}
      h4{color:#b3151d;margin:14px 0 4px}ol{margin:0 0 8px 18px;padding:0;font-size:11px;line-height:1.6}li{margin:2px 0}
      .cond{page-break-before:always}.foot{margin-top:18px;text-align:center;font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:4px}
      @media print{body{padding:12mm}}</style></head><body>
      <div class="top"><div><div class="co">${esc(COMPANY.nameFull)}</div><div class="cosub">${esc(COMPANY.address)}<br>เลขประจำตัวผู้เสียภาษี ${esc(COMPANY.taxId)} · โทร. ${esc(COMPANY.phone)}${COMPANY.phone2 ? ", " + esc(COMPANY.phone2) : ""}</div></div>
      <div class="doc"><h1>ใบเสนอราคา</h1><div class="m">${refNo ? "เลขที่ " + esc(refNo) + " · " : ""}วันที่ ${esc(issueDate)}</div></div></div>
      <div class="cust"><b>เรียน:</b> ${esc(custName) || "-"}${custPhone ? " · โทร. " + esc(custPhone) : ""}${custAddr ? "<br><b>ที่อยู่:</b> " + esc(custAddr) : ""}</div>
      <table><thead><tr><th class="c" style="width:5%">#</th><th style="width:55%">รายละเอียด</th><th class="r" style="width:10%">จำนวน</th><th class="r" style="width:15%">ราคา/หน่วย</th><th class="r" style="width:15%">รวม</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="words">(${esc(bahtText(total))})</div>
      <div class="sum"><table><tr><td>รวมเป็นเงิน</td><td class="r">${baht(t.subtotal)} บาท</td></tr>
      ${t.discount_amt > 0 ? `<tr><td>ส่วนลด ${disc}%</td><td class="r">-${baht(t.discount_amt)} บาท</td></tr>` : ""}
      <tr><td>VAT ${vat}%</td><td class="r">${baht(t.vat_amt)} บาท</td></tr>
      <tr><td><b>รวมทั้งสิ้น</b></td><td class="r"><b>${baht(t.total)} บาท</b></td></tr>
      ${t.wht_amt > 0 ? `<tr><td>หัก ณ ที่จ่าย ${wht}%</td><td class="r">-${baht(t.wht_amt)} บาท</td></tr><tr><td><b>ยอดรับสุทธิ</b></td><td class="r"><b>${baht(t.net)} บาท</b></td></tr>` : ""}</table></div>
      <div class="sign"><div><div>ในนาม ${esc(custName) || "ลูกค้า"}</div><div class="l">ผู้สั่งซื้อสินค้า · วันที่ ......../......../........</div></div>
      <div><div>ในนาม ${esc(COMPANY.name)}</div><div class="l">ผู้อนุมัติ · วันที่ ......../......../........</div></div></div>
      <div class="cond"><h4>เงื่อนไขการเข้าทำงาน</h4><ol>${condRows(condWork)}</ol><h4>เงื่อนไขแบบและใบเสนอราคา</h4><ol style="list-style:none;margin-left:0">${condRows(condQuote)}</ol></div>
      <div class="foot">${esc(COMPANY.name)} (${esc(COMPANY.branch)}) · เลขประจำตัวผู้เสียภาษี ${esc(COMPANY.taxId)} · โทร. ${esc(COMPANY.phone)}</div>
      <script>window.print()</script></body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand"><Icon name="file" size={18} /></span>
        ออกใบเสนอราคาด่วน
        <span className="text-xs font-normal text-ink-3">(พิมพ์อย่างเดียว · กรอกหัวบิลเอง · ไม่ผูกทะเบียน/งาน)</span>
      </h1>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">หัวบิล (ลูกค้า)</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block col-span-2"><span className="text-xs font-medium text-ink-3">ชื่อลูกค้า / ในนาม</span>
                <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="เช่น คุณสมชาย / บจก. ..." className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" /></label>
              <label className="block col-span-2"><span className="text-xs font-medium text-ink-3">ที่อยู่ (ออกบิล)</span>
                <input value={custAddr} onChange={(e) => setCustAddr(e.target.value)} placeholder="เลขที่ / ถนน / ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์" className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" /></label>
              <label className="block"><span className="text-xs font-medium text-ink-3">เบอร์โทร</span>
                <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="08x-xxx-xxxx" className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" /></label>
              <label className="block"><span className="text-xs font-medium text-ink-3">เลขที่/อ้างอิง (ถ้ามี)</span>
                <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="เว้นว่างได้" className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" /></label>
              <label className="block col-span-2"><span className="text-xs font-medium text-ink-3">วันที่</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" /></label>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">รายการ</h3>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="glass-soft rounded-xl p-3.5">
                  <div className="flex gap-2">
                    <input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="ชื่อรายการ" className="flex-1 glass rounded-md px-3 py-2 text-sm font-medium outline-none" />
                    {items.length > 1 && (<>
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="press w-8 rounded-md text-ink-2 glass hover:bg-white/70 disabled:opacity-30">▲</button>
                      <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="press w-8 rounded-md text-ink-2 glass hover:bg-white/70 disabled:opacity-30">▼</button>
                      <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="press w-9 rounded-md inline-flex items-center justify-center text-red-700 bg-red-50 hover:bg-red-100"><Icon name="trash" size={15} /></button>
                    </>)}
                  </div>
                  <input value={it.detail} onChange={(e) => setItem(i, "detail", e.target.value)} placeholder="รายละเอียด เช่น 1.8×2.2ม. สีอบขาว กระจกเขียว 6มม." className="w-full glass rounded-md px-3 py-1.5 text-xs mt-2 outline-none" />
                  <div className="flex items-center gap-3 text-sm flex-wrap mt-2.5">
                    <label className="text-xs text-ink-3">จำนวน<input type="number" min={0} value={it.qty} onChange={(e) => setItem(i, "qty", Number(e.target.value))} className="w-16 ml-1.5 glass rounded-md px-2 py-1 text-right outline-none" /></label>
                    <label className="text-xs text-ink-3">ราคา/หน่วย<input type="number" min={0} value={it.price} onChange={(e) => setItem(i, "price", Number(e.target.value))} className="w-28 ml-1.5 glass rounded-md px-2 py-1 text-right outline-none" /></label>
                    <span className="ml-auto font-bold text-brand-dark">฿{baht((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setItems([...items, blank()])} className="press w-full mt-3 glass-soft rounded-xl py-2.5 text-sm inline-flex items-center justify-center gap-1.5 text-ink-2 hover:bg-white/70"><Icon name="plus" size={15} /> เพิ่มรายการ</button>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">ภาษี / ส่วนลด</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="block"><span className="text-xs font-medium text-ink-3">VAT (%)</span>
                <select value={vat} onChange={(e) => setVat(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"><option value={0}>0%</option><option value={7}>7%</option></select></label>
              <label className="block"><span className="text-xs font-medium text-ink-3">ส่วนลด (%)</span>
                <input type="number" min={0} step={0.5} value={disc} onChange={(e) => setDisc(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 text-right outline-none" /></label>
              <label className="block"><span className="text-xs font-medium text-ink-3">หัก ณ ที่จ่าย (%)</span>
                <select value={wht} onChange={(e) => setWht(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"><option value={0}>ไม่หัก</option><option value={3}>3%</option><option value={5}>5%</option></select></label>
            </div>
          </Card>

          <Card className="p-5">
            <button onClick={() => setCondOpen((v) => !v)} className="press w-full flex items-center justify-between">
              <h3 className="font-bold text-brand-dark">เงื่อนไขท้ายใบ</h3><span className="text-ink-3 text-sm">{condOpen ? "▲" : "▼ แก้ไข"}</span>
            </button>
            {condOpen && (
              <div className="mt-3 space-y-4">
                {([["เงื่อนไขการเข้าทำงาน", condWork, setCondWork], ["เงื่อนไขแบบและใบเสนอราคา", condQuote, setCondQuote]] as const).map(([title, list, setList]) => (
                  <div key={title}>
                    <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-semibold text-brand-dark">{title}</span>
                      <button onClick={() => setList([...list, ""])} className="press text-xs text-brand font-semibold">+ เพิ่มข้อ</button></div>
                    <div className="space-y-1.5">
                      {list.map((c, ci) => (
                        <div key={ci} className="flex gap-1.5">
                          <textarea value={c} rows={c.length > 80 ? 3 : 1} onChange={(e) => setList(list.map((x, xi) => xi === ci ? e.target.value : x))} className="flex-1 glass rounded-md px-2.5 py-1.5 text-xs outline-none resize-y" />
                          <button onClick={() => setList(list.filter((_, xi) => xi !== ci))} className="press w-8 rounded-md inline-flex items-center justify-center text-red-700 bg-red-50 hover:bg-red-100 shrink-0"><Icon name="trash" size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card className="p-5 sticky top-4">
            <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
            <Row k="ยอดรวมก่อนภาษี" v={t.subtotal} />
            {t.discount_amt > 0 && <Row k={`ส่วนลด ${disc}%`} v={-t.discount_amt} red />}
            <Row k={`VAT ${vat}%`} v={t.vat_amt} />
            <div className="border-t border-gray-300/70 my-2" />
            <Row k="รวมทั้งสิ้น" v={t.total} bold />
            {t.wht_amt > 0 && <><Row k={`หัก ณ ที่จ่าย ${wht}%`} v={-t.wht_amt} red /><Row k="ยอดรับสุทธิ" v={t.net} bold big /></>}
            <button onClick={printQuote} className="press w-full mt-4 rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand inline-flex items-center justify-center gap-1.5">
              <Icon name="printer" size={15} /> พิมพ์ใบเสนอราคา (A4)
            </button>
            <p className="text-[11px] text-ink-3 mt-2">* พิมพ์อย่างเดียว ไม่บันทึกเข้าระบบ · ต้องการเก็บประวัติ/ผูกงาน ใช้เมนู "ใบเสนอราคา" ปกติ</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold, big, red }: { k: string; v: number; bold?: boolean; big?: boolean; red?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "text-lg" : "text-sm"} ${bold ? "font-bold" : ""} py-0.5`}>
      <span className={bold ? "text-ink" : "text-ink-3"}>{k}</span>
      <span style={red ? { color: "#b3151d" } : bold ? { color: "#7d0f15" } : {}}>{v < 0 ? "-" : ""}฿{baht(Math.abs(v))}</span>
    </div>
  );
}
