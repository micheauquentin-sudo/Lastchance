-- ============================================================
-- GARDE DE PARITÉ — org_has_active_access (SQL) vs hasActiveAccess (TS)
--
-- La migration 20260905120000 porte en SQL une règle d'accès qui existait
-- déjà en TypeScript (src/lib/subscription.ts:70-82). LE DANGER DE CE GESTE
-- N'EST PAS D'ÉCRIRE UN BUG, C'EST D'ÉCRIRE UNE SECONDE SOURCE DE VÉRITÉ :
-- deux prédicats qui se ressemblent aujourd'hui et divergent dans six mois,
-- au moment où quelqu'un corrigera l'un des deux. C'est la classe de dette que
-- ce dépôt paie déjà ailleurs.
--
-- ── COMMENT LA PARITÉ EST TENUE, ET POURQUOI CE N'EST PAS DEUX COPIES ──
--
-- La matrice ci-dessous est la SOURCE UNIQUE. Elle est jouée deux fois :
--   * ici, contre `public.org_has_active_access` (Postgres réel) ;
--   * dans src/lib/subscription-parity.test.ts, qui LIT CE FICHIER, parse ce
--     même bloc et rejoue chaque ligne contre `hasActiveAccess`.
-- Il n'existe donc pas de second exemplaire de la matrice à tenir à jour :
-- ajouter un cas ici l'ajoute mécaniquement des deux côtés, et changer le
-- format du bloc fait échouer le parseur plutôt que de le rendre silencieux.
--
-- ── CE QUE CETTE GARDE PROUVE ──
--   Que les deux implémentations rendent le MÊME verdict sur les 16 cas
--   énumérés, y compris aux deux bornes qui décident réellement de quelque
--   chose (13,9 j et 14,1 j après un impayé).
--
-- ── CE QU'ELLE NE PROUVE PAS, et il faut le lire avant de s'y fier ──
--   Rien sur un cas que personne n'a énuméré. Ce n'est pas une preuve
--   d'équivalence des deux fonctions : c'est une preuve d'accord sur un
--   échantillon choisi à la main. Une divergence introduite sur une
--   combinaison absente de la matrice (un statut neuf, une colonne neuve)
--   passerait les deux suites sans un rouge. Le remède, le jour où un statut
--   s'ajoute, est d'ajouter sa ligne ICI — pas de faire confiance au vert.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- T0 : instant de référence, lu AUSSI par le parseur TypeScript (il extrait le
-- littéral ci-dessous). Les décalages de la matrice sont en jours par rapport
-- à lui. Un instant FIXE et non `now()` : les deux côtés doivent partir du
-- même point, sinon la comparaison mesure la latence entre eux.
create temporary table tap_t0 (t timestamptz) on commit drop;
insert into tap_t0 values (timestamptz '2026-06-15 12:00:00+00');

create temporary table tap_parite (
  rang        serial,
  cas         text,
  sub_status  text,
  trial_days  numeric,
  pastdue_days numeric,
  comp        boolean,
  comp_days   numeric,
  attendu     boolean
) on commit drop;

-- ┌──────── MATRICE DE PARITÉ — SOURCE UNIQUE — NE PAS DUPLIQUER ────────
-- Colonnes : cas | subscription_status | trial_ends_at (jours vs T0)
--          | past_due_since (jours vs T0, null permis) | comp_access
--          | comp_access_until (jours vs T0, null permis) | verdict attendu
insert into tap_parite (cas, sub_status, trial_days, pastdue_days, comp, comp_days, attendu) values
  ('essai en cours',                          'trialing', 5,    null,  false, null, true),
  ('essai expire d hier',                     'trialing', -1,   null,  false, null, false),
  ('essai expire dans la grace de 3 jours',   'trialing', -2,   null,  false, null, false),
  ('abonnement actif',                        'active',   -365, null,  false, null, true),
  ('impaye dans les 14 jours',                'past_due', -365, -13.9, false, null, true),
  ('impaye au-dela de 14 jours',              'past_due', -365, -14.1, false, null, false),
  ('impaye sans date de bascule',             'past_due', -365, null,  false, null, true),
  ('resilie',                                 'canceled', -365, null,  false, null, false),
  ('jamais abonne (inactive)',                'inactive', -365, null,  false, null, false),
  ('resilie mais essai encore futur',         'canceled', 5,    null,  false, null, false),
  ('acces offert sans echeance',              'canceled', -365, null,  true,  null, true),
  ('acces offert non echu',                   'canceled', -365, null,  true,  10,   true),
  ('acces offert echu',                       'canceled', -365, null,  true,  -1,   false),
  ('acces offert echu mais abonnement actif', 'active',   -365, null,  true,  -1,   true),
  ('acces offert echu mais essai en cours',   'trialing', 5,    null,  true,  -1,   true),
  ('impaye au-dela mais acces offert',        'past_due', -365, -20,   true,  null, true);
-- └──────── FIN MATRICE ────────

