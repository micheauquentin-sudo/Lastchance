-- ============================================================
-- Lastchance — la DESCRIPTION d'un lot émis ne change plus non plus
-- ============================================================
--
-- ── La moitié que 20260814120000 a laissée ouverte ──
--
-- Cette migration-là a gelé le LIBELLÉ du registre, et son en-tête (l. 31-36)
-- l'écrit noir sur blanc : « elle ne change encore rien à ce que la caisse
-- AFFICHE », le second geste « viendra ; il est plus large et demande sa
-- propre revue ». Voici la part base de ce second geste.
--
-- Le gel du libellé substituait une seule ligne de l'`on conflict` :
-- `label = excluded.label`. La ligne voisine, `metadata = excluded.metadata`
-- (20260805150000, l. 221), est restée intacte — or `metadata` porte la clé
-- `reward_details`, la description, écrite par huit des neuf familles
-- (20260805150000 l. 287, 317, 346, 379, 437, 470, 512, 549 ; `contest` est la
-- seule à ne pas en écrire). Elle était donc RÉÉCRITE à chaque
-- resynchronisation du miroir — y compris celle que déclenche la remise en
-- caisse elle-même, par le trigger `*_reward_issuance`.
--
-- ── Ce que le caissier avait sous les yeux ──
--
-- Le titre de la carte porte le libellé gravé, « Café offert ». La ligne juste
-- en dessous portait la description COURANTE, « un croissant pur beurre, hors
-- boissons ». Les deux lignes de la même carte se contredisent, et c'est la
-- seconde qui énonce les CONDITIONS que le caissier applique au comptoir.
--
-- Un correctif d'affichage défensif est déjà livré (`src/lib/caisse-remise.ts`,
-- `descriptionDeCaisse`) : quand le libellé gravé diffère du libellé courant,
-- il RETIRE la description plutôt que de l'afficher. Il assume par écrit sa
-- moitié manquante — « une description réécrite SANS renommage passe
-- inaperçue ». C'est cette moitié que ce fichier ferme, et il fait plus que la
-- fermer : une fois la description gravée, la caisse peut afficher la BONNE
-- plutôt que rien.
--
-- ── Pourquoi `reward_details` seule, et pas `metadata` en bloc ──
--
-- Figer tout le JSON serait plus court à écrire et faux. `metadata` mélange
-- deux natures :
--
--   • une PROMESSE faite au client — `reward_details`, et elle seule : c'est le
--     texte des conditions sous lesquelles il a gagné ;
--   • du CONTEXTE — `legacy_table` (dont dépend le rattrapage de
--     20260822120000 pour router son rejeu), `experience_label`, `rank`,
--     `cycle`, `beneficiary`, `visit_count`, `emission_source`,
--     `calendar_reward_source`. Rien de tout cela n'a été promis à qui que ce
--     soit, et le figer aurait deux coûts : un renommage de campagne ne se
--     verrait plus dans le registre, et surtout AUCUNE clé ajoutée par une
--     future version de `sync_reward_issuance` n'apparaîtrait jamais sur les
--     lignes déjà écrites.
--
-- Le gel est donc chirurgical : une clé, celle qui engage.
--
-- ── Remplir oui, écraser jamais ──
--
-- Le `case` reprend exactement la règle du gel du libellé (`when label = ''
-- then excluded.label`) : il laisse REMPLIR une description absente, il
-- n'écrase jamais une description gravée. Deux populations en profitent — les
-- lignes rétro-alimentées par 20260807120000, et le lot dont le commerçant
-- écrit la description APRÈS l'avoir créé.
--
-- « Description absente » a TROIS formes en base, et la première rédaction de
-- ce fichier n'en voyait qu'une — mesuré sur les colonnes parentes, pas déduit :
--
--   • clé ABSENTE : `sync_reward_issuance` compose son `metadata` avec
--     `jsonb_strip_nulls`, qui retire la clé quand la colonne parente est nulle.
--     C'est le cas des sept familles dont la colonne `reward_details` est
--     nullable (hunts, loyalty, jackpot, events, calendar, referral, quiz) ;
--   • clé PRÉSENTE mais VIDE : `prizes.description` est `text not null default
--     ''` (00001_initial_schema, l. 70). Sur la ROUE — le parcours principal,
--     et de loin la famille la plus émettrice — la clé existe donc TOUJOURS, et
--     vaut la chaîne vide tant que le commerçant n'a rien écrit ;
--   • `null` JSON, que `->>` rend comme SQL NULL.
--
-- Ne tester que l'existence de la clé aurait donc gelé une chaîne VIDE à
-- perpétuité sur la roue : le commerçant qui crée son lot sans description puis
-- l'écrit le lendemain ne l'aurait jamais vue apparaître au registre, et les
-- lots déjà gagnés seraient restés muets pour toujours. Le prédicat porte donc
-- sur la VALEUR et non sur la présence, ce qui couvre les trois formes d'un
-- coup — et c'est mot pour mot la règle du gel du libellé (`when label = ''`).
--
-- ── Pourquoi elle se dérive au lieu de se recopier ──
--
-- Même raison que 20260814120000, et elle n'a pas faibli : recopier
-- `upsert_reward_issuance` pour en changer une ligne créerait une SECONDE
-- SOURCE DE VÉRITÉ, qui divergerait au premier correctif porté à l'originale —
-- la classe de défaut la plus coûteuse de ce projet, celle qui lui a déjà livré
-- deux escalades de privilège.
--
-- On lit donc la définition VIVANTE (`pg_get_functiondef`), qui porte déjà le
-- gel du libellé, on applique UNE substitution, et on rejoue. QUATRE gardes
-- encadrent le geste, comptées et non arrondies :
--
--   1. le motif est présent AVANT, et exactement UNE fois — `replace` frappe
--      toutes les occurrences, en compter une est ce qui autorise à ne pas s'en
--      soucier ;
--   2. il est absent APRÈS la substitution ;
--   3. le corps INSTALLÉ porte la nouvelle gravure — ce qui compte est ce que
--      le catalogue contient, jamais ce que la migration croit avoir fait ;
--   4. il porte TOUJOURS celle du libellé : cette migration réécrit la fonction
--      qui la portait, et la perdre en silence rouvrirait un correctif déjà en
--      production.
-- ============================================================

