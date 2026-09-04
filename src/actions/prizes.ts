"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  COMPTAGE_INDISPONIBLE,
  verdictCodesEnAttente,
} from "@/lib/codes-en-attente";
import {
  AUCUN_LOT_GAGNANT_TIRABLE,
  estGagnantTirable,
} from "@/lib/lot-tirable";
import { reportError } from "@/lib/monitoring";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { createAdminClient } from "@/lib/supabase/admin";
import { toJson } from "@/lib/supabase/json";
import { createClient } from "@/lib/supabase/server";
import {
  addPrizeSchema,
  createWheelSchema,
  deletePrizeSchema,
  deleteWheelSchema,
  updatePrizeSchema,
  updateWheelSchema,
  updateWheelScheduleSchema,
  WHEEL_OUTSTANDING_LOSS_HINT,
} from "@/lib/validations/prizes";
import { wheelStyleWriteSchema } from "@/lib/wheel-style";
import { isSkillGameType, parseSkillConfig } from "@/lib/validations/skill";
import type { ActionResult } from "@/lib/utils";

function firstError(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Données invalides";
}

/**
 * Un stock en toutes lettres. « illimité » et non `null` : le refus est lu par
 * un commerçant, et un stock vide EST un état légitime du produit, pas une
 * absence de valeur.
 */
function decritStock(valeur: number | null): string {
  return valeur === null ? "stock illimité" : `${valeur} lot(s) restant(s)`;
}

async function requireOrg() {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  return organization;
}

