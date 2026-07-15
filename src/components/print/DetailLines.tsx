/**
 * DetailLines — บรรทัด "รายละเอียด" ของรายการในเอกสาร (ใบเสนอราคา/พรีวิวเครื่องคิด)
 * กติกาที่ผู้ใช้พิมพ์ได้เอง:
 *   · บรรทัดว่าง            = เว้นวรรค (ช่องไฟระหว่างกลุ่ม — เดิมโดนตัดทิ้ง ทำให้ติดกันเป็นพรืด)
 *   · ขึ้นต้นด้วย #          = หัวข้อ ตัวหนา+สีแดง เช่น "#หมายเหตุ" (ตัว # ไม่พิมพ์ลงใบ)
 *   · "รายละเอียดงาน" เดี่ยวๆ = หัวข้อ อัตโนมัติ (ของเดิมจากเครื่องคิดราคา — คงพฤติกรรม)
 *   · เว้นวรรคภายในบรรทัดคงตามที่พิมพ์ (pre-wrap)
 */
export function DetailLines({ text, fontSize = 12 }: { text: string; fontSize?: number }) {
  if (!text) return null;
  return (
    <div style={{ fontSize, lineHeight: 1.5, marginTop: 2 }}>
      {text.split("\n").map((ln, i) => {
        const s = ln.trim();
        if (!s) return <div key={i} aria-hidden style={{ height: "0.6em" }} />; // บรรทัดว่าง = เว้นวรรค
        if (s === "รายละเอียดงาน" || s.startsWith("#")) {
          const label = s.startsWith("#") ? s.slice(1).trim() : s;
          if (!label) return <div key={i} aria-hidden style={{ height: "0.6em" }} />;
          return <div key={i} style={{ fontWeight: 600, color: "#b3151d", marginTop: 3, whiteSpace: "pre-wrap" }}>{label}</div>;
        }
        return <div key={i} style={{ color: "#4b5563", marginLeft: s.startsWith("-") ? 8 : 0, whiteSpace: "pre-wrap" }}>{s}</div>;
      })}
    </div>
  );
}
