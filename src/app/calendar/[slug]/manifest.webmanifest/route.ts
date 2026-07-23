import { loadCalendarPublicContext } from "@/lib/calendar-context";

/**
 * Manifest Web App dynamique, une entrée PAR CALENDRIER : permet au client
 * d'« ajouter à l'écran d'accueil » la page suivable d'un calendrier et de la
 * rouvrir chaque jour en plein écran (`display: standalone`) sur SA campagne
 * (`start_url` = la page courante). Next.js ne reconnaît le fichier spécial
 * `manifest.ts` qu'à la racine de `app/` ; pour une entrée par calendrier on
 * passe donc par un route handler, référencé via `metadata.manifest` de la page.
 *
 * Icône embarquée en data-URI SVG (cadeau kermesse) : aucun asset binaire, aucun
 * appel réseau — cohérent avec la contrainte « auto-suffisant » du projet.
 */
export const dynamic = "force-dynamic";

/** Cadeau « Kermesse » (jaune sur encre), zone de sécurité maskable respectée. */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="#211d16"/><rect x="140" y="230" width="232" height="150" rx="14" fill="#fcca59" stroke="#211d16" stroke-width="12"/><rect x="120" y="188" width="272" height="60" rx="14" fill="#f5793b" stroke="#211d16" stroke-width="12"/><rect x="238" y="188" width="36" height="192" fill="#211d16"/><path d="M256 188c-30-52-96-40-96 4 0 24 40 30 96 0Zm0 0c30-52 96-40 96 4 0 24-40 30-96 0Z" fill="#f296bd" stroke="#211d16" stroke-width="10"/></svg>`;

const ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await loadCalendarPublicContext(slug);
  // Réponse générique (404) : aucun oracle sur le motif d'invalidité.
  if (!ctx.ok || !ctx.publicState.calendar) {
    return new Response("Not found", { status: 404 });
  }

  const name = ctx.publicState.calendar.name.trim() || "Calendrier";
  // start_url/scope calés sur l'URL réellement visitée (slug ou id), pour que
  // l'app installée rouvre bien CE calendrier.
  const start = `/calendar/${encodeURIComponent(slug)}`;

  const manifest = {
    name: `${name} — Calendrier`,
    short_name: name.length > 12 ? `${name.slice(0, 11)}…` : name,
    description: `Ouvrez chaque jour une case du calendrier de ${ctx.organization.name}.`,
    start_url: start,
    scope: start,
    id: start,
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    dir: "ltr",
    background_color: "#fdf6e3",
    theme_color: "#fdf6e3",
    icons: [
      {
        src: ICON_DATA_URI,
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
      {
        src: ICON_DATA_URI,
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
