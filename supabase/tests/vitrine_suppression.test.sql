-- ════════════════════════════════════════════════════════════
-- VITRINE — LA SUPPRESSION (VIT-14)
--
-- `delete_vitrine` est la SEULE porte qui efface une vitrine, et elle en
-- efface SEPT tables d'un coup. Ce qu'elle doit prouver n'est donc pas
-- seulement « ça supprime » : c'est qu'elle refuse tout ce qui n'est pas un
-- propriétaire de CETTE organisation, qu'elle n'emporte rien chez le voisin,
-- qu'elle laisse une trace, et qu'un second clic ne produit pas une erreur.
--
-- LES DONNÉES SONT CRÉÉES ICI, PAS EMPRUNTÉES AU SEED. Une suppression testée
-- sur le seed effacerait ce que les autres fichiers lisent — et l'ordre
-- d'exécution de pgTAP n'est pas un contrat sur lequel on parie.
-- ════════════════════════════════════════════════════════════

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- La RPC exige `service_role` : on pose la revendication, comme les autres
-- fichiers de ce dossier.
set local request.jwt.claims = '{"role":"service_role"}';

-- ── DEUX ORGANISATIONS VOISINES, chacune avec sa vitrine ──────────────────
insert into public.organizations (id, name, slug)
values ('d1000000-0000-4000-8000-000000000001', 'Suppression A', 'suppr-a'),
       ('d1000000-0000-4000-8000-000000000002', 'Suppression B', 'suppr-b');

insert into auth.users (id, email, instance_id, aud, role)
values ('d2000000-0000-4000-8000-000000000001', 'proprio-a@test.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('d2000000-0000-4000-8000-000000000002', 'editeur-a@test.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('d2000000-0000-4000-8000-000000000003', 'proprio-b@test.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.organization_members (organization_id, user_id, role)
values ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'owner'),
       ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'editor'),
       ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', 'owner');

insert into public.vitrine_settings (id, organization_id, slug, published)
values ('d3000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001', 'suppr-vitrine-a', true),
       ('d3000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000002', 'suppr-vitrine-b', true);

insert into public.vitrine_menus (id, organization_id, nom, ordre, active)
values ('d4000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001', 'Carte A', 1, true),
       ('d4000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000002', 'Carte B', 1, true);

