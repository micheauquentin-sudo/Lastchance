-- ============================================================
-- 20260828120000 — les deux trouvailles ÉLEVÉ du canal SMS
--
-- Plan CHIFFRÉ, et non `no_plan()` : les deux contre-contrôles de ce fichier
-- (§4, « la fonction est idempotente et non inerte » ; §3, « la branche
-- déclarée n'a pas bougé ») vivent au milieu. Avec `no_plan()`, un fichier qui
-- meurt avant eux rendrait exactement le même résultat qu'un fichier sain —
-- « tout est vert ». Le plan chiffré rend « planned 38 but ran M ».
--
-- Ce que ce fichier démontre :
--
--   1. UNE SANCTION NE SE LÈVE PAS PAR UN CLIC DE CELUI QU'ELLE VISE (§1).
--      `request_sms_sender` remettait à `pending` toute ligne non `declared`,
--      donc aussi une ligne `suspended` — la sanction cessait d'exister comme
--      état, son motif quittait l'écran du propriétaire, et la demande
--      retombait dans la file de déclaration de la plateforme. Le retrait est
--      couvert par la même exclusion : `retired_at = null` était
--      inconditionnel, et une suspension ne doit pas se rouvrir à moitié.
--
--   2. UN REFUS, LUI, SE REDEMANDE (§2). C'est une DÉCISION, pas un reste :
--      un verdict de registre porte sur un dossier que le commerçant peut
--      compléter ; une suspension est une sanction. L'assertion la nomme, pour
--      que le jour où quelqu'un « uniformisera » les deux, un test l'arrête.
--
--   3. UN PAIEMENT NE SE CRÉDITE QU'UNE FOIS (§4), et LE SOLDE le prouve —
--      pas un compte de lignes : au lot précédent, une assertion de comptage
--      est restée VERTE sous sabotage. Le double crédit est irrattrapable
--      (grand livre append-only, aucun débit administratif), et il n'exige
--      aucun attaquant : une coupure de pooler après le commit suffit.
--
--   4. LA GARANTIE EST UN INDEX, PAS UNE GARDE APPLICATIVE (§4, `throws_ok`) :
--      un écrivain qui contourne la RPC est arrêté lui aussi.
--
-- ⚠️ CE QUE CE FICHIER NE PEUT PAS PROUVER : la concurrence réelle. pgTAP joue
-- tout dans UNE transaction. Ce qui est prouvé ici, c'est l'IMPOSSIBILITÉ du
-- doublon (l'index) et le comportement du rejeu SÉQUENTIEL — c'est-à-dire
-- exactement la forme qu'a le rejeu de Stripe, qui arrive « dans les minutes
-- qui suivent » et non simultanément. Une assertion qui prétendrait tester
-- deux sessions concurrentes mentirait.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('f2000000-0000-4000-8000-000000000001', 'Org Suspension', 'tap-smsfind-1'),
  ('f2000000-0000-4000-8000-000000000002', 'Org Refus',      'tap-smsfind-2'),
  ('f2000000-0000-4000-8000-000000000003', 'Org Déclarée',   'tap-smsfind-3'),
  ('f2000000-0000-4000-8000-000000000004', 'Org Achat',      'tap-smsfind-4');

-- ══ 1. ÉLEVÉ 1 — la suspension ne s'efface pas ════════════
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE')),
  null, 'le commerçant demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE', 'AF2M-2026-00100')),
  true, 'la plateforme le déclare au registre AF2M');
select is(
  (select public.sms_sender_for_send('f2000000-0000-4000-8000-000000000001')),
  'BOULANGE', 'le canal est ouvert');

-- La plainte, et la sanction.
select is(
  (select public.set_sms_sender_status(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE',
     'suspended', 'plainte AF2M 2026-11')),
  true, 'une plainte AF2M fait suspendre l''expéditeur');
select is(
  (select public.sms_sender_for_send('f2000000-0000-4000-8000-000000000001')),
  null, 'le canal se ferme');

-- LE GESTE DU DÉFAUT : le propriétaire ouvre son écran, retape le même nom,
-- clique.
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE')),
  null,
  'le propriétaire retape le même nom et clique : l''appel rend bien l''identifiant de la ligne, il ne lève pas');
