-- ============================================================
-- FID-5a — LE PARRAINAGE DU PASSEPORT (côté base)
--
-- Demande du propriétaire, mot pour mot : « on rajoute la possibilité de
-- partager la vitrine, ou demander à son ami de créer son passeport et ça
-- rapporte tant de points, le filleul doit valider son passeport via une
-- commande ou à la boutique et ensuite le parrain reçoit son avantage en
-- point ».
--
-- Trois exigences, et la deuxième est le cœur : j'invite un ami, il crée son
-- passeport, IL LE FAIT VALIDER CHEZ LE COMMERÇANT, et alors seulement je
-- reçois des points. Un passeport créé et jamais tamponné ne rapporte RIEN.
--
--
-- ── POURQUOI UN JUMEAU ET NON UNE RÉUTILISATION ───────────────
--
-- Le module Parrainage de la roue (20260729120000) existe, il est bon, et il
-- est INUTILISABLE ici — trois couplages durs, pas un seul :
--
--   · `referral_programs` est `unique (campaign_id)` avec FK composite vers
--     `campaigns` : un programme par CAMPAGNE. Un passeport n'est pas une
--     campagne, et n'en a pas ;
--   · `referral_signups.proof_spin_id` est une FK NON NULLE vers `spins` : la
--     preuve EST un tour de roue. Notre preuve est un tampon ;
--   · `consume_referral_spin_grant` tire sur la roue de la campagne : la
--     récompense est un tour ou un lot à stock fini, jamais des points.
--
-- Les tordre pour les faire entrer — un `campaign_id` nullable, un
-- `proof_spin_id` nullable, un quatrième `kind` de versement — reviendrait à
-- rendre optionnel tout ce qui fait aujourd'hui la solidité de ce module :
-- chaque colonne nullable est une branche que `validate_referral` devrait
-- désormais tester, dans une fonction dont les huit refus sont le fruit d'une
-- revue de sécurité. On ne relâche pas un invariant vérifié pour économiser
-- deux tables.
--
-- CE QUI EST REPRIS, EN REVANCHE, C'EST LE MODÈLE, et il l'est en entier :
-- code de parrain à alphabet non ambigu, plafond de filleuls, fenêtre de
-- validité, anti-auto-parrainage, anti-boucle, anti-doublon, refus NOMMÉS
-- plutôt qu'un `false` muet, verrou du parrain pendant toute l'attribution.
--
--
-- ── LE PROGRAMME : DES COLONNES, PAS UNE TABLE JUMELLE ────────
--
-- L'arbitrage se pose parce que le parrainage historique a choisi l'inverse,
-- et il faut dire pourquoi le même choix serait faux ici.
--
-- `referral_programs` est une TABLE parce qu'elle s'accroche à une CAMPAGNE,
-- laquelle n'est pas un « programme » : il n'existait aucune ligne où poser
-- ces réglages. Et parce qu'ils sont NOMBREUX — trois versements indépendants
-- (parrain / filleul / coffre) × quatre colonnes chacun (kind, label, details,
-- stock) plus leur compteur de tirage, soit dix-huit colonnes de
-- configuration. Une table se justifiait deux fois.
--
-- Ici, ni l'un ni l'autre :
--
--   · le lien est UN-POUR-UN avec une ligne qui existe déjà.
--     `loyalty_programs` EST le programme du commerçant — il porte déjà ses
--     seuils de niveau, son mode de validation, son cooldown. Le parrainage
--     est un réglage de ce programme, pas un objet à côté de lui ;
--   · les réglages sont CINQ SCALAIRES, et ils le restent : la récompense
--     est un CRÉDIT DE POINTS, pas un versement configurable. Il n'y a ni
--     kind, ni label, ni stock, ni compteur de tirage à prévoir — la monnaie
--     a déjà tout ça (§ « le versement »).
--
-- Ce qu'une table jumelle aurait coûté pour ces cinq entiers : sa RLS, ses
-- grants de colonnes, sa FK composite tenant, son trigger d'audit marchand,
-- et une jointure sur CHAQUE chemin de lecture — `record_loyalty_stamp`,
-- l'écran de réglages, les statistiques. Cinq colonnes sur une ligne déjà
-- lue, déjà auditée, déjà protégée, ne coûtent rien de tout ça.
--
-- La règle qui a tranché, et qu'on peut réutiliser : une table à part se
-- justifie quand les réglages sont NOMBREUX ou VERSIONNÉS ; des colonnes,
-- quand le lien est un-pour-un et la configuration plate. Ici, plate et
-- un-pour-un.
--
--
-- ── LA PREUVE : LE PREMIER TAMPON, ET RIEN D'AUTRE ────────────
--
-- `validate_referral` (20260729120000:812-830) exige que le filleul ait
-- VRAIMENT JOUÉ, pas seulement cliqué : sa preuve est un spin réel. Notre
-- équivalent exact est LE PREMIER TAMPON du filleul, jamais la création de
-- son passeport — c'est mot pour mot ce que le propriétaire demande, et c'est
-- la seule borne économique du module : un tampon se gagne en caisse ou par
-- un QR de commande, il coûte une visite réelle au filleul.
--
-- Ce premier tampon doit être POSTÉRIEUR à la création du code du parrain.
-- Sans cette condition, tout client déjà fidèle — passeport ouvert et
-- tamponné depuis des mois — serait présentable comme un « filleul » par
-- n'importe qui : le parrainage paierait pour une clientèle déjà acquise, ce
-- qui est exactement le contraire de « ça augmente la portée du commerce ».
-- Refus nommé : `already_customer`.
--
-- Cas voisin et LÉGITIME, qu'on accepte donc : un passeport ouvert avant
-- l'invitation mais JAMAIS tamponné, que l'invitation décide enfin à venir.
-- Son premier tampon est postérieur, il compte. C'est bien une visite que le
-- commerce n'aurait pas eue.
--
--
-- ── LE VERSEMENT : DEUX COMPTEURS, PAS UN ─────────────────────
--
-- Depuis FID-2a (20261114120000), les points sont une monnaie à DEUX
-- compteurs : `points_balance` descend quand on dépense, `points_earned_total`
-- ne descend jamais et porte seul le niveau bronze/argent/or.
--
-- Un parrainage est un GAIN. Il monte donc les DEUX, exactement comme un
-- tampon — sinon le parrain aurait de quoi acheter sans jamais progresser en
-- statut, ce qui reviendrait à dire que parrainer ne compte pas comme de la
-- fidélité. Le niveau est recalculé sur le nouveau cumul, avec la MÊME règle
-- que `record_loyalty_stamp` (c'est pour ne pas en écrire une troisième copie
-- que `loyalty_referral_credit` existe).
--
-- IDEMPOTENCE — sans identifiant d'intention, et c'est délibéré.
-- `spend_loyalty_points` exige un `p_request_id` parce qu'un même client peut
-- légitimement racheter le même cadeau dix fois : rien dans les données ne
-- distingue deux achats d'un double-clic. Un parrainage, lui, est UNIQUE PAR
-- NATURE — un passeport est le filleul de quelqu'un une fois, pour toujours.
-- La clé d'idempotence est donc la donnée elle-même,
-- `unique (program_id, filleul_member_id)`, et un rejeu relit le versement
-- déjà conclu au lieu d'en créer un second. Un `request_id` en plus n'aurait
-- rien fermé de ce que cette contrainte ne ferme déjà, et aurait ouvert le
-- cas où deux intentions différentes réclament le même parrainage.
--
--
-- ── SÉCURITÉ (miroir du module) ───────────────────────────────
--   · AUCUN droit `anon` ; le parcours joueur passe par le service role ;
--   · gestion commerçant sous RLS `is_org_member` (lecture) / `is_org_editor`
--     (écriture) ; données joueurs en lecture d'équipe, écriture RPC-only ;
--   · `loyalty_programs` utilise des GRANTS DE COLONNES (20260725120000:285) :
--     une colonne ajoutée ensuite n'est ni lisible ni modifiable par une
--     session marchande tant qu'on ne l'accorde pas. C'est la panne qui a
--     coûté six lots à ce dépôt — `jackpot_campaign_id` (20261112130000) puis
--     `table_turn_minutes` (20261108120000) livrées sans leur grant, écrans
--     qui échouent en silence. La garde finale de ce fichier REFUSE de
--     s'appliquer si un droit n'est pas effectif.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. LES CINQ RÉGLAGES, SUR LE PROGRAMME DE FIDÉLITÉ
--
-- `referral_enabled` à false : le parrainage est OPT-IN, comme le programme
-- historique. Aucun commerçant ne se réveille en distribuant des points.
--
-- Les défauts (200 / 100) sont exprimés dans l'unité de FID-2a — une visite
-- vaut 100 points. Un parrainage réussi vaut donc deux visites au parrain et
-- une au filleul : assez pour se voir, pas assez pour valoir mieux que de
-- venir. Le commerçant les règle ensuite.
--
-- Zéro est autorisé et signifie « aucun versement de ce côté » : c'est le
-- `kind = 'none'` du module historique, sans colonne supplémentaire pour le
-- dire. Un parrainage à 0/0 reste enregistré — le commerçant veut compter ses
-- filleuls même s'il ne les paie pas.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_programs
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_sponsor_points integer not null default 200
    check (referral_sponsor_points between 0 and 100000),
  add column if not exists referral_filleul_points integer not null default 100
    check (referral_filleul_points between 0 and 100000),
  add column if not exists referral_max_filleuls integer not null default 20
    check (referral_max_filleuls between 1 and 1000),
  add column if not exists referral_window_days integer not null default 30
    check (referral_window_days between 1 and 365);

