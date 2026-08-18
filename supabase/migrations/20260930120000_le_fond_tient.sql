-- ============================================================
-- LastChance — Wagon 7 : le fond tient
-- ============================================================
-- Trois corrections indépendantes. Aucune ne crée de table, aucune ne
-- change une signature de fonction : les types générés ne bougent pas.
--
--   1. JOB-3 (a) — la RPC des destinataires newsletter rend enfin ses
--      lignes dans un ordre DÉTERMINÉ ;
--   2. SEC-4 — le filet de privilèges par défaut, qui n'existait que
--      pour `anon`, devient symétrique pour `authenticated` ;
--   3. la période déclarée de `jackpot-draws`, semée fausse.
--
-- Ce qui n'est PAS ici, délibérément : l'allumage d'un worker
-- (`ops_worker_definitions.enabled`). C'est un geste d'EXPLOITATION du
-- propriétaire, pas une migration — doctrine écrite dans
-- `docs/observability.md`. Cette migration corrige une VALEUR fausse,
-- elle ne branche ni ne débranche aucune supervision.
-- ============================================================

-- ============================================================
-- 1. JOB-3 (a) — sans ordre, la pagination tronque au hasard
-- ============================================================
-- `org_segment_emails` n'avait NI `order by` NI pagination. Sans ordre
-- déterministe, deux exécutions de la même requête peuvent rendre les
-- mêmes lignes dans deux ordres différents — Postgres ne promet rien
-- d'autre. Deux conséquences, toutes deux silencieuses :
--
--   · l'appelant borne le lot à 1 000 destinataires (`slice(0, 1000)`
--     dans `src/lib/newsletter-worker.ts`) : il coupe donc dans un
--     sous-ensemble ALÉATOIRE du segment, et non dans sa tête ;
--   · une reprise après coupure ne revoit pas les mêmes lignes : des
--     abonnés peuvent être servis deux fois, d'autres jamais.
--
-- `s.id` est un uuid : l'ordre n'a aucun sens métier, et c'est très
-- bien ainsi. Ce qu'on exige d'un curseur, ce n'est pas qu'il soit
-- pertinent, c'est qu'il soit STABLE entre deux passages.
--
-- Corps repris à l'identique de 20260722100000 (la définition vivante ;
-- celle de 00017 est morte depuis que la garde s'est élargie au service
-- role). Seuls changent : l'`order by` final et le `search_path`, figé à
-- la chaîne vide par 20260812120000 — un `create or replace` qui
-- l'omettrait le remettrait au défaut et ferait rougir
-- `search_path_invariant.test.sql`. Tous les objets du corps sont donc
-- qualifiés.
--
-- `create or replace` CONSERVE les privilèges de la fonction : le
-- `grant execute … to authenticated` de 00019 et le `revoke … from
-- public, anon` de 00013 restent en place, et ne sont pas rejoués ici.
create or replace function public.org_segment_emails(
  p_organization_id uuid, p_segment text,
  p_loyal_wins int default 3, p_inactive_days int default 60
)
returns table (subscriber_id uuid, email text)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  return query
  select s.id, s.email from public.newsletter_subscribers s
  left join lateral (
    select count(*) as wins, max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = s.organization_id and p.email = s.email
  ) agg on true
  where s.organization_id = p_organization_id and s.unsubscribed_at is null
    and case p_segment
      when 'all' then true
      when 'loyal' then coalesce(agg.wins, 0) >= greatest(1, p_loyal_wins)
      when 'new' then coalesce(agg.wins, 0) = 1
      when 'inactive' then agg.last_win is not null and agg.last_win < now() - make_interval(days => greatest(1, p_inactive_days))
      else false
    end
  order by s.id;
end;
$$;

comment on function public.org_segment_emails(uuid, text, int, int) is
  'Destinataires d''un segment newsletter. ORDRE DÉTERMINISTE (order by s.id) : la fonction est paginée par l''appelant, et une borne appliquée à un ensemble non ordonné coupe dans un sous-ensemble aléatoire au lieu de sa tête — deux passages n''y voient alors pas les mêmes lignes. L''uuid n''a aucun sens métier ; ce qu''on exige d''un curseur est qu''il soit stable, pas qu''il soit pertinent. Propriétaire de l''organisation ou service role.';

