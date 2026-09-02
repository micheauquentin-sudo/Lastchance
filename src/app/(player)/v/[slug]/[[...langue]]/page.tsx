import { cache } from "react";
import { APP_URL } from "@/lib/env";
import {
  donneesStructureesVitrine,
  etatIndexation,
} from "@/lib/vitrine-indexation";
import { Boussole } from "@/components/vitrine/boussole";
import { MesureVitrine } from "@/components/vitrine/mesure-vitrine";
import {
  actionOuverte,
  ANCRE_EXPERIENCES,
  ANCRE_RESERVER,
} from "@/lib/vitrine-action";
import { boussoleUtilisable } from "@/lib/vitrine-boussole";
import { VITRINE_ACTIONS, type ActionVitrine } from "@/lib/vitrine";
// LES TROIS AIDES DE PHOTO SONT PARTIES AVEC L'EN-TÊTE : la couverture est
// rendue par `HeroVitrine` (VIT-13). Seule `urlPhotoVitrine` reste ici, pour
// l'image des données structurées.
import { urlPhotoVitrine } from "@/lib/vitrine-photo";
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
import {
  BlocExperiences,
  BlocReserver,
} from "@/components/vitrine/portes";
import { TEXTES_VITRINE, textesVitrine } from "@/components/vitrine/langue";
import { HeroVitrine } from "@/components/vitrine/hero-vitrine";
import { BarreBasseVitrine } from "@/components/vitrine/barre-basse";
import {
  policesVitrine,
  resoudreThemeVitrine,
  variablesThemeVitrine,
  type VitrineThemeResolu,
} from "@/components/vitrine/theme";
import { SkipLink } from "@/components/ui/skip-link";
import { PageOpenBeacon } from "@/components/page-open-beacon";

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

/**
 * SANS CET EXPORT, TOUT CE QUI PRÉCÈDE EST FAUX. Dans Next 16, une route
 * paramétrée n'entre au manifeste de prérendu — donc au cache ISR — que si
 * `generateStaticParams` existe, même vide : `revalidate` seul est inerte et
 * la page retombe en rendu par requête, silencieusement. Motif identique à
 * `play/[slug]/page.tsx` : liste vide, chaque adresse est générée à la
 * première visite puis servie depuis le cache. La preuve n'est pas dans ce
 * fichier mais dans l'artefact : `.next/prerender-manifest.json` doit lister
 * cette route dans `dynamicRoutes` (finding ÉLEVÉ de la revue L11).
 */
