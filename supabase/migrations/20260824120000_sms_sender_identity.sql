-- ============================================================
-- Lastchance — l'expéditeur SMS de l'organisation, et sa déclaration AF2M
-- ============================================================
--
-- Catalogue vivant vérifié AVANT écriture (`grep -l "function public.<nom>"`
-- dans supabase/migrations) :
--   sms_senders_declaration_follows_name → 0 fichier
--   request_sms_sender                   → 0 fichier
--   declare_sms_sender                   → 0 fichier
--   set_sms_sender_status                → 0 fichier
--   sms_sender_for_send                  → 0 fichier
-- Création pure. Aucune fonction existante n'est redéfinie ici, et cette
-- migration ne touche NI `sms_consents` NI `sms_log` : elle est autonome.
-- Le branchement de l'expéditeur sur le chemin d'envoi est fait une seule
-- fois, dans 20260826120000, avec la redéfinition unique de
-- `claim_sms_delivery`.
--
--
-- ── LES DEUX CONTRAINTES RÉGLEMENTAIRES QUI DÉCIDENT DU MODÈLE ──
--
-- 1. L'expéditeur alphanumérique est limité à ONZE caractères, A-Z et 0-9
--    seulement, et la charte AF2M exige qu'il corresponde au NOM COMMERCIAL
--    RÉEL de l'annonceur. Le nom du commerçant est donc conforme — mais
--    chaque expéditeur doit être DÉCLARÉ au registre AF2M avant d'être
--    utilisable. Ce n'est pas un provisionnement instantané : il y a un délai,
--    donc un ÉTAT, donc quelque chose à modéliser.
--
-- 2. Un expéditeur alphanumérique NE PEUT PAS RECEVOIR DE RÉPONSE. Le « STOP »
--    ne revient jamais au commerçant : il part vers un numéro court qui
--    appartient au prestataire ou à la plateforme. Conséquence directe sur ce
--    schéma : il n'y a RIEN ici pour recevoir un STOP. Le retrait de
--    consentement entre par `revoke_sms_consent` (20260823120000), appelée par
--    le serveur qui reçoit la remontée du prestataire. Modéliser une boîte de
--    réception par expéditeur serait modéliser un canal qui n'existe pas.
--
--
-- ── POURQUOI UNE TABLE, ET NON UNE COLONNE SUR `organizations` ──
--
-- La demande parlait d'« une colonne portant l'identifiant d'expéditeur, avec
-- un état de déclaration ». Une table, pour trois raisons, dans l'ordre de
-- leur poids :
--
--   a) LE CHANGEMENT DE NOM EST LE CAS DANGEREUX, et une colonne le rend
--      indétectable. Un commerçant qui renomme son enseigne écraserait la
--      valeur ; l'état de déclaration, lui, resterait « déclaré » — et le
--      prochain envoi partirait sous un nom JAMAIS déclaré, avec un état qui
--      affirme le contraire. C'est exactement la classe du défaut « gel du
--      libellé » du 2026-07-31 : une donnée qui bouge sous une affirmation
--      qui ne bouge pas. Ici le couple (nom, état) est une LIGNE, et le
--      trigger `sms_senders_declaration_follows_name` fait retomber l'état
--      dès que le nom change.
--
--   b) LA TRANSITION A BESOIN DE DEUX LIGNES SIMULTANÉES. Pendant un
--      changement d'enseigne, il faut déclarer le nouveau nom AVANT de cesser
--      d'utiliser l'ancien — sinon le commerçant n'a plus d'expéditeur du
--      tout pendant le délai AF2M. Une colonne ne peut pas porter deux
--      valeurs ; une table le fait, et l'index partiel ci-dessous garantit
--      qu'un seul est UTILISABLE à la fois.
--
--   c) La déclaration porte sa propre matière — référence de registre, date,
--      motif de refus, date de retrait. Cinq colonnes sur `organizations`,
--      table lue à chaque requête et dont chaque colonne ajoutée demande un
--      `grant select (colonne)` séparé (les grants y sont par colonne depuis
--      00017), pour un objet qui n'intéresse que le canal SMS.
--
-- Le prix de ce choix, assumé : une jointure de plus au moment de l'envoi.
-- Elle est indexée et se paie une fois par SMS, pas une fois par page.
-- ============================================================

