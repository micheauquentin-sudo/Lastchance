-- ============================================================
-- LES SALONS PORTENT LES COULEURS DU COMMERCE (SALON-1)
--
-- Duo Miroir (L17) et Portrait de la Bande (L18) sont vendus depuis DUO-2
-- comme deux animations autonomes à 12 €/mois. Ce sont les SEULES dont
-- l'écran joueur n'a aucun habillage : ni palette, ni fond d'écran, ni nom,
-- ni logo. Le propriétaire demande qu'on puisse « les personnaliser comme
-- les autres animations et jeux disponibles ».
--
-- ════════════════════════════════════════════════════════════
-- CE QUE LA NEUTRALITÉ D'AUJOURD'HUI PROTÈGE — ET CE QU'ELLE NE PROTÈGE PAS
-- ════════════════════════════════════════════════════════════
--
-- L'absence d'habillage est ÉCRITE, à deux endroits, et les deux motifs sont
-- différents. Les confondre aurait produit soit un lot inutile, soit une
-- fuite. Ils sont donc traités séparément.
--
-- ── 1. `lobby-shell.tsx` — un motif de PRODUIT, celui que ce lot lève ──
--
--   « Ces pages s'ouvrent depuis la vitrine (L17/L18) : le joueur y arrive
--     sans savoir qu'un espace commerçant existe, et souvent sans avoir
--     choisi le commerce lui-même. Aucun chrome de dashboard, aucun nom
--     d'organisation, aucun thème saisonnier. »
--
-- C'est un arbitrage d'apparence, pas une garde. Il dit qu'on n'IMPOSE pas
-- l'identité d'un commerce à quelqu'un qui ne l'a pas choisi — et le
-- propriétaire, qui est l'autorité produit, demande aujourd'hui de pouvoir
-- l'afficher. Ce lot ne le lève pourtant pas d'office : `affiche_identite`
-- (§1) en fait un CHOIX du commerçant, et son défaut reste de se nommer.
--
-- La seconde moitié du commentaire, elle, est une CONTRAINTE MESURÉE et elle
-- tient :
--
--   « Aucune teinte inédite n'est introduite ici : elle exigerait un relevé
--     qui n'existerait pas. »
--
-- D'où le `check` de `theme` sur les ONZE clés de la palette partagée
-- (20260917120000, élargie par 20260921120000) et sur elles seules : chacune
-- a son lavis relevé en contraste dans `LAVIS_SAISON` (`theme-lavis.ts`,
-- pire cas 7,0:1 contre un seuil AA de 4,5:1). Une douzième clé propre aux
-- salons aurait demandé un relevé qui n'existe pas — exactement ce que le
-- commentaire refuse.
--
-- ── 2. `lobby/nouveau/[slug]/page.tsx` — un motif de CONFIDENTIALITÉ ──
--
--   « La page ne consulte NI le commerce, NI ses droits : `create_player_lobby`
--     confond déjà "organisation inconnue" et "organisation sans le module
--     vitrine" sous un seul `unavailable`, précisément pour ne pas renseigner
--     un appelant public sur le carnet de commandes d'en face. »
--
-- CELUI-LÀ NE SE LÈVE PAS, et c'est lui qui dicte le chemin de lecture. Un
-- habillage lisible PAR LE SLUG rétablirait l'oracle mot pour mot : « ce slug
-- rend des couleurs » vaut « cette organisation existe et a payé le module ».
-- Trois conséquences, toutes tenues par ce fichier :
--
--   a. AUCUN accès direct à `lobby_settings` pour `anon`. La table n'est
--      lisible que par un membre de l'organisation (RLS) et par
--      `service_role`. Le joueur ne la touche jamais.
--   b. L'habillage transite par `lobby_state` (§3), qui EXIGE DÉJÀ
--      L'APPARTENANCE et rend le même `unavailable` muet à un lobby inconnu
--      et à un jeton non membre. On n'apprend donc les couleurs qu'une fois
--      DANS la salle — c'est-à-dire après avoir eu le code de quelqu'un qui y
--      était. Aucun oracle nouveau : l'appartenance était déjà la clé.
--   c. `create_player_lobby`, `join_player_lobby` et `resoudreLobbyParCode`
--      ne sont pas touchés. Les écrans de REFUS INDISTINCT de
--      `/lobby/[code]` — code inventé, expiré, clos, ou salle finie qu'on
--      n'a pas jouée — n'ont donc rien de neuf à peindre : ils n'appellent
--      pas `lobby_state`. Un scanneur de codes à six caractères ne peut pas
--      distinguer un commerce habillé d'un code mort.
--
-- ── Ce qui n'est de toute façon pas un secret ──
--
-- `nom` et `logo_url` sont DÉJÀ publiés par `vitrine_public_state`
-- (20261018120000) sur la vitrine d'où ces salons s'ouvrent. Les rendre à un
-- membre du salon ne révèle rien qu'un visiteur de la vitrine ne lise déjà ;
-- le secret protégé ici est le LIEN slug → organisation servie, pas
-- l'identité du commerce.
--
-- ════════════════════════════════════════════════════════════
-- OÙ VIVENT CES RÉGLAGES, ET POURQUOI PAS DANS LES DEUX TABLES QUI EXISTENT
-- ════════════════════════════════════════════════════════════
--
-- `duo_settings` (20261018120000) et `bande_settings` (20261019120000)
-- existent, toutes deux clés par `organization_id`. Y poser `theme` et
-- `fond_key` était le geste le plus court. Il est écarté pour trois raisons,
-- dans l'ordre de leur poids :
--
--   1. LE SALON N'APPARTIENT À AUCUN MODULE, et c'est `lobby-shell.tsx` qui
--      le dit : « le salon n'appartient à aucun module, il précède le jeu
--      qu'on y jouera ». Le cadre habillé est le SOCLE (L16), rendu par une
--      seule coquille pour les deux jeux. Ranger son habillage dans les
--      tables des modules aurait obligé `lobby_state` — qui est du socle et
--      ne connaît que `kind` — à brancher sur le module pour peindre un
--      décor qui le PRÉCÈDE.
--
--   2. DEUX `check` À TENIR D'ACCORD SONT UN DÉFAUT, PAS UNE DUPLICATION
--      ANODINE. 20260921120000 le nomme : « une divergence entre les deux
--      check est LE défaut que ce chantier peut produire ». Il l'a payé sur
--      `contests` / `calendars`, où le test pgTAP énumère depuis les onze
--      clés table par table. Un seul domaine, une seule ligne à relire.
--
--   3. LA LIGNE SERAIT NÉE DU MAUVAIS GESTE. `duo_settings` naît de
--      `set_duo_suggestion`, `bande_settings` de `set_bande_pack` : un
--      commerçant qui ne veut QUE choisir ses couleurs aurait dû traverser
--      une suggestion ou un pack pour matérialiser sa ligne.
--
-- Et une quatrième, qui n'est pas une raison d'architecture mais un fait :
-- le commerce a UNE identité. « Porter les couleurs du commerce » se règle
-- une fois et vaut pour ses deux salons — un commerçant qui achète le Duo
-- puis la Bande n'a pas à réhabiller la seconde.
--
-- SI LA DIVERGENCE PAR JEU DEVENAIT UN BESOIN, elle s'ajoute sans casse :
-- `kind` entre dans la clé primaire, la ligne sans `kind` restant le défaut.
-- Le chemin de lecture de §3 n'aurait pas à changer. On ne la pose pas
-- aujourd'hui parce que personne ne l'a demandée, et qu'une clé composite
-- « au cas où » se paie en jointures dès la première lecture.
--
-- LE RATTACHEMENT À `organizations` a été écarté pour la raison de L14, celle
-- qui a déjà sorti la suggestion et le pack de `vitrine_settings` : une table
-- séparée porte son propre `updated_at`, qui ne date que lui-même.
--
-- ════════════════════════════════════════════════════════════
-- LE PIÈGE DES DROITS, ET POURQUOI IL NE SE POSE PAS ICI
-- ════════════════════════════════════════════════════════════
--
-- Une colonne neuve ajoutée à une table sous régime PAR COLONNE n'hérite
-- d'aucun privilège, et PostgREST refuse alors le `select` ENTIER : l'écran
-- disparaît au lieu de se dégrader. C'est le défaut de 20261112130000, et il
-- est la raison de la garde de §4 de 20261116120000.
--
-- CE FICHIER N'AJOUTE DE COLONNE À AUCUNE TABLE EXISTANTE. Le régime constaté
-- avant d'écrire, pour mémoire :
--
--   `duo_settings`   — select DE TABLE, update PAR COLONNE (`suggestion_item_id`)
--   `bande_settings` — select DE TABLE, AUCUN update (retiré à la revue L18)
--   `player_lobbies` — RLS sans policy, zéro privilège applicatif
--
-- `duo_settings` est donc bien sous régime par colonne EN ÉCRITURE : y poser
-- `theme` sans réémettre le `grant update` aurait donné une colonne muette.
-- Le piège est évité PAR CONSTRUCTION plutôt que par vigilance, ce qui vaut
-- mieux — une table neuve choisit son régime au lieu d'hériter d'un autre.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. GARDE DE FILIATION
--
-- §3 réécrit `lobby_state` par un `create or replace` qui RECOPIE son corps.
-- Recopier un corps qu'on n'a pas relu efface les corrections posées
-- entre-temps (motif 20261126120000 §0 et 20261128120000 §0). `lobby_state`
-- n'a aujourd'hui qu'une seule définition — 20261017120000 — mais une garde
-- qui s'appuie sur ce fait le VÉRIFIE dans le catalogue plutôt que dans le
-- dossier des migrations : c'est la définition VIVANTE qu'on remplace.
--
-- ON VÉRIFIE LES MARQUEURS À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON AJOUTE.
-- Une garde écrite à l'envers ferait échouer le premier `supabase db reset`
-- venu. La seule mention du NEUF est le test d'idempotence, qui SORT sans
-- bruit au lieu de lever (motif 20261026120000).
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'lobby_state';

  if pg_catalog.strpos(v_def, '''habillage''') > 0 then
    -- Déjà appliquée : on sort sans bruit.
    return;
  end if;

  -- L'APPARTENANCE, qui est la garde de confidentialité sur laquelle repose
  -- tout ce fichier. Si elle a disparu, faire transiter l'habillage par cette
  -- fonction rendrait les couleurs d'un commerce à un identifiant volé.
  if pg_catalog.strpos(v_def, 'm.token_hash = p_token_hash') = 0 then
    raise exception
      'public.lobby_state n exige plus l appartenance : sa forme vivante a change depuis 20261017120000, et y faire transiter l habillage ouvrirait a un identifiant de lobby vole ce que ce fichier borne aux membres.';
  end if;

  -- LE CODE DE PARTAGE NE SORT QUE POUR L'HÔTE. Le `return` recopié plus bas
  -- reprend cette expression mot pour mot ; si elle a changé, la recopie
  -- rétablirait une règle périmée.
  if pg_catalog.strpos(
       v_def, 'case when v_est_hote then v_lobby.join_code else null end') = 0 then
    raise exception
      'public.lobby_state ne reserve plus join_code a l hote sous sa forme connue : le document recopie par §3 retablirait une regle de partage qui n est plus celle du depot.';
  end if;

  -- L'EXPIRATION SE CONSTATE (ADR-111) et ne s'écrit pas. Même motif : c'est
  -- une des lignes que §3 recopie.
  if pg_catalog.strpos(v_def, 'v_statut := case') = 0
     or pg_catalog.strpos(v_def, '''expired''') = 0 then
    raise exception
      'public.lobby_state a perdu le calcul d expiration a la lecture : sa forme vivante n est pas celle que ce fichier recopie.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 1. `lobby_settings` — L'HABILLAGE DU SALON, UNE LIGNE PAR COMMERCE
