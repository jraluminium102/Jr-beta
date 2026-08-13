import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ⚠ TEMP DIAG — list queue_sales (จะลบหลังตรวจ)
const TOKEN = "qsl-3f8a1d";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { data } = await sb
    .from("queue_sales")
    .select("id,name,code,team,role,active")
    .order("team", { ascending: true });
  return Response.json({ sales: data ?? [] });
}
