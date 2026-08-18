import "server-only";

import type { JobOutcome, JobRow } from "@/lib/jobs";
import { reportError } from "@/lib/monitoring";
import { sendNewsletterEmails } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import { signUnsubscribeToken } from "@/lib/unsubscribe";

/**
 * Traitement d'un job `newsletter.send` : l'action du dashboard n'a
 * fait que journaliser la campagne (statut queued) et déposer le job —
 * l'envoi par lots vit ici, hors requête HTTP. Le journal expose le
 * cycle : queued → sending → completed / partial / failed.
 *
 * ── LE PLAFOND NE FAIT PLUS DISPARAÎTRE PERSONNE ────────────────
 *
 * Il tronquait le segment (`slice(0, 1000)`) et s'arrêtait là : au-delà de
 * 1 000 abonnés, le reste n'était ni envoyé, ni compté, ni signalé — et
 * `recipient_count` recopiait le nombre TRONQUÉ, si bien que l'écran affichait
 * « 1000 sur 1000 » pour une campagne partie à 40 %. Le plafond est désormais
 * un plafond PAR PASSAGE : le reliquat repart en `deferred` (motif
 * /api/cron/reengage — un plafond atteint est un signal, pas une disparition),
 * `recipient_count` porte le total RÉEL du segment, et l'écran dit
 * « 1000 sur 2500 ».
 *
 * Ce qui rend la reprise possible est l'ORDRE : `org_segment_emails` porte un
 * `order by s.id` depuis la migration 20260930120000. Sans lui, deux passages
 * coupaient dans deux sous-ensembles ALÉATOIRES du même segment.
 *
 * ── LA PROGRESSION S'ÉCRIT PAR TRANCHE, PAS À LA FIN ────────────
 *
 * Le journal par destinataire (`email_log`) n'était écrit qu'APRÈS le dernier
 * lot : un worker tué au neuvième lot sur dix ne laissait aucune trace des
 * neuf premiers, et la reprise renvoyait 900 emails déjà reçus. Chaque tranche
 * de 100 journalise et met à jour `sent_count` immédiatement — au pire, un
 * décès coûte une tranche.
 *
 * ⚠️ La cadence est de 5 MINUTES (pg_cron `lastchance-jobs-worker`, secrets
 * posés depuis le chantier « cadence-file », 2026-08-01, ADR-062). Un reliquat
 * différé repart donc au passage suivant, pas le lendemain.
 */

/** Plafond par PASSAGE (10 tranches de 100). Le reliquat est différé. */
const MAX_RECIPIENTS_PAR_PASSAGE = 1000;

/** Taille d'une tranche : celle des lots Resend, et celle du journal. */
const TRANCHE = 100;

/** Délai avant reprise d'un reliquat — la file repasse toutes les 5 minutes. */
const DELAI_RELIQUAT_MS = 60_000;

/**
 * L'ÂGE au-delà duquel une campagne cesse d'être reportée — BACKSTOP ABSOLU.
 *
 * Motif emprunté à `processSmsSendJob` (`MAX_WINDOW_DEFERRAL_DAYS`), et pour
 * exactement la même raison : `deferred` REND la tentative consommée
 * (cf. `settleJob`, src/lib/jobs.ts), donc `max_attempts` ne borne plus rien.
 * Ce qui borne est la DATE, et il faut qu'un plafond existe.
 *
 * 24 h est très large devant l'usage : à 1 000 envois par passage et un report
 * de 60 s, une campagne de 100 000 abonnés tient en moins de deux heures. Ce
 * plafond ne coupe donc aucun envoi réel — il n'existe que pour qu'une boucle
 * imprévue s'arrête, et il n'est PAS la garde principale (voir
 * `progresEnregistre` plus bas, qui traite la cause connue).
 */
const AGE_MAX_REPORT_MS = 24 * 3_600_000;

