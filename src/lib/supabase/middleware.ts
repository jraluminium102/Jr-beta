// Refresh session ในทุก request + กันหน้าใน (app) ถ้ายังไม่ login
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ถ้า env ไม่ครบ — อย่าให้ throw จน 500 ทั้งเว็บ (Edge runtime เข้มกว่า Node)
  // ปล่อยผ่านเพื่อให้หน้า/handler จัดการเอง แทนที่จะล้มทั้งระบบ
  if (!url || !anon) return response;

  let user = null;
  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    // Supabase ไม่พร้อม/เครือข่ายมีปัญหา → ถือว่ายังไม่ login (ไม่ทำให้ 500)
    user = null;
  }

  // /api/* ปล่อยผ่าน — ให้ route handler ตอบ 401 JSON เอง (ไม่ redirect)
  if (path.startsWith("/api")) return response;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
