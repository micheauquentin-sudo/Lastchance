-- ============================================================
-- Lastchance — socle SMS : consentement et journal, SANS prestataire
-- ============================================================
--
-- Catalogue vivant vérifié : aucune des fonctions créées ici n'existe
-- (`record_sms_consent`, `revoke_sms_consent`, `claim_sms_delivery`,
-- `finish_sms_delivery`, `sms_consents_revocation_is_final`,
-- `sms_consents_revocation_survives_delete` → 0 fichier chacune). Création
-- pure ; aucune fonction existante n'est redéfinie.
--
-- Cette migration ne pose QUE ce qui est indépendant du fournisseur. Aucune
-- table de secrets, aucune clé d'API, aucun identifiant de compte : le choix
-- du prestataire et son coût appartiennent au client. La seule concession au
-- monde extérieur est `provider_message_id`, un texte libre que TOUT
-- fournisseur renvoie et sans lequel aucun accusé de réception n'est
-- rattachable — il ne présume ni du nom ni du format.
--
--
-- ── CE QUI EXISTE AUJOURD'HUI (relevé, pas supposé) ─────────
--
-- Deux colonnes de téléphone dans tout le schéma, et deux seulement :
--
--   `participations.phone`    text null, CHECK '^\+?[0-9 .()\-]{6,20}$'
--                             (00004_campaign_play_settings.sql:41)
--   `contest_players.phone`   text null, CHECK de LONGUEUR 6–20 seulement,
--                             aucun format (00023_pronostics_hardening.sql:144)
--
-- Collecte pilotée par `campaigns.collect_phone` et `contests.collect_phone`,
-- deux booléens `default false`.
--
-- TROIS CONSTATS QUI MOTIVENT CE QUI SUIT :
--
--   1. AUCUN consentement propre au téléphone n'existe — ni colonne, ni champ
--      Zod, ni case à cocher. Le numéro n'est couvert que par
--      `accepted_terms` (CGU génériques) et par `marketing_opt_in`, lequel
--      n'est branché QUE sur l'e-mail : `claim_winning_spin` ne crée un
--      abonné que `if p_marketing_opt_in and p_email is not null`. Un joueur
--      qui coche l'opt-in en ne donnant QUE son téléphone ne produit donc
--      aucune trace de consentement exploitable. Envoyer un SMS sur cette
--      base serait de la prospection sans preuve.
--
--   2. Le téléphone n'est JAMAIS anonymisé, seulement supprimé avec sa ligne
--      (`purge_expired_personal_data` fait un DELETE), et UNIQUEMENT si
--      l'organisation a renseigné `data_retention_months`. Sans rétention
--      déclarée, il est conservé indéfiniment. Écart préexistant, signalé,
--      non corrigé ici : le corriger changerait le comportement de purge de
--      deux tables sans rapport avec le SMS.
--
--   3. Aucune normalisation E.164 nulle part, et TROIS regex mutuellement
--      incompatibles (le CHECK SQL et `play.ts` acceptent les parenthèses,
--      `pronostics.ts` non). Conséquence directe pour un consentement :
--      « 06 12 34 56 78 » et « +33612345678 » sont deux chaînes distinctes,
--      donc deux consentements distincts — et un retrait sur l'un ne
--      retirerait pas l'autre. Traité PARTIELLEMENT ci-dessous, voir
--      `phone_key`.
--
--
-- ── POURQUOI UNE TABLE DÉDIÉE, ET NON UNE COLONNE DE PLUS ───
--
-- Le consentement SMS n'est pas celui de l'e-mail. Il se donne à part, se
-- date, se retire, et son retrait doit survivre à tout. Le poser en colonne
-- sur `participations` le rendrait :
--   - PAR PARTICIPATION, donc redemandé à chaque tour de roue, et surtout
--     RETIRÉ pour une seule participation pendant que les autres restent ;
--   - SUPPRIMÉ par la purge RGPD, qui DELETE la ligne — le retrait
--     disparaîtrait avec elle, et le numéro redeviendrait contactable à la
--     première nouvelle participation. C'est le défaut le plus grave que
--     cette table évite.
--
-- L'unité de consentement est donc le couple (organisation, numéro) :
-- l'organisation parce qu'elle est le responsable de traitement — un
-- consentement donné à une boulangerie ne vaut pas pour un garage — et le
-- numéro parce que c'est lui qu'on contacte.
-- ============================================================

