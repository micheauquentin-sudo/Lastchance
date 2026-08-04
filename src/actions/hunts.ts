"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { zonedDateTimeToIso } from "@/lib/date-time";
import {
  huntTokenCookieName,
  loadHuntClaimContext,
  loadHuntStepContext,
} from "@/lib/hunt-context";
import {
  firstFreeStepPosition,
  mapHuntScanResult,
  planReorder,
  type HuntScanResult,
} from "@/lib/hunts";
import {
  COMPTAGE_INDISPONIBLE,
  verdictCodesEnAttente,
} from "@/lib/codes-en-attente";
import { monitored, reportError } from "@/lib/monitoring";
import { ensureProgressivePlayerIdentity } from "@/lib/player-identity";
import { refusTransition } from "@/lib/publication-transition";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { sendHuntRewardEmail } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasHuntsAccess } from "@/lib/subscription";
import { randomCode, type ActionResult } from "@/lib/utils";
import {
  claimHuntRewardSchema,
  createHuntSchema,
  createHuntStepSchema,
  deleteHuntSchema,
  deleteHuntStepSchema,
  HUNT_DELETE_LOSS_HINT,
  HUNT_STEP_LOSS_HINT,
  reorderHuntStepsSchema,
  setHuntStatusSchema,
  stampHuntStepSchema,
  updateHuntSchema,
  updateHuntStepSchema,
} from "@/lib/validations/hunts";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

/** Durée de vie du cookie joueur d'une chasse (180 j, comme les pronos). */
const HUNT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const NOT_EDITOR = "Action non autorisée";

export async function createHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createHuntSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: hunt, error } = await supabase
    .from("hunts")
    .insert({ organization_id: organization.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !hunt) {
    console.error("[hunts] create:", error?.message);
    return { ok: false, error: "Impossible de créer la chasse" };
  }

  revalidatePath("/dashboard/hunts");
  redirect(`/dashboard/hunts/${hunt.id}`);
}

/** Réglages d'une chasse (nom, ordre, délai, lot, stock, fenêtre). */
export async function updateHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateHuntSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    order_mode: formData.get("order_mode"),
    min_scan_interval_seconds: formData.get("min_scan_interval_seconds") ?? 0,
    reward_label: formData.get("reward_label") ?? "",
    reward_details: formData.get("reward_details") ?? "",
    reward_stock: formData.get("reward_stock") ?? "",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
    // Le réglage n'est lu que si le formulaire porte RÉELLEMENT le champ.
    // '' = « sans limite », valeur LÉGITIME → `has`, jamais `get() ?? ""` :
    // sinon la sauvegarde de tout autre formulaire de la page remettrait
    // l'échéance à « sans limite » sans que le commerçant y ait touché.
    code_ttl_days: formData.has("code_ttl_days")
      ? formData.get("code_ttl_days")
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  let startsAt: string | null;
  let endsAt: string | null;
  try {
    startsAt = parsed.data.starts_at
      ? zonedDateTimeToIso(parsed.data.starts_at, organization.timezone)
      : null;
    endsAt = parsed.data.ends_at
      ? zonedDateTimeToIso(parsed.data.ends_at, organization.timezone)
      : null;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Date invalide",
    };
  }

  const { id } = parsed.data;
  const fields = {
    name: parsed.data.name,
    order_mode: parsed.data.order_mode,
    min_scan_interval_seconds: parsed.data.min_scan_interval_seconds,
    reward_label: parsed.data.reward_label,
    reward_details: parsed.data.reward_details,
    reward_stock: parsed.data.reward_stock,
    starts_at: startsAt,
    ends_at: endsAt,
    // Champ absent du formulaire → colonne non touchée (et non remise à null).
    ...(parsed.data.code_ttl_days !== undefined
      ? { code_ttl_days: parsed.data.code_ttl_days }
      : {}),
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("hunts")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[hunts] update:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/hunts");
  revalidatePath(`/dashboard/hunts/${id}`);
  return { ok: true, data: undefined };
}

/**
 * Change le statut d'une chasse. L'activation exige le module actif, au
 * moins 2 étapes et un lot final renseigné (mêmes gardes que l'activation
 * d'une campagne / d'un championnat).
 */
