-- ════════════════════════════════════════════════════════════
-- LES PSEUDOS DE PRONOSTICS DÉJÀ EN BASE
--
-- ADR-169 (9e7f6fb → 9e6fe7fb) a branché `isAllowedPlayerAlias` sur le
-- `nicknameSchema` des pronostics. Le commentaire qui l'accompagne l'admet
-- noir sur blanc : « Son pseudo enregistré reste affiché : ce schéma ne garde
-- que les ÉCRITURES. » Le classement `/pronos/<slug>` est PUBLIC et sans
-- authentification ; tout pseudo inscrit AVANT ce lot y reste affiché tel
-- quel, U+202E compris.
--
-- ── CE QUE LA BASE GARDAIT, ET CE QUE ÇA VALAIT ──
--
-- `00023_pronostics_hardening.sql:144` : `char_length(btrim(first_name))
-- between 1 and 60`. Une longueur, et rien d'autre — aucun filtre de format,
-- et 60 là où l'applicatif borne désormais à 24. Un RIGHT-TO-LEFT OVERRIDE
-- passait donc la contrainte sans la frôler.
--
-- `public.player_alias_is_allowed` existe depuis 20260805190000 et sait
-- refuser exactement ça. Deux surfaces l'appellent — `join_event_session` et
-- le passeport — parce que toutes deux passent par une RPC. Les pronostics
-- inscrivent par le client admin : il n'y a pas de RPC d'inscription contest
-- où la greffer, donc la garde doit vivre sur la TABLE.
--
-- ── TROIS COUCHES, PARCE QU'AUCUNE NE SUFFIT SEULE ──
--
--   * La PROJECTION en lecture (`src/lib/pronostics-context.ts`) protège
--     l'écran, mais laisse la donnée sale en base — exports, CSV, et tout
--     consommateur futur la reprennent telle quelle.
--   * Le NETTOYAGE des lignes existantes répare l'existant, mais ne dit rien
--     de la prochaine écriture par un chemin admin.
--   * La CONTRAINTE ferme l'écriture, mais ne répare rien — et posée seule
--     elle ÉCHOUERAIT sur les lignes déjà là.
--
-- D'où l'ordre de ce fichier, qui n'est pas négociable : on nettoie D'ABORD,
-- on resserre ENSUITE.
--
-- ── LE NETTOYAGE RETIRE L'INVISIBLE, IL NE RENOMME PAS ──
--
-- Un joueur qui a choisi « Jean-Luc » le garde. `repair_player_alias` retire
-- les caractères de contrôle et de formatage, replie les espaces, tronque à
-- 24 — et ne substitue un alias neutre que si le résultat devient vide ou
-- reste refusé (injure). Cet alias neutre est DÉRIVÉ DE L'IDENTIFIANT DE LA
-- LIGNE, jamais tiré au sort : deux exécutions rendent le même pseudo, et la
-- fonction reste `immutable` — ce qu'un `random()` ou un `now()` interdirait.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 1. LE NETTOYEUR — pendant SQL de `sanitizePlayerAlias`
-- ════════════════════════════════════════════════════════════
--
-- `format_player_alias` (20260805190000) ne fait que btrim + repli des
-- espaces : les caractères de FORMATAGE (Cf) n'étant pas des espaces, ils lui
-- survivent intacts. C'est précisément ce qui manque ici.
--
-- L'ordre des trois opérations porte le sens :
--   1. les contrôles deviennent des ESPACES, jamais rien — sinon « Jean\nLuc »
--      se recolle en « JeanLuc » et le pseudo change de mot ;
--   2. les quinze codets invisibles sont RETIRÉS — ce sont ceux que
--      `player_alias_is_allowed` refuse, la liste est la même à dessein : ce
--      que le nettoyeur laisse passer, le filtre le rejetterait ;
--   3. le formateur partagé replie et rogne, PUIS on tronque à 24 et on rogne
--      à nouveau (la troncature peut retomber sur une espace).
create or replace function public.sanitize_player_alias(p_alias text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.substr(
      public.format_player_alias(
        pg_catalog.translate(
          pg_catalog.regexp_replace(
            coalesce(p_alias, ''), '[[:cntrl:]]', ' ', 'g'
          ),
          pg_catalog.chr(8203) || pg_catalog.chr(8204) || pg_catalog.chr(8205)
            || pg_catalog.chr(8206) || pg_catalog.chr(8207)
            || pg_catalog.chr(8234) || pg_catalog.chr(8235)
            || pg_catalog.chr(8236) || pg_catalog.chr(8237)
            || pg_catalog.chr(8238) || pg_catalog.chr(8294)
            || pg_catalog.chr(8295) || pg_catalog.chr(8296)
            || pg_catalog.chr(8297) || pg_catalog.chr(65279),
          ''
        )
      ),
      1, 24
    )
  )
$$;

