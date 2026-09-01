"use server";

import { revalidatePath } from "next/cache";
import { reportError } from "@/lib/monitoring";
import { rateLimit, rateLimitBucket, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/json";
import type { ActionResult } from "@/lib/utils";
import { revaliderVitrinePublique } from "@/lib/revalidate-vitrine";
import {
  mapDeleteVitrine,
  mapDeleteVitrineTraduction,
  mapSetVitrineSlug,
  mapUpsertVitrineTraduction,
  mapVitrineTraductionState,
  mapThemeVitrine,
  VITRINE_ALLURE_BOOLEENS,
  VITRINE_ALLURE_BOOLEENS_DEFAUTS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_CHIFFRES,
  VITRINE_ALLURE_CLES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_ALLURE_ENUMS_CLES,
  VITRINE_BLOCS_DEFAUT,
  VITRINE_LANGUE_TRADUITE,
  VITRINE_ORDRE_MAX,
  VITRINE_SECTEUR_DEFAUT,
  VITRINE_TRADUCTION_TEXTE_MAX,
  type AllureVitrine,
  type RefusTraductionVitrine,
  type SetVitrineSlugResult,
  type ThemeVitrine,
} from "@/lib/vitrine";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";
import {
  cheminsDeLaPhoto,
  deposerPhotoVitrine,
  effacerPhotos,
  verifierQuotaPhotos,
  VitrinePhotoError,
} from "@/lib/vitrine-photo-storage";
import {
  champsATraduire,
  decouperEnLots,
  messageCompteRendu,
} from "@/lib/traduction-auto";
import {
  fournisseurConfigure,
  TRADUCTION_LOT,
} from "@/lib/traduction-fournisseur";
import {
  createVitrineCarteSchema,
  createVitrineFicheSchema,
  createVitrineRubriqueSchema,
  deleteVitrineCarteSchema,
  deleteVitrineContenuSchema,
  deleteVitrineFicheSchema,
  deleteVitrineRubriqueSchema,
  deleteVitrineTraductionSchema,
  deleteVitrinePhotoSchema,
  importVitrineCarteSchema,
  setVitrineIndexationSchema,
  setVitrinePhotoSchema,
  reorderVitrineCartesSchema,
  reorderVitrineFichesSchema,
  reorderVitrineRubriquesSchema,
  saveVitrineSettingsSchema,
  setVitrineContenuSchema,
  setVitrineSlugSchema,
  setVitrineTraductionSchema,
  toggleVitrineFicheDisponibiliteSchema,
  updateVitrineCarteSchema,
  updateVitrineFicheSchema,
  updateVitrineRubriqueSchema,
} from "@/lib/validations/vitrine";

/**
 * VITRINE — les gestes du commerçant (VIT-1a, lot L10).
 *
 * ── AUCUN UPLOAD D'IMAGE DANS CE LOT ──
 *
 * `cover_path` et `photo_path` ne sont écrits par AUCUNE action de ce fichier :
 * ils restent `null`. Le pipeline d'images (bucket, conversion, tailles) est un
 * chantier à lui seul, et livrer un champ de chemin sans le stockage qui va avec
 * aurait laissé le commerçant saisir une adresse que rien ne sert. Les deux
 * colonnes existent, la base les borne, un lot suivant les remplira.
 *
 * ── TROIS INVARIANTS, VÉRIFIABLES EN LISANT CE FICHIER ──
 *
 *  1. TOUT EST ORG-SCOPÉ PAR LA SESSION. L'organisation et le rôle viennent de
 *     `gardeEditeurVitrine()`, jamais du formulaire. Le CRUD passe par le client
 *     de SESSION — donc sous les policies « vitrine_* : editors » — et porte EN
 *     PLUS un filtre `organization_id` explicite. Le `service_role` n'apparaît
 *     que sur les DEUX chemins qui l'exigent : `set_vitrine_slug` (elle audite,
 *     et revérifie l'appartenance de l'acteur EN SQL) et `import_vitrine_carte`
 *     (VIT-2), qui ne revérifie RIEN — sa sûreté tient entièrement à
 *     `gardeEditeurVitrine` et à l'organisation passée depuis la session.
 *
 *  2. LES COLONNES SONT ÉNUMÉRÉES, jamais un objet recopié depuis l'entrée.
 *     La migration n'accorde d'ailleurs l'écriture que colonne par colonne
 *     (`grant update (nom, ordre, active)` …) : envoyer un champ non accordé
 *     produit un 42501, et un champ inventé un 42703.
 *
 *  3. LA PUBLICATION N'EST PAS GARDÉE ICI. Le trigger
 *     `vitrine_settings_guard_publication` refuse la TRANSITION vers `true` sans
 *     le droit `vitrine` — ces actions rendent un message, elles ne tiennent pas
 *     la porte. Le retour en arrière n'est jamais gardé : on ne bloque pas
 *     quelqu'un qui veut dépublier.
 */

const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const SANS_ADRESSE = "Choisissez d'abord l'adresse publique de votre vitrine.";
/**
 * LE SEUL REFUS QUE L ECRAN DOIT SAVOIR NOMMER.
 *
 * `gardeEditeurVitrine` laisse passer `editor`, la RPC exige `owner` : c est
 * délibéré — un éditeur peut écrire toute la carte, il ne peut pas la faire
 * disparaître. Sans ce message, ce refus serait rendu comme « Une erreur est
 * survenue », et un éditeur cliquerait indéfiniment sans comprendre.
 */
const SUPPRESSION_OWNER =
  "Seul le propriétaire du compte peut supprimer la vitrine.";
const INTROUVABLE = "Élément introuvable.";
const RATTACHEMENT_INTROUVABLE =
  "La carte ou la rubrique de destination est introuvable.";

const CHEMIN_DASHBOARD = "/dashboard/vitrine";

/** Données sûres après une création, sans organisation ni horodatages internes. */
export type VitrineCarteCreee = {
  id: string;
  nom: string;
  ordre: number;
  active: boolean;
};

export type VitrineRubriqueCreee = {
  id: string;
  nom: string;
  ordre: number;
};

export type VitrineFicheCreee = {
  id: string;
  nom: string;
  ordre: number;
  description: null;
  prix_affiche: null;
  photo_path: null;
  photo_alt: null;
  facettes: [];
  action: null;
  badges: [];
  allergenes: [];
  disponible: true;
};

/** Le refus du seau de `setVitrineSlug` — il DATE la réessayabilité. */
const TROP_D_ESSAIS_SLUG =
  "Trop de changements d'adresse en peu de temps. Réessayez dans une heure.";

/**
 * Le refus de suppression d'une carte non vide, RECONSTRUIT plutôt que relayé.
 *
 * ── CE QUE LA REVUE L10 A DEMANDÉ DE FERMER ──
 *
 * L'action renvoyait `error.message` TEL QUEL à l'écran. Le message du trigger
 * est écrit pour le commerçant, mais c'est du texte de BASE DE DONNÉES : il
 * n'est borné ni en longueur ni en contenu, et le code `23503` ne vient pas
 * seulement de ce trigger-là — une violation de FK ordinaire y aurait fait
 * remonter un nom de contrainte, de table et de schéma, c'est-à-dire de la
 * structure interne, dans une page rendue à un utilisateur.
 *
 * ── CE QU'ON GARDE QUAND MÊME : LE COMPTE ──
 *
 * « Videz-la ou désactivez-la » sans dire COMBIEN ne dit rien. On extrait donc
 * le seul chiffre du message — au plus quatre chiffres, rien d'autre ne
 * traverse — et on réécrit la phrase ICI. Ce qui sort est entièrement de nous ;
 * ce qui vient de la base tient dans un entier.
 *
 * Le message brut continue d'aller au monitoring, où il a sa place.
 */
const COMPTE_RUBRIQUES = /porte encore (\d{1,4}) rubrique/;
const CARTE_NON_VIDE_SANS_COMPTE =
  "Suppression refusée : cette carte porte encore des rubriques. Videz-la ou désactivez-la.";

function messageCarteNonVide(brut: string): string {
  const trouve = COMPTE_RUBRIQUES.exec(brut);
  if (!trouve) return CARTE_NON_VIDE_SANS_COMPTE;
  return `Suppression refusée : cette carte porte encore ${Number(trouve[1])} rubrique(s). Videz-la ou désactivez-la.`;
}

/**
 * Les trois refus de `set_vitrine_slug`, plus l'illisible — un message chacun.
 *
 * ILS RESTENT DISTINCTS parce que l'écran doit les distinguer : « mal formé »
 * n'envoie pas le commerçant au même endroit que « déjà prise ». Les fondre en
 * un « adresse refusée » aurait rendu le premier choix — celui qui engage
 * l'impression des QR — impossible à corriger sans deviner.
 */
const MESSAGES_SLUG: Record<
  "invalid_slug" | "reserved_slug" | "slug_taken" | "error",
  string
> = {
  invalid_slug:
    "Adresse invalide : 3 à 60 caractères, lettres minuscules, chiffres et tirets.",
  reserved_slug:
    "Cette adresse est réservée par la plateforme, choisissez-en une autre.",
  slug_taken: "Cette adresse est déjà prise.",
  error: GENERIC_ERROR,
};

/**
 * Revalide ce qui a pu changer — le tableau de bord, ET LES DEUX PAGES
 * PUBLIQUES.
 *
 * ── POURQUOI LA PURGE PUBLIQUE N'EST PLUS OPTIONNELLE (L11) ──
 *
 * La page `/v/{slug}` est servie en ISR (60 s). Sans purge, le commerçant qui
 * corrige un prix, grise un plat ou renomme une carte reste devant sa PROPRE
 * vitrine inchangée jusqu'à la fin de la fenêtre — et le geste qu'il vient de
 * faire, dont l'écran d'édition lui a confirmé le succès, semble n'avoir servi à
 * rien. Une requête de plus par geste éditorial (la lecture du slug) achète la
 * cohérence immédiate de ce que le commerçant vient d'écrire.
 *
 * ── LA PURGE PUBLIQUE ELLE-MÊME A DÉMÉNAGÉ (revue L13, M3) ──
 *
 * Elle vit désormais dans `@/lib/revalidate-vitrine`, parce qu'elle a d'autres
 * appelants : les gestes de Réserver et du Quiz changent les DRAPEAUX que
 * l'annuaire de portes de VIT-3 publie, et doivent purger les mêmes chemins.
 * Le détail — les deux langues, le rôle du drapeau serveur, le coût de la
 * lecture de slug — est écrit là-bas, une seule fois.
 *
 * Ce qui reste ici est ce qui n'appartient qu'à la vitrine : la page du tableau
 * de bord. Le `slugConnu` traverse — `set_vitrine_slug` est le seul geste qui
 * fasse naître la ligne, et il passe le sien.
 */
async function revaliderVitrine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  slugConnu?: string | null,
): Promise<void> {
  revalidatePath(CHEMIN_DASHBOARD);
  await revaliderVitrinePublique(supabase, organizationId, slugConnu);
}

