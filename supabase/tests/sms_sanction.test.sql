-- ============================================================
-- 20260829120000 — la sanction lie la DÉCLARATION, et le crédit dit ce qu'il a fait
--
-- Plan CHIFFRÉ, et non `no_plan()` : les deux contre-contrôles de ce fichier
-- (§3, « sans sanction la déclaration passe » ; §5, « deux références
-- différentes créditent DEUX fois ») vivent au milieu et à la fin. Avec
-- `no_plan()`, un fichier qui meurt avant eux rendrait exactement le même
-- résultat qu'un fichier sain — « tout est vert ». Le plan chiffré rend
-- « planned 76 but ran M ».
--
-- Ce que ce fichier démontre :
--
--   1. UNE SANCTION PORTE SUR LE DROIT D'ÉMETTRE, PAS SUR UN NOM (§1). Le
--      correctif du tour précédent protégeait LA LIGNE : suspendu sur MONRESTO,
--      le propriétaire n'avait qu'à demander MONRESTO2. La garde est donc
--      testée sur un AUTRE nom que le nom sanctionné — c'est cette assertion-là
--      qui distingue le correctif de son prédécesseur, et elle est nommée.
--
--   2. LE RETRAIT N'EST PAS UNE LEVÉE (§2). « Je retire l'expéditeur sanctionné
--      et j'en déclare un autre » est la forme la plus naturelle et la plus
--      innocente du contournement. C'est aussi celle qu'une garde filtrant
--      `retired_at is null` aurait laissée passer.
--
--   3. LA SORTIE EXISTE (§4) — sans quoi la garde serait une IMPASSE, et le
--      seul recours un UPDATE à la main en production. Elle est éprouvée dans
--      ses DEUX formes : sur le nom sanctionné lui-même, et sur un nom
--      différent après résolution (c'est-à-dire le scénario (a) enfin dénoué).
--
--   4. LE CRÉDIT DIT « CRÉÉ » OU « DÉJÀ CRÉDITÉ » (§5), et LE SOLDE le prouve —
--      pas un compte de lignes : au tour précédent, une assertion de comptage
--      est restée VERTE sous sabotage. Sans ce drapeau, le back-office écrivait
--      « N unités accordées » dans un audit IMPURGEABLE pour un crédit que
--      l'index avait avalé.
--
--   5. UN RENOMMAGE NE LÈVE PAS UNE SANCTION (§8, 20260830120000). Le trigger
--      `sms_senders_declaration_follows_name` ramenait l'état à `pending` sur
--      TOUT changement de nom, `suspended` compris. Les deux cas sont testés
--      ENSEMBLE parce qu'affiner le trigger et le DÉSARMER rendent le même vert
--      sur la moitié « suspended » : seule la moitié « declared » les sépare.
--
-- ⚠️ CE QUE CE FICHIER NE PEUT PAS PROUVER : la concurrence réelle. pgTAP joue
-- tout dans UNE transaction. Ce qui est prouvé ici, c'est le comportement du
-- rejeu SÉQUENTIEL — exactement la forme qu'a le rejeu de Stripe, qui arrive
-- « dans les minutes qui suivent » et non simultanément. Une assertion qui
-- prétendrait tester deux sessions concurrentes mentirait.
--
-- ⚠️ CHAQUE APPEL À `credit_sms_balance` EST CAPTURÉ DANS UNE TABLE TEMPORAIRE,
-- et ce n'est pas un ornement : la fonction rend deux colonnes, et l'appeler
-- deux fois pour en lire deux — une fois `entry_id`, une fois `created` — ferait
-- du SECOND appel un rejeu. Le test mesurerait alors son propre effet de bord et
-- rendrait `created = false` en croyant lire le premier appel.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('f3000000-0000-4000-8000-000000000001', 'Org Sanction', 'tap-smssanc-1'),
  ('f3000000-0000-4000-8000-000000000002', 'Org Sortie',   'tap-smssanc-2'),
  ('f3000000-0000-4000-8000-000000000003', 'Org Témoin',   'tap-smssanc-3'),
  ('f3000000-0000-4000-8000-000000000004', 'Org Crédit',   'tap-smssanc-4'),
  ('f3000000-0000-4000-8000-000000000005', 'Org Enseigne', 'tap-smssanc-5'),
  ('f3000000-0000-4000-8000-000000000006', 'Org Renommage suspendu', 'tap-smssanc-6'),
  ('f3000000-0000-4000-8000-000000000007', 'Org Renommage déclaré',  'tap-smssanc-7');

-- ══ 1. LA SANCTION PORTE SUR L'ORGANISATION ═══════════════
--
-- CONTRÔLE NÉGATIF D'ABORD : on établit que le canal est bien OUVERT avant la
-- sanction. Sans ces trois assertions, le « refusé » d'après serait vrai même
-- si `declare_sms_sender` refusait depuis toujours, et le fichier passerait
-- sans rien garder.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000001', 'MONRESTO')),
  null, 'le commerçant demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000001', 'MONRESTO', 'AF2M-2026-00300')),
  true, 'la plateforme le déclare au registre AF2M');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000001')),
  'MONRESTO',
  'CONTRÔLE NÉGATIF — le canal est bien OUVERT avant la sanction : les refus qui suivent mesurent la garde, pas un refus permanent');

