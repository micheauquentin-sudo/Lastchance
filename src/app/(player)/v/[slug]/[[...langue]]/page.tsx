import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cheminVitrineLangue,
  type LangueVitrine,
  type VitrineLiensView,
} from "@/lib/vitrine";
import { getVitrinePublicState } from "@/lib/vitrine-context";
import { CatalogueVitrine } from "@/components/vitrine/catalogue-vitrine";
import { TEXTES_VITRINE } from "@/components/vitrine/langue";
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
 * ── ELLE EST OUVERTE (L11), ET ELLE EST BILINGUE ──
 *
 * `VITRINE_PUBLIQUE_OUVERTE` vaut désormais vrai : la Vitrine n'ouvrait qu'AVEC
 * l'anglais, l'anglais est là. Le 404 subsiste, mais pour les seules raisons
 * qu'il a toujours eues — slug inconnu, vitrine non publiée, droit éteint — et
 * toujours INDISTINCTEMENT : la RPC rend `unavailable` pour les trois, et cette
 * page rend la même 404 que pour une adresse inventée. Rien ici ne dit à un
 * visiteur qu'une adresse est prise mais fermée.
 *
 * ── LA LANGUE EST DANS LE CHEMIN, ET C'EST LA CONDITION DU CACHE ──
 *
 * `/v/{slug}` = français, `/v/{slug}/en` = anglais, toute autre valeur = 404.
 * PAS de `?lang=` : un `searchParams` rend la page dynamique, et c'est
 * exactement ce qu'on ne peut pas se permettre. La revue de sécurité de L10
 * demandait un « cache court par slug » sur une RPC publique que n'importe qui
 * peut balayer ; `revalidate = 60` le donne, et la langue n'y arrive qu'en
 * faisant partie de la CLÉ — c'est-à-dire du chemin. Une vitrine coûte donc au
 * plus deux lectures de base par minute, quel que soit le trafic.
 *
 * COROLLAIRE, et il tient tant que le contrat tient : `getVitrinePublicState`
 * ne doit toucher NI `headers()` NI `cookies()`. Une seule de ces lectures
 * ferait retomber la page en rendu dynamique, silencieusement — le cache
 * disparaîtrait sans qu'aucun test ne rougisse.
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
export const revalidate = 60;

type ParamsVitrine = Promise<{ slug: string; langue?: string[] }>;

/**
 * Le segment de langue, ou `null` quand il ne veut rien dire.
 *
 * TROIS CAS SEULEMENT. Absent → français. Exactement `["en"]` → anglais. Tout
 * le reste — `/v/x/de`, `/v/x/en/extra`, `/v/x/EN` — rend `null`, donc 404 :
 * accepter silencieusement une langue inconnue en servant du français créerait
 * une infinité d'URL distinctes pour la même page, chacune avec sa propre
 * entrée de cache.
 */
function resoudreLangue(segments: string[] | undefined): LangueVitrine | null {
  if (!segments || segments.length === 0) return "fr";
  if (segments.length === 1 && segments[0] === "en") return "en";
  return null;
}

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const charger = cache((slug: string, lang: LangueVitrine) =>
  getVitrinePublicState(slug, lang === "en" ? "en" : undefined),
);

