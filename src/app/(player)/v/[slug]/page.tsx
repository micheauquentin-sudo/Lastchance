import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VITRINE_PUBLIQUE_OUVERTE, type VitrineLiensView } from "@/lib/vitrine";
import { loadVitrinePublicContext } from "@/lib/vitrine-context";
import { CatalogueVitrine } from "@/components/vitrine/catalogue-vitrine";
import {
  policesVitrine,
  resoudreThemeVitrine,
  variablesThemeVitrine,
  type VitrineThemeResolu,
} from "@/components/vitrine/theme";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * LA VITRINE PUBLIQUE — ce que voit le client attablé qui scanne le QR.
 *
 * ── LE DRAPEAU SE LIT ICI, ET IL REND 404 ──
 *
 * `VITRINE_PUBLIQUE_OUVERTE` est faux jusqu'à L11 : la fonctionnalité existe,
 * le commerçant peut la préparer et même la « publier », mais l'adresse
 * publique n'existe pas encore. Le refus est un `notFound()` — la MÊME réponse
 * qu'un slug inconnu — et non une page « bientôt disponible » : cette dernière
 * annoncerait au premier venu quelles adresses sont déjà réservées, ce que la
 * RPC refuse justement de dire en rendant `unavailable` indistinctement pour
 * un slug mal formé, inconnu, non publié ou sans droit.
 *
 * ── PAS DE `loading.tsx` AU-DESSUS DE CETTE ROUTE (ADR-107) ──
 *
 * Le statut partirait avant la fin du corps, et cette page répondrait 200 sur
 * une vitrine inexistante. Le groupe `(player)` n'en porte pas ;
 * `src/lib/route-boundaries.test.ts` juge la route sans qu'on l'y inscrive.
 *
 * ── LE THÈME EST DU CSS, PAS DU TAILWIND GÉNÉRÉ ──
 *
 * Les couleurs viennent de la base : aucune classe ne peut être compilée pour
 * elles. Elles sont posées en variables CSS sur le conteneur, et les composants
 * les lisent par `text-[var(--vitrine-primary)]`. Les polices suivent le motif
 * de `/play` — un `<link>` par police RÉELLEMENT choisie, jamais le catalogue
 * entier.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((slug: string) => loadVitrinePublicContext(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!VITRINE_PUBLIQUE_OUVERTE) notFound();
  const { slug } = await params;
  const ctx = await loadContext(slug);

  // LE 404 SE DÉCIDE ICI AUSSI : le rendu du groupe `(player)` peut être
  // streamé, et le statut part alors avec l'en-tête, avant le `notFound()` du
  // corps. `cache()` fait que les deux appels ne coûtent qu'une lecture.
  if (!ctx.ok) notFound();

  const nom = ctx.identite.nom;
  return {
    title: nom,
    description:
      ctx.identite.accroche ?? `Découvrez ${nom} et ce que le lieu propose.`,
    // Adresse portée par un QR posé sur une table : atteignable par lien, pas
    // indexée. L'indexation est une décision de commerce, elle viendra avec
    // l'ouverture publique (L11) et pas par défaut.
    robots: { index: false },
    appleWebApp: { capable: true, title: nom, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function VitrinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!VITRINE_PUBLIQUE_OUVERTE) notFound();
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx.ok) notFound();

  const nom = ctx.identite.nom;
  const theme = resoudreThemeVitrine(ctx.identite.theme);
  const polices = policesVitrine(theme);

  return (
    <div
      style={variablesThemeVitrine(theme)}
      className="min-h-dvh bg-[var(--vitrine-secondary)] font-[family-name:var(--vitrine-texte)] text-[var(--vitrine-sur-secondary)]"
    >
      {polices.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <SkipLink />

      <main id="contenu" tabIndex={-1} className="outline-none">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
          <EnTeteVitrine
            nom={nom}
            logoUrl={ctx.identite.logo_url}
          />

          {theme.blocs.map((bloc) => {
            switch (bloc) {
              case "accroche":
                return ctx.identite.accroche ? (
                  <p
                    key={bloc}
                    className="mb-8 text-center text-lg leading-relaxed text-[var(--vitrine-sur-secondary)]/80"
                  >
                    {ctx.identite.accroche}
                  </p>
                ) : null;
              case "histoire":
                return ctx.identite.histoire ? (
                  <BlocTexte
                    key={bloc}
                    titre="Notre histoire"
                    texte={ctx.identite.histoire}
                  />
                ) : null;
              case "horaires":
                return ctx.identite.horaires_texte ? (
                  <BlocTexte
                    key={bloc}
                    titre="Horaires"
                    texte={ctx.identite.horaires_texte}
                  />
                ) : null;
              case "cartes":
                return (
                  <div key={bloc} className="mb-10">
                    <CatalogueVitrine
                      cartes={ctx.cartes}
                      styleCartes={theme.styleCartes}
                    />
                  </div>
                );
              case "social":
                return <BlocLiens key={bloc} liens={ctx.liens} theme={theme} />;
              default:
                return null;
            }
          })}

          <footer className="mt-10 text-center text-xs text-[var(--vitrine-sur-secondary)]/60">
            Vitrine proposée par {nom} · propulsé par{" "}
            <Link
              href="/?utm_source=vitrine&utm_medium=footer"
              className="font-semibold underline underline-offset-2"
            >
              Lastchance
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}

function EnTeteVitrine({
  nom,
  logoUrl,
}: {
  nom: string;
  logoUrl: string | null;
}) {
  return (
    <header className="mb-6 text-center">
      {logoUrl ? (
        // Le logo DÉJÀ RÉGLÉ par le commerçant (`organizations.logo_url`) :
        // aucune seconde identité à tenir d'accord avec celle de la roue.
        // `<img>` nu et non `next/image`, comme les dix autres parcours
        // joueur : l'URL vient d'un bucket dont l'hôte n'est pas déclaré dans
        // `remotePatterns`, et l'optimiseur refuserait de la servir.
        // `alt=""` — le nom est juste en dessous, en toutes lettres ; le
        // décrire une seconde fois ferait entendre l'enseigne deux fois.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={80}
          height={80}
          className="mx-auto mb-3 h-20 w-20 rounded-full border border-black/10 bg-white object-cover"
        />
      ) : null}
      <h1 className="font-[family-name:var(--vitrine-titre)] text-3xl font-bold leading-tight text-[var(--vitrine-primary)]">
        {nom}
      </h1>
    </header>
  );
}

/**
 * Un bloc de texte libre (histoire, horaires).
 *
 * `whitespace-pre-line` : le commerçant saisit ses horaires ligne par ligne
 * dans un champ multiligne, et les recoller en un seul paragraphe rendrait
 * « Lundi 12h-14h Mardi 12h-14h » — illisible, et faux à la lecture rapide.
 */
function BlocTexte({ titre, texte }: { titre: string; texte: string }) {
  return (
    <section className="mb-10">
      <h2 className="mb-2 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]">
        {titre}
      </h2>
      <p className="whitespace-pre-line leading-relaxed text-[var(--vitrine-sur-secondary)]/85">
        {texte}
      </p>
    </section>
  );
}

/**
 * LES LIENS SORTANTS — réseaux et avis.
 *
 * ── « AVIS GOOGLE » EST NEUTRE, ET C'EST UNE OBLIGATION ──
 *
 * Le libellé dit où mène le lien, il ne demande rien : ni « laissez-nous 5
 * étoiles », ni « aidez-nous ». Solliciter un avis positif depuis la page que
 * le client consulte pendant son repas est précisément ce que les plateformes
 * d'avis interdisent, et ce qui rend un lieu suspect quand cela se voit.
 *
 * La base rend `''` pour un lien non renseigné et non `null` — « c'est l'écran
 * qui décide de ne rien afficher ». Le filtre est donc ici, sur la chaîne vide
 * comme sur `null`.
 */
function BlocLiens({
  liens,
  theme,
}: {
  liens: VitrineLiensView;
  theme: VitrineThemeResolu;
}) {
  const entrees = [
    { href: liens.instagram_url, label: "Instagram" },
    { href: liens.tiktok_url, label: "TikTok" },
    { href: liens.google_review_url, label: "Avis Google" },
  ].filter((e): e is { href: string; label: string } => Boolean(e.href?.trim()));

  if (entrees.length === 0) return null;

  return (
    <section className="mb-10" aria-labelledby="vitrine-liens">
      <h2
        id="vitrine-liens"
        className="mb-3 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]"
      >
        Nous suivre
      </h2>
      <ul className="flex flex-wrap gap-2">
        {entrees.map((entree) => (
          <li key={entree.label}>
            <a
              href={entree.href}
              target="_blank"
              rel="noopener noreferrer"
              // `min-h-11` : cible tactile d'au moins 44 px, sur une page dont
              // l'écran de référence est un téléphone tenu d'une main.
              className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
              style={{
                borderColor: theme.primary,
                color: theme.primary,
              }}
            >
              {entree.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
