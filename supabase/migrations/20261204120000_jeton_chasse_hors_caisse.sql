-- ════════════════════════════════════════════════════════════
-- LE JETON DE LA CHASSE SORT DE LA CAISSE
--
-- `hunt_steps.token` EST le QR. Il n'est pas l'identifiant d'une étape :
-- `/hunt/<token>` est l'URL que le joueur ouvre, et `record_hunt_scan` ne
-- demande rien d'autre pour tamponner. Qui le lit peut tamponner toutes les
-- étapes d'une chasse sans se déplacer, et déclencher la remise du lot.
--
-- ── CE QUE LE DÉPÔT AVAIT, ET CE QUE ÇA VALAIT ──
--
--   * `"hunt_steps: member select"` (20260724120000:192) est gardée par
--     `public.is_org_member`, qui ne teste QUE l'appartenance. Le pendant qui
--     filtre le rôle existe et s'appelle `public.is_org_editor` (00019:53) —
--     il n'est utilisé QUE par la policy d'écriture d'à côté.
--   * `grant select, insert, update, delete on table public.hunt_steps to
--     authenticated` (20260724120000:218) : table entière, colonne `token`
--     comprise.
--   * Aucune vue, aucune RPC ne masquait le jeton, et aucun pgTAP ne couvrait
--     `cashier` sur cette table — le bloc caisse de `security_acl.test.sql`
--     en teste huit, pas celle-ci.
--
-- Un caissier — le rôle qu'on donne à l'extra du samedi soir — pouvait donc
-- lire les jetons de toutes les chasses de l'établissement.
--
-- ── POURQUOI UNE RPC ET PAS UNE POLICY : LA CONTRAINTE EST STRUCTURELLE ──
--
-- `cashier`, `editor` et `owner` sont TOUS le même rôle Postgres :
-- `authenticated`. Le rôle applicatif vit dans `organization_members.role`,
-- que seule une expression SQL peut lire.
--
--   * Une POLICY RLS ne discrimine pas au niveau COLONNE : elle décide de la
--     LIGNE. Il n'existe pas de `using` par colonne.
--   * Un GRANT de colonne ne discrimine pas non plus : il porte sur le rôle
--     POSTGRES, identique pour les trois.
--   * Une VUE `security_invoker` hériterait du même rôle et ne distinguerait
--     rien de plus ; un `grant` conditionnel n'existe pas en Postgres.
--
-- La seule construction qui sépare vraiment est donc celle-ci : retirer
-- `select (token)` à `authenticated` sur la table, et rendre le jeton par une
-- fonction `security definer` gardée par `is_org_editor`. C'est exactement la
-- forme de `org_qr_hub` (20260928120000:1044), pour la même raison.
--
-- ── LE PIÈGE, ET POURQUOI CE FICHIER RÉVOQUE LA TABLE D'ABORD ──
--
-- `revoke select (token)` seul NE MORD PAS quand un `grant select` TABLE-WIDE
-- existe : Postgres tient les privilèges de table et de colonne dans deux
-- registres distincts, et n'émet aucun avertissement. 20260905120000 l'a
-- mesuré sur ce Postgres même (piège (a) de son en-tête) et a dû faire le
-- geste en deux temps. `hunt_steps` porte précisément ce grant table-wide : on
-- révoque donc la TABLE, puis on re-grant colonne par colonne.
-- UNE GARDE QUI NE MORD PAS SE LIT EXACTEMENT COMME UNE GARDE QUI MORD — d'où
-- le bloc de vérification en fin de fichier, qui échoue à l'application plutôt
-- qu'en production.
--
-- ── L'AUTRE MOITIÉ DU PIÈGE, MESURÉE ICI ET NON DÉDUITE ──
--
-- La réciproque N'EST PAS symétrique, et c'est ce qui rend l'ordre des deux
-- lignes ci-dessous obligatoire. Mesuré sur ce Postgres (table jetable,
-- transaction annulée) :
--
--   grant select on table t to authenticated;      -- table=t  a=t  b=t
--   grant select (a) on t to authenticated;
--   revoke select on table t from authenticated;   -- table=f  a=F  b=f  ← !
--   grant select (a) on t to authenticated;        -- table=f  a=t  b=f
--
-- Un `revoke` de TABLE efface donc AUSSI les privilèges de COLONNE, alors
-- qu'un `revoke` de colonne n'entame pas celui de table. Conséquences pour qui
-- éditera ce fichier :
--
--   * l'ordre « revoke table PUIS grant colonnes » est le seul qui tienne —
--     l'inverse effacerait les sept colonnes qu'on vient d'accorder ;
--   * une migration ultérieure qui referait un `revoke select on table
--     public.hunt_steps` FERMERAIT les sept colonnes d'un coup, et la liste
--     des étapes du tableau de bord reviendrait vide sans message ;
--   * un `grant select` NU sur la table ROUVRIRAIT le jeton en silence.
--     C'est exactement ce que la mutation de la garde pgTAP rejoue : rendre le
--     grant table-wide fait rougir cinq de ses vingt-neuf assertions.
--
-- ── CE QUE CE FICHIER NE FERME PAS, DÉLIBÉRÉMENT ──
--
--   * `service_role` garde tout : `record_hunt_scan` et
--     `redeem_hunt_completion` (20260724120000) résolvent le jeton du joueur,
--     et le parcours public passe par `createAdminClient`
--     (`src/lib/hunt-context.ts`).
--   * `insert` et `update` de `token` restent ouverts à `authenticated` :
--     `createHuntStep` écrit le jeton en session (`src/actions/hunts.ts`), et
--     c'est la policy `"hunt_steps: editor write"` — déjà en `is_org_editor` —
--     qui décide qui écrit. Écrire un jeton qu'on ne peut pas relire n'ouvre
--     rien : le caissier n'a de toute façon aucune policy d'écriture.
--   * La garde de rôle de la page de détail (`canViewPlayers = role ===
--     "owner"`) n'est pas touchée : elle borne les statistiques joueurs, pas
--     les jetons, et ce n'est pas le sujet.
--
-- ── ORDRE DE DÉPLOIEMENT — À LIRE AVANT D'APPLIQUER ──
--
-- C'est l'exception à la règle habituelle. Cette migration FERME une lecture
-- que le code de production fait encore : `select("*")` sur `hunt_steps`
-- échoue dès qu'elle est appliquée. Le dégradé est borné et non destructif
-- (la liste d'étapes du tableau de bord et du studio revient vide, l'éditeur
-- d'affiche rend `notFound()`), mais il existe tant que le code de la même
-- livraison n'est pas en ligne. Migration et déploiement vont donc dans la
-- même fenêtre.
-- ════════════════════════════════════════════════════════════

-- ============================================================
-- 1. LA PORTE DE REMPLACEMENT, OUVERTE AVANT DE FERMER L'AUTRE
-- ============================================================

-- `p_organization_id` EN PREMIER, et la garde AVANT toute lecture : la
-- fonction est `security definer`, donc elle traverse la RLS de `hunt_steps`.
-- Rien ne doit être lu avant qu'on sache qui appelle — même forme que
-- `org_qr_hub`.
--
-- Elle ne rend PAS la ligne entière : le seul motif de son existence est la
-- colonne que la session ne peut plus lire. Les sept autres colonnes restent
-- servies par PostgREST sous la RLS, et une RPC qui les doublerait ferait une
-- seconde source de vérité pour la liste d'étapes.
create or replace function public.hunt_step_tokens(
  p_organization_id uuid,
  p_hunt_id uuid
)
returns table (step_id uuid, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- `token` est à la fois une colonne de sortie (donc une variable plpgsql en
-- scope dans tout le corps) et une colonne réelle de la table lue. C'est le
-- piège qui a cassé la création de ligue EN PRODUCTION (42702 levé à
-- l'exécution, DDL appliqué sans broncher — 20260724130000). La référence est
-- qualifiée ci-dessous, et cette directive est la ceinture par-dessus.
#variable_conflict use_column
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  -- Les DEUX filtres, pas un seul. `hunt_id` sans `organization_id` rendrait
  -- les jetons d'une chasse du voisin à qui connaît son identifiant, et la
  -- garde ci-dessus n'y verrait rien : elle porte sur l'organisation PASSÉE.
  return query
    select s.id, s.token
      from public.hunt_steps s
     where s.hunt_id = p_hunt_id
       and s.organization_id = p_organization_id
     order by s.position;
end;
$$;

comment on function public.hunt_step_tokens(uuid, uuid) is
  'Jetons publics des étapes d''une chasse (l''URL du QR), réservés aux owner/editor de l''organisation : hunt_steps.token n''est plus lisible en session depuis 20261204120000, parce que le jeton suffit à tamponner et que la caisse n''a aucune raison de l''avoir. Zéro ligne si la chasse n''appartient pas à l''organisation passée ; « not authorized » si l''appelant n''en est pas éditeur.';

-- `authenticated` seulement, comme les trois fonctions de chasse de
-- 20260815120000 et 20260817120000 : la RPC est appelée depuis une page
-- serveur avec le client de SESSION du commerçant, c'est ce qui donne un
-- `auth.uid()` à `is_org_editor`. Sous `service_role` ce prédicat est
-- structurellement faux et la fonction lèverait toujours — un grant qui ne
-- peut rien exécuter laisse croire à un chemin d'appel qui n'existe pas.
--
-- ⚠ Le revoke sur `service_role` doit être ÉCRIT : `revoke … from public,
-- anon` ne le retire pas. Supabase pose `alter default privileges in schema
-- public grant all on functions to postgres, anon, authenticated,
-- service_role`, donc toute fonction née dans `public` porte EXECUTE pour
-- service_role sans qu'aucune migration ne le lui accorde.
revoke all on function public.hunt_step_tokens(uuid, uuid) from public, anon;
revoke execute on function public.hunt_step_tokens(uuid, uuid) from service_role;
grant execute on function public.hunt_step_tokens(uuid, uuid) to authenticated;

-- ============================================================
-- 2. LA FERMETURE — TABLE D'ABORD, PUIS LES SEPT COLONNES
--
-- Un `grant select` NU ici regranterait `token` : la liste est explicite, et
-- elle énumère les colonnes de `hunt_steps` (20260724120000:74-90) moins une.
-- ============================================================

revoke select on table public.hunt_steps from authenticated;

grant select (
  id, hunt_id, organization_id, position, label, hint_text, created_at
) on public.hunt_steps to authenticated;

-- Ceinture : sur la base construite depuis les migrations, la ligne ci-dessus
-- n'a rien accordé sur `token` et celle-ci est un no-op. Elle vise la
-- PRODUCTION, où 20261122120000 a documenté quatorze privilèges que personne
-- n'avait décidés et que le dépôt ignorait. `revoke` est idempotent : ce geste
-- est sans effet sur toute base déjà conforme.
revoke select (token) on public.hunt_steps from authenticated;

-- ============================================================
-- 3. VÉRIFICATION À L'APPLICATION
--
-- Le pgTAP (`supabase/tests/jeton_chasse_hors_caisse.test.sql`) juge l'état
-- FINAL du schéma et le COMPORTEMENT des trois rôles ; ce bloc-ci juge ce
-- fichier À CET ENDROIT DE LA CHAÎNE, et échoue avant que la migration ne
-- parte. Les deux moitiés ne se remplacent pas : c'est précisément une
-- révocation muette que l'on cherche à rendre bruyante.
-- ============================================================

do $verification$
begin
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.hunt_steps', 'token', 'SELECT') then
    raise exception
      'la revocation de hunt_steps.token n''a PAS mordu : authenticated lit encore le jeton, et un caissier peut donc tamponner toutes les etapes sans se deplacer';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'public.hunt_steps', 'SELECT') then
    raise exception
      'le grant SELECT table-wide sur hunt_steps subsiste : les grants de colonne ci-dessus ne decident donc de rien';
  end if;

  -- Le contre-exemple, sans lequel les deux assertions ci-dessus seraient
  -- vraies sur une table devenue illisible : la caisse doit toujours voir la
  -- liste des étapes (suivi, comptages), elle ne doit plus voir le jeton.
  if not (pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'id', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'hunt_id', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'organization_id', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'position', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'label', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'hint_text', 'SELECT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'created_at', 'SELECT')) then
    raise exception
      'la revocation a trop mordu : une des sept colonnes de hunt_steps n''est plus lisible en session, et la liste des etapes du tableau de bord revient vide';
  end if;

  -- L'écriture du jeton reste ouverte : `createHuntStep` l'écrit en session.
  if not (pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'token', 'INSERT')
          and pg_catalog.has_column_privilege(
            'authenticated', 'public.hunt_steps', 'token', 'UPDATE')) then
    raise exception
      'l''ecriture du jeton a ete fermee au passage : createHuntStep ne peut plus creer d''etape';
  end if;

  -- Le parcours joueur passe par service_role, qui doit garder la table
  -- entière : sans cela `record_hunt_scan` ne résout plus aucun QR.
  if not pg_catalog.has_column_privilege(
       'service_role', 'public.hunt_steps', 'token', 'SELECT') then
    raise exception
      'service_role ne lit plus hunt_steps.token : record_hunt_scan ne peut plus resoudre un QR, et le parcours joueur est casse';
  end if;
end
$verification$;
