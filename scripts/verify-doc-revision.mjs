/**
 * verify-doc-revision — ป้าย "อ้าง Rev เก่า" (0132) ต้องไม่เตือนมั่ว
 *   บทเรียน: ถ้าเดาว่าไม่มีค่า = Rev 0 → บิลทั้งระบบขึ้นป้ายแดงพร้อมกันตอน deploy
 */
import { revWarning, revBadge } from '../src/lib/doc-revision.ts';
let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? '✅' : '❌'} ${name}` + (good ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
  good ? pass++ : fail++;
};
console.log('\n═══ ป้าย Rev เก่า ═══');
ok('ยังไม่รัน 0132 (ไม่มีคอลัมน์) → ไม่เตือน', revWarning({}, 3).show, false);
ok('source = null → ไม่เตือน', revWarning({ source_revision_no: null }, 3).show, false);
ok('doc = null → ไม่เตือน', revWarning(null, 3).show, false);
ok('Rev เท่ากัน → ไม่เตือน', revWarning({ source_revision_no: 2 }, 2).show, false);
ok('Rev เอกสารใหม่กว่า (ผิดปกติ) → ไม่เตือน', revWarning({ source_revision_no: 5 }, 2).show, false);
ok('Rev เก่ากว่า → เตือน', revWarning({ source_revision_no: 1 }, 3).show, true);
ok('เก่ากว่าแต่รับทราบตรง Rev ปัจจุบัน → ไม่เตือน', revWarning({ source_revision_no: 1, ack_revision_no: 3 }, 3).show, false);
ok('รับทราบไว้ที่ Rev เก่า แล้ว Rev ใหม่อีก → กลับมาเตือน', revWarning({ source_revision_no: 1, ack_revision_no: 2 }, 3).show, true);
ok('ข้อความมีเลข Rev ทั้งสองฝั่ง', /Rev 1/.test(revWarning({ source_revision_no: 1 }, 4).text) && /Rev 4/.test(revWarning({ source_revision_no: 1 }, 4).text), true);
ok('ป้ายสั้นตอนไม่เตือน = ว่าง', revBadge(revWarning({ source_revision_no: 2 }, 2)), '');
ok('ป้ายสั้นตอนเตือน', revBadge(revWarning({ source_revision_no: 1 }, 2)), 'Rev เก่า (1→2)');
ok('quotation ไม่มี revision_no (0093 ไม่ได้รัน) → ไม่เตือน', revWarning({ source_revision_no: 0 }, undefined).show, false);

// ── ด่านกัน "ลืมเพิ่มคอลัมน์ใหม่ใน regex fallback" (QA จับได้ 1 ก.ย.69) ──
//   bnBreakdown ใส่คอลัมน์อะไรเข้าไป regex fallback ต้องมีชื่อนั้นครบ
//   ไม่งั้นก่อนรัน migration = POST /api/billing-notes พัง 500 = ออกบิลไม่ได้ทั้งบริษัท
{
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/app/api/billing-notes/route.ts', 'utf8');
  const bd = (src.match(/const bnBreakdown = \{([\s\S]*?)\};/) || [])[1] || '';
  const cols = [...bd.matchAll(/(?:^|[{,]\s*)([a-z_]+)\s*:/g)].map(m => m[1]);
  const re = (src.match(/if \(bnErr && \/([^/]+)\/i\.test/) || [])[1] || '';
  const missing = cols.filter(c => !re.split('|').includes(c));
  console.log('\n═══ fallback regex ครอบคลุมทุกคอลัมน์ใน bnBreakdown ═══');
  console.log(`  คอลัมน์ใน bnBreakdown = ${cols.length} ตัว`);
  const good = cols.length > 0 && missing.length === 0;
  console.log(`  ${good ? '✅' : '❌'} ครบทุกตัว` + (good ? '' : `  ขาด: ${missing.join(', ')}`));
  good ? pass++ : fail++;
  console.log(`\n═══ สรุปรวม: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
  process.exit(fail ? 1 : 0);
}
