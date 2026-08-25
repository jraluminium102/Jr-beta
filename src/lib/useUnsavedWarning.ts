"use client";

import { useEffect } from "react";

// เตือน "มีของยังไม่บันทึก" ก่อนออก/เปลี่ยนหน้า (เจ้าของสั่ง 25 ส.ค.69 — คิดราคา4.0/ใบปะหน้า/แบบช่าง)
//   ครอบ 2 ทาง:
//   1) beforeunload — ปิดแท็บ/รีเฟรช/กด back ระดับเบราว์เซอร์ → กล่องเตือน native
//   2) คลิกลิงก์ในแอป (เมนู <a>) — ถาม confirm ก่อนพาออก (SPA nav ไม่ยิง beforeunload)
// ใช้: useUnsavedWarning(isDirty) — isDirty=true เมื่อมีของที่แก้แล้วยังไม่บันทึก
export function useUnsavedWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Chrome ต้อง set returnValue ถึงจะโชว์กล่อง
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // ดักคลิกลิงก์ในแอป (capture phase — ก่อน router จะพาไป)
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      // ลิงก์ออกนอกเว็บ (http/mailto/tel) ปล่อยให้ beforeunload จัดการ
      if (/^(https?:|mailto:|tel:)/i.test(href)) return;
      if (!window.confirm("มีข้อมูลที่ยังไม่บันทึก — ออกจากหน้านี้เลยไหม?\nที่ทำไว้จะหายนะ")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [isDirty]);
}
