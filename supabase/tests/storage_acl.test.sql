-- ============================================================
-- Storage — l'invariant qui ne repose sur AUCUNE règle écrite
--
-- Mesuré contre le catalogue vivant, pas contre les migrations :
-- `storage.objects` a la RLS ACTIVE et ZÉRO policy, tandis qu'`anon` et
-- `authenticated` conservent les GRANT SELECT/INSERT/UPDATE/DELETE hérités
-- de l'initialisation Supabase. Autrement dit, tout téléversement direct
-- depuis un navigateur est refusé par ABSENCE de policy — pas par une règle
-- que quelqu'un aurait écrite, relue et nommée.
--
-- Les deux migrations qui créent les buckets ont bien FORMULÉ cette
-- intention (« aucune policy d'écriture pour anon/authenticated »,
-- 00006_branding_and_customization.sql ; « les écritures passent
-- exclusivement par le service role après une garde d'organisation »,
-- 20260719040000_poster_storage_and_contest_audit.sql) — mais elle ne vit
-- que dans deux commentaires SQL, que rien ne vérifie.
--
-- CONSÉQUENCE CONCRÈTE. La PREMIÈRE policy permissive posée sur
-- `storage.objects` ouvre l'écriture sur les logos et les affiches de TOUTES
-- les organisations. Aucun typecheck, aucun `git log` ne le signalerait.
-- Ce fichier transforme ce vide en contrôle : il ne change rien, il constate.
--
-- ⚠ CE QU'IL NE VOIT PAS — à savoir AVANT de s'y fier. pgTAP ne tourne que
-- contre la base ÉPHÉMÈRE de la CI (ci.yml : `supabase start`, migrations,
-- seed, puis `supabase test db`) ; aucun workflow n'interroge la base de
-- production. Ce fichier attrape donc ce qui arrive PAR UNE MIGRATION, ou par
-- une montée de version de Supabase qui changerait les défauts du schéma
-- `storage`. Une policy ou un bucket créés en trois clics dans le tableau de
-- bord de PRODUCTION n'existent dans aucune migration, donc n'existeront
-- jamais dans la base de la CI : ce fichier restera VERT pendant que la
-- production dérive. Fermer ce trou-là demande une sonde qui interroge la
-- production ; elle n'existe pas, et rien ici n'en tient lieu.
--
-- CE QU'IL FAUT CASSER POUR LE FAIRE ROUGIR (sans cette liste, rien ne dit
-- qu'il ne verdit pas sur un ensemble vide) :
--   1. `alter table storage.objects disable row level security`
--      → assertion 1. C'est la mutation la plus discrète et la plus grave
--        possible ici : elle ne supprime aucune règle visible (il n'y en a
--        pas) et rend d'un coup les GRANT effectifs.
--   2. n'importe quelle `create policy … on storage.objects`, même en
--      lecture seule → assertion 2. Elle DOIT rougir : c'est un détecteur
--      de changement, pas un jugement. La réponse attendue est de relire
--      l'assertion 3, puis d'inscrire la nouvelle policy dans l'inventaire
--      sciemment.
--   3. une policy PERMISSIVE INSERT/UPDATE/DELETE/ALL visant `anon`,
--      `authenticated` ou `public` → assertion 3, qui NOMME la policy
--      fautive dans son diff au lieu d'annoncer un simple « 0 attendu ».
--   4. un troisième bucket, ou le passage d'un bucket en `public` →
--      assertions 4 et 5.
--   5. retirer `file_size_limit` ou `allowed_mime_types` d'un bucket public,
--      ou élargir la liste MIME de `logos` → assertions 6 et 7.
--
-- CE FICHIER N'AJOUTE AUCUNE POLICY. En ajouter une changerait le
-- comportement et risquerait de casser le téléversement des logos, qui
-- passe aujourd'hui par le service role via l'API Storage.
--
-- ⚠ ENREGISTREMENT CI OBLIGATOIRE. L'étape « Audit pgTAP des ACL et
-- politiques réelles » de .github/workflows/ci.yml ÉNUMÈRE ses fichiers un
-- par un ; elle ne balaie pas le dossier. Tant que `storage_acl.test.sql`
-- n'est pas ajouté à cette ligne, ce fichier ne tourne QUE en local
-- (`supabase test db` sans argument) et la CI reste verte sans rien
-- vérifier de ce qui suit — exactement le mode de panne qu'il existe pour
-- empêcher.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── 0. Garde d'existence ─────────────────────────────────────
-- Un cast `'storage.objects'::regclass` sur une base dépourvue du schéma
-- storage lèverait une ERREUR, qui avorte le fichier : on perdrait tout
-- diagnostic au lieu d'en lire un. Les assertions 1 à 3 interrogent donc les
-- catalogues (pg_class, pg_policies) PAR NOM, jamais par regclass.
-- PORTÉE EXACTE, à ne pas surestimer : les assertions 4 à 7 lisent
-- `storage.buckets` en direct et échoueraient, elles, par ERREUR — le fichier
-- s'arrête là et `finish()` n'est jamais atteint. Ces deux gardes servent
-- alors à une seule chose, mais elle compte : leurs « not ok » sont émis
-- AVANT l'erreur et en nomment la cause (schéma storage absent = stack
-- Supabase non démarrée), au lieu de laisser lire un « relation
-- storage.buckets does not exist » hors contexte.
-- Corollaire à connaître : sur une telle base, les assertions 2 et 3 passent
-- VERTES par vacuité (pg_policies ne rend aucune ligne ⇒ chaîne vide). Elles
-- ne valent donc RIEN sans les deux gardes ci-dessous.
select has_table('storage', 'objects', 'storage.objects existe');
select has_table('storage', 'buckets', 'storage.buckets existe');

