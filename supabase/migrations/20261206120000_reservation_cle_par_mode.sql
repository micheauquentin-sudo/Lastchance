-- ============================================================
-- RDV-7 — LA CLÉ DE DROIT SUIT LE `booking_mode`, ET NON L'INVERSE
--
-- DÉCISION PRODUIT : le module « Réservation » (clé `rendez_vous`) devient
-- VENDABLE SEUL. Jusqu'ici il se comportait comme un supplément de « Moments »
-- (clé `reserver`) — non par choix, mais parce que la porte de chaque RPC était
-- écrite en dur, et que les deux moitiés du produit n'ont pas été écrites le
-- même jour.
--
-- LA RÈGLE, DÉSORMAIS UNIQUE : c'est le `booking_mode` de l'activité qui
-- désigne la clé exigée.
--
--     booking_mode = 'moment'       → `reserver`
--     booking_mode = 'rendez_vous'  → `rendez_vous`
--
-- ── L'ÉTAT MIXTE QU'ON FERME, MESURÉ SUR LE CATALOGUE VIVANT ──
--
-- À 20261204120000, la base porte TREIZE fonctions dont le corps demande
-- littéralement `reserver` et TROIS qui demandent littéralement `rendez_vous`.
-- Parmi les treize, CINQ opèrent sur une activité — `reserve_slot`,
-- `waitlist_join`, `claim_waitlist_offer`, `reservation_offer_next`,
-- `redeem_invitation` — et exigeaient `reserver` quel que soit le mode de cette
-- activité. Les trois autres (`reserve_table`, `waitlist_join_table`,
-- `reservation_table_freed_targets`) exigeaient `rendez_vous` et refusaient
-- déjà tout mode différent : elles appliquaient la bonne règle, mais chacune
-- pour son compte, et le mot « rendez_vous » y était écrit trois fois.
--
-- HUIT PORTES, DONC, ET UNE SEULE RÈGLE : §1 pose la dérivation, §2 la fait
-- porter par les huit corps VIVANTS.
--
-- ── CE QUI NE BOUGE PAS, ET POURQUOI C'EST ÉCRIT ICI ──
--
-- Les SEPT autres portes de Réserver — `queue_join`, `queue_public_state`,
-- `hold_stock_offer`, `stock_offer_public_state`, `wait_session_open`,
-- `wait_session_use_pause`, `consume_reserver_wait_spin_grant` — gardent
-- `reserver`. Une file d'accueil, une offre de stock ou une session d'attente
-- N'EST PAS une activité : elle n'a pas de `booking_mode`, il n'y a donc rien
-- à en dériver. Leur poser la clé d'un objet qu'elles ne touchent pas serait
-- une règle inventée.
--
-- `vitrine_public_state` garde `reserver` AUSSI, et c'est le seul point de ce
-- lot qui laisse une asymétrie visible : sa garde couvre d'un seul tenant les
-- TROIS listes de sa porte Réserver (`activites`, `files`, `offres`), dont deux
-- portent des objets sans mode. Une organisation qui n'aurait que
-- `rendez_vous` verrait donc sa page publique servie, mais sa liste
-- d'activités vide. Filtrer cette liste activité PAR activité est un changement
-- de la PAGE PUBLIQUE, pas une substitution de garde : il a son propre lot.
-- ÉCRIT ICI plutôt que découvert plus tard — c'est la moitié applicative qui
-- l'atteindra la première.
--
-- ── L'INVARIANT DE 20261020120000 §9 EST REMPLACÉ, PAS CONTOURNÉ ──
--
-- Ce fichier-là comptait « treize fonctions gardent `reserver` », et ce compte
-- était la preuve que ses douze substitutions avaient porté. Cinq de ces treize
-- quittent le compte ici. Son bloc §9 s'exécute AVANT celui-ci et reste donc
-- vrai à son propre instant — mais un invariant qui ne vaut plus après la
-- migration suivante n'est plus un invariant.
--
-- Il est remplacé DEUX FOIS, et délibérément :
--   * §4 ci-dessous le réénonce sous sa forme neuve, à l'instant de cette
--     migration, sur le catalogue vivant ;
--   * `supabase/tests/reservation_cle_par_mode.test.sql` le rejoue à CHAQUE
--     passage de CI — une assertion de migration ne se vérifie qu'une fois,
--     et c'est précisément ce qui a laissé §9 vieillir sans qu'on le sache.
-- Aucun des deux ne compte : les deux NOMMENT. Un compte reste vert quand une
-- fonction en remplace une autre.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. LA RÈGLE, À UN SEUL ENDROIT
--
-- `coalesce(…, 'reserver')` ET NON un retour nul : `org_has_module_access`
-- LÈVE sur un module inconnu, mais `p_module` NUL passe sa liste blanche sans
-- bruit (`null not in (…)` vaut null, jamais vrai) et finit en refus muet. Une
-- activité introuvable rendrait donc « pas le droit » au lieu de dire ce qui
-- s'est passé. Les huit appelants refusent déjà l'activité absente une ligne
-- plus haut ; ce repli est là pour qu'aucun ordre d'évaluation ne puisse
-- transformer un objet manquant en verdict de droit.
--
-- `'reserver'` comme repli, et non `'rendez_vous'` : c'est la valeur par
-- défaut de la colonne (20261106120000), donc le mode de toute activité qui
-- n'a jamais rien choisi.
-- ────────────────────────────────────────────────────────────

