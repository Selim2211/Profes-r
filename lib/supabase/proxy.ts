import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Only for a local machine: never on Vercel and only when the request really comes from localhost,
// so `npm run fast` (a production build run locally) can skip the login screen too.
function canAutoLogin(request: NextRequest): boolean {
  const host = request.nextUrl.hostname;
  return (
    !process.env.VERCEL &&
    (host === "localhost" || host === "127.0.0.1") &&
    process.env.LOCAL_AUTO_LOGIN === "true" &&
    Boolean(process.env.LOCAL_AUTO_LOGIN_EMAIL) &&
    Boolean(process.env.LOCAL_AUTO_LOGIN_PASSWORD)
  );
}

// Refreshes the Supabase session cookie and redirects unauthenticated users to /login.
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
  let isLoggedIn = Boolean(data?.claims);

  // Local development only: sign in automatically so the login screen can be skipped.
  // Never active on Vercel or for non-localhost hosts.
  if (!isLoggedIn && canAutoLogin(request)) {
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.LOCAL_AUTO_LOGIN_EMAIL!,
      password: process.env.LOCAL_AUTO_LOGIN_PASSWORD!,
    });
    isLoggedIn = !error;
  }

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