-- La plainte, et la sanction.
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000001', 'MONRESTO',
     'suspended', 'plainte AF2M 2026-12')),
  true, 'une plainte AF2M fait suspendre l''expéditeur');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000001')),
  null, 'le canal se ferme');

-- LE GESTE DU DÉFAUT (a) : le propriétaire demande le NOM SUIVANT. La demande
-- reste POSSIBLE — délibérément : une ligne `pending` n'autorise aucun envoi et
-- n'engage personne, et refuser ici empêcherait un commerçant de préparer son
-- dossier pendant que la plateforme instruit la levée.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000001', 'MONRESTO2')),
  null,
  'le propriétaire peut toujours DEMANDER un autre nom : une ligne `pending` n''autorise aucun envoi et n''engage personne');

select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000001', 'MONRESTO2', 'AF2M-2026-00301') $$,
  'P0001', null,
  'LE POINT DE CE LOT : déclarer un AUTRE nom est REFUSÉ tant que l''organisation porte une suspension non résolue. C''est CETTE assertion qui distingue le correctif de celui du tour précédent, qui ne protégeait que la LIGNE sanctionnée — suspendu sur MONRESTO, il suffisait de demander MONRESTO2');

-- LE GESTE DU DÉFAUT (b) : se redéclarer soi-même. `declare_sms_sender` ne
-- filtrait que `status <> 'declared'` : une ligne suspendue y entrait et en
-- ressortait `declared`, `status_reason = null` — une sortie de suspension en
-- un seul appel, depuis le formulaire de déclaration de la plateforme.
select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000001', 'MONRESTO', 'AF2M-2026-00302') $$,
  'P0001', null,
  'et redéclarer le nom SANCTIONNÉ lui-même est refusé : c''était la seconde sortie de suspension, celle dont l''en-tête de 20260828120000 affirmait qu''elle n''existait pas');

select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000001'
      and sender_id = 'MONRESTO'),
  'suspended',
  'la sanction EXISTE TOUJOURS après les deux tentatives — un refus qui laisserait la ligne à moitié réécrite serait pire que pas de refus');
select is(
  (select status_reason from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000001'
      and sender_id = 'MONRESTO'),
  'plainte AF2M 2026-12',
  'et son MOTIF aussi : la tentative refusée n''a pas posé `status_reason = null` au passage');
select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000001'
      and sender_id = 'MONRESTO2'),
  'pending',
  'le nom suivant reste en attente : la garde REFUSE la déclaration, elle ne détruit pas la demande');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000001')),
  null, 'et le canal reste fermé');

-- ══ 2. LE RETRAIT N'EST PAS UNE LEVÉE ═════════════════════
--
-- La forme la plus naturelle du contournement, et celle qu'une garde filtrant
-- `retired_at is null` aurait laissée passer sans bruit.
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000001', 'MONRESTO', 'retired', 'fermeture')),
  true, 'la plateforme RETIRE l''expéditeur sanctionné');
select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000001', 'MONRESTO2', 'AF2M-2026-00303') $$,
  'P0001', null,
  '« je retire l''expéditeur sanctionné et j''en déclare un autre » est REFUSÉ AUSSI : un retrait conserve le statut, il ne lève rien. La garde ne filtre délibérément PAS `retired_at`');

-- ══ 3. CONTRE-CONTRÔLE : sans sanction, tout passe ════════
--
-- Sans cette section, une garde qui refuserait TOUTE déclaration rendrait le
-- fichier entièrement vert. C'est ce que ce contre-contrôle existe pour dire.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000003', 'TEMOIN')),
  null, 'une organisation SANS sanction demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000003', 'TEMOIN', 'AF2M-2026-00310')),
  true,
  'CONTRE-CONTRÔLE — et l''obtient : la garde refuse les organisations sanctionnées, pas toutes les déclarations');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000003')),
  'TEMOIN', 'son canal s''ouvre normalement');

