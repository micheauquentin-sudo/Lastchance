-- ============================================================
-- LA SOIRÉE LIVE TIENT SA PROMESSE (wagon 5)
--
-- Trois constats, un seul fichier — et c'est délibéré : les deux premiers
-- DÉCOUPENT `event_public_state` et le troisième RÈGLE la jauge que cette
-- même Soirée vend. Trois migrations concurrentes se seraient croisées sur
-- des fonctions voisines, la dernière appliquée gagnant sans bruit.
--
--   JOU-4. LE JOUEUR N'A AUCUNE HORLOGE COMMUNE. `event_public_state` rend
--          `question.started_at` — un instant SERVEUR — que le client compare
--          à SON horloge pour dessiner le compte à rebours. Une tablette de
--          bar en retard de quarante secondes affichait un chrono déjà fini
--          sur une question encore ouverte, et l'inverse. Le quiz avait
--          tranché la question depuis longtemps, en SQL, à deux endroits
--          (20260803120000_quizzes.sql:1315 et :1895) : il émet
--          `server_now = pg_catalog.now()` avec la charge, et le client
--          calcule un DÉLAI au lieu de comparer deux dates. La Soirée reprend
--          ce modèle, sans en inventer un second.
--
--   EVT-2. TROIS ALLERS-RETOURS POUR UN SEUL ÉTAT. Le parcours public lisait
--          la session, puis l'organisation (garde de module), puis appelait
--          `event_public_state` — trois voyages, à chaque tour de sondage,
--          sur un chemin ouvert à Internet. La garde vit dans
--          `loadEventActionContext` (src/lib/event-context.ts:349-372) et
--          vérifie exactement trois choses : la session existe, son
--          organisation ouvre le module `events`, son statut n'est ni `draft`
--          ni `archived`. Ces trois conditions descendent ici, DANS la RPC,
--          pour que la fusion ne perde aucune garde en chemin.
--
--          Le miroir TypeScript de la garde de module est
--          `moduleOuvertAuJoueur` (src/lib/module-acces-public.ts:68), dont
--          la parité avec `org_has_module_access` est déjà éprouvée par
--          `module-access-parity.test.ts` : appeler la garde SQL ici n'ouvre
--          donc aucune divergence nouvelle, elle referme celle qui existait.
--
--   ── POURQUOI DEUX FONCTIONS ET NON UNE ──
--
--   Le découpage n'est pas cosmétique, il est dicté par ce que la RPC mère
--   fait déjà : sur les sept clés qu'elle rend, SIX sont identiques pour tous
--   les joueurs d'une session (`session`, `question`, `correct_option_id`,
--   `distribution`, `leaderboard`) et UNE SEULE dépend du jeton
--   (`you`, :847-887 de 20260805190000). Tant qu'un seul appel rend les deux,
--   cinquante joueurs qui sondent la même session font recalculer cinquante
--   fois un classement identique et interdisent toute mise en cache.
--
--   `event_etat_partage` est donc cachable par session ; `event_etat_joueur`
--   ne l'est pas, mais ne coûte qu'une ligne indexée. Leur concaténation
--   jsonb reproduit `event_public_state` CHAMP À CHAMP — c'est une promesse,
--   et `supabase/tests/soiree_live.test.sql` la vérifie clé par clé, avec et
--   sans jeton.
--
--   ── CE QUI N'EST PAS TOUCHÉ, ET POURQUOI ──
--
--   `event_public_state` reste INTACTE. Le rendu serveur initial l'appelle
--   encore et les appelants migreront un par un ; la supprimer ou la
--   réécrire ici aurait fait dépendre ce wagon d'un chantier applicatif qui
--   n'est pas le sien. Elle reste la référence CONTRE laquelle l'équivalence
--   est prouvée — l'effacer, c'est perdre le témoin.
--
--   `event_etat_joueur` ne porte PAS la garde de contexte fusionnée, à
--   dessein : elle n'est jamais appelée seule (le parcours lit toujours la
--   part partagée, qui refuse la première), elle est `service_role` comme sa
--   sœur, et elle exige un `token_hash` de 64 hexadécimaux que seul le
--   porteur du cookie de CE joueur permet de calculer. Lui faire relire la
--   session et l'organisation aurait rendu à deux voyages la fusion qu'on
--   vient de faire descendre à un.
--
--   VEN-1. LA JAUGE VENDUE REDESCEND À 500. `event_participant_capacity`
--          (20260925120000_droits_stripe.sql:746-790) promettait 1000 places
--          au plan `full`. Rien ne l'a jamais éprouvé : la règle du catalogue
--          dit « Ne pas vendre de jauge supérieure avant un benchmark de
--          capacité live concluant » (src/lib/plans.ts:585) et ce banc n'a
--          pas eu lieu. Vendre une capacité non mesurée, c'est promettre un
--          soir d'événement ce qu'on n'a pas prouvé pouvoir tenir.
--
--          `comp_access` RESTE à 1000 : un accès OFFERT par le propriétaire
--          n'est pas une vente. Personne ne s'est vu promettre quoi que ce
--          soit contre paiement, et c'est précisément la population sur
--          laquelle le banc de capacité se fera. La distinction est la raison
--          d'être de cette branche.
--
--          Le `check (max_participants in (10,30,50,100,500,1000))` NE CHANGE
--          PAS : des sessions historiques portent 1000, et un accès offert en
--          crée encore.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- EVT-2 + JOU-4 — LA PART PARTAGÉE PAR TOUS LES JOUEURS
-- ════════════════════════════════════════════════════════════

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

  -- ── LA GARDE DE CONTEXTE, DESCENDUE DE loadEventActionContext ──
  --
  -- Même réponse pour les trois refus, et c'est voulu : « inexistante »,
  -- « pas encore publiée » et « module coupé » ne doivent pas se distinguer
  -- vues d'Internet, sans quoi l'énumération des sessions devient un oracle
  -- sur ce que le commerçant prépare. C'est déjà le contrat de la RPC mère
  -- pour la session introuvable ; on l'étend, on ne l'invente pas.
  if v_session.status in ('draft', 'archived') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not public.org_has_module_access(v_session.organization_id, 'events') then
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
    'leaderboard', v_leaderboard,
    -- JOU-4 : l'horloge SERVEUR voyage avec l'état. Le client soustrait
    -- `server_now - question.started_at` et obtient un délai écoulé JUSTE quel
    -- que soit le réglage de sa propre horloge. Absente de la RPC mère, cette
    -- clé est la seule différence entre `event_etat_partage || event_etat_joueur`
    -- et `event_public_state` — le test d'équivalence l'exclut nommément.
    'server_now', pg_catalog.now()
  );
