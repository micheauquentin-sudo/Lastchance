import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildContentSecurityPolicy,
  buildCspReportOnlyPolicy,
  buildReportingEndpointsHeader,
  cspSurfaceForPath,
} from "@/lib/security-headers";

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
  return process.env.NODE_ENV !== "production" && host.startsWith("admin.");
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const onAdminHost = isAdminHost(request);
  const adminConfigured = (process.env.ADMIN_HOSTS ?? "").trim().length > 0;

  // En production, l'admin est fermé tant que son domaine dédié n'est
  // pas explicitement configuré. Aucun repli silencieux sur le domaine public.
  if (process.env.NODE_ENV === "production" && !adminConfigured && pathname.startsWith("/admin")) {
    return new NextResponse("Not found", { status: 404 });
  }

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

  // Régime CSP de la route (cf. `cspSurfaceForPath`) : back-office et
  // authentification en nonce + strict-dynamic, expériences publiques
  // rendues à chaque requête en nonce simple, tout le reste — dont /play
  // dont l'ISR interdit un nonce par requête — en politique statique.
  const surface = cspSurfaceForPath(pathname);
  const nonce = surface === "static" ? null : crypto.randomUUID().replaceAll("-", "");
  const policy = buildContentSecurityPolicy({ surface, nonce });
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
    // Next lit le nonce dans cet en-tête de requête pour l'apposer à ses
    // propres balises <script> — ne pas retirer.
    requestHeaders.set("Content-Security-Policy", policy);
  }
  const nextResponse = () => NextResponse.next({ request: { headers: requestHeaders } });

  // ── PARCOURS PUBLICS : le nonce OUI, l'authentification NON ──────────
  //
  // Sur ces sept expériences, le joueur est un COOKIE ANONYME — jamais un
  // utilisateur Supabase. Le `user` calculé plus bas n'y est lu par personne :
  // il ne sert qu'aux préfixes protégés, aux pages d'authentification et à
  // l'hôte admin. On payait donc, à chaque requête, l'instanciation d'un client
  // Supabase et un `auth.getUser()` dont le résultat était jeté.
  //
  // Ce n'est pas gratuit, et le pire cas n'est pas l'anonyme : dès qu'un cookie
  // de session EXISTE, `getUser()` va valider le jeton chez Supabase par le
  // RÉSEAU. Un organisateur qui regarde l'écran de sa propre soirée déclenchait
  // ainsi un aller-retour d'authentification à CHAQUE rafraîchissement.
  //
  // POURQUOI NE PAS SIMPLEMENT LES RETIRER DU MATCHER, comme `/play`,
  // `/pronos` et `/v` : parce qu'elles sont dans `PUBLIC_NONCE_PREFIXES` et perdraient
  // leur CSP à nonce pour retomber en régime `static`, donc sous
  // `'unsafe-inline'`. Le durcissement obtenu partout ailleurs serait perdu sur
  // elles seules — une dégradation silencieuse, que `security-headers.ts`
  // nomme déjà. On sort donc l'authentification, pas la route.
  //
  // La portée est délibérément ÉTROITE : partout ailleurs (accueil, tarifs,
  // portefeuille, pages légales), le rafraîchissement de session continue, car
  // un commerçant qui y navigue longtemps doit garder sa session vivante.
  if (surface === "public") {
    const reponsePublique = nextResponse();
    if (nonce) {
      reponsePublique.headers.set("Content-Security-Policy", policy);
    }
    const endpointsPublics = buildReportingEndpointsHeader();
    if (endpointsPublics) {
      reponsePublique.headers.set("Reporting-Endpoints", endpointsPublics);
    }
    return reponsePublique;
  }

  // Rafraîchissement de session (client ET admin s'appuient sur Supabase).
  let response = nextResponse();
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
          response = nextResponse();
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

  // Posé ici et pas plus haut : `response` est reconstruit à chaque
  // rafraîchissement de cookie Supabase, ce qui perdrait les en-têtes.
  if (nonce) {
    response.headers.set("Content-Security-Policy", policy);
  } else {
    // Surfaces sans nonce traversant le proxy (pages statiques, légales,
    // marketing) : la politique stricte candidate y est seulement
    // mesurée. Absent tant que `CSP_REPORT_URI` n'est pas configuré.
    const reportOnly = buildCspReportOnlyPolicy();
    if (reportOnly) {
      response.headers.set("Content-Security-Policy-Report-Only", reportOnly);
    }
  }
  const reportingEndpoints = buildReportingEndpointsHeader();
  if (reportingEndpoints) {
    response.headers.set("Reporting-Endpoints", reportingEndpoints);
  }

  return response;
}

export const config = {
  // Tout sauf assets statiques, parcours publics /play, /pronos et /v
  // (aucune session requise), /api/page-opens (beacon de comptage anonyme) et
  // /api/health (pingé par les moniteurs d'uptime)
  //
  // `/v` (vitrine publique) rejoint /play et /pronos pour la MÊME raison, et
  // sans rien perdre : elle n'est pas dans `PUBLIC_NONCE_PREFIXES` — donc déjà
  // en régime `static` — et son ISR interdirait de toute façon un nonce par
  // requête. Elle traversait pourtant le proxy, c'est-à-dire un
  // `auth.getUser()` par requête : sur un simple cookie de session existant,
  // un aller-retour RÉSEAU vers l'API Auth Supabase dont le résultat n'était
  // lu par personne. Son canal CSP Report-Only, servi ici jusqu'alors, est
  // repris par `next.config.ts` — qui le pose déjà pour /play et /pronos.
  //
  // `v(?:/|$)` et non `v` nu : une lettre unique a un rayon d'action sans
  // commune mesure avec un mot — un futur `/verify` ou `/videos` sortirait
  // silencieusement du proxy, perdant session, redirection de connexion et
  // isolation du domaine admin (contre-revue L11).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|play|pronos|v(?:/|$)|api/stripe|api/health|api/page-opens|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