-- LA DISTINCTION « RETIRÉ APRÈS SANCTION » / « RETIRÉ NORMALEMENT »
-- (moitié base du MOYEN B).
--
-- `set_sms_sender_status` CONSERVE `status` sur un retrait
-- (20260824120000:391). L'information n'a donc pas besoin d'être ajoutée : elle
-- est déjà là. Ces assertions existent pour que le jour où quelqu'un
-- « simplifiera » ce `case` en écrivant `status = 'retired'`, un test l'arrête —
-- ce serait la perte, et elle serait silencieuse : les deux écrans afficheraient
-- « retiré » et la sanction disparaîtrait des deux.
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000003', 'TEMOIN', 'retired', 'changement d''enseigne')),
  true, 'le témoin est retiré, lui, sans aucune sanction');
select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000003'
      and sender_id = 'TEMOIN'),
  'declared',
  'RETIRÉ NORMALEMENT : le statut reste `declared` sous le retrait');
select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000001'
      and sender_id = 'MONRESTO'),
  'suspended',
  'RETIRÉ APRÈS SANCTION : le statut reste `suspended`. LES DEUX SONT DONC DISTINGUABLES PAR `status` SEUL — rien à conserver de plus en base, et le défaut MOYEN B est entier dans la couche applicative');
select ok(
  (select retired_at is not null from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000001'
      and sender_id = 'MONRESTO')
  and (select retired_at is not null from public.sms_senders
        where organization_id = 'f3000000-0000-4000-8000-000000000003'
          and sender_id = 'TEMOIN'),
  'les deux portent bien un `retired_at` : c''est ce qui rend `status` seul discriminant, et non la conjonction des deux');

-- Et un témoin retiré SANS sanction revient en service par le chemin ORDINAIRE :
-- `request_sms_sender` le remet au stade `pending` (une déclaration retirée est
-- effacée, il faut la refaire), puis la déclaration passe.
--
-- ⚠️ LE DÉTOUR PAR `request_sms_sender` N'EST PAS UN ORNEMENT, et il m'a été
-- appris par un ROUGE. Ma première rédaction déclarait directement et attendait
-- `true` : `declare_sms_sender` filtre `status <> 'declared'` depuis
-- 20260824120000, et un retrait CONSERVE le statut — une ligne retirée reste
-- donc `declared`, et la déclaration directe rend `false`. Comportement
-- d'origine, antérieur à ce lot et inchangé par lui ; c'est mon assertion qui
-- se trompait de mécanisme, pas le code. Consigné plutôt que corrigé en
-- silence : le prochain lecteur se posera la même question.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000003', 'TEMOIN')),
  null,
  'le témoin retiré SANS sanction est redemandé, et request_sms_sender le remet au stade `pending`');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000003', 'TEMOIN', 'AF2M-2026-00311')),
  true,
  'puis il se redéclare : la garde de sanction ne déborde PAS sur le retrait ordinaire — seule une organisation portant un `suspended` est bloquée');

-- ══ 4. LA SORTIE EXPLICITE, DANS SES DEUX FORMES ══════════
--
-- Sans elle, la garde serait une IMPASSE : une organisation suspendue une fois
-- ne pourrait plus jamais déclarer d'expéditeur, et le seul recours serait un
-- UPDATE à la main en production.

-- FORME 1 — sur le nom sanctionné lui-même (organisation 2).
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE')),
  null, 'une deuxième organisation demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE', 'AF2M-2026-00320')),
  true, 'et l''obtient');
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE', 'suspended', 'plainte')),
  true, 'puis se fait suspendre');
select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE', 'AF2M-2026-00321') $$,
  'P0001', null,
  'PRÉMISSE — la déclaration est bien bloquée avant la levée');

select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE',
     'pending', 'sanction levée après régularisation')),
  true,
  'LA SORTIE : la plateforme lève la sanction par un geste explicite, tracé et motivé — set_sms_sender_status, jamais le formulaire de déclaration');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000002', 'BOUTIQUE', 'AF2M-2026-00322')),
  true,
  'et la déclaration passe : la garde n''est pas une impasse');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000002')),
  'BOUTIQUE', 'le canal rouvre');

