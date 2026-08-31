-- ============================================================
-- LE CLIENT DONNE UN NOM À SA CARTE (FID-8a)
--
-- ── CE QUI N'EXISTE PAS AUJOURD'HUI ──
--
-- `loyalty_members` ne porte AUCUNE colonne identifiante. Le client y est un
-- `token_hash` dérivé de son cookie (20260725120000 : « hash de jeton
-- uniquement, aucune donnée personnelle »), et la caisse identifie une CARTE,
-- jamais une personne. C'est un choix, pas un oubli — le même que
-- `hunt_players`, et que `players` (20260805140000, « aucune PII »).
--
-- Ce fichier le change, et il faut dire exactement dans quelles limites :
--
--   * à la SEULE initiative du client, depuis son passeport, sans compte ;
--   * le commerçant ne peut PAS renommer ses clients — il lit, il n'écrit pas ;
--   * rien n'est demandé, rien n'est obligatoire : `null` reste l'état normal
--     et c'est celui de tous les passeports déjà en production.
--
-- Ce n'est donc pas une collecte de données personnelles : c'est un LIBELLÉ que
-- le porteur choisit pour reconnaître sa propre carte. Il peut l'effacer, et
-- `purge_expired_loyalty_members` l'emporte avec la ligne, sans traitement
-- particulier à ajouter.
--
-- ── POURQUOI UNE CLÉ D'AVATAR, ET NON UN EMOJI ──
--
-- La demande dit « nom/surnom/logo ». Le logo importé est écarté d'emblée :
-- ce serait du stockage, une modération d'image et un lot à lui seul.
-- Restaient l'emoji et la clé d'avatar. Le dépôt a DÉJÀ tranché, trois fois :
--
--     contest_players.avatar  (20260719160748)
--     event_players.avatar    (20260727120000)
--     quiz_players.avatar     (20260803120000)
--
-- toutes trois `text not null default ''` avec le MÊME check
-- `avatar = '' or avatar ~ '^[a-z]{1,20}$'`, et le même commentaire : « clé
-- d'avatar du catalogue applicatif ». Le catalogue est `src/lib/avatars.tsx`
-- — 42 figures SVG dessinées à la DA du produit (12 animaux, 30 drapeaux),
-- avec `coerceAvatarId` et `DEFAULT_AVATAR`. Reprendre cette colonne, c'est
-- hériter du catalogue, du rendu et des schémas zod déjà écrits.
--
-- L'emoji aurait coûté les deux pièges que 20261113120000 (`lot_emoji`)
-- documente : `char_length` y est traître (un VS16 compte 2, un drapeau
-- régional 2, une famille ZWJ jusqu'à 7 — une borne de longueur ne veut plus
-- rien dire), et un `U+FE0F` invisible dans un nom accessible a déjà coûté une
-- session de Playwright à ce dépôt. `src/lib/emoji-lexique.ts` ne convenait pas
-- davantage : c'est un lexique mot → emoji pour les LOTS (vin, bière), il
-- n'exporte aucune liste plate, et une « figure » tirée de là serait une pinte,
-- pas un visage.
--
-- ── LA VALIDATION DU SURNOM EST DÉJÀ ÉCRITE — ON NE LA RÉÉCRIT PAS ──
--
-- 20260805190000 a posé `public.player_alias_is_allowed(text)` et son
-- formateur `public.format_player_alias(text)` : borne 1..24, refus des
-- caractères de contrôle, refus des quinze codets bidi et de largeur nulle
-- (8203, 8206, 8238, 65279…) utilisés pour usurper visuellement un pseudo, et
-- une liste courte de mots bloqués. Ces fonctions ont leur jumeau TypeScript
-- exact dans `src/lib/player-alias.ts` (`isAllowedPlayerAlias`,
-- `formatPlayerAlias`) — les deux moitiés d'un même contrat.
--
-- Forker une seconde liste ici, c'est garantir qu'elles divergeront. La RPC
-- ci-dessous les APPELLE. C'est aussi pourquoi la borne est 24 et pas 30 ou 60 :
-- 24 est la valeur de `event_players.pseudo`, `player_lobby_members.pseudo` et
-- `player_aliases.display_alias` — la seule doublée côté base.
--
-- ── LES DROITS : CETTE TABLE N'EST PAS COLONNE PAR COLONNE ──
--
-- Point important, et contraire à l'intuition qu'on a en arrivant du reste du
-- module. `loyalty_programs` accorde COLONNE PAR COLONNE (le secret du code
-- tournant ne doit jamais sortir), et `reservations` aussi (l'email du joueur).
-- `loyalty_members`, NON : 20260725120000:305 accorde `select` DE TABLE à
-- `authenticated`, et `select, insert, update, delete` DE TABLE à
-- `service_role`.
--
-- Un privilège de table couvre les colonnes ajoutées ensuite. `display_name` et
-- `avatar` sont donc lisibles par la session marchande SANS `grant` ici — et
-- c'est très exactement ce que 20261114120000 a constaté pour `points_balance`,
-- en écrivant : « la garde le VÉRIFIE quand même : c'est une propriété de
-- Postgres, pas une intention écrite dans ce fichier, et elle doit rester
-- vraie ». On reprend ce raisonnement mot pour mot.
--
-- Ajouter malgré tout un `grant select (display_name, avatar)` redondant serait
-- pire qu'inutile : il ferait croire au prochain lecteur que cette table est
-- sous régime de colonnes, et l'inviterait à convertir le grant de table en
-- liste nominative — geste qui rendrait invisibles, d'un coup, les neuf
-- colonnes qu'il oublierait.
--
-- Ce que ce fichier n'accorde donc PAS, délibérément :
--
--   * Aucun `update` à `authenticated`. La table ne lui donne que `select`, et
--     c'est l'invariant central de ce lot : le surnom appartient au CLIENT. Un
--     commerçant qui pourrait renommer ses clients transformerait un libellé
--     choisi en fiche client subie. La garde le vérifie NÉGATIVEMENT.
--   * Rien à `anon`. Le passeport public est servi par le service role
--     (`src/lib/loyalty-context.ts`, `createAdminClient`) — jamais en direct.
--   * Aucune policy nouvelle. `loyalty_members: member select` borne déjà la
--     lecture au tenant. Le grant dit quelles COLONNES, la policy quelles
--     LIGNES ; seule la première était en question, et elle était déjà couverte.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Les deux colonnes
--
-- `display_name` est NULLABLE : `null` = « le client n'a rien choisi », donc
-- la carte s'affiche comme aujourd'hui. C'est l'état de 100 % des passeports
-- au moment où ce fichier s'applique, et il doit le rester sans réécriture.
--
-- `avatar` est `not null default ''` — copie exacte des trois tables sœurs.
-- La chaîne vide y est le « pas de figure », et le `default` évite d'avoir à
-- distinguer null et '' dans chaque lecture.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_members
  add column if not exists display_name text;

alter table public.loyalty_members
  add column if not exists avatar text not null default '';


-- ────────────────────────────────────────────────────────────
-- 2. Les bornes, EN BASE
--
-- Le formulaire n'est pas une frontière : ce texte est écrit par un anonyme,
-- via une RPC, et s'affiche À LA CAISSE d'un commerçant. La base doit tenir
-- seule.
--
-- Les deux contraintes se valident instantanément : les colonnes viennent
-- d'être créées, donc toutes les lignes existantes valent `null` et `''`. Pas
-- de `not valid` / `validate constraint` en deux temps ici — ce détour de
-- 00023_pronostics_hardening ne sert qu'à contourner des données déjà en place.
--
-- `display_name = btrim(display_name)` mérite un mot : sans lui, un surnom de
-- 24 caractères suivi de mille espaces passerait la borne (btrim est appliqué
-- AVANT le comptage) et rendrait une ligne de caisse démesurée. Exiger que la
-- valeur STOCKÉE soit déjà rognée rend l'invariant lisible d'un coup d'œil :
-- ce qui est en base est ce qui s'affiche. Le repli des espaces INTERNES, lui,
-- reste le travail de `format_player_alias`, appelé par la RPC.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_members
  drop constraint if exists loyalty_members_display_name_check;

alter table public.loyalty_members
  add constraint loyalty_members_display_name_check
    check (
      display_name is null
      or (
        display_name = pg_catalog.btrim(display_name)
        and pg_catalog.char_length(display_name) between 1 and 24
      )
    );

alter table public.loyalty_members
  drop constraint if exists loyalty_members_avatar_format_check;

alter table public.loyalty_members
  add constraint loyalty_members_avatar_format_check
    check (avatar = '' or avatar ~ '^[a-z]{1,20}$');


comment on column public.loyalty_members.display_name is
  'SURNOM que le CLIENT donne à sa propre carte (FID-8a) — jamais demandé, '
  'jamais obligatoire, effaçable par lui. null = aucun choix, et c''est l''état '
  'normal. Écrit UNIQUEMENT par set_loyalty_member_identity (security definer, '
  'service_role) : la session marchande n''a que `select` sur cette table, un '
  'commerçant ne renomme donc pas ses clients. Borné 1..24 et déjà rogné en '
  'base ; le contenu est filtré par player_alias_is_allowed (contrôle, bidi, '
  'largeur nulle, mots bloqués), jumeau SQL de src/lib/player-alias.ts.';

comment on column public.loyalty_members.avatar is
  'FIGURE choisie par le client — clé courte du catalogue applicatif '
  '(src/lib/avatars.tsx, AVATAR_IDS), pas une image ni un emoji. Même colonne '
  'et même check que contest_players.avatar, event_players.avatar et '
  'quiz_players.avatar. La chaîne vide = aucune figure. La base ne valide que '
  'la FORME : graver le catalogue ici invaliderait des lignes déjà écrites au '
  'premier retrait de figure — c''est le zod applicatif qui refuse une clé '
  'inconnue.';


-- ────────────────────────────────────────────────────────────
-- 3. `set_loyalty_member_identity` — la seule voie d'écriture
--
-- Le client est ANONYME : il n'a pas de session Supabase, seulement un cookie
-- dont le hash désigne sa ligne. C'est exactement la situation de
-- `spend_loyalty_points` (20261114120000) et on reprend son chemin —
-- `security definer`, réservée à `service_role`, prenant un
-- `p_member_token_hash` — plutôt qu'un droit `update` direct, qui aurait dû
-- être donné à `anon` ou à `authenticated` et aurait ouvert la colonne à tout
-- le monde en même temps qu'à son propriétaire.
--
-- ── UN MEMBRE INCONNU EST REFUSÉ SANS RIEN DIRE ──
--
-- Trois causes distinctes — programme inexistant, addon fidélité coupé, hash
-- inconnu — rendent le MÊME `not_a_member`. C'est délibéré : distinguer
-- « ce programme n'existe pas » de « ce jeton n'est pas le bon » ferait de
-- cette RPC un oracle d'existence, interrogeable en boucle.
--
-- L'écart avec `spend_loyalty_points`, qui rend `inactive` quand le programme
-- ne répond pas, est assumé : là-bas l'état est une information légitime pour
-- le joueur (« pourquoi mon échange échoue »), ici la carte est déjà résolue
-- avant l'appel et l'écran n'a rien à expliquer.
--
-- Noter aussi que `status <> 'active'` n'est PAS un refus : un programme mis en
-- pause continue d'afficher sa carte au client, et corriger une faute de frappe
-- dans son propre surnom reste anodin. Seul `addon_loyalty` ferme la porte,
-- parce qu'il ferme déjà tout le module.
--
-- ── IDEMPOTENTE, ET SANS `request_id` ──
--
-- `spend_loyalty_points` en exige un : il DÉBITE, et un rejeu doublerait la
-- dépense. Ici l'écriture est une AFFECTATION, pas un incrément — poser deux
-- fois le même surnom donne le même état et la même réponse. L'idempotence est
-- intrinsèque ; ajouter un identifiant d'intention n'aurait rien protégé et
-- aurait donné un paramètre de plus à mal remplir.
--
-- Le `for update` reste, lui, nécessaire : deux enregistrements simultanés
-- doivent se sérialiser, pas s'entrelacer.
--
-- ── LES DEUX CHAMPS SONT TOUJOURS ÉCRITS ENSEMBLE ──
--
-- `p_display_name => null` EFFACE le surnom, il ne veut pas dire « ne touche
-- pas ». C'est un formulaire, un enregistrement : la sémantique « null =
-- inchangé » est la source de bugs classique de ce genre de RPC, et l'appelant
-- envoie de toute façon l'état complet de l'écran.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_loyalty_member_identity(
  p_program_id uuid,
  p_member_token_hash text,
  p_display_name text,
  p_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.loyalty_members%rowtype;
  v_display text;
  v_avatar text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Le surnom : rogné et espaces internes repliés par le formateur partagé.
  -- Vide (ou blanc) = effacement explicite, pas un rejet.
  v_display := public.format_player_alias(coalesce(p_display_name, ''));
  if v_display = '' then
    v_display := null;
  elsif not public.player_alias_is_allowed(v_display) then
    return pg_catalog.jsonb_build_object('state', 'rejected_name');
  end if;

  -- La figure : la BASE ne valide que la forme de la clé, jamais son
  -- appartenance au catalogue (voir le commentaire de colonne).
  v_avatar := pg_catalog.btrim(coalesce(p_avatar, ''));
  if v_avatar <> '' and v_avatar !~ '^[a-z]{1,20}$' then
    return pg_catalog.jsonb_build_object('state', 'rejected_avatar');
  end if;

  -- Membre du programme demandé, addon actif, SOUS VERROU.
  select m.* into v_member
    from public.loyalty_members m
    join public.loyalty_programs p on p.id = m.program_id
    join public.organizations o on o.id = p.organization_id
   where m.program_id = p_program_id
     and m.token_hash = p_member_token_hash
     and o.addon_loyalty
   for update of m;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_a_member');
  end if;

  update public.loyalty_members
     set display_name = v_display,
         avatar = v_avatar
   where id = v_member.id;

  return pg_catalog.jsonb_build_object(
    'state', 'saved',
    'display_name', v_display,
    'avatar', v_avatar
  );
end;
$$;

comment on function public.set_loyalty_member_identity(uuid, text, text, text) is
  'Le CLIENT nomme sa propre carte (FID-8a). security definer, service_role '
  'seul : le porteur est anonyme, il ne prouve que le hash de son cookie. '
  'Idempotente par nature (affectation, non incrément) — ni request_id ni '
  'double effet. Les deux champs sont écrits ENSEMBLE ; un surnom vide ou '
  'blanc EFFACE. États : saved | rejected_name | rejected_avatar | '
  'not_a_member — ce dernier couvre indistinctement programme inconnu, addon '
  'coupé et jeton inconnu, pour ne pas servir d''oracle d''existence.';


-- ────────────────────────────────────────────────────────────
-- 4. L'ACL de la fonction
--
-- Une fonction VIENT D'ÊTRE CRÉÉE avec EXECUTE à PUBLIC. Ces deux instructions
-- sont la SEULE chose qui referme la porte : sans elles, `anon` renommerait la
-- carte de n'importe quel passeport dont il connaîtrait le hash de jeton.
-- ────────────────────────────────────────────────────────────

revoke all on function public.set_loyalty_member_identity(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_loyalty_member_identity(uuid, text, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 5. GARDE — échouer ICI plutôt qu'en production
--
-- Un `grant` sans effet et un `revoke` mal ciblé ne lèvent PAS : ils passent,
-- la migration est marquée appliquée, et la panne n'apparaît qu'au premier
-- écran ouvert. Ce défaut est apparu cinq fois cette session sur ce module.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  -- 5a. CE QUE LA CAISSE DOIT POUVOIR LIRE.
  --
  -- Le grant DE TABLE de 20260725120000:305 est censé couvrir toute colonne
  -- future. On le vérifie plutôt que de le supposer : c'est de lui seul que
  -- dépend l'affichage du surnom à la caisse, et PostgREST refuse le `select`
  -- ENTIER dès qu'une colonne de la liste manque — la fiche client ne se
  -- dégraderait pas, elle DISPARAÎTRAIT.
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'display_name', 'SELECT')
     or not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'avatar', 'SELECT')
  then
    raise exception
      'loyalty_members : le surnom ou la figure n est pas lisible par authenticated — le grant de table a ete remplace par une liste de colonnes, et la fiche client disparaitrait de la caisse';
  end if;

  -- 5b. La RPC écrit sous service_role : sans ce droit elle échouerait à
  -- l execution, une fois en production, et pas ici.
  if not pg_catalog.has_column_privilege(
       'service_role', 'public.loyalty_members', 'display_name', 'UPDATE')
     or not pg_catalog.has_column_privilege(
       'service_role', 'public.loyalty_members', 'avatar', 'UPDATE')
  then
    raise exception
      'service_role ne peut pas ecrire l identite du membre : set_loyalty_member_identity echouerait a l execution';
  end if;

  -- 5c. CONTRÔLE NÉGATIF CENTRAL — le commerçant ne renomme pas ses clients.
  --
  -- C est l invariant de tout ce lot. `loyalty_members` n a qu un `grant
  -- select` pour `authenticated` ; cette garde est la pour que ca reste vrai
  -- apres le prochain fichier.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'display_name', 'UPDATE')
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_members', 'avatar', 'UPDATE')
  then
    raise exception
      'loyalty_members : le surnom est devenu modifiable depuis une session marchande — un libelle choisi par le client deviendrait une fiche client subie';
  end if;

  -- 5d. `anon` n a jamais rien eu sur cette table et ne gagne rien ici.
  if pg_catalog.has_column_privilege(
       'anon', 'public.loyalty_members', 'display_name', 'SELECT')
     or pg_catalog.has_column_privilege(
       'anon', 'public.loyalty_members', 'display_name', 'UPDATE')
  then
    raise exception
      'loyalty_members.display_name est devenu accessible a anon : le passeport n expose rien en direct, tout passe par le service role';
  end if;

  -- 5e. L ACL de la RPC. C est elle qui remplace le droit d update direct :
  -- executable par anon, elle rendrait la colonne modifiable par tout le monde.
  if pg_catalog.has_function_privilege(
       'anon', 'public.set_loyalty_member_identity(uuid, text, text, text)', 'EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.set_loyalty_member_identity(uuid, text, text, text)', 'EXECUTE')
  then
    raise exception
      'set_loyalty_member_identity est executable par anon ou authenticated : n importe qui renommerait la carte d un passeport dont il connait le hash';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role', 'public.set_loyalty_member_identity(uuid, text, text, text)', 'EXECUTE')
  then
    raise exception
      'set_loyalty_member_identity n est pas executable par service_role : le client ne pourrait jamais nommer sa carte';
  end if;

  -- 5f. Le secret du code tournant reste hors de portee. Il n a rien a voir
  -- avec ce lot, et c est pourquoi il est verifie ici : ce fichier touche aux
  -- droits du module fidelite, et une liste de grants se manipule mal.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT')
  then
    raise exception
      'loyalty_programs.rotating_secret est devenu lisible par authenticated : les codes de validation du comptoir seraient falsifiables';
  end if;
end
$migration$;
