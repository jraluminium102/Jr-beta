import Calculator40Client from "@/components/Calculator40Client";

// เครื่องคิดราคา 4.0 (ต้นทุนจริง) — แยกเอกเทศจาก /calculator (R3.9) เดิม
// engine/pricebook เป็น static import ฝั่ง client — ไม่มี server data
export default function Calculator40Page() {
  return <Calculator40Client />;
}