-- FORME 2 — sur un nom DIFFÉRENT, c'est-à-dire le scénario (a) enfin dénoué
-- (organisation 5). C'est le cas légitime du changement d'enseigne après
-- régularisation, et il doit rester possible.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000005', 'ANCIENNOM')),
  null, 'une cinquième organisation demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000005', 'ANCIENNOM', 'AF2M-2026-00330')),
  true, 'et l''obtient');
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000005', 'ANCIENNOM', 'suspended', 'plainte')),
  true, 'puis se fait suspendre');
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000005', 'NOUVEAUNOM')),
  null, 'elle demande un nouveau nom');
select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000005', 'NOUVEAUNOM', 'AF2M-2026-00331') $$,
  'P0001', null,
  'PRÉMISSE — le nouveau nom est bloqué par la sanction portée sur l''ANCIEN');
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000005', 'ANCIENNOM',
     'rejected', 'sanction requalifiée en refus de dossier')),
  true,
  '`rejected` fonctionne aussi comme sortie : il requalifie la sanction en verdict de dossier, que le commerçant peut compléter');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000005', 'NOUVEAUNOM', 'AF2M-2026-00332')),
  true,
  'et le NOUVEAU nom se déclare : la levée débloque l''ORGANISATION, pas seulement la ligne — c''est la contrepartie exacte de la garde, qui bloque l''organisation et pas seulement la ligne');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000005')),
  'NOUVEAUNOM', 'et c''est lui qui sert désormais');

-- ══ 5. LE CRÉDIT DIT CE QU'IL A FAIT ══════════════════════
--
-- Chaque appel est capturé UNE SEULE FOIS dans une table temporaire : appeler
-- deux fois pour lire deux colonnes ferait du second appel un rejeu, et le test
-- mesurerait son propre effet de bord.
create temporary table tap_credit_first on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000004', 2000, 'purchase', 45000,
    'stripe:cs_tour3');

select isnt(
  (select entry_id from tap_credit_first), null,
  'l''achat de 2 000 SMS rend un identifiant de mouvement');
select is(
  (select created from tap_credit_first), true,
  'et il se déclare CRÉÉ');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f3000000-0000-4000-8000-000000000004'),
  2000, 'le solde vaut 2 000');

-- LE REJEU. Aucun attaquant : la RPC commit, le pooler coupe, le handler lit
-- une erreur, relâche sa prise, répond 500, Stripe rejoue.
create temporary table tap_credit_replay on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000004', 2000, 'purchase', 45000,
    'stripe:cs_tour3');

select is(
  (select created from tap_credit_replay), false,
  'LE POINT DE CE LOT : le rejeu se déclare DÉJÀ CRÉDITÉ. Sans ce drapeau, le back-office journalisait « 2 000 unités accordées » dans admin_audit_logs — table IMPURGEABLE — pour un crédit que l''index avait avalé');
select is(
  (select entry_id from tap_credit_replay),
  (select entry_id from tap_credit_first),
  'et il rend LE MÊME mouvement : `created = false` ne veut pas dire « rien à journaliser », mais « journalise CE mouvement-là, sans en réaffirmer l''effet »');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f3000000-0000-4000-8000-000000000004'),
  2000,
  'LE SOLDE LE PROUVE : toujours 2 000 après le rejeu. C''est le SOLDE qui est relu, et non un compte de lignes — au tour précédent, une assertion de comptage est restée VERTE sous sabotage');

-- CONTRE-CONTRÔLE : la fonction est IDEMPOTENTE, pas INERTE. Sans lui, une
-- fonction qui ne créditerait plus jamais rien passerait toutes les assertions
-- ci-dessus.
create temporary table tap_credit_other on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000004', 500, 'purchase', 45000,
    'stripe:cs_autre');

select is(
  (select created from tap_credit_other), true,
  'CONTRE-CONTRÔLE — un SECOND paiement, sous une AUTRE référence, se déclare CRÉÉ');
select isnt(
  (select entry_id from tap_credit_other),
  (select entry_id from tap_credit_first),
  'et c''est un mouvement DIFFÉRENT');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f3000000-0000-4000-8000-000000000004'),
  2500,
  'le solde monte à 2 500 : deux références différentes créditent bien DEUX FOIS — la fonction est devenue explicite, pas inerte');

-- L'index reste partiel sur `purchase` : un ajustement est un geste manuel
-- répétable, et il doit donc toujours se déclarer CRÉÉ.
create temporary table tap_credit_adj_1 on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000004', 10, 'adjustment', null,
    'geste commercial');
create temporary table tap_credit_adj_2 on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000004', 10, 'adjustment', null,
    'geste commercial');

