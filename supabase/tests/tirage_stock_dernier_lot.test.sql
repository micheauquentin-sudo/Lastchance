-- ============================================================
-- LA RÉSERVATION DU DERNIER LOT, ET SA BOUCLE DE RE-TIRAGE
--
-- Le mécanisme qui empêche la sur-émission du dernier exemplaire vit dans
-- `perform_atomic_spin` :
--
--     update public.prizes set stock = stock - 1
--       where id = v_prize.id and stock > 0;
--     if found then exit; end if;      -- sinon : on RE-TIRE
--
-- Le `select` qui a désigné le lot a lu un instantané ; entre ce `select` et
-- cet `update`, une autre transaction a pu prendre le dernier exemplaire. Le
-- `and stock > 0` fait alors échouer la réservation, `found` est faux, et la
-- boucle repart. Sans ce re-tirage, le dernier lot partirait deux fois — ou,
-- pire, le stock passerait à -1.
--
--
-- ── CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ─────────────
--
-- pgTAP est MONO-SESSION : un fichier de test tourne dans UNE transaction,
-- donc dans UNE connexion. **Deux appels séquentiels ne sont PAS un test de
-- concurrence**, et le prétendre donnerait une fausse impression de sûreté —
-- un test « de course » qui n'ouvre jamais deux sessions ne peut rien dire de
-- ce qui se passe quand elles se croisent.
--
-- Ce fichier prouve donc DEUX choses réelles et bornées :
--
--   1. un lot à stock 0 ne SORT pas — la roue rend `no_prize` au lieu de
--      distribuer un lot qui n'existe plus, et le stock ne descend jamais
--      sous zéro ;
--
--   2. le SECOND PASSAGE de la boucle de re-tirage S'EXÉCUTE — c'est du code
--      vivant, pas du code mort. La réservation est forcée à échouer une fois,
--      par un trigger installé le temps de cette transaction, et l'on constate
--      que la fonction repart au lieu d'insérer un spin sans avoir réservé.
--
-- Ce que ce fichier NE prouve PAS : que deux sessions RÉELLES en collision
-- aboutissent à un seul gagnant. Le trigger SIMULE la perte de la course ; il
-- ne la produit pas.
--
--
-- ── CE QUI COUVRE LA VRAIE CONCURRENCE, ET SA LIMITE ─────────
--
-- Contrairement à ce qu'on pourrait croire, ce dépôt POSSÈDE un harnais
-- multi-session : `scripts/concurrency-probe.mjs` ouvre de vraies sessions
-- `psql` simultanées, et son scénario 2 est exactement « perform_atomic_spin —
-- N joueurs, un seul lot en stock ». Il porte même un contrôle négatif dédié
-- (`redeem_sans_garde`) qui vérifie que la sonde ROUGIT quand la garde est
-- retirée.
--
-- Sa limite est ailleurs : `.github/workflows/concurrency.yml` est un
-- `workflow_dispatch`, déclenché À LA MAIN. Rien dans la CI de chaque push
-- n'exerce cette boucle — c'est ce trou-là que ce fichier bouche, et c'est
-- tout ce qu'il bouche. Il ne remplace pas la sonde et ne prétend pas la
-- remplacer : après un changement de cette RPC, la sonde reste le geste juste.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('c2000000-0000-4000-8000-000000000001', 'Test Dernier Lot', 'tap-dernier-lot');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('c2000000-0000-4000-8000-000000000002',
        'c2000000-0000-4000-8000-000000000001', 'Campagne dernier lot', 'active', 300);

-- `unlimited` : deux joueurs distincts doivent pouvoir tenter leur tour sans
-- qu'un « limit_reached » ne vienne masquer ce qu'on mesure.
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('c2000000-0000-4000-8000-000000000003',
        'c2000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000002', 'Roue TAP dernier lot', 'unlimited');

-- UN SEUL lot, gagnant, `stock = 1`, `weight = 100` : le tirage est
-- déterministe (un seul candidat, donc `ceiling > v_pick` toujours vrai) et
-- l'épuisement du stock est atteint en un tour. Aucun lot perdant : quand le
-- stock tombe à 0, la somme des poids tirables devient 0 et la fonction doit
-- rendre `no_prize` — c'est précisément le chemin qu'on veut voir.
insert into public.prizes (id, organization_id, wheel_id, label, stock, weight, is_active, is_losing)
values ('c2000000-0000-4000-8000-000000000004',
        'c2000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000003', 'Dernier lot TAP', 1, 100, true, false);


