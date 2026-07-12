import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/poster"];
const AUTH_PAGES = ["/login", "/signup"];

/**
 * Le back-office `/admin` est un SITE À PART : servi uniquement sur le
 * domaine admin dédié, et totalement invisible (404) sur le domaine
 * client. La séparation se fait au bord (middleware), avant tout rendu.
 *
 * Configuration : `ADMIN_HOSTS` = liste d'hôtes admin séparés par des
 * virgules (ex. "admin.lastchance.app"). En l'absence de configuration
 * (dev local mono-domaine), un hôte commençant par "admin." est traité
 * comme hôte admin — pratique pour tester en local.
 */
function isAdminHost(request: NextRequest): boolean {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const configured = (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length > 0) return configured.includes(host);
  // Non configuré : repli dev — sous-domaine "admin.*" => hôte admin.
  return host.startsWith("admin.");
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const onAdminHost = isAdminHost(request);
  const adminConfigured = (process.env.ADMIN_HOSTS ?? "").trim().length > 0;

  // ── Domaine client : le back-office n'existe pas ici ──
  // (uniquement quand un domaine admin distinct est configuré, sinon on
  //  reste en mono-domaine pour le dev.)
  if (!onAdminHost && adminConfigured && pathname.startsWith("/admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // ── Domaine admin : ne sert QUE le back-office ──
  // Tout ce qui n'est pas /admin (ni asset, déjà exclu par le matcher)
  // est renvoyé vers /admin. L'app commerçant n'apparaît pas ici.
  if (onAdminHost && !pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Rafraîchissement de session (client ET admin s'appuient sur Supabase).
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

  // Rafraîchit la session si nécessaire — ne pas retirer.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La garde d'accès du back-office (session + admin_users actif) est
  // faite dans le layout /admin ; ici on gère seulement l'app commerçant.
  if (!onAdminHost) {
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
    const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    if (isAuthPage && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Tout sauf assets statiques, parcours public /play (aucune session
  // requise), /api/scan (beacon de comptage anonyme) et /api/health
  // (pingé par les moniteurs d'uptime)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|play|api/stripe|api/health|api/scan|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
