-- ============================================================
-- Lastchance — deux trouvailles ÉLEVÉ du canal SMS, fermées EN BASE
-- ============================================================
--
-- Catalogue vivant vérifié AVANT écriture — `grep -l "function public.<nom>"
-- supabase/migrations/*.sql` doit rendre, pour chacune, exactement les
-- fichiers listés :
--
--   request_sms_sender   → 20260824120000 (origine) + celui-ci   = 2 fichiers
--   credit_sms_balance   → 20260825120000 (origine) + celui-ci   = 2 fichiers
--   sms_sender_for_send  → 20260824120000 SEUL — non redéfinie ici, mais lue
--                          par le raisonnement ci-dessous : c'est elle qui
--                          fait que « non déclaré = pas d'envoi ».
--
-- Les deux corps repris ci-dessous le sont depuis la migration d'origine ET
-- vérifiés identiques au catalogue vivant (`pg_get_functiondef`) : aucune
-- migration intermédiaire ne les a redéfinis, ce qui a été mesuré et non
-- supposé. Les deux signatures sont INCHANGÉES — `create or replace` conserve
-- l'OID et l'ACL. C'est délibéré : `sms_credit_ledger.test.sql:407,410`
-- nomment la signature complète de `credit_sms_balance` dans deux
-- `has_function_privilege`, qui LÈVENT si elle change, tuant le fichier entier
-- avant `finish()` — sans plan et sans compte. Les `revoke`/`grant` sont
-- néanmoins reposés ci-dessous, pour que la migration reste lisible seule.
--
--
-- ════════════════════════════════════════════════════════════
-- ÉLEVÉ 1 — LE COMMERÇANT EFFAÇAIT LUI-MÊME SA SUSPENSION
-- ════════════════════════════════════════════════════════════
--
-- `request_sms_sender` (20260824120000:250-270) remettait à `pending` TOUTE
-- ligne qui n'était pas `declared` et non retirée :
--
--     status = case when s.status = 'declared' and s.retired_at is null
--                   then s.status else 'pending' end
--
-- et posait `retired_at = null` SANS CONDITION. Le commentaire de la migration
-- d'origine ne décrivait que le cas RETIRÉ ; le `else` couvrait aussi
-- `rejected` ET `suspended`. C'est cet écart entre ce que le commentaire
-- affirmait et ce que le code faisait qui a laissé passer le défaut — le
-- commentaire de 20260824120000 est corrigé dans le même lot pour le dire.
--
-- Le défaut était INATTEIGNABLE tant que la RPC n'avait aucun appelant. Le
-- chantier en cours vient de lui en donner un : l'écran expéditeur du
-- commerçant.
--
-- ── LE SCÉNARIO ─────────────────────────────────────────────
--
-- La plateforme suspend l'expéditeur après une plainte AF2M
-- (`set_sms_sender_status(…, 'suspended', 'plainte AF2M')` → `status =
-- 'suspended'`, `declared_at = null`, `af2m_reference = null`, motif écrit
-- dans `status_reason`). Le propriétaire ouvre son écran, retape le même nom,
-- clique. La ligne repasse `pending`, `retired_at = null` : LA SANCTION
-- N'EXISTE PLUS COMME ÉTAT, et la demande retombe dans la file de déclaration
-- de la plateforme, où un opérateur qui traite les `pending` la redéclarera —
-- de bonne foi, sans jamais voir qu'il rouvre un expéditeur sanctionné.
--
-- ⚠️ UNE PRÉCISION QUI CORRIGE LA DESCRIPTION D'ORIGINE DE CE DÉFAUT, et qui
-- compte parce que sur-décrire est la faute même qu'on répare ici : le MOTIF
-- ne disparaît PAS de la base. `request_sms_sender` ne touche pas
-- `status_reason` — ni avant ni après cette migration — donc « plainte AF2M »
-- reste écrit sur la ligne. Ce qui disparaît, c'est l'ÉTAT qui lui donnait son
-- sens : le motif se retrouve accroché à un `pending`, où il se lit comme une
-- note périmée, et où tout écran qui n'affiche le motif que pour `rejected` et
-- `suspended` cesse de le montrer. Le test le mesure : sous sabotage,
-- l'assertion sur `status_reason` reste VERTE ; ce sont celles sur `status` et
-- `retired_at` qui rougissent. Elle est conservée parce que « le correctif
-- n'efface pas non plus le motif » est une propriété vraie — mais elle n'est
-- pas le discriminant, et le fichier de test le dit.
--
-- ── CE QUE CE N'EST PAS, ET IL FAUT LE GARDER JUSTE ─────────
--
-- Aucun SMS ne repart tout seul. `sms_sender_for_send` exige `declared`, et un
-- `pending` rend `null` comme un `suspended`. Le gain n'est pas l'envoi : c'est
-- L'EFFACEMENT UNILATÉRAL D'UNE DÉCISION PLATEFORME sur une identité
-- réglementée, et la remise en file qui s'ensuit.
--
-- ── LE CHOIX : NE RIEN RÉÉCRIRE, ET RENDRE L'IDENTIFIANT ────
--
-- Deux corrections étaient possibles : lever, ou rendre l'identifiant sans
-- rien réécrire. C'est la seconde, pour quatre raisons dans l'ordre de leur
-- poids :
--
--   a) LA SYMÉTRIE AVEC `declared` REND LA RÈGLE GÉNÉRALE. Le code laissait
--      déjà `declared` intact et rendait l'identifiant. `suspended` reçoit
--      exactement le même traitement, et la règle cesse d'être une liste de
--      cas pour devenir une phrase : *`request_sms_sender` ne fait avancer que
--      ce qui peut avancer ; elle ne défait aucun état posé par la
--      plateforme.* Une règle énumérative aurait manqué le prochain état.
--
--   b) LA SANCTION RESTE LISIBLE À L'ÉCRAN, ce qu'une exception ne ferait que
--      dupliquer. `status` et `status_reason` sont tous deux couverts par
--      `sms_senders_owner_read` : le propriétaire voit « suspendu » et son
--      motif. Le message appartient à l'écran, qui lit la ligne ; la base doit
--      seulement cesser de la détruire — et l'identifiant rendu est
--      précisément ce qui permet de la relire.
--
--   c) LE CONTRAT DE LA FONCTION RESTE TOTAL. Elle est documentée
--      « idempotente sur le nom, rend l'identifiant de la ligne ». Une
--      suspension est un ÉTAT de la ligne, pas une erreur de l'appel. Lever
--      ferait recevoir une exception à tout appelant qui l'utilise pour
--      « s'assurer que l'expéditeur existe », y compris sur le double-clic
--      qu'elle a été écrite pour absorber.
--
--   d) LE CHEMIN DE SORTIE EXISTE ET APPARTIENT À LA PLATEFORME :
--      `set_sms_sender_status(…, 'pending', …)`. Ne rien réécrire ne crée donc
--      aucune impasse — cela déplace seulement la levée de la sanction du
--      commerçant vers celui qui l'a prononcée.
--
-- ⚠️ `retired_at` EST COUVERT PAR LA MÊME EXCLUSION, et ce n'est pas un détail.
-- Un `suspended` peut être RETIRÉ ensuite (`set_sms_sender_status(…,
-- 'retired')` conserve `s.status`). Ne corriger que `status` en laissant
-- `retired_at = null` inconditionnel rouvrirait une ligne sanctionnée à
-- moitié. La ligne suspendue n'est donc pas touchée DU TOUT : le `where`
-- l'exclut, plutôt que trois `case` de plus qui auraient chacun pu être
-- oubliés.
--
-- ── `rejected` : LE RESET EST GARDÉ, ET C'EST UNE DÉCISION ──
--
-- Elle est ÉCRITE ici plutôt qu'héritée du silence, ce qui était le vrai
-- défaut de la version d'origine.
--
-- Un refus de registre et une suspension se ressemblent — les deux rendent
-- l'expéditeur inutilisable — mais ne sont pas de même nature :
--
--   • `rejected` est un VERDICT SUR UN DOSSIER, que le commerçant peut
--     compléter (un Kbis prouvant que le nom demandé est bien son nom
--     commercial est le cas ordinaire). Redemander le même nom après avoir
--     réuni ses pièces est le geste légitime, et le seul qu'il ait.
--   • `suspended` est une SANCTION consécutive à une plainte ou à un abus.
--     Sa levée est une décision de celui qui l'a prononcée.
--
-- Le reset d'un `rejected` ne rend d'ailleurs rien d'utilisable : il le remet
-- en attente de déclaration, et seule `declare_sms_sender` — qui exige la
-- référence de registre — rouvre le canal. Le pire cas est une boucle
-- demande/refus, qui coûte à la plateforme un traitement, jamais un envoi.
--
-- `status_reason` n'est délibérément pas effacé au passage : « en attente,
-- refusé précédemment pour X » est plus informatif qu'une attente muette, et
-- c'est le comportement existant — cette migration ne le change pas.
--
--
-- ════════════════════════════════════════════════════════════
-- ÉLEVÉ 2 — LE DOUBLE CRÉDIT IRRATTRAPABLE
-- ════════════════════════════════════════════════════════════
--
-- Le webhook Stripe (`src/app/api/stripe/webhook/route.ts`) prend l'événement
-- dans `stripe_events` AVANT de créditer, puis SUPPRIME la prise si
-- `credit_sms_balance` rend une erreur, pour que le rejeu agisse. Le
-- raisonnement suppose « erreur = rien n'a été écrit ». Vrai quand la RPC
-- lève. FAUX quand la transaction a COMMITÉ et que la réponse s'est perdue :
-- supabase-js rend `{ error }` pour une coupure de pooler exactement comme
-- pour une exception SQL. Les deux cas sont INDISTINGUABLES au point d'appel —
-- et aucun geste de l'appelant ne peut les distinguer, ce qui est la raison de
-- corriger ici et non là-bas.
--
-- ── LE SCÉNARIO, SANS AUCUN ATTAQUANT ───────────────────────
--
-- Achat de 2 000 SMS. `credit_sms_balance` commit ; le pooler coupe avant la
-- réponse ; le handler lit une erreur, supprime la prise, répond 500 ; Stripe
-- rejoue dans les minutes qui suivent ; la prise n'existe plus ; la RPC crédite
-- une SECONDE fois. 4 000 crédits pour un paiement de 2 000.
--
-- Et le surplus est IRRATTRAPABLE : `sms_credit_entries` est append-only
-- (`sms_credit_entries_append_only`), `credit_sms_balance` refuse les deltas
-- négatifs, `refund_sms_credit` exige le rattachement à un envoi réel, et
-- aucun débit administratif n'existe. Il n'y a, dans tout le schéma, aucune
-- porte pour reprendre 2 000 crédits.
--
-- ── LA CORRECTION DESCEND L'IDEMPOTENCE AU GRAND LIVRE ──────
--
-- Plutôt que de la laisser dans l'appelant, où elle dépend d'un `delete` de
-- prise dont on vient de voir qu'il ne peut pas être décidé correctement.
-- Trois gestes :
--
--   1. un index unique partiel sur `(organization_id, reference)` pour
--      `reason = 'purchase' and reference is not null` ;
--   2. `credit_sms_balance` rend le mouvement DÉJÀ EXISTANT sur conflit, au
--      lieu de lever ;
--   3. la clé d'idempotence devient alors LE PAIEMENT (`stripe:<session>`) et
--      non plus l'événement. Un même paiement rejoué sous un autre
--      identifiant d'événement — exactement ce que produit la prise relâchée —
--      retombe sur la même ligne de grand livre.
--
-- LA PROPRIÉTÉ EST À L'INDEX, PAS DANS LA FONCTION. C'est ce qui la rend vraie
-- pour un écrivain qui contournerait la RPC, et c'est la doctrine déjà
-- appliquée à `sms_credit_entries_one_reversal` : « contrainte, pas garde
-- applicative », parce qu'un prestataire qui rejoue est un cas ordinaire.
--
-- ⚠️ POURQUOI `purchase` SEUL, ET PAS `adjustment`. Un ajustement est par
-- définition un geste manuel répétable — deux gestes commerciaux successifs
-- sous le même libellé sont deux gestes, pas un doublon. L'index les
-- confondrait et en avalerait un en silence. Le prédicat de l'index est donc
-- la frontière entre « un fait extérieur qui peut être rejoué » et « une
-- décision humaine qui peut être répétée ».
--
-- ⚠️ CONSÉQUENCE SUR LE BACK-OFFICE PLATEFORME, à relayer et non à découvrir.
-- `merchantSmsCreditSchema` rend `reference` OBLIGATOIRE et propose
-- `purchase`. Deux crédits `purchase` accordés à la même organisation sous la
-- MÊME référence ne comptent donc plus que pour un. C'est un gain dans le cas
-- fréquent — le double clic d'un opérateur crédite aujourd'hui deux fois, de
-- façon irréversible — et une surprise possible dans le cas rare d'un second
-- lot délibéré sous le même libellé. Ce second cas a deux sorties : varier la
-- référence, ou passer par `adjustment`, que l'index ne touche pas.
--
-- ⚠️ CE QUE L'INDEX NE COUVRE PAS, écrit plutôt que tu : un `purchase` SANS
-- référence n'a aucune clé d'idempotence et reste donc dédoublable. Ce n'est
-- pas un oubli — un achat sans référence est un achat dont on ne peut pas
-- dire s'il est le même que le précédent. Les deux appelants applicatifs
-- fournissent une référence (`stripe:<session>` pour le webhook, un champ
-- obligatoire pour le back-office) ; la porte reste ouverte pour un appelant
-- futur qui n'en fournirait pas, et un tel appelant devrait être refusé à
-- l'écriture, pas rattrapé ici.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. `request_sms_sender` ne défait plus une suspension
-- ────────────────────────────────────────────────────────────
create or replace function public.request_sms_sender(
  p_organization_id uuid,
  p_sender_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- Normalisation de saisie, et RIEN DE PLUS. On met en majuscules et on
  -- retire les espaces de bordure, parce que « MaBoulangerie » et « MABOULANGERIE »
  -- sont le même nom commercial. On ne retire PAS les caractères interdits :
  -- un « CAFÉ DU COIN » silencieusement transformé en « CAFEDUCOIN » serait un
  -- nom que le commerçant n'a pas choisi et qu'il découvrirait sur le
  -- téléphone de ses clients. Le CHECK refuse, l'appelant affiche pourquoi.
  v_name := pg_catalog.upper(pg_catalog.btrim(coalesce(p_sender_id, '')));

  if v_name !~ '^[A-Z0-9]{1,11}$' then
    raise exception
      'expéditeur SMS invalide : 11 caractères maximum, lettres non accentuées et chiffres uniquement (reçu : %)',
      coalesce(p_sender_id, '(null)');
  end if;

  select s.id into v_id
    from public.sms_senders s
   where s.organization_id = p_organization_id
     and s.sender_id = v_name
   limit 1;

  if v_id is not null then
    -- CE QUE CETTE MISE À JOUR FAIT, ÉTAT PAR ÉTAT — la liste est exhaustive
    -- parce que le `check` de `sms_senders.status` ferme les quatre valeurs :
    --
    --   declared, non retiré  ne bouge pas. Une déclaration obtenue au bout de
    --                         plusieurs jours ne se perd pas sur un double clic.
    --   declared, RETIRÉ      revient en service au stade `pending` : la
    --                         déclaration est effacée, il faudra la refaire.
    --   pending               ne change rien de significatif (déjà en attente),
    --                         mais lève un éventuel retrait.
    --   rejected              repasse en `pending`. DÉLIBÉRÉ : un refus porte
    --                         sur un dossier que le commerçant peut compléter,
    --                         redemander est son seul geste. Voir l'en-tête.
    --   suspended             N'EST PAS TOUCHÉE DU TOUT — `where` ci-dessous.
    --                         Une sanction de la plateforme ne se lève pas par
    --                         un clic de celui qu'elle vise. L'identifiant est
    --                         quand même rendu : c'est ce qui permet à l'écran
    --                         de relire l'état et son motif.
    update public.sms_senders s
       set retired_at = null,
           status = case when s.status = 'declared' and s.retired_at is null
                         then s.status else 'pending' end,
           declared_at = case when s.status = 'declared' and s.retired_at is null
                              then s.declared_at else null end,
           af2m_reference = case when s.status = 'declared' and s.retired_at is null
                                 then s.af2m_reference else null end
     where s.id = v_id
       -- ⚠️ L'EXCLUSION PORTE SUR LA LIGNE ENTIÈRE, et non sur chacune des
       -- quatre colonnes. `retired_at = null` est inconditionnel juste
       -- au-dessus : un `case` de plus l'aurait laissé passer, et une ligne
       -- suspendue puis retirée se serait rouverte à moitié.
       and s.status <> 'suspended';
    return v_id;
  end if;

  insert into public.sms_senders (organization_id, sender_id)
  values (p_organization_id, v_name)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.request_sms_sender(uuid, text) is
  'Demande un expéditeur SMS pour une organisation. Met en majuscules et coupe les bordures, mais NE retire PAS les caractères interdits : un nom silencieusement transformé serait un nom que le commerçant n''a pas choisi et découvrirait chez ses clients. État initial `pending` — jamais utilisable avant déclaration AF2M. Ne fait AVANCER que ce qui peut avancer : elle ne défait aucun état posé par la plateforme. Une ligne `declared` non retirée n''est pas touchée (une déclaration acquise ne se perd pas sur un double clic) ; une ligne `suspended` n''est pas touchée NON PLUS, ni son statut ni son retrait — une sanction ne se lève que par set_sms_sender_status, et l''identifiant rendu permet à l''écran d''en relire le motif. Un `rejected` repasse en `pending`, délibérément : un refus de registre porte sur un dossier que le commerçant peut compléter, pas sur une faute. service_role uniquement.';

revoke all on function public.request_sms_sender(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_sms_sender(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────
-- 2. L'unicité de l'achat, en INDEX
-- ────────────────────────────────────────────────────────────
--
-- CONTRÔLE PRÉ-DÉPLOIEMENT, sur le modèle de `contest_awards_org_code_uniq`
-- (20260804120000). `if not exists` ne protège que de la RE-création : si des
-- doublons préexistent, l'index échoue sur un « could not create unique
-- index » qui ne dit ni combien de lignes sont en cause ni quoi en faire. On
-- lève donc d'abord une erreur explicite et actionnable.
--
-- La production porte ZÉRO achat au moment d'écrire ceci — l'achat par Stripe
-- vient d'être ouvert et le back-office n'a crédité personne. Ce bloc n'est
-- donc pas attendu au travail ; il existe pour que, s'il l'était, l'échec soit
-- diagnosticable en une lecture plutôt qu'en une enquête.
do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (
    select 1
      from public.sms_credit_entries
     where reason = 'purchase'
       and reference is not null
     group by organization_id, reference
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'sms_credit_entries : % couple(s) (organization_id, reference) en double sur des achats — l''index unique sms_credit_entries_one_purchase_per_reference ne peut pas être créé',
      v_dupes
      using hint =
        'Lister les doublons : select organization_id, reference, count(*) '
        || 'from public.sms_credit_entries where reason = ''purchase'' '
        || 'and reference is not null group by 1, 2 having count(*) > 1; '
        || 'Chaque groupe est un paiement crédité plusieurs fois. Le grand livre '
        || 'étant append-only, la ligne surnuméraire ne se supprime PAS : '
        || 'décider au cas par cas (geste commercial assumé, ou correction par '
        || 'un mouvement adjustment négatif inséré en service_role) AVANT de '
        || 'rejouer la migration.';
  end if;
end
$$;

-- ⚠️ L'IDEMPOTENCE DE L'ACHAT, en contrainte et non en garde applicative.
-- Un même paiement rejoué par Stripe — cas ordinaire, pas hypothétique, et
-- ici provoqué par le 500 que le handler renvoie lui-même — créditerait sinon
-- une seconde fois, sans aucun recours : le grand livre est append-only et
-- aucun débit administratif n'existe.
create unique index if not exists sms_credit_entries_one_purchase_per_reference
  on public.sms_credit_entries (organization_id, reference)
  where reason = 'purchase' and reference is not null;

comment on index public.sms_credit_entries_one_purchase_per_reference is
  'Un paiement ne se crédite QU''UNE FOIS. La clé d''idempotence est la référence du paiement (stripe:<session>), donc le PAIEMENT — pas l''événement Stripe, dont l''identifiant change au rejeu. Partiel sur `purchase` à dessein : un `adjustment` est un geste manuel répétable, deux gestes successifs sous le même libellé sont deux gestes et non un doublon. Un `purchase` SANS référence n''a pas de clé et reste dédoublable — un achat sans référence est un achat dont on ne peut pas dire s''il est le même que le précédent.';

-- ────────────────────────────────────────────────────────────
-- 3. `credit_sms_balance` rend le mouvement existant sur conflit
-- ────────────────────────────────────────────────────────────
create or replace function public.credit_sms_balance(
  p_organization_id uuid,
  p_units integer,
  p_reason text default 'purchase',
  p_unit_cost_micros integer default null,
  p_reference text default null,
  p_destination_country text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
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

  if v_entry_id is null then
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

  return v_entry_id;
end;
$$;

comment on function public.credit_sms_balance(uuid, integer, text, integer, text, text) is
  'Crédite des SMS (purchase ou adjustment) et rend l''identifiant du mouvement. IDEMPOTENTE SUR LE PAIEMENT : un `purchase` portant une référence déjà créditée pour cette organisation rend le mouvement EXISTANT — il n''en crée pas un second et ne lève pas. La garantie est l''index sms_credit_entries_one_purchase_per_reference, pas cette fonction : le grand livre est append-only et aucun débit administratif n''existe, donc un double crédit serait irrattrapable, y compris quand la transaction a commité et que seule la réponse s''est perdue. Crée la ligne de solde à ZÉRO si besoin — le solde ne bouge ensuite que par le grand livre. `refund` est REFUSÉ ici : il n''existe que par refund_sms_credit, seul à savoir relire le coût gelé de la ligne annulée. Le coût passé est gelé sur le mouvement. service_role uniquement.';

revoke all on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.credit_sms_balance(uuid, integer, text, integer, text, text)
  to service_role;
