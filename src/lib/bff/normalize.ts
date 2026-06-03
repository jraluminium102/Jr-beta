// PostgREST คืน embed ความสัมพันธ์ 1:1 เป็น object เดี่ยว (หรือ null)
// แต่ frontend คาดหวัง array → normalize ให้เป็น array เสมอ
export function toArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v == null) return [];
  return [v as T];
}
