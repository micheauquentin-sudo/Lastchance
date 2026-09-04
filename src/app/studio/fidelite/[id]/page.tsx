import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { toMilestoneView } from "@/lib/loyalty-context";
import { PasseportStudio } from "@/components/loyalty/passeport-studio";
import type {
  LoyaltyJackpotOption,
  WheelOption,
} from "@/components/dashboard/loyalty-editor";
import type { OrderCodeCard } from "@/components/dashboard/order-code-cards";
import type { LoyaltyMilestone, LoyaltyProgram } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — passeport" };

/**
 * LE STUDIO DU PASSEPORT (VIT-42) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est
 * le motif de `/vitrine-studio`, de `/poster/[id]`, de `/studio/calendrier` et
 * de `/studio/quiz`, y compris dans ses gardes : session, organisation, puis le
 * droit du module.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ TROIS FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/loyalty/…")` de `src/actions/loyalty.ts` — Next
 * revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37, puis VIT-39,
 * puis VIT-41, mot pour mot : un enregistrement qui réussit sans jamais
 * apparaître. Chacune des revalidations détaillées du passeport a donc
 * désormais son jumeau `/studio/fidelite/${id}`, et
 * `revalidation-studio.test.ts` échoue s'il en manque un.
 *
 * ── LES COLONNES SONT ÉNUMÉRÉES, ET `select("*")` SERAIT UN BOGUE ICI ──
 *
 * Le studio du calendrier se permet `*` parce qu'aucune de ses colonnes n'est
 * interdite à une session marchande. `loyalty_programs.rotating_secret` l'est :
 * c'est le secret du code tournant, exclu du grant de colonne (voir son
 * commentaire dans `src/types/database.ts`). La liste est donc celle, mot pour
 * mot, de la page du tableau de bord.
 */
const LOYALTY_COLUMNS =
  "id, organization_id, jackpot_campaign_id, name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, created_at, code_ttl_days, style, referral_enabled, referral_sponsor_points, referral_filleul_points, referral_max_filleuls, referral_window_days";

/**
 * Plafond des cartes de commande rendues — le même que la page du tableau de
 * bord, et pour la même raison : chaque carte non servie porte un aperçu QR
 * dessiné dans un canvas. Il est DIT à l'écran (étape « Les cartes pour les
 * colis »), sans quoi un commerçant qui en a émis cinq cents croit en avoir
 * deux cents.
 */
const ORDER_CODES_LIMIT = 200;

interface WheelRow {
  id: string;
  name: string;
}

interface PrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/**
 * Roues + état de leurs lots, tel que l'éditeur de paliers en a besoin.
 *
 * Miroir EXACT du filtre de tirage de `consume_loyalty_spin_grant`
 * (20260725200000) : `is_active and weight > 0 and (is_losing or stock > 0)`.
 * Un lot non perdant laissé « vide = illimité » est donc hors tirage pour un
 * tour offert — c'est ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): WheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }

  return wheels.map((w) => {
    const drawn = (byWheel.get(w.id) ?? []).filter((prize) => prize.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((prize) => !prize.is_losing && prize.stock === null)
        .map((prize) => prize.label),
      hasDrawablePrize: drawn.some(
        (prize) => prize.is_losing || (prize.stock ?? 0) > 0,
      ),
    };
  });
}

export default async function StudioFidelitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon six requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("loyalty");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  const [
    { data: programRow },
    { data: milestoneRows },
    { data: wheelRows },
    { data: prizeRows },
    { data: orderCodeRows },
    { data: jackpotRows },
  ] = await Promise.all([
    supabase
      .from("loyalty_programs")
      .select(LOYALTY_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("loyalty_milestones")
      .select("*")
      .eq("program_id", id)
      .eq("organization_id", organization.id)
      .order("visit_count", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
    // LECTURE DE PAGE, donc client de session : la RLS « member select » de
    // `loyalty_order_codes` la porte déjà, comme sur la page du tableau de bord.
    supabase
      .from("loyalty_order_codes")
      .select("token, label, consumed_at")
      .eq("program_id", id)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(ORDER_CODES_LIMIT),
    // Seuls les jackpots déjà actifs et validés en caisse sont compatibles :
    // le même scan staff est la preuve de visite des deux expériences.
    supabase
      .from("jackpot_campaigns")
      .select("id, name, min_participation_interval_seconds, code_ttl_days")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .eq("validation_mode", "staff")
      .order("created_at", { ascending: true }),
  ]);

  if (!programRow) notFound();
  // PostgREST ne relie pas une chaîne de `select()` à une interface : les sept
  // pages de module portent le même cast depuis toujours, et l'écart est
  // documenté en tête de `src/lib/code-ttl-days-chargement.test.ts`. Ce qui
  // protège ici est la garde de CHARGEMENT — la colonne est-elle DEMANDÉE ? —,
  // pas ce cast, qui ne fait que nommer une forme invisible au compilateur.
  // unsafe-cast-justification: écart PostgREST/interface, garde de chargement ailleurs
  const program = programRow as unknown as LoyaltyProgram;
  const paliers = (milestoneRows ?? []) as LoyaltyMilestone[];
  const roues = toWheelOptions(
    (wheelRows ?? []) as WheelRow[],
    (prizeRows ?? []) as PrizeRow[],
  );
  const jackpots: LoyaltyJackpotOption[] = (jackpotRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    minParticipationIntervalSeconds: row.min_participation_interval_seconds,
  }));

  // URL ABSOLUE : le QR d'une carte de commande est imprimé sur un bon de
  // livraison, un chemin relatif n'y serait rattachable à aucune origine. Même
  // source que la page du tableau de bord (`APP_URL`).
  const cartes: OrderCodeCard[] = (orderCodeRows ?? []).map((row) => ({
    token: row.token,
    label: row.label,
    url: `${APP_URL}/commande/${row.token}`,
    consumedAt: row.consumed_at,
  }));

  // Le même calcul que la page du tableau de bord, et il DOIT le rester : deux
  // vérités sur « qu'est-ce qui manque ? » sont exactement ce que
  // `src/lib/activation/loyalty.ts` a été écrit pour éviter.
  const entreeVerification = {
    programId: program.id,
    paliers: paliers.map((m) => ({
      id: m.id,
      visitCount: m.visit_count,
      rewardType: m.reward_type,
      rewardLabel: m.reward_label,
      rewardStock: m.reward_stock,
      targetWheelId: m.target_wheel_id,
    })),
    roues,
  };

  return (
    <PasseportStudio
      program={program}
      paliers={paliers}
      // LA MÊME VUE QUE LA PAGE PUBLIQUE, par la MÊME fonction : l'aperçu monte
      // les vrais blocs du passeport, il doit donc recevoir les paliers dans la
      // forme exacte qu'ils ont sur `/passeport/[programId]`. Une conversion
      // recopiée ici aurait été une seconde vérité sur `costPoints` et sur
      // « épuisé ».
      paliersVue={paliers.map(toMilestoneView)}
      roues={roues}
      jackpots={jackpots}
      cartes={cartes}
      plafondCartes={ORDER_CODES_LIMIT}
      entreeVerification={entreeVerification}
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      // `updateLoyaltyProgram` exige `owner|editor`, ET RIEN DE PLUS.
      //
      // Le studio du calendrier et celui du quiz ajoutent `capacites.canEditDraft`
      // parce que LEURS actions le vérifient. Celles du passeport ne le font pas :
      // l'ajouter ici gèlerait des réglages que l'atelier laisse modifier — un
      // écran qui refuse ce que l'autre accepte, sur le même programme.
      peutEditer={role === "owner" || role === "editor"}
    />
  );
}