export function generateStaticParams(): Array<{
  slug: string;
  langue?: string[];
}> {
  return [];
}

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
  // VIT-12 : trois conditions, et l'accord du commerçant en est une.
  const indexation = etatIndexation({
    published: true,
    indexable: etat.identite.indexable,
    accroche: etat.identite.accroche,
    cartes: etat.cartes,
  });
  const adresse = `${APP_URL}${cheminVitrineLangue(etat.slug, etat.lang)}`;
  const description =
    etat.identite.accroche ?? `Découvrez ${nom} et ce que le lieu propose.`;

  return {
    title: nom,
    description,
    /**
     * VIT-12 — L'INDEXATION EST DÉSORMAIS POSSIBLE, ET RESTE UN CHOIX.
     *
     * Le `false` d'origine disait : « l'indexation est une décision de commerce
     * et non d'ingénierie — elle se prendra pour de bon, avec un plan de site
     * et des adresses canoniques ». C'est fait, et la décision revient au
     * commerçant : `etatIndexation` exige sa case cochée EN PLUS de la
     * publication et d'une carte qui vaut d'être trouvée.
     *
     * `follow` reste vrai dans les deux cas : même non indexée, une page a
     * intérêt à ce que ses liens internes soient suivis — c'est ainsi qu'une
     * vitrine indexée fait découvrir sa version anglaise.
     */
    robots: { index: indexation.indexee, follow: true },
    // LA CARTE D'APERÇU, dans les deux cas : elle sert un partage sur un
    // téléphone autant qu'un résultat de recherche, et un lien collé dans une
    // conversation n'attend pas l'accord d'indexation pour être lisible.
    openGraph: {
      type: "website",
      title: nom,
      description,
      url: adresse,
      locale: etat.lang === "en" ? "en_US" : "fr_FR",
    },
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
  const nom = etat.identite.nom;
  // LE SECTEUR CHOISIT LES MOTS ET LE PRÉRÉGLAGE DE PALETTE (VIT-13), jamais la
  // mise en page : les sept métiers rendent le même écran.
  const secteur = etat.identite.secteur;
  const t = textesVitrine(lang, secteur);
  const theme = resoudreThemeVitrine(etat.identite.theme, secteur);
  const allure = theme.allure;
  const polices = policesVitrine(theme);

  // VIT-10 — TOUTES LES FICHES, À PLAT. La Boussole ne connaît ni carte ni
  // rubrique : elle filtre des plats. Aplatir ici plutôt que dans le composant
  // garde ce dernier pur, donc testable sans construire un catalogue entier.
  const toutesLesFiches = etat.cartes.flatMap((carte) =>
    carte.categories.flatMap((rubrique) => rubrique.fiches),
  );
  const boussoleOuverte = boussoleUtilisable(toutesLesFiches);

  // VIT-12 — LES DONNÉES STRUCTURÉES NE SORTENT QUE SI LA PAGE EST INDEXÉE.
  // Les servir sur une page `noindex` ne tromperait personne, mais décrirait à
  // un moteur un lieu qu'on lui demande d'ignorer — deux instructions
  // contraires dans le même document.
  const indexation = etatIndexation({
    published: true,
    indexable: etat.identite.indexable,
    accroche: etat.identite.accroche,
    cartes: etat.cartes,
  });
  // L'INTERSECTION, EN UN SEUL ENDROIT : ce que la fiche demande croisé avec
  // ce que la base publie. Le RÉSULTAT descend, pas le prédicat — le catalogue
  // est un composant client, et une fonction ne traverse pas cette frontière.
  // Six valeurs au plus : le tableau coûte moins que le commentaire.
  const portesOuvertes: ActionVitrine[] = VITRINE_ACTIONS.filter((action) =>
    actionOuverte(action, etat.portes, boussoleOuverte),
  );

  /**
   * CE QUE LE HERO ET L'ONGLET « NOTRE HISTOIRE » REPRENNENT AUX BLOCS (VIT-13).
   *
   * ── L'ORDRE DES BLOCS RESTE JUGE DE L'EXISTENCE ──
   *
   * Un commerçant qui avait retiré `histoire` de `ordre_blocs` l'avait MASQUÉE.
   * Elle ne doit pas réapparaître en onglet parce qu'on a changé de mise en
   * page : `theme.blocs.includes(…)` est donc consulté avant de remonter quoi
   * que ce soit. Le réglage garde exactement le sens qu'il avait.
   *
   * ── ET IL FAUT UN ENDROIT OÙ LES METTRE ──
   *
   * L'onglet n'existe que s'il y a un catalogue pour le porter. Sans le bloc
   * `cartes`, `CatalogueVitrine` ne rend rien, et remonter l'histoire dedans
   * l'aurait fait DISPARAÎTRE de la page — la seule façon de perdre un contenu
   * dans ce lot. Les deux blocs retombent alors à leur place d'origine, en
   * paragraphes qui défilent.
   */
  const catalogueVisible = theme.blocs.includes("cartes");
  const accrocheHero = theme.blocs.includes("accroche")
    ? etat.identite.accroche
    : null;
  const histoireOnglet =
    catalogueVisible && theme.blocs.includes("histoire")
      ? etat.identite.histoire
      : null;
  const horairesOnglet =
    catalogueVisible && theme.blocs.includes("horaires")
      ? etat.identite.horaires_texte
      : null;

  /**
   * Les liens vivent dans la CARTE D'INFOS du hero, sauf si elle est masquée —
   * auquel cas ils redescendent dans « Nous suivre », comme avant. Masquer un
   * réglage de mise en page ne doit jamais faire disparaître une adresse.
   */
  const liensDansLeBloc = allure.carteInfos === "masquee";
  const ANCRE_PIED = "vitrine-pied";

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
      {/* LE MOTIF DE FOND — un dégradé répété, zéro requête et zéro octet
          transféré. Il est posé sur la COLONNE plus bas, pas ici : sur un
          écran large, une trame courant jusqu'aux bords ferait ressembler la
          page à un fond d'écran plutôt qu'à une carte posée sur une table. */}
      {polices.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <SkipLink />

      {/* LE COMPTAGE EST CLIENT, ET C'EST LA CONSÉQUENCE DIRECTE DE `revalidate`.
          Cette page est servie depuis le cache ISR : le rendu serveur n'a lieu
          qu'une fois par minute au plus, donc compter là aurait rendu « 1
          ouverture par minute quel que soit le trafic ». Le beacon part du
          navigateur, à chaque chargement réel — rechargement, retour arrière et
          lien partagé compris. Il n'introduit AUCUNE lecture de `headers()` ni
          de `cookies()` côté serveur : l'invariant de cache posé en tête de ce
          fichier tient.

          L'identifiant public est le SLUG, jamais `vitrine_settings.id` : ce
          qui part d'ici est recopié en clair dans le payload RSC, et le slug
          est déjà dans l'adresse. C'est `/api/page-opens` qui le traduit en
          `resource_id` pour le compteur que lit le dashboard. */}
      {indexation.indexee ? (
        // `dangerouslySetInnerHTML` est la seule façon d'émettre un
        // `application/ld+json` : React échapperait le contenu d'un enfant
        // texte, et un moteur lirait alors du JSON invalide. Ce qui entre ici
        // vient de `JSON.stringify`, donc d'un document dont chaque chaîne est
        // déjà échappée — aucune valeur du commerçant n'y arrive brute.
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              donneesStructureesVitrine({
                nom,
                accroche: etat.identite.accroche,
                url: `${APP_URL}${cheminVitrineLangue(etat.slug, etat.lang)}`,
                image: urlPhotoVitrine(etat.identite.cover_path),
              }),
            ),
          }}
        />
      ) : null}

      <MesureVitrine slug={etat.slug} langue={lang} />
      <PageOpenBeacon module="vitrine" publicId={etat.slug} />

      <main id="contenu" tabIndex={-1} className="outline-none">
        {/*
          UNE COLONNE DE 480 px, ET NON 672.
          C'est la largeur d'un téléphone tenu d'une main, qui est l'ÉCRAN DE
          RÉFÉRENCE de cette page : elle est ouverte à table, jamais sur un
          bureau. Plus large, les fiches à photo latérale s'étirent et le filet
          des prix traverse un vide ; l'ombre portée de la colonne dit que c'est
          une carte posée, pas un site qui n'a pas su remplir l'écran.

          `overflow-x-hidden` : le hero et l'en-tête collant débordent
          volontairement de la gouttière (`-mx-3`) pour aller au bord de la
          colonne. Sans cette coupe, ce débord ferait défiler la page
          horizontalement d'une poignée de pixels — le défaut le plus signalé
          et le plus difficile à voir en revue.
        */}
        <div
          style={{ backgroundImage: "var(--vitrine-motif)" }}
          className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-[var(--vitrine-secondary)] shadow-[0_0_40px_rgba(0,0,0,0.06)]"
        >
          {/* VIT-31c — `horaires`, `timezone` et `lang` sont ce qui fait
              « Ouvert · ferme à 23h ». `horaires` vaut `null` sur toute vitrine
              antérieure à ce lot : le hero rend alors la pastille écrite à la
              main, au serveur, exactement comme avant. */}
          <HeroVitrine
            nom={nom}
            logoUrl={etat.identite.logo_url}
            couverture={etat.identite.cover_path}
            couvertureAlt={etat.identite.cover_alt}
            accroche={accrocheHero}
            badgeOuverture={etat.identite.badge_ouverture}
            horaires={etat.identite.horaires}
            timezone={etat.identite.timezone}
            lang={lang}
            allure={allure}
            liens={etat.liens}
            avisGoogle={t.avisGoogle}
            selecteurLangue={
              <SelecteurLangue
                slug={etat.slug}
                lang={lang}
                propose={etat.selecteurLangues}
              />
            }
          />

          <div className="flex-1 px-3">
          {theme.blocs.map((bloc) => {
            switch (bloc) {
              // L'ACCROCHE EST DANS LE HERO (VIT-13) — en sous-titre sous le
              // nom, comme la maquette. La rendre ici EN PLUS l'aurait fait
              // lire deux fois à trois centimètres d'intervalle.
              case "accroche":
                return null;
              // HISTOIRE ET HORAIRES SONT DANS L'ONGLET, sauf s'il n'y a pas
              // de catalogue pour le porter — voir `histoireOnglet` plus haut.
              case "histoire":
                return histoireOnglet === null && etat.identite.histoire ? (
                  <BlocTexte
                    key={bloc}
                    titre={t.histoire}
                    texte={etat.identite.histoire}
                  />
                ) : null;
              case "horaires":
                return horairesOnglet === null && etat.identite.horaires_texte ? (
                  <BlocTexte
                    key={bloc}
                    titre={t.horaires}
                    texte={etat.identite.horaires_texte}
                  />
                ) : null;
              case "cartes":
                return (
                  <div key={bloc} className="mb-10">
                    {/* LA BOUSSOLE AU-DESSUS DE LA CARTE, et seulement si
                        au moins une fiche est étiquetée : ouvrir une porte qui
                        rend une liste vide à chaque question serait pire que
                        ne pas l'ouvrir. */}
                    {boussoleOuverte ? (
                      <div className="mb-6">
                        <Boussole fiches={toutesLesFiches} />
                      </div>
                    ) : null}
                    <CatalogueVitrine
                      cartes={etat.cartes}
                      styleCartes={theme.styleCartes}
                      lang={lang}
                      secteur={secteur}
                      allure={allure}
                      slug={etat.slug}
                      portesOuvertes={portesOuvertes}
                      histoire={histoireOnglet}
                      horaires={horairesOnglet}
                    />
                  </div>
                );
              // ── LES PORTES DES MODULES (VIT-3 / L13) ──────────────
              //
              // Les deux blocs se MASQUENT EUX-MÊMES quand leurs listes sont
              // vides — la base rend les six listes toujours, « elle ne met pas
              // en page ». Rien n'est donc testé ici : la décision d'affichage
              // vit dans le composant, à un seul endroit, et l'ordre des blocs
              // reste une simple permutation.
              case "reserver":
                return (
                  // L'ANCRE EST POSÉE ICI, PAS DANS LE BLOC : elle sert les
                  // portes de fiches (VIT-10), et le bloc n'a pas à savoir
                  // qu'on lui écrit depuis la carte.
                  <div key={bloc} id={ANCRE_RESERVER} className="scroll-mt-4">
                    <BlocReserver portes={etat.portes.reserver} lang={lang} />
                  </div>
                );
              case "experiences":
                return (
                  <div key={bloc} id={ANCRE_EXPERIENCES} className="scroll-mt-4">
                  <BlocExperiences
                    portes={etat.portes.experiences}
                    // VIT-16 : ce que le commerçant a coché. Le choix
                    // RETIRE, il n'ajoute jamais — `portes` reste seul
                    // juge de ce qui est jouable.
                    jeux={theme.jeux}
                    // LE SLUG SERVI, pas celui de l'adresse : la porte du Duo
                    // Miroir mène à `/lobby/nouveau/{slug}`, et c'est la base
                    // qui dit sous quel slug cette vitrine existe.
                    slug={etat.slug}
                    lang={lang}
                  />
                  </div>
                );
              // ── LE BLOC « SOCIAL » EN PORTE DEUX (VIT-4) ──────────
              //
              // « À la une » et « Nous suivre » vivent sous le MÊME bloc
              // ordonnable, et non sous deux : `ordre_blocs` est une
              // permutation de `VITRINE_BLOCS`, une liste fermée, et y ajouter
              // une valeur aurait périmé l'ordre enregistré par chaque
              // commerçant depuis L10. Ce sont deux `<section>` distinctes —
              // chacune se masque seule quand elle n'a rien à dire — mais une
              // seule place dans l'ordre.
              case "social":
                return (
                  <div key={bloc}>
                    <BlocContenus
                      contenus={etat.contenus}
                      theme={theme}
                      titre={t.contenus}
                    />
                    {/* LES LIENS SONT REMONTÉS DANS LA CARTE D'INFOS DU HERO
                        (VIT-13) — ils ne redescendent ici que si le commerçant
                        a masqué cette carte. Un réglage de mise en page ne doit
                        jamais faire disparaître une adresse. */}
                    {liensDansLeBloc ? (
                      <BlocLiens
                        liens={etat.liens}
                        theme={theme}
                        titre={t.liens}
                        avisGoogle={t.avisGoogle}
                      />
                    ) : null}
                  </div>
                );
              default:
                return null;
            }
          })}

          <footer
            id={ANCRE_PIED}
            className="scroll-mt-4 pb-6 pt-10 text-center text-xs text-[var(--vitrine-sur-secondary)]/60"
          >
            {t.proposeePar(nom)}{" "}
            <Link
              href="/?utm_source=vitrine&utm_medium=footer"
              className="font-semibold underline underline-offset-2"
            >
              {t.propulsePar}
            </Link>
          </footer>
          </div>

          {/* LA BARRE BASSE — `sticky`, donc DANS le flux : une barre `fixed`
              se superposerait au dernier plat de la carte, que plus rien ne
              pourrait alors faire défiler au-dessus d'elle. */}
          {allure.barreBasse !== "masquee" ? (
            <BarreBasseVitrine
              slug={etat.slug}
              lang={lang}
              secteur={secteur}
              allure={allure}
              ancrePied={ANCRE_PIED}
            />
          ) : null}
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
 * LES CONTENUS MIS EN AVANT (VIT-4) — un à trois liens choisis à la main.
 *
 * ── AUCUNE VIGNETTE, AUCUN OAUTH, ET C'EST LE CAHIER ──
 *
 * Ce bloc rend un TITRE et une ADRESSE, saisis par le commerçant. Pas
 * d'aperçu de la vidéo, pas de miniature récupérée chez la plateforme, pas de
 * jeton par commerce : une vignette distante ferait de la page la plus légère
 * du dépôt — un téléphone, en salle, sur un réseau de comptoir — une page qui
 * attend trois hôtes tiers, et un jeton OAuth par commerce serait une panne
 * silencieuse le jour où il expire. Hors-lot acté, et il l'est ici en toutes
 * lettres pour que ce ne soit pas relu comme un oubli.
 *
 * ── LA REVALIDATION EST FAITE, ET ON NE LA REFAIT PAS ──
 *
 * `url` est refusé par la base hors `^https://[^[:space:]]+$` (check de
 * `vitrine_contenus`) ET revalidé à la lecture côté bibliothèque, motif
 * `asLienSortant` : la liste qui arrive ici ne porte que des `https`. Le seul
 * reste de prudence est `rel="noopener noreferrer"`, qui vaut pour la fenêtre
 * ouverte et non pour le schéma.
 *
 * Rien si vide — comme les portes et les liens : la base rend `[]` et c'est
 * l'écran qui décide de ne rien mettre en page.
 */