-- ============================================================
-- 2. SEC-4 — le filet par défaut devient symétrique
-- ============================================================
-- 00021 a posé, pour `anon`, la règle « rien par défaut » : toute table
-- créée ensuite doit gagner ses privilèges EXPLICITEMENT. `authenticated`
-- n'avait jamais reçu la même chose. Une future table oubliée serait donc
-- lisible par n'importe quel compte connecté, de n'importe quel
-- locataire, dès qu'une policy permissive existerait — ou même sans
-- policy si `enable row level security` manquait aussi.
--
-- ── PORTÉE EXACTE, pour que personne ne s'y trompe ──
--
-- `alter default privileges` ne touche AUCUN objet existant : il décide
-- de ce que recevront les tables créées APRÈS. Les tables d'aujourd'hui
-- gardent leurs grants explicites, et le parcours commerçant est
-- inchangé. C'est une garde pour les migrations à venir, pas une
-- correction de l'existant.
--
-- Ce filet ne couvre que les objets créés par `postgres` — le rôle sous
-- lequel tournent les migrations. Les privilèges par défaut posés par
-- `supabase_admin` restent hors d'atteinte d'un `alter default
-- privileges for role postgres`, exactement comme pour `anon` depuis
-- 00021 : la garde est réelle pour tout ce que ce dépôt écrit, elle
-- n'est pas universelle. Un objet créé hors migration reste à couvrir à
-- la main.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from authenticated;

-- ── Les sept tables qui ne tenaient que par « RLS + zéro policy » ──
--
-- Fermeture par défense en profondeur, pas par correction d'une fuite :
-- ces sept tables ont bien RLS active et aucune policy pour
-- `authenticated`, donc aucune ligne ne sort aujourd'hui. Mais leur
-- fermeture repose ENTIÈREMENT sur cette absence de policy : la première
-- policy écrite un peu large les ouvrirait, sans qu'aucun `grant` n'ait
-- eu à être ajouté. Un privilège retiré est une garde qui ne dépend de
-- personne.
--
-- Vérifié dans le catalogue avant d'écrire ces lignes : `authenticated`
-- n'a sur aucune des sept ni SELECT, ni INSERT, ni UPDATE, ni DELETE.
-- Ce que le `revoke all` retire réellement, c'est REFERENCES, TRIGGER et
-- TRUNCATE, hérités des privilèges par défaut de Supabase — TRUNCATE sur
-- le journal des événements Stripe ou sur les sessions d'administration
-- n'est pas un privilège théorique.
revoke all on table public.stripe_events from authenticated;
revoke all on table public.rate_limits from authenticated;
revoke all on table public.admin_users from authenticated;
revoke all on table public.admin_sessions from authenticated;
revoke all on table public.admin_audit_logs from authenticated;
revoke all on table public.admin_notes from authenticated;
revoke all on table public.webhook_deliveries from authenticated;

-- ============================================================
-- 3. `jackpot-draws` : la période reste quotidienne — volontairement
-- ============================================================
-- Ce wagon a d'abord voulu passer ce worker à 300 s / 900 s, au motif
-- qu'un pg_cron le déclenche toutes les 5 minutes
-- (`lastchance-jackpot-date-draws`). La revue sécurité a montré que la
-- prémisse confond le TRAVAIL et le BATTEMENT DE CŒUR : le pg_cron
-- exécute `run_jackpot_date_draws()` directement en SQL et n'écrit
-- AUCUNE ligne dans `ops_worker_runs` ; le seul heartbeat de ce worker
-- vient de la route HTTP `/api/cron/jackpot-draws`, planifiée UNE fois
-- par jour (vercel.json, 45 4 * * *). Une période de 300 s aurait rendu
-- le capteur rouge ~23 h 45 sur 24 dès l'application — un voyant
-- toujours allumé est un voyant qu'on cesse de lire, l'exact défaut que
-- ce wagon ferme ailleurs.
--
-- 86 400 / 108 000 reste donc la cadence VRAIE de ce que le capteur
-- mesure. Superviser le chemin pg_cron 5 minutes demanderait que
-- `run_jackpot_date_draws()` écrive son propre heartbeat — un chantier
-- à part entière, consigné dans docs/bugs.md, pas un update glissé ici.
