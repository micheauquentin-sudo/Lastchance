-- ============================================================
-- Lastchance — écrire dans le Vault, mais SEULEMENT là où le registre pointe
-- ============================================================
--
-- ── Catalogue vivant (règle du projet : lire la définition VIVANTE, jamais
--    la migration d'origine — deux défauts livrés pour l'avoir oublié) ──
--
--   grep -l "function public.set_worker_vault_secrets" supabase/migrations/*.sql
--     → AUCUN fichier. Fonction neuve : rien n'est écrasé, rien n'est masqué.
--
--   grep -l "function public.ops_workers_health" supabase/migrations/*.sql
--     → 20260805120000_worker_operations.sql
--       20260805240000_worker_observability_scale.sql
--     La définition VIVANTE est celle de `20260805240000`, et c'est celle-là
--     qui compte ici : elle dérive son drapeau `configured` des COLONNES du
--     registre (`d.vault_url_secret`, `d.vault_shared_secret`), là où
--     `20260805120000` interrogeait trois noms écrits en dur. Lire l'archive
--     aurait fait croire que les noms de secrets sont une constante du
--     schéma, alors qu'ils sont une DONNÉE du registre — et toute la sûreté
--     de cette migration tient à ce qu'ils en soient une.
--
--
-- ── LE FAIT PRODUIT ─────────────────────────────────────────
--
-- `/api/cron/jobs` ne tourne QU'UNE FOIS PAR JOUR : `vercel.json` le planifie
-- à `20 4 * * *` et le plan Hobby n'accepte pas mieux. Un code de retrait
-- envoyé par SMS peut donc arriver 24 h après le gain. Pour le client qui
-- vient de faire tourner la roue devant le comptoir, c'est un lot qui
-- n'arrive pas.
--
--
-- ── CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT ────────────────
--
-- La sortie est en place depuis `20260722100000_jobs_queue.sql` : un pg_cron
-- `lastchance-jobs-worker`, toutes les 5 minutes, qui appelle la route par
-- `net.http_get`. Il porte sa PROPRE garde, et c'est elle qui le rend inerte :
--
--     where (select count(*) from vault.decrypted_secrets
--             where name in ('jobs_worker_url', 'sync_contests_secret')) = 2
--
-- Le job est donc programmé, actif, et ne fait rien — par construction — tant
-- que les deux secrets n'existent pas. C'est ce qui permet de le livrer en CI
-- et sur un poste de développement sans qu'il tente d'appeler quoi que ce soit.
--
-- La LECTURE de ces secrets existe aussi (`ops_workers_health()`, drapeau
-- `configured`). Le registre `ops_worker_definitions` porte même, PAR WORKER,
-- le NOM de ses deux entrées Vault (`vault_url_secret`, `vault_shared_secret`).
--
-- **Il ne manquait que l'ÉCRITURE.** C'est tout l'objet de ce fichier.
--
--
-- ── LA PROPRIÉTÉ CENTRALE, celle qui rend le geste sûr ──────
--
-- Cette fonction est atteignable depuis PostgREST (schéma `public`). Elle
-- reçoit donc, par construction, des paramètres qui viennent du réseau. La
-- question n'est pas « l'appelant est-il de confiance » mais « que peut-il
-- faire s'il ne l'est plus ».
--
-- La réponse tient dans un choix de signature : **l'appelant fournit les
-- VALEURS, jamais les NOMS.** Les noms des deux entrées écrites sont lus dans
-- `ops_worker_definitions`, après coup, à partir du seul `p_worker`. Un
-- appelant compromis ne peut donc écrire que dans les cases que le REGISTRE
-- lui désigne — et le registre n'en désigne aujourd'hui que trois, pour deux
-- workers. Aucune autre entrée du Vault n'est joignable par ce chemin,
-- quelle que soit l'entrée fournie.
--
-- Le contraire — une signature `(p_url_secret_name, p_shared_secret_name,
-- p_url, p_secret)` — aurait été plus souple et aurait ouvert l'écriture
-- arbitraire du Vault à quiconque atteint la RPC. C'est la seule chose que ce
-- fichier refuse vraiment.
--
-- Corollaire à ne pas mal lire : `service_role` a DÉJÀ `execute` sur
-- `vault.create_secret` (grant de l'extension, vérifié au catalogue). Cette
-- fonction ne lui retire donc aucun pouvoir qu'il aurait autrement. Ce
-- qu'elle apporte, c'est que le chemin EXPOSÉ — celui que PostgREST publie,
-- le seul qu'une requête HTTP puisse atteindre — soit borné par le registre :
-- le schéma `vault` n'est pas exposé par PostgREST, `public` l'est.
--
--
-- ── LA MÉCANIQUE DU VAULT, mesurée et non supposée ──────────
--
-- Signatures relevées dans la base locale (supabase_vault 0.3.1) :
--
--   vault.create_secret(new_secret text, new_name text default null,
--                       new_description text default '',
--                       new_key_id uuid default null) -> uuid
--   vault.update_secret(secret_id uuid, new_secret text default null,
--                       new_name text default null,
--                       new_description text default null,
--                       new_key_id uuid default null) -> void
--
-- Deux pièges, tous deux vérifiés à la main avant d'écrire ce fichier :
--
--  1. `create_secret` LÈVE si le nom existe déjà (`vault.secrets` porte un
--     index unique partiel `secrets_name_idx` sur `name`). Rejouer l'appel
--     naïvement ferait donc échouer la deuxième pose — c'est-à-dire toute
--     ROTATION du secret, le geste le plus normal qui soit.
--  2. `update_secret` prend un IDENTIFIANT, pas un nom. Il faut retrouver
--     l'`id` dans `vault.secrets` avant de pouvoir mettre à jour.
--
-- D'où la forme « chercher l'id, créer si absent, mettre à jour sinon ».
-- La fonction est ainsi REJOUABLE : deux appels identiques laissent le même
-- état, et un appel qui change la valeur la remplace sans erreur.
--
-- Les deux fonctions du Vault sont `security definer` et appartiennent à
-- `supabase_admin`, avec `execute` accordé à `postgres` : une fonction
-- `security definer` possédée par `postgres` (le cas de celle-ci) peut donc
-- les appeler, bien que `postgres` n'ait ni INSERT ni UPDATE sur
-- `vault.secrets`. Vérifié en jouant la mécanique complète avant de l'écrire,
-- plutôt qu'en le supposant.
--
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──────────────────────
--
-- Elle ne planifie rien, ne réveille rien, n'écrit aucun secret. Elle ajoute
-- une fonction et s'arrête là. Sur une base neuve — CI, poste de
-- développement — le Vault reste vide et le pg_cron reste inerte, exactement
-- comme avant. Le réveil est un GESTE d'exploitation (un bouton de
-- back-office, super_admin, session fraîche, refus tracé), jamais un effet de
-- bord de déploiement.
-- ============================================================

create or replace function public.set_worker_vault_secrets(
  p_worker text,
  p_url text,
  p_secret text
)
returns table (
  url_secret_name text,
  shared_secret_name text,
  url_created boolean,
  shared_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url_name text;
  v_shared_name text;
  v_id uuid;
  v_url_created boolean;
  v_shared_created boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- ── Le registre est lu AVANT toute écriture, et c'est lui qui
  --    décide des noms. `p_worker` est la SEULE prise de l'appelant
  --    sur la destination. ────────────────────────────────────
  select d.vault_url_secret, d.vault_shared_secret
    into v_url_name, v_shared_name
    from public.ops_worker_definitions d
   where d.worker = p_worker;

  if not found then
    -- Le nom du worker est repris dans le message : il vient de l'appelant,
    -- il n'a rien d'un secret, et sans lui le refus est indiagnostiquable.
    raise exception 'worker inconnu du registre : %', p_worker;
  end if;

  if v_url_name is null or v_shared_name is null then
    -- Un worker sans nom de secret n'attend PAS de cadence rapide : les sept
    -- crons quotidiens sont dans ce cas. Poser un secret pour eux
    -- reviendrait à inventer une case que rien ne lit — et, pire, à laisser
    -- croire la cadence armée. On refuse les DEUX cas ensemble, et non le
    -- seul `vault_url_secret` : n'écrire que l'URL satisferait le drapeau
    -- `configured` à moitié tout en laissant la garde `count(*) = 2` du
    -- pg_cron fausse. Un demi-état qui a l'air armé et qui est inerte est
    -- exactement ce qu'on ne veut pas produire.
    raise exception
      'worker % sans cadence rapide : le registre ne lui associe pas deux noms de secrets Vault',
      p_worker;
  end if;

  if v_url_name = v_shared_name then
    -- Cas impossible avec le registre d'aujourd'hui, refusé quand même :
    -- sous un même nom, la seconde écriture écraserait la première, et
    -- l'entrée « URL » finirait par contenir le jeton Bearer. `net.http_get`
    -- l'émettrait alors comme URL — un secret parti en clair vers une
    -- destination arbitraire. Le coût de la garde est de trois lignes.
    raise exception
      'registre incohérent pour le worker % : les deux secrets porteraient le même nom',
      p_worker;
  end if;

  if coalesce(pg_catalog.btrim(p_url), '') = ''
     or coalesce(pg_catalog.btrim(p_secret), '') = '' then
    -- Une valeur vide serait acceptée par le Vault et FERAIT PASSER la garde
    -- du pg_cron : le job se réveillerait toutes les 5 minutes pour appeler
    -- une URL vide, ou pour se faire refuser un jeton vide — indéfiniment, et
    -- sans que rien ne dise pourquoi. Ni l'une ni l'autre des deux valeurs
    -- n'apparaît dans ce message.
    raise exception 'url ou secret vide pour le worker % : refusé', p_worker;
  end if;

  -- ── 1. L'URL du worker ──────────────────────────────────────
  select s.id into v_id from vault.secrets s where s.name = v_url_name;
  if v_id is null then
    perform vault.create_secret(
      p_url,
      v_url_name,
      'Lastchance — URL du worker ' || p_worker || ' (cadence rapide pg_cron)'
    );
    v_url_created := true;
  else
    perform vault.update_secret(v_id, p_url);
    v_url_created := false;
  end if;

  -- ── 2. Le jeton partagé ─────────────────────────────────────
  -- `v_id` est remis à null explicitement. `select into` le ferait de
  -- lui-même quand aucune ligne ne sort, mais c'est précisément le genre de
  -- détail dont on ne veut pas dépendre ici : garder par mégarde l'id de
  -- l'URL ferait ÉCRIRE LE JETON DANS L'ENTRÉE URL.
  v_id := null;
  select s.id into v_id from vault.secrets s where s.name = v_shared_name;
  if v_id is null then
    perform vault.create_secret(
      p_secret,
      v_shared_name,
      'Lastchance — jeton Bearer des workers (cadence rapide pg_cron)'
    );
    v_shared_created := true;
  else
    perform vault.update_secret(v_id, p_secret);
    v_shared_created := false;
  end if;

  -- Ce qui ressort : les deux NOMS (publics par nature, déjà lisibles dans le
  -- registre) et deux booléens qui disent « créé » ou « remplacé ». Jamais
  -- l'URL, jamais le jeton. Un appelant qui voudrait relire la valeur qu'il
  -- vient de poser n'a aucun moyen de le faire par ici.
  return query select v_url_name, v_shared_name, v_url_created, v_shared_created;
end;
$$;

comment on function public.set_worker_vault_secrets(text, text, text) is
  'Pose ou remplace les deux secrets Vault d''un worker, pour armer sa cadence rapide pg_cron. PROPRIÉTÉ CENTRALE : les NOMS des entrées écrites sont lus dans ops_worker_definitions (vault_url_secret, vault_shared_secret) à partir du seul p_worker — jamais fournis par l''appelant. Un appelant compromis ne peut donc toucher que les cases que le registre lui désigne, aucune autre entrée du Vault. Refuse un worker inconnu du registre, un worker sans les deux noms de secrets, deux noms identiques, une valeur vide. Rejouable : crée si absent, met à jour sinon (vault.create_secret lève sur nom existant, vault.update_secret prend un id). Ne rend JAMAIS l''URL ni le jeton : seulement les deux noms et deux booléens créé/remplacé. service_role uniquement.';

-- `revoke all … from public, anon` seul laisserait `authenticated` ET
-- `service_role` en place (ADR-049 : le revoke ne retire pas ce qui n'est pas
-- nommé). Les quatre sont donc écrits, puis service_role seul est réaccordé.
revoke all on function public.set_worker_vault_secrets(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_worker_vault_secrets(text, text, text)
  to service_role;