-- ── 1. Le consentement ──────────────────────────────────────
create table if not exists public.sms_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Le numéro TEL QUE DONNÉ : c'est lui qu'on compose. On ne le réécrit pas,
  -- parce qu'une normalisation fautive rendrait le numéro injoignable.
  phone text not null
    check (phone ~ '^\+?[0-9 .()\-]{6,20}$'),

  -- Clé de rapprochement : chiffres seuls. Elle ferme le cas trivial — même
  -- numéro saisi avec des séparateurs différents — qui ferait sinon d'un
  -- retrait un geste sans effet sur la ligne jumelle.
  --
  -- ⚠️ ELLE NE FERME PAS le cas national/international : « 0612345678 » et
  -- « +33612345678 » restent deux clés. Les unifier exige de connaître le
  -- PAYS PAR DÉFAUT, qui est une décision produit (voir la liste rendue au
  -- client) — et une conversion présumée est pire que pas de conversion :
  -- elle fusionnerait deux numéros réellement différents dans les pays où le
  -- préfixe national ne se retire pas de la même façon.
  phone_key text not null
    generated always as (pg_catalog.regexp_replace(phone, '[^0-9]', '', 'g')) stored,

  -- Horodatage du consentement. `not null` : une ligne de cette table SIGNIFIE
  -- un consentement, il ne peut pas être implicite.
  consented_at timestamptz not null default now(),

  -- Version du texte accepté, sur le modèle EXACT de
  -- `players.identity_consent_version` (20260805140000:24) — seul
  -- consentement horodaté ET versionné déjà présent dans ce projet. Sans
  -- elle, on sait qu'un consentement existe mais pas à QUOI il portait, et
  -- il devient indéfendable le jour où le texte change.
  consent_version text not null
    check (consent_version ~ '^[A-Za-z0-9._-]{1,80}$'),

  -- Où il a été donné. Non contraint à une liste fermée : les familles
  -- évoluent, et un point de collecte inconnu vaut mieux qu'un refus
  -- d'écriture au moment où le joueur consent.
  consent_source text
    check (consent_source is null or char_length(consent_source) between 1 and 40),

  -- Le retrait. `null` = consentement actif.
  revoked_at timestamptz,
  revoked_reason text
    check (revoked_reason is null or char_length(revoked_reason) between 1 and 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sms_consents_revocation_reason_state check (
    revoked_reason is null or revoked_at is not null
  ),
  -- Un retrait ne peut pas précéder le consentement qu'il retire.
  constraint sms_consents_revocation_after_consent check (
    revoked_at is null or revoked_at >= consented_at
  )
);

-- UN consentement courant par couple (organisation, numéro). C'est ce qui
-- rend le retrait GLOBAL pour l'organisation : sans cet unique, un second
-- passage en caisse créerait une seconde ligne active et ressusciterait un
-- numéro retiré.
create unique index if not exists sms_consents_org_phone_unique
  on public.sms_consents (organization_id, phone_key);

-- Ciblage d'un envoi : les seuls joignables sont les non-retirés.
create index if not exists sms_consents_org_active_idx
  on public.sms_consents (organization_id, consented_at desc)
  where revoked_at is null;

comment on table public.sms_consents is
  'Consentement SMS, explicite / daté / versionné / retirable, par couple (organisation, numéro). Table DÉDIÉE et non colonne sur participations : le retrait doit survivre à la purge RGPD de la participation, sinon un numéro retiré redevient contactable au tour suivant. Aucun secret de prestataire ici.';
