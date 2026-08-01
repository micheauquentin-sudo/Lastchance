-- ============================================================
-- Lastchance — le crédit SMS se compte en SEGMENTS, pas en messages
-- ============================================================
--
-- Catalogue vivant vérifié AVANT écriture (`grep -l "function public.<nom>"`
-- dans supabase/migrations) :
--   claim_sms_delivery  → 20260823120000 ET 20260826120000   (DEUX fichiers)
--   debit_sms_credit    → 20260825120000, UN seul       (NON redéfini ici)
--   refund_sms_credit   → 20260825120000, UN seul       (NON redéfini ici)
--   finish_sms_delivery → 20260823120000 ET 20260826120000   (NON redéfini ici)
--
-- ⚠️ `claim_sms_delivery` EXISTE EN DEUX EXEMPLAIRES, et c'est tout l'intérêt
-- de cette vérification. Celui qui fait foi est `20260826120000`, le PLUS
-- RÉCENT : lui seul porte la normalisation E.164, la porte d'expéditeur AF2M
-- et le débit du crédit. Le corps repris ci-dessous en part INTÉGRALEMENT.
--
-- Partir de `20260823120000` aurait fait régresser trois gardes d'un coup —
-- et ce genre de régression ne se voit PAS à la relecture du diff, puisque le
-- fichier produit est syntaxiquement irréprochable et que la fonction
-- continue de rendre un booléen. C'est l'erreur déjà payée deux fois dans ce
-- projet : une escalade de privilège (un caissier créant campagnes et lots,
-- PR #40) et une borne anti-fraude effacée (PR #41), toutes deux nées d'une
-- lecture de l'archive à la place du catalogue vivant.
--
--
-- ══ 1. LE DÉFAUT CORRIGÉ ═══════════════════════════════════════
--
-- Le grand livre débite UN crédit par message. Le prestataire facture PAR
-- SEGMENT : 160 caractères en alphabet GSM-7, et seulement 70 dès qu'un seul
-- caractère hors GSM-7 apparaît — un « ê » dans le nom d'un lot, une emoji
-- dans celui d'une enseigne — auquel cas le message ENTIER bascule en UCS-2.
--
-- Un message long creuse donc un écart SILENCIEUX entre ce que paie le
-- commerçant (1) et ce que coûte réellement l'envoi (2, 3, parfois plus). Le
-- sens de l'écart est contre la plateforme, jamais contre le commerçant, ce
-- qui explique qu'il ait pu vivre sans se signaler : personne ne réclame une
-- facture trop basse.
--
-- L'écart était déjà MESURÉ — `sms-dispatch.ts` incrémente `sms.multipart`
-- quand le prestataire annonce plus d'un segment — mais un compteur ne
-- facture pas. Cette migration ferme la porte que le compteur avait ouverte.
--
--
-- ══ 2. CE QUI ÉTAIT DÉJÀ JUSTE, ET QUI N'EST PAS TOUCHÉ ════════
--
-- Vérifié dans `20260825120000` avant d'écrire une seule ligne, parce qu'un
-- correctif qui redéfinit ce qui fonctionne déjà est un correctif qui ajoute
-- du risque sans ajouter de valeur :
--
--   • `debit_sms_credit(p_organization_id, p_units integer default 1, …)`
--     ACCEPTE DÉJÀ N unités et les clampe (`greatest(coalesce(p_units,1),1)`).
--     Elle n'a jamais eu besoin d'être corrigée : elle n'a jamais reçu autre
--     chose que 1.
--   • `refund_sms_credit` insère `-v_src.delta_units`, c'est-à-dire EXACTEMENT
--     ce qui a été débité, relu sur la ligne annulée. Un remboursement de trois
--     segments rend donc trois unités sans la moindre modification — la
--     propriété tient parce qu'elle a été écrite en termes du mouvement et non
--     en termes de « un SMS ».
--
-- LE DÉFAUT ÉTAIT DONC ENTIÈREMENT CHEZ L'APPELANT : `claim_sms_delivery`
-- passait le littéral `1` à ses deux appels de débit. Toute la chaîne en aval
-- était prête depuis `20260825120000`.
--
--
-- ══ 3. LE PIÈGE DE CETTE MIGRATION, ET IL EST FATAL ════════════
--
-- `create or replace function` NE PEUT PAS ajouter un paramètre. L'identité
-- d'une fonction Postgres inclut ses types d'arguments : un `create or
-- replace` à sept paramètres ne remplacerait pas celle à six, il en créerait
-- une SECONDE.
--
-- Deux fonctions vivantes cohabiteraient alors, et l'ancienne — toujours
-- résolue pour tout appelant qui ne nomme pas `p_segments` — continuerait de
-- débiter 1. Le correctif serait livré, testé, vert, et sans aucun effet en
-- production. C'est exactement la classe de résidu que `20260826120000` avait
-- fermée par un `drop` explicite pour l'ancienne signature à cinq paramètres.
--
-- D'où le `drop` ci-dessous, AVANT la création. Il emporte les privilèges avec
-- lui : les `revoke`/`grant` sont donc reposés à l'identique, sans quoi la
-- fonction devient inappelable par `service_role` et le canal SMS entier
-- devient muet — un échec silencieux, puisque le worker traiterait le refus
-- comme un envoi refusé de plus.
--
-- `p_segments` est ajouté EN DERNIER. PostgREST appelle par nom, donc l'ordre
-- n'a aucune importance applicative ; le placer en queue avec un défaut laisse
-- valides tous les appels positionnels existants.
--
-- ⚠️ CE QUE LA QUEUE NE SAUVE PAS, constaté et corrigé dans le même lot : les
-- assertions pgTAP qui NOMMENT la signature complète
-- (`has_function_privilege(…, 'public.claim_sms_delivery(uuid,text,text,text,
-- integer,text)', 'EXECUTE')`) désignent une fonction qui n'existe plus, et
-- `has_function_privilege` ne rend alors pas `false` — ELLE LÈVE, ce qui tue
-- le fichier de test entier avant son `finish()`, donc sans plan et sans
-- compte. Quatre assertions dans deux fichiers sont mises à jour ; le piège
-- est documenté noir sur blanc dans `sms_foundation.test.sql`, où il avait
-- déjà été payé une fois.
--
--
-- ══ 4. LA BORNE À SIX, ET SON ARBITRAGE ════════════════════════
--
-- Six segments = 918 caractères en GSM-7, 402 en UCS-2. Les messages composés
-- par ce produit sont budgétés à UN segment (`sms-prize.ts` : 24 caractères
-- pour l'enseigne, 40 pour le lot) ; au-delà de six, on n'est plus devant un
-- message long mais devant une anomalie de composition ou un appelant fautif.
--
-- On CLAMPE plutôt que de lever, pour deux raisons :
--   • `claim_sms_delivery` promet un booléen. Lever ici ferait remonter une
--     exception au worker là où son contrat annonce « envoyez / n'envoyez
--     pas » — le défaut déjà traité en § 5 de `20260826120000` pour le numéro
--     trop court ;
--   • c'est le comportement de `debit_sms_credit`, qui clampe déjà par le
--     bas. Deux fonctions de la même chaîne qui traitent différemment une
--     entrée aberrante finissent par diverger.
--
-- L'ARBITRAGE EST ASSUMÉ ET IL FAUT LE DIRE : un message de huit segments ne
-- débitera que six, donc l'écart n'est pas fermé à 100 %, il est ramené d'un
-- facteur illimité à un facteur borné. La borne protège le solde du commerçant
-- contre un débit fou bien plus qu'elle ne protège la plateforme ; le compteur
-- `sms.multipart` reste en place pour mesurer ce qui subsiste.
-- ============================================================

-- ── 1. Le journal apprend le nombre de segments ─────────────
--
-- `default 1` : toute ligne écrite avant cette migration décrivait un message
-- réellement facturé une unité — la valeur par défaut n'est donc pas une
-- approximation commode, c'est la vérité historique.
alter table public.sms_log
  add column if not exists segments integer not null default 1
    check (segments between 1 and 6);

comment on column public.sms_log.segments is
  'Nombre de segments facturés pour CE message (1 = un SMS ordinaire). Le prestataire facture par segment — 160 caractères en GSM-7, 70 en UCS-2 dès un seul caractère hors alphabet — alors que le grand livre débitait un crédit par message : c''est l''écart silencieux que cette colonne ferme. Borné à 6 : au-delà on n''est plus devant un message long mais devant une anomalie de composition, et le clamp protège le solde du commerçant d''un débit fou. EN CAS DE DÉSACCORD, LE GRAND LIVRE FAIT FOI pour la facturation : cette colonne dit ce que la tentative COURANTE a estimé, sms_credit_entries.delta_units dit ce qui a été réellement débité.';

-- ── 2. Retirer l'ancienne signature AVANT de créer ──────────
--
-- Voir le § 3 de l'en-tête : sans ce `drop`, la création ci-dessous produit
-- une SURCHARGE et non un remplacement, l'ancienne reste résolue pour tout
-- appelant qui ne nomme pas `p_segments`, et le correctif n'a aucun effet.
drop function if exists public.claim_sms_delivery(uuid, text, text, text, integer, text);

-- ── 3. LA PORTE D'ENVOI, qui compte enfin ce qu'elle facture ─
--
-- Corps repris INTÉGRALEMENT de `20260826120000` — le catalogue vivant, pas
-- `20260823120000` (voir l'en-tête). Les cinq refus, leur ordre, le débit en
-- dernier, le scope d'organisation sur le `for update` et le numéro normalisé
-- écrit dans `sms_log.recipient` sont inchangés. Seules changent : la lecture
-- de `p_segments`, et le nombre d'unités passé aux deux débits.
create or replace function public.claim_sms_delivery(
  p_organization_id uuid,
  p_scenario text,
  p_recipient text,
  p_dedup_key text,
  p_stale_after_seconds integer default 900,
  p_destination_country text default 'FR',
  p_segments integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.sms_log;
  v_stale integer;
  v_key text;
  v_sender text;
  v_entry_id uuid;
  -- Clampé des DEUX côtés, et ici plutôt que dans l'appelant : le worker
  -- estime les segments à partir du texte, et une estimation est exactement le
  -- genre d'entrée qui rend un jour zéro, un négatif, ou un nombre absurde.
  -- Voir le § 4 de l'en-tête pour l'arbitrage de la borne haute.
  v_segments integer := least(greatest(coalesce(p_segments, 1), 1), 6);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- (1) Numéro illisible ou inenvoyable : rien à composer, donc rien à
  -- réserver — et un `false`, JAMAIS une exception.
  --
  -- Le second membre n'est pas de la ceinture-bretelles. `sms_phone_e164` peut
  -- rendre une forme plus courte que ce que le CHECK de `sms_log.recipient`
  -- accepte : « 000000 » y devient « +0000 », cinq caractères contre six
  -- exigés. L'insertion LÈVERAIT alors, et le worker recevrait une exception
  -- là où le contrat de cette fonction promet un booléen. La transaction
  -- avorterait proprement, aucun crédit ne serait perdu — mais « ce numéro
  -- n'est pas envoyable » est un état ORDINAIRE, pas une anomalie, et le
  -- traiter comme une panne ferait remonter du bruit à la place du signal.
  --
  -- On vérifie donc ici, contre LE MÊME motif que la contrainte. Corriger
  -- plutôt `sms_phone_e164` était exclu : elle est figée par les deux colonnes
  -- calculées (voir 20260826120000, § 2 de son en-tête), et la remplacer sans
  -- les rejouer laisserait les clés déjà stockées au format d'hier.
  v_key := public.sms_phone_e164(p_recipient, 'FR');
  if v_key is null or v_key !~ '^\+?[0-9 .()\-]{6,20}$' then
    return false;
  end if;

  -- (2) CONSENTEMENT D'ABORD, et ici plutôt que dans l'appelant : une cible
  -- calculée quelques minutes plus tôt peut contenir un numéro retiré
  -- entre-temps, et c'est l'instant du retrait qui compte.
  if not exists (
    select 1 from public.sms_consents c
     where c.organization_id = p_organization_id
       and c.phone_key = v_key
       and c.revoked_at is null
  ) then
    return false;
  end if;

  -- (3) EXPÉDITEUR DÉCLARÉ AF2M. C'est ici que « tant qu'il n'est pas déclaré,
  -- on ne peut pas envoyer sous ce nom » cesse d'être une phrase de
  -- documentation. Sans ce refus, le SMS part sous un nom que le registre ne
  -- connaît pas : refusé par l'opérateur au mieux, et facturé dans tous les
  -- cas.
  v_sender := public.sms_sender_for_send(p_organization_id);
  if v_sender is null then
    return false;
  end if;

  v_stale := least(greatest(coalesce(p_stale_after_seconds, 900), 60), 86400);

  -- SCOPÉ À L'ORGANISATION, comme l'index unique `sms_log_org_dedup_unique`.
  -- Sans ce prédicat, le worker de A verrouille, reprend et RÉÉCRIT la ligne de
  -- B : elle garde `organization_id = B`, donc reste lisible par le
  -- propriétaire de B, et reçoit le numéro d'un client de A.
  select * into v_existing
    from public.sms_log l
   where l.organization_id = p_organization_id
     and l.dedup_key = p_dedup_key
   for update;

  if v_existing.id is not null then
    -- (4a) Déjà parti : ne JAMAIS renvoyer. Cas nominal d'un rejeu de job.
    if v_existing.status = 'sent' then
      return false;
    end if;

    -- (4b) Échec DÉFINITIF : terminal. Le crédit a été rendu ; autoriser une
    -- reprise ici donnerait la boucle « rembourser puis renvoyer », c'est-à-dire
    -- des SMS gratuits à volonté.
    if v_existing.status = 'undeliverable' then
      return false;
    end if;

    -- (4c) Réservé et encore frais : un autre worker est dessus.
    if v_existing.status = 'sending'
       and v_existing.claimed_at > pg_catalog.clock_timestamp()
                                   - pg_catalog.make_interval(secs => v_stale) then
      return false;
    end if;

    -- (5) Reprise. Le crédit n'est débité QUE s'il ne l'a jamais été pour ce
    -- `dedup_key` : un échec temporaire réutilise le crédit déjà consommé.
    --
    -- ⚠️ CETTE ASYMÉTRIE EST VOULUE, et elle mérite d'être nommée maintenant
    -- que le débit porte un nombre : `segments` est réécrit dans les DEUX cas,
    -- le débit ne l'est que si rien n'a jamais été payé. Une reprise qui
    -- annoncerait un compte de segments différent de la tentative payée
    -- laisserait donc la colonne et le grand livre en désaccord — c'est
    -- pourquoi le commentaire de la colonne dit lequel des deux fait foi.
    -- L'alternative (redébiter la différence) rouvrirait exactement la porte
    -- que `credit_entry_id` existe pour fermer : trois tentatives sur un
    -- opérateur en panne factureraient trois fois un seul message.
    v_entry_id := v_existing.credit_entry_id;
    if v_entry_id is null then
      v_entry_id := public.debit_sms_credit(
        p_organization_id, v_segments, p_dedup_key, p_destination_country);
      if v_entry_id is null then
        return false;
      end if;
    end if;

    -- Reprendre la MÊME ligne, jamais en insérer une seconde : c'est la clé
    -- unique qui ferme le doublon, et la reprise doit rester dedans.
    update public.sms_log l
       set status = 'sending',
           attempts = least(l.attempts + 1, 100),
           recipient = v_key,
           sender_id = v_sender,
           segments = v_segments,
           credit_entry_id = v_entry_id,
           claimed_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where l.id = v_existing.id;

    return true;
  end if;

  -- (5) Première réservation : on débite AVANT d'écrire, pour que l'échec de
  -- crédit n'ait laissé aucune ligne derrière lui. Les deux gestes sont dans
  -- la même transaction : ni facturation sans réservation, ni réservation
  -- sans facturation.
  --
  -- C'EST ICI QUE LE DÉFAUT VIVAIT : le littéral `1`, quel que soit le nombre
  -- de segments réellement facturés par le prestataire.
  v_entry_id := public.debit_sms_credit(
    p_organization_id, v_segments, p_dedup_key, p_destination_country);
  if v_entry_id is null then
    return false;
  end if;

  insert into public.sms_log (
    organization_id, scenario, recipient, dedup_key, status,
    sender_id, segments, credit_entry_id
  ) values (
    p_organization_id, p_scenario, v_key, p_dedup_key, 'sending',
    v_sender, v_segments, v_entry_id
  );

  return true;
end;
$$;

comment on function public.claim_sms_delivery(uuid, text, text, text, integer, text, integer) is
  'Réserve un envoi SMS. true = envoyez, false = n''envoyez pas. Cinq refus, dans cet ordre : numéro illisible OU inenvoyable (trop court pour le CHECK du journal — un false, jamais une exception), consentement absent ou retiré, expéditeur non déclaré AF2M, message déjà parti / définitivement échoué / tenu par un autre worker, crédit insuffisant. Tout est SCOPÉ À L''ORGANISATION, y compris le for update et la clé unique : sinon le worker de A reprend et réécrit la ligne de B. LE DÉBIT EST EN DERNIER et dans la même transaction que la réservation : ni facturation sans réservation, ni réservation sans facturation. LE DÉBIT PORTE p_segments UNITÉS, PAS UNE : le prestataire facture par segment (160 caractères en GSM-7, 70 en UCS-2), et débiter 1 pour un message de trois segments creusait un écart silencieux entre ce que paie le commerçant et ce que coûte l''envoi. Clampé entre 1 et 6, jamais une exception — la fonction promet un booléen. Un crédit par dedup_key, jamais par tentative : une reprise après échec temporaire réutilise le crédit déjà consommé et ne redébite RIEN, y compris si elle annonce un autre nombre de segments (le grand livre fait foi). Coût unitaire lu en base, jamais reçu de l''appelant. LE NUMÉRO À COMPOSER EST sms_log.recipient, écrit normalisé — renormaliser côté appelant créerait un second site de normalisation, et le SMS partirait un jour vers un numéro dont le consentement n''a pas été vérifié. service_role uniquement.';

-- ── 4. Les droits, reposés à l'identique ────────────────────
--
-- LE `drop` DU § 2 LES A EMPORTÉS. Les omettre ne casserait rien de visible à
-- la migration : c'est à l'exécution que `service_role` se verrait refuser
-- l'appel, et le worker traduirait ce refus en un envoi de plus qui ne part
-- pas. Le canal deviendrait muet sans qu'une seule erreur ne remonte.
--
-- Copiés mot pour mot de `20260826120000`, ADR-049 compris : `service_role`
-- est révoqué explicitement avant d'être réaccordé, pour que l'intention se
-- lise dans le fichier plutôt que de dépendre d'un `alter default privileges`.
revoke all on function public.claim_sms_delivery(uuid, text, text, text, integer, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sms_delivery(uuid, text, text, text, integer, text, integer)
  to service_role;
