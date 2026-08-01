-- ============================================================
-- Lastchance — un renommage ne lève pas une sanction
-- ============================================================
--
-- ── CATALOGUE VIVANT, VÉRIFIÉ AVANT ÉCRITURE ────────────────
--
-- `grep -l "function public.<nom>" supabase/migrations/*.sql` :
--
--   sms_senders_declaration_follows_name → 20260824120000 SEUL = 1 fichier.
--                           Le corps repris ci-dessous est donc bien le vivant ;
--                           aucune migration intermédiaire ne l'a redéfini.
--   set_sms_sender_status → 20260824120000 SEUL. NON redéfinie ici, mais LUE :
--                           c'est elle, et elle seule, qui lève une sanction.
--   declare_sms_sender    → 20260824120000 + 20260829120000 (VIVANT).
--                           NON redéfinie ici, mais LUE : sa garde cherche une
--                           ligne `status = 'suspended'` DANS L'ORGANISATION,
--                           sans filtrer le nom — c'est ce qui fait que la
--                           conservation posée ici suffit à tenir le blocage
--                           après renommage.
--
-- ════════════════════════════════════════════════════════════
--
-- ── LE DÉFAUT ───────────────────────────────────────────────
--
-- `sms_senders_declaration_follows_name` (20260824120000) fait retomber l'état
-- à `pending` sur TOUT changement de `sender_id` — y compris depuis
-- `suspended`, et en écrasant au passage `status_reason`, c'est-à-dire le motif
-- de la sanction. Un simple renommage levait donc une sanction de plateforme
-- sans qu'aucun humain ne l'ait décidé, et sans laisser dans la ligne de quoi
-- savoir qu'il y en avait eu une.
--
-- ⚠️ CE DÉFAUT N'EST PAS ATTEIGNABLE AUJOURD'HUI, et le dire est plus utile que
-- de laisser croire à un correctif de production. Les cinq sites d'écriture de
-- `sms_senders` ont été audités : aucun ne touche `sender_id`, et
-- `request_sms_sender` INSÈRE une seconde ligne au lieu de renommer la première
-- (c'est même l'objet de l'index partiel `sms_senders_one_usable_per_org`, qui
-- laisse coexister le `declared` en service et le `pending` en cours de
-- déclaration). Il n'existe aucun `update … set sender_id = …` dans le dépôt.
--
-- On ferme quand même, et pour une raison datée : le premier geste « renommer
-- mon expéditeur » qu'on ajoutera rouvre tout. Ce geste est naturel — un
-- commerçant qui change d'enseigne le demandera — et rien, dans le formulaire
-- qui l'implémentera, ne rappellera qu'un trigger de 20260824120000 décide de
-- l'état d'une sanction. Fermer maintenant coûte une branche `if` ; le rouvrir
-- plus tard coûtera une revue de sécurité, et au pire un commerçant sanctionné
-- qui réémet.
--
-- ── POURQUOI LES DEUX CAS DIFFÈRENT ─────────────────────────
--
-- Le trigger fait bien deux choses distinctes, qui se ressemblaient tant
-- qu'elles étaient écrites en une seule ligne :
--
--   • DEPUIS `declared` → retombée à `pending`. Elle protège LE REGISTRE : le
--     nom déclaré à l'AF2M n'est plus celui que porte la ligne, donc la
--     déclaration ne vaut plus rien et l'envoi doit cesser jusqu'à ce qu'une
--     nouvelle soit obtenue. C'est une conséquence MÉCANIQUE du renommage, et
--     elle est juste.
--
--   • DEPUIS `suspended` → conservation. Elle protège LA SANCTION : une
--     suspension n'est pas un état du dossier de déclaration, c'est une
--     décision de la plateforme sur le DROIT D'ÉMETTRE de l'organisation
--     (20260829120000). Elle ne se lève donc que par un geste explicite, tracé
--     et motivé — `set_sms_sender_status(…, 'pending' | 'rejected', <motif>)` —
--     jamais par un effet de bord d'une édition faite par le sanctionné
--     lui-même. C'est la même règle que « un retrait n'est pas une levée »,
--     appliquée au renommage plutôt qu'au retrait.
--
-- Autrement dit : la retombée existe parce que le NOM a changé ; la
-- conservation existe parce que la sanction ne parle pas du nom.
--
-- ── CE QUE LA BRANCHE `suspended` NE TOUCHE PAS, ET POURQUOI ─
--
-- `status_reason` est délibérément laissé INTACT dans cette branche. L'écraser
-- par « nom modifié : nouvelle déclaration AF2M requise » laisserait une
-- suspension sans cause lisible : l'écran de la plateforme dirait « suspendu »
-- et serait incapable de dire POURQUOI — exactement la perte silencieuse que
-- `sms_sanction.test.sql` verrouille déjà sur le chemin du retrait.
--
-- `declared_at` et `af2m_reference` tombent en revanche dans LES DEUX branches,
-- et c'est sans effet observable sur une ligne suspendue : les contraintes
-- `sms_senders_declared_state` et `sms_senders_reference_requires_declaration`
-- les imposent déjà nulles dès que `status <> 'declared'`. L'écriture reste
-- inconditionnelle plutôt que dupliquée dans chaque branche, parce que
-- l'invariant « la déclaration ne survit jamais au nom » est vrai des deux
-- côtés — c'est l'ÉTAT qui diffère, pas la déclaration.
--
-- ── LA GARDE EST ÉCRITE SUR `old` **OU** `new` ──────────────
--
-- `old.status = 'suspended'` seul aurait suffi pour le défaut décrit. La
-- disjonction couvre le cas symétrique, qu'un correctif étroit aurait laissé
-- ouvert : un `update` qui suspend ET renomme dans la même instruction verrait
-- sa suspension toute neuve ravalée à `pending` par le trigger. Aucun appelant
-- ne l'écrit aujourd'hui — `set_sms_sender_status` ne renomme jamais — mais le
-- coût de la seconde moitié du prédicat est nul, et sa suppression future
-- passerait pour une simplification.
-- ============================================================

