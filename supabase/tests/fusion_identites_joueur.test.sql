-- ============================================================
-- Fusion de deux identités joueur (ID-4)
--
-- Ce que ce fichier doit prouver, dans l'ordre où ça compte :
--   · le piège existe AVANT la fusion — `resolve_player_identity` lève bien
--     « legacy identity is linked to another player » ;
--   · il n'existe PLUS après. C'est LE test qui dit si le filet sert à
--     quelque chose : sans lui, on aurait déplacé des lignes sans vérifier
--     que la base accepte enfin de reconnaître une seule personne ;
--   · l'adhésion en conflit devient UNE ligne, avec la bonne fenêtre ;
--   · rien de ce qui appartient à un TROISIÈME joueur ne bouge. Sans ce
--     contrôle négatif, un `update ... where player_id is not null` trop
--     large passerait toutes les autres assertions.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (id, name, slug)
values
  ('fe000000-0000-4000-8000-000000000001', 'Fusion A', 'tap-fusion-a'),
  ('fe000000-0000-4000-8000-000000000002', 'Fusion B', 'tap-fusion-b');

insert into public.campaigns (id, organization_id, name, status)
values
  (
    'fe000000-0000-4000-8000-000000000011',
    'fe000000-0000-4000-8000-000000000001',
    'Campagne A1',
    'active'
  ),
  (
    'fe000000-0000-4000-8000-000000000012',
    'fe000000-0000-4000-8000-000000000001',
    'Campagne A2',
    'active'
  ),
  (
    'fe000000-0000-4000-8000-000000000013',
    'fe000000-0000-4000-8000-000000000002',
    'Campagne B1',
    'active'
  );

insert into public.qr_codes (id, organization_id, campaign_id, slug)
values
  (
    'fe000000-0000-4000-8000-000000000021',
    'fe000000-0000-4000-8000-000000000001',
    'fe000000-0000-4000-8000-000000000011',
    'FUSIONA1'
  ),
  (
    'fe000000-0000-4000-8000-000000000022',
    'fe000000-0000-4000-8000-000000000001',
    'fe000000-0000-4000-8000-000000000012',
    'FUSIONA2'
  );

-- ── Trois identités : le survivant, l'absorbé, et le témoin ──
-- Le survivant et l'absorbé partagent DEUX expériences (le cas courant : c'est
-- ce partage qui révèle qu'ils sont la même personne) et l'absorbé en a une
-- troisième, dans un AUTRE tenant, que le survivant ne connaît pas.

create temporary table tap_p1 on commit drop as
select * from public.resolve_player_identity(
  repeat('a', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000011',
  repeat('1', 64),
  'unknown',
  null
);

create temporary table tap_p1_a2 on commit drop as
select * from public.resolve_player_identity(
  repeat('a', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000012',
  repeat('5', 64),
  'direct',
  null
);

create temporary table tap_p2 on commit drop as
select * from public.resolve_player_identity(
  repeat('b', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000011',
  repeat('2', 64),
  'qr',
  'fe000000-0000-4000-8000-000000000021'
);

create temporary table tap_p2_a2 on commit drop as
select * from public.resolve_player_identity(
  repeat('b', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000012',
  repeat('6', 64),
  'qr',
  'fe000000-0000-4000-8000-000000000022'
);

create temporary table tap_p2_b1 on commit drop as
select * from public.resolve_player_identity(
  repeat('b', 64),
  'fe000000-0000-4000-8000-000000000002',
  'campaign',
  'fe000000-0000-4000-8000-000000000013',
  repeat('4', 64),
  'share',
  null
);

create temporary table tap_p3 on commit drop as
select * from public.resolve_player_identity(
  repeat('c', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000011',
  repeat('3', 64),
  'direct',
  null
);

create temporary table tap_ids on commit drop as
select
  (select player_id from tap_p1) as survivant,
  (select player_id from tap_p2) as absorbe,
  (select player_id from tap_p3) as temoin;

select isnt((select survivant from tap_ids), (select absorbe from tap_ids),
  'le décor produit bien DEUX identités distinctes pour la même personne');
select isnt((select survivant from tap_ids), (select temoin from tap_ids),
  'le témoin est une troisième identité');

-- `now()` est constant dans une transaction : sans ces deux mises à jour, les
-- deux adhésions porteraient des dates identiques et `least`/`greatest`
-- verdiraient sans rien prouver.
update public.player_experience_memberships
   set first_seen_at = timestamptz '2026-01-10 09:00:00+00',
       last_seen_at = timestamptz '2026-02-10 09:00:00+00'
 where player_id = (select survivant from tap_ids)
   and experience_id = 'fe000000-0000-4000-8000-000000000011';

update public.player_experience_memberships
   set first_seen_at = timestamptz '2026-01-05 09:00:00+00',
       last_seen_at = timestamptz '2026-03-15 09:00:00+00'
 where player_id = (select absorbe from tap_ids)
   and experience_id = 'fe000000-0000-4000-8000-000000000011';

-- ── Le piège, AVANT la fusion ──
-- L'empreinte historique de l'absorbé, présentée avec le cookie du survivant :
-- c'est exactement ce que produit une personne qui revient sur son premier
-- navigateur. La base refuse, définitivement.
select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('a', 64),
      'fe000000-0000-4000-8000-000000000001',
      'campaign',
      'fe000000-0000-4000-8000-000000000011',
      repeat('2', 64),
      'direct',
      null
    )$$,
  '23505',
  'legacy identity is linked to another player',
  'avant fusion, rapprocher les deux identités est IMPOSSIBLE'
);

-- État du témoin avant fusion : tout ce qui suit doit être strictement
-- identique après.
create temporary table tap_temoin_avant on commit drop as
select
  (select count(*)::integer from public.player_devices d
    where d.player_id = (select temoin from tap_ids)) as devices,
  (select count(*)::integer from public.player_organization_memberships m
    where m.player_id = (select temoin from tap_ids)) as adhesions_org,
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select temoin from tap_ids)) as adhesions_exp,
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select temoin from tap_ids)) as ponts,
  (select count(*)::integer from public.experience_events ev
    where ev.player_id = (select temoin from tap_ids)) as evenements;