export async function processNewsletterJob(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
): Promise<JobOutcome> {
  const campaignId = String(job.payload.campaignId ?? "");
  if (!campaignId) return { status: "failed", error: "payload sans campaignId" };

  const { data: campaign, error: campaignError } = await admin
    .from("newsletter_campaigns")
    .select("id, organization_id, subject, body, status, segment, recipient_count")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return { status: "retry", error: campaignError.message };
  if (!campaign) return { status: "failed", error: "campagne introuvable" };
  // Déjà traitée (rejeu de job, double dépôt) : ne JAMAIS renvoyer.
  //
  // `sending` n'est PAS dans cette liste, et c'est délibéré : c'est l'état que
  // laisse un worker mort en plein envoi, et `requeue_stale_jobs()` relance ce
  // job — le rejeu est un chemin nominal, pas un accident. C'est aussi l'état
  // que laisse un reliquat différé. On reprend donc, grâce au journal par
  // destinataire ci-dessous : sans lui, cette reprise renvoyait l'intégralité
  // du segment aux abonnés déjà servis.
  if (campaign.status === "completed" || campaign.status === "partial") {
    return { status: "completed" };
  }

  // Source de vérité : le segment journalisé sur la campagne (une
  // relance recible exactement le même public).
  const segment = campaign.segment ?? String(job.payload.segment ?? "all");

  await admin
    .from("newsletter_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  const [{ data: org }, { data: segmentRows, error: segmentError }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("name")
        .eq("id", campaign.organization_id)
        .maybeSingle(),
      admin.rpc("org_segment_emails", {
        p_organization_id: campaign.organization_id,
        p_segment: segment,
      }),
    ]);
  if (segmentError) {
    await admin
      .from("newsletter_campaigns")
      .update({ status: "queued" })
      .eq("id", campaignId);
    return { status: "retry", error: segmentError.message };
  }

  // PLUS DE `slice` ICI : le segment entier, dans son ordre stable. Le plafond
  // s'applique à ce qui est ENVOYÉ, pas à ce qui est vu — sans quoi le total
  // affiché au commerçant reste le total tronqué.
  const segmentComplet = (segmentRows ?? []) as {
    subscriber_id: string;
    email: string;
  }[];
  const segmentTotal = segmentComplet.length;

  const dedupKeyFor = (subscriberId: string) =>
    `newsletter:${campaignId}:${subscriberId}`;

  const nomOrganisation = org?.name ?? "Votre commerçant";

  /** Écrit la progression visible du commerçant, à chaque tranche. */
  const publierProgression = async (
    status: string,
    servis: number,
    termine: boolean,
  ): Promise<void> => {
    const { error } = await admin
      .from("newsletter_campaigns")
      .update({
        status,
        sent_count: servis,
        // Le TOTAL RÉEL du segment, jamais le lot du passage : c'est ce chiffre
        // qui fait dire « 1000 sur 2500 » au lieu de « 1000 sur 1000 ».
        recipient_count: segmentTotal,
        ...(termine ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", campaignId);
    if (error) reportError("jobs.newsletter.journal", error.message);
  };

  let dejaServis = 0;
  let envoyes = 0;
  let reliquat = false;
  let panne = false;
  let tentative = false;
  /** Vrai dès qu'une tranche a écrit son journal SANS erreur (cf. clôture). */
  let progresEnregistre = false;

  for (let debut = 0; debut < segmentTotal; debut += TRANCHE) {
    if (envoyes >= MAX_RECIPIENTS_PAR_PASSAGE) {
      // Tout ce qui suit est, par construction, non servi : les passages
      // avancent TOUJOURS dans l'ordre du segment, depuis sa tête.
      reliquat = true;
      break;
    }

    const tranche = segmentComplet.slice(debut, debut + TRANCHE);

    // Lecture du journal bornée à la tranche (100 clés), et non au segment
    // entier : une requête `in()` de 2 500 clés ne tient dans aucune URL.
    const { data: journalLu, error: logReadError } = await admin
      .from("email_log")
      .select("dedup_key")
      .eq("organization_id", campaign.organization_id)
      .in(
        "dedup_key",
        tranche.map((r) => dedupKeyFor(r.subscriber_id)),
      );
    if (logReadError) {
      // Journal illisible : on ne peut pas savoir qui a déjà reçu. Renvoyer à
      // l'aveugle serait le défaut qu'on corrige ici — on réessaie plus tard.
      reportError("jobs.newsletter.journal-lecture", logReadError.message);
      if (envoyes === 0) {
        await admin
          .from("newsletter_campaigns")
          .update({ status: "queued" })
          .eq("id", campaignId);
        return { status: "retry", error: "journal des envois illisible" };
      }
      // Des tranches sont déjà parties : ne pas les perdre, différer le reste.
      reliquat = true;
      break;
    }

    const servisIci = new Set(
      ((journalLu ?? []) as { dedup_key: string }[]).map((r) => r.dedup_key),
    );
    dejaServis += servisIci.size;

    const aServir = tranche.filter(
      (r) => !servisIci.has(dedupKeyFor(r.subscriber_id)),
    );
    if (aServir.length === 0) continue;

    tentative = true;
    const { sent, delivered } = await sendNewsletterEmails({
      subject: campaign.subject,
      bodyText: campaign.body,
      organizationName: nomOrganisation,
      recipients: aServir.map((r) => ({
        email: r.email,
        unsubscribeToken: signUnsubscribeToken(r.subscriber_id),
      })),
    });

    if (sent === 0) {
      // Panne d'envoi sur cette tranche : ne pas la traverser en boucle.
      panne = true;
      break;
    }
    envoyes += sent;

    // Journalisation IMMÉDIATE, avant la tranche suivante : si le processus
    // meurt ici, le pire est de renvoyer à CETTE tranche. `ignoreDuplicates`
    // rend l'écriture rejouable sans conflit.
    const abonneParEmail = new Map(aServir.map((r) => [r.email, r.subscriber_id]));
    const journal = delivered.flatMap((email) => {
      const subscriberId = abonneParEmail.get(email);
      return subscriberId
        ? [
            {
              organization_id: campaign.organization_id,
              scenario: "newsletter",
              recipient: email,
              participation_id: null,
              dedup_key: dedupKeyFor(subscriberId),
            },
          ]
        : [];
    });
    if (journal.length > 0) {
      const { error: journalError } = await admin
        .from("email_log")
        .upsert(journal, { onConflict: "dedup_key", ignoreDuplicates: true });
      // L'ENVOI est parti : une écriture de journal refusée ne doit pas le
      // compter en échec. Mais elle ne doit pas non plus passer inaperçue —
      // c'est la SEULE trace de ce qui est déjà servi, et le report s'appuie
      // dessus pour ne pas resservir. On note donc si le passage a réellement
      // enregistré sa progression (voir `progresEnregistre` à la clôture).
      if (journalError) {
        reportError("jobs.newsletter.journal-ecriture", journalError.message);
      } else {
        progresEnregistre = true;
      }
    }

    await publierProgression("sending", dejaServis + envoyes, false);
  }

  const servis = dejaServis + envoyes;

  if (segmentTotal === 0) {
    // Le segment est vide (désinscriptions entre le dépôt et l'envoi) :
    // l'envoi a échoué, rien n'est parti.
    await publierProgression("failed", 0, true);
    return { status: "completed" };
  }

  if (!tentative && !reliquat) {
    // Tout le segment avait DÉJÀ été servi par un passage précédent : l'envoi
    // est terminé. Le déclarer « failed » afficherait un échec au commerçant
    // alors que ses abonnés ont bien reçu l'email.
    await publierProgression("completed", servis, true);
    return { status: "completed" };
  }

  if (panne && envoyes === 0) {
    // Panne d'envoi complète : retry avec backoff tant que possible.
    if (job.attempts < job.max_attempts) {
      await admin
        .from("newsletter_campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
      return { status: "retry", error: "aucun email accepté par le fournisseur" };
    }
    await publierProgression("failed", servis, true);
    return { status: "failed", error: "aucun email accepté par le fournisseur" };
  }

  if (reliquat && !panne) {
    /* MOTIF « CLÔTURE EXPLICITE », emprunté à /api/cron/reengage.
     *
     * Le plafond est atteint et le segment ne l'est pas : la campagne RESTE en
     * `sending`, avec son compte réel, et le job repart à une date DONNÉE sans
     * consommer de tentative (`deferred`, cf. src/lib/jobs.ts). Ce qui borne la
     * boucle n'est donc plus `max_attempts` mais la PROGRESSION.
     *
     * ── ET LA PROGRESSION SE VÉRIFIE, ELLE NE SE SUPPOSE PAS ────────
     *
     * « Chaque passage journalise ce qu'il envoie, donc en sert strictement
     * moins au suivant » : c'est vrai TANT QUE le journal s'écrit. Or cette
     * écriture est best-effort. Si `email_log` refuse durablement (droits
     * révoqués, contrainte, table pleine), un passage envoyait 1 000 emails,
     * n'en enregistrait aucun, se reportait à 60 s — et le passage suivant
     * resservait LES MÊMES 1 000, sans plafond de tentatives (le report les
     * rend), sans échéance et sans statut terminal. Facture Resend et
     * réputation du domaine, en boucle, jusqu'à intervention humaine.
     *
     * On ne se reporte donc que sur une progression CONSTATÉE. Un passage qui
     * a envoyé sans rien enregistrer n'a pas avancé : il repart en `retry`,
     * qui CONSOMME une tentative et fait donc terminer la campagne en échec
     * après `max_attempts`, au lieu de tourner sans fin.
     */
    if (envoyes > 0 && !progresEnregistre) {
      const raison = "journal des envois non écrit — progression non acquise";
      if (job.attempts < job.max_attempts) {
        await publierProgression("sending", servis, false);
        return { status: "retry", error: raison };
      }
      await publierProgression("partial", servis, true);
      return { status: "failed", error: raison };
    }

    /* BACKSTOP ABSOLU sur l'ÂGE, motif `processSmsSendJob`. La garde ci-dessus
     * traite la cause CONNUE ; celle-ci existe pour les autres — toute forme de
     * non-avancement qu'on n'a pas su prévoir. Sans elle, il n'y a aucune borne
     * dure sur une boucle qui ne consomme pas de tentative. */
    const ageMs = Date.now() - Date.parse(job.created_at);
    if (Number.isFinite(ageMs) && ageMs > AGE_MAX_REPORT_MS) {
      await publierProgression("partial", servis, true);
      return {
        status: "failed",
        error: `campagne encore incomplète après ${AGE_MAX_REPORT_MS / 3_600_000} h de reports`,
      };
    }

    await publierProgression("sending", servis, false);
    return {
      status: "deferred",
      runAfter: new Date(Date.now() + DELAI_RELIQUAT_MS),
    };
  }

  // Panne partielle, ou segment épuisé : statut terminal.
  const finalStatus = servis >= segmentTotal ? "completed" : "partial";
  await publierProgression(finalStatus, servis, true);
  return { status: finalStatus };
}