select is(
  (select status from public.sms_senders
    where organization_id = 'f2000000-0000-4000-8000-000000000001'
      and sender_id = 'BOULANGE'),
  'suspended',
  'LE POINT : la suspension EXISTE TOUJOURS — une décision de la plateforme ne se lève pas par un clic de celui qu''elle vise');
select is(
  (select status_reason from public.sms_senders
    where organization_id = 'f2000000-0000-4000-8000-000000000001'
      and sender_id = 'BOULANGE'),
  'plainte AF2M 2026-11',
  'et le MOTIF reste écrit sur la ligne. ⚠️ CETTE ASSERTION N''EST PAS LE DISCRIMINANT : request_sms_sender n''a jamais touché status_reason, elle reste donc VERTE sous sabotage — mesuré, pas supposé. Ce sont `status` et `retired_at` qui rougissent. Elle est gardée parce que « le correctif n''efface pas le motif non plus » est une propriété vraie, pas parce qu''elle prouve le défaut');
select is(
  (select public.sms_sender_for_send('f2000000-0000-4000-8000-000000000001')),
  null, 'le canal reste fermé');

-- Le demi-trou : une ligne suspendue PUIS retirée. `retired_at = null` est
-- inconditionnel dans l'UPDATE — ne corriger que `status` aurait rouvert la
-- ligne à moitié. C'est la LIGNE entière qui est exclue.
select is(
  (select public.set_sms_sender_status(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE', 'retired', 'fermeture')),
  true, 'la ligne suspendue est ensuite retirée');
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000001', 'BOULANGE')),
  null, 'le propriétaire redemande encore');
select ok(
  (select retired_at is not null from public.sms_senders
    where organization_id = 'f2000000-0000-4000-8000-000000000001'
      and sender_id = 'BOULANGE'),
  'le RETRAIT n''est pas défait non plus : `retired_at = null` est inconditionnel dans l''UPDATE, c''est la ligne entière qui doit être exclue');
select is(
  (select status from public.sms_senders
    where organization_id = 'f2000000-0000-4000-8000-000000000001'
      and sender_id = 'BOULANGE'),
  'suspended', 'et le statut reste suspendu');

-- ══ 2. Un REFUS, lui, se redemande — décision tranchée ═════
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000002', 'CAVEDUCOIN')),
  null, 'une autre organisation demande son expéditeur');
select is(
  (select public.set_sms_sender_status(
     'f2000000-0000-4000-8000-000000000002', 'CAVEDUCOIN',
     'rejected', 'nom non conforme au Kbis')),
  true, 'le registre le REFUSE');
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000002', 'CAVEDUCOIN')),
  null, 'le commerçant réunit ses pièces et redemande le même nom');
select is(
  (select status from public.sms_senders
    where organization_id = 'f2000000-0000-4000-8000-000000000002'
      and sender_id = 'CAVEDUCOIN'),
  'pending',
  'DÉCISION TRANCHÉE : un expéditeur REFUSÉ repasse en attente — un verdict de registre porte sur un DOSSIER que le commerçant peut compléter, là où une suspension est une sanction. Les deux se ressemblent et ne doivent PAS être uniformisés');
select is(
  (select public.sms_sender_for_send('f2000000-0000-4000-8000-000000000002')),
  null,
  'et rien n''est ouvert pour autant : seule declare_sms_sender, qui exige la référence de registre, rouvre le canal');

-- ══ 3. Contre-contrôle : la branche `declared` n'a pas bougé ══
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000003', 'PIZZAIOLO')),
  null, 'une troisième organisation demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f2000000-0000-4000-8000-000000000003', 'PIZZAIOLO', 'AF2M-2026-00101')),
  true, 'et l''obtient');
select isnt(
  (select public.request_sms_sender(
     'f2000000-0000-4000-8000-000000000003', 'PIZZAIOLO')),
  null, 'un double clic sur un expéditeur DÉCLARÉ');
select is(
  (select public.sms_sender_for_send('f2000000-0000-4000-8000-000000000003')),
  'PIZZAIOLO',
  'ne perd pas la déclaration acquise : la correction n''a pas déplacé la branche déclarée');

