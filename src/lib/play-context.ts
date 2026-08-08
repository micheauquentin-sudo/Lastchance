import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { campaignWindowState } from "@/lib/campaign-window";
import { hasActiveAccess } from "@/lib/subscription";
import { selectActiveWheel } from "@/lib/wheel-schedule";
import { isConsistentPlayResourceChain } from "@/lib/public-resource-guards";
import { estLienInvitationSur } from "@/lib/validations/organizations";
import type { Campaign, Organization, Prize, Wheel } from "@/types/database";

type PublicPlayOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

/** Les trois liens de l'organisation, tels qu'ils arrivent de la base. */
type LiensInvitation = Pick<
  Organization,
  "google_review_url" | "instagram_url" | "tiktok_url"
>;

/**
 * L'invitation avant-jeu servie au joueur — CONTRAT RENDU AU CLIENT.
 *
 * Une clé n'est présente QUE si le lien correspondant est renseigné ET a passé
 * la revalidation de forme. Un objet sans aucune clé n'est jamais rendu :
 * `invitationAvantJeu` vaut alors `null`, ce qui dit à l'écran « rien à
 * proposer » sans qu'il ait à compter des clés.
 */
export interface InvitationAvantJeu {
  /** Page d'avis Google de l'établissement. */
  google?: string;
  instagram?: string;
  tiktok?: string;
}

/**
 * Ce que le joueur peut se voir proposer AVANT de jouer — jamais une porte.
 *
 * DEUX CONDITIONS, toutes deux nécessaires : la campagne l'active
 * (`prejeu_invitation`) et l'organisation a renseigné au moins un lien. Sans
 * quoi `null`, et l'écran ne rend rien.
 *
 * LA REVALIDATION DE FORME EST REFAITE ICI, alors que le schéma d'écriture l'a
 * déjà imposée : défense en profondeur, même patron de repli SILENCIEUX que
 * `asSeasonalTheme`. Une valeur écrite avant que la liste blanche n'existe, ou
 * posée par un chemin qui l'ignorerait, ne doit pas atteindre l'écran d'un
 * joueur anonyme — et ici, contrairement à l'écriture, le repli est muet :
 * personne n'attend de message d'erreur sur une lecture publique.
 */
function invitationAvantJeu(
  campaign: Pick<Campaign, "prejeu_invitation">,
  org: LiensInvitation,
): InvitationAvantJeu | null {
  if (!campaign.prejeu_invitation) return null;
  const sur = (valeur: unknown): string | null =>
    typeof valeur === "string" && estLienInvitationSur(valeur) ? valeur : null;

  const invitation: InvitationAvantJeu = {};
  const google = sur(org.google_review_url);
  if (google) invitation.google = google;
  const instagram = sur(org.instagram_url);
  if (instagram) invitation.instagram = instagram;
  const tiktok = sur(org.tiktok_url);
  if (tiktok) invitation.tiktok = tiktok;

  return Object.keys(invitation).length > 0 ? invitation : null;
}

export type PlayContext =
  | {
      ok: false;
      error: string;
      /** Style jsonb de la roue quand la chaîne est connue (campagne en
       *  pause, pas commencée, terminée, accès suspendu) : l'écran de
       *  statut garde alors l'ambiance choisie par le commerçant. */
      wheelStyle?: unknown;
    }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      qr: { id: string; campaign_id: string; organization_id: string };
      campaign: Campaign;
      organization: PublicPlayOrganization;
      wheel: Wheel;
      prizes: Prize[];
      /**
       * Invitation avant-jeu, déjà tranchée et refermée (voir
       * `invitationAvantJeu`). `null` = rien à proposer.
       *
       * C'est le SEUL chemin par lequel les liens de l'organisation
       * atteignent l'écran : ils sont retirés d'`organization` juste avant le
       * retour, pour qu'aucune URL non revalidée ne puisse voyager par le
       * simple fait qu'un composant sérialise l'objet organisation.
       */
      invitationAvantJeu: InvitationAvantJeu | null;
    };

/** Ligne renvoyée par la requête imbriquée (embeds PostgREST). */
interface PlayContextRow {
  id: string;
  campaign_id: string;
  organization_id: string;
  organizations: (PublicPlayOrganization & LiensInvitation) | null;
  campaigns: (Campaign & { wheels: (Wheel & { prizes: Prize[] })[] }) | null;
}

