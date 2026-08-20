-- ============================================================
-- BORNE 2 — invariant TRANSVERSAL de TOUS les tours de roue offerts
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

-- ── L'invariant, sur TOUS les tours offerts à la fois ────────
--
-- LA RÈGLE REMPLACE LA LISTE, et c'est le remède que ce dépôt a déjà appliqué
-- aux 110 tables de `security_acl.test.sql`. Ce fichier énumérait ses quatre
-- modules À LA MAIN — c'est-à-dire qu'il reproduisait, en plus petit, le défaut
-- dont il est né : le CINQUIÈME tour offert (Pause Chance de RES-4,
-- 20261006120000) serait entré sans que personne n'ait à penser à l'ajouter ici,
-- exactement comme le calendrier et le quiz étaient entrés sans la borne.
-- Désormais, toute fonction nommée `consume_<module>_spin_grant` est couverte le
-- jour de sa création.
--
-- `stock > 0` est NULL quand `stock is null` : écrire le filtre ainsi EXCLUT
-- les lots illimités. Le filtre inclusif porterait `p.stock is null or`, et
-- l'échec ci-dessous NOMME les fautives d'un coup.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^consume_[a-z_]+_spin_grant$'
      and p.prosrc like '%stock is null or p.stock > 0%'),
  '',
  'AUCUN tour de roue offert ne rend tirable un lot à stock illimité (BORNE 2)'
);

-- Contrôle de portée : les fonctions existent bien. Sans lui, l'assertion
-- ci-dessus serait vraie sur un ensemble VIDE — un test vert qui ne teste rien,
-- exactement le piège que ce projet a déjà rencontré. Le plancher suit le
-- nombre de modules livrés : cinq aujourd'hui (fidélité, parrainage,
-- calendrier, quiz, attente active).
select cmp_ok(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^consume_[a-z_]+_spin_grant$'),
  '>=', 5,
  'les cinq fonctions existent — l''invariant ci-dessus porte sur un ensemble non vide'
);

-- La preuve COMPORTEMENTALE vit là où les fixtures existent déjà :
--   · calendar.test.sql          — une roue tout illimité rend no_prize, jeton gardé ;
--   · referral.test.sql          — même invariant sur le parrainage ;
--   · reserver_attente.test.sql  — même invariant sur la Pause Chance.
-- Ce fichier-ci porte l invariant TRANSVERSAL, celui que personne ne tenait :
-- chaque module testait le sien, aucun ne les comparait — et c est très
-- exactement dans cet angle mort que la borne a manqué deux mois.

select * from finish();
rollback;