--
-- ── L'ABSENCE DE LIGNE EST LE COMPORTEMENT D'HIER ──
--
-- Aucune reprise de données, aucune ligne semée : un commerce qui n'a rien
-- réglé n'a pas de ligne, `lobby_state` rend `habillage: null`, et la
-- coquille peint le lavis `neutre` exactement comme aujourd'hui. C'est la
-- non-régression, et elle est STRUCTURELLE plutôt que testée — le test la
-- constate quand même (`socle_lobby.test.sql`), parce qu'une propriété qui
-- ne tient qu'au raisonnement se perd au premier patch.
-- ────────────────────────────────────────────────────────────

create table if not exists public.lobby_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,

  -- LES ONZE CLÉS DE LA PALETTE PARTAGÉE, et pas une de plus. Même domaine
  -- que `contests.theme` et `calendars.theme` (20260917120000 /
  -- 20260921120000) : chacune a son lavis MESURÉ dans LAVIS_SAISON, ce qui
  -- est la condition posée par `lobby-shell.tsx` pour qu'une teinte entre sur
  -- ces écrans. `neutre` est le défaut, donc la valeur d'un commerce qui n'a
  -- rien choisi reste le crème du site.
  --
  -- La palette du QUIZ (`quizzes_theme_check`) est délibérément écartée : ses
  -- clés nomment un USAGE MÉTIER (gourmand, dégustation…) et non un décor.
  -- C'est l'arbitrage de 20260921120000 §2, repris tel quel.
  theme text not null default 'neutre'
    constraint lobby_settings_theme_check
    check (theme in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                     'soldes', 'festival', 'prairie', 'musique', 'football',
                     'restaurant', 'espace')),

  -- LE CATALOGUE DES FONDS N'EST PAS GRAVÉ ICI, et c'est un écart ASSUMÉ avec
  -- `calendars.fond_key` (20261102120000), qui recopie les dix clés dans un
  -- `check`. La leçon plus récente est celle de 20261116120000 : une
  -- contrainte de CONTENU invalide des lignes DÉJÀ ÉCRITES au premier fond
  -- retiré du catalogue — la migration de retrait échouerait sur des données
  -- que personne n'a fautées. Le `check` ne porte donc que sur la FORME ; le
  -- CONTENU est validé par le schéma zod côté application, à l'écriture comme
  -- à la lecture (motif `wheelStyleSchema` / `wheelStyleWriteSchema` : on
  -- replie une clé inconnue à la lecture, on la refuse à l'écriture).
  --
  -- La forme suffit à la seule chose que la base doit garantir : que la
  -- valeur ne puisse pas transporter autre chose qu'une clé — elle finit dans
  -- le `src` d'une balise servie à un joueur.
  --
  -- TROIS ÉTATS, et le `null` est le plus important (motif 20261102120000) :
  --   null    → suivre le thème. C'est le défaut, donc le comportement d'hier.
  --   'aucun' → aucune image, le lavis du thème seul. Un CHOIX, que `null`
  --             ne sait pas dire.
  --   <clé>   → une illustration de `public/fonds/` (cf. FOND_KEYS).
  fond_key text
    constraint lobby_settings_fond_key_forme_check
    check (fond_key is null or fond_key ~ '^[a-z][a-z0-9_]{0,31}$'),

  -- LE NOM ET LE LOGO SE TAISENT SUR DEMANDE, et c'est ce qui respecte le
  -- motif produit de `lobby-shell.tsx` au lieu de l'écraser. Un commerce peut
  -- vouloir ses couleurs sans se nommer devant des gens qui ne l'ont pas
  -- choisi — le commentaire de la coquille décrit exactement ce cas. Le
  -- défaut est `true` : c'est ce que le propriétaire demande, et un commerçant
  -- qui ouvre l'éditeur pour habiller son salon veut d'abord qu'on sache chez
  -- qui l'on est.
  --
  -- Cette colonne ne cache RIEN QUI NE SOIT DÉJÀ PUBLIC (voir l'en-tête) :
  -- c'est un réglage d'apparence, pas une garde de confidentialité, et le
  -- commentaire de colonne le dit pour que personne ne s'y appuie comme sur
  -- une garde.
  affiche_identite boolean not null default true,

  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.lobby_settings is
  'HABILLAGE DES SALONS d''un commerce (SALON-1) : la palette, le fond '
  'd''écran et l''affichage de l''identité, pour Duo Miroir (L17) ET Portrait '
  'de la Bande (L18) à la fois. UNE ligne par organisation, pas une par jeu : '
  'le cadre habillé est celui du SOCLE (L16), rendu par une seule coquille '
  'qui PRÉCÈDE le jeu — « le salon n''appartient à aucun module » '
  '(lobby-shell.tsx). Deux colonnes dupliquées sur duo_settings et '
  'bande_settings auraient posé deux check à tenir d''accord, qui est LE '
  'défaut nommé par 20260921120000. Table SÉPARÉE de vitrine_settings, leçon '
  'L14 : son updated_at date la péremption des traductions. '
  'L''ABSENCE DE LIGNE EST LE COMPORTEMENT HISTORIQUE — lobby_state rend '
  'habillage: null et la coquille peint le lavis neutre. Aucune reprise de '
  'données. Lue publiquement PAR lobby_state SEULEMENT, qui exige déjà '
  'l''appartenance : un accès direct par le slug rétablirait l''oracle que '
  'create_player_lobby ferme (organisation inconnue et organisation sans le '
  'module rendent le même unavailable).';

comment on column public.lobby_settings.theme is
  'Habillage saisonnier ou d''univers (défaut « neutre »). MÊME palette que '
  'contests.theme et calendars.theme — toute clé ajoutée là-bas doit l''être '
  'ici, et réciproquement. Le domaine est borné aux onze clés PARCE QUE '
  'chacune a son lavis relevé en contraste dans LAVIS_SAISON '
  '(src/components/ui/theme-lavis.ts) : lobby-shell.tsx refuse une teinte '
  'inédite, qui « exigerait un relevé qui n''existerait pas ». À ne pas '
  'confondre avec quizzes.theme, qui nomme un usage métier.';

comment on column public.lobby_settings.fond_key is
  'Fond d''écran plein cadre des écrans de salon. null : suivre le thème '
  '(défaut, comportement historique). ''aucun'' : aucune image, lavis du thème '
  'seul. Sinon, une clé de FOND_KEYS (src/lib/fonds-ecran.ts). Le check ne '
  'porte QUE SUR LA FORME, délibérément et contrairement à calendars.fond_key '
  ': graver le catalogue invaliderait des lignes déjà écrites au premier fond '
  'retiré (leçon 20261116120000). Le contenu est validé par zod côté '
  'application — replié à la lecture, refusé à l''écriture.';

comment on column public.lobby_settings.affiche_identite is
  'Le nom et le logo du commerce apparaissent-ils sur les écrans de salon ? '
  'RÉGLAGE D''APPARENCE, PAS UNE GARDE : nom et logo_url sont déjà publiés '
  'par vitrine_public_state sur la vitrine d''où ces salons s''ouvrent, donc '
  'les taire ici ne protège aucun secret. Le réglage existe parce que '
  'lobby-shell.tsx a arbitré qu''on n''impose pas l''identité d''un commerce à '
  'qui ne l''a pas choisi ; il rend cet arbitrage disponible au commerçant '
  'plutôt que de l''écraser. Défaut true.';

alter table public.lobby_settings enable row level security;

-- Ceinture et bretelles, motif `bande_settings` : depuis 20260930120000 les
-- privilèges par défaut ne servent plus `authenticated` (00021 avait fait de
-- même pour `anon`), donc la table naît déjà nue. Le `revoke` explicite reste
-- écrit parce qu'une garde qui dépend d'une migration d'il y a deux mois est
-- une garde qu'on ne relit pas (leçon SEC-4).
revoke all on table public.lobby_settings from public, anon, authenticated;

-- Motif `duo_settings` / `bande_settings` : la lecture va à TOUS les membres,
-- l'écriture aux seuls éditeurs. Le caissier a une raison de savoir de quelle
-- couleur est le salon quand un client lui pose la question ; il n'a aucune
-- raison d'en changer entre deux cafés.
--
-- LA POLICY D'ÉCRITURE NE COMMANDE RIEN AUJOURD'HUI, ET ELLE EST ÉCRITE.
-- `authenticated` n'a aucun privilège d'écriture à filtrer (voir plus bas) :
-- elle est le SECOND verrou, celui qui tiendrait le jour où un grant
-- reviendrait par inadvertance. C'est mot pour mot l'argument de
-- `bande_settings`, et il vaut d'autant plus ici que la table naît sans grant
-- d'écriture — donc sans rien pour rappeler au lecteur suivant que le sujet a
-- été tranché.
create policy "lobby_settings: member select" on public.lobby_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "lobby_settings: editor write" on public.lobby_settings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- `authenticated` NE FAIT QUE LIRE. Ni `insert`, ni `update`, sur aucune
-- colonne : motif `bande_settings`, dans sa forme d'après la revue L18. Les
-- deux moitiés y sont indissociables — refuser l'`insert` en laissant un
-- `grant update` ouvre un `PATCH` PostgREST direct qui n'écrit AUCUNE ligne
-- d'`audit_logs`, et « une trace qui ne couvre qu'un chemin d'écriture sur
-- deux ne trace rien : elle donne seulement l'impression qu'on saurait ».
--
-- La ligne NAÎT ET CHANGE par `set_lobby_habillage` (§2), qui audite.
-- `organization_id` n'est écrivable nulle part : c'est le locataire, il se
-- pose une fois, par la RPC.
--
-- LE `select` EST AU NIVEAU TABLE, et c'est un choix. Une liste de colonnes
-- aurait rejoué le défaut que ce fichier évite : la douzième colonne posée un
-- jour par un autre chantier n'hériterait de rien, et PostgREST refuserait le
-- `select` entier de l'éditeur. Rien n'est secret dans cette table pour un
-- membre de l'organisation — elle ne porte que de l'apparence.
grant select on table public.lobby_settings to authenticated;

create trigger lobby_settings_touch_updated_at
  before update on public.lobby_settings
  for each row execute function public.touch_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. `set_lobby_habillage` — LE SEUL CHEMIN D'ÉCRITURE
--
-- CONTRAT :
--   {"state":"ok","theme":text,"fond_key":text|null,
--    "affiche_identite":bool}
--   lève 42501 (rôle, acteur, habilitation) ou 22023 (valeurs)
--
-- Décalque de `set_bande_pack` (20261019120000), y compris l'ordre des
-- gardes : rôle, organisation, ACTEUR, puis valeurs. L'acteur AVANT le
-- réglage est le motif `close_player_lobby_as_org` — un non-habilité ne doit
-- rien apprendre, pas même par la forme du chemin parcouru.
--
-- ── POURQUOI owner|editor, ET PAS LE CAISSIER ──
--
-- Même arbitrage que le pack de L18 : l'apparence d'un écran qui porte le nom
-- du commerce, devant des clients, est éditoriale. Elle ne peut pas être
-- révocable par le premier téléphone du comptoir.
--
-- ── LES VALEURS LÈVENT EN 22023 PLUTÔT QUE DE TOMBER SUR LE `check` ──
--
-- Motif `set_bande_pack` : une violation de contrainte remontée brute nomme
-- la contrainte, donc la table, et n'a rien de lisible pour un écran.
--
-- LA VALIDATION DE `fond_key` EST CELLE DE LA FORME, ET C'EST DÉLIBÉRÉ. La
-- RPC ne connaît pas le catalogue des fonds, exactement comme le `check` :
-- l'inventaire vit dans `FOND_KEYS`, et le valider ici l'aurait gravé une
-- seconde fois — au même prix, avec un endroit de plus à corriger le jour
-- d'un retrait.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_lobby_habillage(
  p_organization_id uuid,
  p_theme text,
  p_fond_key text,
  p_affiche_identite boolean,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fond_key text;
  v_affiche boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_theme is null
     or p_theme not in ('neutre', 'noel', 'saint_valentin', 'anniversaire',
                        'soldes', 'festival', 'prairie', 'musique', 'football',
                        'restaurant', 'espace') then
    raise exception 'unknown lobby theme' using errcode = '22023';
  end if;

  -- La chaîne vide est ramenée à `null` — « suivre le thème ». Un formulaire
  -- HTML qui vide son champ envoie `''`, pas `null`, et le refuser aurait fait
  -- lever la RPC sur le geste le plus banal de l'éditeur : effacer son choix.
  v_fond_key := nullif(pg_catalog.btrim(coalesce(p_fond_key, '')), '');
  if v_fond_key is not null and v_fond_key !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'invalid lobby fond key' using errcode = '22023';
  end if;

  -- `null` vaut « ne change pas d'avis sur ce point » à la CRÉATION seulement,
  -- où il retombe sur le défaut de la colonne. Écrire `coalesce` ici plutôt
  -- que de laisser passer `null` évite un `not null` violé sur une table dont
  -- la colonne a pourtant un défaut : `insert … values (null)` ne prend PAS le
  -- défaut, il insère `null`.
  v_affiche := coalesce(p_affiche_identite, true);

  insert into public.lobby_settings (
    organization_id, theme, fond_key, affiche_identite)
  values (p_organization_id, p_theme, v_fond_key, v_affiche)
  on conflict (organization_id) do update
     set theme = excluded.theme,
         fond_key = excluded.fond_key,
         affiche_identite = excluded.affiche_identite;

  -- LE JOURNAL PORTE LE GESTE ET SES VALEURS, motif `bande.pack_set` : ce qui
  -- se relit après coup, c'est « qui a mis le nom du commerce sur cet écran,
  -- et quand ».
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'lobby.habillage_set',
          pg_catalog.jsonb_build_object(
            'theme', p_theme,
            'fond_key', v_fond_key,
            'affiche_identite', v_affiche));

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'theme', p_theme,
    'fond_key', v_fond_key,
    'affiche_identite', v_affiche);
