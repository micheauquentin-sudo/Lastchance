-- ============================================================
-- Lastchance — normalisation E.164 (+33 par défaut) et porte d'envoi
-- ============================================================
--
-- Catalogue vivant vérifié AVANT écriture (`grep -l "function public.<nom>"`
-- dans supabase/migrations) :
--   sms_phone_e164              → 0 fichier                       (création)
--   record_sms_consent          → 20260823120000, UN seul   (redéfinition)
--   revoke_sms_consent          → 20260823120000, UN seul   (redéfinition)
--   claim_sms_delivery          → 20260823120000, UN seul   (redéfinition)
--   finish_sms_delivery         → 20260823120000, UN seul   (redéfinition)
--   purge_expired_personal_data → 00019 ET 20260723110000   (redéfinition)
-- Les cinq redéfinitions du chantier tiennent dans CE fichier, et chacune n'a
-- lieu qu'une fois : après cette migration, `grep -l` rend deux fichiers par
-- fonction (l'original et celui-ci), jamais trois.
--
-- ⚠️ EXCEPTION, ET C'EST TOUT L'INTÉRÊT DE LA VÉRIFICATION :
-- `purge_expired_personal_data` existe en DEUX exemplaires. Celui qui fait foi
-- est `20260723110000:629`, le PLUS RÉCENT — `00019` porte une version
-- antérieure qui ne connaît ni `email_log` ni l'anonymisation d'audit. Le corps
-- repris au § 9 ci-dessous part donc de 20260723110000, pas de 00019 : partir
-- de l'archive aurait fait RÉGRESSER la purge de deux tables sans rapport avec
-- le SMS. Après cette migration, c'est CE fichier qui fait foi.
--
--
-- ══ 1. LE DÉFAUT CORRIGÉ ═══════════════════════════════════════
--
-- `20260823120000` rapprochait deux saisies du même numéro par leurs CHIFFRES
-- SEULS, et son propre commentaire disait ce qu'il ne fermait pas :
-- « 0612345678 » et « +33612345678 » restaient DEUX clés, donc deux
-- consentements, et un retrait sur l'un ne valait pas pour l'autre.
--
-- Ce n'est pas une imperfection de rapprochement : c'est un RETRAIT DE
-- CONSENTEMENT INOPÉRANT. Le client tape « STOP », le prestataire remonte son
-- numéro au format international, le retrait s'écrit sur la ligne
-- internationale — et la campagne suivante, qui cible les numéros saisis en
-- caisse au format national, le rappelle. Du point de vue du client, il a
-- demandé l'arrêt et rien ne s'est arrêté.
--
-- La cause d'origine était honnête : unifier les deux formes exige de
-- connaître le PAYS PAR DÉFAUT, qui est une décision produit. Elle est prise :
-- **+33**. Ce fichier l'exécute.
--
--
-- ══ 2. « AU MÊME ENDROIT », LITTÉRALEMENT ══════════════════════
--
-- Une normalisation qui vit à deux endroits finit par diverger, et le jour où
-- elle diverge c'est exactement ce défaut-ci qui revient. Il n'y a donc
-- qu'UNE fonction, `sms_phone_e164`, et elle est appelée :
--
--   • par la colonne calculée `sms_consents.phone_key`  (le consentement)
--   • par la colonne calculée `sms_log.recipient_key`   (le journal)
--   • par `record_sms_consent` et `revoke_sms_consent`  (écriture/retrait)
--   • par `claim_sms_delivery`                          (l'envoi)
--
-- Les colonnes calculées sont le point important : elles rendent la
-- normalisation INCONTOURNABLE. Une ligne écrite par un chemin futur qui
-- ignorerait les RPC porterait quand même la bonne clé, parce que c'est
-- Postgres qui la calcule et non l'appelant.
--
-- Corollaire, et il faut le dire : `sms_phone_e164` est figée par ces deux
-- colonnes. La remplacer par `create or replace` NE recalculerait PAS les
-- valeurs déjà stockées — elles resteraient au format d'hier pendant que les
-- nouvelles arriveraient au format d'aujourd'hui, et le rapprochement
-- casserait sans bruit. Toute évolution de cette fonction exige donc de
-- REJOUER les deux colonnes calculées, comme cette migration le fait ici.
--
--
-- ══ 3. LA FUSION DES DOUBLONS, ET SA RÈGLE ═════════════════════
--
-- Rendre la clé unificatrice fait entrer en collision les lignes que le
-- défaut avait séparées. C'est le but — mais l'index unique refuserait alors
-- de se recréer. Il faut donc fusionner AVANT, et la règle de fusion est la
-- seule qui soit défendable :
--
--   **LE RETRAIT L'EMPORTE TOUJOURS.** Si l'une des lignes en collision porte
--   un retrait, c'est elle qui survit. Garder la ligne consentante parce
--   qu'elle est plus récente ressusciterait précisément le numéro qui avait
--   demandé l'arrêt — la migration de correction produirait le défaut qu'elle
--   corrige.
--
-- À retraits multiples, on garde LE PLUS ANCIEN : c'est sa date qui prouve à
-- partir de quand les envois cessaient d'être légitimes, et c'est la même
-- règle que `revoke_sms_consent`, qui refuse déjà de repousser cette date.
-- À défaut de tout retrait, on garde le consentement le plus récent.
--
-- On conserve une LIGNE ENTIÈRE existante plutôt que de composer une ligne
-- de synthèse : un `revoked_at` recollé sur un autre `consented_at` pourrait
-- violer `sms_consents_revocation_after_consent`, et surtout produirait un
-- couple date/preuve que personne n'a jamais écrit.
--
-- En production ces tables sont VIDES — les trois migrations du socle SMS ne
-- sont pas encore déployées. Ce bloc y déplacera zéro ligne. Il est écrit
-- correctement quand même : les bases locales et de CI, elles, ont pu recevoir
-- des lignes, et une migration qui n'est correcte qu'en production est une
-- migration qu'on ne peut pas éprouver.
--
--
-- ══ 4. CE QUE LA PORTE D'ENVOI VÉRIFIE, ET DANS QUEL ORDRE ═════
--
-- `claim_sms_delivery` enchaîne cinq refus avant d'autoriser, et l'ordre est
-- une décision : du moins coûteux au plus coûteux, et surtout le DÉBIT EN
-- DERNIER. Débiter avant de savoir si l'envoi aura lieu facturerait des SMS
-- que rien n'enverrait.
--
--   1. numéro illisible OU inenvoyable → false  (jamais une exception, § 5)
--   2. consentement absent/retiré → false   (garde à l'ENVOI, pas au ciblage)
--   3. expéditeur non déclaré    → false   (AF2M, 20260824120000)
--   4. déjà parti / définitivement échoué / tenu par un autre → false
--   5. crédit insuffisant        → false   (20260825120000, avec verrou)
--
--
-- ══ 5. TOUT EST SCOPÉ À L'ORGANISATION, Y COMPRIS LA CLÉ ═══════
--
-- `sms_log.dedup_key` porte désormais une unicité `(organization_id,
-- dedup_key)` et non plus une unicité globale (20260823120000). Les deux RPC
-- qui la lisent sont scopées en conséquence — le `select … for update` comme
-- l'`update` — et `finish_sms_delivery` REÇOIT l'organisation en paramètre,
-- sans quoi un appelant discipliné n'aurait aucun moyen de se scoper.
--
-- La leçon vient de `contest_awards` (M1 du 2026-07-25) : ne scoper que la
-- lecture produit un état PIRE que ne rien scoper — lot consommé et audité d'un
-- côté pendant que l'autre affiche « rien à faire ».
-- ============================================================

-- ── 1. LA fonction de normalisation ─────────────────────────
--
-- `immutable` est obligatoire : une colonne calculée n'accepte pas autre
-- chose. Elle l'est réellement — le corps n'appelle que des primitives de
-- chaîne de `pg_catalog`, aucune lecture de table, aucune horloge.
--
-- Elle n'est PAS `security definer` : elle ne lit rien: lui donner les droits
-- du propriétaire serait un privilège sans emploi.
create or replace function public.sms_phone_e164(
  p_phone text,
  p_default_country text default 'FR'
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw text;
  v_digits text;
  v_intl boolean;
  v_country text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_default_country, 'FR')));
begin
  if p_phone is null then
    return null;
  end if;

  -- On ne garde que les chiffres et les « + ». Espaces, points, tirets et
  -- parenthèses — les quatre séparateurs qu'acceptent les CHECK existants —
  -- disparaissent ici.
  v_raw := pg_catalog.regexp_replace(p_phone, '[^0-9+]', '', 'g');
  if v_raw = '' then
    return null;
  end if;

  -- Seul le « + » de TÊTE porte un sens. Un « + » au milieu est du bruit de
  -- saisie ou un copier-coller malheureux, jamais une information.
  v_intl := (pg_catalog.left(v_raw, 1) = '+');
  v_digits := pg_catalog.regexp_replace(v_raw, '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  -- Le préfixe international COMPOSÉ vaut le « + » : « 0033… » est la même
  -- chose que « +33… », et c'est une forme que les gens tapent vraiment.
  if not v_intl and pg_catalog.left(v_digits, 2) = '00' then
    v_intl := true;
    v_digits := pg_catalog.substr(v_digits, 3);
    if v_digits = '' then
      return null;
    end if;
  end if;

  if v_intl then
    -- « +33 (0)6 12 34 56 78 » : la notation française qui donne l'indicatif
    -- pays ET le préfixe interurbain. Aucun numéro français ne commence par 0
    -- après le +33 — les neuf chiffres nationaux vont de 1 à 9 — donc ce 0 ne
    -- peut être qu'un préfixe interurbain, et le laisser produirait un numéro
    -- à douze chiffres que l'opérateur rejette.
    if pg_catalog.left(v_digits, 3) = '330' and pg_catalog.length(v_digits) = 12 then
      v_digits := '33' || pg_catalog.substr(v_digits, 4);
    end if;
    return '+' || v_digits;
  end if;

  -- Forme NATIONALE : c'est ici, et seulement ici, que le pays par défaut
  -- intervient. La décision produit est +33.
  if v_country = 'FR' then
    -- 0X XX XX XX XX → +33 X XX XX XX XX
    if pg_catalog.length(v_digits) = 10 and pg_catalog.left(v_digits, 1) = '0' then
      return '+33' || pg_catalog.substr(v_digits, 2);
    end if;
    -- Neuf chiffres sans le 0 interurbain : « 612345678 », saisi tel quel plus
    -- souvent qu'on ne le croit.
    if pg_catalog.length(v_digits) = 9 and pg_catalog.left(v_digits, 1) <> '0' then
      return '+33' || v_digits;
    end if;
  end if;

  -- DERNIER RECOURS, et il est délibérément bête : on préfixe sans rien
  -- inventer. Une forme qu'on ne reconnaît pas ne doit surtout pas se voir
  -- attribuer un indicatif présumé — c'est l'avertissement laissé par
  -- 20260823120000, et il reste juste : une conversion présumée FUSIONNERAIT
  -- deux numéros réellement différents, ce qui est bien pire que de ne pas
  -- les rapprocher. Ici la sortie reste déterministe (deux saisies identiques
  -- donnent la même clé) sans jamais fabriquer d'appartenance à un pays.
  return '+' || v_digits;
end;
$$;

comment on function public.sms_phone_e164(text, text) is
  'Normalise un numéro en E.164, pays par défaut FR (+33). POINT UNIQUE de normalisation : appelée par les colonnes calculées sms_consents.phone_key et sms_log.recipient_key, et par les quatre RPC de consentement et d''envoi. C''est ce qui rend « 0612345678 » et « +33612345678 » UN SEUL consentement — sans quoi un STOP reçu au format international ne retirerait pas le numéro saisi au format national. Une forme non reconnue est préfixée telle quelle : déterministe, mais aucun indicatif n''est jamais présumé. ⚠️ Figée par les deux colonnes calculées : la remplacer sans les rejouer laisserait les clés anciennes au format d''hier.';

-- Immutable et sans lecture : accessible en exécution à tous les rôles
-- applicatifs, comme n'importe quelle primitive de chaîne. Le `revoke` de
-- PUBLIC reste requis par ADR-049 et par la garde `security_acl.test.sql:482`.
revoke all on function public.sms_phone_e164(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sms_phone_e164(text, text)
  to authenticated, service_role;

-- ── 2. Fusion des doublons AVANT de resserrer la clé ─────────
do $$
declare
  r record;
  v_removed integer := 0;
  v_groups integer := 0;
  v_batch integer;
begin
  for r in
    select c.organization_id,
           public.sms_phone_e164(c.phone, 'FR') as e164,
           (array_agg(c.id order by
              -- 1. Le retrait l'emporte.
              (c.revoked_at is not null) desc,
              -- 2. Entre retraits : le plus ANCIEN, c'est lui qui fait preuve.
              c.revoked_at asc nulls last,
              -- 3. Entre consentements : le plus récent.
              c.consented_at desc,
              c.id asc))[1] as keep_id
      from public.sms_consents c
     group by c.organization_id, public.sms_phone_e164(c.phone, 'FR')
    having pg_catalog.count(*) > 1
  loop
    delete from public.sms_consents c
     where c.organization_id = r.organization_id
       and public.sms_phone_e164(c.phone, 'FR') = r.e164
       and c.id <> r.keep_id;
    get diagnostics v_batch = row_count;
    v_removed := v_removed + v_batch;
    v_groups := v_groups + 1;
  end loop;

  raise notice 'SMS E.164 — fusion des consentements : % groupe(s) en collision, % ligne(s) absorbée(s) (le retrait l''emporte)',
    v_groups, v_removed;
end;
$$;

-- ── 3. Rejouer les deux colonnes calculées ──────────────────
--
-- Postgres 15 ne sait pas modifier l'expression d'une colonne calculée : il
-- faut la retirer et la reposer. Le retrait emporte l'index unique qui s'y
-- appuie, recréé juste après — c'est pour cela que la fusion ci-dessus vient
-- AVANT, et non après.
alter table public.sms_consents drop column if exists phone_key;
alter table public.sms_consents
  add column phone_key text
    generated always as (public.sms_phone_e164(phone, 'FR')) stored;

create unique index if not exists sms_consents_org_phone_unique
  on public.sms_consents (organization_id, phone_key);

comment on column public.sms_consents.phone_key is
  'Numéro normalisé E.164 (+33 par défaut), calculé par Postgres — donc incontournable, y compris pour un chemin d''écriture qui ignorerait les RPC. Rapproche DÉSORMAIS le national et l''international : « 0612345678 » et « +33612345678 » sont UN SEUL consentement, et un STOP sur l''un vaut pour l''autre. C''était le défaut laissé ouvert par 20260823120000.';

alter table public.sms_log drop column if exists recipient_key;
alter table public.sms_log
  add column recipient_key text
    generated always as (public.sms_phone_e164(recipient, 'FR')) stored;

comment on column public.sms_log.recipient_key is
  'Destinataire normalisé E.164, même fonction que sms_consents.phone_key — c''est cette identité de forme qui permet de rapprocher un envoi de son consentement.';

-- ── 4. Le journal apprend l'échec DÉFINITIF et le crédit ────
--
-- Le nom de la contrainte de statut est retrouvé plutôt que présumé : il est
-- auto-généré par Postgres pour un CHECK de colonne, et le deviner ferait
-- échouer la migration entière sur un `42704`.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.sms_log'::regclass
       and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) ilike '%sending%'
       and pg_catalog.pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute pg_catalog.format('alter table public.sms_log drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.sms_log
  add constraint sms_log_status_check
  check (status in ('sending', 'sent', 'failed', 'undeliverable'));

alter table public.sms_log
  add column if not exists credit_entry_id uuid
    references public.sms_credit_entries(id) on delete set null,
  add column if not exists refunded_at timestamptz,
  -- L'expéditeur SOUS LEQUEL le SMS est parti, gelé. Le lire aujourd'hui sur
  -- `sms_senders` répondrait « le nom actuel », qui n'est pas la question
  -- qu'on pose en support : « sous quel nom ce message est-il parti ? ».
  -- Même raison que le gel du libellé de récompense (20260814120000).
  add column if not exists sender_id text
    check (sender_id is null or sender_id ~ '^[A-Z0-9]{1,11}$');

-- Un remboursement n'existe que sur un échec définitif. Volontairement muette
-- sur `credit_entry_id` : la cascade de suppression d'une organisation met ce
-- lien à null, et l'exiger ici ferait échouer la suppression d'organisation —
-- c'est-à-dire qu'une contrainte de facturation bloquerait un effacement RGPD.
-- L'unicité du remboursement est déjà garantie, structurellement, par l'index
-- `sms_credit_entries_one_reversal`.
alter table public.sms_log
  add constraint sms_log_refund_requires_definitive_failure
  check (refunded_at is null or status = 'undeliverable');

comment on column public.sms_log.status is
  'sending → sent / failed / undeliverable. `sending` COMPTE comme réservé dans la garde anti-rejeu (défaut du worker newsletter). `failed` = échec TEMPORAIRE : rejouable, le crédit reste consommé. `undeliverable` = échec DÉFINITIF : remboursé et NON rejouable — sans cette seconde propriété, rembourser puis renvoyer donnerait des SMS gratuits en boucle.';
comment on column public.sms_log.credit_entry_id is
  'Mouvement de débit qui a payé CE message. Non nul = déjà payé : une reprise après échec temporaire ne redébite pas, sinon trois tentatives sur un opérateur en panne factureraient trois SMS pour un seul message. Un crédit par dedup_key, jamais par tentative.';
comment on column public.sms_log.sender_id is
  'Expéditeur GELÉ sous lequel ce message est parti. Relire sms_senders donnerait le nom d''aujourd''hui, qui n''est pas la question posée en support.';

-- ── 5. Consentement : même normalisation ────────────────────
--
-- Redéfinition à périmètre STRICTEMENT limité : `regexp_replace(…, '[^0-9]')`
-- devient `sms_phone_e164(…)`. Le reste — le refus de réactiver un numéro
-- retiré sans `p_renew`, le `clock_timestamp()`, les messages — est inchangé,
-- et le fichier pgTAP de 20260823120000 reste vert sans retouche.
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
  v_key text;
  -- `clock_timestamp()` et NON `now()`, qui est l'horodatage de la
  -- TRANSACTION : un retrait suivi d'un nouveau consentement dans la même
  -- transaction porterait la même date, et « le nouveau consentement doit être
  -- STRICTEMENT postérieur » deviendrait insatisfiable.
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  v_key := public.sms_phone_e164(p_phone, 'FR');
  if v_key is null then
    raise exception 'numéro de téléphone illisible pour un consentement SMS : %',
      coalesce(p_phone, '(null)');
  end if;

  select c.id, c.revoked_at into v_id, v_revoked
    from public.sms_consents c
   where c.organization_id = p_organization_id
     and c.phone_key = v_key
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
  'Enregistre un consentement SMS daté et versionné, sur le numéro NORMALISÉ E.164 (+33 par défaut) — « 0612345678 » et « +33612345678 » retombent sur la même ligne. Un numéro RETIRÉ n''est jamais réactivé implicitement : il faut p_renew = true, geste explicite du joueur. Un numéro illisible lève plutôt que d''écrire un consentement qu''on ne saurait pas retirer. service_role uniquement.';

revoke all on function public.record_sms_consent(uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.record_sms_consent(uuid, text, text, text, boolean)
  to service_role;

-- ── 6. Retrait : même normalisation ─────────────────────────
--
-- C'EST LA CORRECTION QUI COMPTE. Le STOP arrive par le numéro court du
-- prestataire, donc au format international ; le consentement a pu être
-- recueilli en caisse au format national. Avant ce fichier, ce retrait ne
-- touchait aucune ligne et rendait `false` — un « rien à faire » qui voulait
-- dire « je n'ai pas trouvé », et que personne ne pouvait distinguer d'un
-- second STOP.
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
  v_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  v_key := public.sms_phone_e164(p_phone, 'FR');
  if v_key is null then
    return false;
  end if;

  -- `where revoked_at is null` : un second retrait ne réécrit pas la DATE du
  -- premier, qui est la preuve du moment où les envois cessent d'être
  -- légitimes.
  update public.sms_consents c
     set revoked_at = pg_catalog.clock_timestamp(),
         revoked_reason = p_reason
   where c.organization_id = p_organization_id
     and c.phone_key = v_key
     and c.revoked_at is null;

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.revoke_sms_consent(uuid, text, text) is
  'Retire le consentement SMS d''un numéro, sur sa forme NORMALISÉE E.164 : un STOP remonté au format international retire désormais le consentement recueilli au format national. C''était le défaut central — le retrait était inopérant sur l''autre forme. Idempotent : un second appel rend false et ne repousse PAS la date du premier retrait. service_role uniquement.';

revoke all on function public.revoke_sms_consent(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_sms_consent(uuid, text, text) to service_role;

-- ── 7. LA PORTE D'ENVOI ─────────────────────────────────────
--
-- `true` = envoyez, `false` = n'envoyez pas. Cinq refus avant l'autorisation,
-- et le débit en dernier (voir l'en-tête, § 4).
--
-- LE NUMÉRO À COMPOSER EST `sms_log.recipient`, que cette fonction écrit
-- NORMALISÉ. C'est délibéré et c'est la conséquence de « au même endroit » :
-- si l'appelant renormalisait de son côté pour composer, il existerait un
-- second site de normalisation, et le jour où les deux divergent le SMS
-- partirait vers un numéro dont le consentement n'a pas été vérifié.
-- 20260823120000 stockait le numéro tel que saisi ; ce choix reste celui de
-- `sms_consents.phone`, qui garde la trace de ce que la personne a écrit — un
-- journal d'envoi, lui, doit dire ce qui a été composé.
--
-- `p_unit_cost_micros` A ÉTÉ RETIRÉ (voir le motif complet en tête de
-- `debit_sms_credit`, 20260825120000) : le coût gelé au grand livre sert de
-- preuve de facturation, il se lit sur `sms_credits.unit_cost_micros` sous le
-- verrou et ne se reçoit pas d'un appelant.
create or replace function public.claim_sms_delivery(
  p_organization_id uuid,
  p_scenario text,
  p_recipient text,
  p_dedup_key text,
  p_stale_after_seconds integer default 900,
  p_destination_country text default 'FR'
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
  -- calculées (voir § 2 de l'en-tête), et la remplacer sans les rejouer
  -- laisserait les clés déjà stockées au format d'hier.
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
    v_entry_id := v_existing.credit_entry_id;
    if v_entry_id is null then
      v_entry_id := public.debit_sms_credit(
        p_organization_id, 1, p_dedup_key, p_destination_country);
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
  v_entry_id := public.debit_sms_credit(
    p_organization_id, 1, p_dedup_key, p_destination_country);
  if v_entry_id is null then
    return false;
  end if;

  insert into public.sms_log (
    organization_id, scenario, recipient, dedup_key, status,
    sender_id, credit_entry_id
  ) values (
    p_organization_id, p_scenario, v_key, p_dedup_key, 'sending',
    v_sender, v_entry_id
  );

  return true;
end;
$$;

comment on function public.claim_sms_delivery(uuid, text, text, text, integer, text) is
  'Réserve un envoi SMS. true = envoyez, false = n''envoyez pas. Cinq refus, dans cet ordre : numéro illisible OU inenvoyable (trop court pour le CHECK du journal — un false, jamais une exception), consentement absent ou retiré, expéditeur non déclaré AF2M, message déjà parti / définitivement échoué / tenu par un autre worker, crédit insuffisant. Tout est SCOPÉ À L''ORGANISATION, y compris le for update et la clé unique : sinon le worker de A reprend et réécrit la ligne de B. LE DÉBIT EST EN DERNIER et dans la même transaction que la réservation : ni facturation sans réservation, ni réservation sans facturation. Un crédit par dedup_key, jamais par tentative, à un coût lu en base et jamais reçu de l''appelant. LE NUMÉRO À COMPOSER EST sms_log.recipient, écrit normalisé — renormaliser côté appelant créerait un second site de normalisation, et le SMS partirait un jour vers un numéro dont le consentement n''a pas été vérifié. service_role uniquement.';

revoke all on function public.claim_sms_delivery(uuid, text, text, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sms_delivery(uuid, text, text, text, integer, text)
  to service_role;

-- L'ancienne signature à cinq paramètres n'est PAS conservée : `create or
-- replace` ne remplace pas une fonction dont l'arité change, il en crée une
-- seconde. Deux surcharges cohabiteraient, l'ancienne sans porte d'expéditeur
-- ni débit — un appelant qui l'atteindrait enverrait gratuitement, sous un nom
-- non déclaré. C'est exactement le genre de résidu qu'une relecture ne voit
-- pas et qu'un `drop` explicite ferme.
drop function if exists public.claim_sms_delivery(uuid, text, text, text, integer);

-- ── 8. Clôture, et le remboursement du seul échec définitif ──
--
-- Même arité qu'en 20260823120000 : `p_organization_id` d'abord. La clôture est
-- scopée pour la même raison que la réservation — la `dedup_key` seule ne
-- désigne plus une ligne unique depuis que l'unicité porte
-- `(organization_id, dedup_key)`, et un worker clôturerait, voire
-- REMBOURSERAIT, la ligne d'un autre tenant.
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
  v_id uuid;
  v_entry_id uuid;
  v_refund_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- `failed` = temporaire (sera rejoué, le crédit reste consommé).
  -- `undeliverable` = définitif (remboursé, et non rejouable).
  -- La distinction appartient à l'APPELANT, qui seul lit le code du
  -- prestataire : une saturation d'opérateur et un numéro inexistant se
  -- ressemblent ici et n'ont rien à voir là-bas.
  if p_status not in ('sent', 'failed', 'undeliverable') then
    raise exception 'statut d''envoi SMS invalide : %', p_status;
  end if;

  -- `where status = 'sending'` : une ligne déjà close ne se rouvre pas. Un
  -- accusé tardif ou une seconde confirmation rendraient sinon le renvoi
  -- possible — et, depuis que le remboursement existe, un second passage en
  -- `undeliverable` tenterait un second remboursement.
  update public.sms_log l
     set status = p_status,
         sent_at = case when p_status = 'sent' then pg_catalog.clock_timestamp() else null end,
         provider_message_id = coalesce(p_provider_message_id, l.provider_message_id),
         last_error = case when p_status = 'sent' then null else p_error end,
         updated_at = pg_catalog.clock_timestamp()
   where l.organization_id = p_organization_id
     and l.dedup_key = p_dedup_key
     and l.status = 'sending'
  returning l.id, l.credit_entry_id into v_id, v_entry_id;

  if v_id is null then
    return false;
  end if;

  -- LE REMBOURSEMENT, et lui seul : un échec temporaire ne rend rien, parce
  -- qu'il sera rejoué et que la reprise réutilisera ce même crédit.
  if p_status = 'undeliverable' and v_entry_id is not null then
    v_refund_id := public.refund_sms_credit(v_entry_id, p_dedup_key);
    if v_refund_id is not null then
      update public.sms_log l
         set refunded_at = pg_catalog.clock_timestamp()
       where l.id = v_id;
    end if;
  end if;

  return true;
end;
$$;

comment on function public.finish_sms_delivery(uuid, text, text, text, text) is
  'Clôt un envoi SMS réservé DE L''ORGANISATION PASSÉE : sent, failed (TEMPORAIRE — rejouable, crédit conservé) ou undeliverable (DÉFINITIF — remboursé, non rejouable). N''agit que sur une ligne `sending` : un envoi clos ne se rouvre pas, sinon un accusé tardif rouvrirait la porte du renvoi ET tenterait un second remboursement. Le scope d''organisation est aussi obligatoire ici qu''à la réservation : depuis que l''unicité porte (organization_id, dedup_key), une clé seule ne désigne plus une ligne unique, et une clôture non scopée rembourserait le crédit d''un autre tenant. Le remboursement est atomique avec le passage en échec définitif. La distinction temporaire / définitif appartient à l''appelant, seul à lire le code du prestataire. service_role uniquement.';

revoke all on function public.finish_sms_delivery(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_sms_delivery(uuid, text, text, text, text)
  to service_role;

-- Même raison que pour `claim_sms_delivery` ci-dessus : `create or replace` ne
-- remplace pas une fonction dont l'arité change. Sur une base qui aurait déjà
-- reçu une version antérieure de ce lot, la signature sans organisation
-- subsisterait en surcharge — et un appelant qui l'atteindrait clôturerait la
-- ligne d'un autre tenant. Sur une base neuve, ce `drop` est un no-op.
drop function if exists public.finish_sms_delivery(text, text, text, text);

-- ── 9. LA PURGE RGPD APPREND LE CANAL SMS ───────────────────
--
-- CE QU'ELLE IGNORAIT. `sms_log.recipient` est un numéro EN CLAIR, conservé
-- sans limite — y compris chez une organisation qui a déclaré une rétention et
-- dont les participations, la newsletter et le journal d'e-mails sont purgés
-- depuis toujours. `last_error` (500 caractères) peut de surcroît recopier un
-- message de prestataire citant ce numéro. C'était, dans tout le produit, LE
-- SEUL CANAL COLLECTANT UNE PII SANS ÉCHÉANCE.
--
-- Corps repris de `20260723110000:629` — le plus récent des deux exemplaires,
-- donc celui qui fait foi (voir l'en-tête). Rien n'y est retiré ; deux
-- traitements SMS sont ajoutés, et ils sont DIFFÉRENTS l'un de l'autre. C'est
-- le point de cette section.
--
-- ── (a) `sms_log` : ANONYMISÉ, pas supprimé ──
--
-- Précédent `admin_audit_logs`, dans cette fonction même : l'événement reste
-- probant, la personne cesse d'être identifiable. Supprimer la ligne
-- détruirait la preuve qu'un envoi a eu lieu — c'est-à-dire la trace même dont
-- on a besoin pour répondre « ce message vous a été envoyé le … », et la
-- garantie anti-doublon qui vit dans `dedup_key`. Le destinataire devient un
-- littéral neutre, `last_error` est vidé.
--
-- `provider_message_id` est CONSERVÉ : ce n'est pas un identifiant de personne
-- mais une référence d'accusé de réception, et c'est le seul point d'accroche
-- d'une réclamation de facturation. Choix assumé et signalé, non subi.
--
-- ── (b) `sms_consents` : SURTOUT PAS DE `DELETE` SUR UN RETRAIT ──
--
-- Effacer une ligne retirée, ce serait exécuter à la main le défaut que le
-- trigger `sms_consents_revocation_survives_delete` vient de fermer — avec une
-- bonne intention, ce qui ne change rien au résultat : le numéro redevient
-- contactable au premier consentement suivant. La conservation d'un retrait est
-- légitime au titre de la PREUVE D'OPPOSITION, et c'est même la seule donnée
-- qui permette d'honorer cette opposition.
--
-- La règle est donc dissymétrique, et le trigger a été écrit pour la rendre
-- possible :
--   • consentement JAMAIS retiré et périmé → SUPPRIMÉ. Le trigger le laisse
--     passer, et la suppression échoue du bon côté : « aucun consentement au
--     dossier » veut dire NON contactable ;
--   • consentement RETIRÉ → conservé, MINIMISÉ. On ne garde que la clé
--     normalisée (celle qui fait le rapprochement d'un STOP), la date du
--     retrait, et la version du texte. La forme brute de la saisie, le point de
--     collecte et le motif de retrait partent.
--
-- `phone = phone_key` n'est pas un raccourci : `phone_key` est une colonne
-- CALCULÉE depuis `phone`, on ne peut donc pas vider l'une en gardant l'autre.
-- Écrire la forme normalisée dans `phone` laisse la clé rigoureusement
-- inchangée — `sms_phone_e164` est idempotente sur sa propre sortie — et efface
-- la seule chose qui distinguait les deux : ce que la personne avait tapé.
--
-- Le garde-fou `phone_key ~ <motif du CHECK>` couvre le cas de la § 5 : une clé
-- dégénérée plus courte que six caractères violerait la contrainte de `phone`
-- et ferait échouer TOUTE la purge, pour toutes les tables et toutes les
-- organisations. Ces lignes-là gardent leur forme brute ; résidu documenté,
-- très préférable à une purge qui n'aboutit pas.
create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
    delete from public.email_log
      where organization_id = r.id
        and sent_at < now() - make_interval(months => r.data_retention_months);

    -- (a) Le journal SMS : la ligne reste, la personne s'efface.
    update public.sms_log
       set recipient = '000000',
           last_error = null,
           updated_at = pg_catalog.clock_timestamp()
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months)
        and (recipient <> '000000' or last_error is not null);

    -- (b1) Consentement jamais retiré et périmé : supprimé.
    delete from public.sms_consents
      where organization_id = r.id
        and revoked_at is null
        and consented_at < now() - make_interval(months => r.data_retention_months);

    -- (b2) Consentement RETIRÉ : conservé — c'est la preuve d'opposition — et
    -- réduit à ce qui permet d'honorer cette opposition.
    update public.sms_consents
       set phone = phone_key,
           consent_source = null,
           revoked_reason = null
      where organization_id = r.id
        and revoked_at is not null
        and revoked_at < now() - make_interval(months => r.data_retention_months)
        and phone_key ~ '^\+?[0-9 .()\-]{6,20}$'
        and (phone <> phone_key or consent_source is not null
             or revoked_reason is not null);
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;

comment on function public.purge_expired_personal_data() is
  'Purge RGPD pilotée par organizations.data_retention_months. Supprime participations, désinscrits et email_log ; anonymise admin_audit_logs à 24 mois. DEPUIS LE CANAL SMS, deux traitements de plus, volontairement DIFFÉRENTS : sms_log est ANONYMISÉ (destinataire neutralisé, last_error vidé) et non supprimé — la trace de l''envoi et la garantie anti-doublon doivent survivre ; sms_consents est dissymétrique — un consentement jamais retiré et périmé est supprimé (« aucun consentement au dossier » = non contactable, l''échec est du bon côté), un consentement RETIRÉ n''est JAMAIS supprimé mais réduit à sa clé normalisée, sa date et sa version, parce que le retrait est la preuve d''opposition et le seul moyen de l''honorer. Le supprimer rendrait le numéro contactable au consentement suivant. service_role uniquement.';

-- ADR-049 : `service_role` est révoqué explicitement puis réaccordé. La ligne
-- d'origine (20260723110000:667) ne le révoquait pas — `alter default
-- privileges` le lui redonnait de toute façon, donc le résultat est le même,
-- mais l'intention devient lisible plutôt que dépendante d'un réglage Supabase.
revoke all on function public.purge_expired_personal_data()
  from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_personal_data() to service_role;