do $migration$
declare
  v_def text;
  v_mut text;
  v_hits int;
  v_motif constant text := '    metadata = excluded.metadata,';
  v_gel   constant text :=
    '    -- DESCRIPTION GRAVÉE À L''ÉMISSION (20260901120000). Pendant du gel du' || E'\n' ||
    '    -- libellé posé par 20260814120000, qui n''avait figé que `label` : la' || E'\n' ||
    '    -- ligne affichée SOUS le titre en caisse porte les CONDITIONS que le' || E'\n' ||
    '    -- caissier applique. Un lot déjà émis garde donc la description sous' || E'\n' ||
    '    -- laquelle le client l''a gagné, même si le commerçant la réécrit.' || E'\n' ||
    '    --' || E'\n' ||
    '    -- SEULE la clé `reward_details` est figée. Le reste de `metadata`' || E'\n' ||
    '    -- (`legacy_table`, `experience_label`, `rank`, `cycle`, `beneficiary`,' || E'\n' ||
    '    -- `visit_count`…) continue de se resynchroniser : c''est du contexte,' || E'\n' ||
    '    -- pas une promesse, et le figer empêcherait toute clé future' || E'\n' ||
    '    -- d''apparaître sur les lignes déjà écrites.' || E'\n' ||
    '    --' || E'\n' ||
    '    -- Le `case` laisse seulement REMPLIR une description absente, jamais' || E'\n' ||
    '    -- écraser une description gravée — même règle que le libellé vide. Le' || E'\n' ||
    '    -- prédicat porte sur la VALEUR et non sur la présence de la clé : la' || E'\n' ||
    '    -- roue écrit toujours `reward_details` (prizes.description est non' || E'\n' ||
    '    -- nulle, à défaut vide), les sept autres familles retirent la clé' || E'\n' ||
    '    -- quand elle est nulle. Tester la seule PRÉSENCE de la clé aurait gelé' || E'\n' ||
    '    -- une chaîne VIDE à vie sur le parcours principal.' || E'\n' ||
    '    metadata = case' || E'\n' ||
    '      when coalesce(' || E'\n' ||
    '        public.reward_issuances.metadata ->> ''reward_details'', ''''' || E'\n' ||
    '      ) = '''' then excluded.metadata' || E'\n' ||
    '      else excluded.metadata || pg_catalog.jsonb_build_object(' || E'\n' ||
    '        ''reward_details'',' || E'\n' ||
    '        public.reward_issuances.metadata -> ''reward_details''' || E'\n' ||
    '      )' || E'\n' ||
    '    end,';
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'upsert_reward_issuance';

  v_hits := (length(v_def) - length(replace(v_def, v_motif, ''))) / length(v_motif);

  if v_hits <> 1 then
    raise exception
      'upsert_reward_issuance porte % occurrence(s) du motif attendu au lieu d''une seule : la fonction a changé, cette migration décrirait du code qui n''existe plus',
      v_hits;
  end if;

  v_mut := replace(v_def, v_motif, v_gel);

  if position(v_motif in v_mut) > 0 then
    raise exception 'la substitution n''a rien retiré : la description resterait recopiée';
  end if;

  execute v_mut;
end
$migration$;

-- Contrôle final sur le catalogue : ce qui compte est ce qui est INSTALLÉ,
-- jamais ce que la migration croit avoir fait. Le gel du libellé est revérifié
-- au passage — cette migration réécrit la fonction qui le porte, et le perdre
-- silencieusement rouvrirait un correctif de production.
do $verif$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_reward_issuance'
      and p.prosrc like '%DESCRIPTION GRAVÉE À L''ÉMISSION%'
  ) then
    raise exception 'le gel de la description n''est pas dans le corps installé';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_reward_issuance'
      and p.prosrc like '%LIBELLÉ GRAVÉ À L''ÉMISSION%'
  ) then
    raise exception 'le gel du libellé de 20260814120000 a été perdu par cette réécriture';
  end if;
end
$verif$;