end;
$$;

comment on function public.set_lobby_habillage(uuid, text, text, boolean, uuid) is
  'Le commerçant habille ses salons (SALON-1) : palette, fond d''écran, et '
  'affichage de son identité — pour Duo Miroir ET Portrait de la Bande à la '
  'fois. Acteur vérifié EN SQL owner|editor (motif set_bande_pack) parce que '
  'le geste est JOURNALISÉ (lobby.habillage_set) et qu''il décide de ce que '
  'des clients voient sur un écran portant le nom du commerce : c''est '
  'éditorial, pas du comptoir. La ligne lobby_settings NAÎT ici, ce qui est la '
  'raison de son absence de grant insert ET de grant update — les deux '
  'moitiés sont indissociables, un PATCH PostgREST direct écrirait sans trace '
  '(revue L18). Un thème inconnu lève en 22023 plutôt que de tomber sur le '
  'check, dont le message nommerait la table. fond_key n''est validé QUE dans '
  'sa forme : le catalogue vit dans FOND_KEYS et le graver ici en ferait un '
  'second endroit à corriger. Rendue à service_role.';

revoke all on function
  public.set_lobby_habillage(uuid, text, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function
  public.set_lobby_habillage(uuid, text, text, boolean, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 3. `lobby_state` REND L'HABILLAGE — ET RIEN D'AUTRE NE CHANGE
--
-- CONTRAT (la clé `habillage` s'ajoute, tout le reste est mot pour mot celui
-- de 20261017120000) :
--   {"state":"ok", …, "habillage": null
--                    | {"theme":text,"fond_key":text|null,
--                       "nom":text|null,"logo_url":text|null}}
--
-- ── LA CLÉ EST TOUJOURS PRÉSENTE, `null` QUAND RIEN N'EST RÉGLÉ ──
--
-- Motif `join_code`, écrit dans l'en-tête de la fonction : « un document de
-- forme stable se type une fois côté application, là où une clé qui apparaît
-- et disparaît se teste à chaque lecture ».
--
-- ── `nom` ET `logo_url` SUIVENT `affiche_identite`, ET NE SORTENT PAS SINON ──
--
-- Les taire côté base plutôt que côté écran : un réglage d'apparence que
-- seule l'interface respecte n'est respecté que jusqu'au premier appelant qui
-- l'ignore. Ils restent présents à `null`, même motif de forme stable.
--
-- ── L'APPARTENANCE RESTE LA SEULE PORTE, ET ELLE EST INCHANGÉE ──
--
-- Les trois refus muets d'avant sont recopiés à l'identique et RENDENT LE
-- MÊME DOCUMENT À UN CARACTÈRE PRÈS : `{"state":"unavailable"}`, sans clé
-- `habillage`. C'est ce qui empêche l'ajout de devenir un oracle — un lobby
-- inconnu et un jeton non membre ne se distinguent toujours pas, et surtout
-- pas par la taille de la réponse.
--
-- ── LA JOINTURE EST UN `left join` SUR DEUX TABLES, PAS UN `select` DE PLUS ──
--
-- `organizations` porte `name` et `logo_url`, `lobby_settings` le reste. La
-- lecture se fait en UNE requête depuis `player_lobbies`, que la fonction a
-- déjà en main : le coût de l'habillage est une jointure sur deux clés
-- primaires, pas un aller-retour.
-- ────────────────────────────────────────────────────────────

create or replace function public.lobby_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_est_hote boolean;
  v_statut text;
  v_habillage jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Identifiant absent : le même refus muet que tout le reste. Il n'y a rien à
  -- crier ici — contrairement à `create_player_lobby`, un `null` peut venir
  -- d'un cookie effacé plutôt que d'un bogue.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_est_hote := v_lobby.creator_token_hash = p_token_hash;

  -- L'EXPIRATION EST AFFICHÉE, PAS ÉCRITE (ADR-111). `status` reste `lobby` ou
  -- `locked` en base ; c'est la lecture qui dit « expired ». Écrire ici
  -- daterait l'expiration du moment où quelqu'un a rouvert l'onglet.
  v_statut := case
    when v_lobby.status in ('lobby', 'locked')
         and v_lobby.expires_at <= pg_catalog.now() then 'expired'
    else v_lobby.status
  end;

  -- SALON-1. Pas de ligne = pas d'habillage = le lavis neutre d'hier.
  select pg_catalog.jsonb_build_object(
           'theme', s.theme,
           'fond_key', s.fond_key,
           'nom', case when s.affiche_identite then o.name else null end,
           'logo_url',
             case when s.affiche_identite then o.logo_url else null end)
    into v_habillage
    from public.lobby_settings s
    join public.organizations o on o.id = s.organization_id
   where s.organization_id = v_lobby.organization_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'status', v_statut,
    'kind', v_lobby.kind,
    'capacite', v_lobby.capacite,
    'expires_at', v_lobby.expires_at,
    'join_code', case when v_est_hote then v_lobby.join_code else null end,
    'habillage', v_habillage,
    'membres', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'pseudo', m.pseudo,
                 'rang', public.player_lobby_rang(
                           m.lobby_id, m.joined_at, m.id),
                 'est_moi', m.token_hash = p_token_hash)
               order by public.player_lobby_rang(
                          m.lobby_id, m.joined_at, m.id))
        from public.player_lobby_members m
       where m.lobby_id = v_lobby.id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.lobby_state(uuid, text) is
  'Ce que voit quelqu''un qui est DEDANS (L16). L''APPARTENANCE EST EXIGÉE, et '
  'son absence rend le refus INDISTINCT de celui d''un lobby inconnu. '
  'join_code n''est rendu qu''à l''hôte ; aucun hash ne sort. Depuis SALON-1 '
  'le document porte « habillage » : null si le commerce n''a rien réglé — le '
  'comportement historique — sinon le thème, le fond, et le nom et le logo '
  'quand affiche_identite le permet. C''EST LE SEUL CHEMIN PUBLIC vers '
  'lobby_settings, et c''est délibéré : cette fonction exige déjà '
  'l''appartenance, là où une lecture par le slug rétablirait l''oracle que '
  'create_player_lobby ferme (organisation inconnue et organisation sans le '
  'module rendent le même unavailable). Rendue à service_role.';