comment on column public.sms_consents.phone_key is
  'Chiffres seuls, pour rapprocher deux saisies du même numéro. NE rapproche PAS national et international (0612… ≠ +33612…) : cela demande un pays par défaut, décision produit non prise.';
comment on column public.sms_consents.revoked_at is
  'Retrait. IRRÉVERSIBLE sans nouveau consentement : le trigger sms_consents_revocation_is_final refuse toute remise à null qui ne s''accompagne pas d''un consented_at strictement postérieur au retrait.';

alter table public.sms_consents enable row level security;
revoke all on table public.sms_consents from public, anon, authenticated, service_role;
-- Les numéros sont des PII : lecture propriétaire uniquement, exactement
-- comme `email_log` (« Les destinataires sont des PII : lecture propriétaire
-- uniquement, comme la newsletter »).
grant select on table public.sms_consents to authenticated;
create policy sms_consents_owner_read on public.sms_consents
  for select to authenticated
  using (public.is_org_owner(organization_id));
-- PAS de `delete` : voir le trigger `sms_consents_revocation_survives_delete`
-- ci-dessous. Un retrait qu'un DELETE efface est un retrait qui n'a jamais eu
-- lieu — et la promesse de cette table (en-tête, § « pourquoi une table
-- dédiée ») est exactement l'inverse.
grant select, insert, update on table public.sms_consents to service_role;