end;
$$;

comment on function public.event_etat_partage(uuid) is
  'Part de l''état live PARTAGÉE par tous les joueurs d''une session : '
  'session, question, correct_option_id (au reveal seulement), distribution, '
  'leaderboard — plus server_now, l''horloge serveur qui rend le compte à '
  'rebours juste sur un appareil déréglé (modèle du quiz, 20260803120000). '
  'Porte la garde de contexte que loadEventActionContext appliquait en '
  'TypeScript au prix de deux requêtes de plus : session inexistante, statut '
  'draft/archived, ou module « events » fermé rendent tous '
  '{"state":"unavailable"} — un refus indistinct, pour ne pas faire de '
  'l''état de préparation d''un commerçant un oracle public. Concaténée à '
  'event_etat_joueur, elle reproduit event_public_state champ à champ '
  '(éprouvé par soiree_live.test.sql).';

revoke all on function public.event_etat_partage(uuid)
  from public, anon, authenticated;
grant execute on function public.event_etat_partage(uuid)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- EVT-2 — LA PART PROPRE À UN JOUEUR
-- ════════════════════════════════════════════════════════════

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

  -- Corps VERBATIM du bloc `you` de event_public_state (20260805190000:847-887),
  -- garde de format du hash comprise : un jeton mal formé ne doit pas atteindre
  -- l'index, et un joueur modéré reste invisible à lui-même comme aux autres.
  if p_player_token_hash is not null
     and p_player_token_hash ~ '^[0-9a-f]{64}$' then
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
  end if;

  -- TOUJOURS un objet, jamais un jsonb `null` nu : `||` sur un scalaire jsonb
  -- ne concatène pas, il produit un TABLEAU. Rendre {"you": null} est ce qui
  -- fait de la concaténation une opération sûre quel que soit le joueur —
  -- inconnu, modéré, ou jeton absent.
  return pg_catalog.jsonb_build_object('you', v_your);
end;
$$;

comment on function public.event_etat_joueur(uuid, text) is
  'Part de l''état live PROPRE à un joueur : son pseudo, son avatar, son '
  'score, son rang et son éventuel gain — le bloc « you » de '
  'event_public_state, à l''identique. Rend toujours un objet ({"you": null} '
  'si le jeton est absent, mal formé, inconnu ou modéré) pour que '
  'event_etat_partage || event_etat_joueur reste défini en toutes '
  'circonstances. Ne reporte PAS la garde de contexte de sa sœur : elle n''est '
  'jamais appelée seule, elle est service_role, et elle exige les 64 '
  'hexadécimaux du jeton de CE joueur — la relire coûterait le voyage que la '
  'fusion vient de supprimer.';