comment on column public.loyalty_programs.referral_enabled is
  'PARRAINAGE DU PASSEPORT (FID-5a) — opt-in du commerçant. false = aucun code '
  'ne se crée et validate_loyalty_referral répond ''unavailable''. Le verrou '
  'd''addon (organizations.addon_loyalty) reste le premier, celui-ci le second.';

comment on column public.loyalty_programs.referral_sponsor_points is
  'Points crédités au PARRAIN quand un filleul fait valider son passeport. '
  'Monte points_balance ET points_earned_total (c''est un gain : il compte '
  'pour le niveau). Unité FID-2a — 100 points = 1 visite. 0 = aucun versement '
  'au parrain, le parrainage restant enregistré et compté.';

comment on column public.loyalty_programs.referral_filleul_points is
  'Bonus de BIENVENUE crédité au FILLEUL au même instant. Même unité, mêmes '
  'deux compteurs. 0 = pas de bonus de bienvenue.';

comment on column public.loyalty_programs.referral_max_filleuls is
  'Plafond de filleuls comptés par parrain (ADR-031 : borne le nombre de '
  'versements qu''un parrain peut engendrer). Au-delà → ''capped'', rien versé.';

comment on column public.loyalty_programs.referral_window_days is
  'Fenêtre de validité d''un code de parrain, en jours depuis SA CRÉATION. '
  'Au-delà → ''expired''. Borne aussi, indirectement, l''ancienneté maximale '
  'du premier tampon recevable.';

