-- ============================================================
-- Lastchance — La CAUSE d'une annulation devient une colonne, et
-- l'explication qu'elle porte reçoit une échéance bornée
--
-- Cette migration fait DEUX choses, et la première conditionne la seconde :
-- elle sort la cause d'annulation du champ de texte libre où elle vivait, puis
-- elle borne la durée de vie de la ligne d'explication en s'appuyant sur cette
-- cause désormais fiable.
--
-- ════════════════════════════════════════════════════════════
-- I. LA CAUSE NE PEUT PLUS ÊTRE ÉCRITE PAR UN COMMERÇANT
-- ════════════════════════════════════════════════════════════
--
-- `20260902120000` a introduit deux causes automatiques et les a encodées dans
-- `reward_issuances.cancelled_reason` sous forme de deux littéraux sentinelles,
-- « source purgée » et « source supprimée ». Trois lecteurs en dépendent : la
-- purge du registre, `player_wallet`, et la caisse côté applicatif.
--
-- ── Le défaut : ce champ N'EST PAS À NOUS ──
--
-- `cancelled_reason` est du TEXTE LIBRE SAISI PAR LE COMMERÇANT, et il arrive
-- dans le registre par DEUX chemins, tous deux ouverts :
--
--   1. `cancel_participation` (20260722150000:162-168) n'exige du motif que
--      cinq caractères. `sync_reward_issuance` recopie ensuite `p.
--      cancelled_reason` TEL QUEL dans le registre (20260805150000:294) — la
--      roue est la seule des dix branches à propager ce champ, les neuf autres
--      écrivant `null::text`. Un `editor` qui saisit exactement « source
--      purgée » (13 caractères, le seuil est franchi) fabrique donc la
--      sentinelle.
--   2. Plus court encore, et sans formulaire : `00018:24` accorde `update` sur
--      TOUTES les colonnes de `participations` à `authenticated`, et `00017:100`
--      ouvre la policy à l'`owner`. Un `PATCH /rest/v1/participations?id=eq.…`
--      portant `{"cancelled_at": …, "cancelled_reason": "source purgée"}` obtient
--      le même résultat sans passer par la RPC — donc sans la ligne
--      `audit_logs` que la RPC écrit.
--
-- Ce que la sentinelle forgée obtenait : le portefeuille affichait au client
-- « Personne ne l'a annulé. » et la caisse faisait dire au caissier, devant lui,
-- « Ce n'est une décision de personne — ni la vôtre, ni celle de votre
-- équipe. » ; et la ligne gagnait la protection de rétention réservée aux
-- annulations automatiques. C'est ADR-069 retournée : au lieu d'imputer au
-- commerçant un geste automatique, on laissait le commerçant imputer à
-- l'automatisme son propre geste.
--
-- ── Le correctif : une colonne, écrite par la base seule ──
--
-- `cancelled_source` est posée par UN seul écrivain,
-- `cancel_reward_issuance_on_source_delete`, redéfini plus bas. Aucun autre
-- chemin ne la nomme :
--
--   * `upsert_reward_issuance` (20260805150000:198-254) — le miroir, seul
--     chemin par lequel une écriture legacy atteint le registre — ne cite pas
--     la colonne, ni à l'`insert`, ni à l'`on conflict do update`. Un `PATCH`
--     sur `participations` ne peut donc PAS l'atteindre, quel que soit le texte
--     posté ;
--   * `reward_issuances` est révoquée en entier de `public, anon,
--     authenticated` (20260805150000:142-145) : aucun chemin PostgREST direct
--     n'existe, pour aucune colonne.
--
-- Le repli, quand la colonne est nulle, est `'merchant'` — évalué À LA LECTURE
-- (`player_wallet` ci-dessous, prédicat de purge ci-dessous), jamais stocké.
-- C'est le sens sûr : une annulation dont on ne sait rien est traitée comme une
-- décision, ce qui n'accorde AUCUNE des faveurs réservées à l'automatique.
--
-- ── Ce que la colonne NE porte PAS : de contrainte d'état ──
--
-- Aucun `check (cancelled_source is null or cancelled_at is not null)`, et ce
-- n'est pas un oubli. `upsert_reward_issuance` écrit `cancelled_at =
-- excluded.cancelled_at`, y compris `null` quand la source cesse d'être
-- annulée, sans toucher `cancelled_source` : la contrainte lèverait alors DANS
-- le trigger `after` du miroir, donc à l'intérieur de la transaction de
-- l'écriture legacy, et ROLLBACK celle-ci. C'est très exactement le droit de
-- VETO du miroir sur l'autorité que 20260805150000:58-103 refuse deux fois, sur
-- la forme du code et sur l'échéance. Une valeur résiduelle est sans effet :
-- les deux lecteurs testent `cancelled_at` avant de la consulter.
--
-- Le cas ne se produit d'ailleurs pas : le seul écrivain de la colonne agit
-- APRÈS la disparition définitive de la ligne source, et 20260902120000:174-191
-- établit qu'aucun chemin ne réactive alors la ligne de registre.
--
-- ── `cancelled_reason` continue d'être écrit, et ne décide plus rien ──
--
-- Les deux sentinelles restent posées par le trigger. Elles ne gouvernent plus
-- aucune décision de la base ; elles subsistent parce que la caisse les lit
-- encore côté applicatif (`causeDepuisMotif`) et parce que ce champ reste le
-- seul motif lisible d'une annulation. La bascule de la caisse sur
-- `cancelled_source` appartient au lot applicatif — tant qu'elle n'a pas eu
-- lieu, le chemin 1 ci-dessus reste exploitable SUR LE SEUL ÉCRAN DE CAISSE,
-- plus sur le portefeuille ni sur la rétention.
--
-- ── Rattrapage des lignes existantes ──
--
-- Un seul `update`, sur les lignes déjà annulées. C'est l'UNIQUE endroit de ce
-- fichier où le texte décide d'une cause, et il ne s'exécute qu'une fois, sur
-- des lignes antérieures à la colonne. MESURÉ en production le 2026-08-03 :
-- `reward_issuances` y porte 2 lignes et ZÉRO annulée — ce rattrapage n'y
-- touche rien. Il existe pour les bases de développement, la CI et le seed.
--
-- ════════════════════════════════════════════════════════════
-- II. L'EXPLICATION REÇOIT UNE ÉCHÉANCE, ET LA GRÂCE CHANGE DE CRITÈRE
-- ════════════════════════════════════════════════════════════
--
-- ── Le trou, ouvert par le correctif précédent ──
--
-- `20260902120000` a exclu de la purge du registre les annulations causées par
-- la rétention. Cette clause n'avait pas d'échéance. Or `sync_reward_issuance`
-- écrit `null::timestamptz as expires_at` pour HUIT de ses dix branches
-- (20260805150000:320,350,383,412,441,474,518,554) ; seules la roue et les
-- pronostics reportent une échéance, et les deux colonnes sources sont
-- nullables. Pour ces familles, une ligne annulée n'était terminale pour aucune
-- des trois branches du prédicat : aucun chemin ne la supprimait jamais, alors
-- qu'elle porte un `player_id` et qu'il n'existe aucune purge de
-- `public.players`.
--
-- ── QUI A DROIT À LA GRÂCE : le collatéral, jamais la décision ──
--
-- La première rédaction ne graciait que « source purgée », laissant « source
-- supprimée » terminale à l'instant du marquage. Cette distinction est
-- ABANDONNÉE, et le motif est vérifiable plutôt que d'opinion.
--
-- AVANT `20260902120000`, les triggers de miroir étaient `after insert or
-- update` et jamais `delete` : quelle que soit la cause, la disparition de la
-- source laissait la ligne de registre `cancelled_at is null`, donc NON
-- TERMINALE, donc jamais purgée. `20260902120000` a converti « jamais purgée »
-- en « purgée dès le passage suivant du cron » POUR LES DEUX CAUSES, et n'a
-- protégé que l'une d'elles. L'asymétrie n'avait donc pas de fondement propre :
-- elle suivait le contour du risque que la revue de sécurité avait nommé à ce
-- moment-là.
--
-- Le scénario qu'elle laissait ouvert est réel : rétention 12 mois, un client a
-- gagné un `CHASSE-…` il y a 14 mois et ne l'a jamais retiré — la famille chasse
-- n'a aucune échéance, rien ne l'avait clos. Le commerçant supprime la chasse
-- aujourd'hui et coche la case d'ADR-063. `issued_at` est déjà au-delà de la
-- rétention : le cron de la nuit même détruit la ligne, et le client perd
-- l'explication ALORS MÊME QU'il a quelqu'un à qui la demander.
--
-- La règle retenue ne porte donc pas sur « qui a décidé » mais sur « cette
-- ligne a-t-elle été close par une décision PORTANT SUR CE LOT » :
--
--   * `merchant` (et le repli des lignes sans cause connue) — un humain a
--     annulé CE lot, motif à l'appui. Terminale immédiatement, comme avant.
--   * `purged` et `source_deleted` — la ligne est tombée en COLLATÉRAL d'un
--     geste qui visait autre chose : une purge de rétention, la suppression
--     d'un jeu. Personne n'a statué sur ce lot ; le client, lui, détenait un
--     code. Grâce.
--
-- ── LA DURÉE : trois mois est un CHOIX PRODUIT, et il est BORNÉ ──
--
-- La première rédaction avançait deux appuis chiffrés. Les DEUX étaient FAUX ;
-- ils sont retirés et non réécrits.
--
--   * « la plus longue vie qu'un code de retrait puisse avoir dans ce
--     produit » : faux. `contests.code_ttl_seconds` est NULLABLE et son propre
--     commentaire dit « null : sans limite » (20260804120000:128) ;
--     `campaigns.code_ttl_seconds` est nullable aussi (00004:23-24) ; et les
--     sept autres familles n'ont AUCUNE colonne d'échéance. 90 jours est la plus
--     longue échéance FINIE CONFIGURABLE, pas la plus longue vie d'un code — et
--     les familles où cette grâce décide de quelque chose sont exactement celles
--     dont le code ne meurt jamais.
--   * « le quart de la plus courte rétention déclarable » : faux. Le `<select>`
--     à 12/24/36 mois est du CLIENT. La frontière serveur est
--     `src/lib/validations/privacy.ts:5` (`min(1).max(60)`) et le CHECK
--     `00016:15` (`between 1 and 60`). Un propriétaire qui poste `months=1` est
--     accepté : trois mois y seraient le TRIPLE de la rétention, pas le quart.
--
-- Rien dans ce produit ne borne la durée pendant laquelle un client conserve un
-- code devenu mort. Il n'existe donc AUCUN appui mesurable pour cette durée, et
-- prétendre le contraire est le motif récurrent que ce dépôt se reproche. Trois
-- mois est assumé comme un arbitrage produit : assez long pour couvrir le délai
-- ordinaire entre un gain et une visite en boutique, assez court pour ne pas
-- faire d'une ligne rattachable à une personne une conservation de fait.
--
-- Ce qui est vrai et vérifiable, en revanche, c'est la BORNE :
--
--     grâce = least(3 mois, fenêtre de rétention de l'organisation)
--
-- La grâce ne dépasse jamais ce que l'organisation a déclaré. Une organisation
-- à 1 mois — plancher RÉEL, côté serveur — obtient une grâce d'un mois, pas de
-- trois. C'est cette propriété-là qui est énoncée dans le `comment on
-- function`, parce que c'est celle qu'on peut relire dans le code.
--
-- ── LE POINT DE DÉPART : `cancelled_at`, jamais `issued_at` ──
--
-- La ligne devient une explication à l'instant où elle est annulée : c'est
-- cette horloge qui doit courir. `issued_at` serait déjà épuisé au moment de
-- l'annulation pour la famille la plus fréquente — `sync_reward_issuance`
-- reporte `participations.created_at` dans `issued_at`, et c'est le critère
-- EXACT que `purge_expired_personal_data` vient d'appliquer pour supprimer la
-- source. Ancrer la grâce dessus la rendrait nulle pour la roue et rouvrirait,
-- dès le passage suivant du cron, le trou fermé le 2026-08-03.
--
-- La grâce est ANDée avec le critère d'âge, jamais substituée : la ligne doit
-- satisfaire les DEUX, le délai réel est le maximum des deux horloges.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS, dit ici plutôt que découvert ──
--
--   * Elle ne donne d'échéance à aucune des sept familles. Un lot NON annulé et
--     jamais remis reste conservé sans fin, comme le veut 20260810120000. Seul
--     le sous-ensemble annulé en collatéral est borné ici.
--   * Elle ne change rien à la roue et aux pronostics dont l'échéance est
--     passée : la troisième branche du prédicat les emportait déjà.
--   * Elle ne touche ni `public.players`, ni le `player_id` porté par la ligne.
--
-- ════════════════════════════════════════════════════════════
-- III. CATALOGUE VIVANT — ce que ce fichier DÉPLACE
-- ════════════════════════════════════════════════════════════
--
-- Trois définitions déménagent ici et c'est CE fichier qui fait foi. La règle
-- du catalogue vivant s'applique : `grep -l "function public.<nom>"
-- supabase/migrations/*.sql` rend désormais DEUX fichiers pour chacune.
--
--   * `cancel_reward_issuance_on_source_delete` — depuis 20260902120000:220
--   * `player_wallet(text, integer)`             — depuis 20260902120000:623
--   * `purge_expired_reward_issuances()`         — depuis 20260902120000:539
--
-- Les deux premiers corps n'ont PAS été recopiés à la main : ils ont été
-- extraits de 20260902120000 par script, une seule expression y a été modifiée
-- dans chacun, et le reste est identique à l'octet près.
--
-- Les triggers ne sont pas recréés : `create or replace function` conserve leur
-- liaison, et les dix `create trigger` de 20260902120000:297-336 restent
-- valides.
--
-- ── Une phrase FAUSSE de 20260902120000, corrigée là où c'est possible ──
--
-- Ce fichier-là décrit, dans son `comment on function` (:283) et dans un titre
-- de section (:342-347), un mécanisme qu'il a lui-même ABANDONNÉ : « le réglage
-- lastchance.purge_maintenance, posé par alter function ». Son propre en-tête
-- (:127-149) raconte pourtant que cette voie est REFUSÉE par Supabase
-- (`permission denied to set parameter` : `postgres` n'est pas superutilisateur
-- et un paramètre custom l'exige) et qu'elle a fait échouer la migration EN
-- ENTIER au premier `db reset`. Le mécanisme réellement en place est
-- `set_config(…, is_local => true)` dans les cinq corps de purge.
--
-- Un mainteneur qui ajoute une sixième purge en suivant ce commentaire
-- reproduirait l'échec. `20260902120000` est sur `main`, donc figée :
--   * le `comment on function` est un objet de catalogue — il est RÉÉCRIT
--     ci-dessous, et c'est cette version-là que `\df+` rend ;
--   * le titre de section n'est qu'un commentaire SQL dans un fichier immuable.
--     Il ne peut pas être corrigé ; il est remplacé par une garde qui ne dépend
--     d'aucune prose — `reward_source_deletion.test.sql` vérifie dans `pg_proc`
--     que les CINQ purges concernées portent bien le `set_config`, et rougit
--     donc sur une sixième purge écrite selon le commentaire périmé.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. La cause d'annulation devient une colonne
-- ════════════════════════════════════════════════════════════
--
-- Vocabulaire fermé et identique à celui que `player_wallet` rend au lot
-- applicatif (`CAUSES_ANNULATION`), pour qu'aucune traduction n'ait lieu entre
-- la colonne et l'écran. Pas de `not null` : le repli vit à la lecture.
alter table public.reward_issuances
  add column if not exists cancelled_source text
    check (
      cancelled_source is null
      or cancelled_source in ('merchant', 'source_deleted', 'purged')
    );

comment on column public.reward_issuances.cancelled_source is
  'CAUSE de l''annulation, vocabulaire fermé (merchant / source_deleted / purged). Écrite par la SEULE fonction cancel_reward_issuance_on_source_delete ; le miroir upsert_reward_issuance ne la nomme jamais, et la table est révoquée de authenticated — aucun texte saisi par un commerçant ne peut donc la fabriquer, contrairement à cancelled_reason dont elle prend la place comme discriminant. Null = cause inconnue : lue comme « merchant », le sens qui n''accorde aucune faveur.';

-- Rattrapage UNIQUE des lignes antérieures à la colonne. Seul endroit de ce
-- fichier où le texte décide d'une cause ; il ne s'exécute qu'une fois, et
-- production mesurée à zéro ligne annulée le 2026-08-03.
update public.reward_issuances
   set cancelled_source = case
         when cancelled_reason = 'source purgée' then 'purged'
         when cancelled_reason = 'source supprimée' then 'source_deleted'
         else 'merchant'
       end
 where cancelled_at is not null
   and cancelled_source is null;

-- ════════════════════════════════════════════════════════════
-- 2. Le seul écrivain de la colonne
-- ════════════════════════════════════════════════════════════
--
-- Corps extrait de 20260902120000:220-280, une seule affectation ajoutée
-- (`cancelled_source`). Le reste est identique à l'octet près.
create or replace function public.cancel_reward_issuance_on_source_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `tg_argv[0]` est le `source_type` du registre, écrit en toutes lettres dans
  -- la déclaration de chaque trigger : c'est une valeur de liste blanche, jamais
  -- du SQL dynamique, et la correspondance table → famille se lit sur la même
  -- ligne que le nom de la table plutôt que dans une table de correspondance
  -- séparée qui pourrait diverger de celle de `sync_reward_issuance`.
  update public.reward_issuances ri
     set cancelled_at = pg_catalog.now(),
         -- DEUX CAUSES, jamais confondues (voir l'en-tête). Le geste
         -- d'entretien du commerçant est confirmé par un humain qui a coché une
         -- case nommant les codes en jeu ; la purge de rétention est
         -- automatique et ne demande rien à personne. Les afficher pareil
         -- ferait dire au comptoir, en face du client et en 2028, que son
         -- patron a supprimé l'opération — alors que c'est le RGPD qui a
         -- travaillé. Ce n'est pas une fuite, c'est une régression de véracité
         -- sur le point de contact le plus sensible du produit.
         --
         -- ⚠️ CETTE COLONNE-CI EST LE DISCRIMINANT, et `cancelled_reason` ne
         -- l'est plus. Ce champ-là est du texte libre saisi par le commerçant :
         -- deux chemins lui permettaient d'y écrire lui-même « source purgée »
         -- et d'obtenir ainsi le traitement réservé à l'automatique (l'en-tête
         -- les nomme tous les deux). `cancelled_source` n'est nommée par aucun
         -- chemin d'écriture legacy — c'est ce qui la rend fiable, pas sa
         -- valeur.
         cancelled_source = case
           when pg_catalog.current_setting(
                  'lastchance.purge_maintenance', true) = 'on'
             then 'purged'
           else 'source_deleted'
         end,
         -- Conservé pour le lecteur humain et pour la caisse, qui lit encore ce
         -- champ côté applicatif. Plus aucune décision de la base n'en dépend.
         cancelled_reason = case
           when pg_catalog.current_setting(
                  'lastchance.purge_maintenance', true) = 'on'
             then 'source purgée'
           else 'source supprimée'
         end,
         wallet_status = case
           when ri.wallet_status in ('not_requested', 'active', 'failed')
             then 'revocation_requested'
           else ri.wallet_status
         end,
         wallet_updated_at = case
           when ri.wallet_status in ('not_requested', 'active', 'failed')
             then pg_catalog.now()
           else ri.wallet_updated_at
         end,
         updated_at = pg_catalog.now()
   where ri.source_type = tg_argv[0]
     and ri.source_id = old.id
     -- Cloison d'organisation. Aucun chemin d'exploitation n'a été trouvé sans
     -- elle — l'index unique `(source_type, source_id)` est global et
     -- `source_id` vaut toujours la clé primaire de la source — mais la
     -- propriété reposait alors sur l'improbabilité d'une collision d'uuid ET
     -- sur l'absence de désynchronisation entre `reward_issuances.
     -- organization_id` et l'organisation de la ligne source. Cette seconde
     -- hypothèse a DÉJÀ été prise en défaut dans ce dépôt, sur `contest_awards`.
     -- Les dix tables sources portent toutes `organization_id` : la garde rend
     -- la cloison structurelle au lieu de probabiliste, sans coût.
     and ri.organization_id = old.organization_id
     and ri.redeemed_at is null
     and ri.cancelled_at is null;
  return old;
end;
$$;

-- Réécrit : la version de 20260902120000:283 annonçait un réglage « posé par
-- alter function », voie que ce même fichier documente comme REFUSÉE par
-- Supabase et remplacée par `set_config` dans les cinq corps de purge.
comment on function public.cancel_reward_issuance_on_source_delete() is
  'Jumeau à la SUPPRESSION des dix triggers de miroir : quand une ligne source disparaît, sa ligne de registre est ANNULÉE et non détruite — le client lit « Annulé » au lieu de voir son lot s''évaporer, la caisse refuse en le disant, et le rapport hebdomadaire garde le lot comme émis. SEUL ÉCRIVAIN de reward_issuances.cancelled_source, le discriminant de cause : « purged » = la rétention RGPD a emporté la source sur le seul critère d''âge, sans que personne ne décide ; « source_deleted » = geste d''entretien du commerçant, confirmé par un humain. cancelled_reason porte les mêmes deux motifs en toutes lettres, mais ne discrimine plus rien : c''est du texte libre saisi au formulaire, qu''un commerçant pouvait faire passer pour une sentinelle. La cause vient du réglage lastchance.purge_maintenance, posé par set_config(is_local => true) DANS le corps des cinq purges qui suppriment une source — et NON par alter function … set, refusé par Supabase (permission denied to set parameter : postgres n''est pas superutilisateur, un paramètre custom l''exige) : une sixième purge écrite ainsi ferait échouer sa migration en entier. Scopé à l''organisation. Ne touche jamais un lot déjà remis ni une annulation déjà motivée.';

-- Même forme que `mirror_reward_issuance`, son jumeau à l'insertion.
-- `service_role` n'est délibérément pas révoqué : c'est lui qui exécute les
-- suppressions que ce trigger doit suivre, et on ne fait pas dépendre un chemin
-- de production du moment exact où Postgres contrôle EXECUTE sur une fonction
-- de trigger.
revoke all on function public.cancel_reward_issuance_on_source_delete()
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. Le portefeuille lit la colonne, plus le texte
-- ════════════════════════════════════════════════════════════
--
-- Corps extrait de 20260902120000:623-725, une seule expression modifiée : le
-- `case` qui produit `cancelled_cause`. Le NOM RENDU est inchangé — le lot
-- applicatif (`normaliserCauseAnnulation`) le consomme déjà tel quel.
-- `create or replace` et non `drop`/`create` : le type de retour ne change pas,
-- la colonne `cancelled_cause` existait déjà dans la signature.
create or replace function public.player_wallet(
  p_token_hash text,
  p_limit integer default 50
)
returns table (
  organization_id uuid,
  organization_name text,
  source_type text,
  label text,
  code text,
  status text,
  cancelled_cause text,
  issued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_limit integer;
begin
  -- Forme du hash contrôlée AVANT toute lecture : un paramètre malformé est
  -- une absence de résultat, jamais une erreur qui distinguerait « hash
  -- inconnu » de « hash mal formé ».
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- Bornage du volume : un portefeuille est une page, pas un export.
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  -- Prédicat de validité d'appareil, en DEUX moitiés : l'appareil n'est pas
  -- révoqué (ou l'est mais reste en grâce, le temps qu'une rotation de jeton
  -- s'achève) ET LE JOUEUR EST ACTIF.
  --
  -- ⚠️ CE COMMENTAIRE A DÉJÀ MENTI, et c'est pour cela qu'il dit le prédicat
  -- en entier plutôt que d'en citer une ligne. Il annonçait un prédicat
  -- « repris à l'identique de 20260805140000:711 » alors que cette ligne-là
  -- n'est que la clause `revoked_at` : elle appartient à une requête dont la
  -- jointure porte `p.status = 'active'` SEIZE LIGNES PLUS HAUT (`:693-695`).
  -- Citer par numéro de ligne avait isolé la moitié du prédicat, et la moitié
  -- manquante était la garde de blocage. Ce chemin est le seul des huit qui
  -- sert des CODES DE RETRAIT ENCAISSABLES : un joueur bloqué y aurait lu des
  -- droits au porteur qu'un commerçant lui a précisément retirés.
  select d.player_id into v_player_id
    from public.player_devices d
    join public.players p
      on p.id = d.player_id
     and p.status = 'active'
   where d.token_hash = p_token_hash
     and (d.revoked_at is null or d.grace_expires_at > pg_catalog.now())
   limit 1;

  if v_player_id is null then
    return;
  end if;

  return query
  select
    r.organization_id,
    o.name,
    r.source_type,
    -- Libellé GRAVÉ (20260814120000) : ce que le client a gagné, et non ce
    -- que la récompense s'appelle aujourd'hui. Lire la table parente ferait
    -- afficher « Croissant offert » sur un lot gagné comme « Café offert ».
    r.label,
    r.code,
    -- États mutuellement exclusifs, dans l'ordre où ils priment. `redeemed`
    -- et `cancelled` sont déjà exclusifs par contrainte
    -- (`reward_issuances_terminal_state`) ; l'expiration ne s'évalue qu'en
    -- l'absence des deux — un lot retiré avant sa date reste « retiré », et
    -- l'afficher « expiré » ferait croire à un droit perdu.
    case
      when r.redeemed_at is not null then 'redeemed'
      when r.cancelled_at is not null then 'cancelled'
      when r.expires_at is not null and r.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end as status,
    -- Cause lue dans la COLONNE, plus jamais dérivée de `cancelled_reason`.
    -- Ce dernier est du texte libre saisi par le commerçant, et deux chemins
    -- lui permettaient d'y écrire lui-même la sentinelle « source purgée » —
    -- donc de faire afficher à SON client « Personne ne l'a annulé. » sur un
    -- lot que lui-même venait d'annuler. `cancelled_source` n'est atteignable
    -- par aucune écriture legacy (voir l'en-tête, § I).
    --
    -- Repli `merchant` et non `null` : une annulation antérieure à la colonne
    -- reste une annulation, et le sens sûr est « quelqu'un a décidé » — c'est
    -- celui qui n'accorde aucune faveur et n'exonère personne à tort. Le
    -- `cancelled_at is null` en tête reste la garde qui rend toute valeur
    -- résiduelle sans effet (voir l'en-tête, § « pas de contrainte d'état »).
    case
      when r.cancelled_at is null then null
      else coalesce(r.cancelled_source, 'merchant')
    end as cancelled_cause,
    r.issued_at,
    r.expires_at
    from public.reward_issuances r
    join public.organizations o on o.id = r.organization_id
   where r.player_id = v_player_id
     and r.code is not null
   -- Groupé par organisation : le client lit « chez qui », puis « quoi ». Le
   -- tri porte le regroupement, l'appelant n'a qu'à découper sur le nom.
   order by o.name, r.issued_at desc
   limit v_limit;
end;
$$;

comment on function public.player_wallet(text, integer) is
  'Portefeuille d''un joueur : ses récompenses des neuf familles, groupées par organisation (tri nom puis date), avec le libellé GRAVÉ, l''échéance, l''état (active/redeemed/cancelled/expired) et, quand l''état est cancelled, la CAUSE (purged / source_deleted / merchant). La cause est lue dans la COLONNE reward_issuances.cancelled_source, jamais dérivée de cancelled_reason : celui-ci est du texte libre saisi par le commerçant, qui pouvait y écrire lui-même la sentinelle « source purgée » et faire afficher à son client « Personne ne l''a annulé. » sur un lot qu''il venait d''annuler. Cause inconnue = merchant, le repli qui n''exonère personne. Entrée = le sha256 du cookie lc-player, jamais un identifiant de joueur : aucun jeton ne doit circuler en URL, un lien partageable listant des codes serait une fuite. LE CODE DE RETRAIT EST UN SECRET PORTEUR : il est rendu parce que le client en a besoin, mais ne doit JAMAIS être journalisé — ni Sentry, ni journal applicatif, ni ops_metrics, ni analytique. Appareil révoqué hors grâce = zéro ligne, joueur bloqué = zéro ligne. service_role uniquement : la page est publique, l''appel est serveur.';

-- ADR-049 : les trois rôles sont révoqués explicitement. `revoke … from
-- public, anon` seul laisserait `authenticated` ET `service_role` en place,
-- réaccordés par l'`alter default privileges` que Supabase pose à
-- l'initialisation du projet.
revoke all on function public.player_wallet(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.player_wallet(text, integer) to service_role;

-- ════════════════════════════════════════════════════════════
-- 4. La purge : grâce au collatéral, bornée par la rétention
-- ════════════════════════════════════════════════════════════
create or replace function public.purge_expired_reward_issuances()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
  -- Plafond de la grâce accordée à l'EXPLICATION. Arbitrage produit assumé,
  -- SANS appui chiffré — l'en-tête dit pourquoi les deux qu'avançait la
  -- première rédaction étaient faux. Ce qui est garanti n'est pas ce chiffre
  -- mais le `least` ci-dessous : la grâce ne dépasse jamais la fenêtre déclarée
  -- par l'organisation, dont le plancher serveur réel est 1 mois.
  v_grace_plafond constant interval := pg_catalog.make_interval(months => 3);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.reward_issuances r
  -- La fenêtre de rétention est calculée UNE fois et nommée : elle sert deux
  -- fois ci-dessous (critère d'âge, plafond de la grâce), et répéter
  -- l'expression bornée laisserait les deux diverger au premier ajustement.
  using (
    select
      org.id,
      pg_catalog.make_interval(
        months => least(greatest(coalesce(org.data_retention_months, 13), 1), 24)
      ) as fenetre
      from public.organizations org
  ) o
   where o.id = r.organization_id
     -- Même fenêtre que les purges de module : c'est ce qui fait office de
     -- propagation là où aucune FK ne relie le miroir à sa source.
     and r.issued_at < pg_catalog.now() - o.fenetre
     -- ET terminé. Un lot encore encaissable survit à sa rétention : le perdre
     -- transformerait une purge de confidentialité en perte de valeur pour le
     -- client qui détient le code.
     and (
       r.redeemed_at is not null
       -- Une annulation vaut « terminé » tout de suite si elle a été DÉCIDÉE
       -- SUR CE LOT — c'est le cas `merchant`, et celui des lignes dont la
       -- cause est inconnue. Elle ne le vaut qu'au terme de la grâce si la
       -- ligne est tombée en COLLATÉRAL d'un geste qui visait autre chose :
       -- une purge de rétention (`purged`) ou la suppression d'un jeu
       -- (`source_deleted`). Dans ces deux cas personne n'a statué sur ce lot,
       -- sept familles sur neuf n'ont aucune expiration qui l'aurait clos, et
       -- le client détient toujours son code. La ligne reste donc — non pour
       -- être encaissée, elle ne peut plus l'être — mais pour dire au client et
       -- au caissier ce qui s'est passé. Passé la grâce, cette explication
       -- n'explique plus rien d'actuel, et la garder revient à conserver sans
       -- fin une ligne rattachable à une personne.
       --
       -- `coalesce(…, 'merchant')` et non `not in` nu : `cancelled_source`
       -- nulle rendrait `in` NULL, donc la branche entière falsy, donc une
       -- annulation ancienne jamais purgée.
       or (r.cancelled_at is not null and (
             coalesce(r.cancelled_source, 'merchant')
               not in ('purged', 'source_deleted')
             or r.cancelled_at
                  < pg_catalog.now() - least(v_grace_plafond, o.fenetre)
           ))
       or (r.expires_at is not null and r.expires_at < pg_catalog.now())
     );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_reward_issuances()
  from public, anon, authenticated;
grant execute on function public.purge_expired_reward_issuances() to service_role;

comment on function public.purge_expired_reward_issuances() is
  'Purge RGPD du registre universel : lignes TERMINÉES au-delà de la rétention de l''organisation (repli 13 mois, plafond 24). Est TERMINÉE une ligne remise, expirée, annulée PAR UNE DÉCISION portant sur ce lot (cancelled_source = merchant, ou cause inconnue), ou annulée EN COLLATÉRAL (purged / source_deleted) depuis plus que le délai de grâce. La grâce vaut least(3 mois, fenêtre de rétention de l''organisation) : elle ne dépasse jamais ce que l''organisation a déclaré, une organisation à 1 mois — le plancher serveur réel, CHECK 00016 between 1 and 60 — obtenant un mois et non trois. Les trois mois sont un arbitrage produit assumé et non une constante dérivée : rien dans ce produit ne borne la durée pendant laquelle un client garde un code mort, sept familles sur neuf n''ayant aucune échéance et les deux code_ttl_seconds étant nullables. Pourquoi une grâce : une ligne annulée en collatéral n''est plus encaissable et ne le redeviendra pas, mais elle EXPLIQUE au client et au caissier ce qui s''est passé — et avant 20260902120000 elle était protégée à vie, les triggers de miroir ne couvrant pas le delete. Le délai court depuis cancelled_at et s''AJOUTE au critère d''âge, il ne s''y substitue pas. Un lot encore encaissable n''est jamais supprimé. Appelée par le cron purge-data.';
