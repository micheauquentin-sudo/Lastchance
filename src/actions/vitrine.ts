"use server";

import { revalidatePath } from "next/cache";
import { reportError } from "@/lib/monitoring";
import { rateLimit, rateLimitBucket, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/json";
import type { ActionResult } from "@/lib/utils";
import {
  cheminsPublicsVitrine,
  mapSetVitrineSlug,
  VITRINE_ORDRE_MAX,
  VITRINE_PUBLIQUE_OUVERTE,
  type SetVitrineSlugResult,
  type ThemeVitrine,
} from "@/lib/vitrine";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";
import {
  createVitrineCarteSchema,
  createVitrineFicheSchema,
  createVitrineRubriqueSchema,
  deleteVitrineCarteSchema,
  deleteVitrineFicheSchema,
  deleteVitrineRubriqueSchema,
  importVitrineCarteSchema,
  reorderVitrineCartesSchema,
  reorderVitrineFichesSchema,
  reorderVitrineRubriquesSchema,
  saveVitrineSettingsSchema,
  setVitrineSlugSchema,
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
const INTROUVABLE = "Élément introuvable.";
const RATTACHEMENT_INTROUVABLE =
  "La carte ou la rubrique de destination est introuvable.";

const CHEMIN_DASHBOARD = "/dashboard/vitrine";

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
 * LES DEUX LANGUES, pas seulement la française : `cheminsPublicsVitrine` dérive
 * la liste de `VITRINE_LANGUES`. Ne purger que `/v/{slug}` aurait laissé la page
 * anglaise servir l'ancien prix — l'incohérence la plus difficile à voir, parce
 * que c'est celle que le commerçant francophone ne regarde jamais.
 *
 * ── LE DRAPEAU RESTE TESTÉ, ET IL SERT ENCORE ──
 *
 * `VITRINE_PUBLIQUE_OUVERTE` refermé, aucune page publique n'existe : rien n'est
 * en cache, il n'y a rien à purger, et cette lecture du slug serait payée pour
 * rien à chaque clic. La garde n'est donc pas un vestige — c'est ce qui rend
 * l'interrupteur d'urgence gratuit.
 *
 * `slugConnu` évite la lecture quand l'appelant l'a déjà en main.
 */
async function revaliderVitrine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  slugConnu?: string | null,
): Promise<void> {
  revalidatePath(CHEMIN_DASHBOARD);
  if (!VITRINE_PUBLIQUE_OUVERTE) return;

  let slug = slugConnu ?? null;
  if (!slug) {
    const { data } = await supabase
      .from("vitrine_settings")
      .select("slug")
      .eq("organization_id", organizationId)
      .maybeSingle();
    slug = data?.slug ?? null;
  }
  // Pas d'adresse = pas de page publique : `set_vitrine_slug` est le seul geste
  // qui fasse naître la ligne, et il passe son slug en `slugConnu`.
  if (!slug) return;
  for (const chemin of cheminsPublicsVitrine(slug)) revalidatePath(chemin);
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

  return theme;
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
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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
  const { error } = await supabase.from("vitrine_menus").insert({
    organization_id: garde.organizationId,
    nom: parsed.data.nom,
    ordre: rangSuivant(derniere?.ordre),
  });
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

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
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
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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
  const { error } = await supabase.from("vitrine_categories").insert({
    menu_id: parsed.data.menu_id,
    organization_id: garde.organizationId,
    nom: parsed.data.nom,
    ordre: rangSuivant(derniere?.ordre),
  });
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

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
}

export async function updateVitrineRubrique(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateVitrineRubriqueSchema.safeParse({
    id: formData.get("id"),
    nom: formData.get("nom"),
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
    .update({ nom: parsed.data.nom })
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
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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

  const { error } = await supabase.from("vitrine_items").insert({
    categorie_id: parsed.data.categorie_id,
    organization_id: garde.organizationId,
    nom: parsed.data.nom,
    // AUCUN UPLOAD D'IMAGE DANS CE LOT — voir l'en-tête du fichier.
    photo_path: null,
    // `disponible` n'est pas envoyé : le défaut de la colonne est `true`. Une
    // fiche créée grisée serait un plat qu'on ajoute pour dire qu'il manque.
    ordre: rangSuivant(derniere?.ordre),
  });
  if (error) {
    return { ok: false, error: messagePostgrest("vitrine.create-fiche", error) };
  }

  await revaliderVitrine(supabase, garde.organizationId);
  return { ok: true, data: undefined };
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
 * `gardeEditeurVitrine` a déjà tranché la session, le rôle et le droit ; la RPC
 * ne rend ce code que si l'appel ne porte pas le `service_role` ou si
 * l'organisation de la SESSION n'existe plus. Aucun des deux ne se corrige
 * depuis un écran d'import : c'est l'erreur générique, et elle se journalise.
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
 * ── LA GARDE APPLICATIVE EST LA SEULE, ET C'EST ÉCRIT DANS LA RPC ──
 *
 * `import_vitrine_carte` est `security definer` / `service_role` et ne vérifie
 * NI l'appartenance NI le droit `vitrine` : elle écrit dans l'organisation qu'on
 * lui nomme, point. Sa sûreté tient entièrement au fait que cette action lui
 * passe l'organisation de la SESSION — jamais un champ du formulaire.
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
    // DE LA SESSION. Jamais du corps de la requête — la RPC ne le revérifie pas.
    p_organization_id: garde.organizationId,
    // LE PAYLOAD VALIDÉ, et non la chaîne postée : noms détourés, vocabulaires
    // dédoublonnés, clés inconnues déjà refusées.
    p_payload: toJson(parsed.data.import),
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
