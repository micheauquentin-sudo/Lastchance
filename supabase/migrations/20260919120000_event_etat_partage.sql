-- ════════════════════════════════════════════════════════════════
-- L'état d'une session live se scinde : ce qui est COMMUN, ce qui est À MOI
-- ════════════════════════════════════════════════════════════════
--
-- POURQUOI CETTE MIGRATION EXISTE
--
-- `docs/perf-report.md` §7 (2026-08-07) mesure une salle de 1 000 joueurs en
-- phase de question : 26 req/s à 20 connexions, 15 à 150, et un p50 qui monte à
-- 10,5 secondes. L'offre « La Totale » en vend 1 000, ce qui demande 400 req/s
-- soutenues (2 500 ms de cadence par joueur quand Realtime n'est pas connecté).
-- L'écart est d'un facteur quinze.
--
-- La cause n'est PAS celle qu'on croyait. Un second banc, sur la MÊME session en
-- phase identique mais avec CINQ joueurs, rend 46 req/s : le nombre de joueurs
-- ne divise le débit que par deux. Le reste est le coût de base de l'appel.
--
-- CE QUE CETTE MIGRATION CHANGE, ET CE QU'ELLE NE CHANGE PAS
--
-- `event_public_state` renvoie deux choses de nature différente :
--   · un état COMMUN à toute la salle — session, question, options, répartition
--     des votes, classement des 50 premiers. Identique, à la même seconde, pour
--     mille joueurs ;
--   · un état PERSONNEL — pseudo, score, RANG (un `count` sur tous les joueurs,
--     donc en O(participants) par appel) et le code gagné.
--
-- Mille joueurs faisaient donc recalculer mille fois le même classement. Scindé,
-- l'état commun devient cacheable côté serveur (une seconde suffit : l'écran
-- rafraîchit toutes les 2,5 s) et le personnel reste calculé à chaque appel,
-- parce qu'il n'est cacheable par personne.
--
-- `event_public_state` N'EST PAS SUPPRIMÉE ni modifiée : elle reste le chemin
-- complet, utilisée telle quelle si le repli est nécessaire, et ses tests
-- existants continuent de valoir. Les deux nouvelles fonctions doivent, mises
-- bout à bout, produire exactement la même chose — un test pgTAP le vérifie.
--
-- SÉCURITÉ — LE POINT QUI COMPTE
--
-- `event_etat_partage` NE PREND PAS de jeton joueur et ne peut donc rien rendre
-- de personnel : c'est ce qui rend son résultat partageable entre joueurs sans
-- risque de fuite. La séparation n'est pas une commodité de mise en cache, c'est
-- la garantie qui rend la mise en cache admissible. Ne jamais y ajouter un
-- paramètre d'identité.
-- ════════════════════════════════════════════════════════════════

