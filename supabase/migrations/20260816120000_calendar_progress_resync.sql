-- ============================================================
-- Lastchance — le compteur d'ouvertures survivait aux cases supprimées
-- ============================================================
--
-- Cette migration ajoute UNE fonction et n'en redéfinit aucune :
--
--     grep -l "function public.resync_calendar_progress" supabase/migrations/*.sql
--
-- doit rendre CE fichier, et lui seul.
--
--
-- ── LE DÉFAUT ────────────────────────────────────────────────
--
-- `calendar_players.opened_count` est un compteur STOCKÉ, incrémenté case par
-- case par `open_calendar_box` (20260728120000:706-709). Les ouvertures réelles
-- vivent dans `calendar_openings`, dont la clé étrangère vers `calendar_days`
-- est en `on delete cascade` (:265-266).
--
-- Réduire la grille de 24 cases à 15 supprime les cases 16 à 24 et, par
-- cascade, les ouvertures correspondantes. LE COMPTEUR, LUI, NE BOUGE PAS. Il
-- cesse alors de décrire quoi que ce soit, et la divergence part dans les DEUX
-- sens :
--
--   · un joueur qui n'avait ouvert QUE les cases 16 à 20 garde
--     `opened_count = 5` pour zéro ouverture survivante. Dix cases lui
--     suffiront pour en valoir quinze : il décroche la récompense d'assiduité
--     SANS AVOIR ÉTÉ ASSIDU, et consomme le stock fini d'un autre ;
--
--   · un joueur qui avait ouvert les cases 1 à 20 est, après réduction,
--     complet pour de bon — 15 ouvertures survivantes sur 15 cases. Mais la
--     complétion n'est calculée QUE pendant une ouverture
--     (`v_new_opened >= v_cal.day_count`, :714) et il ne lui reste AUCUNE case
--     à ouvrir. Il ne recevra jamais son cadeau : c'est le jumeau exact de la
--     carte de victoire vide de la chasse au trésor.
--
-- Même forme que le défaut soldé par `20260815120000` : un état dérivé calculé
-- au seul moment du geste du joueur, alors que le commerçant peut changer le
-- dénominateur entre deux gestes.
--
--
-- ── CE QU'ELLE FAIT, ET DANS QUEL ORDRE ──────────────────────
--
-- 1. Elle RECOMPTE `opened_count` depuis `calendar_openings`, qui est la
--    vérité. Ce recomptage n'accorde rien : il répare une valeur devenue
--    fausse. Il court donc DANS TOUS LES CONTEXTES, y compris sur un
--    calendrier archivé — laisser un compteur mensonger sur un calendrier
--    clos serait garder le défaut pour la moitié des cas.
--
-- 2. Elle SOLDE les complétions devenues acquises. Là, on émet un code de
--    retrait réel, et la parité avec `open_calendar_box` doit être stricte :
--    les DEUX gardes de contexte de cette fonction sont donc reprises —
--    `o.addon_calendar` (join, :585-590) et `status = 'active'` (:591).
--
-- ── LA PREMIÈRE VERSION DE CE FICHIER N'AVAIT NI L'UNE NI L'AUTRE ──
-- Elle a été écrite en copiant la forme de `settle_hunt_completions` AVANT
-- qu'on découvre que celle-ci était elle-même incomplète (rapport E1). Les
-- deux fonctions ont donc été comparées ligne à ligne à leur homologue joueur
-- avant d'écrire celle-ci. `calendars` n'a PAS de `starts_at`/`ends_at` — la
-- fenêtre du module est par case (`unlock_at`) et ne concerne pas la
-- complétion — d'où deux gardes ici contre quatre pour la chasse.
--
-- CE QU'ELLE NE FAIT JAMAIS : retirer un cadeau déjà émis. Un joueur dont le
-- compteur redescend sous `day_count` alors qu'il avait déjà été récompensé
-- garde son code — il l'a peut-être présenté en caisse, et le lui reprendre
-- ferait exactement le tort que ce chantier répare partout ailleurs.
--
-- ── POURQUOI LE PLAFOND TIENT ICI ───────────────────────────
-- Réduire la grille à UNE case rend « complet » quiconque a ouvert une seule
-- case — structurellement le même levier que la chasse ramenée à une étape.
-- La différence est que `completion_reward_stock` est `integer NOT NULL
-- check (>= 0)` (ADR-031) : il n'existe pas de valeur « illimité », là où
-- `hunts.reward_stock` admet `null`. L'émission est donc bornée par
-- construction, et c'est aussi ce que la prochaine ouverture aurait fait.
-- ============================================================

create or replace function public.resync_calendar_progress(p_calendar_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cal public.calendars%rowtype;
  v_player record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
  v_awarded integer := 0;
begin
  -- Verrou sur le calendrier : fige le stock d'assiduité pendant le solde,
  -- exactement comme une ouverture concurrente le ferait.
  select c.* into v_cal
    from public.calendars c where c.id = p_calendar_id
   for update;
  if not found then
    return 0;
  end if;
  -- `return 0` et non `raise` : lever ici distinguerait « ce calendrier
  -- n'existe pas » de « il existe, chez quelqu'un d'autre ». Même doctrine que
  -- 20260815120000 et que `open_calendar_box`, qui répond 'unavailable' sans
  -- jamais dire pourquoi. Rien n'est écrit avant ce point.
  if not public.is_org_editor(v_cal.organization_id) then
    return 0;
  end if;

  -- ── 1. RÉPARATION — n'accorde rien, court toujours ─────────
  -- Le compteur redevient ce qu'il prétend décrire : les ouvertures qui
  -- EXISTENT. Un joueur ne peut appartenir qu'à un calendrier
  -- (`unique (calendar_id, token_hash)`), donc toutes ses ouvertures sont
  -- celles-ci.
  update public.calendar_players p
     set opened_count = (
       select pg_catalog.count(*)
         from public.calendar_openings o
        where o.player_id = p.id
     )
   where p.calendar_id = v_cal.id;

  -- ── 2. ÉMISSION — parité stricte avec open_calendar_box ────
  -- Les deux gardes de contexte de la fonction joueur. Sans elles, un éditeur
  -- solderait des cadeaux sur un calendrier clos, ou sur un module que son
  -- organisation ne paie plus.
  if v_cal.status <> 'active'
     or not exists (
       select 1 from public.organizations o
        where o.id = v_cal.organization_id and o.addon_calendar
     ) then
    return 0;
  end if;

  -- `day_count between 1 and 60` par contrainte de table : cette borne ne peut
  -- pas mordre aujourd'hui. On la pose quand même — une contrainte s'assouplit,
  -- et sans elle `opened_count >= 0` serait vrai pour un joueur qui n'a rien
  -- ouvert, ce qui vaudrait un cadeau par identité fabriquée.
  if v_cal.day_count < 1 then
    return 0;
  end if;

  for v_player in
    select p.id
      from public.calendar_players p
     where p.calendar_id = v_cal.id
       and not p.completion_rewarded
       and p.opened_count >= v_cal.day_count
     -- Le plus ancien d'abord : si le stock ne suffit pas pour tous, il va à
     -- ceux qui ont commencé le calendrier en premier.
     order by p.created_at asc, p.id asc
  loop
    if v_cal.completion_reward_claimed_count + v_awarded
         >= v_cal.completion_reward_stock then
      exit;
    end if;

    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'CADEAU-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet,
          pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1,
          1);
      end loop;
      begin
        insert into public.calendar_rewards
          (player_id, calendar_id, organization_id, code)
        values (v_player.id, v_cal.id, v_cal.organization_id, v_code);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'calendar completion code generation exhausted';
    end if;

    update public.calendar_players
       set completion_rewarded = true
     where id = v_player.id;
    v_awarded := v_awarded + 1;
  end loop;

  if v_awarded > 0 then
    update public.calendars
       set completion_reward_claimed_count
             = completion_reward_claimed_count + v_awarded
     where id = v_cal.id;
  end if;

  return v_awarded;
end;
$$;

comment on function public.resync_calendar_progress(uuid) is
  'Recompte calendar_players.opened_count depuis calendar_openings (la vérité) après une réduction de grille, puis solde les récompenses d''assiduité devenues acquises — mêmes gardes de contexte, même verrou et même borne de stock que open_calendar_box. Le recomptage court toujours ; l''émission non. Ne retire jamais un cadeau déjà émis.';

-- `authenticated` seulement. La fonction est appelée depuis une server action
-- avec le client de l'UTILISATEUR — c'est ce qui donne un `auth.uid()` à
-- `is_org_editor`. Pas de `service_role` : sous ce rôle `auth.uid()` est nul,
-- la garde est structurellement fausse et la fonction rendrait toujours 0 ; le
-- grant laisserait croire à un chemin d'appel qui n'existe pas (même retrait
-- que sur settle_hunt_completions, 20260815120000).
--
-- ⚠ Le revoke sur `service_role` doit être ÉCRIT : `revoke … from public,
-- anon` ne le retire pas. Supabase pose `alter default privileges in schema
-- public grant all on functions to postgres, anon, authenticated,
-- service_role`, donc toute fonction née dans `public` porte EXECUTE pour
-- service_role sans que personne ne le lui accorde. Voir la note détaillée
-- dans 20260815120000.
revoke all on function public.resync_calendar_progress(uuid) from public, anon;
revoke execute on function public.resync_calendar_progress(uuid) from service_role;
grant execute on function public.resync_calendar_progress(uuid) to authenticated;
