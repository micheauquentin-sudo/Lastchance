import { loadJackpotContext } from "@/lib/jackpot-context";

/**
 * Manifest Web App dynamique, une entrée PAR CAMPAGNE : permet au client
 * d'« ajouter à l'écran d'accueil » la page suivable d'un jackpot et de la
 * rouvrir en plein écran (`display: standalone`) sur SA campagne
 * (`start_url` = la page courante). Next.js ne reconnaît le fichier spécial
 * `manifest.ts` qu'à la racine de `app/` ; pour une entrée par campagne on passe
 * donc par un route handler, référencé via `metadata.manifest` de la page.
 *
 * Icône embarquée en data-URI SVG (pièce kermesse) : aucun asset binaire, aucun
 * appel réseau — cohérent avec la contrainte « auto-suffisant » du projet.
 */
export const dynamic = "force-dynamic";

/** Pièce « Kermesse » (jaune sur encre), zone de sécurité maskable respectée. */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="96" fill="#211d16"/><circle cx="256" cy="256" r="150" fill="#fcca59" stroke="#211d16" stroke-width="16"/><text x="256" y="268" font-family="Georgia, 'Times New Roman', serif" font-size="200" font-weight="bold" fill="#211d16" text-anchor="middle" dominant-baseline="central">€</text></svg>`;

const ICON_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await loadJackpotContext(id);
  // Réponse générique (404) : aucun oracle sur le motif d'invalidité.
  if (!ctx.ok) {
    return new Response("Not found", { status: 404 });
  }

  const name = ctx.campaign.name.trim() || "Jackpot";
  // start_url/scope calés sur l'URL réellement visitée (id ou slug), pour que
  // l'app installée rouvre bien CETTE campagne.
  const start = `/jackpot/${encodeURIComponent(id)}`;

  const manifest = {
    name: `${name} — Jackpot`,
    short_name: name.length > 12 ? `${name.slice(0, 11)}…` : name,
    description: `Suivez le jackpot collectif de ${ctx.organization.name} en direct et tentez votre chance.`,
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