revoke all on function public.event_etat_joueur(uuid, text)
  from public, anon, authenticated;
grant execute on function public.event_etat_joueur(uuid, text)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- VEN-1 — LA JAUGE VENDUE REDESCEND À CE QUI EST PROUVÉ
-- ════════════════════════════════════════════════════════════
--
-- Seule la ligne `o.plan = 'full'` change (1000 → 500). Tout le reste du
-- corps est celui de 20260925120000 : la condition d'entrée
-- `org_has_subscription_access`, la branche octroi en `max`, le plancher
-- technique à 10. Les recopier plutôt que d'écrire un `alter` est la seule
-- forme possible — `create or replace function` remplace le corps entier.

create or replace function public.event_participant_capacity(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- `greatest` / `least` / `nullif` sont des CONSTRUCTIONS DU PARSEUR et non
  -- des fonctions de pg_catalog : les qualifier lève à l'exécution, jamais à
  -- l'application de la migration. Elles ignorent le search_path, donc `set
  -- search_path = ''` ne les met pas en danger.
  select greatest(
    -- BRANCHE OFFRE — le corps de 20260925120000, sa jauge `full` révisée.
    case
      when not public.org_has_subscription_access(o.id) then 0
      -- ACCÈS OFFERT : 1000, et il reste seul à ce niveau. Rien n'a été vendu
      -- contre paiement, donc rien n'a été promis ; c'est au contraire la
      -- population sur laquelle le banc de capacité se fera.
      when o.comp_access
       and (o.comp_access_until is null or o.comp_access_until > pg_catalog.now())
        then 1000
      -- VEN-1 : 500 et non 1000. La règle du catalogue interdit de vendre une
      -- jauge supérieure avant un banc de capacité live concluant
      -- (src/lib/plans.ts:585) ; ce banc n'a pas eu lieu. `full` rejoint donc
      -- `live` au plus haut palier PROUVÉ, et n'y perd rien d'éprouvé.
      when o.plan = 'full' then 500
      when o.plan = 'live' then 500
      else 100
    end,
    -- BRANCHE OCTROI — la jauge gelée à l'achat du pass. `max` et non `sum` :
    -- deux passes ne s'additionnent pas, c'est le plus généreux qui vaut, comme
    -- partout ailleurs dans org_module_grant_state.
    coalesce((
      select pg_catalog.max(g.capacity)
        from public.organization_module_grants g
       where g.organization_id = o.id
         and g.module = 'events'
         and g.capacity is not null
         and g.revoked_at is null
         and g.starts_at is not null
         and g.starts_at <= pg_catalog.now()
         and (g.ends_at is null or g.ends_at > pg_catalog.now())
    ), 0),
    -- PLANCHER TECHNIQUE. Voir 20260925120000 : 0 ferait échouer l'insertion
    -- d'une session sur event_sessions_max_participants_check.
    10
  )
  from public.organizations o
  where o.id = p_organization_id
$$;

comment on function public.event_participant_capacity(uuid) is
  'Jauge de participants d''une Soirée en jeu : le PLUS GÉNÉREUX entre '
  'l''offre (accès offert 1000, plan full 500, live 500, autre abonnement '
  '100, aucune offre 0) et la jauge gelée sur les octrois « events » VIVANTS. '
  'Depuis 20260929120000, `full` rend 500 et non plus 1000 : la règle du '
  'catalogue (src/lib/plans.ts:585) interdit de vendre une jauge supérieure '
  'avant un banc de capacité live concluant, et ce banc n''a pas eu lieu — '
  '500 est le plus haut palier PROUVÉ. L''accès offert reste à 1000 parce '
  'qu''il n''est pas une vente : rien n''y est promis contre paiement. La '
  'branche offre est conditionnée à org_has_subscription_access, sans quoi un '
  'pass de 30 places en aurait rendu 100. Plancher à 10 (le plus petit palier '
  'vendu) parce que max_participants est not null sous un check : rendre 0 '
  'ferait échouer la création de session sur une contrainte au lieu de la '
  'refuser sur le droit. Une organisation inconnue rend null, comme avant ; '
  'les appelants coalescent.';

revoke all on function public.event_participant_capacity(uuid)
  from public, anon, authenticated;
grant execute on function public.event_participant_capacity(uuid)
  to service_role;