-- ── LES GRANTS DE COLONNES, ET POURQUOI PAS `insert` ──
--
-- `loyalty_programs` n'accorde pas la table à `authenticated` mais des
-- COLONNES, une par une (20260725120000:285-296). Ces cinq lignes sont donc la
-- seule chose qui rend l'écran de réglages capable de lire et d'écrire le
-- parrainage ; sans elles, le panneau enregistrerait dans le vide.
--
-- L'INSERTION n'est pas accordée, et c'est le même arbitrage que
-- 20261112120000 pour `table_turn_minutes` : un programme de fidélité NAÎT
-- avec les valeurs par défaut (parrainage coupé, 200/100/20/30) et le
-- commerçant les ajuste ensuite depuis les réglages. Accorder l'insertion
-- ouvrirait cinq champs de formulaire que l'écran de création ne rend pas.
grant select (referral_enabled, referral_sponsor_points, referral_filleul_points,
              referral_max_filleuls, referral_window_days)
  on public.loyalty_programs to authenticated;
grant update (referral_enabled, referral_sponsor_points, referral_filleul_points,
              referral_max_filleuls, referral_window_days)
  on public.loyalty_programs to authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. LE PARRAIN ET SON CODE
--
-- Un parrain EST un porteur de passeport : la table ne réinvente pas une
-- identité, elle pointe le `loyalty_members` qui existe déjà. C'est ce qui
-- permet de le créditer sans autre jointure, et ce qui rend l'auto-parrainage
-- trivial à refuser (même id de membre).
--
-- Le code reprend la FORME du module historique — alphabet sans I/O/0/1 pour
-- qu'un code lu à voix haute ou recopié depuis un écran ne se trompe pas de
-- caractère — avec un préfixe DISTINCT : `PASS-` et non `PR-`. Deux modules
-- vivent côte à côte dans la même organisation ; un préfixe partagé rendrait
-- indécidable, à la lecture d'un code, lequel des deux parcours le traite.
-- ────────────────────────────────────────────────────────────

create table public.loyalty_referral_sponsors (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Le passeport du parrain. Composite tenant : un membre d'un autre programme
  -- ou d'une autre organisation ne peut pas être cousu ici.
  member_id uuid not null,
  -- Jeton partageable (URL/QR). Unique tous programmes confondus.
  referral_code text not null unique
    check (referral_code ~ '^PASS-[A-HJ-NP-Z2-9]{8}$'),
  -- Nombre de filleuls validés. Maintenu par validate_loyalty_referral, borné
  -- par loyalty_programs.referral_max_filleuls.
  validated_count integer not null default 0 check (validated_count >= 0),
  created_at timestamptz not null default now(),
  -- Un parrain par passeport.
  unique (program_id, member_id),
  -- Support des FK composites tenant depuis loyalty_referral_signups.
  unique (id, organization_id),
  unique (id, program_id, organization_id),
  foreign key (program_id, organization_id)
    references public.loyalty_programs(id, organization_id) on delete cascade,
  foreign key (member_id, program_id, organization_id)
    references public.loyalty_members(id, program_id, organization_id) on delete cascade
);

comment on table public.loyalty_referral_sponsors is
  'Parrain du passeport (FID-5a) : un porteur de passeport et son code '
  'PASS-… à partager. validated_count = filleuls dont le passeport a été '
  'VALIDÉ (premier tampon), pas ceux qui se sont contentés de l''ouvrir. '
  'Créé/relu par ensure_loyalty_referral_code, jamais écrit par une session.';

comment on column public.loyalty_referral_sponsors.created_at is
  'DATE DE RÉFÉRENCE DU PARRAINAGE, et pas seulement une trace : la fenêtre '
  'referral_window_days court depuis elle, et le premier tampon d''un filleul '
  'doit lui être POSTÉRIEUR (sinon ''already_customer'' — un client déjà '
  'fidèle n''est le filleul de personne).';

create index loyalty_referral_sponsors_org_idx
  on public.loyalty_referral_sponsors (organization_id);
create index loyalty_referral_sponsors_program_idx
  on public.loyalty_referral_sponsors (program_id);
-- Tête de la FK composite du membre : sans lui, la purge RGPD d'un passeport
-- (purge_expired_loyalty_members) balaie la table entière par cascade.
create index loyalty_referral_sponsors_member_idx
  on public.loyalty_referral_sponsors (member_id);