-- ════════════════════════════════════════════════════════════
-- LE HARNAIS — faire échouer la réservation UNE fois
--
-- Un trigger `before update` qui rend NULL fait SAUTER la mise à jour de la
-- ligne, et Postgres ne la compte pas dans les lignes affectées : côté
-- plpgsql, `found` est donc FAUX — exactement l'état dans lequel se trouve une
-- session qui vient de perdre la course sur le dernier exemplaire.
--
-- LE COMPTEUR N'EST PAS DÉCORATIF : c'est lui qui prouve le point 2. Sans lui,
-- on constaterait seulement que le stock a fini à 0 — ce qu'une fonction sans
-- boucle du tout produirait aussi si le trigger n'avait jamais mordu.
--
-- IL NE SUPPRIME QUE LE PREMIER PASSAGE, et c'est une garde contre nous-mêmes :
-- un trigger qui refuserait toujours ferait BOUCLER `perform_atomic_spin` à
-- l'infini, et un job de CI bloqué coûte infiniment plus cher qu'un test rouge.
--
-- Nommé `aaa_…` pour s'exécuter AVANT `prizes_low_stock_watch` (les triggers
-- d'un même événement partent dans l'ordre alphabétique) : le passage annulé
-- l'est alors entièrement, sans laisser derrière lui la moitié des effets des
-- autres triggers.
create table public.tap_journal_reservation (passage integer not null);

create or replace function public.tap_reservation_perdue()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_deja integer;
begin
  if old.id <> 'c2000000-0000-4000-8000-000000000004'::uuid then
    return new;
  end if;

  select pg_catalog.count(*)::integer into v_deja
  from public.tap_journal_reservation;

  insert into public.tap_journal_reservation(passage) values (v_deja + 1);

  if v_deja = 0 then
    return null;   -- zéro ligne affectée → `found` faux → la boucle repart
  end if;
  return new;      -- deuxième passage : la réservation aboutit pour de bon
end
$$;

create trigger aaa_tap_reservation_perdue
  before update on public.prizes
  for each row execute function public.tap_reservation_perdue();


-- ════════════════════════════════════════════════════════════
-- 1. LE SECOND PASSAGE DE LA BOUCLE S'EXÉCUTE
-- ════════════════════════════════════════════════════════════
create table public.tap_dernier_lot_r1 as
  select * from public.perform_atomic_spin(
    'c2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000003',
    repeat('a', 64), null, 'direct');

select is(
  (select pg_catalog.count(*)::int from public.tap_journal_reservation),
  2,
  'la réservation a été tentée DEUX fois : le second passage de la boucle de re-tirage s''exécute (ce n''est pas du code mort)'
);

select is(
  (select prize_id from public.tap_dernier_lot_r1),
  'c2000000-0000-4000-8000-000000000004'::uuid,
  'après le re-tirage, le joueur obtient bien le lot — la réservation ratée n''a pas fait perdre le tour'
);

select is(
  (select stock from public.prizes where id = 'c2000000-0000-4000-8000-000000000004'),
  0,
  'le stock est décrémenté UNE seule fois malgré les deux passages (1 → 0, jamais -1)'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c2000000-0000-4000-8000-000000000003'
       and player_key = repeat('a', 64)),
  1,
  'un seul spin écrit : la boucle ne matérialise pas un tour par passage'
);

-- Le harnais est retiré : la suite mesure le comportement NU de la fonction.
drop trigger aaa_tap_reservation_perdue on public.prizes;


-- ════════════════════════════════════════════════════════════
-- 2. UN LOT À STOCK 0 NE SORT PAS
--
-- Second joueur, même roue, plus rien en stock. La somme des poids tirables
-- tombe à 0 et la fonction doit REFUSER — pas distribuer un lot inexistant,
-- pas descendre le stock à -1.
--
-- `no_prize` n'apparaissait dans AUCUN test de ce dossier pour la roue
-- publique : ce chemin de sortie de la boucle n'était éprouvé que sur les
-- tours OFFERTS (calendar, loyalty, referral, reserver_attente), qui passent
-- par d'autres fonctions.
-- ════════════════════════════════════════════════════════════
create table public.tap_dernier_lot_r2 as
  select * from public.perform_atomic_spin(
    'c2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000003',
    repeat('b', 64), null, 'direct');

select is(
  (select denial_reason from public.tap_dernier_lot_r2),
  'no_prize',
  'stock épuisé : la roue REFUSE (`no_prize`) au lieu de distribuer le lot une seconde fois'
);

select is(
  (select spin_id from public.tap_dernier_lot_r2),
  null::uuid,
  'stock épuisé : aucun spin_id rendu'
);

select is(
  (select prize_id from public.tap_dernier_lot_r2),
  null::uuid,
  'stock épuisé : aucun lot rendu — rien à faire signer en jeton de retrait'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c2000000-0000-4000-8000-000000000003'
       and player_key = repeat('b', 64)),
  0,
  'stock épuisé : AUCUN spin créé pour le second joueur'
);

select is(
  (select stock from public.prizes where id = 'c2000000-0000-4000-8000-000000000004'),
  0,
  'stock épuisé : il reste 0, JAMAIS -1 — le `and stock > 0` de la réservation tient'
);

select * from finish();
rollback;
