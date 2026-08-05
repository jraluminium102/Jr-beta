import { Fragment } from "react";
import { baht } from "@/lib/money";
import { bahtText } from "@/lib/baht-text";
import type { Quotation } from "@/lib/types";
import { PrintLetterhead, PrintCustomerBlock, DOC_COLORS } from "@/components/print/PrintLetterhead";
import { PrintSignature } from "@/components/print/PrintSignature";
import { detailLines, renderDetailLine } from "@/components/print/DetailLines";
import { COMPANY } from "./quote-constants";

/**
 * เนื้อเอกสารใบเสนอราคา (ส่วนที่พิมพ์) — แยกจาก page.tsx เพื่อทดสอบการแบ่งหน้าได้
 * ตรวจด้วย: npx next dev -p 3111 → node scripts/verify-quote-print.mjs (พิมพ์ PDF จริงแล้ววัด)
 *
 * ── กติกาการแบ่งหน้า (อ่านก่อนแก้! ผิดแล้วหัวบิลหายเงียบ ๆ ไม่มี error) ──────────
 *
 * โจทย์: ใบยาวเกิน 1 หน้า → หน้าถัดไปต้องมีหัวบิลไปด้วย
 * วิธี: หัวบิลอยู่ใน <thead> — เบราว์เซอร์พิมพ์ thead ซ้ำเองทุกหน้า
 *
 * ⚠️ ข้อจำกัดจริงของ Chrome 2 ข้อ (วัดเอง พิสูจน์แล้วด้วย verify-quote-print.mjs 16 ก.ค. 2569):
 *
 *   1. thead ซ้ำ "เฉพาะเมื่อรอยต่อหน้าตกระหว่างแถว"
 *      เอาเนื้อทั้งใบยัดใน <td> เดียวแล้วให้เซลล์แตกข้ามหน้า → thead ไม่ซ้ำ (เคยลอง พัง)
 *      → รายการสินค้าต้องเป็น "แถวของตารางนี้โดยตรง" ห้ามซ้อนในตารางย่อย
 *
 *   2. thead ต้องสูงไม่ถึง 25% ของหน้า (A4 = 74.25mm) ไม่งั้นเลิกซ้ำทั้งอัน "เงียบ ๆ"
 *      วัดจริง: หัวบิล+บล็อกลูกค้า = 79.9mm (เกิน) · ตัดบล็อกลูกค้าออก = 46.7mm (ผ่าน)
 *      → บล็อกลูกค้าจึงอยู่ใน tbody (หน้าแรกหน้าเดียว) ห้ามย้ายกลับเข้า thead
 *
 * โครง:
 *    thead : [หัวบิล]                    ← ซ้ำทุกหน้า (ต้องคุมให้ < 74.25mm เสมอ)
 *    tbody : [บล็อกลูกค้า] + [หัวคอลัมน์] + 1 รายการ/แถว + [แถวท้าย: ยอดรวม/หมายเหตุ/ลายเซ็น]
 *    tfoot : ท้ายบิล                     ← ซ้ำทุกหน้า
 *
 * หัวคอลัมน์อยู่ tbody เพราะต้องพิมพ์ "ใต้" บล็อกลูกค้า (thead พิมพ์ก่อน tbody เสมอ)
 * → แลกกับการที่หน้า 2+ ไม่มีหัวคอลัมน์ · เลือกได้อย่างเดียวเท่านั้น
 *
 * @page margin = 0 (globals.css — กัน browser แปะ URL/เลขหน้าเอง) แปลว่าหน้าที่ 2+
 * ไม่มีขอบบน/ล่าง (padding กล่อง A4 กินแค่หน้าแรก/หน้าสุดท้าย)
 * → ขอบบน-ล่างทุกหน้ามาจาก padding ของ thead/tfoot ที่ซ้ำ (ดู .qdoc ใน globals.css)
 * ────────────────────────────────────────────────────────────────────────────
 */
