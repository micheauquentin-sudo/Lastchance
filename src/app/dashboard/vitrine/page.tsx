import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { loadDuoOptions } from "@/lib/duo-context";
import { loadOrgLobbies } from "@/lib/lobby-context";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { ANCRE_BANDE, ANCRE_DUO } from "@/components/vitrine/ancres";
import { parseEtape } from "@/components/dashboard/atelier-etapes";
import { AtelierStepper } from "@/components/dashboard/atelier-stepper";
import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import {
  hrefEtapeVitrine,
  type EtapeVitrine,
} from "@/components/dashboard/atelier-vitrine-etapes";
import { AtelierVerificationVitrine } from "@/components/dashboard/atelier-vitrine-verification";
import { etapesVitrine } from "@/components/dashboard/atelier-vitrine-etapes";
import { JeuxVitrineEditeur } from "@/components/vitrine/jeux-vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { DUO_OPTIONS_MIN_BASE } from "@/lib/duo";
import { droitEffectifModule } from "@/lib/subscription";
import { getUserAndOrg } from "@/lib/auth";
import { SupprimerVitrine } from "@/components/vitrine/supprimer-vitrine";
import { readModulePageOpenCount } from "@/lib/module-page-opens";
import { createClient } from "@/lib/supabase/server";
import {
  loadVitrineDashboardContext,
  loadVitrineMesures,
} from "@/lib/vitrine-context";
import { MesuresTableau } from "@/components/vitrine/mesures-tableau";
import { IndexationVitrine } from "@/components/vitrine/indexation-vitrine";
import { etatIndexation } from "@/lib/vitrine-indexation";
import {
  type ContenuVitrineView,
} from "@/lib/vitrine";
import type { DuoOptionsAdminView } from "@/lib/duo";
import type { OrgLobbyView } from "@/lib/lobby";
import { construireVerificationVitrine } from "@/lib/activation/vitrine";
import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";
import { Card } from "@/components/ui/card";
import { sousTitreTableauDeBord } from "@/platform/experiences/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { CatalogueEditeur } from "@/components/vitrine/catalogue-editeur";
import { ContenusEditeur } from "@/components/vitrine/contenus-editeur";
import { ImportCarte } from "@/components/vitrine/import-carte";
import {
  AdresseForm,
  IdentiteEtThemeForm,
  PublicationCard,
} from "@/components/vitrine/reglages-vitrine";
import { SalonsOuverts } from "@/components/vitrine/salons-ouverts";
import { VitrineQrPlanche } from "@/components/vitrine/vitrine-qr-planche";

export const metadata: Metadata = { title: "Vitrine" };

/**
 * LE RENVOI VERS LA PAGE DU JEU (DUO-3b).
 *
 * Il ne rend AUCUN champ, volontairement : un formulaire est ce qu'on ne
 * duplique jamais. Il dit ce qui se règle là-bas et y mène — motif exact de
 * l'étape « Traductions », qui renvoie de la même façon vers son tableau.
 */
function RenvoiVersLeJeu({
  jeu,
  titre,
  phrase,
}: {
  jeu: "duo" | "bande";
  titre: string;
  phrase: string;
}) {
  return (
    <Card>
      <h2>{titre}</h2>
      <p className="mt-2 text-sm text-k-body">{phrase}</p>
      <Link
        href={`/dashboard/salons/${jeu}`}
        className="mt-3 inline-block text-sm font-black text-k-orange-text underline underline-offset-2"
      >
        Ouvrir la page {titre}
      </Link>
    </Card>
  );
}

/**
 * LA VITRINE DU COMMERÇANT — son catalogue QR, et l'adresse qui le sert.
 *
 * ── LE MODULE S'APPELLE `vitrine`, ET C'EST LE MÊME QUE « RÉSERVATIONS » ──
 *
 * Un seul droit couvre trois capacités serveur : publier la vitrine, le CRM
 * léger, l'agenda Réserver (migration 20261001120000). Les deux écrans passent
 * donc le MÊME argument à `capacitesDuModule` et portent le MÊME entitlement.
 *
 * ── DEUX VERDICTS, ET ILS NE DISENT PAS LA MÊME CHOSE ──
 *
 * `capacitesDuModule` décide de ce que la page MONTRE — découvrir reste ouvert
 * à tous (cahier §3), d'où l'écran complet et son encart d'offre pour qui n'a
 * pas le droit. `loadVitrineDashboardContext` décide de ce qu'elle LIT.
 *
 * IL Y EN AVAIT UN TROISIÈME, ET IL A DISPARU AVEC L11 : le drapeau
 * `VITRINE_PUBLIQUE_OUVERTE` descendait jusqu'à `ReglagesVitrine` pour changer
 * la phrase sous « Publiée » — « n'imprimez pas vos QR codes tout de suite ».
 * L'adresse publique répond désormais, la phrase n'a plus d'objet, et le
 * paramètre qui la portait est retiré plutôt que laissé à `true` : une prop
 * dont une seule valeur est possible finit par être lue comme une option.
 */