-- ────────────────────────────────────────────────────────────
-- LA FUSION
-- ────────────────────────────────────────────────────────────

create temporary table tap_fusion on commit drop as
select public.merge_player_identities(
  (select survivant from tap_ids),
  (select absorbe from tap_ids)
) as rendu;

select is(
  (select rendu from tap_fusion),
  (select survivant from tap_ids),
  'la fusion rend l identifiant du SURVIVANT, c est-à-dire son premier argument'
);

-- ── Ce qui a suivi le survivant ──

select is(
  (select count(*)::integer from public.player_devices d
    where d.player_id = (select survivant from tap_ids)),
  2,
  'les deux appareils appartiennent désormais au survivant'
);
select is(
  (select count(*)::integer from public.player_devices d
    where d.player_id = (select absorbe from tap_ids)),
  0,
  'l absorbé ne porte plus aucun appareil'
);

select is(
  (select count(*)::integer from public.player_organization_memberships m
    where m.player_id = (select survivant from tap_ids)),
  2,
  'le survivant hérite du tenant que seul l absorbé connaissait'
);
select is(
  (select count(*)::integer from public.player_organization_memberships m
    where m.player_id = (select absorbe from tap_ids)),
  0,
  'l absorbé ne porte plus aucune adhésion d organisation'
);

select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select survivant from tap_ids)),
  3,
  'trois expériences pour le survivant : deux fondues, une héritée'
);
select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select absorbe from tap_ids)),
  0,
  'l absorbé ne porte plus aucune adhésion d expérience'
);

select is(
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select survivant from tap_ids)),
  5,
  'les cinq empreintes historiques pointent le survivant'
);
select is(
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select absorbe from tap_ids)),
  0,
  'l absorbé ne porte plus aucune empreinte historique'
);

-- ── L'ADHÉSION EN CONFLIT : une seule ligne, la bonne fenêtre ──

select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  1,
  'les deux adhésions à la même expérience n en font plus qu UNE'
);