-- ────────────────────────────────────────────────────────────
-- 3. LE FILLEUL VALIDÉ — ET LE VERSEMENT, DANS LA MÊME LIGNE
--
-- Le module historique sépare `referral_signups` (qui est filleul) de
-- `referral_rewards` (ce qui a été versé). Cette séparation existe parce
-- qu'un versement y est une CHOSE avec un cycle de vie propre : un code à
-- remettre en caisse, un jeton de tour à consommer, un stock à décrémenter,
-- une date de retrait, un agent qui l'a remis.
--
-- Un crédit de points n'a rien de tout cela. Il atterrit sur
-- `loyalty_members.points_balance`, il est instantané, il ne se remet pas en
-- caisse et ne s'épuise pas. Ce qu'une table `rewards` porterait ici tiendrait
-- en deux entiers : combien au parrain, combien au filleul. Ces deux entiers
-- vivent donc SUR LE PARRAINAGE, dont ils sont l'unique conséquence.
--
-- Et ce n'est pas qu'une économie : cette ligne EST la clé d'idempotence.
-- Un parrainage et son versement sont le même fait ; deux tables les auraient
-- rendus séparément insérables, donc désynchronisables.
--
-- Les montants sont GRAVÉS, pas relus du programme — même raison que
-- `spent_points` sur `loyalty_rewards` (20261114120000) : le commerçant peut
-- changer son barème demain, et il faut pouvoir dire ce qui a été versé pour
-- CETTE ligne-là.
-- ────────────────────────────────────────────────────────────

create table public.loyalty_referral_signups (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sponsor_id uuid not null,
  -- Le passeport du filleul.
  filleul_member_id uuid not null,
  -- LA PREUVE : le premier tampon du filleul, celui qui a fait passer son
  -- passeport de « ouvert » à « validé ». Non nulle — il n'existe pas de
  -- parrainage sans preuve. Un tampon ne vaut qu'un parrainage (unique).
  proof_stamp_id uuid not null,
  -- Ce qui a été VERSÉ, gravé à l'instant du versement.
  sponsor_points_awarded integer not null default 0
    check (sponsor_points_awarded >= 0),
  filleul_points_awarded integer not null default 0
    check (filleul_points_awarded >= 0),
  created_at timestamptz not null default now(),
  -- UN PASSEPORT EST LE FILLEUL DE QUELQU'UN UNE FOIS, POUR TOUJOURS.
  -- C'est à la fois le refus 'duplicate' et la clé d'idempotence du versement.
  unique (program_id, filleul_member_id),
  -- Un tampon ne valide qu'un parrainage (anti-réutilisation de la preuve,
  -- miroir de unique(proof_spin_id) du module historique).
  unique (proof_stamp_id),
  foreign key (sponsor_id, program_id, organization_id)
    references public.loyalty_referral_sponsors(id, program_id, organization_id)
    on delete cascade,
  foreign key (filleul_member_id, program_id, organization_id)
    references public.loyalty_members(id, program_id, organization_id) on delete cascade,
  foreign key (proof_stamp_id, organization_id)
    references public.loyalty_stamps(id, organization_id) on delete cascade,
  foreign key (program_id, organization_id)
    references public.loyalty_programs(id, organization_id) on delete cascade
);

comment on table public.loyalty_referral_signups is
  'Parrainage CONCLU (FID-5a) : un filleul dont le passeport a été validé, son '
  'parrain, le tampon qui sert de preuve, et les points versés de part et '
  'd''autre. Une ligne = un versement, indivisible. Écrite par '
  'validate_loyalty_referral uniquement.';

comment on column public.loyalty_referral_signups.proof_stamp_id is
  'LE PREMIER TAMPON DU FILLEUL — la preuve exigée par le propriétaire (« le '
  'filleul doit valider son passeport via une commande ou à la boutique »). '
  'Équivalent de referral_signups.proof_spin_id, qui exige un tour de roue '
  'réel. Créer un passeport ne suffit PAS : sans tampon, rien n''est versé.';

comment on column public.loyalty_referral_signups.sponsor_points_awarded is
  'Points effectivement versés au parrain, GRAVÉS à l''instant du versement — '
  'jamais relus de loyalty_programs.referral_sponsor_points, que le commerçant '
  'peut changer ensuite (même raison que loyalty_rewards.spent_points). 0 si '
  'le barème était à zéro : le parrainage compte quand même.';

create index loyalty_referral_signups_org_idx
  on public.loyalty_referral_signups (organization_id);
create index loyalty_referral_signups_sponsor_idx
  on public.loyalty_referral_signups (sponsor_id);
create index loyalty_referral_signups_program_idx
  on public.loyalty_referral_signups (program_id);
create index loyalty_referral_signups_filleul_idx
  on public.loyalty_referral_signups (filleul_member_id);


-- ────────────────────────────────────────────────────────────
-- 4. RLS ET DROITS DE TABLE
--
-- Miroir exact des données joueurs du module historique : lecture d'équipe
-- (statistiques, caisse), écriture service role uniquement. Le commerçant
-- CONSTATE ses parrainages, il ne les fabrique pas.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_referral_sponsors enable row level security;
alter table public.loyalty_referral_signups enable row level security;

revoke all on table public.loyalty_referral_sponsors from public, anon, authenticated;
revoke all on table public.loyalty_referral_signups from public, anon, authenticated;

create policy "loyalty_referral_sponsors: member select"
  on public.loyalty_referral_sponsors
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "loyalty_referral_signups: member select"
  on public.loyalty_referral_signups
  for select to authenticated
  using (public.is_org_member(organization_id));

grant select on table public.loyalty_referral_sponsors to authenticated;
grant select on table public.loyalty_referral_signups to authenticated;

grant select, insert, update, delete
  on table public.loyalty_referral_sponsors to service_role;