-- ══ 4. ÉLEVÉ 2 — un paiement ne se crédite qu'UNE fois ════
--
-- L'achat, et son identifiant mis de côté : c'est lui que le rejeu doit
-- rendre. Le comparer prouve qu'on rend LE mouvement existant, et pas
-- seulement qu'on ne lève pas.
select set_config(
  'tap.first_purchase',
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 2000, 'purchase', 45000,
     'stripe:cs_double'))::text,
  true);

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000004'),
  2000, 'l''achat de 2 000 SMS crédite le solde');

-- LE REJEU. Le scénario n'a besoin d'aucun attaquant : la RPC commit, le
-- pooler coupe, le handler lit une erreur, relâche sa prise, répond 500, et
-- Stripe rejoue sous un AUTRE identifiant d'événement.
select is(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 2000, 'purchase', 45000,
     'stripe:cs_double')),
  current_setting('tap.first_purchase')::uuid,
  'LE REJEU du même paiement rend LE MÊME mouvement — l''idempotence descend au grand livre : elle ne lève pas, et l''appelant n''a rien à démêler');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000004'),
  2000,
  'LE SOLDE LE PROUVE : toujours 2 000 après le rejeu. C''est le solde qui est relu, et non un compte de lignes — un comptage peut rester vert sous sabotage');

-- CONTRE-CONTRÔLE : idempotente, pas inerte.
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 500, 'purchase', 45000,
     'stripe:cs_other')),
  null, 'un SECOND paiement, sous une AUTRE référence, est crédité normalement');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000004'),
  2500,
  'et le solde monte à 2 500 : la fonction est devenue IDEMPOTENTE, pas INERTE — c''est ce que ce contre-contrôle existe pour dire');

-- L'index est partiel sur `purchase` À DESSEIN : un ajustement est un geste
-- manuel répétable, deux gestes successifs sous le même libellé sont deux
-- gestes et non un doublon.
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 10, 'adjustment', null,
     'geste commercial')),
  null, 'un geste commercial s''enregistre');
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 10, 'adjustment', null,
     'geste commercial')),
  null, 'le MÊME libellé, une seconde fois, s''enregistre AUSSI');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000004'),
  2520,
  'et le solde monte deux fois : l''index ne touche pas `adjustment`, parce qu''une décision humaine répétée n''est pas un rejeu');

-- LA GARANTIE EST L'INDEX, PAS LA FONCTION.
select throws_ok(
  $$ insert into public.sms_credit_entries
       (organization_id, delta_units, reason, unit_cost_micros, currency, reference)
     values ('f2000000-0000-4000-8000-000000000004', 2000, 'purchase',
             45000, 'EUR', 'stripe:cs_double') $$,
  '23505', null,
  'même un écrivain qui CONTOURNE la RPC ne peut pas doubler un achat : contrainte, pas garde applicative');

-- LE RÉSIDU, écrit plutôt que tu.
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 1, 'purchase', 45000, null)),
  null, 'un achat SANS référence s''enregistre');
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000004', 1, 'purchase', 45000, null)),
  null, 'et un second, identique, s''enregistre aussi');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000004'),
  2522,
  'RÉSIDU ASSUMÉ : un achat sans référence n''a aucune clé d''idempotence et reste dédoublable — un achat sans référence est un achat dont on ne peut pas dire s''il est le même que le précédent. Les deux appelants applicatifs en fournissent une');

-- ══ 5. Isolation multi-tenant ══════════════════════════════
select isnt(
  (select public.credit_sms_balance(
     'f2000000-0000-4000-8000-000000000003', 2000, 'purchase', 45000,
     'stripe:cs_double')),
  null, 'la MÊME référence de paiement, chez une AUTRE organisation, crédite bien');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f2000000-0000-4000-8000-000000000003'),
  2000,
  'l''index est scopé par organisation : deux commerçants ne se bloquent pas l''un l''autre');

-- ══ 6. ACL — les revoke/grant reposés par la migration ═════
--
-- Les deux signatures sont INCHANGÉES, et c'était une contrainte du chantier :
-- ces assertions LÈVENT si une signature change, ce qui tuerait le fichier
-- entier avant `finish()` — sans plan et sans compte.
select ok(
  not has_function_privilege('authenticated', 'public.request_sms_sender(uuid,text)', 'EXECUTE'),
  'un commerçant connecté n''appelle pas request_sms_sender directement : la RPC reste service_role après redéfinition');
select ok(
  not has_function_privilege('authenticated', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'ni credit_sms_balance — il ne se crédite pas lui-même');

select * from finish();
rollback;