/*
 * ────────────────────────────────────────────────────────────────────────
 * ORACLE DES MOTIFS DE REFUS — arbitrage ASSUMÉ, pas un oubli.
 * ────────────────────────────────────────────────────────────────────────
 * Ce chargeur DISTINGUE ses refus, là où calendrier / quiz / jackpot /
 * chasse / fidélité / événement rendent tous un `UNAVAILABLE` unique. Ce
 * n'est pas une dérive : la ligne de partage est la NATURE DU SLUG, pas le
 * module. Ce que chaque message laisse déduire à qui l'obtient :
 *
 *   1. « Ce lien de jeu n'existe pas. »          aucun qr_codes.slug
 *      → ce slug n'appartient à personne sur la plateforme.
 *   2. « Jeu indisponible. »                     embed manquant, chaîne
 *      inter-tenant refusée, ou aucune roue ouverte sur le créneau courant
 *      → le slug existe, RIEN de plus : les trois causes sont fondues
 *      exprès (une sonde ne doit pas apprendre si la chaîne a cassé par
 *      erreur de configuration ou par cloisonnement multi-tenant).
 *   3. « Ce jeu est momentanément désactivé. »   !hasActiveAccess(org)
 *      → la chaîne est saine et la cause est le COMPTE du commerçant
 *      (essai fini, abonnement annulé, impayé au-delà des 14 jours de
 *      grâce). Seul message qui parle de la relation commerciale avec
 *      Lastchance et non du jeu regardé.
 *   4. « Cette campagne n'est pas active. »      status ≠ active
 *      → décision du commerçant ; pause / brouillon / archive restent
 *      indistinguables entre elles.
 *   5. « …n'a pas encore commencé. » / 6. « …est terminée. »
 *      → le calendrier de l'opération, celui-là même qui est imprimé sur
 *      l'affiche qui porte le QR.
 *
 * CANAL MUET, à ne pas oublier en relisant ces libellés : `wheelStyle`
 * accompagne 3–6 et jamais 1–2. L'identité visuelle du commerçant sépare
 * donc déjà « chaîne réelle » de « lien mort » — réécrire les textes sans
 * toucher à ce champ ne fermerait rien.
 *
 * POURQUOI C'EST ASSUMÉ : `qr_codes.slug` est TOUJOURS engendré par le
 * serveur (`randomCode(8)`, alphabet de 32 symboles ≈ 1,1·10¹²), jamais
 * choisi par le commerçant. Atteindre les motifs 3–6 suppose donc de
 * détenir le QR — donc de savoir déjà que ce commerçant existe : le
 * message ne révèle son existence à personne qui l'ignorait. En échange,
 * il tranche pour le porteur d'un QR IMPRIMÉ la seule question qu'il se
 * pose : mon lien est mort, ou le jeu rouvre ? `pronostics-context` fait
 * le même choix sur un slug engendré pareil ; calendrier / quiz /
 * jackpot refusent en bloc parce que LEUR `public_slug` est lisible et
 * choisi par le commerçant, donc énumérable — un motif distinct y
 * deviendrait un recensement des commerçants et de leur état de compte.
 *
 * LE PLUS FAIBLE DES SIX, examiné et CONSERVÉ : le motif 3. Pour le
 * joueur il n'apporte rien de plus que le 4 (fermé, sans date, rien à
 * faire) ; il ne sert qu'au commerçant, que le client renseigne au
 * comptoir (« ça dit désactivé ») et qui regarde alors sa facturation
 * plutôt que ses campagnes. C'est aussi la raison de l'ORDRE des gardes
 * ci-dessous — l'accès est évalué AVANT le statut de campagne pour qu'un
 * impayé ne lise pas « campagne en pause » et ne croie pas à un réglage
 * de sa part (verrouillé par play-context.test.ts).
 * À REVOIR SI, et seulement si, `qr_codes.slug` devient choisissable par
 * le commerçant : le CHECK en base (`^[A-Za-z0-9-]{4,64}$`, migration
 * 00001) l'autorise déjà, seul le code d'insertion l'en empêche. Ce jour-
 * là le motif 3 doit être fondu dans le 4 : sur un slug devinable, il
 * devient un oracle énumérable sur les comptes en fin de vie.
 */

