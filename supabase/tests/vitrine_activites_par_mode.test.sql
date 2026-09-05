-- ============================================================
-- VIT-53 — LA VITRINE FILTRE SES ACTIVITÉS PAR MODE (20261207120000)
--
-- Ce que ce fichier garde : la page publique n'annonce que les activités dont
-- l'organisation détient la clé, activité PAR activité, et non plus d'un bloc.
--
-- ── LE DÉFAUT QUE CE LOT FERME ──
--
-- RDV-7 (20261206120000) a rendu « Réservation » (`rendez_vous`) vendable sans
-- « Moments » (`reserver`), mais `vitrine_public_state` gardait `reserver` en
-- dur pour ses TROIS listes. Une organisation qui n'avait que `rendez_vous`
-- obtenait donc une page SERVIE avec une liste d'activités VIDE : une vitrine
-- muette, pas un refus. C'est le pire des deux — un refus se voit.
--
-- ── LA MATRICE, DANS LES DEUX SENS ──
--
-- Un test qui ne prouve qu'une direction reste vert sur une garde qui dit
-- toujours oui. Les quatre organisations couvrent les quatre états du couple,
-- et chacune porte LES DEUX modes d'activité :
--
--              reserver | rendez_vous | « Atelier »   | « Service du soir »
--                       |             | (`moment`)    | (`rendez_vous`)
--   SALLE        non    |     oui     |   ABSENTE     |     PRÉSENTE
--   MOMENTS      oui    |     non     |   PRÉSENTE    |     ABSENTE
--   LES DEUX     oui    |     oui     |   PRÉSENTE    |     PRÉSENTE
--   AUCUN        non    |     non     |   ABSENTE     |     ABSENTE
--
-- MOMENTS EST LA LIGNE QUI COMPTE LE PLUS : c'est la population d'aujourd'hui.
-- Elle doit voir EXACTEMENT ce qu'elle voyait hier, sans quoi ce lot serait une
-- régression déguisée en correctif.
--
-- ── LES FILES ET LES OFFRES GARDENT `reserver`, ET C'EST ÉPINGLÉ ICI ──
--
-- Elles n'ont pas de mode : `reservation_stock_offers` ne porte aucune
-- activité, et `reservation_queues.activity_id` est NULLABLE. Surtout,
-- `queue_join` et `hold_stock_offer` exigent `reserver` dans le catalogue
-- vivant — leur annoncer une porte que ces RPC refusent serait la « promesse
-- rompue » que 20261020120000 interdit. §2 et §3 le gardent dans les deux
-- sens : PRÉSENTES avec `reserver`, VIDES sans lui, quel que soit
-- `rendez_vous`.
--
-- ── L'ORGANISATION SANS AUCUNE DES DEUX CLÉS EST CONSTATÉE, PAS SUPPOSÉE ──
--
-- §4 épingle un comportement INCHANGÉ par ce lot : avant, le bloc vidait ses
-- trois listes ; après, ses deux activités échouent chacune sur SA propre clé
-- et les deux autres listes restent vidées par le bloc. Même document, deux
-- chemins. Il est gardé parce qu'un filtre par objet écrit trop large — « au
-- moins une des deux clés », par exemple — le ferait basculer sans bruit.
--
-- ── ET LE CONTRÔLE DE PORTÉE, PARCE QU'UNE LISTE VIDE EST MUETTE ──
--
-- Une liste vide l'est pour toutes les raisons du monde : activité inactive,
-- vitrine dépubliée, organisation fausse. §6 repose la clé MANQUANTE sur
-- l'organisation SALLE et rejoue LA MÊME lecture — c'est la seule preuve que
-- c'était bien la clé qui filtrait.
--
-- ── LES INSTANTS SONT RELATIFS ──
--
-- Tout est ancré sur `now()` : `vitrine_public_state` juge les octrois et la
-- fenêtre des offres de stock à cet instant-là et à aucun autre.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
--
-- QUATRE organisations rigoureusement identiques hors leurs octrois : même
-- offre, même statut, mêmes deux activités, même file, même offre de stock,
-- même vitrine publiée. La seule variable est le droit.

insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('a1c70000-0000-4000-8000-00000000000a', 'Salle seule', 'tap-mode-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('a1c70000-0000-4000-8000-00000000000b', 'Moments seuls', 'tap-mode-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('a1c70000-0000-4000-8000-00000000000c', 'Les deux', 'tap-mode-c',
   'active', 'starter', 'Europe/Paris', 6),
  ('a1c70000-0000-4000-8000-00000000000d', 'Ni l''un ni l''autre', 'tap-mode-d',
   'active', 'starter', 'Europe/Paris', 6);

-- `vitrine` PARTOUT : c'est lui qui fait SERVIR la page, et ce fichier ne
-- parle que de ce qu'elle annonce une fois servie. Les deux clés de Réserver
-- sont posées séparément — c'est tout l'objet du lot.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('a1c70000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000c', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000d', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000a', 'rendez_vous', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000b', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000c', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('a1c70000-0000-4000-8000-00000000000c', 'rendez_vous', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- DEUX ACTIVITÉS PAR ORGANISATION : un Moment (`booking_mode` par défaut) et
-- une salle. « Atelier » trie AVANT « Service du soir » — l'ordre du document
-- est `order by name, id`, et les assertions de §3 en dépendent.
insert into public.reservation_activities
  (id, organization_id, name, active, booking_mode,
   duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes,
   table_turn_minutes)
values
  ('a1c70000-0000-4000-8000-0000000002a1',
   'a1c70000-0000-4000-8000-00000000000a', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('a1c70000-0000-4000-8000-0000000002a2',
   'a1c70000-0000-4000-8000-00000000000a', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('a1c70000-0000-4000-8000-0000000002b1',
   'a1c70000-0000-4000-8000-00000000000b', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('a1c70000-0000-4000-8000-0000000002b2',
   'a1c70000-0000-4000-8000-00000000000b', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('a1c70000-0000-4000-8000-0000000002c1',
   'a1c70000-0000-4000-8000-00000000000c', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('a1c70000-0000-4000-8000-0000000002c2',
   'a1c70000-0000-4000-8000-00000000000c', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('a1c70000-0000-4000-8000-0000000002d1',
   'a1c70000-0000-4000-8000-00000000000d', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('a1c70000-0000-4000-8000-0000000002d2',
   'a1c70000-0000-4000-8000-00000000000d', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90);

-- UNE FILE ET UNE OFFRE PAR ORGANISATION. La file est posée SANS activité
-- (`activity_id` null) : c'est le cas qui prouve qu'aucun mode ne s'en dérive.
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries)
values
  ('a1c70000-0000-4000-8000-0000000003a1',
   'a1c70000-0000-4000-8000-00000000000a', null, 'Comptoir', 'open', 50),
  ('a1c70000-0000-4000-8000-0000000003b1',
   'a1c70000-0000-4000-8000-00000000000b', null, 'Comptoir', 'open', 50),
  ('a1c70000-0000-4000-8000-0000000003c1',
   'a1c70000-0000-4000-8000-00000000000c', null, 'Comptoir', 'open', 50),
  ('a1c70000-0000-4000-8000-0000000003d1',
   'a1c70000-0000-4000-8000-00000000000d', null, 'Comptoir', 'open', 50);

insert into public.reservation_stock_offers
  (id, organization_id, title, description, stock_total,
   window_starts_at, window_ends_at, per_player_limit, status)
values
  ('a1c70000-0000-4000-8000-0000000004a1',
   'a1c70000-0000-4000-8000-00000000000a', 'Tarte du jour', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('a1c70000-0000-4000-8000-0000000004b1',
   'a1c70000-0000-4000-8000-00000000000b', 'Tarte du jour', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('a1c70000-0000-4000-8000-0000000004c1',
   'a1c70000-0000-4000-8000-00000000000c', 'Tarte du jour', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('a1c70000-0000-4000-8000-0000000004d1',
   'a1c70000-0000-4000-8000-00000000000d', 'Tarte du jour', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open');

insert into public.vitrine_settings (organization_id, slug, published)
values
  ('a1c70000-0000-4000-8000-00000000000a', 'tap-mode-rdv', true),
  ('a1c70000-0000-4000-8000-00000000000b', 'tap-mode-moment', true),
  ('a1c70000-0000-4000-8000-00000000000c', 'tap-mode-deux', true),
  ('a1c70000-0000-4000-8000-00000000000d', 'tap-mode-aucun', true);


-- ════════════════════════════════════════════════════════════
-- 0. LA PRÉMISSE EST MESURÉE, PAS SUPPOSÉE
--
-- Les quatre lignes de la matrice ne valent que si les octrois sont vraiment
-- dans l'état annoncé À L'INSTANT QUE LA RPC LIT. C'est exactement le piège
-- qu'avait connu `droits_par_produit` : trois assertions vertes sur une
-- organisation qui n'avait aucun droit, donc pour une tout autre raison.
-- ════════════════════════════════════════════════════════════

select ok(
  public.org_has_module_access('a1c70000-0000-4000-8000-00000000000a', 'vitrine')
  and public.org_has_module_access('a1c70000-0000-4000-8000-00000000000a', 'rendez_vous')
  and not public.org_has_module_access('a1c70000-0000-4000-8000-00000000000a', 'reserver'),
  'MODE-0a SALLE détient `vitrine` et `rendez_vous`, et PAS `reserver` — l''état que RDV-7 rend vendable');
select ok(
  public.org_has_module_access('a1c70000-0000-4000-8000-00000000000b', 'vitrine')
  and public.org_has_module_access('a1c70000-0000-4000-8000-00000000000b', 'reserver')
  and not public.org_has_module_access('a1c70000-0000-4000-8000-00000000000b', 'rendez_vous'),
  'MODE-0b MOMENTS détient `vitrine` et `reserver`, et PAS `rendez_vous` — la population d''aujourd''hui');
select ok(
  public.org_has_module_access('a1c70000-0000-4000-8000-00000000000c', 'reserver')
  and public.org_has_module_access('a1c70000-0000-4000-8000-00000000000c', 'rendez_vous'),
  'MODE-0c LES DEUX détient les deux clés');
select ok(
  public.org_has_module_access('a1c70000-0000-4000-8000-00000000000d', 'vitrine')
  and not public.org_has_module_access('a1c70000-0000-4000-8000-00000000000d', 'reserver')
  and not public.org_has_module_access('a1c70000-0000-4000-8000-00000000000d', 'rendez_vous'),
  'MODE-0d AUCUN détient `vitrine` seul');


-- ════════════════════════════════════════════════════════════
-- 1. SALLE SEULE — CE QUE CE LOT DÉBLOQUE
--
-- La page était déjà servie AVANT le lot ; ce qui change, c'est qu'elle cesse
-- d'être muette. L'assertion de service est gardée quand même : sans elle, une
-- liste devenue non vide pour cause de page absente passerait inaperçue.
-- ════════════════════════════════════════════════════════════

select is(
  public.vitrine_public_state('tap-mode-rdv') ->> 'state',
  'ok',
  'MODE-1a SALLE la page est SERVIE — c''est `vitrine` qui l''ouvre, pas Réserver');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,activites}') p$$,
  $$values ('Service du soir')$$,
  'MODE-1b SALLE sa salle est ANNONCÉE : `rendez_vous` ouvre les activités de ce mode, sans `reserver`');
select is(
  (select pg_catalog.count(*)::int from jsonb_array_elements(
     public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,activites}')),
  1,
  'MODE-1c … et SEULEMENT elle : son Moment hérité reste caché, elle n''a plus le droit de le vendre');
select is(
  public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,files}',
  '[]'::jsonb,
  'MODE-1d SALLE sa file est VIDE : une file n''a pas de mode, et `queue_join` exige `reserver`');
select is(
  public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,offres}',
  '[]'::jsonb,
  'MODE-1e SALLE son offre de stock est VIDE : même raison, `hold_stock_offer` exige `reserver`');


-- ════════════════════════════════════════════════════════════
-- 2. MOMENTS SEULS — LA NON-RÉGRESSION, ET C'EST LA LIGNE QUI COMPTE
--
-- C'est l'état de la population installée. Tout doit y être RIGOUREUSEMENT
-- comme avant le lot : le Moment annoncé, la file et l'offre annoncées, la
-- salle cachée (elle l'était déjà, faute de `rendez_vous`).
-- ════════════════════════════════════════════════════════════

select is(
  public.vitrine_public_state('tap-mode-moment') ->> 'state',
  'ok',
  'MODE-2a MOMENTS la page est SERVIE');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-moment') #> '{portes,reserver,activites}') p$$,
  $$values ('Atelier')$$,
  'MODE-2b MOMENTS son Moment est ANNONCÉ, et sa salle non — exactement ce qu''elle voyait avant le lot');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-moment') #> '{portes,reserver,files}') p$$,
  $$values ('Comptoir')$$,
  'MODE-2c MOMENTS sa file est ANNONCÉE : `reserver` ne l''a pas perdue au passage');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-moment') #> '{portes,reserver,offres}') p$$,
  $$values ('Tarte du jour')$$,
  'MODE-2d MOMENTS son offre de stock est ANNONCÉE : idem');


-- ════════════════════════════════════════════════════════════
-- 3. LES DEUX CLÉS — TOUT EST ANNONCÉ
-- ════════════════════════════════════════════════════════════

select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-deux') #> '{portes,reserver,activites}') p$$,
  $$values ('Atelier'), ('Service du soir')$$,
  'MODE-3a LES DEUX ses deux activités sont annoncées, dans l''ordre du document');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-deux') #> '{portes,reserver,files}') p$$,
  $$values ('Comptoir')$$,
  'MODE-3b LES DEUX sa file est annoncée');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-deux') #> '{portes,reserver,offres}') p$$,
  $$values ('Tarte du jour')$$,
  'MODE-3c LES DEUX son offre est annoncée');


-- ════════════════════════════════════════════════════════════
-- 4. AUCUNE DES DEUX CLÉS — COMPORTEMENT INCHANGÉ, ET ÉPINGLÉ
--
-- Avant le lot : le bloc vidait les trois listes. Après : les deux activités
-- échouent chacune sur SA propre clé, les deux autres listes restent vidées
-- par le bloc. Le document est le MÊME — c'est ce qu'on épingle, parce qu'un
-- filtre écrit « au moins une des deux clés » le ferait basculer sans bruit.
-- ════════════════════════════════════════════════════════════

select is(
  public.vitrine_public_state('tap-mode-aucun') ->> 'state',
  'ok',
  'MODE-4a AUCUN la page reste SERVIE : `vitrine` seul l''ouvre, et ce lot n''y touche pas');
select is(
  public.vitrine_public_state('tap-mode-aucun') #> '{portes,reserver,activites}',
  '[]'::jsonb,
  'MODE-4b AUCUN ses activités sont VIDES : aucune des deux clés, aucun mode ne passe');
select is(
  public.vitrine_public_state('tap-mode-aucun') #> '{portes,reserver,files}',
  '[]'::jsonb,
  'MODE-4c AUCUN sa file est VIDE');
select is(
  public.vitrine_public_state('tap-mode-aucun') #> '{portes,reserver,offres}',
  '[]'::jsonb,
  'MODE-4d AUCUN son offre est VIDE');


-- ════════════════════════════════════════════════════════════
-- 5. LA FORME NE BOUGE PAS
--
-- Les trois clés existent TOUJOURS, vides plutôt qu'absentes, dans les quatre
-- états. C'est l'écran qui masque un bloc sans contenu ; la base, elle, ne
-- doit jamais faire disparaître une clé — un lecteur TypeScript qui indexe
-- `portes.reserver.activites` compte dessus.
-- ════════════════════════════════════════════════════════════

select results_eq(
  $$select key from jsonb_object_keys(
      public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver}') as key
     order by key$$,
  $$values ('activites'), ('files'), ('offres')$$,
  'MODE-5a SALLE les trois clés sont présentes, dont deux vides');
select results_eq(
  $$select key from jsonb_object_keys(
      public.vitrine_public_state('tap-mode-aucun') #> '{portes,reserver}') as key
     order by key$$,
  $$values ('activites'), ('files'), ('offres')$$,
  'MODE-5b AUCUN les trois clés sont présentes, toutes vides');


-- ════════════════════════════════════════════════════════════
-- 6. LE CONTRÔLE DE PORTÉE — C'ÉTAIT BIEN LA CLÉ QUI FILTRAIT
--
-- Une liste vide l'est pour toutes les raisons du monde. On repose sur SALLE
-- la clé qui lui manquait, et on rejoue LA MÊME lecture : son Moment doit
-- apparaître, sans qu'aucune autre donnée n'ait bougé.
-- ════════════════════════════════════════════════════════════

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('a1c70000-0000-4000-8000-00000000000a', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,activites}') p$$,
  $$values ('Atelier'), ('Service du soir')$$,
  'MODE-6a PORTÉE la clé `reserver` reposée, le Moment APPARAÎT : c''était bien elle qui le filtrait');
select results_eq(
  $$select p->>'nom' from jsonb_array_elements(
      public.vitrine_public_state('tap-mode-rdv') #> '{portes,reserver,files}') p$$,
  $$values ('Comptoir')$$,
  'MODE-6b PORTÉE … et sa file apparaît aussi : c''était `reserver` qui la retenait, pas un mode');


-- ════════════════════════════════════════════════════════════
-- 7. L'ISOLATION ENTRE ORGANISATIONS EST PRÉSERVÉE
--
-- Le filtre est une condition DE PLUS dans un `where` qui portait déjà
-- `organization_id`. Une garde de mode écrite en remplacement du filtre de
-- locataire — et non en plus — donnerait ici les huit activités du fichier.
-- ════════════════════════════════════════════════════════════

select is(
  (select pg_catalog.count(*)::int from jsonb_array_elements(
     public.vitrine_public_state('tap-mode-deux') #> '{portes,reserver,activites}')),
  2,
  'MODE-7a ISOLATION LES DEUX voit DEUX activités et non les huit du fichier, alors que six autres ont les mêmes noms et les mêmes modes');
select is(
  (select pg_catalog.count(*)::int from jsonb_array_elements(
     public.vitrine_public_state('tap-mode-moment') #> '{portes,reserver,files}')),
  1,
  'MODE-7b ISOLATION MOMENTS voit UNE file — les quatre du fichier portent le même nom');
select is(
  public.vitrine_public_state('tap-mode-aucun') #> '{portes,reserver,activites}',
  '[]'::jsonb,
  'MODE-7c ISOLATION AUCUN ne récupère rien des trois voisines qui, elles, détiennent les clés');


-- ════════════════════════════════════════════════════════════
-- 8. LA RÈGLE EST À UN SEUL ENDROIT — SUR LE CATALOGUE VIVANT
--
-- Tout l'intérêt de RDV-7 était que le `case` sur `booking_mode` n'existe
-- qu'une fois. Un lot suivant qui recopierait ce `case` dans
-- `vitrine_public_state` rendrait ce fichier vert et la promesse fausse : les
-- deux copies divergeraient au premier changement de mode.
--
-- CES TROIS ASSERTIONS REJOUENT §3 DE LA MIGRATION. Une assertion de migration
-- ne s'exécute qu'une fois, à son propre instant ; c'est précisément ce qui a
-- laissé vieillir le §9 de 20261020120000.
-- ════════════════════════════════════════════════════════════

-- L'APPEL, ET NON LE NOM. Le corps NOMME `reservation_activity_module_key`
-- dans le commentaire du bloc de garde — il y a donc DEUX occurrences de
-- l'identifiant, et une seule est l'appel. Chercher l'identifiant nu rendrait
-- cette assertion verte sur un corps dont l'appel aurait disparu et dont seule
-- la prose subsisterait : la garde survivrait à ce qu'elle garde. C'est le
-- défaut qu'ADR-168 a laissé passer et qu'ADR-169 a corrigé ; on exige donc la
-- forme APPELÉE, avec son argument.
select ok(
  (select pg_catalog.strpos(
            pg_catalog.pg_get_functiondef(p.oid),
            'reservation_activity_module_key(a.id)') > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-8a CATALOGUE vitrine_public_state APPELLE la dérivation — pas seulement son nom dans un commentaire');
select ok(
  (select pg_catalog.pg_get_functiondef(p.oid) !~ 'v_activites := ''\[\]''::jsonb'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-8b CATALOGUE elle ne vide plus les activités d''un bloc — sinon le filtre par objet ne servirait à rien');
-- LA COMPARAISON, ET NON LE MOT. Le corps NOMME `booking_mode` dans le
-- commentaire du bloc de garde — c'est voulu, il explique la règle. Ce qu'on
-- interdit, c'est de la RECOPIER : un `case` recopié compare, et écrit donc
-- `booking_mode =`. `strpos` plutôt qu'une regex, pour qu'aucun `\s` ne puisse
-- enjamber une fin de ligne et rendre la garde muette.
select ok(
  (select pg_catalog.strpos(
            pg_catalog.pg_get_functiondef(p.oid), 'booking_mode =') = 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-8c CATALOGUE elle ne RECOPIE pas le `case` sur `booking_mode` : la règle reste chez reservation_activity_module_key');
select ok(
  (select pg_catalog.pg_get_functiondef(p.oid) ~ 'org_has_module_access\([^,]+, ''reserver''\)'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-8d CATALOGUE elle garde `reserver` pour les files et les offres — CLE-27 de reservation_cle_par_mode la nomme encore');


-- ════════════════════════════════════════════════════════════
-- 9. LE CONTRAT ÉCRIT SUIT LE CODE
--
-- La description publiait « les trois listes Réserver sont vides sans
-- `reserver` ». C'est le texte que lit quiconque interroge le catalogue, et il
-- était devenu faux.
-- ════════════════════════════════════════════════════════════

select ok(
  (select pg_catalog.strpos(
            pg_catalog.obj_description(p.oid, 'pg_proc'),
            'les trois listes Réserver sont vides sans `reserver`') = 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-9a CONTRAT la description ne promet plus trois listes vides sans `reserver`');
select ok(
  (select pg_catalog.strpos(
            pg_catalog.obj_description(p.oid, 'pg_proc'), 'VIT-53') > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  'MODE-9b CONTRAT … et elle nomme la règle qu''elle applique désormais');

select * from finish();
rollback;
