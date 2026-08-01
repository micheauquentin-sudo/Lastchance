-- ============================================================
-- Lastchance — écrire dans le Vault, mais SEULEMENT là où le registre pointe
-- ============================================================
--
-- ── Catalogue vivant (règle du projet : lire la définition VIVANTE, jamais
--    la migration d'origine — deux défauts livrés pour l'avoir oublié) ──
--
--   grep -l "function public.set_worker_vault_secrets" supabase/migrations/*.sql
--     → CE fichier seul. Fonction neuve : rien n'est écrasé, rien n'est masqué.
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
-- `ops_worker_definitions`, après coup, à partir du seul `p_worker`.
--
-- Le contraire — une signature `(p_url_secret_name, p_shared_secret_name,
-- p_url, p_secret)` — aurait été plus souple et aurait ouvert l'écriture
-- arbitraire du Vault par ce chemin. C'est la seule chose que ce fichier
-- refuse vraiment.
--
-- ── LA PORTÉE EXACTE DE CETTE PROPRIÉTÉ, ramenée à ce que la base tient ──
--
-- Une rédaction antérieure disait « un appelant compromis ne peut toucher que
-- les cases que le registre lui désigne ». C'est PLUS FORT que la base, et le
-- catalogue le contredit : `service_role` a DÉJÀ `execute` sur
-- `vault.create_secret` et `vault.update_secret`, `select` sur
-- `vault.decrypted_secrets`, `arwdDxt` sur le registre, et `BYPASSRLS`. Un
-- appelant qui EST `service_role` n'est donc contraint par rien de tout ceci :
-- il écrit où il veut sans passer par cette fonction.
--
-- Ce qui est VRAI, et qui reste la bonne raison de la signature : **elle borne
-- le chemin EXPOSÉ PAR POSTGREST.** Le schéma `vault` n'est pas publié ;
-- `public` l'est. Cette fonction est donc la seule porte d'écriture du Vault
-- atteignable par une requête HTTP, et cette porte-là ne mène qu'aux cases du
-- registre. C'est une réduction de SURFACE, pas un confinement de `service_role`.
--
-- Corollaire contre-intuitif, mesuré et à ne pas manquer : `auth.role()` lit un
-- GUC (`request.jwt.claims`) que N'IMPORTE QUEL rôle peut poser dans sa propre
-- session. Le contrôle interne ci-dessous n'est donc **pas** la barrière — c'est
-- l'ACL (`revoke all …` / `grant execute … to service_role`) qui tient. Il en
-- découle une règle pratique : relâcher le `grant` en croyant le `raise
-- exception` suffisant OUVRIRAIT la fonction. Le `raise` sert à tracer une
-- tentative, pas à interdire.
--
--
-- ── POURQUOI CETTE VERSION NE LÈVE (PRESQUE) PLUS ───────────
--
-- ⚠ CORRECTION D'UNE JUSTIFICATION FAUSSE, ET NON DU DESIGN.
--
-- La rédaction précédente de cette section affirmait que `raise exception`
-- faisait fuiter le jeton : « PostgreSQL journalise l'instruction fautive AVEC
-- SES PARAMÈTRES — STATEMENT: … puis DETAIL: parameters: $3 = <le jeton> »,
-- au motif que `log_min_error_statement` vaut `error`.
--
-- **C'est faux, et la mesure le dit** : `log_min_error_statement` gouverne le
-- TEXTE de l'instruction, jamais ses VALEURS. Les valeurs relèvent de
-- `log_parameter_max_length_on_error`, qui vaut **0** — PostgreSQL ne
-- journalise donc AUCUN paramètre lié. PostgREST lie le corps de la requête en
-- `$1` : sur une levée, le journal montre `$1`, jamais le jeton. La fuite
-- décrite n'a jamais existé sur cette configuration.
--
-- **Le design reste néanmoins le bon, et il ne faut PAS le défaire** en
-- découvrant cela — c'est précisément pour empêcher ce geste que la vraie
-- justification est écrite ici. Elle est plus solide que celle qu'elle
-- remplace :
--
--   1. Un refus PRÉVISIBLE n'a rien à faire dans un journal d'ERREUR. Un
--      worker absent du registre, un registre à moitié rempli : ce sont des
--      cas ORDINAIRES. Les traiter comme des anomalies remplit le journal
--      d'erreurs de bruit normal, et rend le vrai signal illisible.
--   2. Le refus rendu ne dépend d'AUCUN réglage de journalisation. Il reste
--      correct le jour où quelqu'un relève `log_parameter_max_length_on_error`
--      pour diagnostiquer autre chose — c'est-à-dire le jour où la fuite
--      décrite plus haut deviendrait, elle, réelle. Personne n'aura à relire ce
--      fichier ce jour-là.
--
-- C'est de la défense en profondeur, pas une fuite colmatée. Et c'est la
-- quatrième fois sur ces chantiers qu'un en-tête affirme plus que ce que le
-- code ou la base tiennent : le motif compte plus que l'occurrence.
--
-- D'où la distinction que ce fichier applique, et qui n'est PAS une commodité
-- de style : elle arbitre entre deux natures d'événement.
--
--   • LES REFUS MÉTIER (worker inconnu, worker sans prérequis Vault, deux
--     noms identiques dans le registre, valeur vide, panne du Vault) sont
--     PRÉVISIBLES. Un refus prévisible n'est pas une anomalie : le traiter
--     comme telle inscrit un événement normal au journal des erreurs, à chaque
--     fois. Ils sont donc RENDUS comme un `status` dans le retour.
--
--   • LE REFUS D'AUTORISATION (appelant ≠ `service_role`) continue de LEVER.
--     C'est un événement de SÉCURITÉ : il doit laisser une trace, et une
--     trace bruyante. Ce chemin est INATTEIGNABLE depuis l'appelant applicatif,
--     qui est `service_role` par construction ; l'atteindre suppose déjà un
--     appelant illégitime, dont on veut précisément l'instruction au journal.
--     Taire ce refus pour économiser une ligne de log reviendrait à effacer
--     la seule preuve de la tentative.
--
-- Le `exception when others` qui enveloppe l'écriture obéit à la première
-- règle : une panne INATTENDUE du Vault n'est pas non plus un événement dont
-- l'appelant doive découvrir la nature par une exception.
-- Deux conséquences à ne pas manquer :
--
--   1. Un bloc plpgsql doté d'un gestionnaire ouvre une SOUS-TRANSACTION.
--      Une panne entre les deux écritures est donc ANNULÉE : il ne reste
--      jamais une URL posée sans son jeton. C'est ce qui rend `written`
--      honnête plutôt que approximatif.
--   2. `sqlstate` (5 caractères, jamais une donnée) ressort dans
--      `error_code`. `sqlerrm` NON, et jamais : « value too long for type
--      character varying(…) » RECOPIE la valeur du paramètre fautif dans le
--      MESSAGE, et le message, lui, partirait dans le retour de la fonction —
--      donc chez l'appelant, puis potentiellement à l'audit et à Sentry. Ce
--      point-ci ne dépend d'aucun réglage de journalisation et reste entier
--      après la correction ci-dessus ; le rouvrir en ajoutant `sqlerrm` « pour
--      diagnostiquer » serait la vraie fuite.
--
--
-- ── LE SECRET PARTAGÉ ENTRE DEUX WORKERS ────────────────────
--
-- `ops_worker_definitions` donne à `jobs` ET à `sync-contests` le MÊME
-- `vault_shared_secret = sync_contests_secret`. Armer `jobs` réécrit donc
-- l'entrée de son voisin.
--
-- Ce partage est VOULU : les routes de cron s'authentifient toutes avec un
-- seul `CRON_SECRET` côté application, et un secret par worker donnerait
-- N entrées à faire tourner ensemble pour une seule valeur — plus de gestes,
-- donc plus d'occasions d'en oublier un, pour zéro cloisonnement réel.
--
-- Ce qui le rendrait DANGEREUX est précis : que les deux workers doivent un
-- jour porter des valeurs DIFFÉRENTES. Le partage devient alors une écriture
-- silencieuse par-dessus le voisin — armer `jobs` casserait `sync-contests`,
-- et rien dans le geste ne le dirait.
--
-- Ce fichier ne change PAS le registre : il rend le fait LISIBLE.
-- `also_affects_workers` nomme les autres workers dont une entrée est touchée
-- par cette écriture, pour que l'appelant puisse le DIRE au lieu de le
-- découvrir. La colonne se calcule depuis le registre, elle reste donc juste
-- le jour où le partage change.
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
-- ============================================================

-- `create or replace` ne peut changer NI la liste des paramètres NI le type
-- de retour : la version précédente de ce fichier rendait quatre colonnes,
-- celle-ci en rend huit. Le `drop` ne détruit donc qu'une fonction née dans ce
-- même fichier, sur une branche jamais fusionnée — aucune donnée, aucun objet
-- antérieur. Les `revoke`/`grant` sont reposés plus bas, comme il se doit
-- après un `drop` : un `create` nu rendrait `execute` à PUBLIC.
drop function if exists public.set_worker_vault_secrets(text, text, text);

create function public.set_worker_vault_secrets(
  p_worker text,
  p_url text,
  p_secret text
)
returns table (
  -- POURQUOI `status` ET `written` alors que l'un se déduit de l'autre :
  -- `written` est le FAIT, et il doit rester lisible d'un appelant qui ne
  -- connaîtrait pas un `status` ajouté demain. Un appelant qui teste
  -- `status = 'written'` se trompe en silence le jour où un statut apparaît ;
  -- un appelant qui teste `written` ne se trompe jamais. `status` dit
  -- POURQUOI, `written` dit SI.
  status text,
  written boolean,
  url_secret_name text,
  shared_secret_name text,
  url_created boolean,
  shared_created boolean,
  also_affects_workers text[],
  error_code text
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
  v_also text[] := '{}'::text[];
  v_sqlstate text;
begin
  -- ── LE SEUL REFUS QUI LÈVE ──────────────────────────────────
  -- Placé AVANT le bloc gardé, et c'est structurel : un `exception when
  -- others` qui l'engloberait avalerait l'événement de sécurité qu'on tient à
  -- voir au journal. Voir l'en-tête, section « pourquoi cette version ne lève
  -- (presque) plus » : la distinction arbitre entre deux natures d'événement,
  -- elle n'est pas une commodité.
  --
  -- ⚠ CE CONTRÔLE N'EST PAS LA BARRIÈRE. `auth.role()` lit le GUC
  -- `request.jwt.claims`, que n'importe quel rôle peut poser dans sa propre
  -- session : quiconque a le droit d'EXÉCUTER cette fonction peut le
  -- satisfaire. Ce qui interdit réellement l'accès est l'ACL posée en bas de ce
  -- fichier. Relâcher ce `grant` en jugeant ce `raise` suffisant ouvrirait la
  -- fonction. Il sert à TRACER une tentative, pas à l'interdire.
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
    -- Le nom du worker n'est PAS repris dans le retour : l'appelant vient de
    -- le fournir, il le connaît déjà. Le statut suffit à diagnostiquer.
    return query select 'unknown_worker'::text, false,
                        null::text, null::text, null::boolean, null::boolean,
                        '{}'::text[], null::text;
    return;
  end if;

  if v_url_name is null or v_shared_name is null then
    -- Un worker sans nom de secret n'attend PAS de cadence rapide : TOUS les
    -- autres workers du registre sont dans ce cas — les crons Vercel,
    -- quotidiens ou hebdomadaires. Aucun chiffre ici : la version précédente
    -- de ce fichier disait « les sept crons quotidiens » alors que le registre
    -- en portait huit, dont un hebdomadaire. Un compte recopié à la main
    -- vieillit ; la règle, non. Poser un secret pour eux
    -- reviendrait à inventer une case que rien ne lit — et, pire, à laisser
    -- croire la cadence armée. On refuse les DEUX cas ensemble, et non le
    -- seul `vault_url_secret` : n'écrire que l'URL satisferait le drapeau
    -- `configured` à moitié tout en laissant la garde `count(*) = 2` du
    -- pg_cron fausse. Un demi-état qui a l'air armé et qui est inerte est
    -- exactement ce qu'on ne veut pas produire.
    return query select 'no_vault_secrets'::text, false,
                        v_url_name, v_shared_name, null::boolean, null::boolean,
                        '{}'::text[], null::text;
    return;
  end if;

  -- ── L'ÉCRITURE PARTAGÉE, rendue LISIBLE ─────────────────────
  -- Les autres workers dont une entrée porte l'un des deux noms qu'on
  -- s'apprête à écrire. Aujourd'hui : armer `jobs` réécrit l'entrée de
  -- `sync-contests`, parce que les deux partagent `sync_contests_secret`.
  -- Calculé depuis le REGISTRE et non écrit en dur : la réponse reste juste
  -- le jour où le partage change. Rempli avant les deux derniers refus, pour
  -- qu'un refus dise aussi ce que l'écriture AURAIT touché.
  select coalesce(pg_catalog.array_agg(d.worker order by d.worker), '{}'::text[])
    into v_also
    from public.ops_worker_definitions d
   where d.worker <> p_worker
     and (d.vault_url_secret in (v_url_name, v_shared_name)
          or d.vault_shared_secret in (v_url_name, v_shared_name));

  if v_url_name = v_shared_name then
    -- Cas impossible avec le registre d'aujourd'hui, refusé quand même :
    -- sous un même nom, la seconde écriture écraserait la première, et
    -- l'entrée « URL » finirait par contenir le jeton Bearer. `net.http_get`
    -- l'émettrait alors comme URL — un secret parti en clair vers une
    -- destination arbitraire. Le coût de la garde est de trois lignes.
    return query select 'registry_conflict'::text, false,
                        v_url_name, v_shared_name, null::boolean, null::boolean,
                        v_also, null::text;
    return;
  end if;

  if coalesce(pg_catalog.btrim(p_url), '') = ''
     or coalesce(pg_catalog.btrim(p_secret), '') = '' then
    -- Une valeur vide serait acceptée par le Vault et FERAIT PASSER la garde
    -- du pg_cron : le job se réveillerait toutes les 5 minutes pour appeler
    -- une URL vide, ou pour se faire refuser un jeton vide — indéfiniment, et
    -- sans que rien ne dise pourquoi. Le statut ne dit PAS laquelle des deux
    -- valeurs est vide : ce serait un oracle sur ce que l'appelant a envoyé,
    -- pour un gain de diagnostic nul (il tient les deux).
    return query select 'empty_value'::text, false,
                        v_url_name, v_shared_name, null::boolean, null::boolean,
                        v_also, null::text;
    return;
  end if;

  -- ── LES DEUX ÉCRITURES, sous sous-transaction ───────────────
  -- Le gestionnaire fait de ce bloc une sous-transaction : une panne entre
  -- les deux écritures ANNULE la première. Il ne reste jamais une URL posée
  -- sans son jeton — l'état qui ferait passer la garde du pg_cron à moitié.
  begin
    -- ── 1. L'URL du worker ────────────────────────────────────
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

    -- ── 2. Le jeton partagé ───────────────────────────────────
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
  exception when others then
    -- `sqlstate` : 5 caractères, structurellement incapable de porter une
    -- valeur. Sa variable jumelle — le MESSAGE d'erreur textuel — est absente
    -- de toute cette fonction, et doit le rester : « value too long for type
    -- character varying(…) » recopie la valeur du paramètre fautif,
    -- c'est-à-dire le jeton. Le test relit ce corps au catalogue pour
    -- l'interdire ; le nom de cette variable n'est donc pas écrit ici, il
    -- ferait rougir sa propre garde.
    v_sqlstate := sqlstate;
    -- Les deux booléens repartent à null et non à `false` : la
    -- sous-transaction vient d'annuler ce qui avait pu être écrit, « pas
    -- créé » serait une affirmation sur un état qui n'existe plus.
    return query select 'vault_error'::text, false,
                        v_url_name, v_shared_name, null::boolean, null::boolean,
                        v_also, v_sqlstate;
    return;
  end;

  -- Ce qui ressort : un statut, le fait `written`, les deux NOMS (publics par
  -- nature, déjà lisibles dans le registre), deux booléens créé/remplacé, et
  -- les workers voisins touchés. Jamais l'URL, jamais le jeton, y compris
  -- dans un motif de refus. Un appelant qui voudrait relire la valeur qu'il
  -- vient de poser n'a aucun moyen de le faire par ici.
  return query select 'written'::text, true,
                      v_url_name, v_shared_name, v_url_created, v_shared_created,
                      v_also, null::text;
end;
$$;

comment on function public.set_worker_vault_secrets(text, text, text) is
  'Pose ou remplace les deux secrets Vault d''un worker, pour armer sa cadence rapide pg_cron. PROPRIÉTÉ CENTRALE : les NOMS des entrées écrites sont lus dans ops_worker_definitions (vault_url_secret, vault_shared_secret) à partir du seul p_worker — jamais fournis par l''appelant. PORTÉE EXACTE de cette propriété : elle borne le chemin EXPOSÉ PAR POSTGREST (le schéma vault n''est pas publié, public l''est), elle ne contraint PAS service_role, qui a déjà execute sur vault.create_secret/update_secret, select sur vault.decrypted_secrets et BYPASSRLS. C''est une réduction de surface, pas un confinement. Corollaire : auth.role() lit un GUC que tout rôle peut poser dans sa propre session — le contrôle interne TRACE, c''est l''ACL qui INTERDIT ; relâcher le grant en jugeant le raise suffisant ouvrirait la fonction. DEUX NATURES DE REFUS : les refus MÉTIER (unknown_worker, no_vault_secrets, registry_conflict, empty_value, vault_error) sont RENDUS dans status et ne lèvent pas, parce qu''un refus PRÉVISIBLE n''a rien à faire dans un journal d''erreur et que ce choix ne dépend d''aucun réglage de journalisation (défense en profondeur — la fuite « STATEMENT + parameters » qu''affirmait une rédaction antérieure n''existe PAS : log_parameter_max_length_on_error vaut 0, PostgreSQL ne journalise aucun paramètre lié) ; le refus d''AUTORISATION (appelant ≠ service_role) LÈVE toujours, parce que c''est un événement de sécurité qui doit laisser une trace et que ce chemin est inatteignable depuis l''appelant applicatif. written dit SI l''écriture a eu lieu, status POURQUOI pas ; error_code ne porte que le SQLSTATE (5 caractères), jamais sqlerrm qui recopierait la valeur fautive dans le RETOUR. also_affects_workers nomme les autres workers dont une entrée est réécrite par ce même geste (jobs et sync-contests partagent sync_contests_secret : un seul CRON_SECRET pour toutes les routes de cron). Rejouable : crée si absent, met à jour sinon ; le bloc d''écriture est une sous-transaction, une panne n''y laisse jamais l''URL sans le jeton. Ne rend JAMAIS l''URL ni le jeton. service_role uniquement.';

-- `revoke all … from public, anon` seul laisserait `authenticated` ET
-- `service_role` en place (ADR-049 : le revoke ne retire pas ce qui n'est pas
-- nommé). Les quatre sont donc écrits, puis service_role seul est réaccordé.
-- Reposés APRÈS le `drop`/`create` ci-dessus : un `create` nu accorde
-- `execute` à PUBLIC, et le silence serait ici une ouverture.
revoke all on function public.set_worker_vault_secrets(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_worker_vault_secrets(text, text, text)
  to service_role;