export default async function VitrineDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ etape?: string }>;
}) {
  /**
   * L'ÉTAPE, OU LA VUE SUIVI (VIT-15).
   *
   * `"nulle"` : l'ABSENCE de `?etape=` n'est pas « la première étape », c'est
   * le SUIVI — la page a deux visages. Une valeur INCONNUE, elle, retombe sur
   * la première étape plutôt que sur un 404 : une URL vieillie ou tronquée
   * doit rendre un écran utile.
   */
  const { etape: etapeParam } = await searchParams;
  const capacites = await capacitesDuModule("vitrine");
  /**
   * LE RÔLE, POUR LA SEULE SUPPRESSION (VIT-14).
   *
   * `capacitesDuModule` ne l'expose pas, et il n'a pas à l'exposer : la
   * distinction owner/editor ne vaut que pour ce geste-là, le seul du module
   * qui ne se répare pas. `getUserAndOrg` est mémoïsé par `cache()` sur le
   * rendu — cet appel ne coûte pas une seconde lecture.
   */
  const { role, organization } = await getUserAndOrg();
  if (!capacites.canExplore) notFound();

  const ctx = await loadVitrineDashboardContext();
  // VIT-9 : lecture SÉPARÉE et non ajoutée au contexte du tableau de bord.
  // Les compteurs sont un rapport, pas un état d'édition : les mêler aurait
  // fait payer une agrégation sur 7 jours à chaque ouverture de l'écran, y
  // compris quand la Vitrine n'a pas encore d'adresse.
  const rapport = await loadVitrineMesures();
  const settings = ctx.ok ? ctx.settings : null;
  const cartes = ctx.ok ? ctx.cartes : [];
  const organizationId = ctx.ok ? ctx.organizationId : null;

  /**
   * LES CONTENUS MIS EN AVANT ET LES OUVERTURES — deux lectures, un seul aller.
   *
   * Client de SESSION, RLS de membre — ET le filtre d'organization EXPLICITE
   * quand même (revue L14, E1) : `is_org_member` est vrai pour TOUTES les
   * organizations d'un utilisateur multi-comptes, pas pour la seule active.
   * Sans `.eq`, un franchisé voyait les « À la une » de ses deux enseignes
   * mélangés — et pouvait en recopier un chez l'autre d'un clic. Le motif réel
   * du dépôt est celui-là : `dashboard/calendar/[id]` et `jackpot/[id]` posent
   * TOUS le `.eq("organization_id", …)` en plus de la RLS.
   *
   * `resource_id` est `vitrine_settings.id`, jamais le slug : le beacon public
   * envoie le slug, `/api/page-opens` le traduit, et le compteur est indexé sur
   * la LIGNE DE RÉGLAGES — une par commerce, contrairement aux événements et
   * aux chasses qui comptent par sous-objet.
   */
  /**
   * LES SALONS SONT LUS ICI, avec les deux autres — et seulement si une adresse
   * existe. Une salle ne s'ouvre que sur une vitrine PUBLIÉE
   * (`resoudreCommerceLobby` exige `published = true`), donc sans `settings` il
   * ne peut y en avoir aucune : la RPC répondrait `{"lobbies":[]}` pour tout le
   * monde, une fois par ouverture d'écran. `loadOrgLobbies` refait sa propre
   * garde de session, mais `getUserAndOrg` est mémoïsé par `cache()` sur le
   * rendu — la porte est retenue, la requête ne l'est pas.
   */
  const supabase = await createClient();
  const lireSalons = async () => {
    const ctx = await loadOrgLobbies();
    // Le refus de garde ne se distingue pas d'une absence de salon À L'ÉCRAN :
    // la carte ne se peint qu'avec au moins une salle, donc les deux cas sont
    // le même silence. Ce qui compte est que le refus n'invente pas de liste.
    return ctx.ok
      ? { liste: ctx.salons, luA: ctx.luA }
      : { liste: [] as OrgLobbyView[], luA: "" };
  };
  /**
   * LE PLATEAU DU DUO MIROIR (L17), lu avec les trois autres.
   *
   * Il ne rend JAMAIS un refus : `loadDuoOptions` répond par un plateau vide
   * quand la garde ou la lecture échoue — le commerçant a le droit, il n'a
   * simplement rien d'épinglé, et les deux cas affichent exactement la même
   * chose : une invitation à composer.
   */
  const lireDuo = async (): Promise<DuoOptionsAdminView> => {
    const ctx = await loadDuoOptions();
    return ctx.ok ? ctx.plateau : { options: [], suggestion: null };
  };
  /* LE PACK DU PORTRAIT DE LA BANDE N'EST PLUS LU ICI (DUO-3b) : il se règle
     sur `/dashboard/salons/bande`, et cette page n'en affiche plus rien. Le
     plateau du Duo, lui, RESTE lu — pas pour être édité, mais parce que son
     COMPTE décide du « prêt / pas prêt » de l'étape « Les jeux » et du contrôle
     d'activation de la vérification finale. */
  const [contenus, ouvertures, supervision, plateauDuo] =
    settings && organizationId
      ? await Promise.all([
          supabase
            .from("vitrine_contenus")
            .select("rang, titre, url")
            .eq("organization_id", organizationId)
            .order("rang")
            .then(({ data }) => (data ?? []) as ContenuVitrineView[]),
          readModulePageOpenCount(supabase, "vitrine", settings.id),
          lireSalons(),
          lireDuo(),
        ])
      : [
          [] as ContenuVitrineView[],
          0,
          { liste: [] as OrgLobbyView[], luA: "" },
          { options: [], suggestion: null } as DuoOptionsAdminView,
        ];

  /**
   * LES NEUF TUILES DE CET ÉCRAN — et elles ne sont TOUTES rendues qu'avec une
   * adresse. `TUILES_VITRINE` tient l'ordre et les rangs ; la page ne fait que
   * nommer ses blocs.
   *
   * Sans `settings`, le module n'émet que le contrôle `adresse` et la page ne
   * rend que le bloc « Réglages » : seule la tuile 1 est donc posée, sur le seul
   * bloc à l'écran. Les huit autres ne sont pas « vertes par défaut », elles
   * n'existent pas — un rang sans bloc n'aurait rien à numéroter.
   *
   * `SommaireVitrine` et `SalonsOuverts` ne portent volontairement PAS de
   * pastille : le premier est une table des matières, le second ne se peint
   * qu'avec au moins un salon ouvert. Le motif est écrit en tête de
   * `TUILES_VITRINE`, et c'est ce qui laisse la suite numérotée aller de 1 à 9
   * dans l'ordre exact du rendu.
   */
  /**
   * LE FIL D'ÉTAPES DÉPEND DE CE QUI EST COCHÉ (VIT-16).
   *
   * Il se calcule donc APRÈS la lecture des réglages, et non au tout début :
   * les deux étapes de jeu n'existent que si le commerçant a demandé le jeu.
   * `resoudreThemeVitrine` fait le travail délicat — l'ABSENCE de choix y vaut
   * « les deux », ce qui garde intactes les vitrines d'avant ce lot.
   */
  const themeResolu = resoudreThemeVitrine(
    settings?.theme ?? null,
    settings?.secteur,
  );
  const etapes = etapesVitrine(themeResolu.jeux);
  const etape = parseEtape(etapes, etapeParam, "nulle") as EtapeVitrine | null;

  /**
   * CE QUE LE COMMERÇANT POSSÈDE, pour le bilan de l'étape « Les jeux ».
   * Deux droits distincts depuis la clé par produit (20261020120000) : un
   * commerce peut avoir la Vitrine sans avoir aucun des deux jeux.
   */
  const duoPossede = organization
    ? droitEffectifModule("duo", organization)
    : false;
  const bandePossede = organization
    ? droitEffectifModule("bande", organization)
    : false;

  const tuiles = tuilesDuModule(
    "vitrine",
    construireVerificationVitrine({
      settings,
      cartes,
      nbFichesDuo: plateauDuo.options.length,
    }).controles,
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Vitrine"
        sousTitre={sousTitreTableauDeBord("vitrine")}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="vitrine">
        Un mini-site à votre adresse, avec vos cartes, vos rubriques et vos
        fiches — badges, allergènes et disponibilité du jour comprises.
      </ModuleCapabilityNotice>

      {etape === null ? (
        /* ═══ LA VUE SUIVI ═══════════════════════════════════════════════
           Tout est REPLIÉ sauf le partage : une vitrine se prépare une fois
           et se scanne tous les jours. Ce que le commerçant vient chercher
           ici, une fois publiée, c'est son QR et son lien — pas neuf cartes
           de réglages qu'il a déjà remplies. */
        <div className="space-y-6">
          <div id="partage" className="scroll-mt-4">
            <CarteRepliable
              {...carteTuile(tuiles, "partage")}
              /* OUVERT SEULEMENT UNE FOIS PUBLIÉE. Avant, il n'y a rien à
                 imprimer — un QR fabriqué sur une vitrine fermée mène à une
                 page qui refuse, et l'ouvrir d'emblée inviterait à le coller
                 en salle. Après, c'est le seul bloc qu'on vient rouvrir. */
              defaultOuvert={settings?.published === true}
              resume={
                settings?.published
                  ? `${ouvertures} ouverture${ouvertures > 1 ? "s" : ""} de la page publique`
                  : "Vitrine non publiée — rien à imprimer pour l'instant"
              }
            >
              {settings ? (
                <VitrineQrPlanche
                  slug={settings.slug}
                  publiee={settings.published}
                  cartes={cartes}
                  appUrl={APP_URL}
                  resourceId={settings.id}
                  openCount={ouvertures}
                />
              ) : (
                <Card className="py-8 text-center">
                  <p className="text-sm font-semibold text-k-body">
                    Choisissez d&apos;abord l&apos;adresse de votre vitrine dans
                    l&apos;atelier : c&apos;est elle que porteront vos QR codes.
                  </p>
                </Card>
              )}
            </CarteRepliable>
          </div>

          <div id="statut" className="scroll-mt-4">
            <CarteRepliable
              {...carteTuile(tuiles, "statut")}
              defaultOuvert={settings?.published !== true}
              resume={
                settings?.published ? "Vitrine en ligne" : "Vitrine non publiée"
              }
            >
              {settings ? (
                <PublicationCard
                  settings={settings}
                  appUrl={APP_URL}
                  peutPublier={capacites.canPublish}
                />
              ) : (
                <Card className="py-8 text-center">
                  <p className="text-sm font-semibold text-k-body">
                    Rien à publier tant que votre vitrine n&apos;a pas
                    d&apos;adresse.
                  </p>
                </Card>
              )}
            </CarteRepliable>
          </div>

          {/* ── LE STUDIO EST LE CHEMIN PRINCIPAL (VIT-27) ──

              Tout se règle là-bas, en voyant la page. Cette carte n'est donc
              pas une entrée de plus dans la pile : c'est LA porte, et elle est
              OUVERTE — un commerçant qui vient régler quelque chose doit
              tomber dessus, pas la déplier.

              Elle ne s'affiche qu'à partir de `lg`, parce que le studio est à
              trois colonnes : en dessous, elles s'empilent et l'aperçu passe
              sous les réglages, ce qui lui retire sa raison d'être. */}
          {settings ? (
            <Card className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
              <div className="min-w-0">
                <h2>Mon studio</h2>
                <p className="mt-1 text-sm text-k-body">
                  Votre vitrine au centre, les réglages autour. Votre logo,
                  votre bannière, vos mots, votre carte, vos réseaux et vos
                  jeux — tout s&apos;y règle en voyant le résultat.
                </p>
              </div>
              <Link
                href="/vitrine-studio"
                className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
              >
                Ouvrir le studio
              </Link>
            </Card>
          ) : null}

          {/* ── L'ATELIER RESTE, ET IL EST LE CHEMIN DU PETIT ÉCRAN ──

              Il n'est pas retiré : le studio ne tient pas sur un téléphone, et
              une adresse d'étape gardée en favori doit continuer de mener
              quelque part. `?etape=` reste donc atteignable partout, sur
              n'importe quelle taille d'écran — c'est l'ENTRÉE qui change de
              rang, pas la route.

              ÉCARTÉ : masquer l'atelier au-delà de `lg`. Sa tuile porte des
              points de la vérification (`carteTuile`), et une tuile invisible
              sur grand écran aurait retiré au commerçant un état qu'il est
              censé lire — pour ne gagner qu'une carte repliée de moins. */}
          <CarteRepliable
            {...carteTuile(tuiles, "atelier")}
            defaultOuvert={false}
            resume={`${etapes.length} étapes — le chemin des petits écrans.`}
          >
            <AtelierEntree
              etapes={etapes}
              hrefPour={(cle) => hrefEtapeVitrine(cle as EtapeVitrine)}
              titre="L'atelier de la vitrine"
              sousTitre="Le même contenu que le studio, une étape à la fois et sans aperçu — pratique sur téléphone."
            />
          </CarteRepliable>

          {/* CE QUE LA VITRINE A RAPPORTÉ, EN UN NOMBRE. Le mot est
              « ouvertures » et non « scans » : un rechargement, un retour
              arrière et un lien partagé comptent tous, et prétendre compter
              des scans distincts serait faux (voir `page-open-beacon`). */}
          <CarteRepliable
            {...carteTuile(tuiles, "audience")}
            defaultOuvert={false}
            /* LA PHRASE COMPLÈTE, ET PAS SEULEMENT LE NOMBRE : c est la
               seule chose que le commerçant lit quand tout est replié, et
               « 12 » seul ne dit pas de quoi. */
            resume={`${ouvertures} ouverture${ouvertures > 1 ? "s" : ""} de la page publique`}
          >
            <Card>
              <h2>Audience</h2>
              <p className="mt-2 text-sm text-k-body">
                <span className="font-black tabular-nums text-k-ink">
                  {ouvertures}
                </span>{" "}
                ouverture{ouvertures > 1 ? "s" : ""} de la page publique.
              </p>
              {rapport.ok ? (
                <div className="mt-4">
                  <MesuresTableau mesures={rapport.mesures} cartes={cartes} />
                </div>
              ) : null}
            </Card>
          </CarteRepliable>

          {/* LA SUPERVISION DES SALONS reste sur le suivi et non dans une
              étape : ce n'est pas de la préparation, c'est une console — on
              l'ouvre pendant le service, pas pendant qu'on compose sa carte. */}
          {settings ? (
            <SalonsOuverts salons={supervision.liste} luA={supervision.luA} />
          ) : null}

          <SupprimerVitrine peutSupprimer={role === "owner"} />
        </div>
      ) : (
        /* ═══ L'ATELIER ══════════════════════════════════════════════════ */
        <div className="space-y-6">
          <AtelierStepper
            etapes={etapes}
            courante={etape}
            hrefPour={(cle) => hrefEtapeVitrine(cle as EtapeVitrine)}
          />

          {etape === "adresse" ? (
            <AdresseForm
              slug={settings?.slug ?? null}
              appUrl={APP_URL}
              peutEditer={capacites.canEditDraft}
            />
          ) : null}

          {/* LES SIX AUTRES ÉTAPES ATTENDENT L'ADRESSE, et c'est la base qui
              l'a dessiné : `vitrine_dashboard_state` rend `settings = null`
              tant qu'aucune adresse n'est choisie. Composer trente fiches
              avant de savoir où elles seront servies revient à préparer une
              vitrine sans magasin. */}
          {etape !== "adresse" && settings === null ? (
            <Card className="py-10 text-center">
              <p className="text-sm font-semibold text-k-body">
                Choisissez d&apos;abord l&apos;adresse de votre vitrine.
              </p>
              <Link
                href={hrefEtapeVitrine("adresse")}
                className="mt-2 inline-block text-sm font-black text-k-orange-text underline underline-offset-2"
              >
                Aller à l&apos;étape « L&apos;adresse »
              </Link>
            </Card>
          ) : null}

          {settings ? (
            <>
              {etape === "identite" ? (
                <div className="space-y-4">
                  {/* L'ENTRÉE DU STUDIO (VIT-17). Elle est EN TÊTE de
                      l'étape et non en bas : personnaliser une page se fait
                      en la regardant, et le formulaire ci-dessous n'en
                      montre rien. Celui qui descend le remplir a déjà
                      renoncé à voir ce qu'il règle. */}
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2>Voir ce que je règle</h2>
                      <p className="mt-1 text-sm text-k-body">
                        Ouvrez le studio : votre vitrine au centre, les
                        réglages autour, et chaque changement visible tout de
                        suite. Rien n&apos;est enregistré tant que vous ne
                        l&apos;avez pas demandé.
                      </p>
                    </div>
                    <Link
                      href="/vitrine-studio"
                      className="shrink-0 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-yellow/80"
                    >
                      Ouvrir le studio
                    </Link>
                  </Card>
                <IdentiteEtThemeForm
                  settings={settings}
                  peutEditer={capacites.canEditDraft}
                />
                </div>
              ) : null}

              {etape === "carte" ? (
                <div className="space-y-6">
                  <ImportCarte peutEditer={capacites.canEditDraft} />
                  <CatalogueEditeur
                    cartes={cartes}
                    peutEditer={capacites.canEditDraft}
                  />
                </div>
              ) : null}

              {etape === "alaune" ? (
                <ContenusEditeur
                  contenus={contenus}
                  peutEditer={capacites.canEditDraft}
                />
              ) : null}

              {etape === "traductions" ? (
                <Card>
                  <h2>Traductions (anglais)</h2>
                  <p className="mt-2 text-sm text-k-body">
                    Traduisez le nom et la description de vos fiches. Les
                    clients étrangers liront la version anglaise ; ce qui
                    n&apos;est pas traduit reste en français.
                  </p>
                  <Link
                    href="/dashboard/vitrine/traductions"
                    className="mt-3 inline-block text-sm font-black text-k-orange-text underline underline-offset-2"
                  >
                    Ouvrir le tableau de traduction
                  </Link>
                </Card>
              ) : null}

              {/* LE BILAN ET LES CASES (VIT-16). Les réglages de chaque jeu
                  ont quitté cette étape : ils vivent dans la leur, qui
                  n'existe que si la case est cochée. */}
              {etape === "jeux" ? (
                <JeuxVitrineEditeur
                  duoPossede={duoPossede}
                  bandePossede={bandePossede}
                  duoPret={plateauDuo.options.length >= DUO_OPTIONS_MIN_BASE}
                  duoCoche={themeResolu.jeux.duo}
                  bandeCoche={themeResolu.jeux.bande}
                  nbFichesDuo={plateauDuo.options.length}
                  peutEditer={capacites.canEditDraft}
                />
              ) : null}

              {/* LES DEUX ÉTAPES DE JEU MÈNENT AILLEURS DEPUIS DUO-3b, ET
                  C'EST UN ARBITRAGE, PAS UN DÉMÉNAGEMENT SUBI.

                  Le formulaire vivait ici, derrière la garde du droit
                  `vitrine` : un commerçant qui achète le Duo seul (DUO-2) en
                  était verrouillé dehors. Il vit maintenant sur la page du
                  module, sous le droit du JEU.

                  POURQUOI UN LIEN ET PAS UN SECOND FORMULAIRE : le même
                  réglage rendu à deux endroits, ce sont deux sources de vérité
                  pour une seule ligne en base — l'une revalidée, l'autre
                  servie depuis un cache, et un commerçant qui lit deux états
                  différents du même plateau selon la page ouverte.

                  POURQUOI L'ÉTAPE RESTE : elle a été livrée il y a quelques
                  heures (VIT-16), des liens la visent déjà, et surtout le
                  choix « ce jeu paraît-il sur MA vitrine » est bien une
                  question de vitrine. Ce qui n'en est pas une, c'est le
                  contenu du plateau — et c'est exactement ce qui part. */}
              {etape === "duo" ? (
                <div id={ANCRE_DUO} className="scroll-mt-4">
                  <RenvoiVersLeJeu
                    jeu="duo"
                    titre="Duo Miroir"
                    phrase="Le plateau du Duo — ce que vos clients auront à choisir — se compose sur la page du jeu."
                  />
                </div>
              ) : null}

              {etape === "bande" ? (
                <div id={ANCRE_BANDE} className="scroll-mt-4">
                  <RenvoiVersLeJeu
                    jeu="bande"
                    titre="Portrait de la Bande"
                    phrase="Le pack de questions se choisit sur la page du jeu."
                  />
                </div>
              ) : null}

              {etape === "verification" ? (
                <div className="space-y-6">
                  <AtelierVerificationVitrine
                    entree={{
                      settings,
                      cartes,
                      nbFichesDuo: plateauDuo.options.length,
                    }}
                  />
                  <IndexationVitrine
                    indexable={settings.indexable}
                    etat={etatIndexation({
                      published: settings.published,
                      indexable: settings.indexable,
                      accroche: settings.accroche,
                      cartes,
                    })}
                    peutEditer={capacites.canEditDraft}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}