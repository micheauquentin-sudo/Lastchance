"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";
import type {
  ActionVitrine,
  LangueVitrine,
  SecteurVitrine,
  StyleCartesVitrine,
  VitrineCarteView,
} from "@/lib/vitrine";
import { PorteVitrine } from "@/components/vitrine/porte-vitrine";
import { FicheVitrine } from "@/components/vitrine/fiche-vitrine";
import { textesVitrine } from "@/components/vitrine/langue";
import { useFavoris } from "@/components/vitrine/favoris";
import type { AllureResolue } from "@/components/vitrine/theme";

/**
 * LE CATALOGUE PUBLIC — onglets, cartes, rubriques, fiches.
 *
 * ── POURQUOI C'EST LE SEUL BLOC CLIENT DE LA PAGE ──
 *
 * L'identité, les liens et les portes sont du texte : ils sont rendus par le
 * serveur et ne coûtent rien au téléphone du client attablé. Cinq choses
 * seulement ont besoin d'état — l'onglet, la rubrique filtrée, la recherche, le
 * défilement vers une ancre, les favoris — et elles vivent ici, dans un
 * composant unique. En découper cinq aurait fait remonter l'état dans un
 * sixième.
 *
 * ── « NOTRE HISTOIRE » EST UN ONGLET, PLUS UN BLOC QUI DÉFILE (VIT-13) ──
 *
 * C'est la structure de la maquette de référence : l'histoire et les horaires
 * du lieu sont un ONGLET, à gauche des cartes, et non deux paragraphes sous
 * une carte de soixante plats que personne ne fait défiler jusqu'au bout.
 *
 * Rien n'est perdu au passage : `ordre_blocs` continue de dire si ces deux
 * blocs existent, et la page ne les remonte ici que s'ils y sont. Un commerçant
 * qui avait masqué son histoire ne la voit pas réapparaître en onglet.
 *
 * ── LES ONGLETS N'APPARAISSENT QU'À PARTIR DE DEUX ──
 *
 * Un onglet unique n'est pas une navigation, c'est un titre déguisé en bouton :
 * il fait chercher où sont les autres. Le commerçant qui n'a qu'une carte et
 * pas d'histoire obtient donc la carte, directement.
 *
 * Ce sont des BOUTONS `aria-pressed` et non un `role="tablist"` : un vrai motif
 * d'onglets impose la navigation par flèches et un `tabpanel` par onglet, pour
 * un contenu qui est ici une simple liste filtrée. `aria-pressed` dit
 * exactement ce qui se passe — « Carte du midi, activé » — sans promettre un
 * clavier qu'on n'implémente pas.
 *
 * ── LES CHIPS FILTRENT, ET « TOUT » EST LE DÉFAUT ──
 *
 * La maquette ouvre sur la PREMIÈRE rubrique. On ouvre sur TOUTES, et le
 * bouton « tout » (⌂) est actif à l'arrivée : une carte de restaurant se lit
 * d'abord en entier, et n'en montrer qu'un septième à l'ouverture ferait croire
 * à une carte vide chez un commerçant qui n'a que trois plats par rubrique.
 * L'écran est le même — mêmes chips, mêmes cartes — seul le nombre de sections
 * rendues à l'arrivée diffère.
 *
 * ── LA RECHERCHE EST LOCALE, ET C'EST TOUT CE QU'ELLE DOIT ÊTRE ──
 *
 * Elle porte sur la carte AFFICHÉE — pas sur toutes : chercher « vin » dans la
 * carte du midi et recevoir des résultats de la carte des vins ferait basculer
 * d'onglet sans qu'on l'ait demandé. Accents ignorés : personne ne tape « crème
 * brûlée » avec ses deux accents sur un clavier de téléphone. Une recherche en
 * cours ROUVRE toutes les rubriques : filtrer deux fois (par rubrique et par
 * mot) ferait répondre « aucun résultat » sur un plat qui existe deux rubriques
 * plus bas.
 */

/** L'onglet de l'histoire — un identifiant qui ne peut collider avec un uuid. */
const ONGLET_HISTOIRE = "histoire";