-- ── 1. La RLS est active ─────────────────────────────────────
-- Moitié porteuse de l'invariant : GRANT ouverts + RLS active + zéro policy
-- = refus. Désactiver la RLS ici n'enlève aucune règle (il n'y en a aucune)
-- mais rend immédiatement les GRANT effectifs — anon pourrait écrire dans
-- les deux buckets, publics, de toutes les organisations.
select ok(
  (select c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'),
  'RLS active sur storage.objects (tout le refus repose dessus)'
);

-- ── 2. Inventaire des policies : vide, et NOMMÉ s'il cesse de l'être ──
-- Témoin de changement. On compare une chaîne plutôt qu'un compte pour que
-- l'échec rende la policy fautive lisible (nom, commande, permissive ou
-- restrictive, rôles visés) au lieu d'un « 1 ≠ 0 » muet.
-- Rougir ici n'est pas forcément une faute : c'est l'événement « quelqu'un
-- a écrit une règle sur storage.objects » qu'il faut lire, pas taire.
select is(
  coalesce((
    select string_agg(
             format('%s [%s %s → %s]',
                    policyname, permissive, cmd, array_to_string(roles::text[], '+')),
             ', ' order by policyname)
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  ), ''),
  '',
  'aucune policy sur storage.objects : le refus tient à un vide, pas à une règle'
);

-- ── 3. L'invariant dur : aucune écriture ouverte au client ───
-- Redondant avec l'assertion 2 AUJOURD'HUI, délibérément : le jour où une
-- policy de lecture légitime sera ajoutée et l'inventaire mis à jour,
-- celle-ci restera le seul garde-fou. Deux choix de filtrage à ne pas
-- inverser :
--   · `permissive = 'PERMISSIVE'` — une policy RESTRICTIVE ne peut RIEN
--     accorder, elle ne fait que retrancher ; l'inclure ferait rougir un
--     durcissement, et un test qui punit les durcissements finit désarmé ;
--   · le rôle `public` est dans la liste — `to public` s'applique à anon et
--     authenticated sans les nommer, et c'est la formulation la plus
--     courante des exemples Supabase que l'on copie-colle.
select is(
  coalesce((
    select string_agg(
             format('%s [%s → %s]', policyname, cmd, array_to_string(roles::text[], '+')),
             ', ' order by policyname)
      from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and permissive = 'PERMISSIVE'
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       and roles::text[] && array['anon', 'authenticated', 'public']
  ), ''),
  '',
  'aucune policy n''ouvre INSERT/UPDATE/DELETE de storage.objects à anon ou authenticated'
);

-- ── 4. Les buckets attendus, et EUX SEULS ────────────────────
-- La liste est écrite en toutes lettres pour qu'un bucket supplémentaire soit
-- un geste relu : les deux buckets naissent d'un `insert into storage.buckets`
-- (00006_branding_and_customization.sql et
-- 20260719040000_poster_storage_and_contest_audit.sql), un troisième passera
-- par une migration et devra donc passer ici.
-- NE PAS LIRE CETTE ASSERTION COMME UNE SURVEILLANCE DES BUCKETS RÉELS : elle
-- inventorie la base de la CI, reconstruite depuis les migrations. Un bucket
-- créé au tableau de bord de production n'y apparaît pas — voir
-- l'avertissement en tête de fichier.
select is(
  coalesce((select string_agg(id, ', ' order by id) from storage.buckets), ''),
  'logos, poster-images',
  'les seuls buckets sont logos et poster-images'
);