grant select, insert, update, delete
  on table public.loyalty_referral_signups to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. HELPER INTERNE — CRÉDITER UN PASSEPORT
--
-- Une seule raison d'exister : la règle du niveau. Elle est déjà écrite dans
-- `record_loyalty_stamp` ; l'inliner ici la copierait DEUX FOIS de plus (le
-- parrain et le filleul), et une règle en quatre exemplaires est une règle qui
-- divergera. Elle vit donc à un seul endroit pour ce module.
--
-- Monte les DEUX compteurs — c'est un gain, il compte pour le niveau — et
-- recalcule `tier` sur le NOUVEAU cumul, avec la même expression que le
-- tampon. `visit_count` n'est PAS touché : un parrainage n'est pas une visite,
-- et ce compteur doit continuer de vouloir dire « passages en boutique ».
-- ────────────────────────────────────────────────────────────

create or replace function public.loyalty_referral_credit(
  p_member_id uuid,
  p_program_id uuid,
  p_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_new_balance integer;
  v_new_earned integer;
  v_tier text;
begin
  -- Défense en profondeur : le claim de session se propage à cet appel
  -- imbriqué depuis validate_loyalty_referral (déjà autorisée).
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select p.* into v_prog
    from public.loyalty_programs p
   where p.id = p_program_id;
  if not found then
    raise exception 'unknown loyalty program';
  end if;

  -- Verrou du passeport crédité : sérialise avec un tampon concurrent, qui
  -- lit puis réécrit les mêmes deux compteurs.
  select m.* into v_member
    from public.loyalty_members m
   where m.id = p_member_id and m.program_id = p_program_id
   for update;
  if not found then
    raise exception 'unknown loyalty member';
  end if;

  v_new_balance := v_member.points_balance + p_points;
  v_new_earned := v_member.points_earned_total + p_points;
  -- MÊME expression que record_loyalty_stamp : le niveau se lit sur le CUMUL.
  v_tier := case
    when v_new_earned >= v_prog.gold_threshold then 'gold'
    when v_new_earned >= v_prog.silver_threshold then 'silver'
    else 'bronze' end;

  update public.loyalty_members
     set points_balance = v_new_balance,
         points_earned_total = v_new_earned,
         tier = v_tier
   where id = v_member.id;

  return pg_catalog.jsonb_build_object(
    'member_id', v_member.id,
    'points_awarded', p_points,
    'points_balance', v_new_balance,
    'points_earned_total', v_new_earned,
    'visit_count', v_member.visit_count,
    'tier', v_tier
  );
end;
$$;

comment on function public.loyalty_referral_credit(uuid, uuid, integer) is
  'INTERNE (FID-5a) : crédite un passeport de N points sur les DEUX compteurs '
  'et recalcule son niveau sur le cumul, avec la règle de record_loyalty_stamp. '
  'Appelée uniquement par validate_loyalty_referral. Ne touche pas visit_count '
  '— un parrainage n''est pas une visite.';

revoke all on function public.loyalty_referral_credit(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.loyalty_referral_credit(uuid, uuid, integer)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. ensure_loyalty_referral_code — LE CODE À PARTAGER
--
-- Get-or-create, miroir d'ensure_referral_sponsor : ré-appeler rend le MÊME
-- code, et sert au passage d'état suivable au parrain (combien de filleuls,
-- quel plafond). Exige addon + programme actif + parrainage activé, sinon
-- 'unavailable' — réponse identique quel que soit le motif, pas d'oracle.
--
-- Exige aussi que l'appelant SOIT DÉJÀ un porteur de passeport : on ne
-- parraine pas un programme auquel on ne participe pas. Un passeport ouvert
-- suffit — c'est le filleul qui doit prouver, pas le parrain.
-- ────────────────────────────────────────────────────────────

create or replace function public.ensure_loyalty_referral_code(
  p_program_id uuid,
  p_member_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_sponsor public.loyalty_referral_sponsors%rowtype;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Gating : addon + programme actif + parrainage activé.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty;
  if not found or v_prog.status <> 'active' or not v_prog.referral_enabled then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_a_member');
  end if;

  select s.* into v_sponsor
    from public.loyalty_referral_sponsors s
   where s.program_id = v_prog.id and s.member_id = v_member.id;

  if not found then
    -- Création : code PASS-… unique. Une insertion concurrente pour le même
    -- passeport est rattrapée par unique(program_id, member_id) → on relit la
    -- ligne gagnante, exactement comme ensure_referral_sponsor.
    for attempt in 1..12 loop
      v_code := 'PASS-';
      v_bytes := extensions.gen_random_bytes(8);
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.loyalty_referral_sponsors
          (program_id, organization_id, member_id, referral_code)
        values (v_prog.id, v_prog.organization_id, v_member.id, v_code)
        returning * into v_sponsor;
        exit;
      exception when unique_violation then
        select s.* into v_sponsor
          from public.loyalty_referral_sponsors s
         where s.program_id = v_prog.id and s.member_id = v_member.id;
        if found then exit; end if;
        v_sponsor.id := null;
      end;
    end loop;
    if v_sponsor.id is null then
      raise exception 'loyalty referral code generation exhausted';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ready',
    'referral_code', v_sponsor.referral_code,
    'validated_count', v_sponsor.validated_count,
    'max_filleuls', v_prog.referral_max_filleuls,
    'window_days', v_prog.referral_window_days,
    -- La fenêtre court depuis la création du code : le parrain doit pouvoir
    -- lire jusqu'à quand son invitation vaut.
    'expires_at', v_sponsor.created_at
      + pg_catalog.make_interval(days => v_prog.referral_window_days),
    'sponsor_points', v_prog.referral_sponsor_points,
    'filleul_points', v_prog.referral_filleul_points
  );
end;
$$;

comment on function public.ensure_loyalty_referral_code(uuid, text) is
  'FID-5a : get-or-create du code de parrainage PASS-… d''un porteur de '
  'passeport, et état suivable (filleuls validés, plafond, échéance). '
  'Idempotent : ré-appeler rend le même code. Service role uniquement.';

revoke all on function public.ensure_loyalty_referral_code(uuid, text)
  from public, anon, authenticated;
grant execute on function public.ensure_loyalty_referral_code(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. validate_loyalty_referral — LE CŒUR
--
-- Sous le verrou du parrain (FOR UPDATE), comme validate_referral. Tout échec
-- renvoie un ÉTAT NOMMÉ sans rien verser et sans lever d'exception qui
-- fuiterait le motif au joueur.
--
-- LES ONZE ÉTATS. Les huit premiers sont ceux du module historique, repris un
-- par un — chacun ferme une fraude réelle, aucun n'est décoratif :
--
--   'unavailable'      addon coupé / programme non actif / parrainage désactivé
--   'invalid'          code inconnu (dans CE programme)
--   'expired'          fenêtre écoulée depuis la création du code
--   'capped'           plafond de filleuls du parrain atteint
--   'self_referral'    le filleul EST le parrain (même passeport)
--   'duplicate'        ce passeport est déjà le filleul de quelqu'un d'autre
--   'loop'             réciprocité directe A→B→A
--   'no_stamp'         passeport ouvert, JAMAIS validé — LE cas central
--
-- Puis les DEUX que ce cas-ci ajoute, et qui n'ont pas d'équivalent
-- historique parce que le parrainage de la roue s'adresse à un device anonyme
-- qui n'a besoin d'exister nulle part avant :
--
--   'not_a_member'     le jeton ne désigne AUCUN passeport de ce programme.
--                      Distinct de 'no_stamp' : « tu n'as pas de passeport »
--                      et « ton passeport n'est pas validé » n'appellent pas
--                      le même écran. Le nom est celui que
--                      `spend_loyalty_points` emploie déjà pour ce fait exact.
--   'already_customer' le premier tampon du filleul est ANTÉRIEUR au code du
--                      parrain : c'était déjà un client. Sans ce refus, la
--                      clientèle existante serait revendable en parrainages,
--                      et le module paierait pour de la portée qu'il n'a pas
--                      créée.
--
-- CE QUI N'EST PAS REPRIS, et pourquoi : le module historique refuse aussi
-- l'auto-parrainage PAR EMAIL et le doublon PAR EMAIL. Un passeport ne porte
-- aucune PII — `loyalty_members` n'a qu'un `token_hash` — donc ces deux
-- variantes n'ont pas d'objet ici. Elles ne sont pas oubliées : il n'y a rien
-- à comparer.
--
-- LA BORNE CONTRE LES IDENTITÉS FABRIQUÉES n'est pas le hash de jeton (un
-- navigateur privé en fabrique un autre), c'est le TAMPON : il s'obtient en
-- caisse ou par un QR de commande, il coûte une visite réelle. Fabriquer dix
-- filleuls demande dix passages en boutique — au prix où le commerçant fixe
-- son barème, l'attaque coûte plus qu'elle ne rapporte. C'est le même
-- raisonnement que la BORNE ÉCONOMIQUE de l'ADR-031, transposé.
-- ────────────────────────────────────────────────────────────

create or replace function public.validate_loyalty_referral(
  p_program_id uuid,
  p_referral_code text,
  p_filleul_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_sponsor public.loyalty_referral_sponsors%rowtype;
  v_filleul public.loyalty_members%rowtype;
  v_existing public.loyalty_referral_signups%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_proof_id uuid;
  v_proof_at timestamptz;
  v_signup_id uuid;
  v_new_count integer;
  v_sponsor_credit jsonb;
  v_filleul_credit jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_filleul_token_hash is null or p_filleul_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Gating (miroir de record_loyalty_stamp) : addon + programme actif +
  -- parrainage activé. Motif jamais distingué.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty;
  if not found or v_prog.status <> 'active' or not v_prog.referral_enabled then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE FILLEUL doit être un porteur de passeport de CE programme. La recherche
  -- est bornée au programme : un passeport d'une autre organisation est donc
  -- indiscernable d'un jeton inventé (pas d'oracle inter-locataire).
  select m.* into v_filleul
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_filleul_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_a_member');
  end if;

  -- LE PARRAIN, résolu par son code DANS CE PROGRAMME et VERROUILLÉ : le
  -- verrou sérialise l'attribution (compteur de filleuls, plafond) entre deux
  -- filleuls qui valideraient au même instant.
  select s.* into v_sponsor
    from public.loyalty_referral_sponsors s
   where s.program_id = v_prog.id
     and s.referral_code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_referral_code, '')))
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'invalid');
  end if;

  -- ── IDEMPOTENCE, sous le verrou et AVANT toute vérification ──
  -- Un parrainage déjà conclu se RELIT ; il ne se rejoue pas. Placée ici, elle
  -- est insensible à une fenêtre entre-temps expirée ou à un plafond
  -- entre-temps atteint : un rejeu n'est pas un nouveau parrainage.
  select sg.* into v_existing
    from public.loyalty_referral_signups sg
   where sg.program_id = v_prog.id
     and sg.filleul_member_id = v_filleul.id;
  if found then
    if v_existing.sponsor_id <> v_sponsor.id then
      -- Déjà filleul de QUELQU'UN D'AUTRE : ce n'est pas un rejeu.
      return pg_catalog.jsonb_build_object('state', 'duplicate');
    end if;
    return pg_catalog.jsonb_build_object(
      'state', 'validated',
      'idempotent', true,
      'signup_id', v_existing.id,
      'validated_count', v_sponsor.validated_count,
      'max_filleuls', v_prog.referral_max_filleuls,
      'sponsor_points', v_existing.sponsor_points_awarded,
      'filleul_points', v_existing.filleul_points_awarded
    );
  end if;

  -- AUTO-PARRAINAGE : le même passeport des deux côtés.
  if v_filleul.id = v_sponsor.member_id then
    return pg_catalog.jsonb_build_object('state', 'self_referral');
  end if;

  -- FENÊTRE : le code cesse de valoir referral_window_days après sa création.
  if v_now > v_sponsor.created_at
       + pg_catalog.make_interval(days => v_prog.referral_window_days) then
    return pg_catalog.jsonb_build_object('state', 'expired');
  end if;

  -- PLAFOND (ADR-031) : borne le nombre de versements qu'un parrain engendre.
  if v_sponsor.validated_count >= v_prog.referral_max_filleuls then
    return pg_catalog.jsonb_build_object('state', 'capped');
  end if;

  -- BOUCLE (réciprocité directe A→B→A) : le filleul courant est-il un parrain
  -- dont le parrain courant est déjà le filleul ? Même profondeur couverte que
  -- le module historique — 1 (réciprocité) plus l'auto-parrainage (0). Les
  -- cycles ≥ 3 restent bornés par le plafond, la fenêtre, et le coût réel d'un
  -- tampon par filleul.
  if exists (
    select 1
      from public.loyalty_referral_signups sg
      join public.loyalty_referral_sponsors sp on sp.id = sg.sponsor_id
     where sg.program_id = v_prog.id
       and sp.member_id = v_filleul.id
       and sg.filleul_member_id = v_sponsor.member_id
  ) then
    return pg_catalog.jsonb_build_object('state', 'loop');
  end if;

  -- ── LA PREUVE : LE PREMIER TAMPON DU FILLEUL ────────────────
  -- « le filleul doit valider son passeport via une commande ou à la
  -- boutique ». Un passeport ouvert et jamais tamponné ne déclenche RIEN :
  -- c'est la demande du propriétaire, et c'est ce que ce bloc tient.
  select st.id, st.stamped_at into v_proof_id, v_proof_at
    from public.loyalty_stamps st
   where st.member_id = v_filleul.id
     and st.program_id = v_prog.id
   order by st.stamped_at, st.id
   limit 1;
  if v_proof_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_stamp');
  end if;

  -- Ce premier tampon doit être POSTÉRIEUR au code du parrain : sinon le
  -- « filleul » était déjà un client, et le parrainage n'a rien créé.
  if v_proof_at < v_sponsor.created_at then
    return pg_catalog.jsonb_build_object('state', 'already_customer');
  end if;

  -- ── LE PARRAINAGE EST CONCLU ────────────────────────────────
  -- Une course concurrente (même filleul, même preuve) est rattrapée par les
  -- contraintes d'unicité → 'duplicate', sans versement.
  begin
    insert into public.loyalty_referral_signups
      (program_id, organization_id, sponsor_id, filleul_member_id, proof_stamp_id,
       sponsor_points_awarded, filleul_points_awarded)
    values (v_prog.id, v_prog.organization_id, v_sponsor.id, v_filleul.id, v_proof_id,
            v_prog.referral_sponsor_points, v_prog.referral_filleul_points)
    returning id into v_signup_id;
  exception when unique_violation then
    return pg_catalog.jsonb_build_object('state', 'duplicate');
  end;

  update public.loyalty_referral_sponsors
     set validated_count = validated_count + 1
   where id = v_sponsor.id
   returning validated_count into v_new_count;

  -- VERSEMENT. Les deux compteurs montent — c'est un gain, il porte le niveau.
  -- Un barème à 0 n'écrit rien plutôt que de faire un tour pour rien.
  if v_prog.referral_sponsor_points > 0 then
    v_sponsor_credit := public.loyalty_referral_credit(
      v_sponsor.member_id, v_prog.id, v_prog.referral_sponsor_points);
  end if;
  if v_prog.referral_filleul_points > 0 then
    v_filleul_credit := public.loyalty_referral_credit(
      v_filleul.id, v_prog.id, v_prog.referral_filleul_points);
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'validated',
    'idempotent', false,
    'signup_id', v_signup_id,
    'validated_count', v_new_count,
    'max_filleuls', v_prog.referral_max_filleuls,
    'sponsor_points', v_prog.referral_sponsor_points,
    'filleul_points', v_prog.referral_filleul_points,
    'sponsor', v_sponsor_credit,
    'filleul', v_filleul_credit
  );