export async function setHuntStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setHuntStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  // ── POURQUOI SEUL `active` EXIGE LE MODULE ──
  //
  // Le retour vers `draft` / `archived` reste ouvert sans addon, DÉLIBÉRÉMENT.
  // Il a bien été examiné comme première marche d'un contournement — passer une
  // chasse en brouillon lève la garde « une chasse active garde au moins 2
  // étapes », donc laisse descendre le parcours à une seule étape, ce qui rend
  // complet tout joueur ayant un tampon et fait émettre des codes en masse au
  // solde qui suit. Mais cette marche-là ne mène nulle part : le geste qui
  // ÉMET, `deleteHuntStep`, exige désormais le module lui aussi. La chaîne est
  // coupée là où elle coûte.
  //
  // La fermer ici en plus aurait un prix réel et asymétrique : le commerçant
  // dont l'abonnement au module s'arrête ne pourrait plus JAMAIS arrêter ni
  // archiver sa chasse en cours — une désescalade rendue impossible par la
  // perte d'un droit payant, c'est un enfermement, et il se règle par un appel
  // au support. On ne bloque pas quelqu'un qui veut cesser d'utiliser.
  if (status === "active") {
    if (!hasHuntsAccess(organization)) {
      return {
        ok: false,
        error: "Le module Chasse au trésor n'est pas activé sur votre compte.",
      };
    }
    const { data: hunt } = await supabase
      .from("hunts")
      .select("reward_label")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!hunt) return { ok: false, error: "Chasse introuvable" };
    if (!hunt.reward_label.trim()) {
      return {
        ok: false,
        error: "Renseignez le lot final avant d'activer la chasse.",
      };
    }
    const { count } = await supabase
      .from("hunt_steps")
      .select("id", { count: "exact", head: true })
      .eq("hunt_id", id)
      .eq("organization_id", organization.id);
    if ((count ?? 0) < 2) {
      return {
        ok: false,
        error: "Ajoutez au moins 2 étapes avant d'activer la chasse.",
      };
    }
  }

  // `hunts.status` n'est plus écrivable par `authenticated` (migration
  // 20260905120000) : la transition passe par une RPC qui rejoue le rôle, le
  // droit du module et le droit effectif d'abonnement. Les gardes métier
  // ci-dessus restent AVANT elle — le commerçant doit lire « ajoutez au moins
  // 2 étapes », pas un refus de droit générique.
  const { data: transition, error } = await supabase.rpc("set_hunt_status", {
    p_organization_id: organization.id,
    p_hunt_id: id,
    p_status: status,
  });
  const refus = refusTransition(
    { data: transition, error },
    {
      introuvable: "Chasse introuvable",
      module: "Le module Chasse au trésor n'est pas activé sur votre compte.",
      role: NOT_EDITOR,
      echec: "Mise à jour impossible",
    },
  );
  if (refus) {
    console.error("[hunts] status:", error?.message ?? `rpc=${transition}`);
    return { ok: false, error: refus };
  }

  // ── SOLDE À LA RÉACTIVATION ──
  //
  // Régression introduite par le durcissement de `settle_hunt_completions` :
  // cette fonction porte désormais les quatre gardes de contexte de
  // `record_hunt_scan` (addon, statut, fenêtre), sans quoi un éditeur pouvait
  // passer sa chasse en brouillon, la réduire à une étape et frapper des
  // centaines de codes réels sans plafond.
  //
  // Effet de bord : le commerçant qui retire une étape PENDANT que sa chasse
  // est en brouillon ne solde plus personne. Les joueurs devenus complets
  // restent sur la carte de victoire vide, et rien ne rappelait la fonction.
  // On avait échangé une émission massive contre un silence durable.
  //
  // La réactivation est le moment exact où le solde redevient légitime : la
  // chasse est de nouveau active, dans sa fenêtre, sur un module payé — les
  // quatre gardes passent. La RPC exclut les joueurs ayant déjà une
  // complétion, l'appel est donc idempotent.
  //
  // Son échec ne remonte PAS : le statut est déjà écrit, et refuser de
  // rouvrir sa chasse parce qu'un solde a raté serait une punition sans
  // rapport. Le solde se rejouera à la réactivation suivante ou au prochain
  // scan.
  if (status === "active") {
    const { error: settleError } = await supabase.rpc(
      "settle_hunt_completions",
      { p_hunt_id: id },
    );
    if (settleError) {
      console.error("[hunts] settle on activate:", settleError.message);
    }
  }

  revalidatePath("/dashboard/hunts");
  revalidatePath(`/dashboard/hunts/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteHunt(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteHuntSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();

  // ── GARDE : des codes CHASSE- attendent-ils encore en caisse ? ──
  //
  // `hunt_players` cascade depuis `hunts` (20260724120000_treasure_hunts:108-110)
  // et `hunt_completions` cascade depuis `hunt_players` (:159-160) : la
  // suppression emportait les codes `CHASSE-` non retirés. Le gagnant qui avait
  // reçu son code par e-mail se voyait répondre « code introuvable ».
  //
  // Le texte de confirmation de l'écran énumérait « cette chasse, ses étapes et
  // toute la progression » — c'est-à-dire tout ce que le commerçant accepte de
  // perdre, et rien de ce qui lui coûte un client. On refuse tant que le
  // chiffre n'a pas été vu, comme le fait déjà `deleteHuntStep` juste en
  // dessous pour un autre coût.
  const verdict = verdictCodesEnAttente(
    await supabase
      .from("hunt_completions")
      .select("id", { count: "exact", head: true })
      .eq("hunt_id", parsed.data.id)
      .eq("organization_id", organization.id)
      .not("code", "is", null)
      .is("redeemed_at", null),
  );

  if (verdict.etat === "indisponible") {
    reportError("hunts.delete-outstanding", verdict.motif);
    return { ok: false, error: COMPTAGE_INDISPONIBLE };
  }

  if (verdict.etat === "en-attente" && formData.get("confirm_outstanding") !== "1") {
    return {
      ok: false,
      error:
        `${verdict.nombre} code(s) CHASSE- n'ont pas encore été retirés en caisse. ` +
        "Supprimer la chasse les rendra introuvables : vos gagnants se verront " +
        "refuser un lot qu'ils ont vraiment obtenu. " +
        `${HUNT_DELETE_LOSS_HINT} pour supprimer quand même.`,
    };
  }

  const { error } = await supabase
    .from("hunts")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[hunts] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/hunts");
  redirect("/dashboard/hunts");
}