/**
 * Traduit un échec PostgREST en message utile, sans jamais nommer le voisin.
 *
 * `23503` couvre les deux violations de FK COMPOSITE possibles ici — une carte
 * ou une rubrique qui n'existe pas, ou qui appartient à quelqu'un d'autre — et
 * un SEUL message les couvre : distinguer apprendrait ce qui existe chez le
 * voisin, ce qui est exactement ce que la FK composite existe pour empêcher.
 */
function messagePostgrest(
  contexte: string,
  error: { code?: string; message: string },
  surUnique?: string,
): string {
  reportError(contexte, error.message);
  if (error.code === "23505" && surUnique) return surUnique;
  if (error.code === "23503") return RATTACHEMENT_INTROUVABLE;
  return GENERIC_ERROR;
}

/**
 * Le rang à donner à une ligne qu'on crée : APRÈS LA DERNIÈRE.
 *
 * ── POURQUOI PAS LE DÉFAUT `0` DE LA COLONNE ──
 *
 * Le tri est `(ordre, id)` aux trois niveaux. Toutes les lignes créées au défaut
 * partageraient donc le rang 0 et se départageraient par un UUID ALÉATOIRE : le
 * plat qu'on vient d'ajouter apparaîtrait à une place imprévisible au milieu des
 * autres, et le commerçant conclurait que le réordonnancement ne marche pas.
 * Une lecture de plus par création achète un comportement qui ne surprend
 * personne.
 *
 * Le plafond `VITRINE_ORDRE_MAX` est un `check` de la base : une carte de mille
 * lignes verrait ses créations s'empiler au dernier rang, ce qui reste préférable
 * à un refus sur une contrainte que l'écran ne sait pas expliquer.
 */
function rangSuivant(dernier: number | null | undefined): number {
  return Math.min((dernier ?? -1) + 1, VITRINE_ORDRE_MAX);
}

// ════════════════════════════════════════════════════════════
// L'ADRESSE PUBLIQUE
// ════════════════════════════════════════════════════════════

/**
 * Pose ou change l'adresse publique — et CRÉE la ligne de réglages.
 *
 * SEUL CHEMIN POSSIBLE : `vitrine_settings` n'accorde `insert` à personne, et
 * `slug` est hors du `grant update`. La RPC est donc la porte unique, et c'est
 * délibéré — une adresse posée sans trace est justement celle qui engage
 * l'impression des QR.
 *
 * `p_actor` VIENT DE LA SESSION, jamais du formulaire : la RPC le revérifie
 * membre `owner`/`editor` en SQL, et un acteur posté aurait fait de la ligne
 * d'audit une déclaration sur l'honneur.
 *
 * Les trois refus restent DISTINCTS parce que l'écran doit les distinguer :
 * « mal formé » n'envoie pas le commerçant au même endroit que « déjà pris ».
 *
 * ── LE SEUL GESTE DE CE FICHIER QUI PORTE UN SEAU (revue L10) ──
 *
 * Les autres actions écrivent des lignes du locataire, bornées par la RLS et par
 * ce qu'un commerçant peut saisir. Celle-ci est différente sur trois points :
 * elle passe par le `service_role`, elle ÉCRIT UNE LIGNE D'AUDIT à chaque appel,
 * et son refus `slug_taken` répond une question sur l'espace de noms GLOBAL —
 * bouclée, elle dirait quelles adresses sont déjà prises chez les voisins. Le
 * seau est consommé APRÈS la garde, donc sur une clé qu'aucun tiers ne peut
 * entamer : voir `RATE_LIMITS.vitrineSlug` pour l'arbitrage ADR-032.
 */