select is(
  (select first_seen_at from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  timestamptz '2026-01-05 09:00:00+00',
  'la fenêtre garde la PLUS ANCIENNE première visite, celle de l absorbé'
);
select is(
  (select last_seen_at from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  timestamptz '2026-03-15 09:00:00+00',
  'la fenêtre garde la PLUS RÉCENTE dernière visite, celle de l absorbé'
);

-- `acquisition_source` : le survivant valait `unknown`, donc il prend celle de
-- l'absorbé.
select is(
  (select acquisition_source from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  'qr',
  'une source `unknown` cède la place à la source mesurée de l absorbé'
);
select is(
  (select acquisition_qr_code_id from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  'fe000000-0000-4000-8000-000000000021'::uuid,
  'le QR d origine de l absorbé est récupéré quand le survivant n en avait pas'
);

-- Sur la seconde expérience, le survivant valait `direct` : COLLANT.
select is(
  (select acquisition_source from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000012'
      and e.player_id = (select survivant from tap_ids)),
  'direct',
  'une source déjà posée n est PAS écrasée par la fusion (`direct` est collant)'
);
select is(
  (select acquisition_qr_code_id from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000012'
      and e.player_id = (select survivant from tap_ids)),
  'fe000000-0000-4000-8000-000000000022'::uuid,
  'le QR est tout de même récupéré, lui, puisque le survivant n en avait aucun'
);

-- L'expérience du second tenant, que le survivant ne connaissait pas.
select is(
  (select acquisition_source from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000013'
      and e.player_id = (select survivant from tap_ids)),
  'share',
  'l adhésion héritée d un autre tenant arrive intacte'
);

-- Le pont de l'absorbé pointe la ligne d'adhésion du survivant, pas une autre.
select is(
  (select l.experience_membership_id from public.player_legacy_identities l
    where l.legacy_identity_hash = repeat('2', 64)),
  (select e.id from public.player_experience_memberships e
    where e.experience_id = 'fe000000-0000-4000-8000-000000000011'
      and e.player_id = (select survivant from tap_ids)),
  'l empreinte de l absorbé est rattachée à l adhésion FONDUE du survivant'
);

-- ── L'absorbé est marqué, PAS supprimé ──

select is(
  (select count(*)::integer from public.players p
    where p.id = (select absorbe from tap_ids)),
  1,
  'la ligne de l absorbé existe toujours : une fusion erronée reste diagnosticable'
);
select is(
  (select status from public.players p
    where p.id = (select absorbe from tap_ids)),
  'merged',
  'l absorbé porte le statut `merged`'
);
select is(
  (select merged_into_player_id from public.players p
    where p.id = (select absorbe from tap_ids)),
  (select survivant from tap_ids),
  'le renvoi vers le survivant est enregistré'
);
select ok(
  (select merged_at is not null from public.players p
    where p.id = (select absorbe from tap_ids)),
  'la date de fusion est enregistrée'
);
select is(
  (select status from public.players p
    where p.id = (select survivant from tap_ids)),
  'active',
  'le survivant reste actif'
);

-- ── CONTRÔLE NÉGATIF D ISOLATION ──
-- Rien de ce qui appartient au témoin n a bougé. C est ce contrôle qui
-- distingue une fusion ciblée d une requête trop large.

select is(
  (select count(*)::integer from public.player_devices d
    where d.player_id = (select temoin from tap_ids)),
  (select devices from tap_temoin_avant),
  'les appareils du témoin sont intacts'
);
select is(
  (select count(*)::integer from public.player_organization_memberships m
    where m.player_id = (select temoin from tap_ids)),
  (select adhesions_org from tap_temoin_avant),
  'les adhésions d organisation du témoin sont intactes'
);
select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select temoin from tap_ids)),
  (select adhesions_exp from tap_temoin_avant),
  'les adhésions d expérience du témoin sont intactes'
);
select is(
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select temoin from tap_ids)),
  (select ponts from tap_temoin_avant),
  'les empreintes historiques du témoin sont intactes'
);
select is(
  (select count(*)::integer from public.experience_events ev
    where ev.player_id = (select temoin from tap_ids)),
  (select evenements from tap_temoin_avant),
  'l analytique du témoin n a pas été déplacée'
);
select is(
  (select l.player_id from public.player_legacy_identities l
    where l.legacy_identity_hash = repeat('3', 64)),
  (select temoin from tap_ids),
  'l empreinte du témoin appartient toujours au témoin'
);
select is(
  (select status from public.players p
    where p.id = (select temoin from tap_ids)),
  'active',
  'le témoin n a pas été marqué comme fusionné'
);

-- ── IDEMPOTENCE ──

create temporary table tap_etat_apres_fusion on commit drop as
select
  (select count(*)::integer from public.player_devices d
    where d.player_id = (select survivant from tap_ids)) as devices,
  (select count(*)::integer from public.player_organization_memberships m
    where m.player_id = (select survivant from tap_ids)) as adhesions_org,
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select survivant from tap_ids)) as adhesions_exp,
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select survivant from tap_ids)) as ponts,
  (select count(*)::integer from public.experience_events ev
    where ev.player_id = (select survivant from tap_ids)) as evenements,
  (select merged_at from public.players p
    where p.id = (select absorbe from tap_ids)) as marque_a;

select is(
  (select public.merge_player_identities(
     (select survivant from tap_ids),
     (select absorbe from tap_ids)
   )),
  (select survivant from tap_ids),
  'rejouer la même fusion rend le même survivant, sans erreur'
);

select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select survivant from tap_ids)),
  (select adhesions_exp from tap_etat_apres_fusion),
  'la seconde fusion ne duplique aucune adhésion'
);
select is(
  (select count(*)::integer from public.player_legacy_identities l
    where l.player_id = (select survivant from tap_ids)),
  (select ponts from tap_etat_apres_fusion),
  'la seconde fusion ne duplique aucune empreinte'
);
select is(
  (select count(*)::integer from public.experience_events ev
    where ev.player_id = (select survivant from tap_ids)),
  (select evenements from tap_etat_apres_fusion),
  'la seconde fusion n émet aucun nouvel événement : elle sort avant d écrire'
);
select is(
  (select merged_at from public.players p
    where p.id = (select absorbe from tap_ids)),
  (select marque_a from tap_etat_apres_fusion),
  'la seconde fusion ne réécrit même pas la date de fusion'
);

