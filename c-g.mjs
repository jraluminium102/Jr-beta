import fs from 'fs';
const PB = JSON.parse(fs.readFileSync('src/lib/calculator40/pricebook.json','utf8'));
// เพิ่มด่านตรึง: ราคาลายไม้ของ 3 รหัสนี้ = ที่เจ้าของแจ้ง
const f='scripts/verify-r40.mjs';let s=fs.readFileSync(f,'utf8');
const a=`  check('น้ำหนัก B20001 = 6.25 กก./เส้น (ไม่ใช่ 6.016 ที่เป็นราคา÷187)', PB.ALUWEIGHT?.B20001, 6.25, 0.001);`;
const b=a+`
  // น้ำหนัก 3 รหัสนี้ถอดจาก "ราคาลายไม้สักทองจริง" ที่เจ้าของแจ้ง 19 ส.ค.69
  //   ราคาลายไม้ที่คิดออกมา ต้องเท่าที่เจ้าของบอกเป๊ะ ไม่งั้นน้ำหนักที่ถอดมาผิด
  for (const [code, teak] of Object.entries({ F7988: 120, F7986: 360, F7935: 630 }))
    check(\`\${code} ลายไม้สักทอง = \${teak} ฿ (ราคาจริงจากเจ้าของ)\`, PB.ALUCOLOR_KEY?.wood_teak?.[code], teak, 0.5);
  check('F7935 น้ำหนักถอดใหม่ 2.424 (ชีตเขียน 0.285 = ไม่ใช่ของชั่ง)', PB.ALUWEIGHT?.F7935, 2.424, 0.002);
  check('F7986 น้ำหนักถอดใหม่ 1.03', PB.ALUWEIGHT?.F7986, 1.03, 0.002);
  check('F7988 น้ำหนักถอดใหม่ 0.377', PB.ALUWEIGHT?.F7988, 0.377, 0.002);`;
if(!s.includes(a)) throw new Error('NF');
fs.writeFileSync(f,s.replace(a,b));console.log('ok');
