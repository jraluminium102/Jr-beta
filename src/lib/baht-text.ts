// Convert a number to Thai Baht text (e.g. 1500 → "หนึ่งพันห้าร้อยบาทถ้วน")
// Logic mirrors the bahtText() used in public/calculator/index.html

const ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

function convertGroup(n: number): string {
  if (n === 0) return "";
  if (n < 10) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    let s = "";
    if (t === 1) s = "สิบ";
    else if (t === 2) s = "ยี่สิบ";
    else s = ONES[t] + "สิบ";
    if (o === 1 && t > 0) s += "เอ็ด";
    else if (o > 0) s += ONES[o];
    return s;
  }
  // 100 – 999
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return ONES[h] + "ร้อย" + convertGroup(rem);
}

export function bahtText(amount: number): string {
  const n = Math.round(Math.abs(amount) * 100);
  if (n === 0) return "ศูนย์บาทถ้วน";

  const satang = n % 100;
  const baht = Math.floor(n / 100);

  let result = "";

  if (baht > 0) {
    // handle millions
    const millions = Math.floor(baht / 1_000_000);
    const remainder = baht % 1_000_000;

    if (millions > 0) {
      result += convertGroup(millions) + "ล้าน";
    }

    const hundred_thousands = Math.floor(remainder / 100_000);
    const ten_thousands = Math.floor((remainder % 100_000) / 10_000);
    const thousands = Math.floor((remainder % 10_000) / 1_000);
    const hundreds = Math.floor((remainder % 1_000) / 100);
    const tens = Math.floor((remainder % 100) / 10);
    const ones = remainder % 10;

    const parts = [
      hundred_thousands > 0 ? ONES[hundred_thousands] + "แสน" : "",
      ten_thousands > 0 ? ONES[ten_thousands] + "หมื่น" : "",
      thousands > 0 ? ONES[thousands] + "พัน" : "",
      hundreds > 0 ? ONES[hundreds] + "ร้อย" : "",
      tens > 0 ? (tens === 1 ? "สิบ" : tens === 2 ? "ยี่สิบ" : ONES[tens] + "สิบ") : "",
      ones > 0 ? (ones === 1 && tens > 0 ? "เอ็ด" : ONES[ones]) : "",
    ];
    result += parts.join("");
    result += "บาท";
  }

  if (satang > 0) {
    if (baht === 0) result = "";
    result += convertGroup(satang) + "สตางค์";
  } else {
    result += "ถ้วน";
  }

  return (amount < 0 ? "ลบ" : "") + result;
}

// ── จำนวนเงินเป็นตัวหนังสืออังกฤษ (ใบเสนอราคาภาษาอังกฤษ) ─────────────────────
//   512765.40 → "Five hundred twelve thousand seven hundred sixty-five baht and forty satang"
const EN_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (r < 20) { if (r) parts.push(EN_ONES[r]); }
  else parts.push(EN_TENS[Math.floor(r / 10)] + (r % 10 ? `-${EN_ONES[r % 10]}` : ""));
  return parts.join(" ");
}
function enInteger(n: number): string {
  if (n === 0) return "zero";
  const scales = ["", " thousand", " million", " billion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(enBelowThousand(chunk) + scales[i]);
    n = Math.floor(n / 1000); i++;
  }
  return parts.join(" ");
}
export function bahtTextEn(amount: number): string {
  const n = Math.round(Math.abs(amount) * 100);
  const satang = n % 100, baht = Math.floor(n / 100);
  let s = `${enInteger(baht)} baht`;
  if (satang > 0) s += ` and ${enInteger(satang)} satang`;
  else s += " only";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return (amount < 0 ? "Minus " : "") + s;
}
