-- ============================================================
-- Lastchance — l'autorité de Stripe s'éteint avec l'abonnement
-- ============================================================
--
-- Cette migration REDÉFINIT une fonction et n'en ajoute aucune. Vérification :
--
--     grep -l "function public.protect_stripe_managed_entitlements" \
--       supabase/migrations/*.sql
--
-- doit rendre DEUX fichiers : 20260805170000 (l'origine) et celui-ci. Le
-- corps ci-dessous est repris du CATALOGUE VIVANT (`pg_get_functiondef`), pas
-- de la migration d'origine — les deux coïncidaient, ce qui a été vérifié
-- avant d'écrire et non supposé.
--
--
-- ── CE QU'ELLE FERME ────────────────────────────────────────
--
-- `protect_stripe_managed_entitlements` interdit au back-office d'écrire
-- `plan` et `addon_*` sur une organisation « pilotée par Stripe ». Sa
-- condition de déclenchement était un `exists` sur `organization_entitlements`
-- filtré sur `source = 'stripe'` SEUL (20260805170000:122-127).
--
-- Or `apply_stripe_subscription_event_v2` (20260805170000:269-281) insère les
-- NEUF droits à CHAQUE événement, et une résiliation ne supprime pas les
-- lignes : elle les repose avec `active = false` (`v_access_active` est faux
-- pour `canceled` comme pour `inactive`). Une organisation résiliée gardait
-- donc une photographie Stripe pour toujours, et restait « pilotée par
-- Stripe » à vie.
--
-- Conséquence concrète, et c'est une décision produit du client : le
-- commerçant RÉSILIÉ est précisément la cible naturelle d'un accès offert —
-- partenaire, compensation, presse, reconquête d'un client parti. Le
-- back-office ne pouvait plus rien lui accorder, alors que plus aucun
-- abonnement ne gouvernait son compte. L'accès offert n'est pas cosmétique :
-- `hasCompAccess` prime sur le statut Stripe (`src/lib/subscription.ts`) et
-- toutes les gardes de module lisent les booléens `addon_*` — c'est bien cette
-- écriture-là, et elle seule, qui rouvrait le module.
--
-- Le correctif tient en `and e.active`.
--
--
-- ── CE QUE LA MIGRATION NE TOUCHE PAS, DÉLIBÉRÉMENT ─────────
--
-- `org_effective_entitlements` (20260805170000:86-91) porte le MÊME `exists`,
-- sans `active`, et il doit y rester. Là-bas la question posée est différente :
-- « une photographie Stripe existe-t-elle ? », pour que la reprise `legacy`
-- cesse de faire foi. Y ajouter `and e.active` ferait REJAILLIR les droits
-- legacy d'une organisation résiliée — une résiliation rendrait l'accès au
-- lieu de le retirer. Les deux `exists` se ressemblent et répondent à deux
-- questions opposées ; c'est écrit ici parce qu'un lecteur pressé
-- « uniformisera » un jour les deux.
--
-- Le trigger reste posé tel quel : `create or replace function` conserve
-- l'OID, donc `organizations_protect_stripe_entitlements` continue de pointer
-- sur cette fonction sans être recréé.
--
--
-- ── POURQUOI UNE ASSERTION DE SÉCURITÉ A ÉTÉ DÉPLACÉE ───────
--
-- ⚠ À lire avant de conclure à une régression.
--
-- `supabase/tests/subscription_entitlements.test.sql` portait DEUX `throws_ok`
-- 42501 (« même la service role ne contourne pas le snapshot par une
-- projection directe », « le plan Stripe ne peut pas être remplacé par le
-- back-office») placés APRÈS l'événement de résiliation. Elles y étaient par
-- commodité d'écriture, non par intention : la propriété qu'elles protègent
-- est « Stripe fait autorité TANT QU'IL GOUVERNE », et un abonnement résilié
-- ne gouverne plus rien.
--
-- Elles n'ont donc pas été supprimées mais REMONTÉES sur l'abonnement `active`,
-- où la propriété est vraie et où elles mordent réellement. Trois garde-fous
-- accompagnent le déplacement :
--
--   1. leur MIROIR est posé là où elles se trouvaient : après la résiliation,
--      le back-office écrit — prouvé sur un `addon_*` ET sur `plan`, et suivi
--      d'une relecture de la valeur (un trigger `before` qui renverrait `null`
--      annulerait la ligne sans lever : `lives_ok` seul ne prouverait rien) ;
--   2. la frontière `past_due` est testée explicitement. `v_access_active` est
--      VRAI pour `trialing`, `active` ET `past_due` : un impayé laisse donc les
--      droits `active = true` et le trigger doit continuer de refuser. C'est la
--      limite la plus facile à casser par accident en relisant ce correctif ;
--   3. la colonne visée par le premier `throws_ok` a dû changer, et c'est un
--      piège en soi : le trigger ne lève que sur `is distinct from`. Sur un
--      abonnement `live` vivant, `addon_events` vaut DÉJÀ `true` — l'instruction
--      d'origine (`set addon_events = true`) y serait un no-op qui ne déclenche
--      rien. Elle vise donc `addon_pronostics`, que Stripe n'a pas accordé :
--      c'est aussi l'abus réel que la garde existe pour empêcher (ouvrir à la
--      main un module non payé). Recopier l'instruction telle quelle aurait
--      produit un rouge inexplicable.
--
--
-- ── BORNE CONNUE, ASSUMÉE ───────────────────────────────────
--
-- Un abonnement VIVANT dont la liste de droits serait entièrement vide
-- (`p_entitlements = '{}'`) poserait neuf lignes inactives et rendrait la main
-- au back-office alors que Stripe gouverne encore. Le chemin applicatif ne
-- produit pas ce cas — `resolveStripeEntitlements` retient toujours un plan, et
-- tout plan porte au moins `core` — mais la RPC, elle, accepte le tableau vide.
-- Non gardé ici : verrouiller la RPC est un changement de contrat côté Stripe,
-- hors périmètre de cette migration.
-- ============================================================

create or replace function public.protect_stripe_managed_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting(
       'lastchance.stripe_entitlements_sync',
       true
     ) is distinct from 'on'
     and exists (
       select 1
         from public.organization_entitlements e
        where e.organization_id = old.id
          and e.source = 'stripe'
          -- LA CORRECTION. Une résiliation laisse les neuf lignes en place
          -- avec `active = false` : sans ce prédicat, l'organisation reste
          -- « pilotée par Stripe » longtemps après que Stripe a cessé de la
          -- piloter.
          and e.active
     )
     and (
       new.plan is distinct from old.plan
       or new.addon_pronostics is distinct from old.addon_pronostics
       or new.addon_hunts is distinct from old.addon_hunts
       or new.addon_loyalty is distinct from old.addon_loyalty
       or new.addon_jackpot is distinct from old.addon_jackpot
       or new.addon_events is distinct from old.addon_events
       or new.addon_calendar is distinct from old.addon_calendar
       or new.addon_quiz is distinct from old.addon_quiz
       or new.addon_referral is distinct from old.addon_referral
     ) then
    raise exception 'entitlements are managed by Stripe'
      using errcode = '42501';
  end if;
  return new;
end
$$;

comment on function public.protect_stripe_managed_entitlements() is
  'Défense en profondeur : le back-office ne réécrit pas plan/addon_* tant qu''un abonnement Stripe VIVANT gouverne l''organisation. Une résiliation rend la main (droits reposés inactifs).';

-- ⚠ Le revoke sur `service_role` doit être ÉCRIT (ADR-049) : `revoke … from
-- public, anon, authenticated` ne le retire pas. Supabase pose `alter default
-- privileges in schema public grant all on functions to postgres, anon,
-- authenticated, service_role`, donc toute fonction née dans `public` porte
-- EXECUTE pour service_role sans qu'aucune migration ne le lui accorde —
-- vérifié ici même avant écriture : l'ACL réelle était
-- `{postgres=X/postgres,service_role=X/postgres}` alors que 20260805170000
-- croyait l'avoir close.
--
-- Sans effet sur le trigger, et c'est le point : PostgreSQL contrôle EXECUTE à
-- `CREATE TRIGGER`, jamais au déclenchement. `create or replace` conserve
-- l'ACL comme l'OID, le trigger n'est pas recréé, et la suite pgTAP le prouve
-- dans les deux sens — le trigger mord encore sous `service_role` (abonnement
-- vivant) et le laisse écrire (abonnement résilié).
revoke all on function public.protect_stripe_managed_entitlements()
  from public, anon, authenticated;
revoke execute on function public.protect_stripe_managed_entitlements()
  from service_role;