export async function generateMetadata({
  params,
}: {
  params: ParamsVitrine;
}): Promise<Metadata> {
  const { slug, langue } = await params;
  const demandee = resoudreLangue(langue);
  if (!demandee) notFound();
  const etat = await charger(slug, demandee);

  // LE 404 SE DÉCIDE ICI AUSSI : le rendu du groupe `(player)` peut être
  // streamé, et le statut part alors avec l'en-tête, avant le `notFound()` du
  // corps. `cache()` fait que les deux appels ne coûtent qu'une lecture.
  if (etat.state !== "ok") notFound();

  const nom = etat.identite.nom;
  return {
    title: nom,
    description:
      etat.identite.accroche ?? `Découvrez ${nom} et ce que le lieu propose.`,
    // Adresse portée par un QR posé sur une table : atteignable par lien, pas
    // indexée. L'indexation est une décision de COMMERCE et non d'ingénierie —
    // elle se prendra pour de bon, avec un plan de site et des adresses
    // canoniques, et pas en marge d'une ouverture technique.
    robots: { index: false },
    // Les deux variantes se déclarent l'une l'autre : même si la page n'est pas
    // indexée aujourd'hui, un partage de lien et les traducteurs de navigateur
    // lisent ces relations, et elles ne coûtent rien.
    alternates: {
      canonical: cheminVitrineLangue(etat.slug, etat.lang),
      languages: {
        fr: cheminVitrineLangue(etat.slug, "fr"),
        en: cheminVitrineLangue(etat.slug, "en"),
      },
    },
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
  params: ParamsVitrine;
}) {
  const { slug, langue } = await params;
  const demandee = resoudreLangue(langue);
  if (!demandee) notFound();
  const etat = await charger(slug, demandee);
  if (etat.state !== "ok") notFound();

  // LA LANGUE SERVIE, PAS CELLE DEMANDÉE. Les deux coïncident aujourd'hui,
  // mais c'est la base qui tranche — elle seule sait ce qu'elle a pu superposer
  // — et `<div lang>` doit dire ce que la page contient réellement.
  const lang = etat.lang;
  const t = TEXTES_VITRINE[lang];
  const nom = etat.identite.nom;
  const theme = resoudreThemeVitrine(etat.identite.theme);
  const polices = policesVitrine(theme);

  return (
    <div
      // `lang` sur le CONTENEUR et non sur `<html>` : la balise racine est
      // posée par le layout racine, partagée avec dix autres parcours. Un
      // lecteur d'écran ou un traducteur lit l'attribut le plus proche du
      // texte — celui-ci suffit, et il ne fait mentir aucune autre page.
      lang={lang}
      style={variablesThemeVitrine(theme)}
      className="min-h-dvh bg-[var(--vitrine-secondary)] font-[family-name:var(--vitrine-texte)] text-[var(--vitrine-sur-secondary)]"
    >
      {polices.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <SkipLink />

      <main id="contenu" tabIndex={-1} className="outline-none">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-8">
          <SelecteurLangue
            slug={etat.slug}
            lang={lang}
            propose={etat.selecteurLangues}
          />

          <EnTeteVitrine nom={nom} logoUrl={etat.identite.logo_url} />

          {theme.blocs.map((bloc) => {
            switch (bloc) {
              case "accroche":
                return etat.identite.accroche ? (
                  <p
                    key={bloc}
                    className="mb-8 text-center text-lg leading-relaxed text-[var(--vitrine-sur-secondary)]/80"
                  >
                    {etat.identite.accroche}
                  </p>
                ) : null;
              case "histoire":
                return etat.identite.histoire ? (
                  <BlocTexte
                    key={bloc}
                    titre={t.histoire}
                    texte={etat.identite.histoire}
                  />
                ) : null;
              case "horaires":
                return etat.identite.horaires_texte ? (
                  <BlocTexte
                    key={bloc}
                    titre={t.horaires}
                    texte={etat.identite.horaires_texte}
                  />
                ) : null;
              case "cartes":
                return (
                  <div key={bloc} className="mb-10">
                    <CatalogueVitrine
                      cartes={etat.cartes}
                      styleCartes={theme.styleCartes}
                      lang={lang}
                    />
                  </div>
                );
              case "social":
                return (
                  <BlocLiens
                    key={bloc}
                    liens={etat.liens}
                    theme={theme}
                    titre={t.liens}
                    avisGoogle={t.avisGoogle}
                  />
                );
              default:
                return null;
            }
          })}

          <footer className="mt-10 text-center text-xs text-[var(--vitrine-sur-secondary)]/60">
            {t.proposeePar(nom)}{" "}
            <Link
              href="/?utm_source=vitrine&utm_medium=footer"
              className="font-semibold underline underline-offset-2"
            >
              {t.propulsePar}
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}

/**
 * LE PASSAGE D'UNE LANGUE À L'AUTRE — deux liens, aucun état.
 *
 * ── IL N'APPARAÎT PAS TOUJOURS, ET C'EST LE POINT ──
 *
 * Sur la page FRANÇAISE, il ne s'affiche que si `selecteurLangues` est vrai —
 * le seuil de couverture (95 %) est calculé côté bibliothèque, jamais ici.
 * Offrir « English » sur une carte traduite à moitié envoie le visiteur
 * étranger sur une page où un plat sur deux est resté en français : c'est pire
 * que ne rien offrir, parce qu'il a fait la démarche.
 *
 * Sur la page ANGLAISE, le retour au français s'affiche TOUJOURS, quelle que
 * soit la couverture. Un visiteur déjà arrivé là — par un lien partagé, un
 * favori, un QR imprimé en anglais — doit toujours pouvoir en sortir ; une
 * porte d'entrée conditionnelle est un choix produit, une porte de sortie
 * conditionnelle est un piège.
 *
 * ── DE VRAIS `<a href>`, ET PAS UN SÉLECTEUR ──
 *
 * Chaque langue EST une adresse. Un lien se partage, s'ouvre dans un onglet, se
 * met en favori et fonctionne sans JavaScript ; un `<select>` avec un
 * `onChange` n'a rien de tout cela et aurait fait de ce bloc le second composant
 * client de la page.
 *
 * `hrefLang` : le lien dit la langue de sa CIBLE, ce qui évite qu'un lecteur
 * d'écran français prononce « English » à la française.
 */
function SelecteurLangue({
  slug,
  lang,
  propose,
}: {
  slug: string;
  lang: LangueVitrine;
  /** `langCoverage` a franchi le seuil — décidé par `@/lib/vitrine`. */
  propose: boolean;
}) {
  const autre: LangueVitrine = lang === "en" ? "fr" : "en";
  if (lang === "fr" && !propose) return null;

  return (
    // Un `<div>` et non un `<nav>` : un lien unique n'est pas une navigation,
    // et un point de repère de plus à parcourir au lecteur d'écran pour un seul
    // lien coûte plus qu'il ne rend.
    <div className="mb-4 flex justify-end">
      <a
        href={cheminVitrineLangue(slug, autre)}
        hrefLang={autre}
        lang={autre}
        // `min-h-11` : cible tactile d'au moins 44 px — c'est un téléphone tenu
        // d'une main, et ce lien est en haut à droite, là où le pouce est le
        // moins précis.
        className="inline-flex min-h-11 items-center rounded-full border border-[var(--vitrine-primary)]/30 px-3 text-sm font-semibold text-[var(--vitrine-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
      >
        {TEXTES_VITRINE[autre].nomLangue}
      </a>
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
 * « Instagram » et « TikTok » sont des NOMS PROPRES et ne se traduisent pas.
 * « Avis Google » n'en est pas un : c'est une description de destination, et
 * elle suit la langue de la page.
 *
 * La base rend `''` pour un lien non renseigné et non `null` — « c'est l'écran
 * qui décide de ne rien afficher ». Le filtre est donc ici, sur la chaîne vide
 * comme sur `null`.
 */
function BlocLiens({
  liens,
  theme,
  titre,
  avisGoogle,
}: {
  liens: VitrineLiensView;
  theme: VitrineThemeResolu;
  titre: string;
  avisGoogle: string;
}) {
  const entrees = [
    { href: liens.instagram_url, label: "Instagram" },
    { href: liens.tiktok_url, label: "TikTok" },
    { href: liens.google_review_url, label: avisGoogle },
  ].filter((e): e is { href: string; label: string } => Boolean(e.href?.trim()));

  if (entrees.length === 0) return null;

  return (
    <section className="mb-10" aria-labelledby="vitrine-liens">
      <h2
        id="vitrine-liens"
        className="mb-3 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]"
      >
        {titre}
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
