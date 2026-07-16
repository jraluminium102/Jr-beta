import { chromium } from "playwright";
const b = await chromium.launch();
// เครื่องสะอาด ไม่มี cache ไม่มี session — เหมือนช่างเปิดครั้งแรก
const ctx = await b.newContext({ viewport: { width: 430, height: 1400 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("https://jr-beta-azure.vercel.app/chang/jr-chang-7h3k9q2x8m", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
await p.screenshot({ path: "scratch-print/chang.png", clip: { x: 0, y: 0, width: 430, height: 1150 } });
const txt = await p.evaluate(() => document.body.innerText);
console.log("จำนวนงานที่ขึ้นบนหน้า:", (txt.match(/(\d+) งาน/g) || []).join(" · "));
console.log("มีคำว่า 'ใบตัดอลู':", txt.includes("ใบตัดอลู"));
console.log("มีป้ายเดดไลน์:", /เหลือ \d+ วัน|ยังไม่กำหนดวันต้องเสร็จ|เลยกำหนด/.test(txt));
await b.close();