-- ════════════════════════════════════════════════════════════
-- 2. LA DÉCISION — nettoyer, ou remplacer, et rien entre les deux
-- ════════════════════════════════════════════════════════════
--
-- Cette fonction EST la règle de nettoyage : la migration ci-dessous ne fait
-- que l'appliquer, et le pgTAP l'éprouve DIRECTEMENT. Aucune des deux ne
-- recopie l'autre — un test qui redirait la règle en la paraphrasant
-- resterait vert le jour où la règle change.
--
-- `p_seed` est l'identifiant de la ligne. Six hexadécimaux suffisent à
-- distinguer, et aucun mot bloqué n'est écrit avec les seuls caractères
-- [0-9a-f] : « Joueur a3f2b1 » passe `player_alias_is_allowed` par
-- construction, ce que la garde pgTAP vérifie plutôt que de le supposer.
create or replace function public.repair_player_alias(p_alias text, p_seed uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.sanitize_player_alias(p_alias) <> ''
     and public.player_alias_is_allowed(public.sanitize_player_alias(p_alias))
      then public.sanitize_player_alias(p_alias)
    else pg_catalog.btrim(
      'Joueur ' || pg_catalog.substr(
        pg_catalog.replace(coalesce(p_seed::text, ''), '-', ''), 1, 6
      )
    )
  end
$$;

revoke all on function public.sanitize_player_alias(text)
  from public, anon, authenticated;
revoke all on function public.repair_player_alias(text, uuid)
  from public, anon, authenticated;
grant execute on function public.sanitize_player_alias(text) to service_role;
grant execute on function public.repair_player_alias(text, uuid) to service_role;

comment on function public.sanitize_player_alias(text) is
  'Retire contrôles et codets invisibles, replie les espaces, tronque à 24. '
  'Pendant SQL de sanitizePlayerAlias (src/lib/player-alias.ts).';
comment on function public.repair_player_alias(text, uuid) is
  'Alias réparé : la forme nettoyée si elle est acceptable, sinon un neutre '
  'stable dérivé de p_seed. Immutable : deux exécutions rendent le même mot.';

-- ════════════════════════════════════════════════════════════
-- 3. LES LIGNES DÉJÀ LÀ
-- ════════════════════════════════════════════════════════════
--
-- `is distinct from` et non `<>` : `first_name` est `not null default ''`,
-- mais la comparaison doit rester juste même si cette colonne devenait
-- nullable — un `<>` laisserait alors passer la ligne sans la toucher.
update public.contest_players p
   set first_name = public.repair_player_alias(p.first_name, p.id)
 where p.first_name is distinct from public.repair_player_alias(p.first_name, p.id);

-- ════════════════════════════════════════════════════════════
-- 4. LA PORTE, MAINTENANT QUE LA PIÈCE EST PROPRE
-- ════════════════════════════════════════════════════════════
--
-- DEUX contraintes plutôt qu'une, et c'est délibéré : la longueur et le
-- format échouent avec des noms différents, donc l'erreur dit laquelle des
-- deux règles a mordu. Recoller la seconde dans la première rendrait tout
-- refus indiscernable.
--
-- `contest_players_identity_length_check` est RECRÉÉE plutôt qu'augmentée :
-- elle porte aussi email et téléphone, dont les bornes ne bougent pas. Seul
-- `first_name` passe de 60 à 24 — la borne applicative depuis ADR-169, celle
-- que `player_alias_is_allowed` applique déjà, et celle que
-- `validations/loyalty.ts` désignait déjà comme la référence.
--
-- Le CHECK appelle `player_alias_is_allowed`, dont l'EXECUTE n'est accordé
-- qu'à `service_role`. Ce n'est pas un oubli : `00023:222` a retiré
-- insert/update/delete sur `contest_players` à `authenticated`, et toutes les
-- écritures passent par le client admin. La contrainte échoue donc fermée
-- pour quiconque n'a pas déjà le droit d'écrire.
alter table public.contest_players
  drop constraint if exists contest_players_identity_length_check;
alter table public.contest_players
  drop constraint if exists contest_players_first_name_alias_check;

alter table public.contest_players
  add constraint contest_players_identity_length_check
    check (
      char_length(btrim(first_name)) between 1 and 24
      and (email is null or char_length(email) <= 254)
      and (phone is null or char_length(phone) between 6 and 20)
    ) not valid,
  add constraint contest_players_first_name_alias_check
    check (public.player_alias_is_allowed(first_name)) not valid;

alter table public.contest_players
  validate constraint contest_players_identity_length_check;
alter table public.contest_players
  validate constraint contest_players_first_name_alias_check;

comment on column public.contest_players.first_name is
  'Pseudo AFFICHÉ au classement public. Filtré par player_alias_is_allowed '
  '(1..24, ni contrôle ni codet invisible, ni injure) — miroir base de '
  'nicknameSchema (src/lib/validations/pronostics.ts).';
