# AUDIT_FINANCE.md — ตรวจระบบเอกสารการเงิน JR Beta

> ขอบเขต: refactor + connect เท่านั้น · **ห้ามแตะสูตรคิดราคา** (`money.ts:computeTotals`, `public/calculator/*`), ห้าม rewrite UI ทั้งหน้า · ตรวจจากโค้ดจริง (commit 95bf165) โดยทีม agent 8 ตัว

## สรุปสุขภาพระบบ
เส้นทาง customer → QT → BL → INV **เดินได้จริง** — schema + FK + RPC ครบ. ปัญหาที่พบเป็นเรื่อง **wiring + logic ซ้ำซ้อน** ไม่ใช่โครงสร้างพัง.

> ⚠️ **ข้อค้นพบสำคัญ (ขัดกับ premise ของ goal):** "หน้าใบเสนอราคา" (`quotations/page.tsx`) **เป็น list view อยู่แล้ว** — create อยู่ที่ `quotations/new` ซึ่งดึงราคาจาก "หน้าคิดราคา" (`/calculator`) ผ่าน sessionStorage อยู่แล้ว. premise "create อยู่ผิดหน้า" จึง**ไม่ตรงกับโค้ดจริง** → ดู DECISIONS.md D1.

## ตารางจุดผิด (เรียง priority)
| # | Pri | จุดผิด | ไฟล์ | ผลกระทบ | สถานะ |
|---|-----|--------|------|---------|-------|
| **A1** | 🔴 P0 | ออกใบเสร็จแล้วงวดไม่ถูก mark `paid` + บิลไม่ recompute สถานะ (receipts POST เก็บ `installment_id` แต่ไม่อัปเดต `billing_installments`/`billing_notes`) | `api/receipts/route.ts` vs logic ครบใน `billing-notes/[id]/pay/route.ts` | จ่ายครบงวดแล้วยัง `pending`/บิล `unpaid` → บิลโผล่ dropdown ซ้ำ, ยอดค้างผิด | ✅ **แก้แล้ว** — helper ร่วม `lib/billing.ts:applyInstallmentPayment` ใช้ทั้ง 2 route |
| **A2** | 🔴 P0 | VAT meaning เพี้ยน — `billing_notes.total = quotation.net` (ผ่าน VAT+WHT แล้ว) แต่ใบเสร็จ default ยอดเป็น "รวม VAT" แล้วถอด VAT ย้อนกลับ | `billing-notes/route.ts:42,56`, `receipts/route.ts:48-50` | ยอดก่อน VAT ในใบกำกับไม่ตรง subtotal จริงของ QT | 📋 documented (ดู BUGS.md, ต้อง carry subtotal/vat_rate QT→BL) |
| **A3** | 🟠 P1 | logic VAT ซ้ำ 2 แหล่ง — `finance.ts:calcFinancials` (VAT7 hardcode) vs `money.ts:computeTotals` (canonical) | `finance.ts:1-8` | เสี่ยงยอดไม่ตรงถ้าเผลอเรียก | ◑ partial — ลบไฟล์ duplicate ที่เพิ่งสร้าง (installments/tax ที่ซ้ำ money.ts) + คง calcFinancials (ใช้ใน JobDrawer) ไว้ deferred |
| **A4** | 🟠 P1 | create quote: ลูกค้าจากเครื่องคิดราคามาแค่ชื่อ string ไม่มี `customer_id` → เลือก dropdown ซ้ำ | `QuotationForm.tsx` | UX สะดุด, เสี่ยงเลือกผิดคน | 📋 documented (preselect by fuzzy-match) |
| **A5** | 🟡 P2 | create logic inline ใน route (reuse ยาก) | quotations/billing/receipts routes | scale ยาก | deferred |
| **A6** | 🟡 P2 | ไม่มี automated test | `package.json` | regression ไม่จับ | ◑ มี node verify (INSTALLMENT_TEST.md) |

## สิ่งที่ "ไม่ใช่บั๊ก" (อย่าแตะ)
- **`next_document_code` RPC** — atomic, race-safe, reset รายเดือน/ปี ถูกต้อง · wire ครบ QT/BL/INV/PO/WR
- **`computeTotals`** ลำดับ subtotal−discount→VAT→−WHT=net ถูกตามภาษีไทย
- **`suggestInstallments`** — 4 tier (70/30 · 40/50/10 · 35/30/res/40k · 25×3/res/40k) **ตรงกฎที่สั่งเป๊ะอยู่แล้ว**
- **customer_snapshot carry-forward** customers→QT→BL→INV ทำงาน point-in-time ถูก