export async function addPrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addPrizeSchema.safeParse({
    wheel_id: formData.get("wheel_id"),
    label: formData.get("label"),
    // AUCUN `??` sur les champs facultatifs : le schéma absorbe désormais le
    // champ non rendu (`texteOptionnel`, unions `'' → null`), et `weight` le
    // REFUSE explicitement au lieu de le lire 0 en silence.
    description: formData.get("description"),
    color: formData.get("color"),
    // L'icône choisie dans la rangée de suggestions ('' = « aucune »).
    emoji: formData.get("emoji"),
    weight: formData.get("weight"),
    is_losing: formData.get("is_losing") === "on",
    stock: formData.get("stock"),
    low_stock_threshold: formData.get("low_stock_threshold"),
    // `addPrizeSchema` acceptait DÉJÀ ces deux champs (il étend
    // `prizeFieldsSchema`) : seule la lecture du formulaire les oubliait,
    // alors qu'`updatePrize` juste en dessous les lit. Un lot naissait donc
    // toujours à `cost_cents = null`, et le coût ne se saisissait qu'au
    // SECOND temps, dans le formulaire de modification.
    //
    // Ce n'est pas cosmétique : `claim_winning_spin` impute
    // `budget_spent_cents += coalesce(p.cost_cents, 0)`
    // (20260723110000:137-145). Un commerçant qui pose un plafond de
    // dépense sans repasser sur chaque lot voit « 0 € dépensés sur 250 € »
    // indéfiniment — le plafond est bien armé, il n'a simplement rien à
    // compter.
    cost_cents: formData.get("cost"),
    value_cents: formData.get("value"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  // La roue doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: wheel } = await supabase
    .from("wheels")
    .select("id, campaign_id")
    .eq("id", parsed.data.wheel_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!wheel) return { ok: false, error: "Roue introuvable" };

  const { count } = await supabase
    .from("prizes")
    .select("id", { count: "exact", head: true })
    .eq("wheel_id", wheel.id);
  if ((count ?? 0) >= 12) {
    return { ok: false, error: "Maximum 12 lots par roue" };
  }

  const { wheel_id, ...fields } = parsed.data;
  const { error } = await supabase.from("prizes").insert({
    ...fields,
    wheel_id,
    organization_id: organization.id,
    position: count ?? 0,
  });

  if (error) {
    reportError("prizes.add", error.message);
    return { ok: false, error: "Impossible d'ajouter le lot" };
  }

  revalidatePath(`/dashboard/campaigns/${wheel.campaign_id}/wheel`);
  // LE JUMEAU DU STUDIO. `/studio/roue/[id]` vit HORS de `/dashboard` : aucune
  // revalidation d'atelier ne l'atteint, Next revalide un CHEMIN et non une
  // ressource. Sans lui, ajouter un lot depuis le studio réussit et n'apparaît
  // pas — sur l'écran même où l'on enregistre en regardant (VIT-46).
  revalidatePath(`/studio/roue/${wheel.campaign_id}`);
  await revalidatePlaySlugs(supabase, { campaignId: wheel.campaign_id });
  return { ok: true, data: undefined };
}

export async function updatePrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updatePrizeSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    description: formData.get("description"),
    color: formData.get("color"),
    // L'icône choisie dans la rangée de suggestions ('' = « aucune »).
    emoji: formData.get("emoji"),
    weight: formData.get("weight"),
    is_losing: formData.get("is_losing") === "on",
    stock: formData.get("stock"),
    low_stock_threshold: formData.get("low_stock_threshold"),
    cost_cents: formData.get("cost"),
    value_cents: formData.get("value"),
    // `formData.get` rend `null` quand le champ est ABSENT et `""` quand il est
    // présent et vide. Les deux ne veulent pas dire la même chose ici (pas de
    // témoin ≠ stock illimité affiché) : on convertit l'absence en `undefined`
    // pour que le schéma les garde distincts.
    stock_seen: formData.get("stock_seen") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { id, stock_seen: stockVu, ...fields } = parsed.data;

  // ── GARDE : ne pas RECRÉDITER un stock que le jeu a consommé ──────────
  //
  // `prizes.stock` est le RESTANT, pas un total : huit RPC de tirage font
  // `update public.prizes set stock = stock - 1`. Le champ « Stock » de
  // l'éditeur est un input non contrôlé dont le `defaultValue` fige le restant
  // AU CHARGEMENT de la page, et cette action réécrivait la colonne en bloc.
  // Corriger une coquille de libellé une heure plus tard remettait donc le
  // stock à sa valeur d'il y a une heure : les lots gagnés entre-temps étaient
  // recrédités, la roue redistribuait des lots que le commerçant n'avait plus,
  // et le client se les faisait refuser au comptoir. Rien à l'écran ne le
  // disait.
  //
  // Compare-and-swap, sur trois valeurs et non deux : ce que le champ AFFICHAIT
  // (`stock_seen`), ce qu'il POSTE, et ce que la base porte MAINTENANT. Sans le
  // témoin d'affichage, « il a saisi 12 » et « 12 traînait dans le champ » sont
  // indistinguables — c'est exactement pour cela que le défaut était muet.
  //
  // À LIRE COMME UNE PROTECTION CONTRE L'ACCIDENT, PAS CONTRE UN APPELANT :
  // `stock_seen` vient du client. Poster la valeur réelle de la base y fait
  // passer n'importe quelle réécriture — et c'est légitime, un `editor` a le
  // droit de fixer le stock. Ce qui est empêché ici, c'est le RECRÉDIT NON
  // VOULU, pas une écriture voulue.
  const { data: courant } = await supabase
    .from("prizes")
    .select("stock")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!courant) return { ok: false, error: "Mise à jour impossible" };

  const stockBase = courant.stock as number | null;
  const stockPoste = fields.stock;
  // Sans témoin (page servie avant ce correctif), on ne peut affirmer aucune
  // intention : toute différence avec la base est traitée comme une saisie ET
  // comme un déplacement du compteur — donc refusée plutôt qu'écrasée. C'est
  // délibérément le cas le plus strict : il ne dure qu'un déploiement, et un
  // refus qui nomme l'écart vaut mieux qu'une écriture silencieusement fausse.
  const champSaisi =
    stockVu === undefined ? stockPoste !== stockBase : stockPoste !== stockVu;
  const compteurABouge =
    stockVu === undefined ? stockPoste !== stockBase : stockVu !== stockBase;

  const aEcrire: Partial<typeof fields> = { ...fields };
  if (compteurABouge && champSaisi) {
    return {
      ok: false,
      error:
        `Le stock de ce lot a changé depuis l'ouverture de la page : ` +
        `${decritStock(stockBase)} en base, vous enregistrez ` +
        `${decritStock(stockPoste)}. Rechargez la page pour repartir du ` +
        "compteur réel — l'écraser recréditerait des lots déjà gagnés.",
    };
  }
  if (compteurABouge) {
    // Le champ n'a PAS été touché (posté == affiché) et le jeu a consommé du
    // stock pendant que la page était ouverte : on laisse le compteur
    // tranquille et on enregistre le reste. C'est le cas nominal du défaut —
    // le commerçant corrige un libellé, il n'a rien demandé sur le stock.
    delete aEcrire.stock;
  }

  const { data: updated, error } = await supabase
    .from("prizes")
    .update(aEcrire)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("wheel_id, wheels!prizes_wheel_id_fkey(campaign_id)")
    .maybeSingle();

  if (error || !updated) {
    reportError("prizes.update", error?.message ?? "raison inconnue");
    return { ok: false, error: "Mise à jour impossible" };
  }

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const campaignId = (updated.wheels as unknown as { campaign_id: string })
    ?.campaign_id;
  if (campaignId) {
    revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
    revalidatePath(`/studio/roue/${campaignId}`);
    await revalidatePlaySlugs(supabase, { campaignId });
  }
  return { ok: true, data: undefined };
}

