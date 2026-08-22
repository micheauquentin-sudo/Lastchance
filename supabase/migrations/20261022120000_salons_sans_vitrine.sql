-- ════════════════════════════════════════════════════════════
-- LES SALONS SE DÉTACHENT DE LA VITRINE
--
-- Décision propriétaire du 2026-08-22 : Duo Miroir et Portrait de la Bande
-- cessent d'être vendus avec la carte. Ce sont des JEUX — au même titre que
-- les quinze jeux rapides — et ils entrent dans le socle `core`, donc dans
-- les cinq offres (`src/lib/plans.ts`, packaging 2026-08-c).
--
--
-- ── POURQUOI LE CATALOGUE SEUL N'AURAIT RIEN CHANGÉ ─────────
--
-- Trois attaches liaient les salons à la Vitrine, et le catalogue n'en était
-- qu'une. Les deux autres sont ici et dans `resoudreCommerceLobby` :
--
--   1. `create_player_lobby` exigeait le droit `vitrine` ;
--   2. et une ligne `vitrine_settings` PUBLIÉE.
--
-- Une boulangerie sur Coup d'envoi aurait donc eu Duo Miroir « inclus » dans
-- son offre et strictement injouable. C'est la définition d'une demi-livraison.
--
--
-- ── CE LOT FAIT CE QUE LE PRÉCÉDENT AVAIT ANNONCÉ ───────────
--
-- 20261020120000:549-550, en toutes lettres : « on ajoute un cran, dérivé de
-- `p_kind`, que l'opérateur pourra desserrer seul le jour où il vendra les
-- salons sans la Vitrine ». Le cran ajouté ce jour-là reste et devient le
-- SEUL ; c'est la garde `vitrine` qui tombe.
--
--
-- ── CE QUI N'EST PAS PERDU ─────────────────────────────────
--
-- Le quota par organisation, le verrou d'avance, la fenêtre « habité ou
-- récent », l'invariant « l'hôte est membre de son lobby », l'indistinction
-- des refus : tout est repris CARACTÈRE POUR CARACTÈRE de 20261017120000,
-- garde exceptée. Un « nettoyage » de ces commentaires ferait revenir des
-- défauts déjà payés.
--
-- Ce que la Vitrine gardait vraiment — qu'on ne s'ouvre pas sur une adresse
-- que le commerçant n'a pas ouverte — est repris autrement : le droit du jeu
-- lui-même est la porte, et il vient d'un abonnement actif.
--
--
--     grep -rl "function public.create_player_lobby" supabase/migrations/*.sql
--
-- doit rendre TROIS fichiers après ce lot : 20261017120000 (l'origine),
-- 20261020120000 (le cran par produit) et celui-ci.
-- ════════════════════════════════════════════════════════════

create or replace function public.create_player_lobby(
  p_organization_id uuid,
  p_kind text,
  p_capacite integer,
  p_creator_token_hash text,
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacite integer;
  v_pseudo text;
  v_actifs integer;
  v_lobby public.player_lobbies%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le dit
  -- fort (motif `enter_reservation_queue`). Organisation PRÉSENTE MAIS SANS
  -- DROIT = refus métier muet, traité plus bas.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('duo', 'bande') then
    raise exception 'invalid lobby kind' using errcode = '22023';
  end if;

  -- LE PSEUDO EST REFUSÉ, PAS TRONQUÉ — et c'est l'inverse du choix fait pour
  -- la file d'attente. Raison : la personne en file est DEBOUT DANS LE MAGASIN
  -- et on ne lui fait pas payer un prénom de 41 caractères ; l'hôte d'un lobby
  -- est devant un clavier et peut corriger. Le `check` de la table dit la même
  -- chose, donc un refus ici est un refus lisible plutôt qu'une violation de
  -- contrainte remontée brute.
  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.char_length(v_pseudo) < 1
     or pg_catalog.char_length(v_pseudo) > 24 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;

  -- DUO NE NÉGOCIE PAS SA CAPACITÉ : le paramètre est ignoré, pas contesté. Le
  -- `check` de la table refuserait de toute façon un duo à trois, mais un refus
  -- de base n'est pas une réponse — et un Duo Miroir n'a jamais eu besoin qu'on
  -- lui demande combien il est.
  v_capacite := case when p_kind = 'duo' then 2 else p_capacite end;
  if v_capacite is null or v_capacite < 2 or v_capacite > 12 then
    raise exception 'invalid capacity' using errcode = '22023';
  end if;

  -- LE SEUL DROIT QUI COMPTE EST CELUI DU JEU (20261022120000).
  --
  -- Deux conditions ont disparu, et ce sont les deux qui attachaient les salons
  -- à la Vitrine : le droit `vitrine`, et l'existence d'une vitrine PUBLIÉE.
  -- Duo Miroir et Portrait de la Bande sont devenus des jeux du socle, présents
  -- dans les cinq offres ; les garder derrière la carte d'un restaurant les
  -- rendait « inclus » et injouables pour une boulangerie.
  --
  -- 20261020120000 avait écrit d'avance ce que ce lot fait : « on ajoute un
  -- cran, dérivé de `p_kind`, que l'opérateur pourra desserrer seul le jour où
  -- il vendra les salons sans la Vitrine ». Ce jour est arrivé ; c'est l'autre
  -- cran qui tombe, et celui-ci qui reste seul.
  --
  -- L'INDISTINCTION DES REFUS TIENT TOUJOURS PAR LA STRUCTURE : « organisation
  -- inconnue » et « pas le module du jeu » empruntent le même `return`, donc
  -- rendent le même document. Un appelant ne peut pas distinguer les deux, et
  -- ne peut donc pas sonder l'existence d'une organisation.
  --
  -- `case p_kind` EST TOTAL : `p_kind` est validé plus haut par
  -- `not in ('duo', 'bande')`, qui lève avant d'arriver ici. Le `else` n'est
  -- pas un défaut permissif, c'est la seule autre valeur possible.
  if not public.org_has_module_access(
       p_organization_id,
       case p_kind when 'duo' then 'duo' else 'bande' end) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE VERROU D'ABORD, LE COMPTAGE ENSUITE — motif `enter_reservation_queue` :
  -- le plafond est lu dans le MÊME instantané que la décision de l'appliquer.
  -- Sans lui, vingt appels simultanés liraient tous « 19 actifs » et ouvriraient
  -- tous leur lobby : le quota d'ADR-109 §A4 n'existerait que sur le papier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player_lobby:' || p_organization_id::text, 0)
  );

  -- « Actif » = ni clos, ni mort. L'expiration se CONSTATE ici aussi (ADR-111) :
  -- un lobby dépassé cesse de peser sur le quota sans qu'aucun cron l'ait
  -- touché, donc une panne de purge ne bloque jamais un commerce.
  --
  -- ET « HABITÉ OU RÉCENT » (revue L16) — une salle réelle se remplit en
  -- minutes ; vingt salles vides d'une rafale cessent de peser à la fenêtre
  -- écoulée — le quota reste la seule garde de refus (ADR-109 §A4 amendé ce
  -- jour, garde 1 observatoire) mais il n'est plus son propre levier de déni.
  --
  -- Les trois branches, et ce que chacune rattrape :
  --   · `locked`   — une partie a commencé, elle occupe la place quoi qu'il
  --                  arrive, et son hôte ne repassera plus par ici ;
  --   · `created_at` récent — la salle qu'on vient d'ouvrir n'a pas encore eu
  --                  le temps de se remplir ; la lui compter est le seul moyen
  --                  qu'une rafale simultanée ne passe pas entre les gouttes ;
  --   · deux membres — quelqu'un est entré, donc la salle est vivante, quel que
  --                  soit son âge.
  -- Ce qui tombe, c'est exactement le reste : la salle ouverte il y a plus de
  -- dix minutes où personne n'est jamais venu.
  select pg_catalog.count(*)::integer into v_actifs
    from public.player_lobbies l
   where l.organization_id = p_organization_id
     and l.status in ('lobby', 'locked')
     and l.expires_at > pg_catalog.now()
     and (
       l.status = 'locked'
       or l.created_at > pg_catalog.now() - interval '10 minutes'
       -- `exists … offset 1` : « au moins DEUX membres », et le seuil est dans
       -- l'`exists` lui-même. Une jointure agrégée (`group by … having
       -- count(*) >= 2`) lirait TOUS les membres de TOUTES les salles de
       -- l'organisation pour une question à laquelle deux lignes répondent ;
       -- ici le parcours s'arrête à la seconde. L'hôte étant membre de son
       -- propre lobby dès sa création, « deux » veut bien dire « quelqu'un
       -- d'autre est venu ».
       or exists (
         select 1
           from public.player_lobby_members m
          where m.lobby_id = l.id
          offset 1
       )
     );

  if v_actifs >= 20 then
    return pg_catalog.jsonb_build_object('state', 'quota');
  end if;

  insert into public.player_lobbies
    (organization_id, kind, capacite, creator_token_hash, expires_at)
  values
    (p_organization_id, p_kind, v_capacite, p_creator_token_hash,
     pg_catalog.now() + interval '30 minutes')
  returning * into v_lobby;

  -- L'HÔTE EST MEMBRE DE SON PROPRE LOBBY, et c'est un invariant du modèle : un
  -- lobby sans membre n'a pas de rang 1, `lock_player_lobby` compterait faux, et
  -- l'hôte ne se verrait pas dans sa propre salle.
  insert into public.player_lobby_members
    (lobby_id, organization_id, token_hash, pseudo)
  values (v_lobby.id, p_organization_id, p_creator_token_hash, v_pseudo);

  return pg_catalog.jsonb_build_object(
    'state', 'created',
    'lobby_id', v_lobby.id,
    'join_code', v_lobby.join_code,
    'expires_at', v_lobby.expires_at
  );
end;
$$;
