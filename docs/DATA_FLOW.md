# DATA_FLOW.md — Chain เอกสารการเงิน JR Beta

> ทุกตาราง/FK/RPC = **EXISTS** ยกเว้นที่ทำเครื่องหมาย NEW/REFACTOR

## 1) Chain
```mermaid
flowchart TD
    CUST[(customers)]
    A["ทะเบียนลูกค้า /customers"] --> CUST
    B["เครื่องคิดราคา /calculator"] -. "sessionStorage jr_quote_items<br/>(items + ชื่อลูกค้า, ไม่มี id ⚠️A4)" .-> C
    C["Create QT /quotations/new<br/>POST /api/quotations"]
    CUST -->|customer_id → customer_snapshot| C
    C -->|computeTotals → subtotal/vat/wht/net| QT[(quotations)]
    QT --> D["QT List /quotations<br/>draft→sent→approved"]
    D -->|"approved → ปุ่มสร้างใบวางบิล<br/>/billing-notes/new?quotation=id"| E
    E["Create BL POST /api/billing-notes"]
    QT -->|"quotation_id + snapshot · total=q.net ⚠️A2"| E
    E -->|suggestInstallments| INST[(billing_installments)]
    E --> BL[(billing_notes)]
    BL --> F["Create INV POST /api/receipts"]
    INST -->|installment_id| F
    F --> INV[(receipts)]
    F -->|"✅A1 applyInstallmentPayment<br/>mark งวด paid + recompute BL"| INST
    PAY["PATCH /billing-notes/[id]/pay"] -->|"✅A1 helper เดียวกัน"| INST
```

## 2) Schema / FK — EXISTS vs REFACTOR
| ความเชื่อม | Field / FK | สถานะ |
|---|---|---|
| customer → QT | `quotations.customer_id` + `customer_snapshot` jsonb | EXISTS |
| ราคา calc → QT | `sessionStorage["jr_quote_items"]` (client bridge) | EXISTS |
| tax QT | `vat_rate/discount_pct/wht_rate` + `subtotal/vat_amt/total/wht_amt/net` | EXISTS (money.ts) |
| QT → BL | `billing_notes.quotation_id` + snapshot copy | EXISTS |
| BL → งวด | `billing_installments.billing_note_id` (CASCADE) | EXISTS |
| BL → INV | `receipts.billing_note_id` | EXISTS |
| งวด → INV | `receipts.installment_id` | EXISTS |
| รหัสเอกสาร | `document_sequences` + RPC `next_document_code` | EXISTS (atomic, reset เดือน) |
| **INV → mark งวด paid + recompute BL** | `lib/billing.ts:applyInstallmentPayment` (reuse field เดิม) | ✅ **REFACTOR A1 (เสร็จ)** |
| carry subtotal/vat_rate QT→BL | join `quotation_id` (no migration) | 📋 A2 (planned) |

**สรุป:** chain หลักไม่ต้องสร้างตารางใหม่ · A1 แก้ด้วย helper (reuse field เดิม ไม่มี field ใหม่)

## 3) Auto carry-forward
- **QT:** route ดึง `customers` → snapshot · `computeTotals` server-side = source of truth
- **BL:** verify `q.status='approved'` → copy snapshot, `total=q.net` → `suggestInstallments` insert งวด `pending`
- **INV:** ดึง `bn.customer_snapshot` → copy + `billing_note_id`/`installment_id` → ✅ **A1: ปิดงวด + recompute BL**
- **รหัส:** ทุก POST เรียก RPC `next_document_code` (atomic, reset รายเดือน)