-- ── 5. Les buckets publics, NOMMÉS ───────────────────────────
-- Un bucket public sert ses objets sans jeton : toute URL devinée ou fuitée
-- est lisible par Internet, et la RLS ne s'applique pas à ce chemin de
-- lecture. Les deux buckets actuels l'assument (un logo et une affiche sont
-- faits pour être vus, comme le disent leurs migrations). Un troisième doit
-- l'assumer explicitement, pas hériter d'une case cochée.
-- `b.public` qualifié partout : `public` est aussi un mot-clé et un nom de
-- schéma, une référence nue est illisible avant d'être risquée.
select is(
  coalesce((select string_agg(b.id, ', ' order by b.id)
              from storage.buckets b where b.public), ''),
  'logos, poster-images',
  'les buckets publics sont exactement logos et poster-images'
);

-- ── 6. Tout bucket public reste borné ────────────────────────
-- `file_size_limit` et `allowed_mime_types` sont ce qui empêche un bucket
-- public de devenir un hébergement de fichiers gratuit et anonyme le jour
-- où une policy d'écriture apparaît. Formulée sur TOUS les buckets publics
-- (et non sur les deux d'aujourd'hui), l'assertion couvre aussi celui qui
-- n'existe pas encore.
select is(
  coalesce((
    select string_agg(b.id, ', ' order by b.id)
      from storage.buckets b
     where b.public
       and (b.file_size_limit is null
            or b.allowed_mime_types is null
            or coalesce(array_length(b.allowed_mime_types, 1), 0) = 0)
  ), ''),
  '',
  'aucun bucket public sans plafond de taille ni liste blanche MIME'
);

-- ── 7. Le bucket `logos` : bornes exactes ────────────────────
-- `poster-images` est déjà épinglé au même niveau de détail dans
-- security_acl.test.sql ; `logos` ne l'était nulle part. La liste MIME est
-- comparée à l'identique, et non par « contient », pour qu'un élargissement
-- soit relu — `image/svg+xml` y figure, or un SVG est un document exécutable
-- servi depuis une origine publique : l'ajout d'un type voisin mérite une
-- décision, pas un commit de confort.
-- `b.public::text` et non `%s` sur le booléen : `format()` passe par la
-- fonction de SORTIE du type, qui rend « t » et non « true » — le cast
-- explicite évite un rouge dû au rendu, pas au fond.
select is(
  (select format('%s|%s|%s',
                 b.public::text,
                 b.file_size_limit,
                 array_to_string(b.allowed_mime_types, ','))
     from storage.buckets b where b.id = 'logos'),
  'true|2097152|image/png,image/jpeg,image/webp,image/svg+xml',
  'le bucket logos garde ses bornes : public, 2 Mio, liste MIME d''images'
);

-- ── 8. La couche GRANT : consignée, non asservie ─────────────
-- Mesuré : anon et authenticated détiennent SELECT/INSERT/UPDATE/DELETE sur
-- storage.objects. C'est précisément ce qui rend l'absence de policy
-- PORTEUSE — sans ces GRANT, l'assertion 1 perdrait son enjeu.
-- On l'IMPRIME au lieu de l'asserter : un futur `revoke` serait un
-- durcissement, et le faire rougir reviendrait à décourager la seule
-- amélioration disponible ici. La ligne apparaît dans la sortie TAP, donc
-- l'inversion sera lisible le jour où elle se produit.
select diag(format(
  'storage.objects — GRANT directs mesurés : %s',
  coalesce((
    select string_agg(format('%s={%s}', g.grantee, g.privs), '  ' order by g.grantee)
      from (
        -- Casts explicites : information_schema expose des DOMAINES
        -- (`sql_identifier`, `character_data`), pas du text nu.
        select grantee::text as grantee,
               string_agg(privilege_type::text, '/' order by privilege_type::text) as privs
          from information_schema.role_table_grants
         where table_schema = 'storage'
           and table_name = 'objects'
           and grantee::text in ('anon', 'authenticated', 'service_role')
         group by grantee::text
      ) g
  ), 'aucun')
));

-- ── CE QUE CE FICHIER NE COUVRE PAS ENCORE ───────────────────
-- `storage.buckets` n'est vérifiée que dans son CONTENU (assertions 4 à 7),
-- jamais dans ses DROITS. Or les bornes des assertions 6 et 7 ne tiennent que
-- si un client ne peut pas les réécrire : une policy permissive UPDATE sur
-- `storage.buckets` ouverte à anon/authenticated rendrait `file_size_limit` et
-- `allowed_mime_types` révocables à chaud — sans toucher à `storage.objects`,
-- donc sans faire rougir une seule assertion de ce fichier. La couverture
-- manquante est la symétrie exacte des assertions 1 à 3, portée sur
-- `storage.buckets`.
-- Elle n'est PAS écrite ici, volontairement : son attendu (la RLS y est-elle
-- active ? quelles policies l'initialisation Supabase pose-t-elle sur
-- `buckets` ?) n'a pas été mesuré contre le catalogue vivant. Inventer cet
-- attendu produirait soit un rouge permanent, soit — bien pire — un vert sur
-- une valeur fausse. À mesurer, puis à écrire.

select * from finish();
rollback;
