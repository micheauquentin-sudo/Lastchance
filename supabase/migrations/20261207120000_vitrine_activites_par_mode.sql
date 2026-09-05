-- ============================================================
-- VIT-53 — LA VITRINE FILTRE SES ACTIVITÉS PAR MODE, ET NON D'UN BLOC
--
-- CE LOT FERME LE TROU QUE 20261206120000 A NOMMÉ DANS SON PROPRE EN-TÊTE.
--
-- RDV-7 a rendu « Réservation » (clé `rendez_vous`) vendable sans « Moments »
-- (clé `reserver`) : huit RPC dérivent désormais la clé qu'elles exigent du
-- `booking_mode` de l'activité, via `reservation_activity_module_key`.
-- `vitrine_public_state` est restée en dehors, avec `reserver` EN DUR, parce
-- que sa garde couvre d'un seul tenant les TROIS listes de sa porte Réserver
-- — `activites`, `files`, `offres`.
--
-- LE DÉFAUT, MESURÉ SUR LE CATALOGUE VIVANT : une organisation qui ne détient
-- que `rendez_vous` obtient une page vitrine SERVIE, avec une liste d'activités
-- VIDE. Pas un refus, pas une erreur : une vitrine muette, qui annonce un
-- commerce sans jamais montrer les salles qu'il vient d'acheter le droit de
-- remplir. C'est pire qu'un refus franc — un refus se voit, un silence non.
--
-- ── LA RÈGLE POSÉE ICI : PAR OBJET, ET NON PAR BLOC ──
--
-- Chaque activité est retenue si l'organisation détient la clé que SON PROPRE
-- `booking_mode` implique. Une organisation `rendez_vous` seul voit ses
-- rendez-vous et pas ses Moments hérités ; une organisation `reserver` seul —
-- le cas COURANT aujourd'hui — voit exactement ce qu'elle voyait hier ; une
-- organisation qui détient les deux voit tout. Aucune régression pour
-- l'existant, ce qui était la condition du lot.
--
-- LA RÈGLE N'EST PAS RECOPIÉE : le corps appelle
-- `reservation_activity_module_key(a.id)`, la fonction que RDV-7 a posée pour
-- que le `case` sur `booking_mode` n'existe qu'à UN endroit. Recopier ce `case`
-- ici aurait annulé le bénéfice du lot précédent au moment même où on s'en sert.
--
-- ── CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI C'EST ÉCRIT ──
--
--   * Garder la garde de BLOC en la passant à « au moins une des deux clés » :
--     une organisation `rendez_vous` seul verrait alors ses Moments hérités,
--     qu'elle n'a plus le droit de vendre. Le trou changerait de côté.
--   * Refuser la page ENTIÈRE sans `reserver` : régression frontale pour les
--     organisations `reserver` seul, qui sont la population d'aujourd'hui.
--
-- ── LES FILES ET LES OFFRES GARDENT `reserver`, ET CE N'EST PAS UN OUBLI ──
--
-- Ce sont les « deux listes sans mode » que l'en-tête de RDV-7 signalait, et
-- la mesure le confirme :
--
--   * `reservation_stock_offers` ne porte AUCUNE activité — ni colonne, ni
--     jointure. Il n'y a rigoureusement aucun mode à en dériver.
--   * `reservation_queues` porte bien un `activity_id`, mais il est NULLABLE
--     (20261005120000, rappelé en 20261117120000:54). Une file d'accueil sans
--     activité n'a pas de mode ; en inventer un pour la moitié des lignes
--     serait une règle fabriquée pour le confort de cette migration.
--
-- SURTOUT — et c'est l'argument qui tranche, indépendamment du schéma —
-- `queue_join`, `queue_public_state`, `hold_stock_offer` et
-- `stock_offer_public_state` exigent `reserver` DANS LE CATALOGUE VIVANT :
-- RDV-7 les a laissées là exprès. Annoncer une file ou une offre à une
-- organisation qui n'a que `rendez_vous`, ce serait annoncer une porte que la
-- RPC d'en face refuse d'ouvrir — exactement la « promesse rompue » que le
-- commentaire de 20261020120000 interdit. Leur clé ne peut bouger qu'avec
-- celle de ces quatre RPC, et ce serait une décision produit, pas une
-- substitution de garde.
--
-- ── LA MÉTHODE : PATCH DU CORPS VIVANT, COMME LES SEPT FOIS PRÉCÉDENTES ──
--
-- `pg_get_functiondef` puis substitution mesurée, motif de 20261206120000 §2.
-- `vitrine_public_state` est patchée ainsi depuis 20261023120000 : sa dernière
-- définition EN FICHIER ne porte ni `bande`, ni `loyalty`, ni les horaires
-- structurés. La réécrire depuis un fichier reviendrait en arrière, en
-- silence, sur cinq migrations de correctifs.
--
-- CHAQUE ANCRE EST COMPTÉE, et le compte EST l'assertion : zéro voudrait dire
-- que la fonction a changé et que cette migration décrit du code qui n'existe
-- plus ; deux, qu'un second site est apparu et qu'un choix est dû. Les quatre
-- ancres ont été mesurées à 1 sur le catalogue de 20261206120000.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. LE CORPS VIVANT DE `vitrine_public_state`
--
-- TROIS SUBSTITUTIONS, et elles seules :
--   (a) la sous-requête des activités reçoit le filtre par objet ;
--   (b) le bloc de garde cesse de vider `v_activites` — il garde `v_files` et
--       `v_offres`, dont la clé n'a pas changé ;
--   (c) le commentaire du bloc dit ce que le bloc fait désormais. Un
--       commentaire qui survit au code qu'il décrit est un mensonge daté.
--
-- LES DEUX GARDES NE PEUVENT PAS SE CONFONDRE : celle de la sous-requête
-- s'écrit autour de `a.organization_id`, celle du bloc autour de
-- `v_settings.organization_id` sur deux lignes. Les motifs sont écrits assez
-- étroits pour que l'un ne puisse jamais emporter l'autre.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  -- (a) LA SOUS-REQUÊTE DES ACTIVITÉS. Le filtre entre dans le `where`, donc
  -- AVANT le `limit c_max_portes` : une organisation reçoit jusqu'à douze
  -- activités ÉLIGIBLES, et non les éligibles parmi ses douze premières.
  v_motif_liste constant text :=
    'from public\.reservation_activities a\s+where a\.organization_id = '
    'v_settings\.organization_id\s+and a\.active';
  v_neuf_liste constant text :=
