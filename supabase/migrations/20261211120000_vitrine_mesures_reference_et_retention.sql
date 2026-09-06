-- ============================================================
-- LES COMPTEURS DE VITRINE NE COMPTENT PLUS QUE DU RÉEL, ET FINISSENT
-- PAR S'EFFACER
--
-- Deux moitiés du même défaut, corrigées ensemble parce qu'elles se
-- renforcent : une table publiquement inscriptible sur une référence non
-- vérifiée, et que rien ne vide jamais.
--
--
-- ── MOITIÉ 1 · LA RÉFÉRENCE N'ÉTAIT CONTRÔLÉE QUE PAR SA LONGUEUR ──
--
-- `compter_vues_vitrine` (20261026130000:146-160) n'exigeait de `v_ref` qu'un
-- `char_length between 1 and 64`. Or la clé primaire de `vitrine_mesures` est
-- (organisation, jour, langue, type, référence) : toute référence NEUVE crée
-- une LIGNE NEUVE, et cette ligne remonte telle quelle dans le tableau de bord
-- du commerçant — au même rang que ses vraies fiches, triée par vues.
--
-- Ce qui protégeait jusqu'ici, et ce qui ne suffit pas :
-- `src/lib/vitrine-mesures.ts` (`mesureRecevable`) exige déjà un UUID pour
-- `carte`/`rubrique`/`fiche`, et une valeur du vocabulaire fermé pour
-- `action`. Un attaquant ne peut donc PAS écrire n'importe quelle chaîne — il
-- peut écrire n'importe quel UUID, et il en existe une infinité. Le compte est
-- écrit dans le cahier : 30 requêtes/minute/IP × 60 mesures par requête =
-- 1 800 lignes/minute et par IP, chacune une fausse « fiche consultée ».
--
-- La borne applicative contrôle la FORME ; il manquait le contrôle de
-- l'EXISTENCE, et l'existence ne se vérifie qu'en base. Chaque référence de
-- contenu est désormais confrontée à la table qui la porte, DANS
-- L'ORGANISATION résolue par le slug :
--
--     carte     → public.vitrine_menus
--     rubrique  → public.vitrine_categories
--     fiche     → public.vitrine_items
--
-- Le filtre par `organization_id` n'est pas décoratif : sans lui, l'identifiant
-- RÉEL d'une fiche du commerce voisin — obtenu en ouvrant simplement sa vitrine
-- publique — se compterait sur le tableau de bord de celui-ci. On aurait
-- remplacé un identifiant inventé par un identifiant volé.
--
-- `action` N'EST PAS TOUCHÉ, ET C'EST DÉLIBÉRÉ. Ce type ne désigne aucune
-- table : il nomme une PORTE (`reserver`, `quiz`…), et ce vocabulaire vit dans
-- `VITRINE_ACTIONS` (src/lib/vitrine.ts), déjà appliqué par la route publique.
-- Le recopier en SQL créerait une seconde liste à tenir, qui divergerait à la
-- première porte ajoutée — et la divergence serait silencieuse : elle se
-- verrait comme un compteur qui n'avance plus. Le risque résiduel est borné par
-- la taille de ce vocabulaire fermé : au pire, un compteur d'une porte qui
-- existe. C'est un écart assumé, pas un oubli.
--
-- CE QUE ÇA CHANGE POUR LE COMMERÇANT, dit franchement : une fiche supprimée
-- pendant qu'un visiteur la regarde perd le comptage de cette page-là. Les
-- lignes DÉJÀ écrites ne sont pas touchées — le commentaire de la table
-- (« une fiche supprimée laisse donc son compteur ») reste vrai pour
-- l'historique, il cesse seulement d'être vrai pour les incréments À VENIR.
--
-- COÛT : jusqu'à soixante recherches par clé primaire pour un appel plein, sur
-- des tables de taille de catalogue. C'est le prix d'écrire ailleurs que dans
-- le vide, et il se paie sur une route déjà plafonnée à 30 requêtes/minute/IP.
--
--
-- ── MOITIÉ 2 · RIEN NE VIDAIT CETTE TABLE ──
--
-- `vitrine_mesures` est absente des treize purges quotidiennes
-- (`src/app/api/cron/purge-data/route.ts`). Elle croissait donc sans borne
-- depuis sa création, et la moitié 1 ci-dessus ne change rien à ça : même
-- alimentée uniquement par du réel, une ligne par (organisation, jour, langue,
-- type, référence) s'accumule indéfiniment.
--
-- RÉTENTION FIXE, PAS CELLE DE L'ORGANISATION, et c'est un choix contraire au
-- réflexe du dépôt. Les autres purges lisent `data_retention_months` parce
-- qu'elles effacent des DONNÉES PERSONNELLES, et que la rétention est alors une
-- promesse faite à la personne. Ici il n'y a personne : la table ne porte NI
-- cookie, NI session, NI empreinte, NI IP, NI horodatage plus fin que le jour
-- (20261026130000, décision structurante). Un commerçant qui a réglé sa
-- rétention personnelle sur un mois n'a pas demandé pour autant à perdre
-- l'historique de popularité de sa carte — ce sont deux questions différentes,
-- et les confondre lui retirerait ce qu'il n'a jamais voulu céder.
--
-- 13 MOIS, ET VOICI D'OÙ VIENT LE CHIFFRE. La seule lecture existante est
-- `vitrine_mesures_state`, bornée à 90 jours (« un `p_jours` libre aurait laissé
-- demander l'historique entier depuis un écran »). Rien, aujourd'hui, ne peut
-- lire au-delà. Les treize mois sont donc une MARGE, pas un besoin : ils sont
-- le plafond déjà retenu par ce dépôt pour un journal non personnel
-- (`purge_expired_experience_events`, défaut 13 mois), et ils laissent la place
-- à une comparaison d'une année sur l'autre si elle est demandée un jour. C'est
-- un plafond, pas une promesse de conservation.
--
-- AUCUN INDEX AJOUTÉ SUR `jour`, ET C'EST RAISONNÉ. Un index le rendrait ce
-- balayage instantané — une fois par nuit. Il serait payé sur CHACUNE des
-- soixante écritures de chaque chargement de page publique, c'est-à-dire sur le
-- chemin le plus chaud du module. Un parcours séquentiel nocturne sur une table
-- de compteurs est exactement ce pour quoi un travail de nuit existe. Le jour
-- où la table le justifiera, l'index tient dans une migration.
--
-- ⚠️ CETTE FONCTION NE S'APPELLE PAS TOUTE SEULE. Tant que
-- `src/app/api/cron/purge-data/route.ts` ne l'invoque pas, elle dort — et une
-- purge qui dort est très exactement le défaut que ce fichier de route décrit
-- pour `purge_expired_experience_events` (« la fonction dormait depuis sa
-- création et la table croissait sans borne »). L'existence n'est pas
-- l'exécution.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. `compter_vues_vitrine` — la référence doit exister
-- ════════════════════════════════════════════════════════════
--
-- Corps repris à l'identique de 20261026130000:113-165, hors la validation de
-- forme et les trois `exists`. La signature ne bouge pas : aucun appelant à
-- toucher, et le `create or replace` conserve propriétaire et ACL (réémises en
-- fin de section, comme le fait le fichier d'origine).
create or replace function public.compter_vues_vitrine(
  p_slug text,
  p_langue text,
  p_mesures jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_langue text;
  v_entree jsonb;
  v_type text;
  v_ref text;
  v_n integer := 0;
  v_connu boolean;
begin
  if p_slug is null or p_mesures is null
     or pg_catalog.jsonb_typeof(p_mesures) <> 'array' then
    return;
  end if;

  -- Repli silencieux sur le français, comme la lecture publique : une langue
  -- inconnue n'est pas une erreur de comptage, c'est une adresse bricolée.
  v_langue := case when p_langue = 'en' then 'en' else 'fr' end;

  select s.organization_id into v_org
  from public.vitrine_settings s
  where s.slug = p_slug and s.published;

  if v_org is null then return; end if;
  if not public.org_has_module_access(v_org, 'vitrine') then return; end if;

  for v_entree in select * from pg_catalog.jsonb_array_elements(p_mesures) loop
    v_n := v_n + 1;
    exit when v_n > 60;

    v_type := v_entree ->> 'type';
    v_ref := v_entree ->> 'ref';

    continue when v_type is null or v_ref is null;
    continue when v_type not in ('carte', 'rubrique', 'fiche', 'action');
    continue when pg_catalog.char_length(v_ref) not between 1 and 64;

    -- ── LA RÉFÉRENCE DOIT DÉSIGNER UN CONTENU DE CETTE ORGANISATION ──
    -- `action` ne passe pas par là : il ne vise aucune table (cf. en-tête).
    if v_type <> 'action' then
      -- Le format d'abord, et pas par élégance : `v_ref::uuid` sur une chaîne
      -- quelconque LÈVE (22P02), et l'exception remonterait à la route
      -- publique, transformant un lot entier de compteurs légitimes en échec
      -- silencieux. On écarte la ligne au lieu de casser l'appel. Les deux
      -- casses hexadécimales sont admises : être plus strict que le type
      -- `uuid` lui-même n'ajoute aucune sécurité et perdrait une valeur
      -- parfaitement valide.
      continue when v_ref !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

      if v_type = 'carte' then
        select exists (
          select 1 from public.vitrine_menus x
          where x.id = v_ref::uuid and x.organization_id = v_org
        ) into v_connu;
      elsif v_type = 'rubrique' then
        select exists (
          select 1 from public.vitrine_categories x
          where x.id = v_ref::uuid and x.organization_id = v_org
        ) into v_connu;
      else
        select exists (
          select 1 from public.vitrine_items x
          where x.id = v_ref::uuid and x.organization_id = v_org
        ) into v_connu;
      end if;

      continue when not v_connu;
    end if;

    insert into public.vitrine_mesures
      (organization_id, jour, langue, type, ref, compteur)
    values (v_org, current_date, v_langue, v_type, v_ref, 1)
    on conflict (organization_id, jour, langue, type, ref)
    do update set compteur = public.vitrine_mesures.compteur + 1;
  end loop;
end;
$$;

comment on function public.compter_vues_vitrine(text, text, jsonb) is
  'Incrémente les compteurs agrégés d''une Vitrine (VIT-9). Résout le SLUG '
  'lui-même — l''appelant est une route publique sans jeton — et exige '
  '`published` ET org_has_module_access(…, ''vitrine''). Au plus 60 entrées, '
  'et chaque entrée vaut +1 : la charge ne porte aucun incrément. '
  'Depuis 20261211120000, une référence de type carte/rubrique/fiche doit '
  'DÉSIGNER un contenu EXISTANT de CETTE organisation (vitrine_menus / '
  'vitrine_categories / vitrine_items) : la borne applicative ne contrôlait que '
  'la FORME (un UUID), et n''importe quel UUID inventé créait une ligne neuve, '
  'lue comme une « fiche consultée » par le tableau de bord. Le type `action` '
  'reste hors de ce contrôle : il ne vise aucune table, son vocabulaire fermé '
  'vit dans VITRINE_ACTIONS et le dupliquer ici créerait une seconde liste à '
  'tenir. Une entrée non reconnue est ÉCARTÉE, jamais levée : le reste du lot '
  'doit être compté. service_role uniquement.';

revoke all on function public.compter_vues_vitrine(text, text, jsonb) from public;
revoke all on function public.compter_vues_vitrine(text, text, jsonb) from anon;
revoke all on function public.compter_vues_vitrine(text, text, jsonb) from authenticated;
grant execute on function public.compter_vues_vitrine(text, text, jsonb) to service_role;


-- ════════════════════════════════════════════════════════════
-- 2. `purge_expired_vitrine_mesures` — la rétention qui manquait
-- ════════════════════════════════════════════════════════════
--
-- Même forme que `purge_expired_lobbies` (20261017120000) : `returns bigint`
-- avec le nombre de lignes effacées, pour que le cron puisse le journaliser.
create or replace function public.purge_expired_vitrine_mesures()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  -- `jour` est une DATE : on compare à une date, pas à un instant. Une purge
  -- qui rattrape trois jours de retard efface exactement ce qu'elle aurait
  -- effacé à l'heure — rien dans cette table ne dépend de l'heure d'exécution.
  delete from public.vitrine_mesures m
   where m.jour < (pg_catalog.now() - pg_catalog.make_interval(months => 13))::date;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purge_expired_vitrine_mesures() is
  'Rétention des compteurs de Vitrine (20261211120000) : efface les lignes de '
  'plus de 13 mois et rend le nombre supprimé. La table n''était vidée par '
  'AUCUNE des purges quotidiennes depuis sa création. Rétention FIXE et non '
  'celle de l''organisation : `vitrine_mesures` ne porte aucune donnée '
  'personnelle (ni visiteur, ni session, ni IP, ni horodatage plus fin que le '
  'jour), donc `data_retention_months` — qui est une promesse faite à une '
  'personne — n''a rien à y mordre, et l''appliquer ferait perdre au commerçant '
  'un historique de popularité qu''il n''a jamais demandé à céder. 13 mois est '
  'une MARGE : la seule lecture existante (vitrine_mesures_state) est bornée à '
  '90 jours. INERTE tant que src/app/api/cron/purge-data/route.ts ne l''appelle '
  'pas. service_role uniquement.';

revoke all on function public.purge_expired_vitrine_mesures()
  from public, anon, authenticated;
grant execute on function public.purge_expired_vitrine_mesures()
  to service_role;