/**
 * Charge et valide la chaîne QR → campagne → organisation → roue pour
 * le parcours public. Utilise le client admin : la page /play est
 * anonyme, aucune donnée n'est accessible via l'anon key.
 *
 * Un seul aller-retour PostgREST (embeds via les FK
 * qr_codes→campaigns/organizations, campaigns→wheels, wheels→prizes) :
 * sur le chemin le plus chaud de l'app, 3 allers-retours séquentiels
 * coûtaient ~2× la latence DB par vue et 5 requêtes par scan.
 */
export async function loadPlayContext(slug: string): Promise<PlayContext> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("qr_codes")
    .select(
      "id, campaign_id, organization_id, organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, comp_access, comp_access_until, timezone, google_review_url, instagram_url, tiktok_url), campaigns!qr_codes_campaign_id_fkey(*, wheels!wheels_campaign_id_fkey(*, prizes!prizes_wheel_id_fkey(*)))",
    )
    .eq("slug", slug)
    .maybeSingle();

  const row = data as unknown as PlayContextRow | null;
  if (!row) return { ok: false, error: "Ce lien de jeu n'existe pas." };

  const qr = {
    id: row.id,
    campaign_id: row.campaign_id,
    organization_id: row.organization_id,
  };
  const org = row.organizations;
  const embeddedCampaign = row.campaigns;
  // Multi-roues : on sert la roue active pour l'instant courant
  // (créneau horaire), priorité aux roues planifiées. Le spin lui-même
  // re-résout ce contexte côté serveur — le HTML mis en cache (ISR 30 s)
  // n'a d'incidence que sur le premier rendu autour d'une bascule.
  const embeddedWheel = embeddedCampaign
    ? selectActiveWheel(
        embeddedCampaign.wheels ?? [],
        new Date(),
        org?.timezone ?? "Europe/Paris",
      )
    : null;

  if (!embeddedCampaign || !org || !embeddedWheel) {
    return { ok: false, error: "Jeu indisponible." };
  }

  if (
    org.id !== row.organization_id ||
    !isConsistentPlayResourceChain({
      qr,
      campaign: embeddedCampaign,
      wheel: embeddedWheel,
      prizes: embeddedWheel.prizes ?? [],
    })
  ) {
    console.error("[play-context] chaîne de ressources inter-tenant refusée", {
      qrId: row.id,
      campaignId: row.campaign_id,
    });
    return { ok: false, error: "Jeu indisponible." };
  }

  // Détache les embeds pour rendre des objets Campaign/Wheel nets.
  const { wheels: _wheels, ...c } = embeddedCampaign;
  void _wheels;

  // Cascade des motifs 3 à 6 : leur formulation et leur ORDRE sont un
  // arbitrage écrit (voir le bloc « ORACLE DES MOTIFS DE REFUS » plus haut)
  // — ne pas les fondre ni les permuter sans le relire.
  // Abonnement actif ou essai en cours requis (essai 7 jours).
  const wheelStyle = embeddedWheel.style;
  if (!hasActiveAccess(org)) {
    return { ok: false, error: "Ce jeu est momentanément désactivé.", wheelStyle };
  }
  if (c.status !== "active") {
    return { ok: false, error: "Cette campagne n'est pas active.", wheelStyle };
  }
  // Même prédicat que la pastille du dashboard (lib/campaign-window.ts) :
  // le commerçant doit lire à l'écran ce que le joueur obtient.
  const window = campaignWindowState(c);
  if (window === "scheduled") {
    return { ok: false, error: "Cette campagne n'a pas encore commencé.", wheelStyle };
  }
  if (window === "ended") {
    return { ok: false, error: "Cette campagne est terminée.", wheelStyle };
  }

  // Filtre/tri côté serveur Node : les lots arrivent déjà avec la roue.
  const prizes = (embeddedWheel.prizes ?? [])
    .filter((p) => p.is_active)
    .sort(
      (a, b) =>
        a.position - b.position || a.created_at.localeCompare(b.created_at),
    );

  const { prizes: _prizes, ...wheel } = embeddedWheel;
  void _prizes;

  // Les trois URL brutes SORTENT de l'objet organisation : elles ne franchissent
  // la frontière que par `invitationAvantJeu`, où elles sont revalidées et
  // conditionnées à l'activation de la campagne.
  const {
    google_review_url: _google,
    instagram_url: _instagram,
    tiktok_url: _tiktok,
    ...organization
  } = org;
  void _google;
  void _instagram;
  void _tiktok;

  return {
    ok: true,
    admin,
    qr,
    campaign: c,
    organization,
    wheel,
    prizes,
    invitationAvantJeu: invitationAvantJeu(c, org),
  };
}