'from public.reservation_activities a
           where a.organization_id = v_settings.organization_id
             and a.active
             and public.org_has_module_access(
                   v_settings.organization_id,
                   public.reservation_activity_module_key(a.id))';

  -- (b) LA LIGNE QUI VIDAIT LES ACTIVITÉS D'UN BLOC. Le saut de ligne fait
  -- partie du motif : sans lui, la ligne disparaîtrait en laissant sa
  -- gouttière et son retour, et le corps porterait une ligne blanche au
  -- milieu d'un `if`.
  v_motif_vide constant text := '\n *v_activites := ''\[\]''::jsonb;';

  -- (c) LE COMMENTAIRE DU BLOC. La phrase gardée dit vrai — la FORME du
  -- document ne bouge pas, les trois listes restent présentes et vides plutôt
  -- qu'absentes — mais elle ne dit plus ce que le bloc fait. On l'AUGMENTE au
  -- lieu de la remplacer : ce sont deux faits distincts, pas une correction.
  -- Sans accent ni apostrophe, comme les lignes voisines de 20261020120000.
  v_motif_com constant text :=
    '  -- La FORME ne bouge pas : trois listes VIDES, jamais absentes\.';
  v_neuf_com constant text :=
'  -- La FORME ne bouge pas : trois listes VIDES, jamais absentes.
  -- MAIS CE BLOC N EN VIDE PLUS QUE DEUX (VIT-53). Les activites se
  -- filtrent OBJET PAR OBJET dans leur propre requete, sur la cle que
  -- leur `booking_mode` implique : une organisation qui ne detient que
  -- `rendez_vous` voit ses salles et non ses Moments, et reciproquement.
  -- La regle vit dans reservation_activity_module_key, a UN SEUL endroit,
  -- comme pour les huit portes de 20261206120000.
  -- LES FILES ET LES OFFRES RESTENT SUR `reserver`, et ce n est pas un
  -- oubli : reservation_stock_offers ne porte aucune activite et
  -- reservation_queues.activity_id est NULLABLE, il n y a donc AUCUN mode
  -- a en deriver ; surtout, queue_join et hold_stock_offer exigent
  -- `reserver` dans le catalogue vivant. Leur poser une autre cle
  -- annoncerait une porte que la RPC d en face refuse d ouvrir.';

  v_oid oid;
  v_def text;
  v_hits integer;