create or replace function public.reservation_activity_module_key(
  p_activity_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
              when a.booking_mode = 'rendez_vous' then 'rendez_vous'
              else 'reserver'
            end
       from public.reservation_activities a
      where a.id = p_activity_id),
    'reserver');
$$;

-- FERMÉE À TOUT LE MONDE, comme `reservation_offer_next` : elle n'est appelée
-- que depuis l'intérieur de fonctions `security definer` appartenant au même
-- propriétaire. PostgreSQL accorde l'EXECUTE à `public` par défaut, et
-- `security_acl` le refuse — à raison, celle-ci lisant une table protégée par
-- RLS avec les droits de son propriétaire. `service_role` EST DANS LA LISTE, et
-- ce n'est pas une précaution de style : Supabase pose un `alter default
-- privileges … grant all on functions to anon, authenticated, service_role`, si
-- bien qu'une fonction neuve naît ouverte aux trois. L'oublier laisse
-- l'application appeler directement une règle qui n'a de sens qu'à l'intérieur
-- des huit portes.
revoke all on function public.reservation_activity_module_key(uuid)
  from public, anon, authenticated, service_role;

comment on function public.reservation_activity_module_key(uuid) is
  'La clé de droit qu''exige une activité, dérivée de son `booking_mode` '
  '(RDV-7) : `rendez_vous` pour une prise de rendez-vous, `reserver` pour un '
  'Moment. UNIQUE SOURCE DE CETTE RÈGLE — les huit RPC qui opèrent sur une '
  'activité l''appellent au lieu de nommer un module en dur, si bien que '
  'vendre « Réservation » seul ouvre les salles sans ouvrir les Moments, et '
  'réciproquement. Rend `reserver` pour une activité introuvable : c''est le '
  'défaut de la colonne, et un retour nul se lirait comme un refus muet.';


-- ────────────────────────────────────────────────────────────
-- 2. LES HUIT PORTES D'ACTIVITÉ PASSENT À LA CLÉ DÉRIVÉE
--
-- ── POURQUOI UN PATCH DU CORPS VIVANT, ET NON HUIT `create or replace` ──
--
-- Motif du dépôt, employé sept fois (20260814120000, 20260818120000,
-- 20260901120000, 20260904120000, 20261010120000:756 et 1167, et
-- 20261020120000 §5 — dont ce bloc reprend la forme exacte). La raison y est
-- écrite : recopier huit corps depuis leurs fichiers d'origine, c'est recopier
-- l'état où ils étaient à leur écriture. Ces huit-là ont été redéfinis entre
-- une et trois fois depuis, et cinq d'entre eux distribuent des places sous
-- verrou d'avis. Un seul oubli et la migration REVIENDRAIT EN ARRIÈRE sur un
-- correctif, en silence.
--
-- ── LE MOTIF EST ÉTROIT, ET C'EST VOULU ──
--
-- `v_slot.organization_id` littéralement, et non `[^,]+` : les huit corps
-- portent EXACTEMENT cette expression (mesuré sur le catalogue), tandis que
-- `vitrine_public_state` — qui doit rester sur `reserver`, voir l'en-tête —
-- écrit la sienne sur deux lignes autour de `v_settings.organization_id`. Un
-- motif large l'emporterait avec les autres.
--
-- ── LE COMPTE EST L'ASSERTION ──
--
-- Chaque corps doit porter EXACTEMENT UNE occurrence. Zéro voudrait dire que
-- la fonction a changé et que cette migration décrit du code qui n'existe
-- plus ; deux, qu'une seconde garde est apparue et qu'un choix est dû. Dans les
-- deux cas la migration s'arrête en le nommant. `into strict` porte la seconde
-- assertion, muette celle-là : une surcharge apparue depuis rendrait deux
-- lignes, et `strict` lève au lieu d'en patcher une au hasard.
--
-- ── LE COMMENTAIRE SUIT LE CODE ──
--
-- Sept des huit descriptions NOMMENT le droit exigé entre accents graves. Les
-- laisser telles quelles publierait huit contrats faux le jour même où le code
-- devient juste. Chacune est donc patchée sur une ancre mesurée, et le compte
-- de cette ancre est asserté comme celui du corps. `reserve_table` est la
-- huitième : sa description ne nommait aucun droit, on lui en AJOUTE un — d'où
-- l'ancre nulle, qui vaut « ajouter » et non « remplacer ».
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_motif constant text :=
    'org_has_module_access\(v_slot\.organization_id, ''(?:reserver|rendez_vous)''\)';
  v_neuf constant text :=
    'org_has_module_access(v_slot.organization_id, public.reservation_activity_module_key(v_slot.activity_id))';
  -- LA MÊME PHRASE POUR SIX DES SEPT ANCRES : ce sont six façons d'écrire
  -- « le droit `reserver` », et elles deviennent six fois la même règle.
  v_dit constant text :=
    '`reserver` ou `rendez_vous` selon le `booking_mode` de l''activité';
  r record;
  v_oid oid;
  v_def text;
  v_com text;
  v_hits integer;
  v_faits integer := 0;
begin
  for r in
    select *
      from (values
        -- LES CINQ QUI CHANGENT DE COMPORTEMENT : elles exigeaient `reserver`
        -- sur une salle, qui ne se vend plus avec ce module-là.
        ('reserve_slot',            '`reserver`', v_dit),
        ('waitlist_join',           '`reserver`', v_dit),
        ('claim_waitlist_offer',    '`reserver`', v_dit),
        ('redeem_invitation',       '`reserver`', v_dit),
        ('reservation_offer_next',  '`reserver`', v_dit),
        -- LES TROIS QUI NE CHANGENT PAS DE COMPORTEMENT — elles refusent déjà
        -- tout mode autre que `rendez_vous`, la dérivation y rend donc
        -- toujours `rendez_vous`. Elles passent quand même par la règle
        -- commune : ce qui reste écrit en dur finit toujours par diverger.
        ('reservation_table_freed_targets', '`rendez_vous`', v_dit),
        -- TROIS OCCURRENCES DE `rendez_vous` DANS CETTE DESCRIPTION-LÀ (le
        -- mode, la garde de mode, puis le droit) : l'ancre nomme la troisième
        -- SANS AUCUN ACCENT, pour ne dépendre d'aucun encodage.
        ('waitlist_join_table',
         'est `rendez_vous` et non `vitrine`',
         'est ' || v_dit || ' — donc `rendez_vous` ici — et non `vitrine`'),
        -- L'AJOUT : ancre nulle, la description ne nommait aucun droit.
        ('reserve_table', null, null)
      ) as t(nom, ancre, remplacement)
  loop
    select p.oid, pg_catalog.pg_get_functiondef(p.oid)
      into strict v_oid, v_def
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = r.nom;

    select pg_catalog.count(*)::integer into v_hits
      from pg_catalog.regexp_matches(v_def, v_motif, 'g');

    if v_hits <> 1 then
      raise exception
        '%() porte % occurrence(s) de la garde `org_has_module_access(v_slot.organization_id, …)` au lieu d''une seule : la fonction a changé, cette migration décrirait du code qui n''existe plus',
        r.nom, v_hits;
    end if;

    execute pg_catalog.regexp_replace(v_def, v_motif, v_neuf);

    v_com := pg_catalog.obj_description(v_oid, 'pg_proc');
    if v_com is null then
      raise exception
        '%() n''a plus de description : le contrat qu''on s''apprête à corriger a disparu',
        r.nom;
    end if;

    if r.ancre is null then
      -- L'AJOUT. On vérifie d'abord que la description ne dit RIEN du droit :
      -- sans ce contrôle, une prose déjà corrigée recevrait une seconde phrase.
      if pg_catalog.strpos(v_com, 'RDV-7') > 0 then
        raise exception
          '%() nomme déjà un droit vérifié : cette migration en ajouterait un second',
          r.nom;
      end if;
      v_com := v_com
        || ' Droit vérifié : ' || v_dit
        || ' (RDV-7) — donc `rendez_vous` ici, la fonction n''acceptant que ce mode.';
    else
      select pg_catalog.count(*)::integer into v_hits
        from pg_catalog.regexp_matches(v_com, r.ancre, 'g');
      if v_hits <> 1 then
        raise exception
          'la description de %() porte % occurrence(s) de l''ancre « % » au lieu d''une seule : elle décrirait un contrat qui n''est plus le sien',
          r.nom, v_hits, r.ancre;
      end if;
      v_com := pg_catalog.regexp_replace(v_com, r.ancre, r.remplacement);
    end if;

    execute pg_catalog.format(
      'comment on function public.%I(%s) is %L',
      r.nom,
      pg_catalog.pg_get_function_identity_arguments(v_oid),
      v_com);

    v_faits := v_faits + 1;
  end loop;

  if v_faits <> 8 then
    raise exception
      '% porte(s) traitée(s) au lieu des huit attendues', v_faits;
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 3. LE CONTRÔLE FINAL, SUR LE CATALOGUE VIVANT
--
-- Les substitutions de §2 sont TEXTUELLES : ce qui prouve qu'elles ont porté,
-- ce n'est pas qu'elles n'ont pas levé, c'est l'état du catalogue après coup.
-- Sans ce bloc, un motif qui aurait cessé de correspondre laisserait huit
-- portes sur leur clé fixe et la migration se lirait comme un succès.
--
-- ON NOMME, ON NE COMPTE PAS. C'est la leçon de §9 de 20261020120000 : un
-- compte de treize reste vert le jour où une fonction sort de l'ensemble et
-- qu'une autre y entre. `string_agg` trié rend l'ensemble lui-même, et
-- l'égalité dit LAQUELLE manque.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_derivees text;
  v_rdv      text;
  v_reserver text;
begin
  -- LES HUIT QUI DÉRIVENT. Cherchées sur l'APPEL COMPLET et non sur le nom de
  -- la fonction : ce dernier apparaît aussi dans la description qu'on vient
  -- d'écrire, et `prosrc` porte les commentaires.
  select coalesce(
           pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
    into v_derivees
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~
         'org_has_module_access\(v_slot\.organization_id, public\.reservation_activity_module_key\(v_slot\.activity_id\)\)';
  if v_derivees <> 'claim_waitlist_offer, redeem_invitation, '
                || 'reservation_offer_next, reservation_table_freed_targets, '
                || 'reserve_slot, reserve_table, waitlist_join, '
                || 'waitlist_join_table' then
    raise exception
      'les portes qui dérivent leur clé du `booking_mode` sont « % » au lieu des huit attendues',
      v_derivees;
  end if;

  -- PLUS AUCUNE CLÉ `rendez_vous` EN DUR. C'est la moitié qu'on oublie : la
  -- règle ne tient que si les DEUX sens y passent.
  select coalesce(
           pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
    into v_rdv
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ 'org_has_module_access\([^,]+, ''rendez_vous''\)';
  if v_rdv <> '' then
    raise exception
      '« % » demande(nt) encore `rendez_vous` en dur : une salle y resterait fermée à qui a pourtant acheté le module',
      v_rdv;
  end if;

  -- ET CE QUI GARDE ENCORE `reserver`, NOMMÉMENT — les sept portes sans
  -- activité, plus `vitrine_public_state` dont l'en-tête explique le cas.
  select coalesce(
           pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
    into v_reserver
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ 'org_has_module_access\([^,]+, ''reserver''\)';
  if v_reserver <> 'consume_reserver_wait_spin_grant, hold_stock_offer, '
                || 'queue_join, queue_public_state, stock_offer_public_state, '
                || 'vitrine_public_state, wait_session_open, '
                || 'wait_session_use_pause' then
    raise exception
      'les portes qui gardent `reserver` en dur sont « % » au lieu des huit attendues : une activité y serait restée sur la clé fixe, ou une porte sans activité l''aurait perdue',
      v_reserver;
  end if;
end
$migration$;