-- ── 1. La table ─────────────────────────────────────────────
create table if not exists public.sms_senders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- LA contrainte de format, en base et non seulement en Zod : c'est le
  -- prestataire qui refuserait l'envoi, donc au moment où l'erreur se voit il
  -- est déjà trop tard — le SMS est perdu, et sur ce canal il est facturé.
  -- Onze caractères, majuscules et chiffres. Aucun espace, aucun tiret,
  -- aucun accent : la charte AF2M ne les admet pas, et un « CAFÉ » saisi de
  -- bonne foi doit être refusé ICI, à la saisie, pas à l'envoi.
  sender_id text not null
    check (sender_id ~ '^[A-Z0-9]{1,11}$'),

  -- L'état de déclaration. `pending` par défaut : un expéditeur n'est JAMAIS
  -- utilisable à la création. C'est le sens même de la déclaration AF2M.
  --   pending      demandé, pas encore déclaré au registre → INUTILISABLE
  --   declared     déclaré et accepté                      → utilisable
  --   rejected     refusé par le registre                  → INUTILISABLE
  --   suspended    déclaré puis suspendu (plainte, abus)   → INUTILISABLE
  -- Trois états sur quatre refusent l'envoi. La liste est fermée parce qu'un
  -- état inconnu serait interprété par le lecteur, et qu'un lecteur qui
  -- interprète un état d'autorisation finit par autoriser.
  status text not null default 'pending'
    check (status in ('pending', 'declared', 'rejected', 'suspended')),

  -- Référence rendue par le registre AF2M. Texte libre : le format
  -- appartient au registre, pas à nous, et le présumer ferait refuser une
  -- référence valide le jour où il change.
  af2m_reference text
    check (af2m_reference is null or char_length(af2m_reference) between 1 and 120),

  declared_at timestamptz,
  status_reason text
    check (status_reason is null or char_length(status_reason) between 1 and 300),

  -- Retrait de l'expéditeur par le commerçant ou la plateforme. On ne
  -- SUPPRIME pas la ligne : la trace de ce qui a été déclaré, et quand, est
  -- ce qui permet de répondre à une réclamation sur un SMS déjà parti.
  retired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un expéditeur déclaré est DATÉ, et un expéditeur non déclaré ne porte pas
  -- de date de déclaration. L'équivalence dans les deux sens, sur le modèle de
  -- `sms_log_sent_state` et de `contest_awards` : c'est ce qui empêche l'état
  -- et sa preuve de se désynchroniser.
  constraint sms_senders_declared_state check (
    (status = 'declared') = (declared_at is not null)
  ),
  -- Une référence de registre sans déclaration serait une preuve sans fait.
  constraint sms_senders_reference_requires_declaration check (
    af2m_reference is null or declared_at is not null
  )
);

-- Un même nom ne se demande pas deux fois dans la même organisation.
create unique index if not exists sms_senders_org_name_unique
  on public.sms_senders (organization_id, sender_id);

-- ⚠️ L'INDEX QUI PORTE LA RÈGLE : au plus UN expéditeur utilisable par
-- organisation. Il est partiel sur `status = 'declared' and retired_at is
-- null`, donc il n'interdit PAS d'avoir en même temps un `declared` (celui qui
-- sert) et un `pending` (le nouveau nom en cours de déclaration). C'est
-- exactement la fenêtre de transition décrite en en-tête : sans elle, changer
-- d'enseigne couperait les SMS pendant tout le délai AF2M.
create unique index if not exists sms_senders_one_usable_per_org
  on public.sms_senders (organization_id)
  where status = 'declared' and retired_at is null;

create index if not exists sms_senders_org_idx
  on public.sms_senders (organization_id, created_at desc);

comment on table public.sms_senders is
  'Expéditeur alphanumérique SMS d''une organisation (≤ 11 car., A-Z0-9) et son état de déclaration AF2M. TABLE et non colonne sur organizations : le couple (nom, état) doit bouger ENSEMBLE — une colonne renommée laisserait un état « déclaré » sur un nom jamais déclaré — et la transition d''enseigne exige deux lignes simultanées (l''ancien déclaré, le nouveau en attente). Un expéditeur alphanumérique NE REÇOIT PAS de réponse : aucun STOP n''arrive ici, il entre par revoke_sms_consent.';
comment on column public.sms_senders.status is
  'pending / declared / rejected / suspended. SEUL `declared` (et non retiré) autorise un envoi — trois états sur quatre refusent. Le trigger sms_senders_declaration_follows_name fait retomber `declared` en `pending` dès que le nom change : sans lui, renommer un expéditeur enverrait sous un nom jamais déclaré.';
comment on index public.sms_senders_one_usable_per_org is
  'Au plus UN expéditeur utilisable par organisation. Partiel à dessein : un `pending` peut coexister avec le `declared` en service, sinon un changement d''enseigne couperait les SMS pendant tout le délai de déclaration AF2M.';