revoke all on function public.lobby_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lobby_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 4. GARDE DE SORTIE — ÉCHOUER ICI PLUTÔT QU'EN PRODUCTION
--
-- Un `grant` sans effet, une policy qui ne prend pas, un `create or replace`
-- qui ne porte pas : rien de tout cela NE LÈVE. La migration est marquée
-- appliquée, et la panne apparaît au premier écran ouvert. Ce bloc transforme
-- ce silence en échec d'application.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;
begin
  -- ── LA TABLE EXISTE, AVEC SA RLS ET SES DEUX POLICIES ──
  if not exists (
    select 1 from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'lobby_settings'
      and c.relrowsecurity
  ) then
    raise exception
      'public.lobby_settings absente ou sans RLS : la table porte l apparence d un tenant, une RLS eteinte la rendrait lisible d une organisation a l autre.';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'lobby_settings') <> 2 then
    raise exception
      'public.lobby_settings n a pas ses deux policies (member select, editor write) : la RLS active SANS policy fermerait la table a l editeur, et l ecran de reglages serait vide sans erreur.';
  end if;

  -- ── LE RÉGIME DE DROITS EST CELUI QU'ON A ÉCRIT, DANS LES DEUX SENS ──
  --
  -- Le `select` DOIT être là — sans lui l'éditeur ne relit pas ce qu'il vient
  -- d'enregistrer. L'`insert` et l'`update` NE DOIVENT PAS l'être : c'est la
  -- moitié de la garde d'audit, et c'est celle qui se perd en silence.
  if not pg_catalog.has_table_privilege(
           'authenticated', 'public.lobby_settings', 'SELECT') then
    raise exception
      'authenticated ne peut pas lire public.lobby_settings : l ecran de reglages du commercant afficherait un salon non habille alors qu il l est.';
  end if;
  if pg_catalog.has_table_privilege(
       'authenticated', 'public.lobby_settings', 'INSERT')
     or pg_catalog.has_table_privilege(
          'authenticated', 'public.lobby_settings', 'UPDATE') then
    raise exception
      'authenticated a un privilege d ecriture sur public.lobby_settings : un PATCH PostgREST direct habillerait le salon SANS ligne d audit_logs, et la trace de set_lobby_habillage ne couvrirait plus qu un chemin sur deux.';
  end if;

  -- `anon` NE TOUCHE RIEN. Le joueur passe par lobby_state, jamais par la
  -- table : on le CONSTATE au lieu de le supposer (motif 20261116120000 §3).
  if pg_catalog.has_table_privilege(
       'anon', 'public.lobby_settings', 'SELECT') then
    raise exception
      'anon peut lire public.lobby_settings : l habillage deviendrait interrogeable par organisation sans passer par l appartenance, ce qui est exactement l oracle que create_player_lobby ferme.';
  end if;

  -- ── LES DEUX RPC SONT RENDUES AU SEUL `service_role` ──
  if not pg_catalog.has_function_privilege(
           'service_role',
           'public.set_lobby_habillage(uuid, text, text, boolean, uuid)',
           'EXECUTE') then
    raise exception
      'service_role ne peut pas executer set_lobby_habillage : l editeur d habillage serait refuse des son premier enregistrement.';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.set_lobby_habillage(uuid, text, text, boolean, uuid)',
       'EXECUTE')
     or pg_catalog.has_function_privilege(
          'anon',
          'public.set_lobby_habillage(uuid, text, text, boolean, uuid)',
          'EXECUTE') then
    raise exception
      'set_lobby_habillage est executable par un role applicatif : la verification d acteur owner|editor pourrait etre contournee par un appel direct depuis le navigateur.';
  end if;

  -- `create or replace` PRÉSERVE l'ACL ; on le constate plutôt que de
  -- l'espérer, parce qu'un `drop` accidentel ailleurs la ramènerait au défaut
  -- PUBLIC (motif 20261128120000).
  if not pg_catalog.has_function_privilege(
           'service_role', 'public.lobby_state(uuid, text)', 'EXECUTE') then
    raise exception
      'service_role a perdu l execution de lobby_state : l ecran du salon serait refuse pour tout le monde, habille ou non.';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.lobby_state(uuid, text)', 'EXECUTE') then
    raise exception
      'anon peut executer lobby_state : le reveil du defaut le plus grave du socle L16, un identifiant de lobby suffisant a lire des pseudos.';
  end if;

  -- ── LE `create or replace` DE §3 A PORTÉ, ET N'A RIEN EMPORTÉ ──
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lobby_state';

  if pg_catalog.strpos(v_def, '''habillage''') = 0 then
    raise exception
      'public.lobby_state ne rend pas habillage : le create or replace de §3 n a pas porte, et les salons resteraient neutres alors que la table et la RPC existent.';
  end if;
  if pg_catalog.strpos(v_def, 'm.token_hash = p_token_hash') = 0 then
    raise exception
      'public.lobby_state a PERDU l exigence d appartenance en recopiant son corps : l habillage — et les pseudos avec lui — sortirait sur simple identifiant de lobby.';
  end if;
  if pg_catalog.strpos(
       v_def, 'case when v_est_hote then v_lobby.join_code else null end') = 0 then
    raise exception
      'public.lobby_state a PERDU la reserve de join_code a l hote en recopiant son corps : n importe quel membre pourrait rameuter la ville dans une salle qu il n a pas ouverte.';
  end if;
  if pg_catalog.strpos(v_def, 's.affiche_identite') = 0 then
    raise exception
      'public.lobby_state ne filtre plus le nom et le logo par affiche_identite : un reglage que seule l interface respecterait ne serait respecte que jusqu au premier appelant qui l ignore.';
  end if;
end
$migration$;