export function QuotationDoc({
  q,
  condWork,
  condQuote,
}: {
  q: Quotation;
  condWork: string[];
  condQuote: string[];
}) {
  const items = (q.quotation_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = q.customer_snapshot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyQ = q as any;
  const total = q.wht_amt > 0 ? q.net : q.total;
  const totalLabel = q.wht_amt > 0 ? "ยอดรับสุทธิ" : "จำนวนเงินรวมทั้งสิ้น";

  // หัวบิล — ตัวเดียวกันทั้งเอกสาร (ใช้ซ้ำใน thead ของทั้ง 2 ตาราง)
  const letterhead = (
    <PrintLetterhead
      docTitle="ใบเสนอราคา"
      docColor={DOC_COLORS.quotation}
      customer={c}
      // หัวบิลต้องเตี้ยพอที่ Chrome จะพิมพ์ซ้ำทุกหน้า (เพดาน ~74mm) → บล็อกลูกค้าไปอยู่หน้าแรกแยกต่างหาก
      hideCustomer
      infoRows={[
        {
          label: "เลขที่",
          value: (
            <span className="font-mono font-semibold">
              {q.code}
              {/* ป้าย Rev (0093) — แก้ใบแล้วเลือกนับ Rev → พิมพ์ต่อท้ายเลขที่ */}
              {String(anyQ.revision_label ?? "").trim() ? ` · ${String(anyQ.revision_label).trim()}` : ""}
            </span>
          ),
        },
        { label: "วันที่", value: q.issue_date },
      ]}
    />
  );

  const runningFooter = (
    <div
      className="text-center"
      style={{ fontSize: 10, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 4 }}
    >
      {COMPANY.name} ({COMPANY.branch}) · เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.phone} · {q.code}
    </div>
  );

  return (
    <>
      {/* ===== ตารางเอกสารหลัก — หัวบิล+หัวคอลัมน์ซ้ำทุกหน้า · รายการเป็นแถวตรง ๆ ===== */}
      <table className="qdoc" style={{ fontSize: 13 }}>
        {/* thead = หัวบิลบริษัทอย่างเดียว → เบราว์เซอร์พิมพ์ซ้ำทุกหน้า (~46.7mm < เพดาน 74.25mm)
            บล็อกลูกค้า + แถบหัวคอลัมน์ ย้ายลง tbody เพื่อให้ "ชื่อลูกค้าอยู่เหนือหัวคอลัมน์" แบบใบเสนอปกติ
            (เจ้าของสั่ง 28 ก.ค.69 — เดิมหัวคอลัมน์อยู่ thead เลยพิมพ์เหนือชื่อลูกค้า ดูผิดรูป)
            แลก: แถบหัวคอลัมน์อยู่หน้าแรกหน้าเดียว (หน้า 2+ มีแต่หัวบิลบริษัท) — เอาทั้งสามอย่างซ้ำพร้อมกันไม่ได้
            เพราะรวมกันสูง ~85mm เกินเพดานที่ Chrome ยอมพิมพ์ thead ซ้ำ */}
        <thead>
          <tr>
            <td colSpan={5} className="qdoc-head">{letterhead}</td>
          </tr>
        </thead>

        <tbody>
          {/* บล็อกลูกค้า — เหนือหัวคอลัมน์ (แบบใบเสนอปกติ) · หน้าแรกหน้าเดียว */}
          <tr>
            <td colSpan={5} className="qdoc-tail" style={{ paddingBottom: 8 }}>
              <PrintCustomerBlock c={c} color={DOC_COLORS.quotation} />
            </td>
          </tr>

          {/* แถบหัวคอลัมน์ — อยู่ใต้บล็อกลูกค้า · จัด center ทุกช่อง · ข้อมูลในแถวคงชิดเดิม (ชื่อซ้าย/ตัวเลขขวา) */}
          <tr style={{ background: "#faedf0", color: "#a8425a" }}>
            <th className="p-2 text-center border border-[#f0dde3]" style={{ width: "5%" }}>#</th>
            <th className="p-2 text-center border border-[#f0dde3]" style={{ width: "55%" }}>รายละเอียด</th>
            <th className="p-2 text-center border border-[#f0dde3]" style={{ width: "10%" }}>จำนวน</th>
            <th className="p-2 text-center border border-[#f0dde3]" style={{ width: "15%" }}>ราคาต่อหน่วย</th>
            <th className="p-2 text-center border border-[#f0dde3]" style={{ width: "15%" }}>ยอดรวม</th>
          </tr>

          {items.map((it, i) => {
            // หัวข้อชุด (0076): แทรกแถวหัวข้อเมื่อ group_label เปลี่ยน (และไม่ว่าง)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gl = String((it as any).group_label ?? "").trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prevGl = i > 0 ? String((items[i - 1] as any).group_label ?? "").trim() : "";
            const showHeading = gl && gl !== prevGl;
            return (
              <Fragment key={it.id}>
                {showHeading && (
                  // หัวข้อชุดห้ามค้างท้ายหน้าโดยไม่มีรายการตาม
                  <tr style={{ breakAfter: "avoid", pageBreakAfter: "avoid" }}>
                    <td colSpan={5} className="p-2 border border-[#f0dde3] font-bold" style={{ background: "#fdf3f5", color: "#a8425a" }}>{gl}</td>
                  </tr>
                )}
                {/* รายการ = "แถวละบรรทัด" (หัวรายการ + รายละเอียดบรรทัดละ 1 แถว) — กัน Chrome ทิ้งหน้าโล่ง/ตกขอบ
                    ตัดหน้าได้ทุกบรรทัด (แถวเตี้ย browser วางต่อได้เสมอ) · border-collapse: เส้นคั่นข้อ(บน/ล่างข้อ)
                    + เส้นแบ่งคอลัมน์(ซ้าย/ขวาทุกแถว)ต่อเนื่อง → หน้าตาเหมือนตารางเดิม (เจ้าของสั่ง 5ส.ค.69 "ทำฟอร์มดี ๆ ตลอด") */}
                {(() => {
                  const lines = it.detail ? detailLines(it.detail) : [];
                  const hasDetail = lines.length > 0;
                  const cv = "border-l border-r border-[#f0dde3] px-2"; // เส้นคอลัมน์ซ้าย/ขวา + ระยะข้าง
                  const headPad = hasDetail ? "pt-2 pb-0" : "py-2";
                  return (
                    <>
                      {/* หัวรายการ: # + ชื่อ + จำนวน/ราคา (border-t = เส้นคั่นบนข้อ) */}
                      <tr>
                        <td className={`${cv} border-t border-[#f0dde3] text-center align-top tabular-nums ${headPad}`}>{i + 1}</td>
                        <td className={`${cv} border-t border-[#f0dde3] align-top ${headPad}`}><div className="font-medium">{it.name}</div></td>
                        <td className={`${cv} border-t border-[#f0dde3] text-right align-top tabular-nums ${headPad}`}>{baht(it.qty)}</td>
                        <td className={`${cv} border-t border-[#f0dde3] text-right align-top tabular-nums ${headPad}`}>{baht(it.unit_price)}</td>
                        <td className={`${cv} border-t border-[#f0dde3] text-right align-top tabular-nums ${headPad}`}>{baht(it.line_total)}</td>
                      </tr>
                      {/* รายละเอียด: บรรทัดละ 1 แถว (ตัดหน้าได้ทุกบรรทัด) · แถวสุดท้าย = border-b ปิดข้อ */}
                      {lines.map((ln, li) => {
                        const last = li === lines.length - 1;
                        const bb = last ? "border-b border-[#f0dde3]" : "";
                        return (
                          <tr key={li}>
                            <td className={`${cv} ${bb} align-top ${last ? "pb-2" : ""}`} />
                            <td className={`${cv} ${bb} align-top ${last ? "pb-2" : ""}`} style={{ fontSize: 12, lineHeight: 1.5 }}>{renderDetailLine(ln, li)}</td>
                            <td className={`${cv} ${bb} ${last ? "pb-2" : ""}`} />
                            <td className={`${cv} ${bb} ${last ? "pb-2" : ""}`} />
                            <td className={`${cv} ${bb} ${last ? "pb-2" : ""}`} />
                          </tr>
                        );
                      })}
                    </>
                  );
                })()}
              </Fragment>
            );
          })}

          {/* ===== แถวท้าย: ยอดรวม + หมายเหตุ + ลายเซ็น — เป็นแถวของตารางนี้ จะได้มีหัวบิลด้วยถ้าตกไปหน้าใหม่ ===== */}
          <tr>
            <td colSpan={5} className="qdoc-tail">
              {/* กล่องยอดรวม "ต้องไปทั้งก้อน" — ครอบ breakInside:avoid ทั้งกล่อง
                  (เดิมตัวหนังสือจำนวนเงินกับตารางสรุปเป็นคนละ div → โดนตัดคาบเกี่ยวหน้า) */}
              <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                {/* ===== Total amount in words ===== */}
                <div className="mt-2 tabular-nums" style={{ fontSize: 13, color: "#a8425a" }}>
                  ({bahtText(total)})
                </div>

                {/* ===== Summary totals — matches genQuote qtot ===== */}
                <div className="flex justify-end mt-2">
                  <table style={{ fontSize: 13 }}>
                    <tbody>
                      <tr>
                        <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>รวมเป็นเงิน</td>
                        <td className="text-right tabular-nums">{baht(q.subtotal)} บาท</td>
                      </tr>

                      {q.discount_amt > 0 && (
                        Array.isArray(anyQ.discounts) && anyQ.discounts.filter((d: { amt?: number }) => (Number(d?.amt) || 0) > 0).length > 1
                          ? anyQ.discounts.filter((d: { amt?: number }) => (Number(d?.amt) || 0) > 0).map((d: { label?: string; amt?: number }, i: number) => (
                            <tr key={i}>
                              <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>
                                ส่วนลด {(d.label ?? "").trim() ? `(${(d.label ?? "").trim()})` : (q.subtotal > 0 ? `${Number((((Number(d.amt) || 0) / q.subtotal) * 100).toFixed(2))}%` : "")}
                              </td>
                              <td className="text-right tabular-nums">-{baht(Number(d.amt) || 0)} บาท</td>
                            </tr>
                          ))
                          : (
                            <tr>
                              <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>
                                ส่วนลด {anyQ.discount_label ? `(${anyQ.discount_label})` : (q.discount_pct > 0 ? `${q.discount_pct}%` : "")}
                              </td>
                              <td className="text-right tabular-nums">-{baht(q.discount_amt)} บาท</td>
                            </tr>
                          )
                      )}

                      {q.discount_amt > 0 && (
                        <tr>
                          <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>จำนวนเงินหลังหักส่วนลด</td>
                          <td className="text-right tabular-nums">{baht(q.subtotal - q.discount_amt)} บาท</td>
                        </tr>
                      )}

                      <tr>
                        <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>ภาษีมูลค่าเพิ่ม {q.vat_rate}%</td>
                        <td className="text-right tabular-nums">{baht(q.vat_amt)} บาท</td>
                      </tr>

                      {q.wht_amt > 0 && (
                        <tr>
                          <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>หัก ณ ที่จ่าย {q.wht_rate}%</td>
                          <td className="text-right tabular-nums">-{baht(q.wht_amt)} บาท</td>
                        </tr>
                      )}

                      <tr className="font-bold border-t" style={{ color: "#a8425a" }}>
                        <td className="pr-10 py-1 text-right border-t">{totalLabel}</td>
                        <td className="text-right tabular-nums border-t">{baht(total)} บาท</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ===== Note field (if any) ===== */}
              {q.note && (
                <div className="mt-4" style={{ fontSize: 12, color: "#4b5563", borderLeft: "3px solid #e5e7eb", paddingLeft: 10, breakInside: "avoid", pageBreakInside: "avoid" }}>
                  หมายเหตุ: {q.note}
                </div>
              )}

              {/* ===== Signature block — ฟอร์มกลาง (ในนามลูกค้า | ในนามบริษัท + บทบาท/วันที่) ===== */}
              <PrintSignature customerName={c.name} customerRole="ผู้สั่งซื้อสินค้า" companyRole="ผู้อนุมัติ" />
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={5} className="qdoc-foot">{runningFooter}</td>
          </tr>
        </tfoot>
      </table>

      {/* ===== หน้าเงื่อนไข — ขึ้นหน้าใหม่เสมอ + มีหัวบิลของตัวเอง =====
          แยกเป็นอีกตารางแทน page-break ในเซลล์ (break-before ในเซลล์ตาราง เบราว์เซอร์ไม่รับประกัน)
          แต่ละหัวข้อ = 1 แถว → ถ้าเงื่อนไขยาวเกินหน้า รอยต่อตกระหว่างแถว หัวบิลจึงซ้ำได้ */}
      <table className="qdoc qdoc-newpage" style={{ fontSize: 11.5, lineHeight: 1.65 }}>
        <thead>
          <tr>
            <td className="qdoc-head">{letterhead}</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="qdoc-tail">
              {/* หน้าเงื่อนไขสัญญา — ไม่ใส่บล็อกลูกค้า เอาแค่หัวบิลบริษัทมุมซ้าย (เจ้าของสั่ง 17 ก.ค.2569 "ดูเกะกะ")
                  ชื่อลูกค้ายังอยู่ในช่องลงนามท้ายเงื่อนไข + หน้าแรกใบเสนออยู่แล้ว */}
              <h4 className="font-bold mb-2" style={{ color: "#a8425a", breakAfter: "avoid", pageBreakAfter: "avoid" }}>
                เงื่อนไขการเข้าทำงาน
              </h4>
              <ol className="list-decimal ml-5 mb-3 space-y-1">
                {condWork.map((cond, idx) => (
                  <li key={idx} style={{ color: "#1f2937", breakInside: "avoid", pageBreakInside: "avoid" }}>
                    {cond.split("\n").map((line, li) => (
                      <span key={li}>
                        {li > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            </td>
          </tr>
          <tr>
            <td className="qdoc-tail">
              <h4 className="font-bold mt-2 mb-2" style={{ color: "#a8425a", breakAfter: "avoid", pageBreakAfter: "avoid" }}>
                เงื่อนไขแบบและใบเสนอราคา
              </h4>
              <ol className="list-none ml-0 mb-3 space-y-1">
                {condQuote.map((cond, idx) => (
                  <li key={idx} style={{ color: "#1f2937", breakInside: "avoid", pageBreakInside: "avoid" }}>
                    {cond.split("\n").map((line, li) => (
                      <span key={li}>
                        {li > 0 && (
                          <>
                            <br />
                            <span className="ml-4">{line}</span>
                          </>
                        )}
                        {li === 0 && line}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            </td>
          </tr>
          <tr>
            <td className="qdoc-tail">
              {/* Confirm + signature at bottom of conditions — ไปทั้งก้อน */}
              <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                <div className="mt-4 text-center font-semibold" style={{ color: "#a8425a" }}>
                  ขอยืนยันการสั่งซื้อภายใต้เงื่อนไข&nbsp;&nbsp;ขอแสดงความนับถือ
                </div>
                <div className="mt-3 flex justify-between" style={{ color: "#a8425a", fontSize: 12 }}>
                  <div>
                    ลงนาม ............................................... ผู้สั่งซื้อ
                    <br />
                    <span style={{ fontSize: 11 }}>วันที่ ........../........../.......... (สำหรับลูกค้า)</span>
                  </div>
                  <div className="text-right">{COMPANY.name}</div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="qdoc-foot">{runningFooter}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