export function CatalogueVitrine({
  cartes,
  styleCartes,
  lang,
  secteur,
  allure,
  slug,
  portesOuvertes,
  histoire,
  horaires,
}: {
  /** Cartes ACTIVES, déjà ordonnées par le serveur. */
  cartes: VitrineCarteView[];
  styleCartes: StyleCartesVitrine;
  /**
   * La langue RÉELLEMENT SERVIE. Les noms de cartes, de rubriques et de fiches
   * arrivent déjà traduits par le SQL — cette prop ne pilote que le chrome de
   * l'écran (libellé de recherche, compte de résultats, états vides).
   */
  lang: LangueVitrine;
  /** Le métier — il choisit les mots, jamais la mise en page. */
  secteur: SecteurVitrine;
  allure: AllureResolue;
  /** La clé des favoris : ils ne traversent pas d'une vitrine à l'autre. */
  slug: string;
  /**
   * VIT-10 : les portes qui ont vraiment quelque chose derrière.
   *
   * UN TABLEAU, ET SURTOUT PAS UN PRÉDICAT. Ce composant est un composant
   * CLIENT : une fonction ne traverse pas la frontière serveur → client, et
   * Next répond 500 sur la page publique entière. La première version passait
   * bel et bien `(action) => boolean`, avec un commentaire expliquant que
   * c'était plus économique — ça l'était, ce n'était simplement pas possible.
   *
   * Six valeurs au plus, sérialisables : le coût est nul, la frontière tient.
   */
  portesOuvertes: readonly ActionVitrine[];
  /**
   * Le texte de l'onglet « Notre histoire », ou `null` quand le bloc est
   * masqué ou vide. La PAGE décide — elle seule lit `ordre_blocs`.
   */
  histoire: string | null;
  horaires: string | null;
}) {
  const t = textesVitrine(lang, secteur);
  const rechercheId = useId();
  const favoris = useFavoris(slug);

  const ongletHistoire = Boolean(histoire ?? horaires);

  /**
   * `null` tant que le visiteur n'a rien choisi — ce n'est PAS « la première
   * carte ». La distinction porte l'ancre : un choix explicite doit primer sur
   * le fragment, et le fragment sur le défaut.
   */
  const [ongletChoisi, setOngletChoisi] = useState<string | null>(null);
  /** `null` = toutes les rubriques. Voir l'en-tête sur le défaut. */
  const [rubriqueChoisie, setRubriqueChoisie] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const conteneurRef = useRef<HTMLDivElement>(null);

  /**
   * L'ANCRE D'OUVERTURE — ce qui fait qu'un QR contextuel ouvre la bonne carte.
   *
   * ── POURQUOI UN FRAGMENT ET PAS UN `searchParams` ──
   *
   * `/v/{slug}` est en ISR (`revalidate = 60`). Lire un `?carte=…` ferait
   * retomber la page en rendu par requête et supprimerait le cache — une
   * lecture de base par scan, sur une adresse publique balayable. Un fragment,
   * lui, N'EST JAMAIS ENVOYÉ AU SERVEUR : tous les QR imprimés — porte, tables,
   * chevalets — pointent sur la même url mise en cache, et le contexte se
   * résout ici, dans le navigateur.
   *
   * ── `useSyncExternalStore` ET NON UN EFFET QUI POSE UN ÉTAT ──
   *
   * L'URL est un système EXTERNE à React. La lire dans un `useState` initial
   * donnerait un rendu client différent du HTML servi (erreur d'hydratation) ;
   * la lire dans un effet qui appelle `setState` déclenche le rendu en cascade
   * que `react-hooks/set-state-in-effect` interdit — à raison. Ce hook existe
   * exactement pour ce cas : instantané serveur vide, instantané client réel,
   * et l'abonnement à `hashchange` fait suivre un second QR scanné sans quitter
   * la page.
   */
  const fragment = useSyncExternalStore(
    sAbonnerAuFragment,
    lireFragment,
    () => "",
  );
  const ancre = decoderFragment(fragment);

  const carteVisee = useMemo(() => {
    if (ancre.startsWith("carte-")) {
      const id = ancre.slice("carte-".length);
      return cartes.find((c) => c.id === id) ?? null;
    }
    if (ancre.startsWith("fiche-")) {
      const id = ancre.slice("fiche-".length);
      return (
        cartes.find((c) =>
          c.categories.some((r) => r.fiches.some((f) => f.id === id)),
        ) ?? null
      );
    }
    return null;
  }, [ancre, cartes]);

  const carte =
    cartes.find((c) => c.id === ongletChoisi) ??
    carteVisee ??
    cartes[0] ??
    null;

  /**
   * L'histoire n'est ouverte que si le visiteur l'a DEMANDÉE. À l'arrivée, et
   * quand un QR vise une fiche, c'est la carte qui s'ouvre : le client qui
   * scanne à table veut la carte, pas la biographie du lieu.
   */
  const surHistoire = ongletHistoire && ongletChoisi === ONGLET_HISTOIRE;

  /**
   * Un QR qui vise UNE FICHE rouvre toutes les rubriques.
   *
   * Sans cela, la fiche visée serait filtrée hors du DOM par la rubrique
   * choisie, `getElementById` rendrait `null`, et le scan n'ouvrirait rien —
   * une panne silencieuse sur un chevalet déjà imprimé.
   */
  const viseUneFiche = ancre.startsWith("fiche-");
  const rechercheActive = recherche.trim().length > 0;
  const toutesRubriques =
    rubriqueChoisie === null || rechercheActive || viseUneFiche;

  const rubriques = useMemo(() => {
    if (!carte) return [];
    const terme = normaliser(recherche);
    return carte.categories
      .filter((r) => toutesRubriques || r.id === rubriqueChoisie)
      .map((rubrique) =>
        terme
          ? {
              ...rubrique,
              fiches: rubrique.fiches.filter((fiche) =>
                `${normaliser(fiche.nom)} ${normaliser(fiche.description ?? "")}`.includes(
                  terme,
                ),
              ),
            }
          : rubrique,
      )
      .filter((rubrique) => rubrique.fiches.length > 0);
  }, [carte, recherche, rubriqueChoisie, toutesRubriques]);

  const trouvees = rubriques.reduce((n, r) => n + r.fiches.length, 0);

  /**
   * LE DÉFILEMENT, une fois la bonne carte rendue.
   *
   * Le navigateur ne peut pas le faire seul : à l'ouverture, la fiche visée
   * n'est dans le DOM que si sa carte est active, ce qui vient d'être décidé
   * ci-dessus. Cet effet ne pose AUCUN état — il ne fait que pousser vers un
   * système externe (le défilement), ce qui est le rôle d'un effet.
   */
  const carteRendueId = carte?.id;
  useEffect(() => {
    if (!ancre) return;
    document.getElementById(ancre)?.scrollIntoView({ block: "start" });
  }, [ancre, carteRendueId]);

  const changerDOnglet = useCallback((id: string) => {
    setOngletChoisi(id);
    // La recherche et la rubrique NE SURVIVENT PAS au changement d'onglet : un
    // filtre invisible parce qu'on regarde ailleurs fait croire que la carte
    // est vide.
    setRecherche("");
    setRubriqueChoisie(null);
    conteneurRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!carte && !ongletHistoire) return null;

  const onglets = [
    ...(ongletHistoire
      ? [{ id: ONGLET_HISTOIRE, nom: t.histoire, actif: surHistoire }]
      : []),
    ...cartes.map((c) => ({
      id: c.id,
      nom: c.nom,
      actif: !surHistoire && c.id === carte?.id,
    })),
  ];

  return (
    // `id="carte-{id}"` sur le conteneur de la carte AFFICHÉE : l'ancre d'un QR
    // contextuel ne vaut que pour la carte ouverte, et l'effet ci-dessus l'a
    // justement ouverte avant que le défilement ne cherche l'élément.
    <div ref={conteneurRef} id={carte ? `carte-${carte.id}` : undefined} className="scroll-mt-4">
      {/* L'EN-TÊTE COLLANT — onglets, recherche et rubriques restent sous le
          pouce pendant qu'une carte de soixante plats défile. `--vitrine-collant`
          vaut `static` quand le commerçant l'a éteint : le réglage ne masque
          rien, il décide seulement si l'en-tête suit. */}
      <div
        style={{ position: "var(--vitrine-collant)" as never }}
        className="top-0 z-10 -mx-3 mb-4 bg-[var(--vitrine-carte-fond)] px-3 pb-2.5 pt-3 shadow-[0_6px_18px_rgba(0,0,0,0.07)]"
      >
        {onglets.length >= 2 ? (
          <nav aria-label={t.nosCartes}>
            <ul
              className={cn(
                "flex items-end gap-2 border-b border-black/10 pb-0.5",
                // Les onglets « segmentés » se partagent la largeur ; les deux
                // autres styles défilent horizontalement plutôt que de revenir
                // à la ligne — sept onglets sur trois lignes repousseraient le
                // contenu hors de l'écran d'un téléphone.
                allure.styleOnglets === "segmentes"
                  ? "justify-between"
                  : "overflow-x-auto",
              )}
            >
              {onglets.map((o) => (
                <li
                  key={o.id}
                  className={allure.styleOnglets === "segmentes" ? "min-w-0 flex-1" : "shrink-0"}
                >
                  <button
                    type="button"
                    onClick={() => changerDOnglet(o.id)}
                    aria-pressed={o.actif}
                    // VIT-9 : le compteur lit cet attribut au clic. Un
                    // `onClick` supplémentaire aurait fait connaître la mesure
                    // au catalogue, qui n'a rien à en savoir.
                    data-carte-id={o.id === ONGLET_HISTOIRE ? undefined : o.id}
                    className={classesOnglet(allure.styleOnglets, o.actif)}
                  >
                    {o.nom}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {!surHistoire && carte ? (
          <div className="mt-3 flex flex-col gap-2.5">
            {allure.recherche ? (
              <div>
                <label
                  htmlFor={rechercheId}
                  className="mb-1.5 block text-sm font-semibold text-[var(--vitrine-sur-secondary)]"
                >
                  {t.rechercherDans(carte.nom)}
                </label>
                <input
                  id={rechercheId}
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder={t.recherchePlaceholder}
                  // `text-base` et non `text-sm` : sous 16 px, iOS zoome à la
                  // mise au point du champ et le client perd la page qu'il
                  // lisait.
                  className="h-11 w-full rounded-xl border border-[var(--vitrine-accent-30)] bg-white/70 px-4 text-base text-[var(--vitrine-sur-secondary)] placeholder:text-[var(--vitrine-sur-secondary)]/50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--vitrine-primary)]"
                />
                {/* Le compte est annoncé, pas seulement affiché : sans lui, une
                    recherche sans résultat ne se signale par rien à qui n'a pas
                    la liste sous les yeux. */}
                <p
                  aria-live="polite"
                  className="mt-1.5 min-h-5 text-sm text-[var(--vitrine-sur-secondary)]/70"
                >
                  {rechercheActive
                    ? trouvees === 0
                      ? t.aucunResultat
                      : t.compteResultats(trouvees)
                    : ""}
                </p>
              </div>
            ) : null}

            {carte.categories.length >= 2 ? (
              <nav aria-label={t.rubriques}>
                <ul className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                  <li className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setRubriqueChoisie(null)}
                      aria-pressed={toutesRubriques}
                      aria-label={t.rubriques}
                      className={classesChip(allure.styleChips, toutesRubriques)}
                    >
                      <span aria-hidden>⌂</span>
                    </button>
                  </li>
                  {carte.categories.map((rubrique) => (
                    <li key={rubrique.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRubriqueChoisie(rubrique.id);
                          setRecherche("");
                        }}
                        aria-pressed={!toutesRubriques && rubrique.id === rubriqueChoisie}
                        className={classesChip(
                          allure.styleChips,
                          !toutesRubriques && rubrique.id === rubriqueChoisie,
                        )}
                      >
                        {rubrique.nom}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>

      {surHistoire ? (
        <BlocHistoireOnglet
          histoire={histoire}
          horaires={horaires}
          titre={t.histoire}
          titreHoraires={t.horaires}
        />
      ) : !carte || rubriques.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--vitrine-accent-30)] px-4 py-10 text-center text-sm text-[var(--vitrine-sur-secondary)]/70">
          {rechercheActive ? t.aucunPlat : t.carteEnPreparation}
        </p>
      ) : (
        <div className="space-y-6">
          {rubriques.map((rubrique) => (
            <section
              key={rubrique.id}
              id={`rubrique-${rubrique.id}`}
              tabIndex={-1}
              aria-labelledby={`rubrique-titre-${rubrique.id}`}
              className="scroll-mt-4 outline-none"
            >
              <EnTeteRubrique
                id={`rubrique-titre-${rubrique.id}`}
                nom={rubrique.nom}
                compte={
                  allure.compteRubrique
                    ? t.compteResultats(rubrique.fiches.length)
                    : null
                }
                allure={allure}
              />

              {/* LA PORTE DE LA RUBRIQUE (VIT-10) : sous le titre, au-dessus
                  des fiches. Une rubrique entière peut ouvrir une porte que
                  ses plats ne portent pas individuellement — « nos formules »
                  vers Réserver, par exemple. */}
              {rubrique.action ? (
                <div className="mb-3">
                  <PorteVitrine
                    action={rubrique.action}
                    ouverte={portesOuvertes.includes(rubrique.action)}
                  />
                </div>
              ) : null}

              <ul
                className={cn(
                  styleCartes === "grille" ? "grid gap-3 sm:grid-cols-2" : "space-y-3",
                )}
              >
                {rubrique.fiches.map((fiche) => (
                  <li key={fiche.id}>
                    <FicheVitrine
                      fiche={fiche}
                      styleCartes={styleCartes}
                      lang={lang}
                      secteur={secteur}
                      allure={allure}
                      portesOuvertes={portesOuvertes}
                      favori={favoris.ids.has(fiche.id)}
                      onBasculerFavori={allure.favoris ? favoris.basculer : null}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * L'ONGLET « NOTRE HISTOIRE » — le texte du lieu et ses horaires.
 *
 * `whitespace-pre-line` : le commerçant saisit ses horaires ligne par ligne
 * dans un champ multiligne, et les recoller en un seul paragraphe rendrait
 * « Lundi 12h-14h Mardi 12h-14h » — illisible, et faux à la lecture rapide.
 */
function BlocHistoireOnglet({
  histoire,
  horaires,
  titre,
  titreHoraires,
}: {
  histoire: string | null;
  horaires: string | null;
  titre: string;
  titreHoraires: string;
}) {
  return (
    <div
      style={{
        background: "var(--vitrine-carte-fond)",
        borderWidth: "var(--vitrine-carte-bord)",
        boxShadow: "var(--vitrine-carte-ombre)",
        borderRadius: "var(--vitrine-rad)",
      }}
      className="border-solid border-[var(--vitrine-accent-25)] px-[18px] py-5"
    >
      {histoire ? (
        <>
          <h2 className="text-center font-[family-name:var(--vitrine-titre)] text-[17px] font-bold uppercase leading-none tracking-[0.05em] text-[var(--vitrine-primary)]">
            {titre}
          </h2>
          <div
            aria-hidden
            className="mx-auto my-3 h-px w-11 bg-[var(--vitrine-primary)] opacity-50"
          />
          <p
            style={{ fontSize: "calc(12.5px * var(--vitrine-fsx))" }}
            className="whitespace-pre-line text-pretty leading-[1.75] text-[var(--vitrine-sur-secondary)]/90"
          >
            {histoire}
          </p>
        </>
      ) : null}

      {horaires ? (
        <div className={cn(histoire && "mt-4 border-t border-black/10 pt-4")}>
          <h2 className="font-[family-name:var(--vitrine-titre)] text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--vitrine-primary)]">
            {titreHoraires}
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-[1.6] text-[var(--vitrine-sur-secondary)]/70">
            {horaires}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * LE TITRE D'UNE RUBRIQUE — trois mises en page pour la même information.
 *
 * Le compte (« 5 plats ») est SOUS le titre et non dedans : il change à chaque
 * recherche, et le faire entrer dans le `<h2>` ferait relire le titre entier au
 * lecteur d'écran à chaque frappe.
 */
function EnTeteRubrique({
  id,
  nom,
  compte,
  allure,
}: {
  id: string;
  nom: string;
  compte: string | null;
  allure: AllureResolue;
}) {
  const titre = (
    <h2
      id={id}
      style={{ textTransform: "var(--vitrine-caps)" as never }}
      className={cn(
        "font-[family-name:var(--vitrine-titre)] font-bold text-[var(--vitrine-primary)]",
        allure.styleRubrique === "carte"
          ? "whitespace-nowrap text-[19px] leading-none tracking-[0.02em]"
          : allure.styleRubrique === "filet"
            ? "whitespace-nowrap text-[17px] leading-none tracking-[0.06em]"
            : "text-[17px] leading-[1.1] tracking-[0.02em]",
      )}
    >
      {nom}
    </h2>
  );

  const filet = (opacite: string) => (
    <div aria-hidden className={cn("h-px flex-1 bg-[var(--vitrine-primary)]", opacite)} />
  );

  return (
    <div className="mb-3">
      {allure.styleRubrique === "carte" ? (
        <div
          style={{
            background: "var(--vitrine-carte-fond)",
            borderWidth: "var(--vitrine-carte-bord)",
            boxShadow: "var(--vitrine-carte-ombre)",
            borderRadius: "var(--vitrine-rad)",
          }}
          className="flex items-center gap-3 border-solid border-[var(--vitrine-accent-25)] px-4 py-[15px]"
        >
          {filet("opacity-45")}
          {titre}
          {filet("opacity-45")}
        </div>
      ) : allure.styleRubrique === "filet" ? (
        <div className="flex items-center gap-3 px-0.5 py-1">
          {filet("opacity-30")}
          {titre}
          {filet("opacity-30")}
        </div>
      ) : (
        <div className="px-0.5 py-1">{titre}</div>
      )}
      {compte ? (
        <p className="mt-1.5 text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-[var(--vitrine-sur-secondary)]/60">
          {compte}
        </p>
      ) : null}
    </div>
  );
}

/**
 * LES CLASSES D'UN ONGLET ET D'UNE CHIP.
 *
 * Des fonctions et non des objets `style` : ce sont des classes Tailwind
 * ORDINAIRES qui référencent des variables CSS déjà posées sur le conteneur.
 * Rien n'est généré à la volée, rien ne dépend d'une couleur de base au moment
 * de la compilation.
 *
 * `min-h-11` partout : cible tactile d'au moins 44 px. C'est un téléphone tenu
 * d'une main, et ces boutons sont en haut de l'écran, là où le pouce est le
 * moins précis.
 */
const BASE_CONTROLE =
  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap font-bold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vitrine-primary)]";

function classesOnglet(style: AllureResolue["styleOnglets"], actif: boolean): string {
  if (style === "pastilles") {
    return cn(
      BASE_CONTROLE,
      "rounded-full border-[1.5px] border-[var(--vitrine-primary)] px-2.5 text-[9px] tracking-[0.06em]",
      actif
        ? "bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
        : "bg-white text-[var(--vitrine-primary)]",
    );
  }
  if (style === "segmentes") {
    return cn(
      BASE_CONTROLE,
      "w-full overflow-hidden text-ellipsis rounded-[10px] border-0 px-1 text-[8.5px] leading-[1.1] tracking-[0.06em]",
      actif
        ? "bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
        : "bg-[var(--vitrine-accent-08)] text-[var(--vitrine-primary)]",
    );
  }
  return cn(
    BASE_CONTROLE,
    "border-0 border-b-[1.5px] bg-transparent px-px text-[8.5px] leading-[1.1] tracking-[0.08em]",
    actif
      ? "border-[var(--vitrine-primary)] text-[var(--vitrine-primary)]"
      : "border-transparent text-[var(--vitrine-sur-secondary)]/60",
  );
}

function classesChip(style: AllureResolue["styleChips"], actif: boolean): string {
  if (style === "pleines") {
    return cn(
      BASE_CONTROLE,
      "rounded-full border-0 px-[15px] text-[11px] tracking-[0.06em]",
      actif
        ? "bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
        : "bg-[var(--vitrine-accent-10)] text-[var(--vitrine-primary)]",
    );
  }
  if (style === "soulignees") {
    return cn(
      BASE_CONTROLE,
      "border-0 border-b-2 bg-transparent px-1 text-[11px] tracking-[0.06em]",
      actif
        ? "border-[var(--vitrine-primary)] text-[var(--vitrine-primary)]"
        : "border-transparent text-[var(--vitrine-sur-secondary)]/60",
    );
  }
  return cn(
    BASE_CONTROLE,
    "rounded-full border-[1.5px] border-[var(--vitrine-primary)] px-[15px] text-[11px] tracking-[0.06em]",
    actif
      ? "bg-[var(--vitrine-primary)] text-[var(--vitrine-sur-primary)]"
      : "bg-white text-[var(--vitrine-primary)]",
  );
}

/**
 * L'ABONNEMENT AU FRAGMENT — défini au niveau du module, et pas dans le
 * composant : `useSyncExternalStore` compare les fonctions par identité, et
 * deux clôtures recréées à chaque rendu le feraient se réabonner sans fin.
 */
function sAbonnerAuFragment(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function lireFragment(): string {
  return window.location.hash;
}

/**
 * Le fragment vient du VISITEUR — barre d'adresse, lien posté n'importe où.
 * `decodeURIComponent` lève `URIError` sur toute séquence de pourcentage
 * incomplète (`#%`, `#%zz`), et cet appel vit dans le corps de rendu : sans
 * garde, deux caractères dans un lien partagé remplacent la vitrine entière
 * par l'écran d'erreur (revue L12, M1). Repli : la chaîne brute — les ancres
 * réelles (`carte-{uuid}`) n'ont pas de `%`, un fragment indécodable ne
 * matchera simplement rien.
 */
export function decoderFragment(fragment: string): string {
  if (!fragment) return "";
  const brut = fragment.slice(1);
  try {
    return decodeURIComponent(brut);
  } catch {
    return brut;
  }
}

/** Minuscules, sans accents : « Crème brûlée » se trouve en tapant « creme ». */
function normaliser(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