alter table public.sms_senders enable row level security;
revoke all on table public.sms_senders from public, anon, authenticated, service_role;
-- Lecture propriétaire, comme `sms_consents` et `sms_log` : l'expéditeur n'est
-- pas une PII, mais il est l'identité commerciale de l'organisation et son
-- état conditionne la facturation du canal.
grant select on table public.sms_senders to authenticated;
create policy sms_senders_owner_read on public.sms_senders
  for select to authenticated
  using (public.is_org_owner(organization_id));
grant select, insert, update, delete on table public.sms_senders to service_role;

-- ── 2. LA GARDE : la déclaration suit le nom ────────────────
--
-- Le geste dangereux, et il est banal : `update sms_senders set sender_id =
-- 'NOUVEAUNOM' where …`. Sans ce trigger, la ligne reste `declared`, l'envoi
-- passe, et le SMS part sous un nom que le registre ne connaît pas — refus
-- opérateur au mieux, sanction au pire, et dans les deux cas le commerçant est
-- facturé pour un message qui n'arrive pas.
--
-- On ne REFUSE pas le renommage : un commerçant a le droit de changer
-- d'enseigne. On fait retomber l'état, ce qui rend le refus visible AU BON
-- ENDROIT (l'envoi) plutôt qu'au mauvais (l'édition).
create or replace function public.sms_senders_declaration_follows_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    new.status := 'pending';
    new.declared_at := null;
    new.af2m_reference := null;
    new.status_reason := 'nom modifié : nouvelle déclaration AF2M requise';
  end if;

  -- Une déclaration ne s'antidate pas : ce serait couvrir après coup des
  -- envois partis sous un nom pas encore déclaré. Même règle, et même motif,
  -- que `sms_consents_revocation_is_final` sur `consented_at`.
  if new.declared_at is not null and old.declared_at is not null
     and new.declared_at < old.declared_at then
    raise exception 'une déclaration AF2M ne peut pas être antidatée';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- ADR-049, et la garde `security_acl.test.sql:482` (« PUBLIC has no EXECUTE on
-- public functions ») : une fonction de TRIGGER est une fonction comme une
-- autre du point de vue des privilèges, et l'`alter default privileges` de
-- Supabase lui accorde EXECUTE à tout le monde. `revoke … from public, anon`
-- seul laisserait `authenticated` ET `service_role`. Les quatre sont révoqués.
revoke all on function public.sms_senders_declaration_follows_name()
  from public, anon, authenticated, service_role;

create trigger sms_senders_declaration_follows_name
  before update on public.sms_senders
  for each row execute function public.sms_senders_declaration_follows_name();

-- ── 3. Demander un expéditeur (le commerçant) ───────────────
--
-- Rend l'identifiant de la ligne. Idempotente sur le NOM : redemander le même
-- expéditeur ne recrée rien et ne remet pas à zéro une déclaration acquise —
-- sinon un double clic dans le dashboard ferait perdre au commerçant une
-- déclaration obtenue au bout de plusieurs jours.
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
    -- ⚠️ CE COMMENTAIRE ÉTAIT FAUX PAR OMISSION, et c'est ce qui a laissé
    -- passer une trouvaille ÉLEVÉ. Il disait : « une demande sur un expéditeur
    -- RETIRÉ le remet en service au stade `pending` ; une ligne `declared`
    -- n'est pas touchée du tout ». Il décrivait donc DEUX cas sur quatre.
    -- Le `else` du `case` ci-dessous couvre aussi `rejected` ET `suspended`,
    -- et `retired_at = null` est inconditionnel : le commerçant effaçait
    -- lui-même une SUSPENSION prononcée par la plateforme après une plainte
    -- AF2M, motif compris, et la demande retombait dans la file de
    -- déclaration. Inatteignable tant que cette RPC n'avait aucun appelant.
    -- Corrigé par 20260828120000, qui exclut la ligne suspendue de l'UPDATE
    -- et rend son identifiant sans rien réécrire ; le reset d'un `rejected`
    -- y est conservé et JUSTIFIÉ plutôt qu'hérité du silence. Le corps
    -- ci-dessous est laissé tel qu'il a été appliqué — c'est la migration
    -- suivante qui corrige, pas celle-ci.
    update public.sms_senders s
       set retired_at = null,
           status = case when s.status = 'declared' and s.retired_at is null
                         then s.status else 'pending' end,
           declared_at = case when s.status = 'declared' and s.retired_at is null
                              then s.declared_at else null end,
           af2m_reference = case when s.status = 'declared' and s.retired_at is null
                                 then s.af2m_reference else null end
     where s.id = v_id;
    return v_id;
  end if;

  insert into public.sms_senders (organization_id, sender_id)
  values (p_organization_id, v_name)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.request_sms_sender(uuid, text) is
  'Demande un expéditeur SMS pour une organisation. Met en majuscules et coupe les bordures, mais NE retire PAS les caractères interdits : un nom silencieusement transformé serait un nom que le commerçant n''a pas choisi et découvrirait chez ses clients. État initial `pending` — jamais utilisable avant déclaration AF2M. Idempotente sur le nom : ne remet jamais à zéro une déclaration acquise. service_role uniquement.';

revoke all on function public.request_sms_sender(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_sms_sender(uuid, text) to service_role;

-- ── 4. Déclarer un expéditeur (la PLATEFORME, jamais le commerçant) ──
--
-- Séparée de `request_sms_sender` À DESSEIN, et c'est la propriété de sécurité
-- de cette migration : si le même appel demandait ET déclarait, tout chemin
-- capable de créer un expéditeur pourrait l'auto-déclarer, et la déclaration
-- AF2M ne serait plus qu'un champ que le commerçant remplit lui-même.
--
-- Le contrôle du RÔLE de l'appelant (commerçant / administrateur plateforme)
-- appartient à la couche applicative : ici les deux fonctions sont
-- `service_role`, comme tout le reste du socle SMS. Ce que la base garantit,
-- c'est qu'il existe DEUX portes distinctes à surveiller, et non une seule
-- qu'on ne peut plus refermer à moitié.
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
     and s.status <> 'declared';

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.declare_sms_sender(uuid, text, text) is
  'Marque un expéditeur SMS comme DÉCLARÉ au registre AF2M. Séparée de request_sms_sender à dessein : si la même porte demandait et déclarait, la déclaration ne serait qu''un champ que le commerçant remplit lui-même. Exige une référence de registre — une déclaration sans référence est une affirmation sans preuve. Réservée à la plateforme. service_role uniquement.';

revoke all on function public.declare_sms_sender(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.declare_sms_sender(uuid, text, text) to service_role;

-- ── 5. Refuser, suspendre, retirer ──────────────────────────
create or replace function public.set_sms_sender_status(
  p_organization_id uuid,
  p_sender_id text,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
  v_name text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_sender_id, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- `declared` est volontairement ABSENT de cette liste : on ne déclare que
  -- par `declare_sms_sender`, qui exige la référence de registre. Laisser
  -- passer `declared` ici rouvrirait la porte que la section 4 vient de
  -- fermer.
  if p_status not in ('pending', 'rejected', 'suspended', 'retired') then
    raise exception 'état d''expéditeur SMS invalide : % (declared passe par declare_sms_sender)', p_status;
  end if;

  update public.sms_senders s
     set status = case when p_status = 'retired' then s.status else p_status end,
         declared_at = case when p_status = 'retired' then s.declared_at else null end,
         af2m_reference = case when p_status = 'retired' then s.af2m_reference else null end,
         retired_at = case when p_status = 'retired'
                           then pg_catalog.clock_timestamp() else s.retired_at end,
         status_reason = p_reason
   where s.organization_id = p_organization_id
     and s.sender_id = v_name;

  get diagnostics v_touched = row_count;
  return v_touched > 0;
end;
$$;

comment on function public.set_sms_sender_status(uuid, text, text, text) is
  'Refuse (rejected), suspend (suspended), remet en attente (pending) ou retire (retired) un expéditeur SMS. `declared` est EXCLU de cette porte : il n''existe que par declare_sms_sender, qui exige la référence de registre. Un retrait conserve la ligne — la trace de ce qui a été déclaré, et quand, est ce qui permet de répondre à une réclamation sur un SMS déjà parti. service_role uniquement.';

revoke all on function public.set_sms_sender_status(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_sms_sender_status(uuid, text, text, text) to service_role;

-- ── 6. L'expéditeur utilisable, s'il existe ─────────────────
--
-- Point de lecture UNIQUE du chemin d'envoi. `claim_sms_delivery`
-- (20260826120000) l'appelle et refuse la réservation si le résultat est
-- `null` — c'est là, et nulle part ailleurs, que « non déclaré = pas
-- d'envoi » devient exécutable.
create or replace function public.sms_sender_for_send(
  p_organization_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.sender_id
    from public.sms_senders s
   where s.organization_id = p_organization_id
     and s.status = 'declared'
     and s.retired_at is null
   limit 1;
$$;

comment on function public.sms_sender_for_send(uuid) is
  'L''expéditeur SMS utilisable d''une organisation, ou NULL. `declared` ET non retiré : trois états sur quatre rendent null. Point de lecture unique du chemin d''envoi — claim_sms_delivery refuse la réservation sur un null, et c''est là que « non déclaré = pas d''envoi » devient exécutable plutôt que documentaire. service_role uniquement.';

revoke all on function public.sms_sender_for_send(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.sms_sender_for_send(uuid) to service_role;
