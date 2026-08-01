-- ============================================================
-- Lastchance — la sanction lie la DÉCLARATION, et le crédit dit ce qu'il a fait
-- ============================================================
--
-- Troisième tour sur le canal SMS. Les quatre correctifs du tour précédent
-- tiennent (contre-revue : 0 CRITIQUE, 0 ÉLEVÉ) ; ce lot ferme les deux
-- trouvailles MOYEN qui se referment EN BASE — et dont deux sur trois sont des
-- CONSÉQUENCES du tour précédent. Une correction qui crée son propre trou n'est
-- pas une nouveauté ici : c'est le motif exact du chantier `settle_hunt_completions`
-- du 2026-07-31, où poser les quatre gardes manquantes avait ouvert un silence
-- durable à la place d'une émission massive.
--
-- ── CATALOGUE VIVANT, VÉRIFIÉ AVANT ÉCRITURE ────────────────
--
-- `grep -l "function public.<nom>" supabase/migrations/*.sql` — la règle est :
-- UN fichier attendu ; s'il en rend plusieurs, la vivante est la PLUS RÉCENTE,
-- et c'est CE corps-là qu'on reprend. Le dépôt a déjà payé DEUX FOIS d'avoir lu
-- la migration d'origine au lieu du catalogue vivant (escalade de privilège du
-- 2026-07-29, `BORNE 2` révoquée de justesse le même jour).
--
--   declare_sms_sender    → 20260824120000 (origine) + celui-ci        = 2
--                           Corps repris de 20260824120000, qui EST le vivant :
--                           aucune migration intermédiaire ne l'a redéfini.
--   credit_sms_balance    → 20260825120000 (origine)
--                           + 20260828120000 (tour précédent, VIVANT)
--                           + celui-ci                                 = 3
--                           ⚠️ Le corps repris ci-dessous est celui de
--                           20260828120000 — PAS celui de 20260825120000, qui
--                           ne porte ni l'`on conflict` ni la relecture du
--                           mouvement existant. Reprendre l'origine aurait
--                           silencieusement RÉOUVERT l'ÉLEVÉ 2 du tour
--                           précédent (le double crédit irrattrapable).
--   set_sms_sender_status → 20260824120000 SEUL. NON redéfinie ici, mais LUE :
--                           c'est elle qui porte la sortie de sanction, et
--                           c'est elle qui conserve `status` sur un retrait
--                           (voir la section 3 ci-dessous).
--   request_sms_sender    → 20260824120000 + 20260828120000. NON redéfinie ici.
--
--
-- ════════════════════════════════════════════════════════════
-- MOYEN A — LA SANCTION PORTAIT SUR UN NOM, PAS SUR LE DROIT D'ÉMETTRE
-- ════════════════════════════════════════════════════════════
--
-- Deux faits mesurés par la contre-revue. Ils se referment ENSEMBLE, et c'est
-- le point : pris séparément, chacun a une correction qui laisse l'autre ouvert.
--
-- ── a) LE CONTOURNEMENT PAR LE NOM SUIVANT ──────────────────
--
-- Le correctif du tour précédent protège LA LIGNE : `request_sms_sender` ne
-- touche plus une ligne `suspended`. Le propriétaire dont MONRESTO est suspendu
-- n'a donc qu'à demander MONRESTO2 — une ligne neuve, que rien n'exclut — et la
-- plateforme la déclarera de bonne foi. La sanction portait sur un NOM là où
-- elle devrait porter sur le DROIT D'ÉMETTRE de l'organisation.
--
-- C'est la même erreur de portée que celle déjà consignée le 2026-07-31 sur
-- `player_wallet` : une garde recopiée sur la moitié d'un prédicat, parce que
-- l'autre moitié vivait ailleurs.
--
-- ── b) LA SORTIE DE SANCTION QUI N'EN ÉTAIT PAS UNE ─────────
--
-- `declare_sms_sender` ne filtre que `status <> 'declared'`. Une ligne
-- `suspended` y entre donc, et en ressort `declared`, `status_reason = null` :
-- la fonction RELÈVE une suspension en un seul appel, motif effacé.
--
-- ⚠️ ET L'EN-TÊTE DE 20260828120000 AFFIRME LE CONTRAIRE — « une sanction ne se
-- lève que par set_sms_sender_status ». C'était FAUX au moment où je l'ai
-- écrit. Ce dépôt a déjà payé DEUX FOIS exactement cela le 2026-08-01 : deux
-- migrations affirmant dans leur propre en-tête qu'« aucun chemin » ne
-- contournait leurs gardes, et la revue trouvant le chemin dans les deux cas.
--
-- La leçon retenue alors était de corriger l'en-tête pour dire que la phrase
-- était fausse et par où. ELLE NE SUFFIT PAS ICI, et c'est la consigne de ce
-- lot : on ne se contente pas de corriger la phrase, ON LA REND VRAIE. L'en-tête
-- de 20260828120000 reçoit néanmoins sa note — un lecteur doit pouvoir savoir
-- que l'affirmation a été fausse entre les deux migrations, et non la découvrir.
--
-- ── LA CORRECTION : LE BON POINT D'APPLICATION EST LA DÉCLARATION ──
--
-- `declare_sms_sender` REFUSE dès que l'organisation porte une suspension non
-- résolue — la ligne visée ou n'importe quelle autre. Une seule garde ferme (a)
-- et (b), parce que le prédicat porte sur l'ORGANISATION et non sur la ligne.
--
-- POURQUOI LÀ, et pas à l'envoi ou à la demande :
--
--   • À L'ENVOI, ce serait trop tard au sens qui compte. `sms_sender_for_send`
--     refuse déjà un non-`declared` : le canal ne rouvrait pas tout seul. Ce qui
--     se jouait, c'est que la PLATEFORME s'engage auprès du registre AF2M pour
--     une organisation qu'elle vient de sanctionner. Le mal est fait à la
--     déclaration, pas au premier SMS.
--   • À LA DEMANDE (`request_sms_sender`), ce serait trop tôt et pour rien : une
--     ligne `pending` n'autorise aucun envoi et n'engage personne. Refuser là
--     empêcherait un commerçant de préparer son dossier pendant que la
--     plateforme instruit la levée — sans rien protéger.
--
-- La déclaration est le moment où la plateforme engage sa responsabilité auprès
-- du registre. C'est donc là que la question « cette organisation a-t-elle le
-- droit d'émettre ? » doit être posée.
--
-- ── LA SORTIE EXISTE, ET ELLE EST NOMMÉE ────────────────────
--
-- Sans sortie explicite, cette garde serait une IMPASSE : une organisation
-- suspendue une fois ne pourrait plus jamais déclarer d'expéditeur, et le seul
-- recours serait un UPDATE à la main en production.
--
--     set_sms_sender_status(<organisation>, '<NOM SUSPENDU>', 'pending', <motif>)
--
-- Ce geste est TRACÉ (il écrit `status_reason`), MOTIVÉ (le motif est un
-- paramètre) et il ne peut pas se produire par inadvertance dans le formulaire
-- de déclaration — ce sont deux écrans distincts et deux RPC distinctes. C'est
-- exactement la propriété que la séparation demande/déclaration de
-- 20260824120000 §4 existe pour tenir : deux portes qu'on peut surveiller
-- séparément, plutôt qu'une seule qu'on ne peut plus refermer à moitié.
--
-- `'rejected'` fonctionne aussi comme sortie et c'est cohérent : il requalifie
-- la sanction en verdict de dossier, que le commerçant peut ensuite compléter.
-- `'retired'` NE fonctionne PAS, délibérément — il conserve `status` (voir §3),
-- donc retirer un expéditeur suspendu ne lève rien. C'est ce qui ferme le
-- contournement (a) dans sa forme la plus naturelle : « je retire MONRESTO et
-- je déclare MONRESTO2 ».
--
--
-- ════════════════════════════════════════════════════════════
-- MOYEN D — LE BACK-OFFICE AFFIRMAIT UN CRÉDIT QUE L'INDEX AVAIT AVALÉ
-- ════════════════════════════════════════════════════════════
--
-- CONSÉQUENCE DIRECTE de l'index d'idempotence du tour précédent. Il n'existait
-- pas avant lui, et il est le prix — assumé — d'avoir descendu l'idempotence au
-- grand livre.
--
-- Depuis 20260828120000, `credit_sms_balance` rend l'identifiant d'un mouvement
-- PRÉEXISTANT sur conflit, au lieu de lever. Les deux appelants applicatifs
-- lisent ce retour comme un succès de création :
--
--   • `src/app/admin/(protected)/merchants/actions.ts:894` journalise l'id dans
--     `admin_audit_logs` sous `merchant.sms_credit.grant`, avec `units`, et
--     affiche un succès. L'opérateur qui reclique lit « 2 000 unités
--     accordées » DEUX FOIS, et le journal d'audit — impurgeable, il porte
--     `admin_audit_no_delete` — affirme 4 000 unités là où le grand livre en
--     porte 2 000.
--   • `src/app/api/stripe/webhook/route.ts:356` répond `received: true`.
--
-- C'est la classe de défaut déjà payée ici le 2026-07-30 : « un back-office qui
-- n'enregistrait que ses succès ». La forme est symétrique — là, cinquante
-- refus ressemblaient à une journée calme ; ici, un rejeu ressemble à un second
-- achat. Dans les deux cas la trace existe et elle est FAUSSE, ce qui est pire
-- qu'absente : elle sera lue, et elle sera crue.
--
-- ── LA CORRECTION : LA RPC LE DIT, L'APPELANT NE DEVINE PAS ──
--
-- Le retour passe de `uuid` à `(entry_id uuid, created boolean)`.
--
-- ⚠️ POURQUOI PAS UNE PRÉ-LECTURE DANS L'APPELANT. « Lire si la référence
-- existe, puis créditer » est RACÉ : entre les deux, le rejeu de Stripe peut
-- passer. L'appelant lirait « absent », créditerait, et l'index rendrait le
-- mouvement de l'autre — qu'il journaliserait comme créé. La correction serait
-- alors exactement aussi fausse qu'aujourd'hui, mais plus difficile à voir. Et
-- le tour précédent a déjà montré, mesuré, qu'un test de COMPTAGE peut rester
-- vert sous sabotage : une pré-lecture serait de surcroît mal gardée.
--
-- Seul l'`on conflict … do nothing` connaît la réponse, parce que lui seul agit
-- dans la même instruction que l'écriture. `returning` rend `null` quand rien
-- n'a été inséré : c'est LÀ, et nulle part ailleurs, que « créé » et « déjà
-- crédité » se distinguent sans course.
--
-- ── LE PRIX : DROP PUIS CREATE ──────────────────────────────
--
-- `create or replace` ne peut changer ni la liste des paramètres ni le TYPE DE
-- RETOUR. Il faut donc `drop` puis `create`, ce qui remet l'ACL par défaut —
-- l'`alter default privileges` de Supabase accorde EXECUTE largement. Les
-- `revoke`/`grant` sont donc REPOSÉS, et ce n'est pas cosmétique : sans eux,
-- `authenticated` pourrait se créditer lui-même des SMS. Deux assertions pgTAP
-- existantes le vérifient déjà (`sms_credit_ledger.test.sql:407,410`,
-- `sms_findings.test.sql:272`).
--
-- ⚠️ LA SIGNATURE D'ARGUMENTS EST INCHANGÉE, et c'est ce qui sauve ces trois
-- assertions. `has_function_privilege('…', 'public.credit_sms_balance(uuid,
-- integer,text,integer,text,text)', 'EXECUTE')` nomme la fonction par ses
-- ARGUMENTS, jamais par son retour : elle survit au drop/create. Si les
-- arguments avaient bougé, ces appels auraient LEVÉ, tuant leurs fichiers avant
-- `finish()` — sans plan et sans compte, donc sans rien signaler d'utile.
--
-- ⚠️ CE QUI CASSE QUAND MÊME, et qui est traité dans le même lot : les quinze
-- appels pgTAP en position SCALAIRE (`(select public.credit_sms_balance(…))`)
-- répartis dans cinq fichiers. Un `returns table` ne s'y lit plus ; ils passent
-- à `(select entry_id from public.credit_sms_balance(…))`. Aucune assertion
-- n'est retirée ni affaiblie au passage.
--
-- ⚠️ LES DEUX APPELANTS APPLICATIFS CHANGENT DE FORME DE RETOUR, et ce lot ne
-- les touche PAS (périmètre backend). `supabase-js` rend désormais un TABLEAU
-- de lignes là où il rendait une chaîne : `data?.[0]?.entry_id` et
-- `data?.[0]?.created`. Tant qu'ils ne sont pas repris, `entryId` vaut l'objet
-- ligne au lieu de l'identifiant. Les chemins exacts sont nommés plus haut.
--
--
-- ════════════════════════════════════════════════════════════
-- MOYEN B (moitié base) — LA SUSPENSION RESTE-T-ELLE LISIBLE APRÈS UN RETRAIT ?
-- ════════════════════════════════════════════════════════════
--
-- ⚠️ VÉRIFIÉ, ET LA RÉPONSE EST OUI : AUCUN CHANGEMENT DE SCHÉMA ICI.
--
-- La consigne était de conserver l'information si elle ne l'était pas. Elle
-- l'est déjà, et l'écrire sans le mesurer aurait été ajouter une colonne pour
-- un problème qui n'existe pas. `set_sms_sender_status` (20260824120000:391)
-- CONSERVE `status` sur un retrait :
--
--     status = case when p_status = 'retired' then s.status else p_status end
--
-- Donc, après retrait :
--   • retiré APRÈS suspension  → status = 'suspended', retired_at renseigné
--   • retiré normalement       → status = 'declared',  retired_at renseigné
--
-- Les deux sont distinguables par `status` seul. La §3 du fichier de test
-- `sms_sanction.test.sql` l'asserte, pour que le jour où quelqu'un
-- « simplifiera » ce `case` en écrivant `status = 'retired'`, un test l'arrête —
-- ce serait la perte, et elle serait silencieuse.
--
-- Le défaut MOYEN B est donc ENTIER dans la couche applicative :
-- `src/actions/sms.ts:290` filtre `retired_at is null` et fait disparaître la
-- ligne des deux écrans, et le back-office dérive son libellé du retrait avant
-- le statut. Rien à corriger en base ; tout à corriger là-bas.
--
-- ⚠️ UN RÉSIDU ADJACENT, ÉCRIT PLUTÔT QUE TU, parce qu'il touche l'écran qui
-- devra afficher la sanction : `set_sms_sender_status` écrit `status_reason =
-- p_reason` INCONDITIONNELLEMENT, y compris sur un retrait. Retirer un
-- expéditeur suspendu conserve donc l'ÉTAT (« suspended ») mais ÉCRASE le MOTIF
-- (« plainte AF2M » devient « fermeture »). L'écran pourra dire « retiré alors
-- qu'il était sous sanction » ; il ne pourra pas toujours dire POURQUOI.
-- Non corrigé ici délibérément : la consigne portait sur la DISTINCTION, qui
-- tient ; changer l'écriture du motif modifierait ce que le formulaire de
-- retrait du back-office enregistre aujourd'hui, sans que ce lot puisse en
-- reprendre l'écran. Consigné pour le lot suivant plutôt que corrigé à moitié.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. La sanction lie la DÉCLARATION, pas seulement la ligne
-- ────────────────────────────────────────────────────────────
--
-- Signature INCHANGÉE (uuid, text, text) → boolean : `create or replace`
-- conserve l'OID et l'ACL. Les `revoke`/`grant` sont néanmoins reposés, pour
-- que la migration reste lisible seule.
create or replace function public.declare_sms_sender(
  p_organization_id uuid,
  p_sender_id text,
  p_af2m_reference text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
  v_sanctioned text;
  v_name text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_sender_id, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  if p_af2m_reference is null or pg_catalog.btrim(p_af2m_reference) = '' then
    -- Une déclaration sans référence de registre est une affirmation sans
    -- preuve. C'est précisément ce qu'on refuse de stocker.
    raise exception 'déclaration AF2M refusée : la référence de registre est obligatoire';
  end if;

  -- ⚠️ LA GARDE DE SANCTION, ET ELLE PORTE SUR L'ORGANISATION.
  --
  -- Le prédicat ne nomme PAS `v_name` : c'est tout l'objet du correctif. Une
  -- garde sur la ligne visée aurait fermé (b) — se redéclarer soi-même — en
  -- laissant (a) grand ouvert : suspendu sur MONRESTO, on déclare MONRESTO2.
  -- La sanction porte sur le DROIT D'ÉMETTRE de l'organisation, donc la garde
  -- aussi.
  --
  -- `retired_at` N'EST PAS FILTRÉ, et c'est le point délicat. Une ligne
  -- suspendue puis RETIRÉE porte toujours `status = 'suspended'` — le retrait
  -- conserve le statut (20260824120000:391). Exclure les retirées ici rouvrirait
  -- le contournement dans sa forme la plus naturelle et la plus innocente :
  -- « je retire l'expéditeur sanctionné, j'en déclare un autre ». Un retrait
  -- n'est pas une levée de sanction ; seul un geste explicite en est une.
  --
  -- PLACÉE APRÈS le contrôle de la référence, délibérément : ce contrôle-là
  -- valide les ARGUMENTS de l'appel, celui-ci valide l'ÉTAT de l'organisation.
  -- Valider les arguments d'abord garde stables les messages que les appelants
  -- existants reçoivent déjà.
  select s.sender_id into v_sanctioned
    from public.sms_senders s
   where s.organization_id = p_organization_id
     and s.status = 'suspended'
   order by s.updated_at desc, s.sender_id
   limit 1;

  if v_sanctioned is not null then
    -- On LÈVE plutôt que de rendre `false`. `false` signifie déjà « aucune
    -- ligne touchée » — nom inconnu, ou déjà déclaré : un refus muet se
    -- confondrait avec eux, et l'opérateur plateforme relancerait sans
    -- comprendre. Le message nomme l'expéditeur sanctionné ET le geste exact
    -- qui lève la sanction, parce qu'une garde sans sortie nommée est une
    -- impasse dont le seul recours est un UPDATE à la main en production.
    raise exception
      'déclaration AF2M refusée : l''organisation porte une suspension non résolue sur l''expéditeur « % ». Une sanction se lève par un geste explicite et motivé de la plateforme — set_sms_sender_status(<organisation>, ''%'', ''pending'', <motif>) — jamais par une nouvelle déclaration, ni par le retrait de l''expéditeur sanctionné.',
      v_sanctioned, v_sanctioned;
  end if;

  -- `clock_timestamp()` et NON `now()` : `now()` est l'horodatage de la
  -- TRANSACTION. Une demande suivie de sa déclaration dans le même appel
  -- porterait le même instant que la création, et toute comparaison stricte
  -- entre les deux deviendrait insatisfiable. C'est le défaut exact qui a été
  -- trouvé par pgTAP sur `record_sms_consent` (20260823120000:240-247), où
  -- tout un fichier vit dans une seule transaction.
  update public.sms_senders s
     set status = 'declared',
         declared_at = pg_catalog.clock_timestamp(),
         af2m_reference = pg_catalog.btrim(p_af2m_reference),
         status_reason = null,
         retired_at = null
   where s.organization_id = p_organization_id
     and s.sender_id = v_name
     -- `<> 'suspended'` serait REDONDANT ici : la garde ci-dessus a déjà levé
     -- pour toute l'organisation. On ne l'ajoute pas — une seconde garde qui
     -- ne peut jamais s'exécuter est du code mort, et le dépôt a déjà consigné
     -- trois fois d'en avoir écrit (2026-07-30).
     and s.status <> 'declared';

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.declare_sms_sender(uuid, text, text) is
  'Marque un expéditeur SMS comme DÉCLARÉ au registre AF2M. Séparée de request_sms_sender à dessein : si la même porte demandait et déclarait, la déclaration ne serait qu''un champ que le commerçant remplit lui-même. Exige une référence de registre — une déclaration sans référence est une affirmation sans preuve. REFUSE toute déclaration, quel que soit le nom demandé, tant que l''organisation porte une ligne `suspended` — retirée ou non : la sanction porte sur le DROIT D''ÉMETTRE de l''organisation, pas sur un nom, et la déclaration est le moment où la plateforme engage sa responsabilité auprès du registre. La SEULE sortie est un geste explicite et motivé de la plateforme, set_sms_sender_status(…, ''pending'' ou ''rejected'', <motif>) ; un retrait n''en est pas une, il conserve le statut. service_role uniquement.';

revoke all on function public.declare_sms_sender(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.declare_sms_sender(uuid, text, text) to service_role;

-- ────────────────────────────────────────────────────────────
-- 2. `credit_sms_balance` dit si elle a CRÉÉ ou RETROUVÉ
-- ────────────────────────────────────────────────────────────
--
-- ⚠️ DROP PUIS CREATE — le type de retour change, `create or replace` ne le
-- peut pas. Le corps repris est celui de 20260828120000 (le VIVANT), et non
-- celui de 20260825120000 : reprendre l'origine aurait retiré l'`on conflict`
-- et rouvert le double crédit irrattrapable.
--
-- La signature d'ARGUMENTS est identique, ce qui préserve les trois assertions
-- `has_function_privilege` qui la nomment en toutes lettres.
drop function if exists public.credit_sms_balance(uuid, integer, text, integer, text, text);

create function public.credit_sms_balance(
  p_organization_id uuid,
  p_units integer,
  p_reason text default 'purchase',
  p_unit_cost_micros integer default null,
  p_reference text default null,
  p_destination_country text default null
)
returns table (entry_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_created boolean;
  v_cost integer;
  v_currency text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  if p_reason not in ('purchase', 'adjustment') then
    -- `refund` passe par `refund_sms_credit`, qui seul sait relire le coût de
    -- la ligne annulée ; `send` et `expiry` sont des débits. Laisser passer
    -- `refund` ici permettrait un remboursement sans rattachement, donc
    -- reproductible à volonté — c'est la porte que l'index unique sur
    -- `reverses_entry_id` existe pour fermer.
    raise exception 'motif de crédit SMS invalide : % (attendu purchase ou adjustment)', p_reason;
  end if;

  if coalesce(p_units, 0) <= 0 then
    raise exception 'un crédit SMS porte un nombre d''unités strictement positif (reçu : %)',
      coalesce(p_units, 0);
  end if;

  -- La ligne de solde naît ici, à zéro. `on conflict do nothing` plutôt qu'un
  -- test d'existence : deux achats concurrents pour une organisation neuve
  -- tomberaient sinon tous deux dans la branche « elle n'existe pas », et l'un
  -- des deux lèverait une violation d'unicité.
  insert into public.sms_credits (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  select c.unit_cost_micros, c.currency into v_cost, v_currency
    from public.sms_credits c
   where c.organization_id = p_organization_id
   for update;

  if v_cost is null then
    raise exception 'organisation inconnue pour le crédit SMS : %', p_organization_id;
  end if;

  -- Le coût passé prime sur le tarif courant : c'est le prix réellement payé
  -- pour CE lot de crédits, et c'est lui qui doit être gelé.
  v_cost := coalesce(p_unit_cost_micros, v_cost);

  -- ⚠️ L'IDEMPOTENCE DE L'ACHAT. `do nothing` sur l'index partiel, puis
  -- relecture : un paiement déjà crédité rend SON mouvement, il n'en crée pas
  -- un second et il ne lève pas.
  --
  -- POURQUOI PAS UN `select` PRÉALABLE SEUL. Le `for update` ci-dessus
  -- sérialise déjà les appelants d'une même organisation — un test d'existence
  -- placé après lui suffirait AUJOURD'HUI. Mais la propriété reposerait alors
  -- sur l'ordre de deux instructions, qu'une édition future peut inverser sans
  -- que rien ne le signale. Écrite au conflit, elle tient à l'index.
  --
  -- POURQUOI LA CIBLE DE CONFLIT EST NOMMÉE. Un `on conflict do nothing` nu
  -- avalerait AUSSI `sms_credit_entries_one_reversal` — un remboursement
  -- doublé rendrait alors `null` en silence au lieu de lever. La cible et son
  -- prédicat désignent le seul index dont le conflit est un rejeu attendu.
  --
  -- Le trigger `sms_credit_entries_apply` étant `after insert`, une ligne non
  -- insérée ne touche pas le solde : rien à défaire.
  insert into public.sms_credit_entries (
    organization_id, delta_units, reason,
    unit_cost_micros, currency, destination_country, reference
  ) values (
    p_organization_id, p_units, p_reason,
    v_cost, v_currency, pg_catalog.upper(p_destination_country), p_reference
  )
  on conflict (organization_id, reference)
    where reason = 'purchase' and reference is not null
  do nothing
  returning id into v_entry_id;

  -- ⚠️ LE DISCRIMINANT, ET IL N'EN EXISTE PAS D'AUTRE QUI NE SOIT PAS RACÉ.
  -- `returning` ne rend une ligne que si l'insertion a eu lieu. C'est la SEULE
  -- lecture qui se fasse dans la même instruction que l'écriture, donc la seule
  -- qu'un rejeu concurrent ne puisse pas glisser sous les pieds de l'appelant.
  v_created := v_entry_id is not null;

  if not v_created then
    -- Conflit : le paiement a déjà été crédité. On rend LE mouvement existant
    -- plutôt que `null` — l'appelant en journalise l'identifiant (le
    -- back-office rattache sa ligne d'audit au mouvement), et un `null` l'y
    -- ferait écrire un trou. En READ COMMITTED, ce `select` prend un nouveau
    -- cliché : la ligne de la transaction concurrente, dont `do nothing` vient
    -- d'attendre la fin, y est visible.
    select e.id into v_entry_id
      from public.sms_credit_entries e
     where e.organization_id = p_organization_id
       and e.reason = 'purchase'
       and e.reference = p_reference
     limit 1;
  end if;

  -- `created = false` veut dire « ce mouvement existait déjà, le solde n'a pas
  -- bougé ». C'est ce que l'appelant doit journaliser, et c'est ce qu'il ne
  -- pouvait pas savoir tant que la fonction ne rendait qu'un identifiant.
  return query select v_entry_id, v_created;
end;
$$;

comment on function public.credit_sms_balance(uuid, integer, text, integer, text, text) is
  'Crédite des SMS (purchase ou adjustment) et rend le couple (entry_id, created). IDEMPOTENTE SUR LE PAIEMENT : un `purchase` portant une référence déjà créditée pour cette organisation rend le mouvement EXISTANT avec `created = false` — il n''en crée pas un second, ne lève pas, et le solde ne bouge pas. `created` EXISTE PARCE QUE L''APPELANT NE PEUT PAS LE DEVINER : une pré-lecture serait racée, et sans ce drapeau le back-office journalisait « N unités accordées » dans un audit impurgeable pour un crédit que l''index avait avalé. La garantie d''unicité est l''index sms_credit_entries_one_purchase_per_reference, pas cette fonction : le grand livre est append-only et aucun débit administratif n''existe, donc un double crédit serait irrattrapable, y compris quand la transaction a commité et que seule la réponse s''est perdue. Crée la ligne de solde à ZÉRO si besoin — le solde ne bouge ensuite que par le grand livre. `refund` est REFUSÉ ici : il n''existe que par refund_sms_credit, seul à savoir relire le coût gelé de la ligne annulée. Le coût passé est gelé sur le mouvement. service_role uniquement.';

-- ⚠️ REPOSER L'ACL N'EST PAS COSMÉTIQUE APRÈS UN DROP. La fonction recréée naît
-- avec les privilèges par défaut, et l'`alter default privileges` de Supabase
-- accorde EXECUTE largement (ADR-049). Sans ces deux lignes, `authenticated`
-- pourrait se créditer lui-même des SMS.
revoke all on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  to service_role;
