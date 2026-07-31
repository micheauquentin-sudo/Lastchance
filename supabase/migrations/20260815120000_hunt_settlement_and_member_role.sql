-- ============================================================
-- Lastchance — deux suppressions/omissions qui laissaient un humain coincé
-- ============================================================
--
-- Cette migration ajoute TROIS fonctions et n'en redéfinit AUCUNE. C'est
-- délibéré : le projet a déjà payé deux fois le prix d'une redéfinition écrite
-- depuis la migration d'origine plutôt que depuis le catalogue vivant
-- (`20260812120000` en dresse la liste : sept corps d'archive sont périmés,
-- dont `org_team_members`). Rien ici n'est un `create or replace` d'un nom
-- existant — la vérification tient donc en une commande :
--
--     grep -l "function public.settle_hunt_completions" supabase/migrations/*.sql
--     grep -l "function public.hunt_players_in_progress" supabase/migrations/*.sql
--     grep -l "function public.set_team_member_role"    supabase/migrations/*.sql
--
-- chacune doit rendre CE fichier, et lui seul.
--
--
-- ── 1. La chasse : supprimer une étape condamnait un joueur ──
--
-- `hunt_scans.step_id` est en `on delete cascade` (20260724120000:130-131).
-- Retirer une étape d'une chasse à 5 étapes n'efface donc PAS les tampons des
-- quatre autres : un joueur qui les avait tous se retrouve à 4 tampons pour 4
-- étapes — et sans ligne `hunt_completions`, car la complétion n'est calculée
-- QUE pendant un scan (`record_hunt_scan`, 20260724120000:437 ; aucun trigger,
-- aucun cron ne la rattrape).
--
-- Le SQL, lui, n'est pas une impasse : dans `record_hunt_scan`, le bloc
-- `if v_done >= v_total` s'exécute même sur un re-tampon d'une étape déjà
-- tamponnée. C'est l'ÉCRAN qui ferme la porte — `hunt-journey.tsx` calcule
-- `complete` dès le chargement (4 >= 4) et n'affiche donc plus le bouton
-- « Valider mon passage », le seul geste qui débloquerait le serveur. Le joueur
-- voit une carte de victoire VIDE : on lui dit qu'il a gagné, sans code, sans
-- explication, sans bouton.
--
-- `settle_hunt_completions` solde ce cas à la source : appelée juste après la
-- suppression d'une étape, elle délivre son code à tout joueur devenu complet.
-- Elle n'invente aucun droit — elle accorde exactement ce que le prochain scan
-- aurait accordé, sous le même verrou de chasse et dans la même limite de
-- stock. Un joueur sans aucun tampon n'obtient rien (`v_total >= 1` et
-- `done >= v_total`), donc aucune identité fabriquée ne gagne quoi que ce soit
-- de plus qu'avant.
--
-- ── CETTE PARITÉ A ÉTÉ AFFIRMÉE AVANT D'ÊTRE ÉCRITE ─────────
--
-- La première version de ce fichier revendiquait la phrase ci-dessus à trois
-- endroits sans porter AUCUNE des quatre gardes de contexte de
-- `record_hunt_scan` (20260724120000:296-306) : `o.addon_hunts`,
-- `status = 'active'`, `starts_at`, `ends_at`. Elle accordait donc STRICTEMENT
-- PLUS qu'un scan, et c'est le texte qui rendait l'écart invisible — on relit
-- une affirmation, pas une absence.
--
-- Le chemin, ouvert à un simple `editor` : `reward_stock` vaut `null` par
-- défaut, c'est-à-dire ILLIMITÉ ; `setHuntStatus` ne garde que le passage VERS
-- `active`, donc repasser la chasse en `draft` est libre ; le plancher « une
-- chasse active garde 2 étapes » ne s'applique plus une fois en brouillon. Il
-- restait à supprimer les étapes une à une : `v_total` tombe à 1, chaque
-- suppression rappelle cette fonction, et tout joueur ayant UN SEUL tampon
-- satisfait `done >= v_total`. Sur 800 joueurs, ~780 codes `CHASSE-` réels et
-- sans plafond — que `redeem_hunt_completion` honore toutes, puisqu'elle ne
-- vérifie que l'organisation, le code et `redeemed_at is null`.
--
-- Les quatre gardes sont donc portées ici. Elles rendent `0`, jamais une
-- exception : retirer une étape d'une chasse archivée doit rester possible,
-- cela ne doit simplement rien émettre.
--
-- CE QU'ELLE NE FAIT PAS, DÉLIBÉRÉMENT : aucun rattrapage rétroactif global.
-- Les joueurs bloqués AVANT cette migration ne seront soldés qu'au prochain
-- retrait d'étape sur leur chasse. Un `select settle_hunt_completions(id) from
-- public.hunts` réglerait leur cas en une ligne, mais il émettrait des codes
-- réels sans qu'aucun commerçant n'ait rien demandé, et consommerait le stock
-- de chasses dont les joueurs sont partis depuis des semaines. La décision
-- appartient au produit, et elle se prend après avoir mesuré la population :
--
--     select h.id, h.name, count(*) as bloques
--       from public.hunt_players p
--       join public.hunts h on h.id = p.hunt_id
--      where not exists (select 1 from public.hunt_completions c
--                         where c.player_id = p.id and c.hunt_id = p.hunt_id)
--        and (select count(*) from public.hunt_scans sc where sc.player_id = p.id)
--            >= (select count(*) from public.hunt_steps s where s.hunt_id = h.id)
--        and exists (select 1 from public.hunt_steps s where s.hunt_id = h.id)
--      group by h.id, h.name;
--
-- En régime sain ce compte est ZÉRO : `record_hunt_scan` solde toujours au
-- moment où `done` atteint `total`. Toute ligne qui en sort est une victime.
--
--
-- ── 2. L'équipe : le rôle d'un collègue était INCHANGEABLE ──
--
-- Il n'existait aucune surface de changement de rôle : ni bouton, ni action,
-- ni policy. `organization_members` n'accorde à `authenticated` que
-- `select` et `delete` (00018:10-11), et ses deux seules policies sont
-- « members: select self » (00001:160) et « members: owner removes
-- collaborators » (00019:48-51), en DELETE. Même en tapant l'API directement,
-- un propriétaire ne pouvait pas modifier un rôle.
--
-- Le contournement que tout le monde tentait — ré-inviter le collègue avec le
-- nouveau rôle — ne fait RIEN : `accept_team_invitation` insère
-- `on conflict (organization_id, user_id) do nothing` (00015:91-93). Les deux
-- écrans annoncent un succès, le rôle reste celui d'avant. Dans les deux sens :
-- la RÉTROGRADATION échoue tout autant, et un éditeur qu'on croyait ramené à la
-- caisse garde `is_org_editor` — donc campagnes, roues et lots.
--
-- `set_team_member_role` ouvre ce chemin, et lui seul :
--   · réservée au `owner` de l'organisation visée (vérifié DANS la fonction,
--     pas par l'appelant) ;
--   · cible bornée à ('editor', 'cashier') — promouvoir quelqu'un `owner` par
--     ce chemin lui donnerait le droit de retirer le propriétaire d'origine,
--     ce qui est une autre décision, avec ses propres garde-fous ;
--   · refuse de dégrader le DERNIER `owner` : sans cette borne, une
--     organisation peut se retrouver sans personne pour l'administrer — plus
--     d'invitation, plus de facturation, plus de réglages, et aucun moyen de
--     revenir en arrière par le produit.
--
-- On ajoute une RPC `security definer` plutôt qu'une policy UPDATE : c'est
-- l'idiome du module (`accept_team_invitation`, `org_team_members` sont déjà
-- ainsi), et une policy UPDATE sur `organization_members` exposerait la colonne
-- `role` à l'API PostgREST, où la borne « jamais le dernier owner » ne peut pas
-- s'écrire.
-- ============================================================

-- ── 1. Chasse au trésor ─────────────────────────────────────

-- Combien de joueurs sont EN COURS sur cette chasse (au moins un tampon, pas
-- encore de complétion) ? Lu par le dashboard avant de supprimer une étape,
-- pour que le refus puisse NOMMER le nombre plutôt qu'avertir en principe.
create or replace function public.hunt_players_in_progress(p_hunt_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_org uuid;
  v_count integer;
begin
  select h.organization_id into v_org
    from public.hunts h where h.id = p_hunt_id;
  if not found then
    return 0;
  end if;
  -- `return 0` et non `raise` : une chasse inconnue rendait déjà 0, lever ici
  -- distinguerait « cet identifiant n'existe pas » de « il existe, chez
  -- quelqu'un d'autre ». C'est la doctrine que `record_hunt_scan` s'impose en
  -- toutes lettres — « pas d'oracle sur l'état interne » (20260724120000:294).
  if not public.is_org_editor(v_org) then
    return 0;
  end if;

  select count(*)::integer into v_count
    from public.hunt_players p
   where p.hunt_id = p_hunt_id
     and exists (
       select 1 from public.hunt_scans sc where sc.player_id = p.id
     )
     and not exists (
       select 1 from public.hunt_completions c
        where c.player_id = p.id and c.hunt_id = p_hunt_id
     );
  return v_count;
end;
$$;

comment on function public.hunt_players_in_progress(uuid) is
  'Joueurs ayant au moins un tampon sur cette chasse et pas encore de complétion. Sert au refus informé de la suppression d''étape.';

-- Pas de `service_role`, même raison que pour settle_hunt_completions plus
-- bas : `is_org_editor` y est structurellement faux.
--
-- ⚠ `revoke … from public, anon` NE SUFFIT PAS À RETIRER service_role, et
-- l'idiome recopié dans tout ce dépôt le laisse donc croire à tort. Supabase
-- pose `alter default privileges in schema public grant all on functions to
-- postgres, anon, authenticated, service_role` : toute fonction créée dans
-- `public` naît avec EXECUTE pour service_role, que la migration le lui
-- accorde ou non. Mesuré, pas déduit : avant ce revoke explicite,
-- `has_function_privilege('service_role', 'public.set_team_member_role(…)')`
-- rendait `true` alors que cette fonction n'a JAMAIS été accordée à
-- service_role. Le retrait doit donc être écrit.
revoke all on function public.hunt_players_in_progress(uuid) from public, anon;
revoke execute on function public.hunt_players_in_progress(uuid) from service_role;
grant execute on function public.hunt_players_in_progress(uuid) to authenticated;

-- Délivre son code à tout joueur devenu complet sans l'avoir su : celui qui
-- avait tamponné toutes les étapes SURVIVANTES au moment où une étape a été
-- retirée. Renvoie le nombre de complétions accordées.
--
-- Aucune complétion n'est inventée : la condition est celle de
-- `record_hunt_scan` (`done >= total`), les quatre gardes de contexte sont les
-- siennes (addon, statut, fenêtre de dates), le verrou est le même
-- (`for update` sur la chasse), le stock est respecté à l'unité près, et la
-- génération de code reprend le même alphabet sans I/O/0/1 avec la même boucle
-- anti-collision. Toute divergence future entre les deux listes de gardes est
-- un défaut : c'est cette parité, et elle seule, qui autorise une fonction à
-- émettre un code sans geste du joueur.
create or replace function public.settle_hunt_completions(p_hunt_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hunt public.hunts%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_total integer;
  v_player record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
  v_awarded integer := 0;
begin
  -- Verrou sur la chasse : fige le stock pendant l'attribution, exactement
  -- comme un scan concurrent le ferait.
  select h.* into v_hunt
    from public.hunts h where h.id = p_hunt_id
   for update;
  if not found then
    return 0;
  end if;
  -- `return 0` et non `raise` : voir hunt_players_in_progress ci-dessus, même
  -- raison — ne pas distinguer « chasse inconnue » de « chasse d'autrui ».
  if not public.is_org_editor(v_hunt.organization_id) then
    return 0;
  end if;

  -- ── LES QUATRE GARDES DE CONTEXTE DE record_hunt_scan ──────
  -- Recopiées de 20260724120000:296-306, dans le même ordre. Sans elles, un
  -- éditeur qui repasse sa chasse en brouillon puis en retire les étapes fait
  -- émettre un code à TOUT joueur ayant un seul tampon, sans plafond — voir
  -- l'en-tête. Un scan y répondrait 'unavailable' ; on rend 0.
  if v_hunt.status <> 'active'
     or (v_hunt.starts_at is not null and v_hunt.starts_at > v_now)
     or (v_hunt.ends_at is not null and v_hunt.ends_at <= v_now)
     or not exists (
       select 1 from public.organizations o
        where o.id = v_hunt.organization_id and o.addon_hunts
     ) then
    return 0;
  end if;

  select count(*)::integer into v_total
    from public.hunt_steps s where s.hunt_id = v_hunt.id;
  -- Chasse sans étape : `done >= total` serait vrai pour un joueur à ZÉRO
  -- tampon. On ne solde rien.
  if v_total < 1 then
    return 0;
  end if;

  for v_player in
    select p.id
      from public.hunt_players p
     where p.hunt_id = v_hunt.id
       and not exists (
         select 1 from public.hunt_completions c
          where c.player_id = p.id and c.hunt_id = v_hunt.id
       )
       and (
         select count(*) from public.hunt_scans sc where sc.player_id = p.id
       ) >= v_total
     -- Le plus ancien d'abord : si le stock ne suffit pas pour tous, il va à
     -- ceux qui ont commencé la chasse en premier.
     order by p.created_at asc, p.id asc
  loop
    if v_hunt.reward_stock is not null
       and v_hunt.reward_claimed_count + v_awarded >= v_hunt.reward_stock then
      exit;
    end if;

    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'CHASSE-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet,
          pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1,
          1);
      end loop;
      begin
        insert into public.hunt_completions
          (hunt_id, organization_id, player_id, code)
        values (v_hunt.id, v_hunt.organization_id, v_player.id, v_code);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'code generation exhausted';
    end if;

    v_awarded := v_awarded + 1;
  end loop;

  if v_awarded > 0 then
    update public.hunts
       set reward_claimed_count = reward_claimed_count + v_awarded
     where id = v_hunt.id;
  end if;

  return v_awarded;
end;
$$;

comment on function public.settle_hunt_completions(uuid) is
  'Accorde sa complétion (code CHASSE-…) à tout joueur devenu complet hors scan — typiquement après le retrait d''une étape. Même condition, mêmes gardes de contexte (addon, statut, fenêtre), même verrou et même borne de stock que record_hunt_scan ; rend 0 dès que l''une d''elles ferme.';

-- Pas de `service_role` : sous ce rôle `auth.uid()` est nul, `is_org_editor`
-- est donc faux et la fonction rendrait toujours 0. Un grant qui ne peut rien
-- exécuter laisse croire à un chemin d'appel qui n'existe pas. Le revoke
-- explicite est obligatoire — voir la note sur les privilèges par défaut
-- au-dessus de hunt_players_in_progress.
revoke all on function public.settle_hunt_completions(uuid) from public, anon;
revoke execute on function public.settle_hunt_completions(uuid) from service_role;
grant execute on function public.settle_hunt_completions(uuid) to authenticated;

-- ── 2. Équipe ───────────────────────────────────────────────

-- Change le rôle d'un collaborateur. Réservée au propriétaire de
-- l'organisation visée. Renvoie l'ancien rôle (l'appelant peut ainsi dire ce
-- qui a changé, et distinguer un no-op d'un vrai changement).
create or replace function public.set_team_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_owners integer;
begin
  -- SÉRIALISATION. `select … for update` plus bas ne verrouille que la ligne
  -- CIBLE ; le `count(*)` des propriétaires qui suit est un select nu. Deux
  -- transactions visant deux owners distincts liraient chacune 2 sous READ
  -- COMMITTED et écriraient toutes les deux : zéro owner, organisation
  -- inadministrable. Le cas est aujourd'hui inatteignable — `create_organization`
  -- est le seul émetteur d'un owner et `organization_members_one_owned_org_idx`
  -- en interdit un second par utilisateur — donc la borne refuse toujours. Elle
  -- deviendrait fausse le jour où un second propriétaire devient possible,
  -- c'est-à-dire précisément le jour où elle sert. Le verrou d'organisation
  -- sérialise les candidats avant même le contrôle d'autorisation.
  perform 1 from public.organizations
   where id = p_organization_id
     for update;

  if not public.is_org_owner(p_organization_id) then
    raise exception 'not authorized';
  end if;
  -- Jamais 'owner' par ce chemin : voir l'en-tête.
  if p_role is null or p_role not in ('editor', 'cashier') then
    raise exception 'invalid role';
  end if;

  select m.role into v_current
    from public.organization_members m
   where m.organization_id = p_organization_id
     and m.user_id = p_user_id
   for update;
  if not found then
    raise exception 'member not found';
  end if;

  if v_current = 'owner' then
    select count(*)::integer into v_owners
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last owner';
    end if;
  end if;

  update public.organization_members
     set role = p_role
   where organization_id = p_organization_id
     and user_id = p_user_id;

  return v_current;
end;
$$;

comment on function public.set_team_member_role(uuid, uuid, text) is
  'Change le rôle d''un membre (editor|cashier). Propriétaire uniquement ; refuse de dégrader le dernier owner, ce qui rendrait l''organisation inadministrable.';

-- Même retrait explicite que pour les deux fonctions de chasse : `is_org_owner`
-- repose sur `auth.uid()`, nul sous service_role, où cette fonction lèverait
-- donc toujours 'not authorized'. Mesuré : sans cette ligne, l'ACL réelle de
-- `set_team_member_role` portait `service_role=X` alors qu'aucun `grant` du
-- dépôt ne le lui a jamais accordé.
revoke all on function public.set_team_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.set_team_member_role(uuid, uuid, text) from service_role;
grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;
