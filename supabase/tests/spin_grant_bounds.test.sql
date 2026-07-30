-- ============================================================
-- BORNE 2 — invariant TRANSVERSAL des quatre tours de roue offerts
--
-- La règle (20260725200000_loyalty_spin_bounds.sql) : « un tour offert ne tire
-- JAMAIS un lot à stock illimité ». La roue PUBLIQUE accepte l'illimité parce
-- qu'elle est bornée ailleurs (play_limit, dates de campagne, Turnstile, seaux
-- de spin) ; le tour offert n'a AUCUNE de ces bornes. Il exige donc un stock
-- RÉEL, dont le décrément atomique compte ce qu'il peut coûter. Sans elle :
-- N identités fabriquées = N codes de retrait réels, sans plafond.
--
-- POURQUOI CE FICHIER EXISTE : la borne était PRÉSENTE dans la fidélité et le
-- parrainage, ABSENTE du calendrier et du quiz — écrits après la migration qui
-- l'institue, sans que leurs en-têtes ne la mentionnent, ni pour l'adopter ni
-- pour s'en écarter. L'écart a vécu deux mois parce qu'aucun test ne portait
-- l'invariant : chaque module testait le sien, personne ne les comparait.
--
-- Ce test est donc TRANSVERSAL par construction. Il lit `pg_proc` — le
-- catalogue VIVANT — plutôt que les fichiers de migration : une fonction
-- redéfinie plus tard rendrait toute lecture de l'archive fausse, ce qui est
-- très exactement l'erreur qui a produit deux défauts sur ce projet.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── L'invariant, sur les QUATRE modules à la fois ────────────
-- `stock > 0` est NULL quand `stock is null` : écrire le filtre ainsi EXCLUT
-- les lots illimités. Le filtre inclusif porterait `p.stock is null or`.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_loyalty_spin_grant',
        'consume_referral_spin_grant',
        'consume_calendar_spin_grant',
        'consume_quiz_spin_grant'
      )
      and p.prosrc like '%stock is null or p.stock > 0%'),
  0,
  'AUCUN des quatre tours de roue offerts ne rend tirable un lot à stock illimité (BORNE 2)'
);

-- Contrôle de portée : les quatre fonctions existent bien. Sans lui,
-- l'assertion ci-dessus serait vraie sur un ensemble VIDE — un test vert qui
-- ne teste rien, exactement le piège que ce projet a déjà rencontré.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'consume_loyalty_spin_grant',
        'consume_referral_spin_grant',
        'consume_calendar_spin_grant',
        'consume_quiz_spin_grant'
      )),
  4,
  'les quatre fonctions existent — l''invariant ci-dessus porte sur un ensemble non vide'
);

-- La preuve COMPORTEMENTALE vit là où les fixtures existent déjà :
--   · calendar.test.sql  — une roue tout illimité rend no_prize, jeton gardé ;
--   · referral.test.sql  — même invariant sur le parrainage.
-- Ce fichier-ci porte l invariant TRANSVERSAL, celui que personne ne tenait :
-- chaque module testait le sien, aucun ne les comparait — et c est très
-- exactement dans cet angle mort que la borne a manqué deux mois.

select * from finish();
rollback;
