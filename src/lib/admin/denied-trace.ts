import "server-only";

import { createAdminBackofficeClient } from "@/lib/admin/db";
import { AdminForbiddenError, actorIp, authorizeAction, getAdminUser } from "@/lib/admin/auth";
import type { Permission } from "@/lib/admin/rbac";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import type { AdminUser } from "@/types/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Autorisation d'une action de back-office, avec TRACE DU REFUS.
 *
 * ── Pourquoi ce module existe, et pourquoi il est PARTAGÉ ──
 *
 * Le back-office n'enregistrait que ses succès. Un compte révoqué qui rejoue
 * ses anciennes actions, un opérateur qui teste les limites de son rôle, ou un
 * POST fabriqué contre une Server Action n'y laissaient rien : cinquante
 * `merchants.delete` refusés d'affilée ressemblaient à une journée calme. On ne
 * pouvait pas voir qu'on sondait l'outil.
 *
 * La garde a d'abord vécu en privé dans `merchants/actions.ts`. La recopier
 * dans `settings/actions.ts` aurait créé une SECONDE SOURCE DE VÉRITÉ sur la
 * façon de tracer un refus — la classe de défaut qui a coûté le plus cher à ce
 * projet, et dont on vient précisément de supprimer une occurrence dans le
 * parrainage. Elle est donc extraite ici, et les deux fichiers l'appellent.
 *
 * ── Ce que le module NE décide PAS ──
 *
 * La CIBLE. Un refus sur les commerçants vise une organisation, un refus sur
 * les réglages vise un compte admin : c'est l'appelant qui la nomme, parce
 * qu'il est le seul à savoir ce que son formulaire transporte. Le module ne
 * décide que du plafond, de la forme de la trace, et de son caractère
 * best-effort.
 */

/**
 * L'identifiant arrive du formulaire AVANT toute validation : une tentative est
 * refusée bien avant que zod n'ait parlé. Or `admin_audit_logs.target_id` porte
 * un `check (char_length(target_id) <= 120)` — y verser la chaîne brute ferait
 * échouer l'insertion, donc PERDRE la trace, exactement pour la requête
 * fabriquée qu'on cherchait à voir. On ne retient qu'une valeur ayant la forme
 * d'un identifiant, sinon rien.
 */
export function auditTargetId(formData: FormData, champ: string): string | null {
  const raw = formData.get(champ);
  return typeof raw === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

/**
 * Consigne une tentative REFUSÉE.
 *
 * Écriture DIRECTE plutôt que `logAdminAction` : celui-ci exige une ligne
 * `admin_users` existante pour `admin_user_id`, ce qu'un appel sans session n'a
 * pas — or c'est justement le cas le plus intéressant à voir. Même forme que le
 * refus de connexion (`admin.login.denied`) : rôle `none` quand l'appelant
 * n'est pas identifié, et suffixe `.denied` que l'écran /admin/audit colore.
 *
 * Best-effort par construction : une panne du journal ne doit pas devenir une
 * panne d'autorisation. Le refus est déjà prononcé ; la trace n'en est que la
 * mémoire, et la perdre vaut mieux que renvoyer une erreur d'un autre genre.
 */
async function traceDeniedAttempt(
  action: string,
  permission: Permission,
  reason: string,
  targetType: string,
  targetId: string | null,
): Promise<void> {
  try {
    // ── PLAFOND, et non refus ────────────────────────────────
    // Sans lui, cette trace ouvre un point d'ÉCRITURE NON AUTHENTIFIÉ dans une
    // table qu'on ne peut pas purger : `admin_audit_logs` porte le trigger
    // `admin_audit_no_delete` — même le service role ne peut rien y effacer, et
    // `purge_expired_personal_data` se contente d'ANONYMISER à 24 mois.
    //
    // Un POST fabriqué contre une action ne coûtait rien avant la trace ; il
    // insère une ligne après. N'importe qui pourrait donc faire croître la
    // table sans borne et — c'est le pire — NOYER le signal que cette trace
    // existe pour rendre visible : `listAuditLogs` trie par date et pagine par
    // trente, si bien que « cinquante refus d'affilée » redeviendraient
    // invisibles, cette fois sous un million de lignes indélébiles.
    //
    // Le seau est en OBSERVABILITÉ : au-delà du plafond on cesse d'écrire, on
    // ne refuse rien de plus. Le refus d'autorisation est déjà prononcé en
    // amont ; faire dépendre une décision de sécurité d'un seau partagé par IP
    // en ferait un interrupteur pour l'attaquant.
    //
    // IP absente (proxy non déclaré) : seau NOMMÉ et partagé plutôt qu'aucun
    // seau. C'est plus strict, et c'est le bon sens — une trace qu'on ne peut
    // pas rattacher à une origine est aussi la plus facile à fabriquer en masse.
    const ip = (await actorIp()) ?? "sans-ip";
    const sousPlafond = await rateLimit(
      rateLimitBucket("admin:denied-trace", ip),
      RATE_LIMITS.authLogin,
    );
    if (!sousPlafond) return;

    // `getAdminUser` est mémoïsé sur la requête : la garde vient de le lire,
    // relire l'identité ne coûte aucun aller-retour supplémentaire.
    const admin = await getAdminUser();
    const { error } = await createAdminBackofficeClient()
      .from("admin_audit_logs")
      .insert({
        admin_user_id: admin?.id ?? null,
        actor_email: admin?.email ?? "inconnu",
        actor_role: admin?.role ?? "none",
        action,
        target_type: targetType,
        target_id: targetId,
        metadata: { permission, reason },
        ip,
      });
    if (error) console.error("[admin] trace de refus:", error.message);
  } catch (e) {
    console.error("[admin] trace de refus:", e);
  }
}

export type AuthorizedAction =
  | { granted: true; actor: AdminUser }
  | { granted: false; denied: ActionResult };

/**
 * Garde commune aux actions de back-office. Elle n'existe pas pour factoriser
 * trois lignes : elle existe pour qu'aucun refus ne reparte muet. Un `catch`
 * recopié seize fois est un endroit où l'on oublie seize fois d'écrire la trace.
 */
export async function authorizeOrTrace(
  permission: Permission,
  deniedAction: string,
  target: { type: string; id: string | null },
  opts: { requireFresh?: boolean } = {},
): Promise<AuthorizedAction> {
  try {
    return { granted: true, actor: await authorizeAction(permission, opts) };
  } catch (e) {
    const reason = e instanceof AdminForbiddenError ? e.message : "Non autorisé.";
    await traceDeniedAttempt(deniedAction, permission, reason, target.type, target.id);
    return { granted: false, denied: { ok: false, error: reason } };
  }
}
