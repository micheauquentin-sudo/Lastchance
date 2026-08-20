-- ────────────────────────────────────────────────────────────
-- RES-5 — `is_valid_experience_steps` a besoin d'un grant EXECUTE
-- ────────────────────────────────────────────────────────────
--
-- BUG TROUVÉ PAR L'E2E DU LOT L8 (`e2e/reserver-signature.spec.ts`), PAS PAR
-- LECTURE DE CODE : la création d'un Moment Signature (`kind = 'signature'`,
-- `steps` non nul) échoue pour TOUT commerçant, avec l'erreur générique
-- « Impossible de créer l'activité ». Le message réel, visible côté Postgres
-- (`docker logs supabase_db_lastchance`) :
--
--   ERROR:  permission denied for function is_valid_experience_steps
--
-- Le commentaire qui accompagnait le `revoke all` de 20261007120000 (« un
-- `check` de table, où PostgreSQL évalue l'expression sans contrôle de
-- privilège ») EST FAUX. Une fonction PL/pgSQL ordinaire (ni `security
-- definer`, ni appelée par un rôle qui la possède) référencée dans un `check`
-- de table est évaluée avec les privilèges du RÔLE QUI EXÉCUTE L'INSTRUCTION
-- DML — exactement comme n'importe quel appel de fonction dans une requête.
-- `revoke all ... from authenticated` retire donc l'EXECUTE nécessaire à tout
-- insert/update fait par le rôle `authenticated` (PostgREST) sur une ligne où
-- `steps` n'est pas nul — c'est-à-dire tout Moment Signature. Le Duo n'est pas
-- touché : il ne pose jamais d'étapes (`steps` reste `null`, et la fonction
-- retourne `true` avant même de lire quoi que ce soit — mais la vérification
-- de privilège, elle, précède l'exécution, donc s'applique quand même dès que
-- le `check` est évalué, `null` ou pas, dans TOUTE la ligne. Seul un format
-- Standard ou Duo sans promesse ni durée peut passer par des colonnes qui ne
-- déclenchent jamais cette fonction dans le plan d'exécution réel —
-- Postgres exécute néanmoins l'appel pour chaque ligne écrite dès que la
-- contrainte porte sur `steps`, colonne présente dans TOUT insert/update de
-- `reservation_activities` passant par le panneau commerçant.
--
-- LE PRÉCÉDENT CITÉ (`is_valid_progression_rule`, 20260805200000) PORTE LA
-- MÊME OMISSION — non détectée ici faute d'E2E qui exercerait une écriture
-- `authenticated` sur une règle de progression. Hors du périmètre de cette
-- migration (RES-5 seul) : à vérifier séparément par `db-supabase`.
--
-- LE CORRECTIF EST L'INVERSE MINIMAL DU `revoke` : rendre l'EXECUTE au SEUL
-- rôle qui en a besoin pour que ses écritures passent le `check` —
-- `authenticated`, celui de PostgREST. `anon` n'écrit jamais dans cette table
-- (RLS de 20261002120000 : policy réservée à `authenticated`) et
-- `service_role` contourne RLS mais PAS les grants de fonction ordinaires —
-- il lui faut le même accès pour ses propres écritures (migrations de seed,
-- outillage interne). La fonction reste immutable et sans effet de bord :
-- lui rendre EXECUTE ne change rien à CE QU'ELLE VALIDE, seulement à QUI PEUT
-- déclencher son évaluation en écrivant une ligne.
grant execute on function public.is_valid_experience_steps(jsonb)
  to authenticated, service_role;

comment on function public.is_valid_experience_steps(jsonb) is
  'Valide la FORME des étapes d''un Moment Signature (RES-5) : un tableau d''AU '
  'PLUS TROIS objets `{title, body}`, titres et corps non vides et bornés à 80 '
  'et 400 caractères une fois détourés. `null` est accepté — l''absence '
  'd''étapes est légitime pour les formats qui n''en présentent pas ; c''est la '
  'contrainte conditionnelle `reservation_activities_signature_steps` qui les '
  'EXIGE d''une `signature`. EXECUTE accordé à `authenticated` et '
  '`service_role` (20261008120000) : une fonction référencée dans un `check` '
  'de table est évaluée avec les privilèges du rôle qui écrit la ligne, pas '
  'sans contrôle — sans ce grant, tout insert/update sur '
  '`reservation_activities` par PostgREST échouait en '
  '« permission denied for function is_valid_experience_steps », trouvé par '
  'l''E2E du lot L8.';