export async function deletePrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deletePrizeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const organization = await requireOrg();
  const supabase = await createClient();

  // ── GARDE : NE PAS RENDRE INJOUABLE UNE ROUE OUVERTE AUX JOUEURS ──
  //
  // `deletePrize` parsait, résolvait l'organisation et supprimait — aucune
  // lecture d'état. Retirer le dernier lot gagnant tirable d'une campagne
  // ACTIVE laissait une roue où chaque client repart bredouille, sans un mot :
  // c'est exactement l'état que l'étape « Vérification » de l'atelier annonce
  // comme bloquant, et qu'aucun serveur n'opposait.
  //
  // Le refus est SEC (arbitrage du 2026-08-17) : pas de case à cocher. Le geste
  // de remplacement existe et il est disponible — créer le lot de remplacement
  // avant de supprimer l'ancien (plafond de 12 lots par roue, jamais atteint en
  // pratique). Une confirmation cochable aurait coûté un marqueur, un champ,
  // une case et une entrée de registre pour autoriser un état que le produit
  // décrit lui-même comme cassé.
  const { data: lot, error: erreurLot } = await supabase
    .from("prizes")
    // Un SEUL littéral, jamais une concaténation : supabase-js dérive le type
    // de la ligne du type LITTÉRAL de cette chaîne, et `"a" + "b"` vaut
    // `string` — la ligne retomberait en `GenericStringError`.
    .select("id, wheel_id, is_active, is_losing, weight, stock, wheels!prizes_wheel_id_fkey(campaign_id, campaigns(status))")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (erreurLot) {
    reportError("prizes.delete-lecture", erreurLot.message);
    return { ok: false, error: "Suppression impossible" };
  }
  if (!lot) return { ok: false, error: "Lot introuvable" };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const campagne = (
    lot.wheels as unknown as {
      campaigns?: { status?: string } | null;
    } | null
  )?.campaigns;

  // Campagne en brouillon, en pause ou clôturée : on remanie librement. Une
  // roue qu'aucun client ne peut jouer n'a personne à décevoir, et interdire
  // ici transformerait la préparation en parcours d'obstacles.
  if (campagne?.status === "active" && estGagnantTirable(lot)) {
    const { data: autres, error: erreurAutres } = await supabase
      .from("prizes")
      .select("is_active, is_losing, weight, stock")
      .eq("wheel_id", lot.wheel_id)
      .eq("organization_id", organization.id)
      .neq("id", lot.id);
    // FAIL-CLOSED. `null` ou `error` ne valent PAS « zéro autre lot » : c'est
    // « je n'ai pas pu savoir », et une garde qui échoue ouvert protège
    // exactement les jours où rien ne va bien. Même règle que `deleteWheel`.
    if (erreurAutres || autres === null) {
      reportError(
        "prizes.delete-derniers-gagnants",
        erreurAutres?.message ?? "lecture sans résultat ni erreur",
      );
      return {
        ok: false,
        error:
          "Impossible de vérifier les autres lots de cette roue. Réessayez " +
          "dans un instant : tant que ce contrôle n'a pas abouti, la " +
          "suppression est refusée pour ne pas rendre le jeu injouable.",
      };
    }
    if (!autres.some(estGagnantTirable)) {
      return { ok: false, error: AUCUN_LOT_GAGNANT_TIRABLE };
    }
  }

  const { data: deleted, error } = await supabase
    .from("prizes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("wheel_id, wheels!prizes_wheel_id_fkey(campaign_id)")
    .maybeSingle();

  if (error) {
    reportError("prizes.delete", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const campaignId = (deleted?.wheels as unknown as { campaign_id: string })
    ?.campaign_id;
  if (campaignId) {
    revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
    revalidatePath(`/studio/roue/${campaignId}`);
    await revalidatePlaySlugs(supabase, { campaignId });
  }
  return { ok: true, data: undefined };
}

export async function updateWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateWheelSchema.safeParse({
    id: formData.get("id"),
    play_limit: formData.get("play_limit"),
    game_type: formData.get("game_type"),
    skill_config: formData.get("skill_config"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  // Config du défi : validée par game_type. Un jeu de DÉFI exige une config
  // valide (secrets compris) ; tout autre game_type remet skill_config à null
  // (pas de secret résiduel). Erreur de config = message clair au commerçant.
  let skillConfig: Record<string, unknown> | null = null;
  if (isSkillGameType(parsed.data.game_type)) {
    let raw: unknown = null;
    if (parsed.data.skill_config) {
      try {
        raw = JSON.parse(parsed.data.skill_config);
      } catch {
        return { ok: false, error: "Configuration du jeu invalide" };
      }
    }
    const result = parseSkillConfig(parsed.data.game_type, raw);
    if (!result.ok) return { ok: false, error: result.error };
    skillConfig = result.config as Record<string, unknown>;
  }

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("wheels")
    .update({
      play_limit: parsed.data.play_limit,
      game_type: parsed.data.game_type,
      skill_config: toJson(skillConfig),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    reportError("prizes.update-wheel", error?.message ?? "raison inconnue");
    return { ok: false, error: "Mise à jour impossible" };
  }

  // Le type de jeu change le rendu de /play : purge immédiate du cache ISR.
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  revalidatePath(`/studio/roue/${updated.campaign_id}`);
  return { ok: true, data: undefined };
}

/** Enregistre le créneau horaire d'une roue (multi-roues planifiées). */
export async function updateWheelSchedule(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateWheelScheduleSchema.safeParse({
    id: formData.get("id"),
    schedule_start_hour: formData.get("schedule_start_hour"),
    schedule_end_hour: formData.get("schedule_end_hour"),
    schedule_days: formData.getAll("schedule_days"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { id, schedule_days, ...hours } = parsed.data;
  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ ...hours, schedule_days: schedule_days.length ? schedule_days : null })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    reportError(
      "prizes.update-wheel-schedule",
      error?.message ?? "raison inconnue",
    );
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}`);
  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  revalidatePath(`/studio/roue/${updated.campaign_id}`);
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  return { ok: true, data: undefined };
}

/**
 * Crée une roue supplémentaire dans une campagne (multi-roues). La
 * nouvelle roue est planifiable pour ne s'activer que sur un créneau ;
 * elle démarre avec les lots par défaut pour être jouable de suite.
 */
export async function createWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createWheelSchema.safeParse({
    campaign_id: formData.get("campaign_id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  // La campagne doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  // Limite raisonnable + calcul de la position suivante.
  const { count } = await supabase
    .from("wheels")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);
  if ((count ?? 0) >= 8) {
    return { ok: false, error: "Maximum 8 roues par campagne" };
  }

  const { data: wheel, error } = await supabase
    .from("wheels")
    .insert({
      organization_id: organization.id,
      campaign_id: campaign.id,
      name: parsed.data.name,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !wheel) {
    reportError("prizes.create-wheel", error?.message ?? "raison inconnue");
    return { ok: false, error: "Impossible de créer la roue" };
  }

  const { error: prizesError } = await supabase.from("prizes").insert(
    DEFAULT_WHEEL_PRIZES.map((p) => ({
      ...p,
      organization_id: organization.id,
      wheel_id: wheel.id,
    })),
  );
  if (prizesError) reportError("prizes.create-wheel-prizes", prizesError.message);

  revalidatePath(`/dashboard/campaigns/${campaign.id}`);
  revalidatePath(`/studio/roue/${campaign.id}`);
  await revalidatePlaySlugs(supabase, { campaignId: campaign.id });
  return { ok: true, data: undefined };
}

/**
 * Supprime une roue. Refuse la dernière roue d'une campagne : /play a
 * toujours besoin d'au moins une roue à servir.
 */
export async function deleteWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteWheelSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Contrôle de rôle EXPLICITE, là où les autres actions de ce fichier s'en
  // remettent encore à la seule policy `wheels: editors` (00019:71, `for all`).
  // Ce qui rend la garde ci-dessous nécessaire ici et pas ailleurs : elle
  // compte des `participations`, dont la lecture est OWNER-ONLY. Un `editor` a
  // le droit de supprimer la roue, jamais celui de lire ce qu'elle emporte —
  // le comptage passe donc par le client admin, et cette ligne redit qui a le
  // droit d'arriver jusque-là plutôt que de le déduire d'une policy distante.
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }
  const supabase = await createClient();

  const { data: wheel } = await supabase
    .from("wheels")
    .select("id, campaign_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!wheel) return { ok: false, error: "Roue introuvable" };

  const { count } = await supabase
    .from("wheels")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", wheel.campaign_id);
  if ((count ?? 0) <= 1) {
    return { ok: false, error: "Impossible de supprimer la dernière roue" };
  }

  // ── GARDE : des lots gagnés SUR CETTE ROUE attendent-ils en caisse ? ──
  //
  // `participations.wheel_id` porte `on delete cascade` (00001:100), et une
  // SECONDE clé composite ajoutée plus tard cascade elle aussi
  // (00017:285-289) — les deux, pas une seule. Retirer une roue de la rotation
  // d'une campagne emportait donc toutes ses participations, y compris celles
  // dont le `redeem_code` est émis et le `redeemed_at` encore null. Le client
  // se présentait au comptoir et la caisse répondait « code introuvable ».
  //
  // Le geste que le commerçant croit faire est un RÉGLAGE (« je retire la roue
  // Happy hour »), pas une purge — et le `confirm()` de l'écran ne nommait
  // rien. Le dépôt garde déjà exactement ce danger un cran au-dessus, sur
  // `deleteCampaign` : même patron ici, on ne touche PAS à la cascade (la
  // retirer donnerait un 23503 opaque) et le refus NOMME le chiffre.
  //
  // ── POURQUOI LE CLIENT ADMIN, ET PAS LE CLIENT DE SESSION ──
  //
  // `participations` est en lecture OWNER-ONLY : `participations: owner select`
  // (00017:98) garde par `is_org_owner`, qui exige STRICTEMENT `role = 'owner'`
  // (00015:10-22). Or supprimer la roue relève de `wheels: editors`
  // (00019:71) — un `editor` en a le droit. Comptée par le client de session,
  // la garde rendait donc 0 pour lui : aucune case, aucun chiffre, aucune
  // confirmation, et la cascade emportait les codes `GAIN-` en silence. Le
  // propriétaire, lui, voyait le refus : le défaut était INVISIBLE à qui ne
  // teste qu'avec un compte owner, et c'est bien ce qui s'est passé.
  //
  // Ce que le contournement de RLS coûte ici, borné : l'appartenance de la roue
  // vient d'être prouvée par la lecture RLS ci-dessus, `organization_id` reste
  // filtré, et seule la colonne `id` est lue — aucune donnée personnelle de
  // `participations` n'est exposée à l'éditeur, seulement un NOMBRE, qui est
  // exactement ce que la confirmation doit lui dire.
  const verdict = verdictCodesEnAttente(
    await createAdminClient()
      .from("participations")
      .select("id", { count: "exact", head: true })
      .eq("wheel_id", wheel.id)
      .eq("organization_id", organization.id)
      .not("redeem_code", "is", null)
      .is("redeemed_at", null)
      .is("cancelled_at", null),
  );

  if (verdict.etat === "indisponible") {
    reportError("prizes.delete-wheel-outstanding", verdict.motif);
    return { ok: false, error: COMPTAGE_INDISPONIBLE };
  }

  if (verdict.etat === "en-attente" && formData.get("confirm_outstanding") !== "1") {
    return {
      ok: false,
      error:
        `${verdict.nombre} lot(s) gagné(s) sur cette roue attendent encore d'être ` +
        "retirés en caisse. La supprimer rendra leurs codes introuvables : vos " +
        "clients se verront refuser un gain qu'ils ont vraiment obtenu. " +
        `${WHEEL_OUTSTANDING_LOSS_HINT} pour supprimer quand même.`,
    };
  }

  const { error } = await supabase
    .from("wheels")
    .delete()
    .eq("id", wheel.id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("prizes.delete-wheel", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${wheel.campaign_id}`);
  revalidatePath(`/studio/roue/${wheel.campaign_id}`);
  await revalidatePlaySlugs(supabase, { campaignId: wheel.campaign_id });
  return { ok: true, data: undefined };
}

/** Lots par défaut d'une nouvelle roue : jouable immédiatement. */
const DEFAULT_WHEEL_PRIZES = [
  { label: "Café offert", description: "Un café offert au comptoir.", color: "#f59e0b", weight: 40, is_losing: false, position: 0 },
  { label: "Dessert offert", description: "Un dessert au choix.", color: "#ec4899", weight: 20, is_losing: false, position: 1 },
  { label: "Surprise", description: "Une surprise de la maison.", color: "#8b5cf6", weight: 10, is_losing: false, position: 2 },
  { label: "Pas de chance", description: "Retentez votre chance bientôt !", color: "#64748b", weight: 30, is_losing: true, position: 3 },
];

/**
 * Sauvegarde la personnalisation visuelle de la roue (style jsonb).
 * L'éditeur envoie l'objet complet en JSON ; tout est re-validé ici.
 */
export async function updateWheelStyle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("id");
  const rawJson = formData.get("style");
  if (typeof id !== "string" || typeof rawJson !== "string") {
    return { ok: false, error: "Données invalides" };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "Style illisible" };
  }

  // Schéma d'ÉCRITURE : un `fond` hors catalogue est refusé, pas replié. Le
  // schéma de lecture le tolère (voir `wheelStyleWriteSchema`), et le tolérer
  // ici acquitterait « Enregistré » une valeur jetée en silence.
  const parsed = wheelStyleWriteSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ style: parsed.data })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    reportError(
      "prizes.update-wheel-style",
      error?.message ?? "raison inconnue",
    );
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  revalidatePath(`/studio/roue/${updated.campaign_id}`);
  // « Vos clients le voient dès maintenant » : purge le cache ISR /play.
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  return { ok: true, data: undefined };
}