-- ── État COMMUN : aucun paramètre d'identité, par construction ──────
create or replace function public.event_etat_partage(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_qid uuid;
  v_qtype text;
  v_reveal boolean;
  v_distribution_visible boolean;
  v_question jsonb := null;
  v_correct_option uuid := null;
  v_distribution jsonb := null;
  v_leaderboard jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select s.* into v_session
    from public.event_sessions s
   where s.id = p_session_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_qid := v_session.current_question_id;
  v_reveal := v_session.phase = 'reveal';
  v_distribution_visible :=
    v_session.phase in ('question_locked', 'reveal', 'leaderboard');

  if v_qid is not null
     and v_session.phase in (
       'question_active', 'question_locked', 'reveal', 'leaderboard'
     ) then
    select q.question_type into v_qtype
      from public.event_questions q
     where q.id = v_qid;

    select pg_catalog.jsonb_build_object(
             'id', q.id,
             'question_type', q.question_type,
             'prompt', q.prompt,
             'time_limit_seconds', q.time_limit_seconds,
             'started_at', v_session.current_question_started_at,
             'options', coalesce((
               select pg_catalog.jsonb_agg(
                        pg_catalog.jsonb_build_object(
                          'id', o.id,
                          'label', o.label,
                          'position', o.position
                        )
                        order by o.position
                      )
                 from public.event_question_options o
                where o.question_id = q.id
             ), '[]'::jsonb)
           )
      into v_question
      from public.event_questions q
     where q.id = v_qid;

    -- La bonne réponse ne sort JAMAIS hors reveal — invariant repris à
    -- l'identique de `event_public_state` : le scinder ne l'assouplit pas.
    if v_reveal then
      if v_qtype = 'quiz' then
        select o.id into v_correct_option
          from public.event_question_options o
         where o.question_id = v_qid
           and o.is_correct
         order by o.position
         limit 1;
      elsif v_qtype = 'prono' then
        v_correct_option := v_session.prono_correct_option_id;
      end if;
    end if;

    if v_distribution_visible then
      select coalesce(
               pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'option_id', o.id,
                   'label', o.label,
                   'position', o.position,
                   'votes', coalesce(c.votes, 0)
                 )
                 order by o.position
               ),
               '[]'::jsonb
             )
        into v_distribution
        from public.event_question_options o
        left join (
          select a.option_id, pg_catalog.count(*) as votes
            from public.event_answers a
            join public.event_players p
              on p.id = a.player_id
             and p.session_id = a.session_id
           where a.session_id = p_session_id
             and a.question_id = v_qid
             and p.moderation_state = 'active'
           group by a.option_id
        ) c on c.option_id = o.id
       where o.question_id = v_qid;
    end if;
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'pseudo', t.pseudo,
               'avatar', t.avatar,
               'score', t.score,
               'rank', t.rank
             )
             order by t.rank
           ),
           '[]'::jsonb
         )
    into v_leaderboard
    from (
      select
        p.pseudo,
        p.avatar,
        p.score,
        pg_catalog.row_number() over (
          order by p.score desc, p.joined_at asc, p.id asc
        ) as rank
        from public.event_players p
       where p.session_id = p_session_id
         and p.moderation_state = 'active'
       order by p.score desc, p.joined_at asc, p.id asc
       limit 50
    ) t;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id,
      'state_revision', v_session.state_revision,
      'status', v_session.status,
      'phase', v_session.phase,
      'join_code', v_session.join_code,
      'reward_label', v_session.reward_label,
      'reward_stock', v_session.reward_stock,
      'reward_claimed_count', v_session.reward_claimed_count,
      'max_participants', v_session.max_participants
    ),
    'question', v_question,
    'correct_option_id', v_correct_option,
    'distribution', v_distribution,
    'leaderboard', v_leaderboard
  );
end;
$$;

revoke all on function public.event_etat_partage(uuid)
  from public, anon, authenticated;
grant execute on function public.event_etat_partage(uuid) to service_role;

comment on function public.event_etat_partage(uuid) is
  'État COMMUN d''une session live (session, question, répartition, top 50). Ne prend AUCUN jeton joueur : c''est ce qui rend son résultat partageable entre joueurs, donc cacheable côté serveur. Ne jamais y ajouter un paramètre d''identité.';

-- ── État PERSONNEL : le seul morceau qui dépend du joueur ───────────
create or replace function public.event_etat_joueur(
  p_session_id uuid,
  p_player_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_your jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- Jeton absent ou mal formé : aucune vue personnelle, sans lever — c'est le
  -- cas du spectateur qui n'a pas rejoint, et il est légitime.
  if p_player_token_hash is null
     or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select pg_catalog.jsonb_build_object(
           'pseudo', mp.pseudo,
           'avatar', mp.avatar,
           'score', mp.score,
           'rank', 1 + (
             select pg_catalog.count(*)
               from public.event_players x
              where x.session_id = p_session_id
                and x.moderation_state = 'active'
                and (
                  x.score > mp.score
                  or (
                    x.score = mp.score
                    and x.joined_at < mp.joined_at
                  )
                  or (
                    x.score = mp.score
                    and x.joined_at = mp.joined_at
                    and x.id < mp.id
                  )
                )
           ),
           'win', (
             select pg_catalog.jsonb_build_object(
                      'rank', w.rank,
                      'code', w.code
                    )
               from public.event_wins w
              where w.session_id = p_session_id
                and w.winner_token_hash = p_player_token_hash
              limit 1
           )
         )
    into v_your
    from public.event_players mp
   where mp.session_id = p_session_id
     and mp.token_hash = p_player_token_hash
     and mp.moderation_state = 'active';

  return v_your;
end;
$$;

revoke all on function public.event_etat_joueur(uuid, text)
  from public, anon, authenticated;
grant execute on function public.event_etat_joueur(uuid, text) to service_role;

comment on function public.event_etat_joueur(uuid, text) is
  'État PERSONNEL d''un joueur dans une session live (pseudo, score, rang, code gagné). Jamais cacheable : le rang est un count sur tous les joueurs de la session.';
