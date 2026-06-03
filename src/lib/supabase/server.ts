import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

// Server-side Supabase client (carries the user session via cookies).
// ใช้ใน Server Components และ BFF route handlers
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // cookieStore is ReadonlyRequestCookies in Server Components
            // (set/delete are stripped from the type but exist at runtime in Route Handlers)
            const mutable = cookieStore as unknown as {
              set: (name: string, value: string, options?: object) => void;
            };
            cookiesToSet.forEach(({ name, value, options }) =>
              mutable.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware handles the refresh
          }
        },
      },
    }
  );
}