// ── Étapes (une étape = un QR code) ──

export async function createHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createHuntStepSchema.safeParse({
    hunt_id: formData.get("hunt_id"),
    label: formData.get("label"),
    hint: formData.get("hint") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: hunt } = await supabase
    .from("hunts")
    .select("id")
    .eq("id", parsed.data.hunt_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!hunt) return { ok: false, error: "Chasse introuvable" };

  const { data: steps } = await supabase
    .from("hunt_steps")
    .select("position")
    .eq("hunt_id", parsed.data.hunt_id)
    .eq("organization_id", organization.id);
  const position = firstFreeStepPosition(
    (steps ?? []).map((s) => s.position as number),
  );
  if (position === null) {
    return { ok: false, error: "10 étapes maximum par chasse." };
  }

  const { error } = await supabase.from("hunt_steps").insert({
    hunt_id: parsed.data.hunt_id,
    organization_id: organization.id,
    position,
    label: parsed.data.label,
    hint_text: parsed.data.hint || null,
    // Jeton public non devinable (16 caractères, contrainte ^[A-Za-z0-9-]{16,64}$).
    token: randomCode(16),
  });

  if (error) {
    console.error("[hunts] create step:", error.message);
    return { ok: false, error: "Impossible d'ajouter l'étape" };
  }

  revalidatePath(`/dashboard/hunts/${parsed.data.hunt_id}`);
  return { ok: true, data: undefined };
}