end;
$$;

comment on function public.validate_loyalty_referral(uuid, text, text) is
  'FID-5a, LE CŒUR : valide un filleul dont le PREMIER TAMPON prouve que son '
  'passeport a été validé en boutique, puis crédite parrain et filleul en '
  'points (les deux compteurs). Onze états nommés — les huit de '
  'validate_referral, plus not_a_member et already_customer, propres au '
  'passeport. Idempotent par (program_id, filleul_member_id). Service role '
  'uniquement.';

revoke all on function public.validate_loyalty_referral(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_loyalty_referral(uuid, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. GARDE FINALE — LES DROITS SONT-ILS EFFECTIFS ?
--
-- Quatrième fois cette semaine que ce dépôt paie une colonne livrée sans son
-- droit d'accès : `jackpot_campaign_id` (20261112130000, réparé par
-- 20261112150000), `table_turn_minutes` (20261108120000, réparé par
-- 20261112120000). Un `grant` sans effet — mauvais rôle, colonne mal
-- orthographiée, table qui n'utilise pas de grants de colonnes — NE LÈVE PAS :
-- il passe, le fichier a l'air appliqué, et l'écran échoue en silence des
-- semaines plus tard.
--
-- Ce bloc FAIT ÉCHOUER L'APPLICATION de la migration si un seul des droits
-- ci-dessous n'est pas réellement en place. Modèle :
-- 20261112120000_reglages_rendez_vous_ecrivables.sql.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_colonne text;
begin
  -- ── Les cinq réglages sont lisibles ET modifiables par le commerçant ──
  foreach v_colonne in array array[
    'referral_enabled', 'referral_sponsor_points', 'referral_filleul_points',
    'referral_max_filleuls', 'referral_window_days'
  ] loop
    if not pg_catalog.has_column_privilege(
         'authenticated', 'public.loyalty_programs', v_colonne, 'SELECT')
    then
      raise exception
        'loyalty_programs.% n est pas lisible par authenticated : l ecran de reglages afficherait un parrainage vide', v_colonne;
    end if;
    if not pg_catalog.has_column_privilege(
         'authenticated', 'public.loyalty_programs', v_colonne, 'UPDATE')
    then
      raise exception
        'loyalty_programs.% n est pas modifiable par authenticated : le panneau enregistrerait dans le vide', v_colonne;
    end if;
  end loop;

  -- ── CONTRÔLE NÉGATIF — ce qui doit rester fermé ──
  -- Le secret du code tournant vit sur la MÊME table et ne doit jamais sortir.
  -- Ce fichier touche aux grants de colonnes de loyalty_programs ; une liste de
  -- grants se manipule mal, et cette assertion est ce qui le prouve à chaque
  -- application (même contrôle que 20261116120000).
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT')
  then
    raise exception
      'loyalty_programs.rotating_secret est devenu lisible par authenticated : le code tournant serait falsifiable';
  end if;

  -- ── Les deux tables : lecture d equipe, ecriture service role ──
  if not pg_catalog.has_table_privilege(
       'authenticated', 'public.loyalty_referral_sponsors', 'SELECT')
     or not pg_catalog.has_table_privilege(
       'authenticated', 'public.loyalty_referral_signups', 'SELECT')
  then
    raise exception
      'les tables de parrainage ne sont pas lisibles par authenticated : les statistiques commercant seraient vides';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'public.loyalty_referral_signups', 'INSERT')
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.loyalty_referral_signups', 'UPDATE')
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.loyalty_referral_sponsors', 'INSERT')
  then
    raise exception
      'une session marchande peut ecrire dans le parrainage : elle pourrait se fabriquer des filleuls et des points';
  end if;

  if pg_catalog.has_table_privilege(
       'anon', 'public.loyalty_referral_sponsors', 'SELECT')
     or pg_catalog.has_table_privilege(
       'anon', 'public.loyalty_referral_signups', 'SELECT')
  then
    raise exception
      'anon peut lire le parrainage : les codes des parrains seraient enumerables';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.loyalty_referral_signups', 'INSERT')
  then
    raise exception
      'service_role ne peut pas ecrire les parrainages : la RPC serait injouable';
  end if;

  -- ── Les trois fonctions : fermees a anon/authenticated, ouvertes au service ──
  foreach v_colonne in array array[
    'public.loyalty_referral_credit(uuid, uuid, integer)',
    'public.ensure_loyalty_referral_code(uuid, text)',
    'public.validate_loyalty_referral(uuid, text, text)'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_colonne, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_colonne, 'EXECUTE')
    then
      raise exception
        '% est executable par anon ou authenticated : n importe qui pourrait se crediter des points', v_colonne;
    end if;
    if not pg_catalog.has_function_privilege('service_role', v_colonne, 'EXECUTE')
    then
      raise exception
        '% n est pas executable par service_role : le parrainage serait injouable', v_colonne;
    end if;
  end loop;

  -- ── La RLS est bien active sur les deux tables neuves ──
  if not (select c.relrowsecurity from pg_catalog.pg_class c
           where c.oid = 'public.loyalty_referral_sponsors'::regclass)
     or not (select c.relrowsecurity from pg_catalog.pg_class c
              where c.oid = 'public.loyalty_referral_signups'::regclass)
  then
    raise exception
      'une table de parrainage tourne sans row level security : le cloisonnement multi-locataire ne tiendrait qu au code appelant';
  end if;
end
$migration$;
