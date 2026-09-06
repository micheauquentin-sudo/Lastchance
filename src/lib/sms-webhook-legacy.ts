import "server-only";

/* ════════════════════════════════════════════════════════════
 * LE CHEMIN HÉRITÉ DU WEBHOOK SMS — RENDU LISIBLE SANS SENTRY
 *
 * ── LE PROBLÈME QUE CE MODULE RÉSOUT ────────────────────────
 *
 * `/api/sms/webhook` accepte encore le SECRET MAÎTRE en clair dans l'URL
 * (`?token=<BREVO_WEBHOOK_SECRET>`), le temps que la configuration Brevo
 * bascule sur le jeton dérivé ou sur l'en-tête. Cette branche devait
 * disparaître « quand le compteur `sms_webhook_legacy_url_secret` sera à
 * zéro ».
 *
 * Or ce compteur n'existait QUE dans Sentry. Personne ne le lit, et un chemin
 * de compatibilité qu'on ne peut pas mesurer devient permanent : la condition
 * de retrait n'est jamais constatée, donc le secret maître continue de vivre
 * dans les journaux d'accès de l'hébergeur et dans l'historique de la console
 * du prestataire.
 *
 * ── POURQUOI `ops_metrics` ET PAS AUTRE CHOSE ───────────────
 *
 * Trois candidats existaient, aucune table n'a été créée (le schéma appartient
 * à un autre périmètre) :
 *
 *   • `rate_limits` — ÉCARTÉ. Le cron `purge-data` la vide au-delà de 24 h
 *     (`prune_rate_limits(86_400)`), et sa clé primaire est (seau, début de
 *     fenêtre) : impossible d'y répondre « pas servi depuis N jours » dès que
 *     N dépasse deux.
 *   • `ops_worker_runs` — ÉCARTÉ. Le nom du worker est une référence vers
 *     `ops_worker_definitions` : y écrire exigerait une migration.
 *   • `ops_metrics` — RETENU. Table de compteurs d'exploitation déjà utilisée
 *     par `recordCounter`, service_role uniquement, indexée sur (op,
 *     created_at desc), purgée à 30 jours. Une ligne par usage, aucune donnée
 *     personnelle, aucun schéma à toucher.
 *
 * La rétention de 30 jours BORNE ce qu'on peut affirmer : au-delà, l'absence
 * de ligne ne distingue plus « jamais servi » de « servi il y a longtemps ».
 * C'est suffisant pour la décision à prendre — retirer la branche demande de
 * constater un mois sans usage, pas de connaître son histoire complète.
 * ════════════════════════════════════════════════════════════ */

/**
 * Nom du compteur, partagé par l'ÉCRIVAIN (la route) et le LECTEUR (la sonde
 * de santé). Le tenir ici plutôt qu'en deux littéraux est tout l'intérêt du
 * module : deux chaînes qui divergent rendraient la sonde muette sans que rien
 * ne rougisse. 28 caractères — `public.ops_metrics.op` en accepte 60.
 */
export const OP_SMS_URL_HERITEE = "sms.webhook.legacy_url_secret";

/** Rétention d'`ops_metrics` : `purge-data` supprime au-delà de 30 jours. */
export const RETENTION_OPS_METRICS_JOURS = 30;

/**
 * Fenêtre au-delà de laquelle un usage cesse de rendre la santé rouge.
 *
 * SEPT JOURS, ET LE COMPROMIS EST ASSUMÉ. Un webhook resté sur l'ancienne URL
 * frappe à CHAQUE événement Brevo (accusés de livraison compris) : sept jours
 * sans un seul événement sur un compte qui envoie des SMS n'arrive pas. Dans
 * l'autre sens, une fois la configuration reprise, l'alerte s'éteint d'
 * elle-même en sept jours au plus — sans qu'on ait à toucher à quoi que ce
 * soit, et le détail (`dernier_usage`) explique pendant tout ce temps
 * POURQUOI elle est encore là.
 *
 * Une fenêtre de 24 h ferait clignoter la sonde au rythme des envois du
 * commerçant ; la rétention complète (30 j) laisserait un moniteur sonner un
 * mois après la correction. Sept jours est le point où l'alerte reste vraie
 * sans devenir du bruit.
 */
export const FENETRE_ALERTE_JOURS = 7;

export interface UsageUrlHeritee {
  /**
   * `false` = la question n'a PAS de réponse (base injoignable, Supabase non
   * configuré). Distinct de « pas d'usage » : une sonde qui confond les deux
   * annonce une bascule terminée alors qu'elle n'a rien mesuré.
   */
  lisible: boolean;
  /** Horodatage du dernier usage connu, dans la fenêtre de rétention. */
  dernier_usage: string | null;
  /** Jours écoulés depuis, arrondis à l'entier inférieur. */
  jours_depuis: number | null;
  /** Nombre d'usages sur la fenêtre de rétention. */
  occurrences: number;
  /** Usage dans les `FENETRE_ALERTE_JOURS` derniers jours. */
  recent: boolean;
}

const INCONNU: UsageUrlHeritee = {
  lisible: false,
  dernier_usage: null,
  jours_depuis: null,
  occurrences: 0,
  recent: false,
};

const TIMEOUT_MS = 5000;

/**
 * Dernier usage et volume de la branche héritée, en UN aller-retour.
 *
 * `Prefer: count=exact` fait porter le compte par l'en-tête `content-range`
 * pendant que le corps ne ramène qu'une ligne : on obtient l'horodatage ET le
 * volume sans deux requêtes. La lecture passe par PostgREST en direct, comme
 * les deux autres sondes de `/api/health`, plutôt que par le client admin —
 * même style, même clé, même timeout.
 *
 * Ne lève jamais : une sonde de configuration qui fait tomber le healthcheck
 * transforme un constat en panne.
 */
export async function lireUsageUrlHeritee(): Promise<UsageUrlHeritee> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) return INCONNU;

  const depuis = new Date(
    Date.now() - RETENTION_OPS_METRICS_JOURS * 86_400_000,
  ).toISOString();

  try {
    const res = await fetch(
      `${url}/rest/v1/ops_metrics`
        + `?select=created_at`
        + `&op=eq.${encodeURIComponent(OP_SMS_URL_HERITEE)}`
        + `&created_at=gte.${encodeURIComponent(depuis)}`
        + `&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: serverKey,
          Authorization: `Bearer ${serverKey}`,
          Prefer: "count=exact",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return INCONNU;

    const rows = (await res.json()) as Array<{ created_at?: string }>;
    // « 0-0/12 » quand il y a des lignes, « */0 » quand il n'y en a pas.
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    const occurrences = Number.isFinite(total) ? total : rows.length;

    const dernier = rows[0]?.created_at ?? null;
    if (!dernier) {
      return { ...INCONNU, lisible: true, occurrences };
    }

    const ecoule = Date.now() - Date.parse(dernier);
    const jours = Number.isFinite(ecoule) ? Math.floor(ecoule / 86_400_000) : null;
    return {
      lisible: true,
      dernier_usage: dernier,
      jours_depuis: jours,
      occurrences,
      recent: jours !== null && jours < FENETRE_ALERTE_JOURS,
    };
  } catch {
    return INCONNU;
  }
}