export async function updateHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateHuntStepSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    hint: formData.get("hint") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("hunt_steps")
    .update({ label: parsed.data.label, hint_text: parsed.data.hint || null })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("hunt_id")
    .maybeSingle();

  if (error) {
    console.error("[hunts] update step:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }
  if (!updated) return { ok: false, error: "Étape introuvable" };

  revalidatePath(`/dashboard/hunts/${updated.hunt_id}`);
  return { ok: true, data: undefined };
}

export async function deleteHuntStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteHuntStepSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };
  // Le module, en plus du rôle. Les deux écrans du dashboard appellent déjà
  // `notFound()` sans l'addon, mais une server action reste POSTable en direct :
  // la page n'est pas une garde. Et celle-ci ne protège pas qu'un affichage —
  // la suppression appelle `settle_hunt_completions` juste après, qui ÉMET des
  // codes CHASSE- réels. Sans cette ligne, un compte dont le module n'est pas
  // payé pouvait frapper des lots à honorer en caisse.
  if (!hasHuntsAccess(organization)) {
    return {
      ok: false,
      error: "Le module Chasse au trésor n'est pas activé sur votre compte.",
    };
  }

  const supabase = await createClient();
  const { data: step } = await supabase
    .from("hunt_steps")
    .select("hunt_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!step) return { ok: false, error: "Étape introuvable" };

  // Une chasse active conserve au moins 2 étapes (invariant d'activation).
  const [{ data: hunt }, { count }] = await Promise.all([
    supabase
      .from("hunts")
      .select("status")
      .eq("id", step.hunt_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("hunt_steps")
      .select("id", { count: "exact", head: true })
      .eq("hunt_id", step.hunt_id)
      .eq("organization_id", organization.id),
  ]);
  if (hunt?.status === "active" && (count ?? 0) <= 2) {
    return {
      ok: false,
      error:
        "Une chasse active garde au moins 2 étapes. Désactivez-la pour en retirer davantage.",
    };
  }

  // ── GARDE : des joueurs sont-ils en train de faire cette chasse ? ──
  //
  // `hunt_scans.step_id` cascade (20260724120000:130-131), mais le dommage
  // n'est pas là où on l'attend : retirer une étape n'efface AUCUN tampon des
  // autres étapes. Un joueur qui avait tamponné les 4 étapes restantes se
  // retrouve donc à 4 tampons pour 4 étapes, SANS ligne `hunt_completions` —
  // car la complétion n'est calculée que pendant un scan. Son écran calcule
  // « terminé » dès le chargement et masque le bouton « Valider mon passage »,
  // le seul geste qui débloquerait le serveur : il reçoit une carte de
  // victoire VIDE, sans code, sans explication.
  //
  // Le confirm() de l'écran ne disait pas un mot des joueurs en cours. On
  // refuse donc tant que le commerçant n'a pas confirmé, et le refus NOMME
  // combien de personnes ont une chasse ouverte.
  //
  // ── DEUX CHIFFRES, PAS UN ──
  //
  // « N joueurs en cours » ne dit pas ce que ce clic COÛTE. Le nombre qui coûte
  // est le second : combien d'entre eux franchiront le seuil du seul fait de la
  // suppression et recevront immédiatement un code CHASSE- à honorer en caisse.
  // `hunt_players_in_progress` ne le donne pas — il compte les joueurs avec au
  // moins un tampon et sans complétion, pas ceux que le raccourcissement rend
  // complets. Le commerçant lisait « 800 joueurs en cours », cochait la case en
  // croyant raccourcir un parcours, et déclenchait des centaines de lots réels.
  //
  // Doctrine déjà posée par la garde du calendrier (calendar.ts:804) : « Un
  // chiffre permet d'arbitrer, "des cases" non. » Elle nomme, elle aussi, deux
  // comptages distincts.
  //
  // La prévision est calculée EN BASE (`hunt_settlement_preview`) et non ici :
  // elle demande un comptage de tampons par joueur en excluant l'étape visée,
  // que PostgREST ne sait pas agréger — le rapatrier signifierait lire tous les
  // scans de la chasse, donc buter en silence sur la limite de lignes de
  // l'API et ANNONCER UN CHIFFRE FAUX sur les grosses chasses, exactement le
  // défaut qu'on répare.
  const { data: enCours } = await supabase.rpc("hunt_players_in_progress", {
    p_hunt_id: step.hunt_id,
  });
  const joueurs = typeof enCours === "number" ? enCours : 0;
  if (joueurs > 0 && formData.get("confirm_players") !== "1") {
    // Prévision demandée seulement ici : le chemin confirmé et le chemin sans
    // joueur ne paient aucun aller-retour de plus.
    const { data: prevision, error: previsionError } = await supabase.rpc(
      "hunt_settlement_preview",
      { p_hunt_id: step.hunt_id, p_removed_step_id: parsed.data.id },
    );
    if (previsionError) {
      console.error("[hunts] settlement preview:", previsionError.message);
    }
    const codes = typeof prevision === "number" ? prevision : null;
    return {
      ok: false,
      error:
        `${joueurs} joueur(s) ont une chasse en cours : retirer une étape ` +
        "efface les tampons qu'ils y avaient posés et raccourcit le parcours " +
        "sous leurs pieds. " +
        // Un échec de la prévision ne doit pas inventer un « 0 » rassurant :
        // on dit qu'on ne sait pas, ce qui reste un arbitrage possible.
        (codes === null
          ? "Le nombre de codes que cela déclencherait n'a pas pu être calculé. "
          : `${codes} d'entre eux auront déjà tamponné toutes les étapes ` +
            "restantes : autant de codes CHASSE- émis immédiatement, à " +
            "honorer en caisse. ") +
        `${HUNT_STEP_LOSS_HINT} pour supprimer quand même.`,
    };
  }

  const { error } = await supabase
    .from("hunt_steps")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[hunts] delete step:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  // ── RATTRAPAGE : solder ceux que la suppression vient de rendre complets ──
  //
  // Sans cet appel, le joueur à 4 tampons pour 4 étapes n'a plus AUCUNE raison
  // de scanner (son carnet est plein) et son écran ne lui propose plus rien :
  // il ne recevrait jamais son code. La RPC accorde exactement ce que le
  // prochain scan aurait accordé — même condition, même verrou, même borne de
  // stock —, elle n'invente aucun droit.
  //
  // Un échec ici ne doit pas faire croire que la suppression a échoué : elle
  // est déjà partie en base. On le signale et on rend la main proprement.
  const { error: settleError } = await supabase.rpc("settle_hunt_completions", {
    p_hunt_id: step.hunt_id,
  });
  if (settleError) {
    console.error("[hunts] settle completions:", settleError.message);
  }

  revalidatePath(`/dashboard/hunts/${step.hunt_id}`);
  return { ok: true, data: undefined };
}

/**
 * Réordonne les étapes d'une chasse selon la liste d'identifiants reçue.
 * Les positions sont réattribuées une par une vers un slot libre (aucun
 * état intermédiaire ne viole l'unicité). Le formulaire sérialise l'ordre
 * en JSON (champ caché), comme la saisie rapide des pronostics.
 */
export async function reorderHuntSteps(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let order: unknown;
  try {
    order = JSON.parse(String(formData.get("order") ?? "[]"));
  } catch {
    return { ok: false, error: "Données invalides" };
  }

  const parsed = reorderHuntStepsSchema.safeParse({
    hunt_id: formData.get("hunt_id"),
    order,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: steps } = await supabase
    .from("hunt_steps")
    .select("id, position")
    .eq("hunt_id", parsed.data.hunt_id)
    .eq("organization_id", organization.id);
  if (!steps || steps.length === 0) {
    return { ok: false, error: "Chasse introuvable" };
  }

  const moves = planReorder(
    steps.map((s) => ({ id: s.id as string, position: s.position as number })),
    parsed.data.order,
  );
  if (moves === null) {
    return {
      ok: false,
      error: "Réorganisation impossible en une fois : déplacez les étapes une par une.",
    };
  }

  for (const move of moves) {
    const { error } = await supabase
      .from("hunt_steps")
      .update({ position: move.position })
      .eq("id", move.id)
      .eq("hunt_id", parsed.data.hunt_id)
      .eq("organization_id", organization.id);
    if (error) {
      reportError("hunts.reorder", error.message);
      return { ok: false, error: "Réorganisation impossible" };
    }
  }

  revalidatePath(`/dashboard/hunts/${parsed.data.hunt_id}`);
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Parcours public /hunt/[token] (anonyme, service role via contexte)
// ────────────────────────────────────────────────────────────

/**
 * Tamponne une étape. Le tampon se fait au POST du bouton (JAMAIS au GET :
 * anti-prefetch). Crée/lit le cookie joueur propre à la chasse, appelle la
 * RPC atomique record_hunt_scan et renvoie un résultat typé pour l'UI.
 */
export async function stampHuntStep(input: {
  stepToken: string;
}): Promise<ActionResult<HuntScanResult>> {
  return monitored("hunts.stamp", () => stampInner(input));
}

async function stampInner(
  input: Parameters<typeof stampHuntStep>[0],
): Promise<ActionResult<HuntScanResult>> {
  try {
    const parsed = stampHuntStepSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadHuntStepContext(parsed.data.stepToken);
    // Chasse inconnue / fermée / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapHuntScanResult({ state: "unavailable" }) };
    }

    // Identité joueur D'ABORD : cookie httpOnly existant, sinon jeton frais.
    // AUCUN seau n'est consommé avant elle — la clé IP (partagée entre tous
    // les joueurs d'un lieu) ne peut plus refuser le tampon à chacun (ADR-032).
    const store = await cookies();
    const cookieName = huntTokenCookieName(ctx.hunt.id);
    const existing = store.get(cookieName)?.value;
    const token = existing ?? generatePlayerToken();
    const tokenHash = hashPlayerToken(token);

    // Seau `failClosed` sur l'IDENTITÉ joueur (cookie/hash) : la saturer ne
    // borne que son porteur.
    if (
      !(await rateLimit(
        rateLimitBucket("hunt:scan:player", ctx.hunt.id, tokenHash),
        RATE_LIMITS.huntScanPlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de scans récents. Patientez un instant avant de continuer.",
      };
    }

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure — il
    // incrémente et alerte au dépassement, il ne refuse jamais.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["hunt:scan:ip", ctx.hunt.id],
      ip,
      RATE_LIMITS.huntScanIp,
      "hunt_scan_ip_pressure",
      { hunt_id: ctx.hunt.id },
      );

    const { data, error } = await ctx.admin.rpc("record_hunt_scan", {
      p_step_token: parsed.data.stepToken,
      p_player_token_hash: tokenHash,
    });
    if (error) {
      reportError("hunts.stamp", error.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    const result = mapHuntScanResult(data);
    // Pose le cookie au premier scan validé (le joueur vient d'être créé).
    if (!existing && result.state !== "unavailable") {
      store.set(cookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: HUNT_COOKIE_MAX_AGE,
      });
    }

    if (result.state !== "unavailable") {
      await ensureProgressivePlayerIdentity({
        organizationId: ctx.hunt.organization_id,
        experienceKind: "hunt",
        experienceId: ctx.hunt.id,
        legacyIdentityHash: tokenHash,
        acquisitionSource: "qr",
      });
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("hunts.stamp", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

export interface HuntClaimOutcome {
  code: string;
  rewardLabel: string;
  /** L'email de rappel a-t-il bien été envoyé (best-effort). */
  emailed: boolean;
}

/**
 * Rattache un email (OPTIONNEL) à la complétion pour recevoir le code par
 * mail, et envoie l'email transactionnel. Jamais requis pour voir le code
 * à l'écran. Opt-in marketing → abonné newsletter (miroir claimPrize).
 */
export async function claimHuntReward(input: {
  stepToken?: string;
  huntId?: string;
  email?: string;
  marketingOptIn?: boolean;
}): Promise<ActionResult<HuntClaimOutcome>> {
  return monitored("hunts.claim", () => claimInner(input));
}

async function claimInner(
  input: Parameters<typeof claimHuntReward>[0],
): Promise<ActionResult<HuntClaimOutcome>> {
  try {
    const parsed = claimHuntRewardSchema.safeParse({
      stepToken: input.stepToken,
      huntId: input.huntId,
      email: input.email ?? "",
      marketingOptIn: input.marketingOptIn ?? false,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadHuntClaimContext({
      stepToken: parsed.data.stepToken,
      huntId: parsed.data.huntId,
    });
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // ── ORDRE DES GARDES (miroir de claimPrize) ─────────────────────────
    // Identité joueur D'ABORD (cookie httpOnly → hunt_players → complétion) :
    // aucun seau n'est consommé avant elle. Le `failClosed` porte ensuite sur
    // l'identité du GAIN — la complétion —, jamais sur l'IP partagée d'un lieu
    // (ADR-032). L'ancien `hunt:claim:ip` fail-closed était consommé AVANT même
    // la lecture du cookie : un tiers derrière le même Wi-Fi coupait le code.
    const NEED_COMPLETE = "Terminez la chasse pour obtenir votre code.";
    const store = await cookies();
    const token = store.get(huntTokenCookieName(ctx.hunt.id))?.value;
    if (!token) return { ok: false, error: NEED_COMPLETE };

    const { data: player } = await ctx.admin
      .from("hunt_players")
      .select("id")
      .eq("hunt_id", ctx.hunt.id)
      .eq("token_hash", hashPlayerToken(token))
      .maybeSingle();
    if (!player) return { ok: false, error: NEED_COMPLETE };

    const { data: completion } = await ctx.admin
      .from("hunt_completions")
      .select("id, code")
      .eq("hunt_id", ctx.hunt.id)
      .eq("player_id", player.id)
      .maybeSingle();
    if (!completion) return { ok: false, error: NEED_COMPLETE };

    // Seau `failClosed` sur l'IDENTITÉ DU GAIN (complétion résolue) : la
    // saturer ne borne que le rejeu de CE code, jamais un tiers. Même règle
    // (`claim`) et même logique que `claim:spin` de la roue.
    if (
      !(await rateLimit(
        rateLimitBucket("hunt:claim:completion", completion.id),
        RATE_LIMITS.claim,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["hunt:claim:ip", ctx.hunt.id],
      ip,
      RATE_LIMITS.claimIp,
      "hunt_claim_ip_pressure",
      { hunt_id: ctx.hunt.id, completion_id: completion.id },
      );

    let emailed = false;
    if (parsed.data.email) {
      // Attache-email À USAGE UNIQUE. Compare-and-swap atomique : l'update
      // ne prend QUE si aucun email n'est encore rattaché (`email is null`).
      // Deux appels concurrents → seul le premier verrouille la ligne et voit
      // une ligne mise à jour ; le second réévalue le WHERE (email non nul) et
      // obtient 0 ligne. Ferme l'email-bombing et l'empoisonnement newsletter
      // par rappels successifs avec un destinataire arbitraire sur une chasse
      // déjà terminée (le code, lui, reste consultable à l'écran).
      const { data: attached, error: updateError } = await ctx.admin
        .from("hunt_completions")
        .update({
          email: parsed.data.email,
          marketing_opt_in: parsed.data.marketingOptIn,
        })
        .eq("id", completion.id)
        .eq("hunt_id", ctx.hunt.id)
        .is("email", null)
        .select("id");
      if (updateError) reportError("hunts.claim.email", updateError.message);

      // Premier email seulement (une ligne effectivement rattachée). Sinon —
      // email déjà présent, ou échec de l'update — aucun envoi ni abonnement :
      // on renvoie le code tel quel (no-op idempotent, emailed reste false).
      if ((attached?.length ?? 0) > 0) {
        // Opt-in marketing : abonné à la newsletter du commerçant (miroir de
        // claim_winning_spin — idempotent, aucune écrasure d'un abonné).
        if (parsed.data.marketingOptIn) {
          // `.select()` révèle si une ligne a RÉELLEMENT été insérée :
          // on-conflict-do-nothing ne renvoie rien quand l'email est déjà
          // abonné (même signal que le `found` SQL de claim_winning_spin).
          const { data: inserted, error: subError } = await ctx.admin
            .from("newsletter_subscribers")
            .upsert(
              {
                organization_id: ctx.hunt.organization_id,
                email: parsed.data.email,
                source: "hunt",
              },
              { onConflict: "organization_id,email", ignoreDuplicates: true },
            )
            .select("id");
          if (subError) {
            reportError("hunts.claim.subscribe", subError.message);
          } else if ((inserted?.length ?? 0) > 0) {
            // Nouvel abonné réellement créé → émet newsletter.subscriber.created
            // comme la roue. Best-effort, jamais bloquant pour le code affiché.
            await enqueueSubscriberCreatedWebhook(
              ctx.admin,
              ctx.hunt.organization_id,
              parsed.data.email,
            );
          }
        }

        emailed = await sendHuntRewardEmail({
          to: parsed.data.email,
          huntName: ctx.hunt.name,
          rewardLabel: ctx.hunt.reward_label,
          rewardDetails: ctx.hunt.reward_details,
          code: completion.code,
          organizationName: ctx.organization.name,
        });
      }
    }

    return {
      ok: true,
      data: { code: completion.code, rewardLabel: ctx.hunt.reward_label, emailed },
    };
  } catch (err) {
    reportError("hunts.claim", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Enfile l'événement sortant `newsletter.subscriber.created` dans l'outbox
 * `webhook_deliveries`, livré en différé (avec reprise sur panne) par le
 * worker cron `drainWebhookDeliveries` — exactement comme la roue. Miroir
 * app-layer du bloc SQL de `claim_winning_spin` : n'enfile QUE si l'org a un
 * webhook configuré (pas d'email stocké dans une livraison qui ne partira
 * jamais) et reste best-effort — une erreur d'enfilement n'interrompt pas le
 * claim. Charge utile identique à la roue : `{ email, source }`.
 */
async function enqueueSubscriberCreatedWebhook(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  email: string,
): Promise<void> {
  const { data: org } = await admin
    .from("organizations")
    .select("webhook_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org?.webhook_url) return;

  const { error } = await admin.from("webhook_deliveries").insert({
    organization_id: organizationId,
    event: "newsletter.subscriber.created",
    data: { email, source: "hunt" },
  });
  if (error) reportError("hunts.claim.webhook", error.message);
}