insert into public.vitrine_categories (id, organization_id, menu_id, nom, ordre)
values ('d5000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'd4000000-0000-4000-8000-000000000001', 'Rubrique A', 1),
       ('d5000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000002',
        'd4000000-0000-4000-8000-000000000002', 'Rubrique B', 1);

insert into public.vitrine_items
  (id, organization_id, categorie_id, nom, ordre, disponible)
values ('d6000000-0000-4000-8000-000000000001',
        'd1000000-0000-4000-8000-000000000001',
        'd5000000-0000-4000-8000-000000000001', 'Plat A', 1, true),
       ('d6000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000002',
        'd5000000-0000-4000-8000-000000000002', 'Plat B', 1, true);

-- ── 1 à 3. CE QUI DOIT ÊTRE REFUSÉ ────────────────────────────────────────

-- L'ACTEUR MAL FORMÉ REND 42501, PAS 22P02. C'est la garde de forme AVANT le
-- cast : une valeur libre ne doit pas faire lever une erreur de conversion que
-- personne ne sait relier à une autorisation.
select throws_ok(
  $$select public.delete_vitrine('d1000000-0000-4000-8000-000000000001', 'pas-un-uuid')$$,
  '42501',
  'not authorized',
  'un acteur mal formé est refusé en 42501, jamais en 22P02 illisible'
);

select throws_ok(
  $$select public.delete_vitrine('d1000000-0000-4000-8000-000000000001',
                                 'd2000000-0000-4000-8000-000000000003')$$,
  '42501',
  'not authorized',
  'le propriétaire du VOISIN ne peut pas supprimer cette vitrine'
);

-- L'ÉDITEUR EST REFUSÉ, ET C'EST DÉLIBÉRÉ. Il peut écrire toute la carte ;
-- il ne peut pas la faire disparaître. `set_vitrine_slug` accepte les deux
-- parce qu'une adresse se remet ; ceci ne se répare pas.
select throws_ok(
  $$select public.delete_vitrine('d1000000-0000-4000-8000-000000000001',
                                 'd2000000-0000-4000-8000-000000000002')$$,
  '42501',
  'not authorized',
  'un éditeur ne supprime pas la vitrine — le geste ne se répare pas'
);

-- ── 4. LA SUPPRESSION D'A : CE QU'ELLE REND ───────────────────────────────
--
-- B N'EST JAMAIS SUPPRIMÉE. La première version de ce fichier effaçait B pour
-- tester le double appel, puis vérifiait plus bas que « le voisin est intact »
-- — sur l'organisation qu'elle venait d'effacer. Les deux assertions
-- d'isolation rougissaient donc pour une faute du scénario, pas de la RPC.
-- B reste le témoin, et le double appel se joue sur A, déjà supprimée.
select is(
  (select public.delete_vitrine(
     'd1000000-0000-4000-8000-000000000001',
     'd2000000-0000-4000-8000-000000000001') ->> 'slug'),
  'suppr-vitrine-a',
  'la réponse porte l''adresse LIBÉRÉE — l''appelant en a besoin pour purger le cache ISR'
);

-- ── 5. RIEN À SUPPRIMER N'EST PAS UNE ERREUR ──────────────────────────────
select is(
  (select public.delete_vitrine(
     'd1000000-0000-4000-8000-000000000001',
     'd2000000-0000-4000-8000-000000000001') ->> 'state'),
  'absente',
  'un SECOND appel rend « absente » sans lever — deux onglets, deux clics'
);

-- ── 6. LES SEPT TABLES SONT VIDES POUR A ──────────────────────────────────
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_settings
    where organization_id = 'd1000000-0000-4000-8000-000000000001'),
  0::bigint, 'les réglages de A ont disparu');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus
    where organization_id = 'd1000000-0000-4000-8000-000000000001'),
  0::bigint, 'les cartes de A ont disparu — aucune n''est laissée orpheline');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_categories
    where organization_id = 'd1000000-0000-4000-8000-000000000001'),
  0::bigint, 'les rubriques de A ont disparu');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_items
    where organization_id = 'd1000000-0000-4000-8000-000000000001'),
  0::bigint, 'les fiches de A ont disparu');

-- ── 7. LE VOISIN EST INTACT ───────────────────────────────────────────────
--
-- C'EST L'ASSERTION QUI COMPTE LE PLUS. Une clause `where organization_id`
-- oubliée sur l'une des sept suppressions viderait la vitrine de tous les
-- locataires, et rien d'autre dans ce fichier ne le verrait.
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_items
    where organization_id = 'd1000000-0000-4000-8000-000000000002'),
  1::bigint,
  'la fiche du VOISIN survit — la suppression est bornée à son organisation'
);

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus
    where organization_id = 'd1000000-0000-4000-8000-000000000002'),
  1::bigint,
  'la carte du voisin survit aussi — rien n''a débordé sur son organisation'
);

-- ── 8. LE SLUG EST REDEVENU LIBRE ─────────────────────────────────────────
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_settings
    where slug = 'suppr-vitrine-a'),
  0::bigint,
  'l''adresse est libérée — conséquence assumée, et l''écran la nomme'
);

-- ── 9. LE JOURNAL PORTE LA TRACE ──────────────────────────────────────────
select is(
  (select l.metadata ->> 'slug' from public.audit_logs l
    where l.action = 'vitrine.deleted'
      and l.organization_id = 'd1000000-0000-4000-8000-000000000001'
    order by l.created_at desc limit 1),
  'suppr-vitrine-a',
  'le journal nomme l''adresse libérée — de quoi expliquer un QR devenu muet'
);

select * from finish();
rollback;
