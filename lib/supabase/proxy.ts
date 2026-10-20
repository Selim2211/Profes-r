import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// There is no login screen: every visitor is signed in as one fixed account, server side, so the
// database rules (RLS) keep working. Anyone who knows the address can use the app, so the address is
// the only protection; the daily token budget still limits what the AI can spend.
// AUTO_LOGIN_* is the current name; LOCAL_AUTO_LOGIN_* still works for older .env.local files.
function autoLoginCredentials(): { email: string; password: string } | null {
  const email = process.env.AUTO_LOGIN_EMAIL || process.env.LOCAL_AUTO_LOGIN_EMAIL;
  const password = process.env.AUTO_LOGIN_PASSWORD || process.env.LOCAL_AUTO_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

function unavailable(message: string) {
  return new NextResponse(message, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// Keeps the Supabase session cookie fresh and signs the visitor in when there is no session yet.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const credentials = autoLoginCredentials();
    if (!credentials) {
      return unavailable("Otomatik giriş ayarlanmamış. AUTO_LOGIN_EMAIL ve AUTO_LOGIN_PASSWORD ortam değişkenlerini ekle.");
    }
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      return unavailable("Otomatik giriş başarısız. AUTO_LOGIN_EMAIL ve AUTO_LOGIN_PASSWORD değerlerini kontrol et.");
    }
  }

  // The old login address now just leads to the app.
  if (request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