select is(
  (select created from tap_credit_adj_1), true, 'un geste commercial se déclare CRÉÉ');
select is(
  (select created from tap_credit_adj_2), true,
  'et le MÊME libellé, une seconde fois, AUSSI : l''index ne touche pas `adjustment`, parce qu''une décision humaine répétée n''est pas un rejeu — `created` ne doit donc pas y mentir');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f3000000-0000-4000-8000-000000000004'),
  2520, 'et le solde monte deux fois');

-- ══ 6. Isolation multi-tenant ═════════════════════════════
create temporary table tap_credit_neighbour on commit drop as
  select * from public.credit_sms_balance(
    'f3000000-0000-4000-8000-000000000003', 2000, 'purchase', 45000,
    'stripe:cs_tour3');

select is(
  (select created from tap_credit_neighbour), true,
  'la MÊME référence de paiement, chez une AUTRE organisation, se déclare CRÉÉE : l''index est scopé par organisation, et `created` l''est avec lui');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f3000000-0000-4000-8000-000000000003'),
  2000, 'deux commerçants ne se bloquent pas l''un l''autre');

-- ══ 7. ACL — reposée après le DROP ════════════════════════
--
-- `credit_sms_balance` a été DÉTRUITE puis recréée : son ACL est repartie des
-- privilèges par défaut, et l'`alter default privileges` de Supabase accorde
-- EXECUTE largement (ADR-049). Sans les `revoke`/`grant` de la migration, un
-- commerçant connecté pourrait se créditer lui-même des SMS. Ces assertions
-- sont la seule chose qui le vérifie.
--
-- ⚠️ Elles nomment la signature par ses ARGUMENTS, jamais par son retour :
-- c'est ce qui leur permet de survivre à un changement de type de retour. Une
-- signature qui ne correspond à rien ferait LEVER `has_function_privilege`,
-- tuant ce fichier avant `finish()` — sans plan et sans compte.
select ok(
  not has_function_privilege('anon', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'anon ne se crédite pas de SMS après le drop/create');
select ok(
  not has_function_privilege('authenticated', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'un commerçant connecté non plus — c''est la ligne que le DROP aurait effacée en silence');
select ok(
  has_function_privilege('service_role', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'et le serveur, lui, crédite toujours : le grant a bien été reposé');
select ok(
  not has_function_privilege('authenticated', 'public.declare_sms_sender(uuid,text,text)', 'EXECUTE'),
  'un commerçant connecté ne déclare toujours pas son propre expéditeur au registre');

-- ══ 8. UN RENOMMAGE NE LÈVE PAS UNE SANCTION ══════════════
--   (20260830120000)
--
-- Le trigger `sms_senders_declaration_follows_name` faisait retomber l'état à
-- `pending` sur TOUT changement de nom — depuis `suspended` comme depuis
-- `declared`. Un renommage levait donc une sanction de plateforme sans qu'aucun
-- humain ne l'ait décidé, et écrasait au passage `status_reason`, c'est-à-dire
-- la cause de la sanction.
--
-- ⚠️ AUCUN CHEMIN APPLICATIF NE RENOMME AUJOURD'HUI — ces assertions
-- n'attrapent donc rien en production, et le prétendre serait faux. Elles
-- existent pour le geste « renommer mon expéditeur » qu'un commerçant qui
-- change d'enseigne finira par demander : ce jour-là, rien dans le formulaire
-- ne rappellera qu'un trigger de 20260824120000 décide de l'état d'une
-- sanction. C'est pourquoi le renommage est écrit ici EN SQL DIRECT et non par
-- une RPC : la RPC n'existe pas encore, et c'est précisément le point.
--
-- LES DEUX CAS SONT TESTÉS ENSEMBLE, à dessein. Affiner le trigger et le
-- DÉSARMER produisent le même vert sur la moitié « suspended » du lot ; seule
-- la moitié « declared » les sépare.

-- ── 8a. DEPUIS `suspended` : LA SANCTION EST CONSERVÉE ──────
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEA')),
  null, 'un sixième commerçant demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEA', 'AF2M-2026-00340')),
  true, 'et l''obtient');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000006')),
  'ENSEIGNEA',
  'CONTRÔLE NÉGATIF — le canal est bien OUVERT avant la sanction');
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEA',
     'suspended', 'plainte AF2M 2026-13')),
  true, 'une plainte AF2M fait suspendre l''expéditeur');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000006')),
  null, 'le canal se ferme');