-- Une organisation par cas. Le slug doit tenir dans ^[a-z0-9-]{2,48}$.
insert into public.organizations (
  id, name, slug, subscription_status, trial_ends_at,
  past_due_since, comp_access, comp_access_until
)
select
  ('cf000000-0000-4000-8000-' || pg_catalog.lpad(p.rang::text, 12, '0'))::uuid,
  'Parite ' || p.rang,
  'tap-parite-' || p.rang,
  p.sub_status,
  (select t from tap_t0) + pg_catalog.make_interval(secs => (p.trial_days * 86400)::double precision),
  case when p.pastdue_days is null then null
       else (select t from tap_t0) + pg_catalog.make_interval(secs => (p.pastdue_days * 86400)::double precision) end,
  p.comp,
  case when p.comp_days is null then null
       else (select t from tap_t0) + pg_catalog.make_interval(secs => (p.comp_days * 86400)::double precision) end
from tap_parite p;

-- ── L'assertion, une par ligne de matrice ───────────────────
select is(
  public.org_has_active_access(
    ('cf000000-0000-4000-8000-' || pg_catalog.lpad(p.rang::text, 12, '0'))::uuid,
    (select t from tap_t0)
  ),
  p.attendu,
  'parite [' || p.rang || '] ' || p.cas
)
from tap_parite p
order by p.rang;

-- ── Le cas que la matrice ne peut pas porter : l'organisation INCONNUE ──
-- Il ne rentre pas dans la matrice (il n'a pas de ligne à insérer), et c'est
-- précisément celui qui fait échouer OUVERT si la fonction rend null : en
-- plpgsql, `if not null then raise` ne déclenche aucune branche. Le contrôle
-- porte donc sur la valeur exacte, pas sur sa véracité.
select is(
  public.org_has_active_access('cf000000-0000-4000-8000-ffffffffffff'::uuid, (select t from tap_t0)),
  false,
  'organisation inconnue : false, et non null — un null ferait echouer la garde OUVERTE'
);

-- ── LE CAS QUE LA MATRICE NE PEUT PAS PORTER : LE CHANGEMENT D'HEURE ──
--
-- Il est HORS matrice pour une raison de structure et non de commodité : la
-- matrice n'a pas de colonne « fuseau », et elle joue les deux côtés dans le
-- même — donc le seul cas où les deux implémentations diffèrent est
-- précisément celui qu'elle ne sait pas exprimer. Elle était vraie et aveugle
-- (finding F7).
--
-- L'ÉCART, EN UN MOT : `past_due_since + interval '14 days'` résout son champ
-- « jours » dans le FUSEAU DE SESSION ; `src/lib/subscription.ts:88-90` ajoute
-- `14 * 86_400_000` millisecondes, une durée ABSOLUE. Sous Europe/Paris, une
-- grâce ouverte le 20 mars traverse le passage à l'heure d'été du 29 mars
-- (02:00 → 03:00) et se ferme UNE HEURE PLUS TÔT que côté TypeScript.
--
-- Les trois valeurs, calculées à la main et non copiées d'une exécution :
--   past_due_since            = 2026-03-20 12:00Z  (13:00 CET)
--   + interval '14 days'      → 2026-04-03 13:00 CEST = 11:00Z   ← l'ancien
--   + interval '336 hours'    → 2026-04-03 12:00Z                ← le corrigé
--   + 14 * 86 400 000 ms (TS) → 2026-04-03 12:00Z                ← la référence
-- À 11:30Z, l'ancien SQL a coupé, le TypeScript accorde encore. L'assertion
-- porte donc sur le verdict du TypeScript, pas sur celui d'hier.
set local timezone = 'Europe/Paris';

insert into public.organizations (
  id, name, slug, subscription_status, trial_ends_at, past_due_since
) values (
  'cf000000-0000-4000-8000-0000000dd001', 'Parite heure ete', 'tap-parite-dst',
  'past_due', timestamptz '2025-01-01 00:00:00+00', timestamptz '2026-03-20 12:00:00+00'
);

select is(
  public.org_has_active_access(
    'cf000000-0000-4000-8000-0000000dd001'::uuid,
    timestamptz '2026-04-03 11:30:00+00'
  ),
  true,
  'grace d impaye : 336 h absolues, comme le TypeScript — « 14 days » aurait '
  'coupe une heure trop tot sous Europe/Paris apres le passage a l heure d ete'
);

-- Le témoin qui rend l'assertion précédente lisible : la grâce se ferme bel et
-- bien, et au bon moment. Sans lui, « true » serait aussi le verdict d'une
-- fonction qui accorde tout, et le rouge d'une régression pointerait un seul
-- côté de la borne.
select is(
  public.org_has_active_access(
    'cf000000-0000-4000-8000-0000000dd001'::uuid,
    timestamptz '2026-04-03 12:30:00+00'
  ),
  false,
  'et une heure apres la borne absolue, la grace est bien fermee'
);
reset timezone;

-- ── La matrice est-elle bien jouée ? ────────────────────────
-- Sans ceci, un bloc vidé par erreur rendrait « 0 assertion, 0 rouge », qui se
-- lit exactement comme un succès.
select is((select pg_catalog.count(*) from tap_parite), 16::bigint,
  '16 cas de parite joues — un bloc vide rendrait 0 rouge et se lirait comme un succes');

select * from finish();
rollback;