-- ── 2. L'irréversibilité du retrait ─────────────────────────
--
-- C'est la règle centrale de cette migration, et la seule qui ne puisse pas
-- s'exprimer en CHECK : une contrainte ne voit qu'une ligne, jamais sa
-- transition. Trois interdits, tous des tentatives réalistes :
--
--   a) ANNULER un retrait (`revoked_at` → null). Le geste qu'un import, un
--      upsert distrait ou un « on le recontacte quand même » produirait.
--      Autorisé UNIQUEMENT si un consentement strictement postérieur au
--      retrait est écrit dans le même UPDATE : c'est la définition littérale
--      de « irréversible SANS NOUVEAU CONSENTEMENT ».
--   b) RECULER un consentement (antidater pour couvrir un envoi déjà parti).
--   c) RECULER un retrait (le faire passer pour plus tardif qu'il n'était,
--      afin de légitimer des envois faits entre-temps).
create or replace function public.sms_consents_revocation_is_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null
     and not (new.consented_at > old.revoked_at) then
    raise exception
      'retrait de consentement SMS irréversible : un nouveau consentement, postérieur au retrait, est requis (consented_at doit dépasser %)',
      old.revoked_at;
  end if;

  if new.consented_at < old.consented_at then
    raise exception 'un consentement SMS ne peut pas être antidaté';
  end if;

  if old.revoked_at is not null and new.revoked_at is not null
     and new.revoked_at < old.revoked_at then
    raise exception 'un retrait de consentement SMS ne peut pas être reculé';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- ADR-049, et la garde `security_acl.test.sql:364` (« PUBLIC has no EXECUTE on
-- public functions ») qui a attrapé cet oubli : une fonction de TRIGGER est
-- une fonction comme une autre du point de vue des privilèges, et l'`alter
-- default privileges` de Supabase lui accorde EXECUTE à tout le monde. Elle
-- n'a aucune raison d'être appelable directement — seul le trigger l'invoque,
-- et il s'exécute avec les droits du propriétaire de la table.
revoke all on function public.sms_consents_revocation_is_final()
  from public, anon, authenticated, service_role;

create trigger sms_consents_revocation_is_final
  before update on public.sms_consents
  for each row execute function public.sms_consents_revocation_is_final();

-- ── 2bis. Le retrait ne s'efface pas non plus ───────────────
--
-- LE TROU QUE CECI FERME. Le trigger ci-dessus est `before update` SEULEMENT :
-- `delete from sms_consents where …` puis `record_sms_consent(…)` prenait la
-- branche « inconnu » de la RPC et insérait un consentement NEUF ET ACTIF,
-- sans `p_renew`, sans erreur. Le STOP du client avait disparu, et la preuve de
-- sa date avec — c'est-à-dire le contraire littéral de ce que l'en-tête de
-- cette migration promet.
--
-- Structure calquée sur `sms_credit_entries_append_only` (20260825120000) :
-- Postgres efface la ligne PARENTE avant de déclencher la cascade, si bien que
-- le test d'existence de l'organisation est faux pour toute suppression
-- manuelle et vrai pour la seule cascade. Une contrainte de conformité ne doit
-- pas rendre une organisation indestructible — ce serait bloquer un effacement
-- RGPD au nom du RGPD.
--
-- UNE DIFFÉRENCE ASSUMÉE avec `append_only`, et c'est la charnière avec la
-- purge de rétention : seule une ligne PORTANT UN RETRAIT est protégée.
-- Supprimer une ligne jamais retirée ne ressuscite rien — le numéro redevient
-- simplement « aucun consentement au dossier », donc NON contactable : la
-- suppression échoue du bon côté. C'est ce qui permet à
-- `purge_expired_personal_data` (redéfinie en 20260826120000) de purger les
-- consentements périmés sans jamais pouvoir toucher à une opposition.
create or replace function public.sms_consents_revocation_survives_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.revoked_at is not null
     and exists (
       select 1 from public.organizations o where o.id = old.organization_id
     ) then
    raise exception
      'un retrait de consentement SMS ne s''efface pas tant que l''organisation existe : sa date est la preuve de l''opposition, et le supprimer rendrait le numéro contactable au prochain consentement';
  end if;
  return old;
end;
$$;

-- ADR-049 : une fonction de trigger est une fonction comme une autre du point
-- de vue des privilèges.
revoke all on function public.sms_consents_revocation_survives_delete()
  from public, anon, authenticated, service_role;

create trigger sms_consents_revocation_survives_delete
  before delete on public.sms_consents
  for each row execute function public.sms_consents_revocation_survives_delete();

-- ── 3. Écrire un consentement ───────────────────────────────
--
-- Volontairement NON idempotente sur l'état : un numéro RETIRÉ n'est pas
-- réactivé par un simple `on conflict do update`. Le rappel de consentement
-- doit être un geste explicite du joueur, pas l'effet de bord d'une case
-- pré-cochée sur un second tour de roue.
create or replace function public.record_sms_consent(
  p_organization_id uuid,
  p_phone text,
  p_consent_version text,
  p_consent_source text default null,
  p_renew boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_revoked timestamptz;
  -- `clock_timestamp()` et NON `now()`, qui est l'horodatage de la
  -- TRANSACTION et non de l'instant. Avec `now()`, un retrait suivi d'un
  -- nouveau consentement dans la même transaction porterait exactement la
  -- même date, et la règle « le nouveau consentement doit être STRICTEMENT
  -- postérieur au retrait » deviendrait insatisfiable — le réabonnement
  -- serait impossible. Trouvé par pgTAP, qui joue tout un fichier dans une
  -- seule transaction ; en production le défaut serait resté caché jusqu'au
  -- premier appelant qui grouperait les deux gestes.
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select c.id, c.revoked_at into v_id, v_revoked
    from public.sms_consents c
   where c.organization_id = p_organization_id
     and c.phone_key = pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')
   limit 1;

  if v_id is null then
    insert into public.sms_consents (
      organization_id, phone, consented_at, consent_version, consent_source
    ) values (
      p_organization_id, p_phone, v_now, p_consent_version, p_consent_source
    )
    returning id into v_id;
    return v_id;
  end if;

  if v_revoked is not null and not coalesce(p_renew, false) then
    -- Le silence serait pire qu'une erreur : l'appelant croirait le numéro
    -- joignable et l'ajouterait à sa cible.
    raise exception
      'consentement SMS retiré le % : un nouveau consentement explicite est requis (p_renew)',
      v_revoked;
  end if;

  update public.sms_consents c
     set phone = p_phone,
         consented_at = v_now,
         consent_version = p_consent_version,
         consent_source = coalesce(p_consent_source, c.consent_source),
         revoked_at = null,
         revoked_reason = null
   where c.id = v_id;

  return v_id;
end;
$$;

comment on function public.record_sms_consent(uuid, text, text, text, boolean) is
  'Enregistre un consentement SMS daté et versionné. Un numéro RETIRÉ n''est jamais réactivé implicitement : il faut p_renew = true, qui matérialise un nouveau consentement explicite du joueur. service_role uniquement.';

revoke all on function public.record_sms_consent(uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_sms_consent(uuid, text, text, text, boolean)
  to service_role;

-- ── 4. Retirer un consentement ──────────────────────────────
create or replace function public.revoke_sms_consent(
  p_organization_id uuid,
  p_phone text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- `where revoked_at is null` : un second retrait ne réécrit pas la DATE du
  -- premier. C'est cette date qui prouve à partir de quand les envois
  -- devenaient illégitimes ; la repousser détruirait la preuve.
  update public.sms_consents c
     set revoked_at = pg_catalog.clock_timestamp(),
         revoked_reason = p_reason
   where c.organization_id = p_organization_id
     and c.phone_key = pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')
     and c.revoked_at is null;

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.revoke_sms_consent(uuid, text, text) is
  'Retire le consentement SMS d''un numéro pour une organisation. Idempotent : un second appel rend false et ne repousse PAS la date du premier retrait, qui est la preuve du moment où les envois cessent d''être légitimes. service_role uniquement.';

revoke all on function public.revoke_sms_consent(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_sms_consent(uuid, text, text) to service_role;

-- ── 5. Le journal ───────────────────────────────────────────
--
-- Modelé sur `email_log` (20260723110000:351) — un envoi par destinataire,
-- `dedup_key text not null unique` — avec UNE DIFFÉRENCE DÉLIBÉRÉE, et c'est
-- la leçon du job zombie de la newsletter.
--
-- `email_log` écrit sa ligne APRÈS l'envoi. Un worker qui meurt entre l'appel
-- au prestataire et l'écriture du journal renverra donc l'e-mail au prochain
-- passage. C'est acceptable pour un e-mail ; ça ne l'est pas pour un SMS, qui
-- coûte à l'unité et qui réveille le client à 7 h du matin.
--
-- Ici la ligne est écrite AVANT l'envoi (`sending`), par
-- `claim_sms_delivery` : le doublon est fermé par la contrainte d'unicité au
-- moment de la RÉSERVATION, pas de la confirmation.
--
-- LE PIÈGE À NE PAS REFAIRE : le worker newsletter avait exclu `sending` de
-- sa garde anti-rejeu, si bien qu'un job relancé par `requeue_stale_jobs()`
-- RENVOYAIT TOUT. Ici `sending` COMPTE comme réservé — un rejeu ne renvoie
-- pas. Mais un `sending` éternel bloquerait le numéro pour toujours : d'où la
-- fenêtre de reprise explicite de `claim_sms_delivery`, qui rend le journal
-- reprenable SANS le rendre renvoyable.
create table if not exists public.sms_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  scenario text not null check (char_length(scenario) between 1 and 40),
  recipient text not null check (recipient ~ '^\+?[0-9 .()\-]{6,20}$'),
  recipient_key text not null
    generated always as (pg_catalog.regexp_replace(recipient, '[^0-9]', '', 'g')) stored,

  -- LA clé anti-doublon. Même rôle que celle d'`email_log`, mais PAS la même
  -- portée : l'unicité est posée plus bas sur `(organization_id, dedup_key)`,
  -- et non sur la seule colonne. Voir l'index et son commentaire.
  dedup_key text not null
    check (char_length(dedup_key) between 1 and 200),

  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 100),

  -- Identifiant rendu par le prestataire, quel qu'il soit. Aucun secret :
  -- c'est une référence d'accusé de réception, pas un jeton d'accès.
  provider_message_id text
    check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  last_error text
    check (last_error is null or char_length(last_error) between 1 and 500),

  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sms_log_sent_state check (
    (status = 'sent') = (sent_at is not null)
  )
);

comment on table public.sms_log is
  'Journal des SMS, un par destinataire. dedup_key unique = anti-doublon. La ligne est posée AVANT l''envoi (contrairement à email_log, écrit après) : un SMS coûte à l''unité, le doublon se ferme à la réservation. Écrit par le worker (service role) ; destinataires = PII, lecture propriétaire. Aucun secret de prestataire.';
comment on column public.sms_log.status is
  'sending → sent / failed. `sending` COMPTE comme réservé dans la garde anti-rejeu : c''est l''inverse du défaut du worker newsletter, où son absence de la garde faisait TOUT renvoyer. Une réservation périmée se reprend par la fenêtre de claim_sms_delivery, jamais par un renvoi.';

-- ⚠️ L'UNICITÉ EST SCOPÉE À L'ORGANISATION, et ce n'est pas un raffinement.
--
-- Une clé globale laisserait le worker de l'organisation A TROUVER, REPRENDRE
-- et RÉÉCRIRE la ligne de B. Celle-ci garderait `organization_id = B` — donc
-- resterait lisible par le propriétaire de B via `sms_log_owner_read` — tout
-- en recevant le NUMÉRO D'UN CLIENT DE A : fuite de PII inter-tenant. Et si la
-- ligne de B était encore fraîche, l'appel de A rendrait `false` et le message
-- de B ne partirait jamais, sans trace.
--
-- Le projet a déjà corrigé cette classe exacte sur `contest_awards`
-- (2026-07-25), avec sa leçon : ne scoper que la LECTURE aurait produit un état
-- PIRE — ligne consommée d'un côté pendant que l'autre affiche « rien à
-- faire ». La clé, le `select … for update` et l'`update` sont donc scopés
-- ENSEMBLE, ici et dans `claim_sms_delivery` / `finish_sms_delivery`.
create unique index if not exists sms_log_org_dedup_unique
  on public.sms_log (organization_id, dedup_key);

create index if not exists sms_log_org_created_idx
  on public.sms_log (organization_id, created_at desc);
create index if not exists sms_log_stale_idx
  on public.sms_log (claimed_at)
  where status = 'sending';

alter table public.sms_log enable row level security;
revoke all on table public.sms_log from public, anon, authenticated, service_role;
grant select on table public.sms_log to authenticated;
create policy sms_log_owner_read on public.sms_log
  for select to authenticated
  using (public.is_org_owner(organization_id));
grant select, insert, update, delete on table public.sms_log to service_role;

-- ── 6. Réserver un envoi ────────────────────────────────────
--
-- Rend `true` si l'appelant DOIT envoyer, `false` s'il ne doit pas. Toute la
-- reprenabilité tient dans ces deux valeurs.
create or replace function public.claim_sms_delivery(
  p_organization_id uuid,
  p_scenario text,
  p_recipient text,
  p_dedup_key text,
  p_stale_after_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.sms_log;
  v_stale integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- CONSENTEMENT D'ABORD. La garde vit ici et pas seulement dans l'appelant :
  -- une cible calculée quelques minutes plus tôt peut contenir un numéro
  -- retiré entre-temps, et c'est précisément l'instant du retrait qui compte.
  if not exists (
    select 1 from public.sms_consents c
     where c.organization_id = p_organization_id
       and c.phone_key = pg_catalog.regexp_replace(p_recipient, '[^0-9]', '', 'g')
       and c.revoked_at is null
  ) then
    return false;
  end if;

  -- 15 min par défaut : très au-delà de la durée d'un appel HTTP à un
  -- prestataire SMS (quelques secondes, quelques dizaines au pire), et bien
  -- en-deçà du pas de replanification d'un worker. Une réservation plus
  -- ancienne que ça n'est pas un envoi lent, c'est un worker mort.
  v_stale := least(greatest(coalesce(p_stale_after_seconds, 900), 60), 86400);

  -- SCOPÉ À L'ORGANISATION, comme la clé unique : sans ce prédicat, ce
  -- `for update` verrouille et reprend la ligne d'un autre tenant.
  select * into v_existing
    from public.sms_log l
   where l.organization_id = p_organization_id
     and l.dedup_key = p_dedup_key
   for update;

  if v_existing.id is null then
    insert into public.sms_log (
      organization_id, scenario, recipient, dedup_key, status
    ) values (
      p_organization_id, p_scenario, p_recipient, p_dedup_key, 'sending'
    );
    return true;
  end if;

  -- Déjà parti : ne JAMAIS renvoyer. C'est le cas nominal d'un rejeu.
  if v_existing.status = 'sent' then
    return false;
  end if;

  -- Réservé et encore frais : un autre worker est dessus. Ne pas renvoyer.
  if v_existing.status = 'sending'
     and v_existing.claimed_at > pg_catalog.clock_timestamp()
                                 - pg_catalog.make_interval(secs => v_stale) then
    return false;
  end if;

  -- Réservation périmée, ou échec précédent : on reprend la MÊME ligne.
  -- Reprendre plutôt qu'insérer est ce qui empêche le doublon : la clé reste
  -- unique, et `attempts` garde la trace des tentatives.
  update public.sms_log l
     set status = 'sending',
         attempts = least(l.attempts + 1, 100),
         claimed_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where l.id = v_existing.id;

  return true;
end;
$$;

comment on function public.claim_sms_delivery(uuid, text, text, text, integer) is
  'Réserve un envoi SMS. true = envoyez, false = n''envoyez pas. Refuse si le consentement est absent ou retiré, si le SMS est déjà parti, ou si un autre worker le tient encore. Une réservation périmée est REPRISE sur la même ligne (jamais dupliquée). service_role uniquement.';

revoke all on function public.claim_sms_delivery(uuid, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sms_delivery(uuid, text, text, text, integer)
  to service_role;

-- ── 7. Confirmer l'envoi ────────────────────────────────────
-- `p_organization_id` EST UN PARAMÈTRE, et il est premier. Sans lui, un
-- appelant même parfaitement discipliné ne PEUT PAS scoper sa clôture : il ne
-- dispose que de la `dedup_key`, et clôturerait la ligne d'un autre tenant qui
-- porterait la même. C'est le pendant de l'index unique
-- `sms_log_org_dedup_unique` — une clé scopée exige une lecture scopée.
create or replace function public.finish_sms_delivery(
  p_organization_id uuid,
  p_dedup_key text,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  if p_status not in ('sent', 'failed') then
    raise exception 'statut d''envoi SMS invalide : %', p_status;
  end if;

  -- `where status = 'sending'` : une ligne déjà `sent` ne redevient jamais
  -- `failed`. Un accusé de réception tardif ou une seconde confirmation ne
  -- doivent pas rouvrir un envoi clos — ce serait la porte du renvoi.
  update public.sms_log l
     set status = p_status,
         sent_at = case when p_status = 'sent' then pg_catalog.clock_timestamp() else null end,
         provider_message_id = coalesce(p_provider_message_id, l.provider_message_id),
         last_error = case when p_status = 'failed' then p_error else null end,
         updated_at = pg_catalog.clock_timestamp()
   where l.organization_id = p_organization_id
     and l.dedup_key = p_dedup_key
     and l.status = 'sending';

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.finish_sms_delivery(uuid, text, text, text, text) is
  'Clôt un envoi SMS réservé : sent ou failed. N''agit que sur une ligne `sending` DE L''ORGANISATION PASSÉE — un envoi déjà `sent` ne se rouvre pas, sinon un accusé tardif rouvrirait la porte du renvoi, et sans le scope un worker clôturerait la ligne d''un autre tenant. service_role uniquement.';

revoke all on function public.finish_sms_delivery(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_sms_delivery(uuid, text, text, text, text)
  to service_role;