export async function setVitrineSlug(
  _prev: ActionResult<SetVitrineSlugResult> | null,
  formData: FormData,
): Promise<ActionResult<SetVitrineSlugResult>> {
  const parsed = setVitrineSlugSchema.safeParse({
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  // APRÈS la garde : la clé est celle du locataire authentifié, jamais une
  // valeur venue du navigateur — un seau posé avant aurait été entamable par
  // n'importe qui, et refuser sur une telle clé est exactement l'interrupteur
  // qu'ADR-032 interdit.
  const autorise = await rateLimit(
    rateLimitBucket("vitrine:slug", garde.organizationId),
    RATE_LIMITS.vitrineSlug,
    { failClosed: true },
  );
  if (!autorise) return { ok: false, error: TROP_D_ESSAIS_SLUG };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("set_vitrine_slug", {
    p_organization_id: garde.organizationId,
    p_slug: parsed.data.slug,
    // DE LA SESSION. Jamais du corps de la requête.
    p_actor: garde.userId,
  });
  if (error) {
    reportError("vitrine.set-slug", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  const resultat = mapSetVitrineSlug(data);
  if (resultat.state !== "ok") {
    if (resultat.state === "error") {
      // Le seul état qui n'est PAS dans le contrat SQL : la RPC a répondu
      // quelque chose d'illisible. Il se journalise, contrairement aux trois
      // refus, qui sont des réponses normales à une saisie.
      reportError("vitrine.set-slug", "réponse illisible de set_vitrine_slug");
    }
    return { ok: false, error: MESSAGES_SLUG[resultat.state] };
  }

  const supabase = await createClient();
  // LE NOUVEAU SLUG SEULEMENT. L'ANCIEN garde ses pages en cache au plus une
  // fenêtre ISR (60 s), puis se résout en `unavailable` donc en 404 : la RPC ne
  // connaît plus cette adresse. Le contrat de `set_vitrine_slug` ne rend pas le
  // slug précédent, et le lire AVANT l'appel aurait ajouté un aller-retour à
  // chaque changement pour raccourcir d'une minute une page qui n'existe plus.
  await revaliderVitrine(supabase, garde.organizationId, resultat.slug);
  return { ok: true, data: resultat };
}

// ════════════════════════════════════════════════════════════
// L'IDENTITÉ ET LE THÈME
// ════════════════════════════════════════════════════════════

/**
 * Compose le thème à partir des champs du formulaire.
 *
 * ── UNE CLÉ ABSENTE PLUTÔT QU'UNE CLÉ VIDE ──
 *
 * Chaque sous-objet n'est posé QUE s'il porte quelque chose.
 * `is_valid_vitrine_theme` accepterait `{"couleurs":{}}`, mais ce document
 * dirait « le commerçant a personnalisé ses couleurs, avec rien » — un état de
 * plus à distinguer dans chaque lecture, et une comparaison « le thème a-t-il
 * changé » qui devient fausse. Un thème entièrement vide vaut `{}`, exactement
 * le défaut de la colonne.
 */
function composerTheme(
  saisie: ReturnType<typeof saveVitrineSettingsSchema.parse>,
): ThemeVitrine {
  const theme: ThemeVitrine = {};

  if (saisie.couleur_primary || saisie.couleur_secondary) {
    theme.couleurs = {};
    if (saisie.couleur_primary) theme.couleurs.primary = saisie.couleur_primary;
    if (saisie.couleur_secondary) {
      theme.couleurs.secondary = saisie.couleur_secondary;
    }
  }

  if (saisie.police_heading || saisie.police_body) {
    theme.polices = {};
    if (saisie.police_heading) theme.polices.heading = saisie.police_heading;
    if (saisie.police_body) theme.polices.body = saisie.police_body;
  }

  if (saisie.style_cartes) theme.style_cartes = saisie.style_cartes;
  // Une liste VIDE = ordre par défaut, donc clé OMISE : `resoudreThemeVitrine`
  // retombe déjà sur l'ordre naturel dans ce cas, et écrire `[]` en base aurait
  // stocké un réglage que personne n'a fait.
  if (saisie.ordre_blocs.length > 0) theme.ordre_blocs = saisie.ordre_blocs;

  // LE TÉMOIN D'ABORD : sans la section à l'écran, on ne touche pas à l'allure.
  // Voir `allure_rendue` dans le schéma — c'est ce qui empêche un formulaire
  // partiel d'éteindre sept réglages en silence.
  const allure = saisie.allure_rendue ? composerAllure(saisie) : undefined;
  if (allure) theme.allure = allure;

  return theme;
}

/**
 * L'allure — SEULS LES ÉCARTS AU DÉFAUT SONT ÉCRITS (VIT-13).
 *
 * ── POURQUOI PAS LES VINGT-CINQ, PUISQUE LE FORMULAIRE LES POSTE TOUS ──
 *
 * Deux raisons, et la seconde est la vraie.
 *
 *  1. Un document qui recopie vingt-cinq défauts fait croire à vingt-cinq
 *     décisions. La lecture « ce commerçant a-t-il personnalisé son allure ? »
 *     devient alors impossible à poser.
 *  2. Surtout : le jour où un défaut de la maquette change, AUCUNE vitrine déjà
 *     enregistrée n'en profiterait. Elles porteraient toutes l'ancienne valeur,
 *     figée, sans que personne l'ait voulue — et il faudrait une migration de
 *     données pour rattraper un changement de style.
 *
 * Le prix est qu'un commerçant qui remet volontairement un réglage sur le
 * défaut voit sa clé disparaître. C'est sans conséquence : le rendu est le
 * même, et il le redeviendrait si le défaut bougeait — ce qui est précisément
 * ce qu'on veut.
 *
 * `undefined` et non `{}` quand rien ne diffère : même contrat que `couleurs`
 * et `polices` au-dessus.
 */
function composerAllure(
  saisie: ReturnType<typeof saveVitrineSettingsSchema.parse>,
): AllureVitrine | undefined {
  const allure: AllureVitrine = {};
  let posee = false;

  for (const cle of VITRINE_ALLURE_ENUMS_CLES) {
    const valeur = saisie[cle];
    if (valeur && valeur !== VITRINE_ALLURE_ENUMS[cle].defaut) {
      // `never` : chaque clé porte sa propre union, et TypeScript ne peut pas
      // relier l'indice à la valeur dans une boucle. Le mot vient d'être
      // comparé à la MÊME table que celle qui type le champ.
      allure[cle] = valeur as never;
      posee = true;
    }
  }

  for (const cle of VITRINE_ALLURE_CHIFFRES) {
    const valeur = saisie[cle];
    if (valeur !== null && valeur !== VITRINE_ALLURE_BORNES[cle].defaut) {
      allure[cle] = valeur;
      posee = true;
    }
  }

  for (const cle of VITRINE_ALLURE_BOOLEENS) {
    const valeur = saisie[cle];
    if (valeur !== VITRINE_ALLURE_BOOLEENS_DEFAUTS[cle]) {
      allure[cle] = valeur;
      posee = true;
    }
  }

  return posee ? allure : undefined;
}

/**
 * Enregistre l'identité publique et le thème.
 *
 * NE CRÉE PAS LA LIGNE : `vitrine_settings` n'accorde `insert` à personne, et
 * c'est `set_vitrine_slug` qui la fait naître. Un enregistrement avant le choix
 * de l'adresse ne toucherait donc rien — et le DIRE est plus utile qu'un succès
 * qui n'a rien écrit, qui est le pire des deux : le commerçant repart en croyant
 * son texte enregistré.
 */
export async function saveVitrineSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = saveVitrineSettingsSchema.safeParse({
    accroche: formData.get("accroche"),
    histoire: formData.get("histoire"),
    horaires_texte: formData.get("horaires_texte"),
    couleur_primary: formData.get("couleur_primary"),
    couleur_secondary: formData.get("couleur_secondary"),
    police_heading: formData.get("police_heading"),
    police_body: formData.get("police_body"),
    style_cartes: formData.get("style_cartes"),
    ordre_blocs: formData.get("ordre_blocs"),
    secteur: formData.get("secteur"),
    badge_ouverture: formData.get("badge_ouverture"),
    allure_rendue: formData.get("allure_rendue"),
    // LES VINGT-CINQ CHAMPS D'ALLURE, LUS DEPUIS LA MÊME TABLE QUE LE SCHÉMA.
    // Les énumérer à la main ici aurait été le second endroit où la liste
    // existe — et un `formData.get` oublié ne fait RIEN rougir : le champ vaut
    // « non rendu », donc le défaut, donc un réglage qui ne s'enregistre pas.
    ...Object.fromEntries(
      VITRINE_ALLURE_CLES.map((cle) => [cle, formData.get(cle)]),
    ),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_settings")
    .update({
      // `""` → `null` : la colonne est nullable et `null` y dit « non
      // renseigné ». Écrire une chaîne vide aurait créé une seconde façon de
      // dire la même chose, que chaque lecture aurait eu à connaître.
      accroche: parsed.data.accroche || null,
      histoire: parsed.data.histoire || null,
      horaires_texte: parsed.data.horaires_texte || null,
      badge_ouverture: parsed.data.badge_ouverture || null,
      // `secteur` est `not null default 'commerce'` : `""` (champ non rendu)
      // vaut donc le défaut NEUTRE, jamais `null`, que la colonne refuserait.
      secteur: parsed.data.secteur || VITRINE_SECTEUR_DEFAUT,
      theme: toJson(composerTheme(parsed.data)),
    })
    .eq("organization_id", garde.organizationId)
    .select("slug")
    .maybeSingle();

  if (error) {
    reportError("vitrine.save-settings", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!data) return { ok: false, error: SANS_ADRESSE };

  await revaliderVitrine(supabase, garde.organizationId, data.slug);
  return { ok: true, data: undefined };
}

/**
 * Rend l'annuaire des jeux visible sur la Vitrine publique.
 *
 * Les portes publiques restent volontairement masquées tant que le commerçant
 * n'a rien demandé : elles peuvent contenir des libellés opérationnels. Ce
 * geste explicite ne touche qu'à la vitrine de l'organisation active et ajoute
 * `experiences` à la fin de l'ordre actuellement effectif ; il ne rend ni
 * Réserver ni un autre bloc visible par effet de bord.
 */
export async function activerExperiencesVitrine(): Promise<
  ActionResult<{ active: true }>
> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data: settings, error: lectureError } = await supabase
    .from("vitrine_settings")
    .select("slug, theme")
    .eq("organization_id", garde.organizationId)
    .maybeSingle();

  if (lectureError) {
    reportError("vitrine.activate-experiences.read", lectureError.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!settings) return { ok: false, error: SANS_ADRESSE };

  const theme = mapThemeVitrine(settings.theme);
  const ordreActuel =
    theme.ordre_blocs && theme.ordre_blocs.length > 0
      ? theme.ordre_blocs
      : [...VITRINE_BLOCS_DEFAUT];

  if (!ordreActuel.includes("experiences")) {
    const { error: ecritureError } = await supabase
      .from("vitrine_settings")
      .update({
        theme: toJson({
          ...theme,
          ordre_blocs: [...ordreActuel, "experiences"],
        }),
      })
      .eq("organization_id", garde.organizationId);

    if (ecritureError) {
      reportError("vitrine.activate-experiences.write", ecritureError.message);
      return { ok: false, error: GENERIC_ERROR };
    }
  }

  await revaliderVitrine(supabase, garde.organizationId, settings.slug);
  return { ok: true, data: { active: true } };
}

// ════════════════════════════════════════════════════════════
// LA PUBLICATION
// ════════════════════════════════════════════════════════════

async function ecrirePublication(
  publier: boolean,
): Promise<ActionResult<{ published: boolean }>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_settings")
    .update({ published: publier })
    .eq("organization_id", garde.organizationId)
    .select("slug, published")
    .maybeSingle();

  if (error) {
    reportError("vitrine.publication", error.message);
    // Le trigger `guard_module_publication` lève quand le droit `vitrine` a
    // cessé entre l'affichage du bouton et le clic. La garde d'entrée l'a déjà
    // vérifié : ce message couvre cette fenêtre-là, pas un contournement.
    return {
      ok: false,
      error: publier
        ? "Votre offre ne permet pas (ou plus) de publier la vitrine."
        : GENERIC_ERROR,
    };
  }
  if (!data) return { ok: false, error: SANS_ADRESSE };

  await revaliderVitrine(supabase, garde.organizationId, data.slug);
  return { ok: true, data: { published: data.published } };
}

/**
 * Rend la vitrine visible — sous réserve du droit, que le trigger SQL exige.
 *
 * AUCUNE ENTRÉE, délibérément : le sens du geste est dans le NOM de l'action,
 * pas dans un champ `publier` que le navigateur pourrait poster à l'envers.
 * C'est la même raison qui fait exister deux boutons plutôt qu'une bascule — et
 * c'est pourquoi l'écran porte deux adaptateurs de trois lignes plutôt que ces
 * actions un paramètre qu'elles n'utiliseraient jamais.
 */
export async function publishVitrine(): Promise<
  ActionResult<{ published: boolean }>
> {
  return ecrirePublication(true);
}

/** La retire du public. JAMAIS gardé : on ne bloque pas une dépublication. */
export async function unpublishVitrine(): Promise<
  ActionResult<{ published: boolean }>
> {
  return ecrirePublication(false);
}

// ════════════════════════════════════════════════════════════
// LES CARTES
// ════════════════════════════════════════════════════════════

export async function createVitrineCarte(
  _prev: ActionResult<VitrineCarteCreee> | null,
  formData: FormData,
): Promise<ActionResult<VitrineCarteCreee>> {
  const parsed = createVitrineCarteSchema.safeParse({
    nom: formData.get("nom"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data: derniere } = await supabase
    .from("vitrine_menus")
    .select("ordre")
    .eq("organization_id", garde.organizationId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  // `active` n'est pas envoyé : le défaut de la colonne est `true`, et une carte
  // créée invisible serait un piège — le commerçant la chercherait sur sa page.
  const { data, error } = await supabase
    .from("vitrine_menus")
    .insert({
      organization_id: garde.organizationId,
      nom: parsed.data.nom,
      ordre: rangSuivant(derniere?.ordre),
    })
    .select("id, nom, ordre, active")
    .single();
  if (error) {
    return {
      ok: false,
      error: messagePostgrest(
        "vitrine.create-carte",
        error,
        "Une carte porte déjà ce nom.",
      ),
    };
  }
  if (!data) return { ok: false, error: GENERIC_ERROR };

  // L'éditeur insère la ligne canonique rendue ci-dessous dans son état local.
  // Revalider depuis une Server Action provoquerait une navigation RSC, donc la
  // purge ISR publique est demandée séparément après le succès par le client.
  return { ok: true, data };
}

export async function updateVitrineCarte(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateVitrineCarteSchema.safeParse({
    id: formData.get("id"),
    nom: formData.get("nom"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_menus")
    // `ordre` est ABSENT, et le formulaire ne le poste pas : le rang est la
    // matière des flèches ↑↓, pas du formulaire de renommage. L'envoyer ici
    // aurait remis la carte à sa place d'avant à chaque changement de nom.
    .update({ nom: parsed.data.nom, active: parsed.data.active })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: messagePostgrest(
        "vitrine.update-carte",
        error,
        "Une carte porte déjà ce nom.",
      ),
    };
  }
  if (!data) return { ok: false, error: INTROUVABLE };

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * Supprime une carte VIDE.
 *
 * Le trigger `vitrine_menus_refuse_suppression_non_vide` refuse une carte qui
 * porte encore des rubriques et NOMME LE COMPTE dans son message. On garde ce
 * compte — le remplacer par un générique aurait retiré au commerçant la seule
 * information utile — mais on ne relaie PAS le texte de la base : il est
 * réécrit ici autour du seul chiffre extrait (`messageCarteNonVide`).
 */
export async function deleteVitrineCarte(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteVitrineCarteSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vitrine_menus")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId);

  if (error) {
    reportError("vitrine.delete-carte", error.message);
    if (error.code === "23503") {
      // Le compte de rubriques est la seule information utile du refus ; il est
      // EXTRAIT, jamais relayé — voir `messageCarteNonVide`.
      return { ok: false, error: messageCarteNonVide(error.message) };
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

// ════════════════════════════════════════════════════════════
// LES RUBRIQUES
// ════════════════════════════════════════════════════════════

export async function createVitrineRubrique(
  _prev: ActionResult<VitrineRubriqueCreee> | null,
  formData: FormData,
): Promise<ActionResult<VitrineRubriqueCreee>> {
  const parsed = createVitrineRubriqueSchema.safeParse({
    menu_id: formData.get("menu_id"),
    nom: formData.get("nom"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data: derniere } = await supabase
    .from("vitrine_categories")
    .select("ordre")
    .eq("menu_id", parsed.data.menu_id)
    .eq("organization_id", garde.organizationId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  // `organization_id` est POSÉ ICI et vient de la session : c'est lui qui, avec
  // `menu_id`, forme la FK composite — une carte du voisin fait échouer la
  // référence en 23503 au lieu d'être cousue en silence.
  const { data, error } = await supabase
    .from("vitrine_categories")
    .insert({
      menu_id: parsed.data.menu_id,
      organization_id: garde.organizationId,
      nom: parsed.data.nom,
      ordre: rangSuivant(derniere?.ordre),
    })
    .select("id, nom, ordre")
    .single();
  if (error) {
    return {
      ok: false,
      error: messagePostgrest(
        "vitrine.create-rubrique",
        error,
        "Cette carte porte déjà une rubrique de ce nom.",
      ),
    };
  }
  if (!data) return { ok: false, error: GENERIC_ERROR };

  // Voir `createVitrineCarte` : pas de revalidation dans cette réponse.
  return { ok: true, data };
}

export async function updateVitrineRubrique(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateVitrineRubriqueSchema.safeParse({
    id: formData.get("id"),
    nom: formData.get("nom"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_categories")
    // `menu_id` est ABSENT : la migration autorise le DÉPLACEMENT d'une rubrique
    // d'une carte à l'autre, mais aucun écran ne le propose dans ce lot, et
    // l'envoyer depuis un formulaire de renommage aurait ouvert un geste que
    // personne n'a demandé — sur un champ que le navigateur choisit.
    .update({ nom: parsed.data.nom, action: parsed.data.action })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: messagePostgrest(
        "vitrine.update-rubrique",
        error,
        "Cette carte porte déjà une rubrique de ce nom.",
      ),
    };
  }
  if (!data) return { ok: false, error: INTROUVABLE };

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * Supprime une rubrique — ET SES FICHES, par cascade.
 *
 * Aucune garde de comptage, contrairement à la carte : la migration tranche que
 * la cascade d'une rubrique « tient sur un écran », c'est-à-dire que le
 * commerçant VOIT ce qu'il retire au moment où il clique. Ce qui est fermé, à
 * l'étage du dessus, c'est le geste unique qui emporte une carte entière.
 */
export async function deleteVitrineRubrique(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteVitrineRubriqueSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vitrine_categories")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId);

  if (error) {
    reportError("vitrine.delete-rubrique", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

// ════════════════════════════════════════════════════════════
// LES FICHES
// ════════════════════════════════════════════════════════════

/** Les cases à cocher d'un vocabulaire fermé : `getAll`, jamais `get`. */
function vocabulaireDepuisFormData(formData: FormData, champ: string): string[] {
  return formData.getAll(champ).map((valeur) => String(valeur));
}

/**
 * Crée une fiche avec SON SEUL NOM.
 *
 * Le formulaire de création ne demande rien d'autre, et c'est un choix d'écran
 * assumé : prix, description, badges et allergènes se règlent ensuite, sous
 * « Modifier ». Un formulaire de création à huit champs fait renoncer à ajouter
 * le plat qu'on vient de mettre à la carte.
 */
export async function createVitrineFiche(
  _prev: ActionResult<VitrineFicheCreee> | null,
  formData: FormData,
): Promise<ActionResult<VitrineFicheCreee>> {
  const parsed = createVitrineFicheSchema.safeParse({
    categorie_id: formData.get("categorie_id"),
    nom: formData.get("nom"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data: derniere } = await supabase
    .from("vitrine_items")
    .select("ordre")
    .eq("categorie_id", parsed.data.categorie_id)
    .eq("organization_id", garde.organizationId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase.from("vitrine_items").insert({
    categorie_id: parsed.data.categorie_id,
    organization_id: garde.organizationId,
    nom: parsed.data.nom,
    // AUCUN UPLOAD D'IMAGE DANS CE LOT — voir l'en-tête du fichier.
    photo_path: null,
    // `disponible` n'est pas envoyé : le défaut de la colonne est `true`. Une
    // fiche créée grisée serait un plat qu'on ajoute pour dire qu'il manque.
    ordre: rangSuivant(derniere?.ordre),
  })
    .select("id, nom, ordre")
    .single();
  if (error) {
    return { ok: false, error: messagePostgrest("vitrine.create-fiche", error) };
  }
  if (!data) return { ok: false, error: GENERIC_ERROR };

  // Voir `createVitrineCarte` : pas de revalidation dans cette réponse.
  return {
    ok: true,
    data: {
      ...data,
      description: null,
      prix_affiche: null,
      photo_path: null,
      photo_alt: null,
      facettes: [],
      action: null,
      badges: [],
      allergenes: [],
      disponible: true,
    },
  };
}

export async function updateVitrineFiche(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateVitrineFicheSchema.safeParse({
    id: formData.get("id"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    prix_affiche: formData.get("prix_affiche"),
    badges: vocabulaireDepuisFormData(formData, "badges"),
    allergenes: vocabulaireDepuisFormData(formData, "allergenes"),
    facettes: vocabulaireDepuisFormData(formData, "facettes"),
    action: formData.get("action"),
    disponible: formData.get("disponible"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_items")
    .update({
      nom: parsed.data.nom,
      description: parsed.data.description || null,
      prix_affiche: parsed.data.prix_affiche || null,
      badges: parsed.data.badges,
      allergenes: parsed.data.allergenes,
      facettes: parsed.data.facettes,
      action: parsed.data.action,
      disponible: parsed.data.disponible,
      // `categorie_id`, `ordre` et `photo_path` sont ABSENTS, et pas par oubli :
      // le déplacement n'est offert par aucun écran de ce lot, le rang est la
      // matière des flèches ↑↓, et la photo n'a pas de pipeline. Les envoyer ici
      // aurait fait qu'éditer un libellé remette la fiche à sa place d'avant.
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: messagePostgrest("vitrine.update-fiche", error) };
  }
  if (!data) return { ok: false, error: INTROUVABLE };

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

export async function deleteVitrineFiche(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteVitrineFicheSchema.safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vitrine_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId);

  if (error) {
    reportError("vitrine.delete-fiche", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * Le geste rapide du service : griser un plat, ou le remettre.
 *
 * Il est à part du formulaire complet parce que le cahier le demande en toutes
 * lettres — « une action rapide permet de marquer un plat indisponible » — et
 * parce que passer par l'édition complète aurait fait ressaisir la fiche entière
 * en plein coup de feu.
 *
 * AUCUNE PROMESSE DE STOCK : rien ne décrémente ce drapeau, aucun cron ne le
 * touche, il ne se recharge pas. La fiche indisponible reste rendue au visiteur,
 * avec son drapeau — l'écran la grise plutôt que de la faire disparaître.
 */
export async function toggleVitrineFicheDisponibilite(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = toggleVitrineFicheDisponibiliteSchema.safeParse({
    id: formData.get("id"),
    disponible: formData.get("disponible"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_items")
    .update({ disponible: parsed.data.disponible })
    .eq("id", parsed.data.id)
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    reportError("vitrine.toggle-disponibilite", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!data) return { ok: false, error: INTROUVABLE };

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

// ════════════════════════════════════════════════════════════
// LE RÉORDONNANCEMENT
// ════════════════════════════════════════════════════════════

/**
 * Écrit le rang de N frères, l'INDEX faisant le rang.
 *
 * ── LIMITE CONNUE : CE GESTE N'EST PAS ATOMIQUE ──
 *
 * PostgREST ne sait pas écrire N valeurs différentes en une requête (pas de
 * `update … from (values …)`), et aucune RPC n'existe pour cela. Ce sont donc N
 * mises à jour indépendantes, chacune gardée par la RLS, par son filtre
 * `organization_id` et par son filtre de PARENT. Un échec au milieu laisse un
 * ordre PARTIEL — c'est le même arbitrage que `applyCampaignTemplate`, écrit ici
 * pour que personne ne le redécouvre.
 *
 * Ce qui rend la limite tolérable, et ce n'est pas de l'optimisme : le
 * réordonnancement n'écrit AUCUN fait client, seulement un rang. Un ordre à
 * moitié appliqué se répare en refaisant le geste, et l'écran est revalidé dans
 * tous les cas — le commerçant voit l'ordre RÉEL, jamais celui qu'il croyait
 * avoir posé.
 *
 * `parent` borne l'écriture aux frères d'une même carte ou rubrique. Il n'est
 * pas une garde de locataire (c'est `organization_id` qui la tient) mais une
 * garde de COHÉRENCE : sans lui, un identifiant glissé dans la liste
 * réordonnerait une ligne d'une autre carte du même commerce.
 */
async function ecrireRangs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cible: "cartes" | "rubriques" | "fiches",
  organizationId: string,
  parentId: string | null,
  ids: string[],
): Promise<string | null> {
  const echecs = await Promise.all(
    ids.map(async (id, ordre): Promise<string | null> => {
      // TROIS BRANCHES ÉCRITES À LA MAIN plutôt qu'un nom de table variable :
      // `supabase.from()` est typé PAR TABLE, et lui passer une union ferait
      // s'effondrer l'inférence de `.update()` — c'est-à-dire qu'on perdrait la
      // vérification qui garantit que `ordre` existe et est un entier. Un `as`
      // sur un chemin d'écriture coûte plus cher que trois lignes lisibles.
      if (cible === "cartes") {
        const { error } = await supabase
          .from("vitrine_menus")
          .update({ ordre })
          .eq("id", id)
          .eq("organization_id", organizationId);
        return error?.message ?? null;
      }
      if (cible === "rubriques") {
        const { error } = await supabase
          .from("vitrine_categories")
          .update({ ordre })
          .eq("id", id)
          .eq("organization_id", organizationId)
          .eq("menu_id", parentId ?? "");
        return error?.message ?? null;
      }
      const { error } = await supabase
        .from("vitrine_items")
        .update({ ordre })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("categorie_id", parentId ?? "");
      return error?.message ?? null;
    }),
  );
  return echecs.find((message) => message !== null) ?? null;
}

const ORDRE_PARTIEL =
  "L'ordre n'a pas pu être enregistré entièrement. Rechargez la page et réessayez.";

async function reordonner(
  cible: "cartes" | "rubriques" | "fiches",
  parentId: string | null,
  ids: string[],
): Promise<ActionResult> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const echec = await ecrireRangs(
    supabase,
    cible,
    garde.organizationId,
    parentId,
    ids,
  );

  // L'écran est revalidé AVANT le refus éventuel : un ordre partiellement écrit
  // doit être visible, sinon le commerçant relit le sien et recommence à
  // l'aveugle.
  await revaliderVitrine(supabase, garde.organizationId);

  if (echec) {
    reportError(`vitrine.reorder-${cible}`, echec);
    return { ok: false, error: ORDRE_PARTIEL };
  }
  return { ok: true, data: undefined };
}

export async function reorderVitrineCartes(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reorderVitrineCartesSchema.safeParse({
    order: formData.get("order"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return reordonner("cartes", null, parsed.data.order);
}

export async function reorderVitrineRubriques(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reorderVitrineRubriquesSchema.safeParse({
    menu_id: formData.get("menu_id"),
    order: formData.get("order"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return reordonner("rubriques", parsed.data.menu_id, parsed.data.order);
}

export async function reorderVitrineFiches(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reorderVitrineFichesSchema.safeParse({
    categorie_id: formData.get("categorie_id"),
    order: formData.get("order"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return reordonner("fiches", parsed.data.categorie_id, parsed.data.order);
}

// ════════════════════════════════════════════════════════════
// L'IMPORT D'UNE CARTE EN LOT (VIT-2, lot L12)
// ════════════════════════════════════════════════════════════

/** Ce que l'écran reçoit d'un import réussi : trois comptes et leur phrase. */
export interface ImportVitrineCarteResult {
  carte_id: string;
  rubriques_creees: number;
  fiches_creees: number;
  /** Déjà composé ici : l'écran affiche, il ne recompte pas. */
  message: string;
}

const IMPORT_REFUSE_FORME =
  "Le fichier n'a pas la forme attendue. Vérifiez les rubriques et les fiches, puis réessayez.";
const IMPORT_NOM_PRIS =
  "Une carte porte déjà ce nom. Renommez la carte du fichier, puis réessayez.";
const IMPORT_LIGNE_REFUSEE =
  "Import refusé : une ligne du fichier n'est pas acceptée. Vérifiez les noms, les prix, les badges et les allergènes.";

/** Le refus du seau d'import — il DATE la réessayabilité, comme celui du slug. */
const TROP_D_IMPORTS =
  "Trop d'imports en peu de temps. Réessayez dans une heure.";

const TROP_DE_TRADUCTIONS =
  "Trop de traductions automatiques en peu de temps. Réessayez dans une heure.";

/**
 * SANS CLÉ, RIEN NE PART — et ce n'est pas une panne.
 *
 * L'environnement n'a simplement pas activé la traduction automatique. La
 * Vitrine continue de servir le français, et l'éditeur manuel reste ouvert :
 * dire « erreur » aurait envoyé le commerçant chercher un défaut qui n'existe
 * pas.
 */
const TRADUCTION_NON_ACTIVEE =
  "La traduction automatique n'est pas activée. Vous pouvez traduire à la main ci-dessous.";

const TRADUCTION_INDISPONIBLE =
  "La traduction automatique n'a pas pu démarrer. Réessayez dans un instant.";

/**
 * DU NOM DE CONTRAINTE AU NOM DE CHAMP — une table FERMÉE, jamais un relais.
 *
 * ── CE QUI TRAVERSE, ET CE QUI NE TRAVERSE PAS ──
 *
 * La RPC rend `… rejected by constraint <nom>` précisément pour qu'un écran
 * d'import puisse pointer la bonne colonne du fichier : c'est un identifiant du
 * schéma, borné, écrit par nous. Il n'est pourtant PAS relayé — il sert de CLÉ
 * de recherche dans la table ci-dessous, et ce qui sort de l'action est une
 * phrase entièrement à nous. Un nom de contrainte affiché tel quel aurait
 * apporté au commerçant un nom de table et une convention Postgres au lieu du
 * mot qu'il cherche dans son fichier.
 *
 * ── POURQUOI UNE TABLE ET NON UNE DÉCOUPE DU NOM ──
 *
 * `vitrine_items_prix_affiche_check` se découpe très bien… jusqu'à
 * `vitrine_items_badges_check`, dont la colonne s'appelle `badges` mais dont la
 * règle porte sur un VOCABULAIRE, ce que « vérifiez les badges » dit et que
 * « badges » seul ne dit pas. Une table fermée refuse d'inventer une phrase pour
 * une contrainte qu'on n'a pas prévue : le repli générique reste utile, et il
 * est honnête.
 *
 * Les `check` de 20261011120000 sont ANONYMES — leur nom est celui que Postgres
 * dérive, `<table>_<colonne>_check`. Ceux qui ne peuvent pas venir d'un import
 * (`photo_path`, `ordre`) n'y sont pas : ces colonnes ne sont dans aucun rang du
 * payload, et leur donner une phrase aurait promis un champ que le fichier n'a
 * pas.
 */
const CHAMPS_PAR_CONTRAINTE: Record<string, string> = {
  vitrine_menus_nom_check: "le nom de la carte",
  vitrine_categories_nom_check: "le nom d'une rubrique",
  vitrine_items_nom_check: "le nom d'une fiche",
  vitrine_items_description_check: "la description d'une fiche",
  vitrine_items_prix_affiche_check: "le prix d'une fiche",
  vitrine_items_badges_check: "les badges d'une fiche",
  vitrine_items_allergenes_check: "les allergènes d'une fiche",
};

/**
 * La forme EXACTE que les deux `raise` de la RPC produisent, et rien d'autre.
 *
 * Bornée à des identifiants Postgres (`[a-z0-9_]`, 63 caractères au plus) : une
 * capture large aurait pu ramener n'importe quel fragment du message dans la
 * clé de recherche — sans effet ici, puisque seule une clé CONNUE produit une
 * phrase, mais l'ancre reste écrite serrée pour que ce soit vrai par
 * construction et non par chance.
 */
const CONTRAINTE_DU_MESSAGE = /rejected by constraint ([a-z0-9_]{1,63})/;

function messageContrainte(brut: string): string {
  const trouve = CONTRAINTE_DU_MESSAGE.exec(brut);
  const champ = trouve ? CHAMPS_PAR_CONTRAINTE[trouve[1]] : undefined;
  if (!champ) return IMPORT_LIGNE_REFUSEE;
  return `Import refusé : vérifiez ${champ} dans votre fichier.`;
}

/**
 * Les quatre refus d'`import_vitrine_carte`, traduits en messages BORNÉS.
 *
 * ── 42501 EST UNE ANOMALIE, PAS UNE SAISIE ──
 *
 * `gardeEditeurVitrine` a déjà tranché la session, le rôle et le droit. La RPC
 * rend ce code sur QUATRE causes, et non plus deux — depuis VIT-3 elle reçoit
 * un `p_actor` et le REVÉRIFIE en SQL : l'appel ne porte pas le `service_role`,
 * l'organisation de la SESSION n'existe plus, l'acteur est absent, ou il n'est
 * pas membre `owner`/`editor` de cette organisation-là (simple caissier, ou
 * membre d'une autre org). Le refus est INDISTINCT — c'est voulu, distinguer
 * apprendrait au demandeur ce qu'il n'est pas autorisé à savoir.
 *
 * Aucune des quatre ne se corrige depuis un écran d'import : ce n'est pas une
 * saisie à reprendre, c'est une anomalie que la garde aurait dû arrêter avant.
 * D'où l'erreur générique, et la journalisation.
 *
 * ── 22023 EST INDISTINCT ICI, ET C'EST LE PRIX ASSUMÉ ──
 *
 * La RPC en distingue quatre causes par des messages différents — forme,
 * rubriques homonymes, trop de rubriques, trop de fiches. Les rendre distinctes
 * à l'écran aurait demandé de lire son TEXTE, ce que ce fichier s'interdit
 * (revue L10, `deleteVitrineCarte`). Le schéma Zod porte donc les quatre refus
 * EN AMONT, avec leur message propre : un 22023 qui atteint cette ligne est un
 * écart entre le miroir et la base, pas une faute du commerçant.
 */
function messageImport(error: { code?: string; message: string }): string {
  reportError("vitrine.import-carte", error.message);
  if (error.code === "23514") return messageContrainte(error.message);
  if (error.code === "23505") return IMPORT_NOM_PRIS;
  if (error.code === "22023") return IMPORT_REFUSE_FORME;
  return GENERIC_ERROR;
}

/**
 * Lit le compte rendu de la RPC — DÉFENSIVEMENT, motif `mapSetVitrineSlug`.
 *
 * `Returns: Json` : le typage ne garantit rien de la forme, et un import qui
 * a RÉUSSI ne doit pas devenir un refus parce que sa réponse s'est mal lue. Les
 * comptes retombent donc à zéro plutôt que d'invalider le succès — la carte, elle,
 * est écrite, et l'écran est revalidé juste après.
 */
function lireComptesImport(brut: unknown): {
  carte_id: string;
  rubriques_creees: number;
  fiches_creees: number;
} {
  const root =
    typeof brut === "object" && brut !== null && !Array.isArray(brut)
      ? (brut as Record<string, unknown>)
      : null;
  const entier = (valeur: unknown): number =>
    typeof valeur === "number" && Number.isFinite(valeur)
      ? Math.max(0, Math.trunc(valeur))
      : 0;
  return {
    carte_id: typeof root?.carte_id === "string" ? root.carte_id : "",
    rubriques_creees: entier(root?.rubriques_creees),
    fiches_creees: entier(root?.fiches_creees),
  };
}

/**
 * Dépose une carte entière — ou rien.
 *
 * ── L'ORDRE DES QUATRE GARDES, ET POURQUOI ZOD N'EST PAS EN PREMIER ──
 *
 * Toutes les autres actions de ce fichier valident AVANT d'appeler la garde :
 * leurs entrées tiennent en un identifiant et un nom, et refuser tôt y coûte
 * moins cher. Celle-ci fait l'inverse, et c'est délibéré — son entrée est un
 * arbre qui peut peser des mégaoctets. `JSON.parse` puis la traversée de Zod se
 * paient AVANT tout verdict, donc les faire précéder le seau aurait laissé un
 * compte sans droit d'écriture faire brûler ce coût-là autant de fois qu'il veut.
 * L'ordre est : QUI (garde) → COMBIEN DE FOIS (seau) → QUOI (Zod) → la base.
 *
 * ── LE SEAU EST APRÈS LA GARDE, SUR LA CLÉ DU LOCATAIRE ──
 *
 * Même arbitrage que `setVitrineSlug` : la clé ne porte aucune valeur venue du
 * navigateur, elle n'est entamable que par un `owner`/`editor` de
 * l'organisation, et le `failClosed` qu'ADR-032 proscrit est celui qu'un inconnu
 * allume. Ce geste écrit jusqu'à 133 lignes et une ligne d'audit par appel —
 * voir `RATE_LIMITS.vitrineImport`.
 *
 * ── DEUX NIVEAUX D'AUTORISATION, PLUS UN SEUL (VIT-3) ──
 *
 * La garde applicative reste PREMIÈRE, et c'est elle qui exige le droit
 * `vitrine` — que la RPC ne connaît pas. Mais elle n'est plus la seule :
 * `import_vitrine_carte` reçoit désormais un `p_actor` et le REVÉRIFIE membre
 * `owner`/`editor` de l'organisation EN SQL, motif exact de `set_vitrine_slug`.
 *
 * `p_actor` VIENT DONC DE LA SESSION, jamais du formulaire : un acteur posté
 * aurait fait de la ligne d'audit — la seule trace d'un geste qui peut refaire
 * cent vingt fiches d'un coup — une déclaration sur l'honneur de l'appelant.
 * La RPC refuse en 42501 indistinct (acteur absent, d'une autre organisation,
 * ou simple caissier), qui retombe sur `GENERIC_ERROR` : ce n'est plus une
 * saisie à corriger, c'est une anomalie que la garde aurait dû arrêter avant.
 *
 * ── AUCUNE TRADUCTION N'EST ÉCRITE, ET LA COUVERTURE BAISSE ──
 *
 * Invariant de L11, pas un effet de bord : une carte importée naît non traduite.
 * L'action n'a rien à faire de plus que revalider — le sélecteur de langue
 * s'éteindra tout seul si la couverture passe sous le seuil, ce qui est
 * exactement ce qu'on veut d'une carte que personne n'a encore relue.
 */
export async function importVitrineCarte(
  _prev: ActionResult<ImportVitrineCarteResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportVitrineCarteResult>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const autorise = await rateLimit(
    rateLimitBucket("vitrine:import", garde.organizationId),
    RATE_LIMITS.vitrineImport,
    { failClosed: true },
  );
  if (!autorise) return { ok: false, error: TROP_D_IMPORTS };

  const parsed = importVitrineCarteSchema.safeParse({
    import: formData.get("import"),
  });
  if (!parsed.success) {
    // Tous les messages du schéma sont écrits par nous et bornés : aucun ne
    // recopie le fichier, y compris celui de la clé inconnue (voir l'en-tête de
    // `importVitrineCarteSchema`).
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_vitrine_carte", {
    // DE LA SESSION. Jamais du corps de la requête.
    p_organization_id: garde.organizationId,
    // LE PAYLOAD VALIDÉ, et non la chaîne postée : noms détourés, vocabulaires
    // dédoublonnés, clés inconnues déjà refusées.
    p_payload: toJson(parsed.data.import),
    // DE LA SESSION AUSSI, et la RPC le revérifie membre `owner`/`editor` en
    // SQL : la ligne d'audit ne recopie pas ce qu'on lui dit.
    p_actor: garde.userId,
  });
  if (error) return { ok: false, error: messageImport(error) };

  const comptes = lireComptesImport(data);
  const supabase = await createClient();
  await revaliderVitrine(supabase, garde.organizationId);

  // L'accord se fait ici, pas à l'écran : le message est composé une seule
  // fois, par la seule couche qui connaît les comptes réellement créés.
  const s = (n: number) => (n > 1 ? "s" : "");
  return {
    ok: true,
    data: {
      ...comptes,
      message: `Carte créée : ${comptes.rubriques_creees} rubrique${s(comptes.rubriques_creees)}, ${comptes.fiches_creees} fiche${s(comptes.fiches_creees)}.`,
    },
  };
}

// ════════════════════════════════════════════════════════════
// LES CONTENUS MIS EN AVANT (VIT-4, lot L14)
//
// Trois lignes au plus par commerce, indexées par leur PLACE. Aucun seau : le
// CRUD commerçant de ce dépôt n'en porte pas, et les deux gestes qui en ont un
// ici (`setVitrineSlug`, `importVitrineCarte`) le portent pour des raisons que
// ces deux-là n'ont pas — ils passent par le `service_role`, écrivent une ligne
// d'audit à chaque appel, et l'un répond une question sur un espace de noms
// GLOBAL. Écrire trois lignes bornées de son propre locataire, sous RLS et
// derrière `gardeEditeurVitrine`, n'est rien de tout cela.
// ════════════════════════════════════════════════════════════

const PLACE_PRISE =
  "Cette place vient d'être occupée. Rechargez la page et réessayez.";

/**
 * Pose ou remplace LE contenu d'une place — 1, 2 ou 3.
 *
 * ── POURQUOI UN `update` PUIS UN `insert`, ET NON UN `upsert` ──
 *
 * La sémantique VOULUE est bien celle d'un upsert par `(organisation, rang)` :
 * l'écran offre trois emplacements, et remplir un emplacement déjà rempli le
 * remplace. Ce n'est pas la sémantique qui a été écartée, c'est son ÉCRITURE
 * en une requête.
 *
 * `vitrine_contenus` n'accorde pas les mêmes colonnes à l'insertion et à la
 * mise à jour (20261015120000) : `grant insert (organization_id, rang, titre,
 * url)` mais `grant update (rang, titre, url)` — `organization_id` en est
 * délibérément absent, « le locataire d'une ligne ne se corrige pas ». Or
 * PostgREST traduit `.upsert()` en `insert … on conflict do update set` dont
 * la clause `set` reprend TOUTES les colonnes du payload, `organization_id`
 * comprise. Le privilège se vérifie sur la clause écrite, pas sur la valeur :
 * un remplacement aurait donc échoué en 42501 — sur le geste le PLUS courant
 * des trois, et seulement une fois la ligne existante, c'est-à-dire jamais au
 * premier essai.
 *
 * Le coût de la forme retenue est un aller-retour supplémentaire à la seule
 * CRÉATION (la mise à jour ne trouve rien, on insère). La course entre deux
 * onglets retombe sur l'unique `(organization_id, rang)` en 23505, qui a son
 * message — l'unicité reste tenue par la base, comme il se doit.
 */
export async function setVitrineContenu(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setVitrineContenuSchema.safeParse({
    rang: formData.get("rang"),
    titre: formData.get("titre"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  // `rang` N'EST PAS DANS LE PAYLOAD de cette mise à jour, alors que le `grant`
  // l'autoriserait : la place est la CLÉ du geste, pas sa matière. La déplacer
  // ici ferait qu'enregistrer un titre déplacerait le contenu.
  const { data, error } = await supabase
    .from("vitrine_contenus")
    .update({ titre: parsed.data.titre, url: parsed.data.url })
    .eq("organization_id", garde.organizationId)
    .eq("rang", parsed.data.rang)
    .select("id")
    .maybeSingle();

  if (error) {
    reportError("vitrine.set-contenu", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!data) {
    const { error: erreurInsertion } = await supabase
      .from("vitrine_contenus")
      .insert({
        // DE LA SESSION. Jamais du formulaire — voir l'invariant 1 de l'en-tête.
        organization_id: garde.organizationId,
        rang: parsed.data.rang,
        titre: parsed.data.titre,
        url: parsed.data.url,
      });
    if (erreurInsertion) {
      reportError("vitrine.set-contenu", erreurInsertion.message);
      return {
        ok: false,
        // La seule course possible : un second onglet a rempli la même place
        // entre la mise à jour et l'insertion. L'unique la refuse, et le
        // commerçant est envoyé relire ce qui existe plutôt qu'à réessayer.
        error: erreurInsertion.code === "23505" ? PLACE_PRISE : GENERIC_ERROR,
      };
    }
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * Retire le contenu d'une place.
 *
 * AUCUNE GARDE DE COMPTAGE, contrairement à `deleteVitrineCarte` : il n'y a
 * rien à compter avant de retirer un lien, et aucune cascade ne part d'ici — la
 * migration ouvre d'ailleurs `grant delete` sans condition pour cette raison.
 *
 * La suppression d'une place VIDE n'est pas une erreur : elle ne touche aucune
 * ligne et rend un succès. Le geste est idempotent, comme la bascule de
 * disponibilité — deux clics sur « retirer » laissent la place vide, et lire la
 * base pour pouvoir refuser le second aurait coûté un aller-retour pour rendre
 * un message que personne n'attend.
 */
export async function deleteVitrineContenu(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteVitrineContenuSchema.safeParse({
    rang: formData.get("rang"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vitrine_contenus")
    .delete()
    .eq("organization_id", garde.organizationId)
    .eq("rang", parsed.data.rang);

  if (error) {
    reportError("vitrine.delete-contenu", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

// ════════════════════════════════════════════════════════════
// LES TRADUCTIONS (VIT-5, lot L15)
//
// DEUX PORTES, PAS UNE. Poser et retirer sont deux gestes distincts parce que
// la migration l'a voulu ainsi : « un `p_texte` nul valant suppression aurait
// fait d'un bug d'appelant (texte perdu en chemin) un effacement silencieux de
// contenu publié ».
//
// AUCUN SEAU, pour la raison exacte des contenus mis en avant ci-dessus : c'est
// du CRUD commerçant sur son propre locataire, borné par le catalogue qu'il a
// lui-même saisi. Le `service_role` apparaît ici — les deux RPC l'exigent — mais
// il n'ouvre rien : elles vérifient l'appartenance de la cible EN SQL, par type,
// et lèvent 42501 sinon.
//
// LA GARDE PASSE AVANT LE SCHÉMA, comme pour l'import et contrairement au CRUD
// sous RLS. Les deux RPC tournent en `service_role` ; valider d'abord aurait
// offert à un non-membre un oracle gratuit sur les vocabulaires acceptés, pour
// un geste qu'il n'a de toute façon pas le droit de faire.
// ════════════════════════════════════════════════════════════

/**
 * Les refus des deux portes, un message chacun.
 *
 * `invalid_lang` n'est pas atteignable depuis un écran — l'action pose la langue
 * elle-même — et son message est donc le générique : le rendre parlant aurait
 * écrit une phrase que personne ne peut lire.
 */
const MESSAGES_TRADUCTION: Record<RefusTraductionVitrine, string> = {
  invalid_cible: "Cet élément ne peut pas porter de traduction.",
  invalid_champ: "Ce champ ne se traduit pas.",
  invalid_texte: `La traduction doit contenir de 1 à ${VITRINE_TRADUCTION_TEXTE_MAX} caractères.`,
  invalid_lang: GENERIC_ERROR,
  error: GENERIC_ERROR,
};

/**
 * Le 42501 des deux RPC : INDISTINCT, et rendu comme tel.
 *
 * Les fonctions lèvent le même code pour « la cible n'existe pas » et « la cible
 * appartient à quelqu'un d'autre », délibérément — « ce qu'on ne peut pas écrire
 * chez le voisin, on ne doit pas pouvoir l'effacer ». `INTROUVABLE` dit
 * exactement cela et rien de plus : il n'apprend l'existence d'aucun
 * identifiant, puisqu'il recouvre les deux cas. Le distinguer aurait fait de ces
 * actions l'oracle que le SQL refuse d'être.
 */
function messageTraduction(error: {
  code?: string;
  message: string;
}): string {
  return error.code === "42501" ? INTROUVABLE : GENERIC_ERROR;
}

/**
 * Pose ou remplace la traduction anglaise d'UN champ.
 *
 * ── LA VERSION EST REPOSTÉE TELLE QUELLE, ET C'EST TOUT LE MODÈLE ──
 *
 * `p_version_source` reçoit LA VERSION VUE : l'`updated_at` que l'état de
 * traduction portait au moment où l'écran a été rendu, jamais « maintenant » et
 * jamais une valeur relue ici. Une traduction vaut pour la version du texte
 * source que le commerçant avait sous les yeux — c'est ce que
 * `version_source >= cible.updated_at` mesure ensuite.
 *
 * Poser `now()` à la place aurait déclaré fraîche une traduction écrite sur un
 * français qui a changé entre l'affichage et l'envoi ; relire l'`updated_at`
 * courant aurait fait la même chose, en plus cher. Le seul comportement honnête
 * est celui-ci : si la source a bougé, la traduction naît périmée et l'écran le
 * dira au prochain chargement.
 *
 * ── LA LANGUE VIENT D'ICI, PAS DU FORMULAIRE ──
 *
 * `VITRINE_LANGUE_TRADUITE` est la seule langue que le `check` accepte. La lire
 * du POST aurait ajouté un champ à valider et un refus (`invalid_lang`) que rien
 * ne peut provoquer.
 */
export async function setVitrineTraduction(
  _prev: ActionResult<{ created: boolean; changed: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ created: boolean; changed: boolean }>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = setVitrineTraductionSchema.safeParse({
    cible_type: formData.get("cible_type"),
    cible_id: formData.get("cible_id"),
    champ: formData.get("champ"),
    texte: formData.get("texte"),
    version: formData.get("version"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("upsert_vitrine_translation", {
    // DE LA SESSION. Jamais du corps de la requête.
    p_organization_id: garde.organizationId,
    p_cible_type: parsed.data.cible_type,
    p_cible_id: parsed.data.cible_id,
    // D'ICI, voir ci-dessus.
    p_lang: VITRINE_LANGUE_TRADUITE,
    p_champ: parsed.data.champ,
    p_texte: parsed.data.texte,
    // LA VERSION VUE, intacte : ni reformatée, ni remplacée par l'instant
    // courant. Voir l'en-tête. La RPC la borne de toute façon à l'updated_at
    // réel de la cible (revue L15, M1) — une version future forgée naît
    // fraîche et périt à la prochaine édition du français.
    p_version_source: parsed.data.version,
    // L'ACTEUR DE LA SESSION, revérifié owner|editor en SQL (revue L15, M2).
    p_actor: garde.userId,
  });
  if (error) {
    reportError("vitrine.set-traduction", error.message);
    return { ok: false, error: messageTraduction(error) };
  }

  const resultat = mapUpsertVitrineTraduction(data);
  if (resultat.state !== "ok") {
    if (resultat.state === "error") {
      reportError(
        "vitrine.set-traduction",
        "réponse illisible de upsert_vitrine_translation",
      );
    }
    return { ok: false, error: MESSAGES_TRADUCTION[resultat.state] };
  }

  const supabase = await createClient();
  // LES DEUX PAGES PUBLIQUES ET LE TABLEAU DE BORD, même sur `changed: false`.
  // Une traduction touche la page `/en` (le champ change de langue) ET la page
  // française (la couverture décide du sélecteur de langue). Conditionner la
  // purge au drapeau aurait fait dépendre la fraîcheur d'une page publique d'un
  // état que le commerçant ne voit pas, pour économiser une lecture de slug sur
  // le seul cas où il réenregistre un texte identique.
  await revaliderVitrine(supabase, garde.organizationId);
  return {
    ok: true,
    data: { created: resultat.created, changed: resultat.changed },
  };
}

/**
 * Retire la traduction anglaise d'UN champ — le français reprend sa place.
 *
 * IDEMPOTENT PAR CONTRAT : retirer une traduction absente est un succès qui rend
 * `deleted: false`, sans exception et sans ligne de journal. L'écran a besoin de
 * la distinction — « retirée » et « il n'y avait rien à retirer » ne se disent
 * pas pareil — et c'est pour cela que le drapeau remonte jusqu'ici.
 *
 * AUCUN `texte`, AUCUNE `version` dans le formulaire : le retrait ne dépend ni
 * de l'un ni de l'autre. Les demander aurait fait échouer le geste le jour où la
 * source a bougé — exactement le jour où l'on veut pouvoir retirer une
 * traduction devenue fausse.
 */
export async function deleteVitrineTraduction(
  _prev: ActionResult<{ deleted: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: boolean }>> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = deleteVitrineTraductionSchema.safeParse({
    cible_type: formData.get("cible_type"),
    cible_id: formData.get("cible_id"),
    champ: formData.get("champ"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_vitrine_translation", {
    // DE LA SESSION. Jamais du corps de la requête.
    p_organization_id: garde.organizationId,
    p_cible_type: parsed.data.cible_type,
    p_cible_id: parsed.data.cible_id,
    p_lang: VITRINE_LANGUE_TRADUITE,
    p_champ: parsed.data.champ,
    // L'ACTEUR DE LA SESSION, revérifié owner|editor en SQL (revue L15, M2).
    p_actor: garde.userId,
  });
  if (error) {
    reportError("vitrine.delete-traduction", error.message);
    return { ok: false, error: messageTraduction(error) };
  }

  const resultat = mapDeleteVitrineTraduction(data);
  if (resultat.state !== "ok") {
    if (resultat.state === "error") {
      reportError(
        "vitrine.delete-traduction",
        "réponse illisible de delete_vitrine_translation",
      );
    }
    return { ok: false, error: MESSAGES_TRADUCTION[resultat.state] };
  }

  const supabase = await createClient();
  // Même sur `deleted: false` — voir `setVitrineTraduction`.
  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: { deleted: resultat.deleted } };
}

/**
 * TRADUIRE AUTOMATIQUEMENT CE QUI MANQUE (VIT-6).
 *
 * ── POURQUOI LE COMMERÇANT DÉCLENCHE, ET PAS LE VISITEUR ──
 *
 * Faire traduire par le visiteur qui choisit « English » aurait ouvert un point
 * d'entrée ANONYME sur une API facturée au caractère, et fait attendre le
 * premier visiteur pendant l'aller-retour. Ici, le commerçant clique une fois :
 * toute sa carte est traduite, mise en cache dans `vitrine_translations`, et
 * chaque visiteur suivant lit l'anglais instantanément, sans un caractère
 * facturé de plus. La dépense est déclenchée par quelqu'un d'identifié, sur sa
 * propre organisation.
 *
 * ── CE QUI PART, ET CE QUI NE PART PAS ──
 *
 * Seulement les champs `absent` ou `perime` de `vitrine_translation_state` :
 * ce qui est déjà frais ne repart pas. Prix, disponibilité, badges et
 * allergènes ne sont pas traduisibles — la base l'impose par un `check`, et
 * aucune information alimentaire n'est jamais déduite d'un texte.
 *
 * ── TROIS BORNES, ET UN ARRÊT PROPRE ──
 *
 * Un seau par organisation (dépense), un plafond de caractères et un plafond de
 * champs par appel (volume). Sans clé, rien ne part et l'écran le dit. Si le
 * fournisseur tombe en cours de route, ce qui a été écrit RESTE écrit et le
 * compte rendu dit combien : perdre dix traductions déjà payées pour cause de
 * onzième en échec serait le pire des deux mondes.
 *
 * ── LA VERSION VUE, ENCORE ──
 *
 * `p_version_source` reçoit la version que l'état PORTAIT à la lecture, comme
 * pour une traduction manuelle. Si le français a bougé entre-temps, la
 * traduction naît périmée — exact, et préférable à une fraîcheur déclarée sur
 * un texte jamais lu.
 */
export async function traduireVitrineAutomatiquement(
  _prev: ActionResult<{ message: string; caracteres: number }> | null,
  _formData: FormData,
): Promise<ActionResult<{ message: string; caracteres: number }>> {
  // AUCUNE ENTRÉE, ET C'EST VOULU. Le geste est « traduis ce qui manque » : la
  // liste des champs se lit en base, jamais dans le formulaire. Un paramètre
  // posté aurait permis de désigner une cible, donc à valider, donc à refuser.
  // Motif `void` de `play-context.ts` pour la signature imposée par
  // `useActionForm`.
  void _prev;
  void _formData;

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  // APRÈS la garde, sur la clé du locataire authentifié — motif `vitrine:slug`.
  const autorise = await rateLimit(
    rateLimitBucket("vitrine:traduction-auto", garde.organizationId),
    RATE_LIMITS.vitrineTraductionAuto,
    { failClosed: true },
  );
  if (!autorise) return { ok: false, error: TROP_DE_TRADUCTIONS };

  const fournisseur = fournisseurConfigure();
  if (!fournisseur) return { ok: false, error: TRADUCTION_NON_ACTIVEE };

  const admin = createAdminClient();
  const { data: brut, error: erreurEtat } = await admin.rpc(
    "vitrine_translation_state",
    { p_organization_id: garde.organizationId },
  );
  if (erreurEtat) {
    reportError("vitrine.traduction-auto", erreurEtat.message);
    return { ok: false, error: TRADUCTION_INDISPONIBLE };
  }

  const selection = champsATraduire(mapVitrineTraductionState(brut));
  if (selection.retenus.length === 0) {
    return {
      ok: true,
      data: { message: messageCompteRendu(0, 0, false), caracteres: 0 },
    };
  }

  let ecrits = 0;
  let caracteres = 0;
  let interrompu = false;

  for (const lot of decouperEnLots(selection.retenus, TRADUCTION_LOT)) {
    let traduits: string[];
    try {
      traduits = await fournisseur.traduire(
        lot.map((champ) => champ.texte),
        "fr",
        VITRINE_LANGUE_TRADUITE,
      );
    } catch (cause) {
      reportError(
        "vitrine.traduction-auto",
        cause instanceof Error ? cause.message : "fournisseur injoignable",
      );
      interrompu = true;
      break;
    }

    for (let i = 0; i < lot.length; i += 1) {
      const champ = lot[i];
      // Borné à la contrainte de la colonne : une traduction plus longue que
      // 2000 serait refusée par la base, et perdre le lot entier pour un champ
      // trop bavard coûterait plus cher que de le couper.
      const texte = (traduits[i] ?? "").trim().slice(0, VITRINE_TRADUCTION_TEXTE_MAX);
      if (!texte) continue;

      const { error: erreurEcriture } = await admin.rpc(
        "upsert_vitrine_translation",
        {
          p_organization_id: garde.organizationId,
          p_cible_type: champ.cibleType,
          p_cible_id: champ.cibleId,
          p_lang: VITRINE_LANGUE_TRADUITE,
          p_champ: champ.champ,
          p_texte: texte,
          p_version_source: champ.version,
          p_actor: garde.userId,
        },
      );
      if (erreurEcriture) {
        reportError("vitrine.traduction-auto", erreurEcriture.message);
        continue;
      }
      ecrits += 1;
      caracteres += champ.texte.length;
    }
  }

  const supabase = await createClient();
  await revaliderVitrine(supabase, garde.organizationId);

  const message = messageCompteRendu(
    ecrits,
    caracteres,
    selection.tronquee || interrompu,
  );
  return { ok: true, data: { message, caracteres } };
}

/* ────────────────────────────────────────────────────────────
   LES PHOTOS (VIT-7)

   Les colonnes `photo_path` et `cover_path` existaient depuis
   20261011120000, bornées et accordées en écriture, et valaient `null`
   partout : « la photo n'a pas de pipeline ». Ces deux actions sont ce
   pipeline, et l'en-tête de ce fichier cesse d'être vrai sur ce point.

   TROIS TEMPS, ET L'ORDRE COMPTE :

     1. déposer les fichiers ;
     2. écrire la ligne ;
     3. effacer l'ANCIENNE photo — seulement si (2) a réussi.

   L'inverse — effacer d'abord — aurait laissé une fiche sans image et
   sans moyen de revenir en arrière au premier échec d'écriture. Et si
   (2) échoue, ce sont les fichiers NEUFS qui redescendent : on ne laisse
   jamais d'orphelins dans le bucket.
   ──────────────────────────────────────────────────────────── */

const PHOTO_ERREUR = "Cette photo n'a pas pu être enregistrée.";
const TROP_DE_PHOTOS =
  "Trop d'envois d'images en peu de temps. Réessayez dans une heure.";

/** Le chemin actuellement en base, pour savoir quoi effacer ensuite. */
async function photoCourante(
  admin: ReturnType<typeof createAdminClient>,
  cible: "fiche" | "couverture",
  organizationId: string,
  ficheId?: string,
): Promise<string | null> {
  if (cible === "couverture") {
    const { data } = await admin
      .from("vitrine_settings")
      .select("cover_path")
      .eq("organization_id", organizationId)
      .maybeSingle();
    return (data?.cover_path as string | null) ?? null;
  }
  const { data } = await admin
    .from("vitrine_items")
    .select("photo_path")
    .eq("id", ficheId ?? "")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data?.photo_path as string | null) ?? null;
}

/**
 * Pose ou remplace la photo d'une fiche, ou la couverture du lieu.
 *
 * ── LE QUOTA EST VÉRIFIÉ AVANT LA CONVERSION ──
 *
 * Convertir puis refuser aurait fait payer deux redimensionnements `sharp`
 * pour rien. Et il n'est vérifié que sur un AJOUT : remplacer la photo d'une
 * fiche qui en a déjà une ne change pas le compte, et refuser un remplacement
 * à un commerçant au quota l'aurait enfermé — il ne pourrait plus corriger une
 * image ratée sans d'abord en supprimer une autre.
 */
export async function setVitrinePhoto(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setVitrinePhotoSchema.safeParse({
    cible: formData.get("cible"),
    fiche_id: formData.get("fiche_id") ?? undefined,
    image: formData.get("image"),
    alt: formData.get("alt"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  // APRÈS la garde, sur la clé du locataire — motif `vitrine:slug`. Un envoi
  // d'image coûte deux conversions et deux écritures Storage : c'est le geste
  // le plus cher de l'écran.
  const autorise = await rateLimit(
    rateLimitBucket("vitrine:photo", garde.organizationId),
    RATE_LIMITS.vitrinePhoto,
    { failClosed: true },
  );
  if (!autorise) return { ok: false, error: TROP_DE_PHOTOS };

  const admin = createAdminClient();
  const cible = parsed.data.cible;
  const ficheId = cible === "fiche" ? parsed.data.fiche_id : undefined;
  const ancienne = await photoCourante(admin, cible, garde.organizationId, ficheId);

  let depot;
  try {
    if (cible === "fiche" && !ancienne) {
      await verifierQuotaPhotos(garde.organizationId, admin);
    }
    depot = await deposerPhotoVitrine(
      parsed.data.image,
      { organizationId: garde.organizationId, couverture: cible === "couverture" },
      admin,
    );
  } catch (cause) {
    if (cause instanceof VitrinePhotoError) {
      return { ok: false, error: cause.message };
    }
    reportError("vitrine.photo", cause instanceof Error ? cause.message : "dépôt");
    return { ok: false, error: PHOTO_ERREUR };
  }

  const alt = parsed.data.alt || null;
  const supabase = await createClient();
  const { data, error } =
    cible === "couverture"
      ? await supabase
          .from("vitrine_settings")
          .update({ cover_path: depot.chemin, cover_alt: alt })
          .eq("organization_id", garde.organizationId)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("vitrine_items")
          .update({ photo_path: depot.chemin, photo_alt: alt })
          .eq("id", ficheId ?? "")
          .eq("organization_id", garde.organizationId)
          .select("id")
          .maybeSingle();

  if (error || !data) {
    // L'écriture a échoué : les fichiers neufs n'ont plus de porteur.
    await effacerPhotos(depot.deposees, admin);
    if (error) reportError("vitrine.photo", error.message);
    return { ok: false, error: PHOTO_ERREUR };
  }

  // SEULEMENT MAINTENANT. L'ancienne image n'est plus référencée par personne.
  if (ancienne) await effacerPhotos(cheminsDeLaPhoto(ancienne), admin);

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * Retire une photo.
 *
 * MÊME ORDRE, INVERSÉ DE LA MÊME FAÇON : la ligne d'abord, les fichiers
 * ensuite. Effacer le fichier puis échouer sur l'écriture aurait laissé une
 * fiche pointant vers une image qui n'existe plus — une case cassée sur une
 * page publique, ce qui est pire que la photo qu'on voulait retirer.
 */
export async function deleteVitrinePhoto(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteVitrinePhotoSchema.safeParse({
    cible: formData.get("cible"),
    fiche_id: formData.get("fiche_id") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const admin = createAdminClient();
  const cible = parsed.data.cible;
  const ficheId = cible === "fiche" ? parsed.data.fiche_id : undefined;
  const ancienne = await photoCourante(admin, cible, garde.organizationId, ficheId);

  const supabase = await createClient();
  const { data, error } =
    cible === "couverture"
      ? await supabase
          .from("vitrine_settings")
          .update({ cover_path: null, cover_alt: null })
          .eq("organization_id", garde.organizationId)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("vitrine_items")
          .update({ photo_path: null, photo_alt: null })
          .eq("id", ficheId ?? "")
          .eq("organization_id", garde.organizationId)
          .select("id")
          .maybeSingle();

  if (error || !data) {
    if (error) reportError("vitrine.photo", error.message);
    return { ok: false, error: PHOTO_ERREUR };
  }

  if (ancienne) await effacerPhotos(cheminsDeLaPhoto(ancienne), admin);

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

/**
 * VIT-12 — L'ACCORD D'INDEXATION, POSÉ OU RETIRÉ.
 *
 * ── CE QUE CETTE ACTION NE DÉCIDE PAS ──
 *
 * Elle enregistre un VOULOIR, pas un résultat. La page publique exige en plus
 * `published` et une carte qui vaut d'être trouvée : cocher la case sur une
 * vitrine vide ne l'indexe pas, et l'écran dit ce qui manque plutôt que de
 * refuser l'enregistrement. Séparer les deux évite le pire des messages —
 * « impossible » sur un geste qui, lui, est parfaitement possible.
 *
 * ── LE RETRAIT EST IMMÉDIAT CÔTÉ APPLICATION, ET SEULEMENT LÀ ──
 *
 * `revaliderVitrine` purge le cache ISR : le chargement suivant sert
 * `noindex`. L'oubli par les moteurs ne se commande pas — il dépend de leur
 * prochaine visite — et rien ici ne promet le contraire.
 */
export async function setVitrineIndexation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setVitrineIndexationSchema.safeParse({
    indexable: formData.get("indexable"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vitrine_settings")
    .update({ indexable: parsed.data.indexable })
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error) reportError("vitrine.indexation", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

// ════════════════════════════════════════════════════════════
// LA SUPPRESSION (VIT-14)
// ════════════════════════════════════════════════════════════

/**
 * Supprime la Vitrine de l'organisation active — les sept tables du module.
 *
 * ── ELLE PASSE PAR UNE RPC, ET C'EST LA SEULE FAÇON ──
 *
 * `authenticated` n'a AUCUN `delete` sur `vitrine_settings`, et ce lot ne le lui
 * donne pas : `security_acl.test.sql` garde cette absence depuis VIT-1a. La
 * suppression passe donc par `delete_vitrine`, `security definer`, qui revérifie
 * le rôle EN SQL et écrit sa ligne d'audit.
 *
 * Deux raisons de plus, et la seconde est décisive. Une vitrine vit dans sept
 * tables dont AUCUNE ne référence `vitrine_settings` — elles pendent à
 * l'organisation — donc supprimer la ligne de réglages depuis ici aurait laissé
 * le catalogue orphelin. Et sept suppressions successives depuis le client ne
 * sont pas atomiques : une coupure au milieu laisse une vitrine à moitié
 * effacée. La RPC les tient dans une transaction.
 *
 * ── LE SLUG EST RELU AVANT, PAS APRÈS ──
 *
 * `revaliderVitrinePublique` a besoin de l'adresse pour purger le cache ISR de
 * `/v/{slug}`. Après la suppression, cette adresse n'existe plus nulle part :
 * on la prend donc dans la réponse de la RPC, qui la rend précisément pour ça.
 * Sans elle, la page resterait servie depuis le cache jusqu'à une minute après
 * la suppression — un commerçant qui vérifie tout de suite verrait sa vitrine
 * toujours en ligne, et conclurait que le bouton n'a rien fait.
 *
 * ── `absente` N'EST PAS UNE ERREUR ──
 *
 * Deux onglets, deux clics : le second doit rendre un succès, pas
 * « Suppression impossible » sur une vitrine déjà supprimée. C'est aussi ce que
 * répond la RPC quand le commerçant n'a jamais créé d'adresse.
 */
export async function deleteVitrine(): Promise<ActionResult> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_vitrine", {
    p_organization_id: garde.organizationId,
    // DE LA SESSION. Jamais du corps de la requête — la RPC le revérifie
    // `owner` en SQL, et un acteur posté ferait de la ligne d'audit une
    // déclaration sur l'honneur.
    p_actor: garde.userId,
  });

  if (error) {
    reportError("vitrine.delete", error.message);
    // 42501 : la RPC a refusé le rôle. `gardeEditeurVitrine` laisse passer
    // `editor`, la RPC exige `owner` — c'est délibéré (le geste ne se répare
    // pas), et c'est le seul refus que l'écran doit savoir nommer.
    if (error.code === "42501") return { ok: false, error: SUPPRESSION_OWNER };
    return { ok: false, error: GENERIC_ERROR };
  }

  const etat = mapDeleteVitrine(data);
  if (etat.state === "error") {
    reportError("vitrine.delete", "réponse illisible de delete_vitrine");
    return { ok: false, error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  // `absente` n a rien supprimé, donc rien à purger : on ne passe l adresse
  // que dans le cas `ok`, où la RPC vient précisément de la rendre pour ça.
  await revaliderVitrine(
    supabase,
    garde.organizationId,
    etat.state === "ok" ? etat.slug : null,
  );
  return { ok: true, data: undefined };
}

/**
 * REVENIR AUX COULEURS ET AUX POLICES DU MÉTIER (VIT-14).
 *
 * ── LE DÉFAUT QU'ELLE FERME, ET IL A ÉTÉ SIGNALÉ EN PRODUCTION ──
 *
 * Le préréglage de secteur ne remplit qu'un VIDE. Or, pour la plupart des
 * commerçants, ce vide était déjà rempli : l'écran de réglages prérempli le
 * sélecteur de couleur avec la valeur RÉSOLUE, donc le simple fait d'avoir
 * enregistré ses réglages une fois a gravé l'ancien défaut `#211d16` en base.
 * Le préréglage ne pouvait plus jamais s'appliquer, et un `<input type="color">`
 * n'a aucun moyen d'être « vidé » : la couleur ne pouvait pas être retirée.
 *
 * Un commerçant a signalé exactement cela — sa vitrine gardait un quasi-noir
 * sur un bleu de nuit, où les titres de rubriques et les prix sont illisibles.
 *
 * ── ELLE RETIRE, ELLE N'ÉCRIT PAS ──
 *
 * `couleurs` et `polices` sont OMISES du thème, elles ne sont pas remplies avec
 * les valeurs du préréglage. C'est le même arbitrage que l'allure : ce qui est
 * absent suit le défaut, et suivra le défaut du jour où il changera. Réécrire
 * la palette du métier aurait figé le commerçant sur celle d'aujourd'hui.
 *
 * Le reste du thème — style de cartes, ordre des blocs, allure — est CONSERVÉ :
 * ce bouton parle de couleurs, et emporter la mise en page avec elles serait
 * une surprise.
 */
export async function resetVitrineCouleurs(): Promise<ActionResult> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const supabase = await createClient();
  const { data: ligne, error: lecture } = await supabase
    .from("vitrine_settings")
    .select("slug, theme")
    .eq("organization_id", garde.organizationId)
    .maybeSingle();

  if (lecture) {
    reportError("vitrine.reset-couleurs", lecture.message);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!ligne) return { ok: false, error: SANS_ADRESSE };

  // On repart du thème LU et on en retire deux clés : tout ce que le commerçant
  // a réglé par ailleurs doit survivre, y compris ce que cette version du code
  // ne connaîtrait pas encore.
  const theme = mapThemeVitrine(ligne.theme);
  delete theme.couleurs;
  delete theme.polices;

  const { error } = await supabase
    .from("vitrine_settings")
    .update({ theme: toJson(theme) })
    .eq("organization_id", garde.organizationId);

  if (error) {
    reportError("vitrine.reset-couleurs", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await revaliderVitrine(supabase, garde.organizationId, ligne.slug);
  return { ok: true, data: undefined };
}
