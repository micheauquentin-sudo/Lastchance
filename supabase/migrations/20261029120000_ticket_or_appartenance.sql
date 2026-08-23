-- ============================================================
-- TKT-1 · L'APPARTENANCE DU LOT, DITE PAR LA BASE
-- (suite de 20261028120000_ticket_or.sql)
--
-- Le capteur `fk_composites_couverture` a rougi sur les deux clés étrangères
-- que le Ticket d'Or venait de poser : `tickets_or.lot_id` et
-- `tickets_or.reward_issuance_id` relient deux tables porteuses d'un
-- `organization_id` par une colonne UNIQUE. Une telle clé vérifie que la ligne
-- visée existe ; elle ne dit rien de son commerce. La RLS ne rattrape pas ce
-- point — elle décide de ce qu'une session VOIT, pas de ce qu'une écriture peut
-- coudre ensemble.
--
-- ── CE QUE LE CAPTEUR A RAISON DE DIRE, ET CE QU'IL NE DIT PAS ──
--
-- Aucune fuite n'en découlait. Les deux colonnes sont écrites par la seule
-- `tirer_ticket_or`, qui choisit le lot `where organization_id =
-- v_ticket.organization_id` et crée la récompense dans la MÊME transaction, sur
-- la MÊME organisation. Aucun appelant ne fournit ces identifiants, donc aucun
-- ne peut les croiser. Mais « garanti par le code » n'est pas « garanti par la
-- base » : la première promesse ne vaut que tant que personne n'ouvre un second
-- chemin d'écriture, et c'est exactement ce que personne ne remarque.
--
-- ── POURQUOI UNE SEULE DES DEUX EST FERMÉE ICI ──
--
-- `lot_id` l'est, et ne coûte rien : les deux tables sont nées avec le Ticket
-- d'Or, et la clé `(id, organization_id)` qui manquait à `tickets_or_lots` se
-- pose sans toucher à quoi que ce soit d'antérieur.
--
-- `reward_issuance_id` ne l'est pas. La fermer demanderait un index unique
-- `(id, organization_id)` sur `reward_issuances` — table partagée par les onze
-- familles de récompenses et écrite à chaque gain. Ce n'est pas le périmètre du
-- Ticket d'Or, et `experience_events.reward_issuance_id` porte déjà la même
-- dette, pour la même raison. Elle est donc INSCRITE dans la liste assumée du
-- capteur, à côté de son précédent : nommée, pas innocentée.
--
-- ── `SET NULL` NE PEUT PAS ÊTRE AVEUGLE ──
--
-- Sans liste de colonnes, `on delete set null` viderait les DEUX colonnes de la
-- clé — dont `organization_id`, qui est `not null`. Retirer un lot déjà tiré
-- échouerait alors sur une violation, et le commerçant ne pourrait plus faire
-- le ménage dans ses lots. La forme `set null (lot_id)` existe depuis
-- Postgres 15 : la base locale est en 15.8, la production en 17.6.
-- ============================================================

-- ── 1. LA CLÉ QUE LA COMPOSITE EXIGE ────────────────────────
-- `(id, organization_id)` est trivialement unique — `id` est déjà la clé
-- primaire — mais Postgres exige une contrainte déclarée pour l'accepter comme
-- cible d'une clé étrangère.

alter table public.tickets_or_lots
  drop constraint if exists tickets_or_lots_id_org_unique;

alter table public.tickets_or_lots
  add constraint tickets_or_lots_id_org_unique unique (id, organization_id);

-- ── 2. LA COMPOSITE ─────────────────────────────────────────
-- La clé simple posée par `references` subsiste et devient COUVERTE : elle
-- n'est plus seule à décider. C'est le patron du projet, celui de
-- `wheels_campaign_org_fk`.

alter table public.tickets_or
  drop constraint if exists tickets_or_lot_org_fk;

alter table public.tickets_or
  add constraint tickets_or_lot_org_fk
  foreign key (lot_id, organization_id)
  references public.tickets_or_lots (id, organization_id)
  on delete set null (lot_id);

comment on constraint tickets_or_lot_org_fk on public.tickets_or is
  'Un ticket ne peut porter que le lot de SON commerce. La clé simple sur '
  'lot_id ne vérifiait que l''existence.';

-- ── 3. LE CHEMIN DE LA SUPPRESSION ──────────────────────────
-- Retirer un lot fait chercher à Postgres les tickets qui le portent. Sans
-- index, c'est un parcours complet de `tickets_or` — la table qui grossit à
-- chaque visite constatée, quand `tickets_or_lots` reste à quelques lignes.

create index if not exists tickets_or_lot_idx
  on public.tickets_or (lot_id, organization_id)
  where lot_id is not null;

-- ── 4. LA GARDE ─────────────────────────────────────────────
-- Ce qui précède est du DDL sans condition : s'il a passé, il a tenu. Ce que
-- cette garde vérifie est l'invariant qu'on ne voit PAS dans le DDL — que la
-- suppression d'un lot vide bien `lot_id` seul, et laisse `organization_id`
-- debout. Une `set null` aveugle passerait le `add constraint` et n'échouerait
-- qu'au premier lot retiré, en production, un vendredi.

do $$
declare
  v_action text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into strict v_action
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'tickets_or'
     and c.conname = 'tickets_or_lot_org_fk';

  if v_action !~ 'SET NULL \(lot_id\)' then
    raise exception
      'tickets_or_lot_org_fk ne vide pas lot_id SEUL : %', v_action;
  end if;
end
$$;