-- Fusionner un joueur avec lui-même : un non-événement, pas une erreur.
select is(
  (select public.merge_player_identities(
     (select survivant from tap_ids),
     (select survivant from tap_ids)
   )),
  (select survivant from tap_ids),
  'fusionner un joueur avec lui-même rend ce joueur'
);
select is(
  (select count(*)::integer from public.player_experience_memberships e
    where e.player_id = (select survivant from tap_ids)),
  (select adhesions_exp from tap_etat_apres_fusion),
  'fusionner un joueur avec lui-même ne change rien'
);
select is(
  (select status from public.players p
    where p.id = (select survivant from tap_ids)),
  'active',
  'fusionner un joueur avec lui-même ne le marque pas comme absorbé'
);

-- ────────────────────────────────────────────────────────────
-- LE TEST QUI PROUVE QUE LE FILET SERT À QUELQUE CHOSE
-- ────────────────────────────────────────────────────────────
-- Même appel qu au début du fichier — celui qui levait 23505.

create temporary table tap_apres on commit drop as
select * from public.resolve_player_identity(
  repeat('a', 64),
  'fe000000-0000-4000-8000-000000000001',
  'campaign',
  'fe000000-0000-4000-8000-000000000011',
  repeat('2', 64),
  'direct',
  null
);

select is(
  (select player_id from tap_apres),
  (select survivant from tap_ids),
  'APRÈS fusion, l empreinte de l absorbé résout vers le SURVIVANT au lieu de lever'
);

-- Et le cookie global de l absorbé mène lui aussi au survivant.
select is(
  (select player_id from public.lookup_player_identity(
     repeat('b', 64),
     'fe000000-0000-4000-8000-000000000001',
     'campaign',
     'fe000000-0000-4000-8000-000000000011'
   )),
  (select survivant from tap_ids),
  'l ancien cookie de l absorbé retrouve le survivant'
);

-- ── Refus ──

select throws_ok(
  $$select public.merge_player_identities(
      'fe000000-0000-4000-8000-0000000000d1',
      'fe000000-0000-4000-8000-0000000000d2')$$,
  '22023',
  'unknown player identity',
  'une identité inconnue est refusée'
);

insert into auth.users (id, email) values
  ('fe000000-0000-4000-8000-0000000000f1', 'fusion-1@tap-fusion.local'),
  ('fe000000-0000-4000-8000-0000000000f2', 'fusion-2@tap-fusion.local');

insert into public.players (
  id, auth_user_id, identity_consent_version, identity_consent_at,
  identity_linked_at
) values
  (
    'fe000000-0000-4000-8000-0000000000e1',
    'fe000000-0000-4000-8000-0000000000f1',
    'identity-v1', now(), now()
  ),
  (
    'fe000000-0000-4000-8000-0000000000e2',
    'fe000000-0000-4000-8000-0000000000f2',
    'identity-v1', now(), now()
  );

select throws_ok(
  $$select public.merge_player_identities(
      'fe000000-0000-4000-8000-0000000000e1',
      'fe000000-0000-4000-8000-0000000000e2')$$,
  '42501',
  'cannot merge two nominal player identities',
  'deux liens nominatifs ne fusionnent pas : un consentement ne se transfère pas'
);

-- Le survivant a déjà absorbé quelqu un ; l absorbé, lui, est déjà versé
-- ailleurs. Les deux sens sont refusés plutôt que de construire une chaîne.
select throws_ok(
  $$select public.merge_player_identities(
      'fe000000-0000-4000-8000-0000000000e1',
      (select absorbe from tap_ids))$$,
  '23505',
  'absorbed player identity is already merged into another player',
  'une identité déjà versée ailleurs ne se re-fusionne pas'
);

-- ── ACL ──

select ok(
  has_function_privilege(
    'service_role',
    'public.merge_player_identities(uuid,uuid)',
    'EXECUTE'
  ),
  'seul le serveur peut fusionner deux identités'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.merge_player_identities(uuid,uuid)',
    'EXECUTE'
  ),
  'anon ne peut pas fusionner deux identités'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.merge_player_identities(uuid,uuid)',
    'EXECUTE'
  ),
  'un commerçant ne peut pas fusionner deux identités joueur'
);

-- La fusion est `security definer` : son `search_path` doit être figé, comme
-- tout le reste du schéma (`search_path_invariant.test.sql` le garde
-- globalement, on le vérifie ici sur la fonction du lot).
select is(
  (select p.proconfig
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'merge_player_identities'),
  (select p.proconfig
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'resolve_player_identity'),
  'la fusion fige son search_path exactement comme resolve_player_identity'
);

select * from finish();
rollback;
