"use client";

import { useEffect } from "react";

// เตือน "มีของยังไม่บันทึก" ก่อนเปลี่ยนหน้าในแอป (เจ้าของสั่ง 25 ส.ค.69 — คิดราคา4.0/ใบปะหน้า/แบบช่าง)
//   ⚠ ไม่ใช้ beforeunload — เดิมใช้แล้วเบราว์เซอร์เด้งกล่อง native ภาษาอังกฤษ (แก้ข้อความไม่ได้)
//     + ไปเด้งตอนกดปุ่ม "ออกใบเสนอราคา" (router.push = การบันทึก) จนบล็อกการบันทึกเงียบ ๆ (25 ส.ค.69)
//   เหลือแค่: ดักคลิกลิงก์ในแอป (เมนู <a>) → ถาม confirm ภาษาไทยก่อนพาออก
//     ปุ่มบันทึก/ออกใบเสนอ เป็น <button>+router.push (ไม่ใช่ <a>) → ไม่โดนดัก = บันทึกได้ปกติ
// ใช้: useUnsavedWarning(isDirty) — isDirty=true เมื่อมีของที่แก้แล้วยังไม่บันทึก
export function useUnsavedWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    // ดักคลิกลิงก์ในแอป (capture phase — ก่อน router จะพาไป)
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      // ลิงก์ออกนอกเว็บ (http/mailto/tel) — ไม่ดัก (ปล่อยไปตามปกติ)
      if (/^(https?:|mailto:|tel:)/i.test(href)) return;
      if (!window.confirm("มีข้อมูลที่ยังไม่บันทึก — ออกจากหน้านี้เลยไหม?\nที่ทำไว้จะหายนะ")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [isDirty]);
}
