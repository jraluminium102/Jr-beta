"use client";

import { useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { STATUS_LABEL, type AuditRow, type AuditStatus, type BumpRow } from "@/lib/calculator40/stock-audit";

const TONE: Record<AuditStatus, "emerald" | "amber" | "red" | "gray"> = {
  linked: "emerald", price_diff: "amber", multi: "amber", zero: "amber", missing: "red", no_key: "red",
};
// เรียงตามความเร่งด่วนที่ต้องแก้ (ผูกไม่ได้เลย = หนักสุด)
const ORDER: AuditStatus[] = ["no_key", "missing", "price_diff", "multi", "zero", "linked"];

export default function AuditClient({ rows, bump, stockCount }: { rows: AuditRow[]; bump: BumpRow[]; stockCount: number }) {
  const [sec, setSec] = useState("ทั้งหมด");
  const [st, setSt] = useState<"ทั้งหมด" | AuditStatus>("ทั้งหมด");
  const [q, setQ] = useState("");

  const sections = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(rows.map((r) => r.section)))], [rows]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows
      .filter((r) => (sec === "ทั้งหมด" || r.section === sec) && (st === "ทั้งหมด" || r.status === st))
      .filter((r) => !kw || `${r.item} ${r.key} ${r.usedBy} ${r.stockSku}`.toLowerCase().includes(kw))
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.section.localeCompare(b.section, "th") || a.item.localeCompare(b.item, "th"));
  }, [rows, sec, st, q]);

  // CSV สร้างฝั่งเบราว์เซอร์ (RSC ส่งไฟล์ตรง ๆ มีปัญหาเรื่องดาวน์โหลด — ทำที่ client ปลอดภัยกว่า)
  function downloadCsv() {
    const head = ["หมวด", "ใช้ในรุ่น", "รายการในสูตร", "คีย์ที่ใช้ผูก", "ชนิดคีย์", "ราคาในสูตร", "ราคาในสโตร์", "รหัสในสโตร์", "เจอกี่แถว", "สถานะ", "หมายเหตุ"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = shown.map((r) => [r.section, r.usedBy, r.item, r.key, r.keyKind,
      r.formulaPrice ?? "", r.stockPrice ?? "", r.stockSku, r.matches, STATUS_LABEL[r.status], r.note].map(esc).join(","));
    const csv = "﻿" + [head.map(esc).join(","), ...body].join("\r\n");   // BOM = Excel อ่านไทยออก
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ตรวจผูกสโตร์-คิดราคา4.0-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const stuck = bump.filter((b) => !b.moved);
  const chip = (on: boolean) =>
    "press rounded-xl px-3 py-1.5 text-xs font-semibold transition " + (on ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="link" size={18} />
          </span>
          ตรวจการผูกสโตร์ ↔ คิดราคา 4.0
          <span className="text-xs font-normal text-ink-3">สโตร์ {stockCount.toLocaleString("th-TH")} รายการ</span>
        </h1>
        <button onClick={downloadCsv} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark glass-soft">
          <Icon name="download" size={16} /> โหลด CSV ({shown.length})
        </button>
      </div>

      {/* ทดสอบเด้ง — ตอบคำถาม "ขึ้นราคากิโลแล้วราคาเด้งไหม" */}
      <Card className="p-5">
        <h2 className="font-bold text-brand-dark mb-1">ทดสอบ: ขึ้นเรตอลูทุกแบรนด์ +10% แล้วราคาขายเด้งไหม</h2>
        <p className="text-xs text-ink-3 mb-3">
          รุ่นที่ <b>ไม่ขยับเลย</b> = ราคาไม่ได้ผูกกับเรตอลูต่อกิโล (ราคาฝังในสูตร หรือใช้ตารางราคา R3.9) —
          ขึ้นราคากิโลในสโตร์แล้วใบเสนอจะไม่เปลี่ยน
        </p>
        <div className="flex gap-2 flex-wrap text-sm">
          <span className="rounded-xl px-3 py-1.5 bg-emerald-50 text-emerald-800 font-semibold">เด้งตาม {bump.length - stuck.length} รุ่น</span>
          <span className="rounded-xl px-3 py-1.5 bg-red-50 text-red-800 font-semibold">ไม่ขยับ {stuck.length} รุ่น</span>
        </div>
        {stuck.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stuck.map((b) => (
              <span key={b.id} className="text-xs rounded-lg px-2 py-1 bg-red-50 border border-red-200 text-red-800">{b.name}</span>
            ))}
          </div>
        )}
        <details className="mt-3">
          <summary className="text-xs font-semibold text-brand-dark cursor-pointer">ดูรุ่นที่เด้งตาม + % ที่ขยับ</summary>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-ink-3"><th className="py-1">รุ่น</th><th className="text-right">ก่อน</th><th className="text-right">หลัง +10%</th><th className="text-right">ขยับ</th></tr></thead>
            <tbody>
              {bump.filter((b) => b.moved).map((b) => (
                <tr key={b.id} className="border-t border-black/5">
                  <td className="py-1">{b.name}</td>
                  <td className="text-right tabular-nums">฿{baht(b.before)}</td>
                  <td className="text-right tabular-nums">฿{baht(b.after)}</td>
                  <td className="text-right tabular-nums text-emerald-700">+{b.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      {/* สรุปสถานะ */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {ORDER.map((s) => (
          <button key={s} onClick={() => setSt(st === s ? "ทั้งหมด" : s)}
            className={"press rounded-2xl px-4 py-3 text-left transition " + (st === s ? "bg-brand text-white shadow-brand" : "glass-soft")}>
            <div className={"text-[11px] " + (st === s ? "text-red-100" : "text-ink-3")}>{STATUS_LABEL[s]}</div>
            <div className={"text-xl font-bold " + (st === s ? "" : "text-brand-dark")}>{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex gap-2 flex-wrap items-center mb-3">
          {sections.map((s) => (
            <button key={s} onClick={() => setSec(s)} className={chip(sec === s)}>{s}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ/รุ่น"
            className="ml-auto glass-soft rounded-lg px-3 py-2 text-sm outline-none min-w-[200px]" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">หมวด</th><th>ใช้ในรุ่น</th><th>รายการในสูตร</th>
                <th>คีย์ที่ผูก</th><th className="text-right">ราคาสูตร</th><th className="text-right">ราคาสโตร์</th>
                <th>สถานะ</th><th className="p-2 rounded-r-lg">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 800).map((r, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="p-2 whitespace-nowrap text-ink-3">{r.section}</td>
                  <td className="text-ink-2">{r.usedBy}</td>
                  <td className="font-medium">{r.item}</td>
                  <td className="font-mono text-xs">{r.key || "—"}<span className="text-ink-3"> {r.keyKind !== "-" ? `(${r.keyKind})` : ""}</span></td>
                  <td className="text-right tabular-nums">{r.formulaPrice != null ? baht(r.formulaPrice) : "—"}</td>
                  <td className="text-right tabular-nums">{r.stockPrice != null ? baht(r.stockPrice) : "—"}</td>
                  <td className="whitespace-nowrap"><Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                  <td className="p-2 text-xs text-ink-3">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 800 && (
            <p className="text-xs text-ink-3 mt-2">แสดง 800 แถวแรกจาก {shown.length} — กรองหมวด/สถานะ หรือโหลด CSV เพื่อดูครบ</p>
          )}
        </div>
      </Card>
    </div>
  );
}
