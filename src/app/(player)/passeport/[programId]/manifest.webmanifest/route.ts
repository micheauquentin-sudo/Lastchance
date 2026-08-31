import { loadLoyaltyContext } from "@/lib/loyalty-context";

/**
 * Manifest Web App dynamique, une entrée PAR PROGRAMME : permet au client
 * d'« ajouter à l'écran d'accueil » son passeport de fidélité et de le rouvrir
 * en plein écran (`display: standalone`) sur SON programme (`start_url` = la
 * page courante). Next.js ne reconnaît le fichier spécial `manifest.ts` qu'à la
 * racine de `app/` ; pour une entrée par programme on passe donc par un route
 * handler, référencé via `metadata.manifest` de la page.
 *
 * CE QUI DIFFÈRE DU JACKPOT ET DU CALENDRIER, ET POURQUOI.
 *
 * Ces deux-là s'installent au nom de LEUR CAMPAGNE (« Calendrier de l'Avent »),
 * parce que c'est un événement daté que le joueur suit. Une carte de fidélité,
 * non : l'icône reste sur le téléphone entre deux passages, souvent des mois,
 * à côté de celles des autres commerces. Le seul nom qui la rende
 * reconnaissable est celui du COMMERCE — « Le Fournil », pas « Passeport ».
 * `short_name` (le libellé réellement peint sous l'icône) porte donc le nom de
 * l'organisation, et le nom du programme n'apparaît que dans la description.
 */
export const dynamic = "force-dynamic";

/** Carte tamponnée « Kermesse » (jaune sur encre), zone maskable respectée. */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="#211d16"/><rect x="106" y="146" width="300" height="220" rx="28" fill="#fcca59" stroke="#211d16" stroke-width="16"/><circle cx="176" cy="226" r="26" fill="#f5793b"/><circle cx="256" cy="226" r="26" fill="#f5793b"/><circle cx="336" cy="226" r="26" fill="#211d16" fill-opacity="0.18"/><circle cx="176" cy="300" r="26" fill="#211d16" fill-opacity="0.18"/><circle cx="256" cy="300" r="26" fill="#211d16" fill-opacity="0.18"/><circle cx="336" cy="300" r="26" fill="#211d16" fill-opacity="0.18"/></svg>`;

const ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;

/**
 * L'icône embarquée reste TOUJOURS déclarée, logo ou pas. Le logo du commerce
 * est un fichier distant dont on ne connaît ni les dimensions ni le format : le
 * déclarer seul ferait dépendre l'installation d'un téléchargement qui peut
 * échouer, et une icône manquante fait échouer l'invite d'installation entière.
 * Il est donc proposé EN PLUS, en `sizes: "any"` (la seule valeur honnête quand
 * on ignore la taille réelle), l'icône embarquée servant de repli maskable.
 */
function iconsFor(logoUrl: string | null) {
  const embedded = [
    { src: ICON_DATA_URI, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
    { src: ICON_DATA_URI, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
  ];
  if (!logoUrl) return embedded;
  return [{ src: logoUrl, sizes: "any", purpose: "any" }, ...embedded];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ programId: string }> },
) {
  const { programId } = await params;
  const ctx = await loadLoyaltyContext(programId);
  // Réponse générique (404) : aucun oracle sur le motif d'invalidité.
  if (!ctx.ok) {
    return new Response("Not found", { status: 404 });
  }

  const commerce = ctx.organization.name.trim() || "Ma carte de fidélité";
  const programme = ctx.program.name.trim();
  const start = `/passeport/${encodeURIComponent(programId)}`;

  const manifest = {
    name: `${commerce} — Fidélité`,
    short_name: commerce.length > 12 ? `${commerce.slice(0, 11)}…` : commerce,
    description: programme
      ? `Votre carte de fidélité ${programme} chez ${commerce} : vos points, vos cadeaux, et la carte à présenter en caisse.`
      : `Votre carte de fidélité chez ${commerce} : vos points, vos cadeaux, et la carte à présenter en caisse.`,
    start_url: start,
    scope: start,
    id: start,
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    dir: "ltr",
    background_color: "#fdf6e3",
    theme_color: "#fdf6e3",
    icons: iconsFor(ctx.organization.logo_url),
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
