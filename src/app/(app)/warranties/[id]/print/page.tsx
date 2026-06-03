import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import type { Warranty } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function WarrantyPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("warranties")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const w = data as Warranty;
  const items = w.items ?? [];
  const c = w.customer_snapshot;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/warranties/${w.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* กระดาษ A4 — กรอบใบรับประกันทางการ */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}>
        <div className="h-full border-4 rounded-sm p-8" style={{ borderColor: "#b3151d" }}>
          <div className="border rounded-sm p-7" style={{ borderColor: "#e3b9bc" }}>

            {/* หัวบริษัท */}
            <div className="flex justify-between items-start border-b-4 pb-4" style={{ borderColor: "#b3151d" }}>
              <div>
                <div className="text-3xl font-extrabold" style={{ color: "#b3151d" }}>JR <span className="text-gray-700">ALUMINIUM</span></div>
                <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                  บริษัท เจอาร์ อลูมิเนียม แอนด์ กลาส จำกัด<br />
                  13 พหลโยธิน 25 จตุจักร กรุงเทพฯ 10140 · โทร 02-xxx-9000<br />
                  เลขผู้เสียภาษี 0105xxxxxxxxx
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>ใบรับประกัน</div>
                <div className="text-xs text-gray-400">Warranty Certificate</div>
                <table className="text-xs mt-2 ml-auto">
                  <tbody>
                    <tr><td className="text-gray-500 pr-3 text-left">เลขที่</td><td className="font-mono font-semibold">{w.code}</td></tr>
                    <tr><td className="text-gray-500 pr-3 text-left">วันที่ออก</td><td>{w.issue_date}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* หัวเรื่องกลาง */}
            <div className="text-center mt-6">
              <div className="text-lg font-bold tracking-wide" style={{ color: "#7d0f15" }}>ใบรับประกันสินค้าและงานติดตั้ง</div>
              <div className="text-xs text-gray-400">Certificate of Product &amp; Installation Warranty</div>
            </div>

            {/* ลูกค้า / งาน */}
            <div className="mt-6 text-sm">
              <div className="text-gray-500 text-xs">ออกให้แก่ลูกค้า</div>
              <div className="font-semibold text-base">{c.name}{c.job ? ` · ${c.job}` : ""}</div>
              <div className="text-xs text-gray-500">{c.address}</div>
              {c.tax_id && <div className="text-xs text-gray-500">เลขผู้เสียภาษี: {c.tax_id}</div>}
              <div className="text-xs text-gray-500">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
            </div>

            {/* ระยะประกัน + วันหมดประกัน — เด่นชัด */}
            <div className="grid grid-cols-3 gap-3 mt-5 text-center">
              <div className="rounded-lg py-3 px-2" style={{ background: "#fdecec" }}>
                <div className="text-xs text-gray-500">วันที่เริ่มประกัน</div>
                <div className="text-base font-bold" style={{ color: "#7d0f15" }}>{w.issue_date}</div>
              </div>
              <div className="rounded-lg py-3 px-2" style={{ background: "#fdecec" }}>
                <div className="text-xs text-gray-500">ระยะเวลารับประกัน</div>
                <div className="text-base font-bold" style={{ color: "#7d0f15" }}>{w.warranty_months} เดือน</div>
              </div>
              <div className="rounded-lg py-3 px-2 border-2" style={{ background: "#fff", borderColor: "#b3151d" }}>
                <div className="text-xs text-gray-500">วันหมดประกัน</div>
                <div className="text-base font-extrabold" style={{ color: "#b3151d" }}>{w.expires_date ?? "—"}</div>
              </div>
            </div>

            {/* ตารางรายการที่รับประกัน */}
            <table className="w-full text-sm mt-6 border-collapse">
              <thead>
                <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
                  <th className="p-2 text-left border border-gray-200" style={{ width: 36 }}>#</th>
                  <th className="p-2 text-left border border-gray-200">รายการที่รับประกัน</th>
                  <th className="p-2 text-right border border-gray-200" style={{ width: 80 }}>จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="p-2 border border-gray-200 align-top">{i + 1}</td>
                    <td className="p-2 border border-gray-200">
                      <div className="font-medium">{it.name}</div>
                      {it.detail && <div className="text-xs text-gray-500">{it.detail}</div>}
                    </td>
                    <td className="p-2 border border-gray-200 text-right align-top">{baht(it.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* เงื่อนไขการรับประกัน */}
            <div className="mt-6 text-sm">
              <div className="font-bold" style={{ color: "#7d0f15" }}>เงื่อนไขการรับประกัน</div>
              <p className="text-gray-700 mt-1 leading-relaxed whitespace-pre-line">{w.coverage}</p>
            </div>

            {w.note && <div className="mt-4 text-xs text-gray-600"><b>หมายเหตุ:</b> {w.note}</div>}

            {/* ช่องเซ็นผู้มีอำนาจ */}
            <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
              <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้รับประกัน (ลูกค้า)</div></div>
              <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้มีอำนาจลงนาม · บริษัท เจอาร์ อลูมิเนียม แอนด์ กลาส จำกัด</div></div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
