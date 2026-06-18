# Runbook: merge สายคิดราคา (feat/quote-phase5-ux) → main อย่างปลอดภัย

> เก็บไว้ใช้ "ตอนงานคิดราคาเสร็จ+เทสผ่าน+พี่นัทพอใจ" เท่านั้น · ยังไม่รันตอนนี้
> สถานการณ์: 2 สายแตกที่ `e026484` · ทับกันไฟล์เดียว = `public/calculator/index.html`
> (มะนาว/main แก้แค่ 18 บรรทัด = autofill ลูกค้า, commit `2662fbc` · เราแก้ 600+ บรรทัด)

---

## ก่อนเริ่ม — เช็ก 3 อย่าง
```bash
cd "C:/Users/Nut/Documents/Claude/Projects/Jr-beta"
git branch --show-current        # ต้องได้: feat/quote-phase5-ux
git status                        # ต้อง "nothing to commit, working tree clean"
```
ถ้ายังมีงานค้าง (ไม่ clean) → commit + push ให้หมดก่อน:
```bash
git add -A && git commit -m "เซฟงานก่อน merge" && git push
```

## ขั้นที่ 1 — ดึงของล่าสุดจากคลาวด์
```bash
git fetch origin                 # ดึงข้อมูลล่าสุดทุก branch (ยังไม่รวม แค่ดึงมาดู)
```

## ขั้นที่ 2 — ทำ backup ก่อนเสมอ (เซฟชีวิต)
```bash
git branch backup-quote-2026-06-09   # ปั๊ม branch สำรองจากจุดปัจจุบัน · ถ้าพังย้อนกลับได้
```
> ถ้าอะไรพังทีหลัง: `git reset --hard backup-quote-2026-06-09` = กลับมาเหมือนเดิมเป๊ะ

## ขั้นที่ 3 — รวม main เข้า "สายเรา" (ทดสอบในสายเราก่อน ไม่ยุ่ง main)
```bash
git merge origin/main            # เอางานมะนาวมารวมในสายเรา
```
- **ถ้าขึ้น "Already up to date" หรือรวมเสร็จไม่มี conflict** → ข้ามไปขั้น 5
- **ถ้าขึ้น CONFLICT (น่าจะที่ index.html)** → ทำขั้น 4

## ขั้นที่ 4 — เคลียร์ conflict (เฉพาะ public/calculator/index.html)
```bash
git status                       # ดูว่าไฟล์ไหน conflict (คาดว่า index.html ไฟล์เดียว)
git show 2662fbc -- public/calculator/index.html   # ดูว่ามะนาวเพิ่มอะไร (18 บรรทัด autofill ลูกค้า)
```
แก้ไฟล์ `public/calculator/index.html`:
- เปิดไฟล์ หาเครื่องหมาย `<<<<<<<`  `=======`  `>>>>>>>`
- **หลัก: เอาของเรา (สายคิดราคา R3.9 ตัวใหม่)**
- **แต่ต้องเก็บฟีเจอร์ autofill ลูกค้าของมะนาว** (จากที่ดู `2662fbc`) ใส่กลับเข้าไปด้วย
- ลบเครื่องหมาย `<<< === >>>` ออกให้หมด
เสร็จแล้ว:
```bash
git add public/calculator/index.html
git merge --continue             # ปิดงาน merge (จะเปิด editor ให้ใส่ข้อความ — เซฟได้เลย)
```
> เปลี่ยนใจกลางคัน อยากยกเลิก merge: `git merge --abort` = กลับสภาพก่อน merge

## ขั้นที่ 5 — ทดสอบก่อนส่งขึ้น (สำคัญ)
```bash
node scripts/gen-quotes-full.mjs      # สร้างใบทดสอบ ต้องไม่ error
node test/quote-fidelity.mjs          # เทสใบเสนอราคา ต้อง PASS
npm run build                         # build แอป ต้องผ่าน (เช็คงานมะนาวไม่พัง)
```
ถ้าเทสพัง → แก้ให้ผ่านก่อน (อย่าเพิ่งไปต่อ) · ถ้าแก้ไม่ไหว `git reset --hard backup-quote-2026-06-09`

## ขั้นที่ 6 — ส่งขึ้นคลาวด์ + เปิด PR (ให้รีวิวก่อนรวมจริง)
```bash
git push                              # ส่งสายเรา (ที่รวม main แล้ว) ขึ้น GitHub
```
แล้วเปิด PR บนเว็บ GitHub:
- ไป https://github.com/jraluminium102/jr-beta
- กด "Compare & pull request" · base = **main** ← compare = **feat/quote-phase5-ux**
- ดู "Files changed" ตรวจอีกรอบ → กด **Merge pull request**

## ขั้นที่ 7 — หลัง merge เข้า main
- Vercel จะ **deploy อัตโนมัติ** (~1-2 นาที)
- เปิดเว็บจริงเช็ก 2 อย่าง:
  1. **งานคิดราคา** — ออปชั่น/หลังคา/ใบเสนอ ทำงานครบ
  2. **งานผลิต/ตารางช่าง ของมะนาว** — ยังทำงานปกติ (ไม่พังจาก merge)

---

## ⛔ กฎเหล็ก (ห้ามทำ)
- ❌ `git push --force` / `git push -f` — เขียนทับประวัติคนอื่น = พังถาวร
- ❌ `git reset --hard` บน **main** — ลบงานมะนาว
- ❌ merge ตอน index.html ยังแก้ครึ่งๆ / เทสไม่ผ่าน
- ❌ ลบ branch `backup-quote-*` จนกว่าจะชัวร์ว่าทุกอย่างโอเค

## ถ้าพังหลัง push/merge แล้ว
- **ดีที่สุด:** บน GitHub เปิด PR ที่ merge ไป → กดปุ่ม **"Revert"** (ย้อนแบบปลอดภัย ไม่ลบประวัติ)
- อย่าใช้ reset/force แก้บน main เด็ดขาด

## เคล็ดกันชนซ้ำในอนาคต
- ตกลงกับมะนาว: **`public/calculator/index.html` ให้ฝั่งเราดูแลคนเดียว** · มะนาวโฟกัส `src/app`
- merge บ่อยๆ (อย่าทิ้งห่างเป็นเดือน) — ยิ่งบ่อยยิ่ง conflict น้อย