begin
  select p.oid, pg_catalog.pg_get_functiondef(p.oid)
    into strict v_oid, v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  -- (a)
  select pg_catalog.count(*)::integer into v_hits
    from pg_catalog.regexp_matches(v_def, v_motif_liste, 'g');
  if v_hits <> 1 then
    raise exception
      'la sous-requete des activites de vitrine_public_state porte % occurrence(s) de son `where` au lieu d''une seule : la fonction a change, cette migration decrirait du code qui n''existe plus',
      v_hits;
  end if;
  v_def := pg_catalog.regexp_replace(v_def, v_motif_liste, v_neuf_liste);

  -- (b)
  select pg_catalog.count(*)::integer into v_hits
    from pg_catalog.regexp_matches(v_def, v_motif_vide, 'g');
  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % affectation(s) de vidage de `v_activites` au lieu d''une seule : le bloc de garde a change',
      v_hits;
  end if;
  v_def := pg_catalog.regexp_replace(v_def, v_motif_vide, '');

  -- (c)
  select pg_catalog.count(*)::integer into v_hits
    from pg_catalog.regexp_matches(v_def, v_motif_com, 'g');
  if v_hits <> 1 then
    raise exception
      'le commentaire du bloc de garde de vitrine_public_state porte % occurrence(s) de son ancre au lieu d''une seule',
      v_hits;
  end if;
  v_def := pg_catalog.regexp_replace(v_def, v_motif_com, v_neuf_com);

  execute v_def;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 2. LE CONTRAT ÉCRIT SUIT LE CODE
--
-- La description publie « les trois listes Réserver sont vides sans
-- `reserver` ». C'est devenu FAUX à la section du dessus, et c'est le texte
-- que lit quiconque interroge le catalogue pour savoir ce que cette RPC
-- promet. L'ancre est comptée comme les trois autres.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_ancre constant text :=
    'les trois listes Réserver sont vides sans `reserver`';
  v_neuf constant text :=
    'les activités Réserver ne sont annoncées que si l''organisation détient '
    'la clé que leur `booking_mode` implique — `reserver` pour un Moment, '
    '`rendez_vous` pour une prise de rendez-vous (VIT-53) —, les files et les '
    'offres sont vides sans `reserver`';
  v_oid oid;
  v_com text;
  v_hits integer;
begin
  select p.oid into strict v_oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  v_com := pg_catalog.obj_description(v_oid, 'pg_proc');
  if v_com is null then
    raise exception
      'vitrine_public_state n''a plus de description : le contrat qu''on s''appretait a corriger a disparu';
  end if;

  select pg_catalog.count(*)::integer into v_hits
    from pg_catalog.regexp_matches(v_com, v_ancre, 'g');
  if v_hits <> 1 then
    raise exception
      'la description de vitrine_public_state porte % occurrence(s) de l''ancre « % » au lieu d''une seule : elle decrirait un contrat qui n''est plus le sien',
      v_hits, v_ancre;
  end if;

  execute pg_catalog.format(
    'comment on function public.%I(%s) is %L',
    'vitrine_public_state',
    pg_catalog.pg_get_function_identity_arguments(v_oid),
    pg_catalog.regexp_replace(v_com, v_ancre, v_neuf));
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 3. L'INVARIANT, À L'INSTANT DE CETTE MIGRATION
--
-- Trois faits, sur l'objet VIVANT et non sur ce fichier. Le pgTAP
-- `vitrine_activites_par_mode.test.sql` les rejoue à CHAQUE passage de CI —
-- une assertion de migration ne se vérifie qu'une fois, et c'est précisément
-- ce qui a laissé vieillir le §9 de 20261020120000.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  -- L'APPEL, ET NON LE NOM. Le commentaire posé en §1 NOMME
  -- `reservation_activity_module_key` pour expliquer la règle : chercher le
  -- simple identifiant rendrait cette garde verte sur un corps dont l'appel
  -- aurait disparu et dont seule la prose subsisterait. C'est exactement le
  -- défaut qu'ADR-168 a laissé passer, et qu'ADR-169 a corrigé — on exige donc
  -- la forme APPELÉE, avec son argument.
  if pg_catalog.strpos(v_def, 'reservation_activity_module_key(a.id)') = 0 then
    raise exception
      'vitrine_public_state ne derive pas la cle du `booking_mode` : le filtre par objet n''a pas ete pose, et une organisation `rendez_vous` seul garderait sa vitrine muette';
  end if;

  if v_def ~ 'v_activites := ''\[\]''::jsonb' then
    raise exception
      'vitrine_public_state vide encore la liste des activites d''un bloc : la garde de bloc n''a pas ete retiree, le filtre par objet ne servirait a rien';
  end if;

  if not (v_def ~ 'org_has_module_access\([^,]+, ''reserver''\)') then
    raise exception
      'vitrine_public_state ne garde plus `reserver` : les files et les offres seraient annoncees a une organisation que queue_join et hold_stock_offer refusent';
  end if;
end
$migration$;