function BlocContenus({
  contenus,
  theme,
  titre,
}: {
  contenus: readonly { titre: string; url: string; rang: number }[];
  theme: VitrineThemeResolu;
  titre: string;
}) {
  if (contenus.length === 0) return null;

  return (
    <section className="mb-10" aria-labelledby="vitrine-contenus">
      <h2
        id="vitrine-contenus"
        className="mb-3 font-[family-name:var(--vitrine-titre)] text-lg font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]"
      >
        {titre}
      </h2>
      {/* UNE COLONNE, ET PAS UNE GRILLE. Trois cartes au plus, sur un écran
          de téléphone tenu d'une main : une grille à deux colonnes les
          réduirait à des vignettes de texte tronqué pour gagner une hauteur
          qu'un pouce parcourt en un geste. */}
      <ul className="flex flex-col gap-2">
        {contenus.map((contenu) => (
          <li key={contenu.rang}>
            <a
              href={contenu.url}
              target="_blank"
              rel="noopener noreferrer"
              // `min-h-11` : cible tactile d'au moins 44 px, comme les liens
              // et le sélecteur de langue.
              className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]"
              style={{ borderColor: theme.primary, color: theme.primary }}
            >
              <span className="min-w-0">{contenu.titre}</span>
              {/* La flèche dit « on sort du site » et est PUREMENT décorative :
                  le lien a déjà son texte, et la faire lire ferait entendre
                  « lien externe » après chaque titre. */}
              <span aria-hidden className="shrink-0">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
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
