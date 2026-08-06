import { planFloor } from "@/lib/floor-calc/engine.mjs";

/**
 * ผังพื้น — ตำแหน่งเสาเข็ม + คานพาด + เส้นบอกระยะทุกช่วง
 * ใช้ร่วมทั้งหน้าแก้ไข (บนจอ) และหน้าพิมพ์ → SVG ล้วน ไม่มี state ไม่มี event
 *
 * เส้นบอกระยะอ่านแบบ "โซ่": ยื่นหัว | ช่วงเข็ม | ... | ยื่นท้าย
 * ช่วงระหว่างเข็มเน้นสีแดง ส่วนระยะยื่นปลายเป็นสีเทา (ดูออกทันทีว่าอันไหนคือระยะเข็ม)
 */
export function FloorPlanSvg({
  width, length, showTitle = true, height = 400,
}: {
  width: number;
  length: number;
  showTitle?: boolean;
  height?: number;
}) {
  const p = planFloor(width, length);
  const W = 620, H = height;
  const PAD = { l: 66, r: 38, t: showTitle ? 58 : 34, b: 64 };
  const aw = W - PAD.l - PAD.r, ah = H - PAD.t - PAD.b;
  const s = Math.min(aw / p.length, ah / p.width);
  const pw = p.length * s, ph = p.width * s;
  const ox = PAD.l + (aw - pw) / 2, oy = PAD.t + (ah - ph) / 2;
  const X = (v: number) => ox + v * s;
  const Y = (v: number) => oy + v * s;
  const m = (n: number) => String(Math.round(n * 100) / 100);

  const INK = "#1f2937", DIM = "#9a938b", PILE = "#b3151d", BEAM = "#2f6f8f";

  // เส้นบอกระยะ 1 ช่วง (มีขีดหัวท้าย + ป้ายตัวเลขบนพื้นขาว)
  const Dim = ({ x1, y1, x2, y2, label, span }: {
    x1: number; y1: number; x2: number; y2: number; label: string; span?: boolean;
  }) => {
    const horiz = Math.abs(y2 - y1) < 0.5;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const T = 3.4;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DIM} strokeWidth={1} />
        {[[x1, y1], [x2, y2]].map(([px, py], i) => (
          <line
            key={i}
            x1={horiz ? px : px - T} y1={horiz ? py - T : py}
            x2={horiz ? px : px + T} y2={horiz ? py + T : py}
            stroke={DIM} strokeWidth={1}
          />
        ))}
        <rect x={mx - 15} y={my - 7} width={30} height={14} rx={3} fill="#fff" />
        <text
          x={mx} y={my} fontSize={9.5} fontFamily="monospace" textAnchor="middle"
          dominantBaseline="middle" fill={span ? PILE : DIM} fontWeight={span ? 700 : 500}
        >{label}</text>
      </g>
    );
  };

  const chainX = [0, ...p.xs, p.length];
  const chainY = [0, ...p.ys, p.width];
  const yTop = oy - 27, xLeft = ox - 31;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
      role="img" aria-label={`ผังพื้น ${m(p.width)} × ${m(p.length)} เมตร เสาเข็ม ${p.piles} ต้น`}>
      {/* พื้น */}
      <rect x={ox} y={oy} width={pw} height={ph} rx={2} fill="#f2eee8" stroke="#e4dfd8" strokeWidth={1.2} />

      {/* คาน — กริดเต็ม (ทุกแถวเข็มมีคานพาด) */}
      {p.ys.map((v: number, i: number) => (
        <line key={`h${i}`} x1={ox} y1={Y(v)} x2={ox + pw} y2={Y(v)}
          stroke={BEAM} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
      ))}
      {p.xs.map((v: number, i: number) => (
        <line key={`v${i}`} x1={X(v)} y1={oy} x2={X(v)} y2={oy + ph}
          stroke={BEAM} strokeWidth={5} strokeLinecap="round" opacity={0.85} />
      ))}

      {/* เสาเข็ม */}
      {p.xs.map((mx: number, i: number) => p.ys.map((my: number, j: number) => {
        const cx = X(mx), cy = Y(my);
        return (
          <g key={`p${i}-${j}`}>
            <circle cx={cx} cy={cy} r={7.5} fill={PILE} />
            <circle cx={cx} cy={cy} r={7.5} fill="none" stroke="#fff" strokeWidth={1.6} />
            <line x1={cx - 3.4} y1={cy} x2={cx + 3.4} y2={cy} stroke="#fff" strokeWidth={1.3} />
            <line x1={cx} y1={cy - 3.4} x2={cx} y2={cy + 3.4} stroke="#fff" strokeWidth={1.3} />
          </g>
        );
      }))}

      {/* ระยะบน (แนวยาว) */}
      {chainX.slice(0, -1).map((a: number, i: number) => {
        const b = chainX[i + 1];
        if (b - a < 0.005) return null;
        return <Dim key={`dx${i}`} x1={X(a)} y1={yTop} x2={X(b)} y2={yTop}
          label={m(b - a)} span={i !== 0 && i !== chainX.length - 2} />;
      })}
      {chainX.map((v: number, i: number) => (
        <line key={`gx${i}`} x1={X(v)} y1={yTop} x2={X(v)} y2={oy - 4}
          stroke="#e4dfd8" strokeWidth={1} strokeDasharray="2 3" />
      ))}

      {/* ระยะซ้าย (แนวกว้าง) */}
      {chainY.slice(0, -1).map((a: number, i: number) => {
        const b = chainY[i + 1];
        if (b - a < 0.005) return null;
        return <Dim key={`dy${i}`} x1={xLeft} y1={Y(a)} x2={xLeft} y2={Y(b)}
          label={m(b - a)} span={i !== 0 && i !== chainY.length - 2} />;
      })}
      {chainY.map((v: number, i: number) => (
        <line key={`gy${i}`} x1={xLeft} y1={Y(v)} x2={ox - 4} y2={Y(v)}
          stroke="#e4dfd8" strokeWidth={1} strokeDasharray="2 3" />
      ))}

      {/* ระยะรวม */}
      <Dim x1={ox} y1={oy + ph + 32} x2={ox + pw} y2={oy + ph + 32} label={m(p.length)} />
      <text x={ox + pw / 2} y={oy + ph + 49} fontSize={10.5} fontFamily="monospace"
        textAnchor="middle" dominantBaseline="middle" fill={INK} fontWeight={700}>
        ยาว {m(p.length)} ม.
      </text>
      <Dim x1={ox + pw + 24} y1={oy} x2={ox + pw + 24} y2={oy + ph} label={m(p.width)} />

      {showTitle && (
        <>
          <text x={14} y={20} fontSize={11.5} fontFamily="monospace" textAnchor="start"
            dominantBaseline="middle" fill={INK} fontWeight={700}>
            ผังพื้น · {m(p.width)} × {m(p.length)} ม.
          </text>
          <text x={14} y={36} fontSize={10} fontFamily="monospace" textAnchor="start"
            dominantBaseline="middle" fill={p.tooTight ? "#a8600d" : "#87817b"}>
            เข็ม {p.piles} ต้น ({p.rowsW}×{p.rowsL} แถว) · คาน {p.beamLen.toFixed(1)} ม.
            {p.tooTight ? "  ⚠ ด้านแคบเกิน ระยะเข็ม < 1 ม." : ""}
          </text>
        </>
      )}
    </svg>
  );
}