create or replace function public.sms_senders_declaration_follows_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    -- Vrai dans les deux branches : une déclaration ne survit pas au nom
    -- qu'elle désigne.
    new.declared_at := null;
    new.af2m_reference := null;

    if old.status = 'suspended' or new.status = 'suspended' then
      -- LA SANCTION SURVIT AU RENOMMAGE. Elle ne se lève que par
      -- set_sms_sender_status, geste explicite, tracé et motivé de la
      -- plateforme. `status_reason` n'est PAS touché : c'est la trace de la
      -- cause, et une suspension sans cause lisible est une suspension qu'on
      -- ne saura pas défendre.
      new.status := 'suspended';
    else
      -- Le nom déclaré n'est plus celui-là : la déclaration ne vaut plus rien,
      -- l'envoi doit cesser jusqu'à la suivante.
      new.status := 'pending';
      new.status_reason := 'nom modifié : nouvelle déclaration AF2M requise';
    end if;
  end if;

  -- Une déclaration ne s'antidate pas : ce serait couvrir après coup des
  -- envois partis sous un nom pas encore déclaré. Même règle, et même motif,
  -- que `sms_consents_revocation_is_final` sur `consented_at`. Inchangé.
  if new.declared_at is not null and old.declared_at is not null
     and new.declared_at < old.declared_at then
    raise exception 'une déclaration AF2M ne peut pas être antidatée';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- `create or replace` conserve l'ACL, donc les révocations de 20260824120000
-- tiennent déjà. Reposées quand même, et pour une raison précise : le jour où
-- quelqu'un remplacera ce bloc par un `drop … create` (c'est arrivé sur
-- `credit_sms_balance` au tour précédent), l'ACL repartirait des privilèges par
-- défaut de Supabase, qui accorde EXECUTE largement — ADR-049. Les quatre
-- rôles sont nommés : `from public, anon` seul laisserait `authenticated` ET
-- `service_role`.
revoke all on function public.sms_senders_declaration_follows_name()
  from public, anon, authenticated, service_role;

-- Le commentaire de colonne de 20260824120000 ne décrivait que la moitié du
-- trigger (« fait retomber `declared` en `pending` dès que le nom change ») et
-- laissait donc croire que la retombée était universelle. Réécrit ici plutôt
-- que là-bas : une migration déjà sur `main` ne se modifie pas, fût-ce pour un
-- commentaire — `scripts/check-migration-order.mjs` compare des octets.
comment on column public.sms_senders.status is
  'pending / declared / rejected / suspended. SEUL `declared` (et non retiré) autorise un envoi — trois états sur quatre refusent. Le trigger sms_senders_declaration_follows_name traite le renommage en DEUX cas distincts : depuis `declared` il fait retomber à `pending` (le nom déclaré au registre n''est plus celui-là, la déclaration ne vaut plus rien) ; depuis `suspended` il CONSERVE la suspension et son motif (une sanction porte sur le droit d''émettre de l''organisation, pas sur un nom, et ne se lève que par set_sms_sender_status).';

comment on function public.sms_senders_declaration_follows_name() is
  'Trigger BEFORE UPDATE sur sms_senders : un renommage annule la déclaration (declared_at, af2m_reference) dans tous les cas, mais NE LÈVE JAMAIS une suspension — `suspended` est conservé, `status_reason` avec lui, et seul set_sms_sender_status lève une sanction. Interdit aussi l''antidatage d''une déclaration.';
