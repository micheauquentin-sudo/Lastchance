-- ============================================================
-- File de travaux générique — comportement réel de claim_jobs /
-- requeue_stale_jobs sur base migrée vierge (fixtures locales).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── Fixtures : 4 jobs aux états choisis ──────────────────────
insert into public.jobs (id, type, payload, status, run_after, attempts, max_attempts)
values
  -- Dû maintenant : réclamable.
  ('d0000000-0000-4000-8000-000000000001', 'newsletter.send', '{"campaignId":"x"}', 'queued', now() - interval '1 minute', 0, 5),
  -- Planifié plus tard : intouchable aujourd'hui.
  ('d0000000-0000-4000-8000-000000000002', 'newsletter.send', '{}', 'queued', now() + interval '1 hour', 0, 5),
  -- Autre type : ignoré par un claim ciblé.
  ('d0000000-0000-4000-8000-000000000003', 'reengage.org', '{"organizationId":"y"}', 'queued', now() - interval '1 minute', 0, 5),
  -- Zombie : running avec verrou expiré (worker mort en route).
  ('d0000000-0000-4000-8000-000000000004', 'newsletter.send', '{}', 'running', now() - interval '10 minutes', 1, 5);

update public.jobs
   set locked_until = now() - interval '5 minutes'
 where id = 'd0000000-0000-4000-8000-000000000004';

-- ── Claim : seulement le dû, du bon type, attempts++ ─────────
select results_eq(
  $$select id, attempts, status::text
      from public.claim_jobs(array['newsletter.send'], 10, 120)$$,
  $$values ('d0000000-0000-4000-8000-000000000001'::uuid, 1, 'running')$$,
  'claim : uniquement le job dû du type demandé, passé running avec attempts+1'
);
select is(
  (select locked_until is not null from public.jobs
    where id = 'd0000000-0000-4000-8000-000000000001'),
  true, 'le job réclamé porte un verrou'
);
select is(
  (select count(*) from public.claim_jobs(array['newsletter.send'], 10, 120)),
  0::bigint, 'un second claim immédiat ne rend rien (running, futur, autre type)'
);
select results_eq(
  $$select id from public.claim_jobs(array['reengage.org'], 10, 120)$$,
  $$values ('d0000000-0000-4000-8000-000000000003'::uuid)$$,
  'le claim ciblé par type attrape le job de relance'
);

-- ── Reprise des zombies ──────────────────────────────────────
select is(public.requeue_stale_jobs(), 1, 'un running au verrou expiré est ravivé');
select results_eq(
  $$select status::text, locked_until is null from public.jobs
     where id = 'd0000000-0000-4000-8000-000000000004'$$,
  $$values ('queued', true)$$,
  'le zombie redevient réclamable, verrou levé'
);
select is(
  (select count(*) from public.claim_jobs(array['newsletter.send'], 10, 120)),
  1::bigint, 'le job ravivé se réclame à nouveau'
);

-- ── Idempotence de dépôt ─────────────────────────────────────
insert into public.jobs (type, payload, idempotency_key)
values ('reengage.org', '{}', 'tap:idem:1');
select throws_ok(
  $$insert into public.jobs (type, payload, idempotency_key)
    values ('reengage.org', '{}', 'tap:idem:1')$$,
  '23505', null, 'une clé d''idempotence ne se dépose qu''une fois'
);

-- ── ACL : la file est au serveur seul ────────────────────────
select ok(not has_table_privilege('authenticated', 'public.jobs', 'SELECT'), 'merchants cannot read the job queue');
select ok(not has_table_privilege('anon', 'public.jobs', 'SELECT'), 'anon cannot read the job queue');
select ok(has_function_privilege('service_role', 'public.claim_jobs(text[],integer,integer)', 'EXECUTE'), 'server can claim jobs');
select ok(not has_function_privilege('authenticated', 'public.claim_jobs(text[],integer,integer)', 'EXECUTE'), 'merchants cannot claim jobs');
select ok(has_function_privilege('service_role', 'public.requeue_stale_jobs()', 'EXECUTE'), 'server can revive stale jobs');
select ok(not has_function_privilege('authenticated', 'public.requeue_stale_jobs()', 'EXECUTE'), 'merchants cannot revive jobs');

select finish();
rollback;