-- LE GESTE : il change d'enseigne. Rien d'autre.
update public.sms_senders
   set sender_id = 'ENSEIGNEB'
 where organization_id = 'f3000000-0000-4000-8000-000000000006'
   and sender_id = 'ENSEIGNEA';

select is(
  (select count(*)::int from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000006'
      and sender_id = 'ENSEIGNEB'),
  1,
  'PRÉMISSE — le renommage a bien eu lieu : sans elle, les assertions qui suivent seraient vraies parce que rien n''aurait bougé');
select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000006'
      and sender_id = 'ENSEIGNEB'),
  'suspended',
  'LE POINT DE CE LOT : renommer un expéditeur SUSPENDU conserve la suspension. Avant le correctif, le trigger la ramenait à `pending` — une sanction de plateforme levée par un effet de bord d''une édition faite par le sanctionné lui-même');
select is(
  (select status_reason from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000006'
      and sender_id = 'ENSEIGNEB'),
  'plainte AF2M 2026-13',
  'et le MOTIF survit aussi : une suspension dont la cause a été écrasée par « nom modifié » est une suspension que l''écran plateforme ne saura pas expliquer');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000006')),
  null, 'le canal reste fermé sous le nouveau nom');
select throws_ok(
  $$ select public.declare_sms_sender(
       'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEB', 'AF2M-2026-00341') $$,
  'P0001', null,
  'et la garde de déclaration voit toujours la sanction après renommage : elle cherche un `suspended` DANS L''ORGANISATION, la ligne renommée en porte toujours un');

-- LA SORTIE EXPLICITE FONCTIONNE TOUJOURS APRÈS RENOMMAGE — sans quoi le
-- correctif transformerait la suspension en impasse définitive dès qu'un nom
-- a changé, et le seul recours redeviendrait un UPDATE à la main en production.
select is(
  (select public.set_sms_sender_status(
     'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEB',
     'pending', 'sanction levée après régularisation')),
  true,
  'LA SORTIE : la plateforme lève la sanction sur le NOUVEAU nom, par le même geste explicite et motivé');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000006', 'ENSEIGNEB', 'AF2M-2026-00342')),
  true, 'et la déclaration passe : la conservation n''est pas une impasse');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000006')),
  'ENSEIGNEB', 'le canal rouvre sous l''enseigne nouvelle');

-- ── 8b. DEPUIS `declared` : LA RETOMBÉE EST INTACTE ─────────
--
-- CONTRE-CONTRÔLE, et c'est la moitié la plus importante du lot : sans lui,
-- avoir DÉSARMÉ le trigger (« ne jamais changer l'état sur un renommage »)
-- rendrait 8a entièrement vert. Or ce serait bien pire que le défaut corrigé —
-- un expéditeur renommé resterait `declared`, et le SMS partirait sous un nom
-- que le registre AF2M ne connaît pas.
select isnt(
  (select public.request_sms_sender(
     'f3000000-0000-4000-8000-000000000007', 'BOUTIQUEC')),
  null, 'un septième commerçant demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f3000000-0000-4000-8000-000000000007', 'BOUTIQUEC', 'AF2M-2026-00350')),
  true, 'et l''obtient');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000007')),
  'BOUTIQUEC', 'son canal est ouvert');

update public.sms_senders
   set sender_id = 'BOUTIQUED'
 where organization_id = 'f3000000-0000-4000-8000-000000000007'
   and sender_id = 'BOUTIQUEC';

select is(
  (select status from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000007'
      and sender_id = 'BOUTIQUED'),
  'pending',
  'CONTRE-CONTRÔLE — renommer un expéditeur DÉCLARÉ le fait TOUJOURS retomber à `pending` : le correctif AFFINE le trigger, il ne le désarme pas');
select is(
  (select status_reason from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000007'
      and sender_id = 'BOUTIQUED'),
  'nom modifié : nouvelle déclaration AF2M requise',
  'avec son motif d''origine, inchangé par ce lot');
select ok(
  (select declared_at is null and af2m_reference is null
     from public.sms_senders
    where organization_id = 'f3000000-0000-4000-8000-000000000007'
      and sender_id = 'BOUTIQUED'),
  'et la déclaration tombe avec le nom : ni date, ni référence de registre ne survivent à un renommage');
select is(
  (select public.sms_sender_for_send('f3000000-0000-4000-8000-000000000007')),
  null,
  'le canal se ferme — c''est cette fermeture-là qui empêche un SMS de partir sous un nom jamais déclaré');

select * from finish();
rollback;
