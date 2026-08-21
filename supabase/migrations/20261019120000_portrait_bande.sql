-- ============================================================
-- PORTRAIT DE LA BANDE — LE VOTE SECRET DE LA TABLÉE (L18)
--
-- Second jeu posé sur le socle des lobbies (L16, 20261017120000), et dernier
-- lot du train « Réserver ». Le cahier (docs/lastchance-reserver.md) le dit
-- ainsi :
--
--   « Deux à douze joueurs. Chacun choisit DISCRÈTEMENT un participant, ou
--     passe. Le résultat collectif apparaît dès que tous les votes sont
--     verrouillés — « Lina — 60 % · 3 personnes sur 5 ». Les personnes qui ont
--     voté ne sont JAMAIS révélées. Un seul vote par participant et par
--     question. Aucun résultat avant le verrouillage complet ou la clôture
--     explicite. Le dénominateur ne change pas durant une question ;
--     déconnexion et sortie ne se résolvent qu'entre deux questions. Cinq à
--     huit questions, puis un récapitulatif. Aucun gain, aucun classement. »
--
-- ── LA PROMESSE QUI GOUVERNE TOUT LE FICHIER ──
--
-- « LES PERSONNES QUI ONT VOTÉ NE SONT JAMAIS RÉVÉLÉES » n'est pas une règle
-- d'affichage : c'est la condition d'existence du jeu. Une tablée ne dit
-- « qui raconte les meilleures histoires » que si personne ne saura qui a
-- désigné qui. `voter_token_hash` est donc écrit dans `bande_votes` — il le
-- faut, pour « un seul vote par personne » — et NE SORT D'AUCUNE RPC DE CE
-- FICHIER. Ni en clair, ni haché une seconde fois, ni en indice : sur une
-- tablée de cinq, une empreinte stable suffirait à recoudre tous les votes
-- d'une soirée.
--
-- Ce que les RPC rendent des votes, et rien d'autre : un COMPTE de votes
-- exprimés pendant que la question court (« trois ont répondu », jamais « qui
-- ni pour qui » — c'est l'attente invisible que le cahier autorise), puis, une
-- fois la question close, un décompte PAR CIBLE. Le chemin entre un votant et
-- son vote n'existe dans aucun document produit ici.
--
-- ── LES NEUF ARBITRAGES QUI GOUVERNENT CE FICHIER ──
--
-- Ils sont tranchés, et écrits ici pour qu'on n'ait pas à les rouvrir :
--
--   1. LE « PASSE » COMPTE AU DÉNOMINATEUR, PAS AUX VOIX. « 3 personnes sur
--      5 » se lit « trois voix sur cinq PRÉSENTS », et non « trois sur cinq
--      votants ». Passer est un geste, pas une absence : il verrouille la
--      question comme un vote, il entre dans le compte qui déclenche la
--      révélation, et il ne donne sa voix à personne. Écrit en base par un
--      `cible_member_id` NUL sur une ligne de vote qui existe.
--   2. ON NE VOTE PAS POUR SOI. Le refus est INDISTINCT de celui d'une cible
--      inconnue : la lecture qui valide la cible exclut le votant, donc les
--      trois cas — cible inventée, cible d'une autre salle, soi-même —
--      empruntent le même `return` par STRUCTURE (§9).
--   3. LES ÉGALITÉS SONT TOUTES AFFICHÉES. `bande_state` rend la liste
--      ordonnée par voix décroissantes, sans borne et sans départage
--      arbitraire : deux ex æquo à 50 % sortent tous les deux. Nommer un
--      « gagnant » unique aurait demandé de trancher au hasard entre deux
--      personnes réelles assises à la même table.
--   4. LE RÉCAPITULATIF EST DE SESSION, ET ÉPHÉMÈRE. Qui a été nommé, sur
--      quelles questions, pour cette partie-là. Il ne survit pas à la salle —
--      les quatre tables tombent en cascade avec `player_lobbies`, donc
--      `purge_expired_lobbies` l'emporte. Jamais un profil durable, jamais un
--      classement d'une soirée à l'autre : le cahier l'exclut, et une table
--      qui garderait ces lignes serait exactement le profil qu'il exclut.
--   5. LE PACK EST RÉGLÉ PAR L'ORGANISATION, PAS PAR L'HÔTE. Le commerçant
--      choisit ce que son écran posera à sa salle ; un joueur de passage ne
--      décide pas du ton d'un jeu qui porte le nom du commerce. Défaut
--      POSITIF (`amis`) : le pack taquin ne s'allume que si quelqu'un l'a
--      voulu.
--   6. LE RÉCAPITULATIF FERME LA SALLE. Elle a fini son office, comme en L17,
--      et dans la MÊME TRANSACTION que le passage en `recap` (§11).
--   7. L'HÔTE PEUT FORCER LA CLÔTURE D'UNE QUESTION. Sans cela, un seul joueur
--      parti sans voter bloquerait la partie pour toujours : le dénominateur
--      est FIGÉ, donc les présents ne peuvent plus l'atteindre. Les non-votants
--      restent des ABSTENTIONS et le dénominateur ne bouge pas — c'est le prix
--      exact de la promesse « le dénominateur ne change pas durant une
--      question ».
--   8. LES DÉPARTS SE RÉSOLVENT ENTRE DEUX QUESTIONS, ET NULLE PART AILLEURS.
--      `bande_tours.denominateur` est copié à l'ouverture du tour et n'est plus
--      jamais touché ; `bande_next` en RE-FIGE un neuf. C'est la lettre du
--      cahier, et c'est aussi ce qui empêche un dénominateur mouvant de
--      transformer « 3 sur 5 » en « 3 sur 3 » sous les yeux de la table.
--      CE QUI N'EST PAS ENCORE VRAI, ET QUI EST DIT EN §11 : aujourd'hui la
--      liste des présents NE BOUGE PAS pendant une partie — aucune RPC du socle
--      ne retire un membre d'une salle verrouillée — donc le dénominateur
--      re-figé vaut le précédent, et c'est l'hôte qui clôt chaque question.
--      La règle est écrite au bon endroit AVANT d'avoir quelque chose à
--      observer ; ce qui manque est un mécanisme de PRÉSENCE, et c'est un
--      autre lot.
--   9. LA BASE NE CONNAÎT QUE LES CLÉS DES QUESTIONS, JAMAIS LEUR TEXTE.
--      Motif `campaign-templates.ts` : le contenu de plateforme est du code,
--      pas des lignes de table. Le tour grave la CLÉ (`amis-histoires`), et
--      `src/lib/bande-packs.ts` en tient le texte. Voir §5 pour ce que cela
--      coûte, et pourquoi ce coût est le bon.
--
-- ── AUCUN GAIN, AUCUN SCORE, AUCUN CLASSEMENT ──
--
-- Rien dans ce fichier ne compte de points, ne classe personne, ne touche à une
-- récompense ni à un panier. Il n'existe ni colonne `score`, ni colonne
-- `gagnant`, ni table d'historique : le décompte se CALCULE à la lecture, sur
-- les votes de la partie en cours, et disparaît avec elle. C'est la même
-- discipline qu'en L17 — une colonne « gagnant » aurait été le premier pas vers
-- un historique, puis vers un palmarès de comptoir.
--
-- ── AUCUNE POLICY SUR LES TABLES DE PARTIE (motif L16 / L17) ──
--
-- `bande_parties`, `bande_tours` et `bande_votes` portent la RLS et ZÉRO
-- policy : `service_role` seul, et seulement par les RPC de ce fichier. Une
-- partie n'appartient à aucun compte marchand — elle appartient à des anonymes
-- tenus par un cookie de salle — donc aucun prédicat marchand n'aurait de sens.
-- Ouvrir la lecture à `authenticated` aurait surtout donné au commerçant le
-- moyen de lire QUI A VOTÉ QUOI, ce que toute cette migration existe pour
-- rendre impossible.
--
-- `bande_settings` est l'inverse : c'est une table de CONFIGURATION du
-- commerce, et elle suit le motif `duo_settings` (20261018120000) — lecture aux
-- membres, écriture aux éditeurs, grants colonne par colonne.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0. LA CLÉ CANDIDATE QUI MANQUAIT À `player_lobby_members`
--
-- `player_lobby_members` était jusqu'ici la FEUILLE du socle L16 : cible de
-- personne, donc sans `unique (id, organization_id)`. `bande_votes` a besoin de
-- la désigner par une FK COMPOSITE — c'est le motif du dépôt
-- (`fk_composites_couverture.test.sql`) : une FK simple entre deux tables
-- tenant-scopées laisse le locataire à la garde du code appelant, la composite
-- le fait tenir par la base.
--
-- Concrètement, sans cette clé, rien n'empêcherait un vote de désigner un
-- membre d'une salle d'un AUTRE commerce : la colonne `organization_id` dirait
-- « Café » et `cible_member_id` désignerait quelqu'un de « Boulangerie », et
-- seule la bonne volonté de la RPC aurait tenu les deux d'accord. Avec elle, la
-- base refuse.
--
-- Idempotent et NOMMÉ, motif `vitrine_items_id_org_unique` (20261018120000) :
-- la convention du dépôt pour cette contrainte est `<table>_id_org_unique`.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.player_lobby_members'::regclass
       and con.conname = 'player_lobby_members_id_org_unique'
  ) then
    alter table public.player_lobby_members
      add constraint player_lobby_members_id_org_unique
      unique (id, organization_id);
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 1. `bande_settings` — LE PACK, RÉGLÉ PAR L'ORGANISATION
--
-- Une ligne par commerce, une colonne utile : la clé du pack de questions.
--
-- ── POURQUOI L'ORGANISATION, ET NON L'HÔTE (arbitrage 5) ──
--
-- Laisser l'hôte choisir aurait été le geste le plus court — un paramètre de
-- plus sur `bande_start` — et c'est précisément pour cela qu'il fallait
-- l'écarter. Les questions s'affichent sur un écran qui porte le nom du
-- commerce, devant des gens qui ne les ont pas choisies. Le pack `taquin` moque
-- des travers universels, mais il moque ; le commerçant doit pouvoir décider
-- qu'il n'entre pas chez lui, et cette décision ne peut pas être révocable par
-- le premier client qui ouvre une salle.
--
-- ── POURQUOI UNE TABLE À PART, ET NON UNE COLONNE SUR `vitrine_settings` ──
--
-- Même raison qu'en L17 (§2 de 20261018120000) : `vitrine_settings` porte
-- `touch_updated_at`, et son `updated_at` date la PÉREMPTION DES TRADUCTIONS
-- (leçon L14). Ranger le pack là-bas aurait voulu dire que changer de pack
-- périme toutes les traductions de la vitrine. Une table séparée porte son
-- propre `updated_at`, qui ne date que lui-même.
--
-- ── LE `check` PORTE SUR LES CINQ CLÉS, PAS SUR LE CONTENU ──
--
-- Les cinq packs vivent dans `src/lib/bande-packs.ts` (`BANDE_PACK_CLES`), et
-- la base n'en connaît que les noms. Le `check` est le miroir SQL de cette
-- liste : c'est ce qui empêche une ligne de désigner un pack qui n'a jamais
-- existé, sans pour autant recopier soixante questions dans une table.
-- ────────────────────────────────────────────────────────────

create table public.bande_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  -- DÉFAUT POSITIF. `amis` est le pack de tous les jours, écrit pour qu'être
  -- nommé fasse plaisir ; c'est aussi `BANDE_PACK_DEFAUT` côté application. Un
  -- commerce qui n'a rien réglé joue donc du positif, jamais du taquin.
  pack text not null default 'amis'
    constraint bande_settings_pack_connu
    check (pack in ('amis', 'duo', 'equipe', 'anniversaire', 'taquin')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.bande_settings is
  'Le réglage Portrait de la Bande d''un commerce (L18) : la CLÉ du pack de '
  'questions, et rien d''autre. Le pack est réglé par l''ORGANISATION et non '
  'par l''hôte de la salle (arbitrage 5) : les questions s''affichent sur un '
  'écran qui porte le nom du commerce, devant des gens qui ne les ont pas '
  'choisies — le commerçant doit pouvoir décider que le pack taquin n''entre '
  'pas chez lui, et cette décision ne peut pas être révocable par le premier '
  'client qui ouvre une salle. Table SÉPARÉE de vitrine_settings, même leçon '
  'L14 qu''en L17 : y ranger le pack aurait fait périmer toutes les traductions '
  'de la vitrine à chaque changement. Le check est le miroir SQL de '
  'BANDE_PACK_CLES (src/lib/bande-packs.ts) : la base connaît les cinq NOMS, '
  'jamais les soixante questions. Défaut POSITIF (amis).';
comment on column public.bande_settings.pack is
  'Clé du pack, miroir de BANDE_PACK_CLES. Elle est COPIÉE dans bande_parties '
  'au démarrage : le réglage peut changer après, une partie commencée garde le '
  'sien.';

alter table public.bande_settings enable row level security;

-- Les privilèges par défaut ne servent plus `authenticated` depuis
-- 20260930120000 (00021 avait fait de même pour `anon`), donc la table naît
-- déjà nue. Le `revoke` explicite reste écrit parce qu'une garde qui dépend
-- d'une migration d'il y a trois semaines est une garde qu'on ne relit pas
-- (leçon SEC-4, wagon 7).
revoke all on table public.bande_settings from public, anon, authenticated;

-- Motif `duo_settings` (20261018120000) : la lecture va à TOUS les membres,
-- l'écriture aux seuls éditeurs. Le caissier a une raison de savoir quel pack
-- tourne quand un client lui pose la question ; il n'a aucune raison d'en
-- changer entre deux cafés.
--
-- LA POLICY D'ÉCRITURE NE COMMANDE PLUS RIEN, ET ELLE RESTE. Depuis que le
-- `grant update` a été retiré (voir plus bas), `authenticated` n'a aucun
-- privilège d'écriture à filtrer : la policy est le SECOND verrou, celui qui
-- tiendrait le jour où un grant reviendrait par inadvertance. Une policy retirée
-- parce qu'« elle ne sert plus » est une policy qu'il faut se rappeler de
-- réécrire, et l'oubli ne se voit qu'à la fuite.
create policy "bande_settings: member select" on public.bande_settings
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "bande_settings: editor write" on public.bande_settings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- `authenticated` NE FAIT QUE LIRE. Ni `insert`, ni `update`, ni sur `pack` :
-- motif `duo_settings` / `vitrine_settings`, la ligne NAÎT de `set_bande_pack`,
-- qui audite, ET ELLE N'Y CHANGE QUE PAR ELLE.
--
-- Les deux moitiés sont indissociables, et c'est la leçon de la revue L18. Le
-- refus d'`insert` seul se défendait ainsi : « le premier pack est celui qui
-- compte, puisque c'est lui qui peut allumer le taquin ». L'argument était faux
-- tant que `grant update (pack)` existait — un éditeur basculait sur `taquin`
-- par un `PATCH` PostgREST direct, sans jamais appeler la RPC, donc SANS ligne
-- d'`audit_logs`. Une trace qui ne couvre qu'un chemin d'écriture sur deux ne
-- trace rien : elle donne seulement l'impression qu'on saurait.
--
-- LA RÉVOCATION NE COÛTE RIEN À L'APPLICATION : elle n'écrit que par
-- `set_bande_pack` (`src/actions/bande.ts`), qui est rendue à `service_role`.
-- `organization_id` n'est écrivable nulle part : c'est le locataire, il se pose
-- une fois, par la RPC.
grant select on table public.bande_settings to authenticated;

create trigger bande_settings_touch_updated_at
  before update on public.bande_settings
  for each row execute function public.touch_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. `bande_parties` — LA PARTIE, ET IL N'Y EN A QU'UNE PAR SALLE
--
-- ── `unique (lobby_id)` EST UNE CONTRAINTE, PAS UNE CONVENTION ──
--
-- Motif `duo_rounds_lobby_unique` (L17) : c'est elle qui rend `bande_start`
-- idempotent MÊME SI le verrou consultatif disparaissait un jour. Douze
-- téléphones qui ouvrent l'écran à la même seconde ne peuvent pas fabriquer
-- douze parties pour la même table.
--
-- ── `pack` EST COPIÉ AU DÉMARRAGE ──
--
-- Le commerçant peut changer de pack pendant qu'une partie court. Copier la
-- clé à l'ouverture évite qu'une salle change de ton entre sa question 3 et sa
-- question 4 — motif « graver au moment du geste », le même qui grave
-- `nom_fige` en L17. C'est aussi ce qui rend le TIRAGE des questions stable :
-- il est fonction du pack et du lobby, donc d'un pack qui ne bouge plus.
--
-- ── `position` EST LA QUESTION COURANTE, ET ELLE NE RECULE JAMAIS ──
--
-- 1 à 8, bornée par `nb_questions` — le `check` croisé refuse une position qui
-- dépasserait le nombre de questions de la partie, ce qu'aucun `check` sur une
-- seule colonne n'aurait su dire. `bande_next` est le SEUL endroit qui
-- l'incrémente, et seulement sur un tour révélé.
--
-- ── DEUX ÉTATS, ET PAS TROIS ──
--
-- `en_cours` → `recap`, et rien d'autre. Pas d'« annulée », pas d'« expirée » :
-- une partie n'a pas de vie propre au-delà de sa salle. Quand le lobby meurt,
-- la purge de L16 (`purge_expired_lobbies`) emporte la partie, ses tours et ses
-- votes en cascade — c'est le sens de « session privée éphémère », et c'est
-- aussi ce qui garantit qu'aucun portrait ne survit à la soirée (arbitrage 4).
-- ────────────────────────────────────────────────────────────

create table public.bande_parties (
  id uuid primary key default gen_random_uuid(),
  -- PAS de `references public.player_lobbies(id)` simple : la seule FK vers le
  -- lobby est la COMPOSITE ci-dessous (motif L16, `player_lobby_members`).
  lobby_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- COPIÉ depuis `bande_settings` au démarrage — voir l'en-tête de section.
  pack text not null
    constraint bande_parties_pack_connu
    check (pack in ('amis', 'duo', 'equipe', 'anniversaire', 'taquin')),
  position integer not null default 1 check (position between 1 and 8),
  -- Le cahier dit « 5 à 8 questions ». Le `check` est le filet ; la valeur
  -- servie est posée par `bande_start` (§8).
  nb_questions integer not null check (nb_questions between 5 and 8),
  status text not null default 'en_cours'
    check (status in ('en_cours', 'recap')),
  created_at timestamptz not null default pg_catalog.now(),
  -- UNE SEULE PARTIE PAR SALLE. C'est aussi l'index de tête de `lobby_id`, dont
  -- toutes les lectures de ce fichier partent.
  constraint bande_parties_lobby_unique unique (lobby_id),
  -- Cible de la FK composite de `bande_tours`. Convention du dépôt :
  -- `<table>_id_org_unique`.
  constraint bande_parties_id_org_unique unique (id, organization_id),
  -- LE `check` CROISÉ : la question courante ne dépasse jamais le nombre de
  -- questions. Deux `check` séparés sur deux colonnes n'auraient jamais su le
  -- dire — c'est la relation entre elles qui compte.
  constraint bande_parties_position_bornee check (position <= nb_questions),
  foreign key (lobby_id, organization_id)
    references public.player_lobbies(id, organization_id) on delete cascade
);

comment on table public.bande_parties is
  'La partie de Portrait de la Bande (L18), et il n''y en a qu''UNE par salle — '
  'unique (lobby_id), qui est l''arbitrage écrit en contrainte plutôt qu''en '
  'convention d''appelant : douze bande_start simultanés ne peuvent pas '
  'fabriquer douze parties pour la même table, même si le verrou consultatif '
  'disparaissait. `pack` est COPIÉ au démarrage — le commerçant peut changer de '
  'réglage pendant qu''une partie court, et une salle ne doit pas changer de '
  'ton entre sa question 3 et sa question 4 (motif « graver au moment du '
  'geste »). `position` est la question courante, bornée par nb_questions via '
  'un check CROISÉ qu''aucun check monocolonne n''aurait su dire ; seul '
  'bande_next l''incrémente, et seulement sur un tour révélé. Deux états, '
  'en_cours → recap : une partie n''a pas de vie propre au-delà de sa salle, et '
  'purge_expired_lobbies l''emporte en cascade avec ses tours et ses votes — '
  'c''est ce qui garantit qu''aucun portrait ne survit à la soirée. RLS active '
  'et AUCUNE policy : service_role seul, par RPC.';

alter table public.bande_parties enable row level security;

revoke all on table public.bande_parties from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `lobby_id` est déjà couvert par `bande_parties_lobby_unique`.
create index bande_parties_org_idx
  on public.bande_parties (organization_id);


-- ────────────────────────────────────────────────────────────
-- 3. `bande_tours` — UNE QUESTION, ET SON DÉNOMINATEUR FIGÉ
--
-- ── `denominateur` EST LE CŒUR DE LA PROMESSE (arbitrages 1 et 8) ──
--
-- « Le dénominateur ne change pas durant une question ; déconnexion et sortie
-- ne se résolvent qu'entre deux questions. » Cette phrase du cahier est écrite
-- ici, en une colonne : le nombre de membres PRÉSENTS à l'instant où le tour
-- s'ouvre, copié, et plus jamais touché. Motif `jackpot_participants.cycle` —
-- ce qui définit un cycle se grave au début du cycle.
--
-- Ce qu'elle achète : « Lina — 60 % · 3 personnes sur 5 » reste vrai même si
-- quelqu'un a fermé son téléphone entre-temps. Un dénominateur qui suivrait les
-- présents en direct ferait monter le pourcentage d'une personne pendant
-- qu'elle est affichée, et transformerait « 3 sur 5 » en « 3 sur 3 » sous les
-- yeux de la table.
--
-- Ce qu'elle coûte, et il faut le dire : si quelqu'un part sans voter, les
-- présents ne peuvent PLUS atteindre le dénominateur, donc la révélation
-- automatique n'arrivera jamais. C'est exactement pour ce cas que l'hôte peut
-- forcer la clôture (§10, arbitrage 7) — le coût est payé par un bouton, pas
-- par une entorse à la promesse.
--
-- LA BORNE BASSE EST UN, ET NON DEUX. `bande_start` exige deux membres pour
-- ouvrir la partie ; mais entre deux questions, les gens s'en vont, et
-- `bande_next` re-fige ce qu'il TROUVE. Un `check` à deux aurait fait échouer
-- l'ouverture du tour suivant au lieu de la laisser se dérouler : une partie
-- coincée par une contrainte est pire qu'une question dégénérée où le seul
-- présent ne peut que passer (on ne vote pas pour soi). La borne haute est
-- douze, celle de `player_lobbies.capacite`.
--
-- ── `question_cle` EST COPIÉE, ET LE `check` PORTE SUR SA FORME ──
--
-- La clé du pack, gravée à l'ouverture du tour. Le `check` vérifie la FORME
-- (`amis-histoires`) et non l'appartenance à une liste : recopier soixante clés
-- dans une contrainte aurait fait de chaque retrait de question une migration,
-- et c'est précisément ce que l'arbitrage 9 refuse. Une question retirée de
-- `bande-packs.ts` disparaît des parties suivantes sans migration ; une partie
-- déjà jouée garde la sienne, et l'application rend `null` pour un texte qui
-- n'existe plus (`questionBande`).
--
-- ── L'ÉQUIVALENCE, ET NON DEUX CHECKS QUI S'ACCORDENT ──
--
-- `(status = 'revelee') = (revealed_at is not null)` : un seul `check` qui dit
-- les DEUX SENS, motif `duo_rounds_revelation_coherente` (L17). Un tour
-- `revelee` sans date, et une date de révélation sur un tour encore ouvert,
-- sont refusés par la même expression.
-- ────────────────────────────────────────────────────────────

create table public.bande_tours (
  id uuid primary key default gen_random_uuid(),
  partie_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  position integer not null check (position between 1 and 8),
  -- LA FORME, PAS LA LISTE — voir l'en-tête de section.
  question_cle text not null
    constraint bande_tours_question_cle_forme
    check (question_cle ~ '^[a-z]+-[a-z]+$'),
  status text not null default 'ouverte'
    check (status in ('ouverte', 'revelee')),
  -- FIGÉ à l'ouverture du tour, et plus jamais touché. C'est la promesse du
  -- cahier écrite en une colonne.
  denominateur integer not null check (denominateur between 1 and 12),
  created_at timestamptz not null default pg_catalog.now(),
  revealed_at timestamptz,
  -- UNE QUESTION PAR PLACE. C'est aussi l'index de tête de `partie_id`.
  constraint bande_tours_partie_position_unique unique (partie_id, position),
  -- Cible de la FK composite de `bande_votes`.
  constraint bande_tours_id_org_unique unique (id, organization_id),
  constraint bande_tours_revelation_coherente check (
    (status = 'revelee') = (revealed_at is not null)
  ),
  foreign key (partie_id, organization_id)
    references public.bande_parties(id, organization_id) on delete cascade
);

comment on table public.bande_tours is
  'Une question de Portrait de la Bande (L18), et son DÉNOMINATEUR FIGÉ. '
  'denominateur porte le nombre de membres PRÉSENTS à l''instant où le tour '
  's''ouvre, copié et plus jamais touché : c''est la phrase du cahier « le '
  'dénominateur ne change pas durant une question ; déconnexion et sortie ne se '
  'résolvent qu''entre deux questions » écrite en une colonne (motif '
  'jackpot_participants.cycle). Elle achète que « 3 personnes sur 5 » reste vrai '
  'même si quelqu''un ferme son téléphone ; elle coûte qu''un départ sans vote '
  'rend la révélation AUTOMATIQUE inatteignable — d''où bande_reveal, où l''hôte '
  'force la clôture, les non-votants restant des abstentions. Borne basse à UN '
  'et non deux : bande_start exige deux membres, mais bande_next re-fige ce '
  'qu''il TROUVE, et une partie coincée par une contrainte serait pire qu''une '
  'question dégénérée. question_cle est la CLÉ du pack, gravée à l''ouverture, '
  'avec un check de FORME et non de LISTE — recopier soixante clés en '
  'contrainte ferait de chaque retrait de question une migration (arbitrage 9). '
  'status et revealed_at sont liés par une ÉQUIVALENCE, un seul check qui dit '
  'les deux sens. RLS active et AUCUNE policy : service_role seul, par RPC.';
comment on column public.bande_tours.denominateur is
  'Le nombre de PRÉSENTS à l''ouverture du tour, figé. Le « passe » y compte '
  '(arbitrage 1) : « 3 personnes sur 5 » se lit « trois voix sur cinq présents » '
  'et non « trois sur cinq votants ».';
comment on column public.bande_tours.revealed_at is
  'Instant de la révélation. clock_timestamp() et non now() : un tour ouvert et '
  'révélé dans une même transaction (un pgTAP, un seed) doit garder un ordre '
  'vrai — même écart, même raison que player_lobby_members.joined_at.';

alter table public.bande_tours enable row level security;

revoke all on table public.bande_tours from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `partie_id` est déjà couvert par `bande_tours_partie_position_unique`.
create index bande_tours_org_idx
  on public.bande_tours (organization_id);


-- ────────────────────────────────────────────────────────────
-- 4. `bande_votes` — LE VOTE SECRET
--
-- ── `voter_token_hash` ENTRE ICI ET NE RESSORT JAMAIS ──
--
-- C'est LA propriété du lot. La colonne existe parce qu'il faut bien tenir
-- « un seul vote par participant et par question » — et c'est la contrainte
-- unique ci-dessous qui le tient, pas la politesse de l'appelant. Elle ne
-- figure dans AUCUN document produit par ce fichier : ni `bande_state`, ni
-- `bande_recap`, ni une agrégation qui la ferait deviner. Le pgTAP l'éprouve
-- sur le TEXTE des documents, et pas seulement sur leur jeu de clés.
--
-- L'IDENTITÉ EST CELLE DU LOBBY, PAS CELLE DU JOUEUR : SHA-256 du cookie PAR
-- LOBBY de L16, jamais l'identité globale `lc-player`. La base ne peut donc pas
-- recoudre les parties d'une même personne d'une salle à l'autre — c'est ce qui
-- fait tenir la ligne du cahier « aucune collecte de profil ».
--
-- ── `cible_member_id` NUL VEUT DIRE DEUX CHOSES, ET `cible_pseudo` LES SÉPARE
--
-- C'est la subtilité centrale de cette table :
--
--   · PASSE — `cible_member_id` nul ET `cible_pseudo` nul. Le joueur a agi : sa
--     ligne existe, elle compte dans le verrouillage de la question, et elle ne
--     donne sa voix à personne (arbitrage 1) ;
--   · CIBLE DISPARUE — `cible_member_id` nul et `cible_pseudo` RENSEIGNÉ. Le
--     joueur a nommé quelqu'un qui a depuis quitté la salle. Son geste est
--     intact et lisible.
--
-- Le `check` dit donc l'implication dans UN SEUL SENS : une identité présente
-- exige un nom gravé, jamais l'inverse. Écrire l'équivalence aurait rendu la
-- table incompatible avec son propre `on delete set null` — la ligne serait
-- devenue invalide à l'instant où le membre part, et la suppression aurait
-- échoué.
--
-- ── LE NOM EST GRAVÉ AU MOMENT DU GESTE (leçon L17, M-1) ──
--
-- `cible_pseudo` porte le pseudo COPIÉ à l'instant du vote, et la FK vers le
-- membre est en `on delete set null (cible_member_id)` — jamais en cascade.
--
-- IL FAUT DIRE CE QUI EST VRAI AUJOURD'HUI, sans quoi cette garde passerait
-- pour la réponse à une attaque ouverte : AUCUNE RPC NE RETIRE UN MEMBRE D'UNE
-- PARTIE COMMENCÉE. `leave_player_lobby` rend `locked` et n'écrit rien ;
-- `kick_player_lobby` exige `status = 'lobby'`. Le socle L16 a DÉLIBÉRÉMENT
-- laissé cette décision à L17 et à L18 — « eux savent ce qu'un joueur manquant
-- fait à un Duo Miroir ou à un Portrait de la Bande » — et L18 ne la prend pas
-- non plus : ce qu'un joueur absent fait à une question, c'est une abstention,
-- et c'est `bande_reveal` qui la résout (§10). Le danger n'est donc pas ouvert.
-- Il est À VENIR, et c'est exactement pour cela qu'on le ferme maintenant.
--
-- CE QUE LA CASCADE COÛTERAIT LE JOUR OÙ UNE SUPPRESSION ARRIVERAIT — bouton
-- « retirer un joueur pendant la partie », effacement RGPD, main
-- d'exploitation :
--
--   · L'ORACLE, PAR ARITHMÉTIQUE ET SANS FUITE. Supprimer une CIBLE emporterait
--     en cascade les votes qui la désignaient, donc ferait BAISSER
--     `votes_exprimes` d'autant. Retirer quelqu'un, lire de combien le compte
--     tombe, recommencer : sur une tablée de cinq, on obtient la distribution
--     complète AVANT la révélation. La promesse « les votants ne sont jamais
--     révélés » serait tombée sans qu'une seule RPC ait rien rendu de plus.
--     (Supprimer un VOTANT, en revanche, ne change rien : rien ne relie sa
--     ligne de vote à sa ligne de membre — c'est le sens de `voter_token_hash`
--     en texte nu.)
--   · LE RÉSULTAT DÉJÀ AFFICHÉ QUI CHANGE. Les voix données à la personne
--     retirée disparaîtraient, et une question DÉJÀ RÉVÉLÉE n'aurait plus le
--     même résultat qu'une minute plus tôt.
--
-- Ces deux propriétés tiennent par la FK, donc elles tiendront pour le lot qui
-- ajoutera le bouton sans relire ce fichier. C'est la leçon M-1 de L17,
-- appliquée AVANT la revue plutôt qu'après.
--
-- POURQUOI `set null (cible_member_id)` ET NON `set null` NU : la FK est
-- COMPOSITE, et un `set null` nu viderait AUSSI `organization_id`, qui est
-- `not null` — la suppression échouerait, rendant le membre indélébile. La
-- syntaxe colonnaire de PG 15 nomme la seule colonne à vider. Motif exact de
-- `duo_choices.item_id` (L17).
--
-- ── AUCUN `update` NE VISE CETTE TABLE, NULLE PART ──
--
-- « Un seul vote par participant et par question » n'a de sens que si le vote
-- tient. `bande_vote` fait un `insert` ou ne fait rien : rejouer le MÊME vote
-- est idempotent (le double-clic ne doit pas punir), en désigner un AUTRE reçoit
-- `scelle` et rien ne bouge. Sans cela, il suffirait de regarder le compte de
-- votes exprimés monter puis de changer d'avis en dernier.
-- ────────────────────────────────────────────────────────────

create table public.bande_votes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- SHA-256 du cookie PAR LOBBY (motif L16 / event_players). IL NE SORT
  -- D'AUCUNE RPC DE CE FICHIER.
  voter_token_hash text not null
    check (voter_token_hash ~ '^[0-9a-f]{64}$'),
  -- NULLABLE, et il vaut nul dans DEUX cas que `cible_pseudo` sépare : le
  -- « passe » (les deux nuls) et la cible qui a quitté la salle (le pseudo
  -- reste). Voir l'en-tête de section.
  cible_member_id uuid,
  -- LE NOM GRAVÉ, copié de `player_lobby_members.pseudo` à l'instant du vote et
  -- jamais réécrit ensuite (aucun `update` ne vise cette table). Le `check` de
  -- longueur est LE MÊME que celui du pseudo d'origine : il ne peut pas mordre
  -- sur une écriture venue de `bande_vote`, qui recopie une valeur déjà
  -- conforme, et il est le filet d'une écriture qui passerait à côté de la RPC.
  cible_pseudo text
    check (cible_pseudo is null
           or pg_catalog.char_length(pg_catalog.btrim(cible_pseudo)) between 1 and 24),
  -- `clock_timestamp()` et NON `now()`, même écart et même raison qu'en L16 et
  -- L17 : plusieurs votes écrits dans la même transaction (un pgTAP) porteraient
  -- sinon le MÊME instant. Rien dans ce fichier ne s'en sert pour décider — la
  -- révélation ne dépend que du COMPTE — mais un horodatage faux est un
  -- horodatage à ne pas écrire.
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  -- UN VOTE PAR PERSONNE ET PAR QUESTION, et c'est ce qui rend la règle vraie
  -- hors des RPC.
  constraint bande_votes_tour_votant_unique unique (tour_id, voter_token_hash),
  -- L'IMPLICATION, DANS UN SEUL SENS : une identité présente exige un nom
  -- gravé. L'inverse est FAUX délibérément — un nom sans identité, c'est la
  -- cible qui a quitté la salle, et c'est l'état que `on delete set null`
  -- fabrique. Écrire l'équivalence aurait rendu la suppression d'un membre
  -- impossible.
  constraint bande_votes_cible_coherente check (
    cible_member_id is null or cible_pseudo is not null
  ),
  -- `deferrable initially deferred`, ET C'EST LA SEULE FAÇON DE RENDRE LA PURGE
  -- POSSIBLE. Ce n'est pas une préférence de style : sans elle,
  -- `purge_expired_lobbies` ÉCHOUE sur toute salle ayant hébergé une partie de
  -- Portrait de la Bande dont un vote désigne encore un membre vivant. Le
  -- chemin exact, mesuré sur PG 15 :
  --
  --   1. `delete from player_lobbies` déclenche DEUX cascades : celle des
  --      membres (FK de L16, la plus ancienne, donc la première) et celle des
  --      parties → tours → votes ;
  --   2. la suppression d'un membre déclenche le `set null` ci-dessous, qui est
  --      un UPDATE sur la ligne de vote ;
  --   3. cet UPDATE fait RE-VÉRIFIER la FK vers le tour, en fin d'instruction ;
  --   4. à ce moment-là, la cascade des parties a DÉJÀ supprimé le tour, et la
  --      vérification échoue sur une ligne qui est elle-même en train d'être
  --      supprimée.
  --
  -- DÉFÉRÉE, la vérification a lieu au COMMIT : la ligne de vote n'existe plus,
  -- il n'y a rien à vérifier, et la purge passe. La contrainte reste ENTIÈRE —
  -- une ligne de vote orpheline est toujours refusée, simplement à la
  -- validation de la transaction plutôt qu'à la fin de l'instruction.
  --
  -- POURQUOI CELLE-CI ET AUCUNE AUTRE : c'est la seule FK re-vérifiée par un
  -- UPDATE qu'une cascade provoque. Trois autres pistes ont été mesurées sur une
  -- reproduction minimale et ÉCARTÉES — différer la FK vers le MEMBRE ne change
  -- rien (c'est l'UPDATE qui déclenche, pas la FK déférée), la rendre SIMPLE non
  -- plus (et `fk_composites_couverture.test.sql` la refuserait), et la retirer
  -- laisserait un identifiant pendant. `deferrable initially deferred` existe
  -- déjà dans le dépôt (20260805180000).
  foreign key (tour_id, organization_id)
    references public.bande_tours(id, organization_id) on delete cascade
    deferrable initially deferred,
  -- `set null (cible_member_id)`, ET NON CASCADE — voir l'en-tête de section :
  -- la cascade offrait à l'hôte un ORACLE (expulser, regarder le compte
  -- baisser) et effaçait les voix d'un joueur simplement parti. La LISTE DE
  -- COLONNES est obligatoire : sans elle Postgres viderait aussi
  -- `organization_id`, qui est `not null`, et la suppression échouerait.
  foreign key (cible_member_id, organization_id)
    references public.player_lobby_members(id, organization_id)
    on delete set null (cible_member_id)
);

comment on table public.bande_votes is
  'Le vote SECRET d''un joueur sur une question de Portrait de la Bande (L18). '
  'voter_token_hash entre ici et NE RESSORT JAMAIS : la colonne existe pour '
  'tenir « un seul vote par participant et par question » (c''est la contrainte '
  'unique qui le tient, pas l''appelant), et elle ne figure dans AUCUN document '
  'produit par ce fichier — le pgTAP l''éprouve sur le TEXTE des documents, pas '
  'seulement sur leur jeu de clés. C''est l''identité PAR LOBBY de L16, jamais '
  'l''identité globale du joueur : la base ne peut pas recoudre les parties '
  'd''une même personne (« aucune collecte de profil »). cible_member_id NUL '
  'veut dire DEUX choses que cible_pseudo sépare : le PASSE (les deux nuls, un '
  'geste qui verrouille la question sans donner sa voix à personne) et la CIBLE '
  'DISPARUE (le pseudo reste). Le check dit donc l''implication dans un seul '
  'sens — identité ⇒ nom gravé — parce que l''équivalence aurait rendu la '
  'suppression d''un membre impossible. La FK vers le membre est en on delete '
  'set null (cible_member_id), jamais en cascade. À DIRE HONNÊTEMENT : aucune '
  'RPC ne retire un membre d''une partie commencée aujourd''hui '
  '(leave_player_lobby rend locked et n''écrit rien, kick_player_lobby exige '
  'status = lobby, et L18 ne prend pas la décision que L16 lui laissait). Le '
  'danger n''est pas ouvert, il est À VENIR — bouton « retirer un joueur '
  'pendant la partie », effacement RGPD, main d''exploitation — et la cascade '
  'coûterait alors DEUX choses : un ORACLE par ARITHMÉTIQUE (supprimer une '
  'CIBLE emporte les votes qui la désignaient, donc fait baisser '
  'votes_exprimes d''autant ; retirer, lire la baisse, recommencer, et sur cinq '
  'personnes on a la distribution complète AVANT la révélation) et un résultat '
  'DÉJÀ RÉVÉLÉ qui change après coup. Supprimer un VOTANT ne change rien : rien '
  'ne relie sa ligne de vote à sa ligne de membre. AUCUN update ne vise cette '
  'table, nulle part. LA FK VERS LE TOUR EST DEFERRABLE INITIALLY DEFERRED, et '
  'c''est la seule façon de rendre la purge possible : supprimer un lobby '
  'déclenche la cascade des MEMBRES (donc le set null, donc un UPDATE sur cette '
  'table, donc une RE-VÉRIFICATION de la FK vers le tour en fin d''instruction) '
  'ET la cascade des parties → tours → votes ; à la re-vérification, le tour a '
  'déjà disparu et purge_expired_lobbies ÉCHOUAIT. Déférée, la vérification a '
  'lieu au COMMIT, où la ligne de vote n''existe plus. La contrainte reste '
  'entière — une ligne orpheline est toujours refusée, seulement plus tard. '
  'RLS active et AUCUNE policy : service_role seul, par RPC.';
comment on column public.bande_votes.voter_token_hash is
  'QUI a voté. Écrit ici, jamais rendu : aucune RPC de ce fichier ne le fait '
  'sortir, ni en clair, ni haché une seconde fois, ni en indice. Sur une tablée '
  'de cinq, une empreinte stable suffirait à recoudre tous les votes d''une '
  'soirée.';

alter table public.bande_votes enable row level security;

revoke all on table public.bande_votes from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `tour_id` est déjà couvert par `bande_votes_tour_votant_unique`.
create index bande_votes_org_idx
  on public.bande_votes (organization_id);

-- Index de tête de la FK composite vers `player_lobby_members`. Il sert le
-- chemin du `set null` : Postgres doit retrouver les mêmes lignes pour les
-- vider qu'il retrouverait pour les supprimer, donc le besoin d'index est
-- identique (motif IDX-1, `index_fk_couverture.test.sql`).
create index bande_votes_cible_idx
  on public.bande_votes (cible_member_id, organization_id);


-- ────────────────────────────────────────────────────────────
-- 5. `bande_pack_questions` — LES CLÉS, ET RIEN QUE LES CLÉS
--
-- ── CE QUE LA BASE SAIT, ET CE QU'ELLE NE SAIT PAS (arbitrage 9) ──
--
-- Elle sait qu'un pack `amis` contient douze questions dont les clés sont
-- `amis-histoires`, `amis-sortie`… Elle ne sait PAS ce que ces questions
-- demandent. Le texte vit dans `src/lib/bande-packs.ts`, versionné, relu, et
-- l'application le résout par `questionBande(cle)`.
--
-- POURQUOI LES CLÉS DOIVENT QUAND MÊME ÊTRE ICI : parce que le TIRAGE se fait
-- en base (§8). Une partie tire N questions distinctes d'un pack, et ce tirage
-- doit être REPRODUCTIBLE — `bande_next` recalcule la même liste pour y prendre
-- la question suivante. Un tirage fait par l'appelant aurait demandé de stocker
-- les N clés d'avance, donc d'écrire des tours qui n'ont pas encore eu lieu, ou
-- de faire confiance à un appelant pour redonner deux fois la même liste.
--
-- CE QUE CELA COÛTE, ET IL FAUT LE DIRE : la liste des clés existe DEUX FOIS —
-- ici et dans `bande-packs.ts`. C'est le prix du tirage reproductible en base,
-- et il se paie d'un test applicatif qui compare les deux listes. Le prix
-- inverse — soixante lignes de contenu de plateforme dans une table — a été
-- écarté par l'arbitrage 9 : il faisait de chaque retouche de question une
-- migration.
--
-- L'ORDRE DES CLÉS EST CELUI DE `bande-packs.ts`, et il n'a aucune importance
-- fonctionnelle : le tirage le remplace par un ordre dérivé du lobby (§6). Il
-- est conservé pour que la comparaison des deux listes soit lisible.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris : elle n'a de sens
-- qu'à l'intérieur des fonctions qui l'appellent (motif `player_lobby_rang`).
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_pack_questions(
  p_pack text
)
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_pack
    when 'amis' then array[
      'amis-histoires', 'amis-sortie', 'amis-repond', 'amis-adresse',
      'amis-rire', 'amis-calme', 'amis-playlist', 'amis-avance',
      'amis-conseil', 'amis-attention', 'amis-projets', 'amis-partage']
    when 'duo' then array[
      'duo-table', 'duo-parle', 'duo-dessert', 'duo-sortie',
      'duo-photos', 'duo-carte', 'duo-assiette', 'duo-telephone',
      'duo-anecdote', 'duo-memoire', 'duo-revenir', 'duo-merci']
    when 'equipe' then array[
      'equipe-question', 'equipe-solution', 'equipe-felicite', 'equipe-clair',
      'equipe-pause', 'equipe-connait', 'equipe-notes', 'equipe-ose',
      'equipe-service', 'equipe-appris', 'equipe-accueil', 'equipe-cafe']
    when 'anniversaire' then array[
      'anniv-idee', 'anniv-lieu', 'anniv-discours', 'anniv-cadeau',
      'anniv-connait', 'anniv-anecdote', 'anniv-chante', 'anniv-photos',
      'anniv-details', 'anniv-tard', 'anniv-trajet', 'anniv-prochaine']
    when 'taquin' then array[
      'taquin-carte', 'taquin-repete', 'taquin-matin', 'taquin-cles',
      'taquin-telephone', 'taquin-orientation', 'taquin-habitude',
      'taquin-retard', 'taquin-playlist', 'taquin-film', 'taquin-repond',
      'taquin-guide']
    else '{}'::text[]
  end;
$$;

comment on function public.bande_pack_questions(text) is
  'Les CLÉS des douze questions d''un pack Portrait de la Bande (L18), et rien '
  'que les clés : le TEXTE vit dans src/lib/bande-packs.ts, que l''application '
  'résout par questionBande(cle). Elles doivent être ici parce que le TIRAGE se '
  'fait en base et doit être REPRODUCTIBLE — bande_next recalcule la même liste '
  'pour y prendre la question suivante. Le prix est que la liste existe DEUX '
  'FOIS, et il se paie d''un test applicatif qui compare les deux ; le prix '
  'inverse, soixante lignes de contenu de plateforme en table, faisait de '
  'chaque retouche une migration. Un pack inconnu rend un tableau VIDE plutôt '
  'que de lever : le check des tables refuse déjà les clés inventées, et une '
  'exception ici aurait fait tomber une partie sur une valeur que la base a '
  'elle-même acceptée. Accordée à PERSONNE, service_role compris.';

revoke all on function public.bande_pack_questions(text)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `bande_questions_tirees` — UN ORDRE STABLE, ET NON UN HASARD
--
-- N clés distinctes d'un pack, dans un ordre qui ne dépend que de la SALLE.
--
-- ── POURQUOI PAS `random()` ──
--
-- Trois raisons, et chacune suffirait :
--
--   · `bande_next` a besoin de retrouver la MÊME liste pour y prendre la
--     question `position + 1`. Avec un tirage aléatoire, il faudrait ou bien
--     écrire les N tours d'avance — donc des questions qui n'ont pas eu lieu —
--     ou bien accepter que la partie change de programme en cours de route ;
--   · une partie irrejouable n'est pas diagnosticable : « la question 4 a
--     bogué » ne se reproduit pas ;
--   · un pgTAP sur un tirage aléatoire est un test qui passe la plupart du
--     temps, ce qui est la pire espèce de test.
--
-- ── LA DÉRIVATION ──
--
-- `hashtextextended(lobby_id || ':' || cle, 0)` donne à chaque clé un rang
-- stable, propre à cette salle : deux salles du même commerce et du même pack
-- reçoivent des programmes différents, et la même salle reçoit toujours le
-- sien. Le départage par la clé rend l'ordre TOTAL, donc reproductible même si
-- deux hachages se collisionnaient.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_questions_tirees(
  p_pack text,
  p_lobby_id uuid,
  p_n integer
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           pg_catalog.array_agg(q.cle order by q.ord, q.cle),
           '{}'::text[])
    from (
      select c.cle,
             pg_catalog.hashtextextended(
               p_lobby_id::text || ':' || c.cle, 0) as ord
        from pg_catalog.unnest(public.bande_pack_questions(p_pack)) as c(cle)
       order by 2, 1
       limit p_n
    ) q;
$$;

comment on function public.bande_questions_tirees(text, uuid, integer) is
  'Le programme d''une partie Portrait de la Bande (L18) : N clés distinctes du '
  'pack, dans un ordre STABLE dérivé du lobby — hashtextextended(lobby_id || '
  ''':'' || cle), départagé par la clé pour que l''ordre soit TOTAL. Jamais '
  'random(), et pour trois raisons : bande_next doit retrouver la MÊME liste '
  'pour y prendre la question suivante (sinon il faudrait écrire les N tours '
  'd''avance, donc des questions qui n''ont pas eu lieu) ; une partie '
  'irrejouable n''est pas diagnosticable ; et un pgTAP sur un tirage aléatoire '
  'est un test qui passe la plupart du temps. Deux salles du même commerce et '
  'du même pack reçoivent des programmes différents. Accordée à PERSONNE, '
  'service_role compris.';

revoke all on function public.bande_questions_tirees(text, uuid, integer)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `set_bande_pack` — LE COMMERÇANT CHOISIT SON PACK
--
-- CONTRAT :
--   {"state":"ok","pack":text}
--   42501  — acteur absent ou non `owner|editor`
--   22023  — organisation absente, OU pack inconnu
--
-- ── L'ACTEUR EST VÉRIFIÉ EN SQL (motif `set_vitrine_slug`, `set_duo_options`)
--
-- Parce que le geste est JOURNALISÉ : un `p_actor` accepté sur parole ferait de
-- la ligne d'audit une déclaration sur l'honneur. Et parce que ce geste-ci peut
-- ALLUMER LE PACK TAQUIN — « qui a décidé que le jeu moquerait les clients »
-- est exactement la question qu'on se pose après coup, et l'audit doit y
-- répondre avec un nom vérifié.
--
-- `owner|editor` et pas le caissier : choisir le ton du jeu est un geste
-- éditorial, pas un geste de comptoir, et c'est le même partage que les
-- policies de la table.
--
-- ── LE PACK INCONNU LÈVE EN 22023, ET NE TOMBE PAS SUR LE `check` ──
--
-- La contrainte refuserait de toute façon, mais une violation de contrainte
-- remontée brute n'est pas une réponse : elle NOMMERAIT la contrainte, donc la
-- table, et l'écran n'aurait rien de lisible à afficher. Motif
-- `set_duo_options`.
--
-- LA LIGNE NAÎT ICI, et c'est la raison de l'absence de `grant insert` sur
-- `bande_settings` (§1) : le premier pack est celui qui compte.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_bande_pack(
  p_organization_id uuid,
  p_pack text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- L'ACTEUR D'ABORD, LE RÉGLAGE ENSUITE (motif `close_player_lobby_as_org`) :
  -- un non-habilité ne doit rien apprendre, pas même par la forme du chemin
  -- parcouru.
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

  if p_pack is null
     or p_pack not in ('amis', 'duo', 'equipe', 'anniversaire', 'taquin') then
    raise exception 'unknown bande pack' using errcode = '22023';
  end if;

  insert into public.bande_settings (organization_id, pack)
  values (p_organization_id, p_pack)
  on conflict (organization_id) do update
     set pack = excluded.pack;

  -- LE JOURNAL PORTE LE GESTE, et il porte le PACK. Contrairement au compte
  -- d'options de L17, la valeur elle-même est la seule chose qui compte ici :
  -- « qui a allumé le taquin, et quand » se lit dans cette ligne.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'bande.pack_set',
          pg_catalog.jsonb_build_object('pack', p_pack));

  return pg_catalog.jsonb_build_object('state', 'ok', 'pack', p_pack);
end;
$$;

comment on function public.set_bande_pack(uuid, text, uuid) is
  'Le commerçant choisit le pack de questions de Portrait de la Bande (L18). '
  'Acteur vérifié EN SQL owner|editor (motif set_vitrine_slug), parce que le '
  'geste est JOURNALISÉ (bande.pack_set) et surtout parce qu''il peut ALLUMER '
  'LE PACK TAQUIN : « qui a décidé que le jeu moquerait les clients » est la '
  'question qu''on se pose après coup, et l''audit doit y répondre avec un nom '
  'vérifié. Le caissier est refusé — choisir le ton du jeu est éditorial, pas '
  'du comptoir. Un pack inconnu lève en 22023 plutôt que de tomber sur le '
  'check : une violation de contrainte remontée brute nommerait la contrainte, '
  'donc la table, et n''aurait rien de lisible pour l''écran. La ligne '
  'bande_settings NAÎT ici, ce qui est la raison de son absence de grant insert '
  '— le premier pack est celui qui compte. Rendue à service_role.';

revoke all on function public.set_bande_pack(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_bande_pack(uuid, text, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `bande_start` — OUVRIR LA PARTIE ET SA PREMIÈRE QUESTION
--
-- CONTRAT :
--   {"state":"ok","partie_id":uuid,"pack":text,
--    "position":int,"nb_questions":int}
--   {"state":"unavailable"}  — TOUT le reste
--
-- ── SIX QUESTIONS PAR DÉFAUT, ET C'EST DIT ICI ──
--
-- Le cahier borne à « 5 à 8 » et ne tranche pas. Six est la valeur servie :
-- au milieu de la fourchette, et un multiple qui laisse la partie sous le
-- quart d'heure sur lequel le TTL du lobby a été calibré (L16 : une heure de
-- prolongation, « une partie dure quinze minutes »). Le `check` de la table
-- garde les deux bornes ; la RPC ne prend PAS ce nombre en paramètre, parce
-- que personne — ni l'hôte, ni le commerçant — n'a été désigné par le cahier
-- pour le choisir.
--
-- ── L'IDEMPOTENCE EST LE POINT DÉLICAT ──
--
-- Douze téléphones ouvrent l'écran à la même seconde. Il doit en sortir UNE
-- partie, la même pour tous. Deux gardes superposées, motif L16/L17 :
--
--   · le VERROU CONSULTATIF sur la clé du lobby — la MÊME que `join`, `lock`,
--     `kick`, `close_player_lobby_as_org` de L16 et que `duo_start` de L17,
--     délibérément : une partie qui s'ouvrirait pendant que le commerçant ferme
--     la salle poserait un jeu sur une table qu'on vient de débarrasser ;
--   · `unique (lobby_id)` sur `bande_parties`, qui tient même sans le verrou.
--
-- ── UNE PARTIE DÉJÀ OUVERTE SE REND SANS RIEN REDEMANDER ──
--
-- Ni statut de lobby, ni expiration : le récapitulatif FERME la salle
-- (arbitrage 6) et ramène sa date de mort à l'instant même, donc exiger un
-- lobby `locked` et vivant aurait rendu `unavailable` à qui recharge l'écran
-- juste après la dernière question. La partie a eu lieu ; son écran doit lui
-- survivre. L'appartenance, elle, reste exigée dans tous les cas.
--
-- ── DEUX MEMBRES AU MINIMUM, ET `exists … offset 1` ──
--
-- Le cahier dit « deux à douze ». À un seul, il n'y a personne à nommer — on ne
-- vote pas pour soi. `lock_player_lobby` refuse déjà de verrouiller à un, mais
-- une garde ne se déduit pas d'une autre. `exists … offset 1` plutôt que
-- `count(*) >= 2` : le parcours s'arrête à la seconde ligne au lieu de lire les
-- douze (motif `create_player_lobby`).
--
-- ── LE TIRAGE SE FAIT ICI, ET UNE SEULE FOIS ──
--
-- Le programme entier de la partie est déterminé à cet instant, par
-- `bande_questions_tirees(pack, lobby_id, nb_questions)`. Seule la PREMIÈRE
-- question est écrite en base ; `bande_next` recalculera la même liste pour y
-- prendre les suivantes. C'est possible parce que la dérivation ne dépend que
-- de trois valeurs figées dans `bande_parties` — et c'est pour cela que `pack`
-- y est copié plutôt que relu dans `bande_settings`.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_start(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- SIX. Voir l'en-tête de section : le cahier borne à 5..8 et ne tranche pas.
  c_nb_questions constant integer := 6;
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_partie public.bande_parties%rowtype;
  v_pack text;
  v_presents integer;
  v_cles text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Identifiant absent : le même refus muet que tout le reste (motif
  -- `lobby_state`). Un `null` peut venir d'un cookie effacé plutôt que d'un
  -- bogue de l'appelant.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Localisation, jamais décision — motif `join_player_lobby` : cette lecture
  -- ne sert qu'à trouver la CLÉ du verrou.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'bande' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'APPARTENANCE EST EXIGÉE DANS TOUS LES CAS, et son absence rend le refus
  -- INDISTINCT de celui d'un lobby inconnu (motif `lobby_state`). Sans elle, un
  -- identifiant de salle volé suffirait à lire le programme de la partie.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA PARTIE EXISTANTE SE REND TELLE QUELLE — voir l'en-tête.
  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;

  if not found then
    -- CRÉATION : là, et seulement là, la salle doit être verrouillée et vivante.
    -- `locked` veut dire « l'hôte a fermé la porte, on est au complet » : c'est
    -- exactement le moment où une question a un sens.
    if v_lobby.status <> 'locked'
       or v_lobby.expires_at <= pg_catalog.now() then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    -- DEUX MEMBRES AU MINIMUM. `offset 1` : on s'arrête à la seconde ligne.
    if not exists (
      select 1 from public.player_lobby_members m
       where m.lobby_id = v_lobby.id
       offset 1
    ) then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    -- LE PACK, COPIÉ. `coalesce` sur le défaut applicatif : un commerce qui n'a
    -- jamais réglé son pack joue du POSITIF, il ne tombe pas en panne.
    select s.pack into v_pack
      from public.bande_settings s
     where s.organization_id = v_lobby.organization_id;
    v_pack := coalesce(v_pack, 'amis');

    -- LE PROGRAMME. Déterminé ici et une seule fois ; `bande_next` le
    -- recalculera à l'identique.
    v_cles := public.bande_questions_tirees(
      v_pack, v_lobby.id, c_nb_questions);
    -- Un pack vidé de ses questions ne peut pas porter de partie. Le cas est
    -- impossible tant que `bande_pack_questions` connaît les cinq packs du
    -- `check` ; il est traité parce qu'une garde qui dépend de l'accord de deux
    -- listes doit dire ce qu'elle fait quand elles divergent.
    if coalesce(pg_catalog.array_length(v_cles, 1), 0) < c_nb_questions then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;

    -- LE DÉNOMINATEUR DE LA PREMIÈRE QUESTION, figé à cet instant.
    select pg_catalog.count(*)::integer into v_presents
      from public.player_lobby_members m
     where m.lobby_id = v_lobby.id;

    insert into public.bande_parties
      (lobby_id, organization_id, pack, position, nb_questions)
    values (v_lobby.id, v_lobby.organization_id, v_pack, 1, c_nb_questions)
    returning * into v_partie;

    insert into public.bande_tours
      (partie_id, organization_id, position, question_cle, denominateur)
    values (v_partie.id, v_partie.organization_id, 1, v_cles[1], v_presents);
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'partie_id', v_partie.id,
    'pack', v_partie.pack,
    'position', v_partie.position,
    'nb_questions', v_partie.nb_questions
  );
end;
$$;

comment on function public.bande_start(uuid, text) is
  'Ouvre — ou retrouve — la partie de Portrait de la Bande d''une salle (L18), '
  'et sa PREMIÈRE question. SIX questions par défaut : le cahier borne à 5..8 '
  'et ne tranche pas, la RPC ne prend pas ce nombre en paramètre parce que '
  'personne n''a été désigné pour le choisir. IDEMPOTENTE sous concurrence par '
  'DEUX gardes superposées : le verrou consultatif sur la clé du lobby (la MÊME '
  'qu''en L16 et L17, pour qu''une partie ne s''ouvre pas pendant que le '
  'commerçant ferme la salle) et unique (lobby_id) sur bande_parties. Une '
  'partie DÉJÀ OUVERTE se rend sans revérifier ni le statut du lobby ni son '
  'expiration : le récapitulatif FERME la salle, donc l''exiger rendrait '
  'unavailable à qui recharge l''écran de fin. L''appartenance reste exigée dans '
  'tous les cas, et son refus est INDISTINCT de celui d''un lobby inconnu. DEUX '
  'MEMBRES AU MINIMUM (exists … offset 1) : à un seul, il n''y a personne à '
  'nommer. LE TIRAGE SE FAIT ICI et une seule fois — le programme entier '
  'dépend de (pack, lobby_id, nb_questions), tous trois figés dans '
  'bande_parties, ce qui permet à bande_next de le recalculer à l''identique. '
  'C''est pour cela que pack est COPIÉ plutôt que relu. Rendue à service_role.';

revoke all on function public.bande_start(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bande_start(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `bande_vote` — NOMMER QUELQU'UN, OU PASSER
--
-- CONTRAT :
--   {"state":"ok","scelle":true,"revelee":bool}
--   {"state":"scelle"}       — vous aviez déjà voté AUTREMENT
--   {"state":"unavailable"}  — TOUT le reste, cible hors salle ET SOI-MÊME
--                              compris
--
-- ── `p_cible_member_id` NUL EST UN GESTE, PAS UNE ABSENCE (arbitrage 1) ──
--
-- C'est l'écart le plus visible avec `duo_choose` (L17), qui refuse un item
-- nul. Ici, nul veut dire PASSER : la ligne de vote s'écrit, elle compte dans
-- le verrouillage de la question, et elle ne donne sa voix à personne. Le
-- paramètre nul ne rejoint donc PAS la garde des identifiants absents.
--
-- ── ON NE VOTE PAS POUR SOI, ET LE REFUS EST INDISTINCT (arbitrage 2) ──
--
-- La lecture qui valide la cible porte trois conditions à la fois : la cible
-- existe, elle est de CETTE salle, et elle n'est pas le votant. Les trois cas
-- empruntent donc le même `return` par STRUCTURE, et non par un accord entre
-- trois `if` qu'on réécrira un jour séparément. Distinguer « vous ne pouvez pas
-- voter pour vous » aurait été plus aimable et aurait donné, au passage, un
-- oracle : présenter des identifiants au hasard pour apprendre lesquels
-- désignent des membres d''autres salles.
--
-- ── LE VOTE EST SCELLÉ, ET LE SCEAU TIENT SUR CE QUE LE JOUEUR A FAIT ──
--
-- Rejouer le MÊME vote est idempotent (le double-clic ne doit pas punir) ; en
-- désigner un AUTRE reçoit `scelle` et RIEN n'est écrit. Il n'y a pas
-- d'`update`, ici ni ailleurs (§4).
--
-- LA COMPARAISON A DEUX MOITIÉS, et la seconde est la leçon L17 poussée d'un
-- cran. `is distinct from` traite le cas où la cible a été retirée depuis
-- (`cible_member_id` devenu nul) : sans lui, `null <> X` rendrait NUL, donc
-- FAUX pour un `if`, et le sceau se serait ouvert exactement là où il compte le
-- plus. Mais l'inverse existe aussi : un joueur dont la cible a disparu qui
-- envoie maintenant un PASSE verrait `null is distinct from null` valoir faux et
-- tomberait dans la branche idempotente — un `ok` mentant sur ce qu'il a
-- scellé. `cible_pseudo` est ce qui les sépare : un passe n'a pas de nom gravé,
-- un vote pour une cible disparue en a un.
--
-- ── LA RÉVÉLATION EST DANS LA MÊME TRANSACTION QUE LE DERNIER VOTE ──
--
-- « Le résultat collectif apparaît dès que tous les votes sont verrouillés » :
-- ce n'est ni un cron ni un appel de suivi. Le vote est inséré et la question
-- passe `revelee` dans un seul instantané ; si l'un échoue, les deux sont
-- défaits. Il n'existe donc AUCUN état où tous auraient voté sans que le
-- résultat soit dû.
--
-- LE COMPTE EST COMPARÉ AU DÉNOMINATEUR FIGÉ, pas au nombre de présents. C'est
-- toute la différence : si quelqu'un est parti sans voter, l'égalité n'arrivera
-- jamais et c'est l'hôte qui clôt (§10). Le `>=` plutôt que `=` est une
-- ceinture — la salle étant `locked`, personne ne peut entrer, donc les votes
-- ne peuvent pas dépasser le dénominateur.
--
-- LA BRANCHE IDEMPOTENTE RETOMBE DANS LE COMPTAGE plutôt que de rendre tout de
-- suite (motif `duo_choose`) : un `return` ici serait un court-circuit, et le
-- jour où la révélation deviendrait due entre deux appels du même joueur, elle
-- serait sautée par celui-là même qui aurait dû la déclencher.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_vote(
  p_lobby_id uuid,
  p_token_hash text,
  p_cible_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_moi public.player_lobby_members%rowtype;
  v_partie public.bande_parties%rowtype;
  v_tour public.bande_tours%rowtype;
  v_vote public.bande_votes%rowtype;
  -- LE NOM À GRAVER. Il sort de la MÊME lecture que la validation de la cible :
  -- chercher le pseudo séparément aurait ouvert un intervalle entre « cette
  -- personne est nommable » et « voici comment elle s'appelle ».
  v_cible_pseudo text;
  v_exprimes integer;
  v_revelee boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- `p_cible_member_id` N'EST PAS DANS CETTE GARDE, et c'est l'arbitrage 1 :
  -- nul veut dire PASSER.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `bande_start` ET QUE L16 : c'est lui qui rend le
  -- comptage des votes vrai. Sans lui, deux votes simultanés liraient tous les
  -- deux « il en manque un » et AUCUN ne déclencherait la révélation — la
  -- question resterait ouverte pour toujours avec tous ses votes écrits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  -- ON NE VOTE QUE DANS UNE SALLE VERROUILLÉE ET VIVANTE, contrairement à
  -- `bande_state` qui doit survivre à la fermeture. Une salle déjà `closed` —
  -- donc une partie arrivée au récapitulatif — emprunte ce refus-ci.
  if not found
     or v_lobby.kind <> 'bande'
     or v_lobby.status <> 'locked'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- MON PROPRE MEMBRE, et pas seulement mon appartenance : il faut mon `id`
  -- pour refuser que je me nomme moi-même.
  select m.* into v_moi
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and m.token_hash = p_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;
  if not found or v_partie.status <> 'en_cours' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select t.* into v_tour
    from public.bande_tours t
   where t.partie_id = v_partie.id
     and t.position = v_partie.position;
  -- Une question absente ou DÉJÀ RÉVÉLÉE refuse le vote. C'est le second filet
  -- après celui de la salle : une garde ne se déduit pas d'une autre.
  if not found or v_tour.status <> 'ouverte' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA CIBLE, ET C'EST ICI QUE SON NOM SE GRAVE. Les trois refus — cible
  -- inventée, cible d'une autre salle, SOI-MÊME — empruntent ce seul `return`,
  -- indistincts par STRUCTURE (arbitrage 2).
  if p_cible_member_id is not null then
    select m.pseudo into v_cible_pseudo
      from public.player_lobby_members m
     where m.id = p_cible_member_id
       and m.lobby_id = v_lobby.id
       and m.id <> v_moi.id;
    if not found then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- LE SCEAU. Lecture unique, sous le verrou.
  select v.* into v_vote
    from public.bande_votes v
   where v.tour_id = v_tour.id
     and v.voter_token_hash = p_token_hash;

  if found then
    -- LES DEUX MOITIÉS DE LA COMPARAISON — voir l'en-tête. La première traite
    -- le changement d'avis ordinaire ET le joueur dont la cible a disparu ; la
    -- seconde traite le PASSE envoyé par ce même joueur, que la première
    -- laisserait passer pour un rejeu.
    if v_vote.cible_member_id is distinct from p_cible_member_id
       or (p_cible_member_id is null and v_vote.cible_pseudo is not null) then
      return pg_catalog.jsonb_build_object('state', 'scelle');
    end if;
    -- LE MÊME VOTE : idempotent, et l'on RETOMBE DANS LE COMPTAGE ci-dessous.
  else
    insert into public.bande_votes
      (tour_id, organization_id, voter_token_hash,
       cible_member_id, cible_pseudo)
    values (v_tour.id, v_tour.organization_id, p_token_hash,
            p_cible_member_id, v_cible_pseudo);
  end if;

  -- ── LA RÉVÉLATION ────────────────────────────────────────
  select pg_catalog.count(*)::integer into v_exprimes
    from public.bande_votes v
   where v.tour_id = v_tour.id;

  if v_exprimes >= v_tour.denominateur then
    update public.bande_tours t
       set status = 'revelee',
           revealed_at = pg_catalog.clock_timestamp()
     where t.id = v_tour.id
       and t.status = 'ouverte';
    v_revelee := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'scelle', true,
    'revelee', v_revelee
  );
end;
$$;

comment on function public.bande_vote(uuid, text, uuid) is
  'Un joueur nomme quelqu''un — ou PASSE — sur la question courante de Portrait '
  'de la Bande (L18). p_cible_member_id NUL est un GESTE et non une absence '
  '(arbitrage 1) : la ligne s''écrit, elle compte dans le verrouillage de la '
  'question, elle ne donne sa voix à personne. C''est l''écart le plus visible '
  'avec duo_choose, qui refuse un item nul — le paramètre nul ne rejoint donc '
  'PAS la garde des identifiants absents. ON NE VOTE PAS POUR SOI, et le refus '
  'est INDISTINCT de celui d''une cible inventée ou d''une cible d''une autre '
  'salle : la lecture qui valide porte les trois conditions à la fois, donc les '
  'trois cas partagent un seul return par STRUCTURE. Le vote est SCELLÉ : '
  'rejouer le MÊME est idempotent, en désigner un AUTRE rend scelle et n''écrit '
  'rien, aucun update ne vise la table. La comparaison a DEUX moitiés — is '
  'distinct from pour le joueur dont la cible a été retirée (sans lui, null <> X '
  'rend NUL et le sceau s''ouvrirait là où il compte le plus), et un test sur '
  'cible_pseudo pour le PASSE envoyé par ce même joueur, que la première '
  'moitié prendrait pour un rejeu. QUAND LE COMPTE ATTEINT LE DÉNOMINATEUR '
  'FIGÉ, la révélation est dans la MÊME TRANSACTION que le dernier vote — pas '
  'de cron, pas d''appel de suivi, aucun état où tous auraient voté sans que le '
  'résultat soit dû. Le compte est comparé au dénominateur FIGÉ et non aux '
  'présents : si quelqu''un est parti sans voter, l''égalité n''arrivera jamais '
  'et c''est l''hôte qui clôt (bande_reveal). Rendue à service_role.';

revoke all on function public.bande_vote(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.bande_vote(uuid, text, uuid)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `bande_reveal` — L'HÔTE CLÔT LA QUESTION (arbitrage 7)
--
-- CONTRAT :
--   {"state":"ok","revelee":true}
--   {"state":"trop_tot","requis":int,"exprimes":int}  — SOUS LE PLANCHER
--   {"state":"unavailable"}  — TOUT le reste
--
-- ── LE PLANCHER DE RÉVÉLATION, ET POURQUOI IL EXISTE (revue L18, E-1) ──
--
-- Sans lui, ce bouton DÉ-ANONYMISE les votes un par un, et il n'y faut aucun
-- outil : l'hôte vote, l'écran lui dit « 1 sur 5 », il attend de voir le compte
-- passer à 2 — il regarde son voisin taper — et il clôt. `resultats` porte alors
-- DEUX lignes, il retranche la sienne, il tient le choix exact de son voisin.
-- La variante est pire encore : il ne vote pas du tout, il attend `0 → 1`, il
-- clôt, et `resultats` ne porte qu'UNE ligne — celle de la seule personne qui a
-- répondu. Six fois par partie, sur une tablée de gens qui croient voter à
-- bulletin secret. Toute la migration existe pour que cela ne soit pas
-- possible ; ce bouton l'était.
--
-- LA CLÔTURE FORCÉE EXIGE DONC `least(3, denominateur)` GESTES. Trois, parce que
-- l'hôte peut toujours retrancher le sien : à trois, il reste DEUX voix qu'il ne
-- peut pas attribuer, et deux est le plus petit nombre qui laisse un doute. À
-- deux, il n'en resterait qu'une, et il n'y aurait pas de doute du tout.
--
-- `least` ET NON `3` SEC, parce qu'une tablée de deux ne pourrait jamais
-- atteindre trois : le plancher y vaut 2, c'est-à-dire le dénominateur, c'est-à-
-- dire que la révélation AUTOMATIQUE de `bande_vote` a déjà joué. À deux, ce
-- bouton ne peut donc jamais rien clore, et c'est cohérent : à deux, savoir que
-- l'autre a répondu revient à savoir qu'il a répondu, il n'y a rien à protéger
-- de plus. Une question qui s'y coince — l'un des deux est parti sans voter —
-- n'est PAS perdue : `close_player_lobby_as_org` la ferme côté commerçant, et le
-- TTL de la salle l'emporte de toute façon. On ne rouvre pas la porte du secret
-- pour épargner un cas que deux issues couvrent déjà.
--
-- ── POURQUOI UN ÉTAT DISTINCT, ET NON `unavailable` ──
--
-- Ce n'est PAS un refus de sécurité : c'est une RÈGLE DU JEU, et l'écran doit
-- pouvoir la dire — « il faut au moins trois réponses ». Un `unavailable` aurait
-- affiché une panne là où il n'y a qu'une attente, et l'hôte aurait rechargé la
-- page en croyant à un bug. Les compteurs voyagent avec, pour que la phrase soit
-- juste sans que l'écran refasse le calcul.
--
-- L'ORDRE DES GARDES EST LA GARDE. Le plancher est évalué APRÈS la comparaison
-- de `creator_token_hash` : un membre ordinaire, ou un inconnu, reçoit toujours
-- `unavailable` et n'apprend RIEN du compte. Inverser les deux aurait fait de ce
-- refus un compteur de votes ouvert à quiconque connaît l'identifiant de salle.
--
-- ── ET L'IDEMPOTENCE N'EN SOUFFRE PAS ──
--
-- Le plancher n'est lu que si la question est encore `ouverte`. Une question
-- DÉJÀ révélée rend `ok` sans le consulter : le double-clic reste sans
-- conséquence, y compris juste après une révélation automatique.
--
-- ── POURQUOI CE BOUTON EXISTE ──
--
-- Le dénominateur est FIGÉ. Si quelqu'un ferme son téléphone ou rentre chez lui
-- au milieu d'une question, les présents ne peuvent PLUS l'atteindre, et la
-- révélation automatique n'arrivera jamais. Sans ce bouton, la promesse
-- « le dénominateur ne change pas durant une question » coûterait une partie
-- bloquée à chaque départ — et la tentation aurait été de faire baisser le
-- dénominateur, c'est-à-dire de renoncer à la promesse.
--
-- LES NON-VOTANTS RESTENT DES ABSTENTIONS, ET LE DÉNOMINATEUR NE BOUGE PAS.
-- C'est le point : « 2 personnes sur 5 » après une clôture forcée dit la
-- vérité — deux se sont prononcées, trois non. Recalculer sur les seuls votants
-- aurait affiché « 2 sur 2 », soit 100 %, ce qui est faux.
--
-- ── IDEMPOTENTE ──
--
-- Une question DÉJÀ révélée rend `ok` sans rien écrire. Le double-clic sur un
-- bouton que l'hôte presse devant une table qui attend ne doit pas punir, et
-- révéler ce qui est révélé ne change rien. C'est le seul écart avec le motif
-- « tout le reste est unavailable », et il est borné à ce cas-là.
--
-- L'HÔTE EST RECONNU PAR `creator_token_hash`, motif `lock_player_lobby` (L16).
-- Un membre ordinaire reçoit le refus GÉNÉRIQUE : lui dire « vous n'êtes pas
-- l'hôte » n'ajouterait rien qu'il ne sache déjà, et distinguerait un refus de
-- rôle d'un refus d'existence.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_reveal(
  p_lobby_id uuid,
  p_creator_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_partie public.bande_parties%rowtype;
  v_tour public.bande_tours%rowtype;
  v_exprimes integer;
  -- LE PLANCHER, calculé sur le dénominateur FIGÉ du tour et non sur les
  -- présents du moment : c'est la même promesse que partout ailleurs ici.
  v_requis integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  -- LA GARDE D'IDENTITÉ EST AVANT LE PLANCHER, ET L'ORDRE EST LA GARDE : qui
  -- n'est pas l'hôte n'apprend rien du compte (voir l'en-tête).
  if not found
     or v_lobby.kind <> 'bande'
     or v_lobby.status <> 'locked'
     or v_lobby.expires_at <= pg_catalog.now()
     or v_lobby.creator_token_hash <> p_creator_token_hash then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;
  if not found or v_partie.status <> 'en_cours' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select t.* into v_tour
    from public.bande_tours t
   where t.partie_id = v_partie.id
     and t.position = v_partie.position;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- IDEMPOTENTE : une question déjà révélée rend `ok` sans rien écrire — et sans
  -- consulter le plancher, qui n'aurait plus rien à protéger.
  if v_tour.status = 'ouverte' then
    -- ── LE PLANCHER DE RÉVÉLATION (revue L18, E-1) ────────────
    -- Le MÊME compte que celui de `bande_vote` et de `bande_state` : les passes
    -- y sont, parce qu'ils verrouillent la question comme un vote.
    select pg_catalog.count(*)::integer into v_exprimes
      from public.bande_votes v
     where v.tour_id = v_tour.id;

    -- `least` NON qualifié : ce n'est pas une fonction du catalogue, la
    -- qualifier casserait à l'exécution (garde `npm run sql:check`).
    v_requis := least(3, v_tour.denominateur);

    if v_exprimes < v_requis then
      -- PAS `unavailable` : une RÈGLE DU JEU, que l'écran doit pouvoir dire.
      return pg_catalog.jsonb_build_object(
        'state', 'trop_tot',
        'requis', v_requis,
        'exprimes', v_exprimes
      );
    end if;

    -- RIEN N'EST RECALCULÉ. Le dénominateur ne bouge pas, les non-votants
    -- restent des abstentions : c'est toute la raison d'être de cette RPC.
    update public.bande_tours t
       set status = 'revelee',
           revealed_at = pg_catalog.clock_timestamp()
     where t.id = v_tour.id
       and t.status = 'ouverte';
  end if;

  return pg_catalog.jsonb_build_object('state', 'ok', 'revelee', true);
end;
$$;

comment on function public.bande_reveal(uuid, text) is
  'L''hôte force la clôture de la question courante de Portrait de la Bande '
  '(L18). Ce bouton existe parce que le dénominateur est FIGÉ : si quelqu''un '
  'ferme son téléphone au milieu d''une question, les présents ne peuvent PLUS '
  'l''atteindre et la révélation automatique n''arrivera jamais. Sans lui, la '
  'promesse « le dénominateur ne change pas durant une question » coûterait une '
  'partie bloquée à chaque départ, et la tentation aurait été de faire baisser '
  'le dénominateur — c''est-à-dire de renoncer à la promesse. LES NON-VOTANTS '
  'RESTENT DES ABSTENTIONS et RIEN n''est recalculé : « 2 personnes sur 5 » dit '
  'la vérité, là où un recalcul sur les seuls votants aurait affiché 100 %. '
  'UN PLANCHER LE GARDE (revue L18, E-1) : la clôture forcée exige '
  'least(3, denominateur) gestes et rend sinon trop_tot avec ses deux '
  'compteurs. SANS LUI, CE BOUTON DÉ-ANONYMISE : l''hôte vote, attend que le '
  'compte passe à deux, clôt, retranche sa propre voix et tient le choix EXACT '
  'de son voisin — ou ne vote pas, attend 0 → 1, et clôt sur une seule ligne de '
  'résultat. Trois, parce que l''hôte peut toujours retrancher le sien : il '
  'reste alors DEUX voix qu''il ne peut pas attribuer. least et non 3 sec parce '
  'qu''une tablée de deux ne l''atteindrait jamais — le plancher y vaut le '
  'dénominateur, donc seule la révélation AUTOMATIQUE joue, et une question qui '
  's''y coince est emportée par close_player_lobby_as_org ou par le TTL. '
  'trop_tot est un état DISTINCT et non unavailable : c''est une règle du jeu, '
  'pas une panne, et l''écran doit pouvoir dire « il faut au moins trois '
  'réponses ». Le plancher est évalué APRÈS creator_token_hash : un membre '
  'ordinaire reçoit le refus GÉNÉRIQUE et n''apprend RIEN du compte. '
  'IDEMPOTENTE — une question déjà révélée rend ok sans rien écrire et sans '
  'consulter le plancher, parce qu''un double-clic devant une table qui attend '
  'ne doit pas punir. L''hôte est reconnu par creator_token_hash (motif '
  'lock_player_lobby). Rendue à service_role.';

revoke all on function public.bande_reveal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bande_reveal(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `bande_next` — LA QUESTION SUIVANTE, OU LE RÉCAPITULATIF
--
-- CONTRAT :
--   {"state":"ok","position":int,"status":"en_cours"}  — question suivante
--   {"state":"ok","position":int,"status":"recap"}     — la partie est finie
--   {"state":"unavailable"}  — TOUT le reste
--
-- ── C'EST ICI, ET NULLE PART AILLEURS, QUE LES DÉPARTS SE RÉSOLVENT ──
--
-- Arbitrage 8, et c'est la lettre du cahier : « déconnexion et sortie ne se
-- résolvent qu'entre deux questions ». Le tour suivant reçoit un dénominateur
-- RE-FIGÉ, compté à cet instant. Quelqu'un est parti pendant la question 3 ? La
-- question 3 garde son « sur 5 » ; la question 4 dira « sur 4 ».
--
-- ── ET CE QUI N'EST PAS ENCORE VRAI, PARCE QU'IL FAUT LE DIRE ──
--
-- « Re-figé » ne change quelque chose que si la liste des présents a bougé — et
-- AUJOURD'HUI, PENDANT UNE PARTIE, ELLE NE BOUGE PAS. `leave_player_lobby` rend
-- `locked` sans rien écrire, `kick_player_lobby` exige `status = 'lobby'` : le
-- socle L16 a laissé la décision à L17/L18, et L18 ne l'a pas prise. Un joueur
-- qui ferme son téléphone reste donc une LIGNE présente, et le dénominateur ne
-- baissera pas à la question suivante — c'est l'hôte qui clôt, question après
-- question, par `bande_reveal`.
--
-- Ce que ce `select count(*)` achète malgré tout n'est pas rien : le jour où un
-- mécanisme de présence, un bouton « retirer un joueur » ou un effacement
-- retirera des lignes, le dénominateur les suivra — ENTRE DEUX QUESTIONS, et
-- nulle part ailleurs. La règle du cahier est donc écrite au bon endroit avant
-- d'avoir quelque chose à observer, plutôt que d'être ajoutée après coup par le
-- lot qui ajoutera le retrait, et qui n'aurait aucune raison de relire ce
-- fichier. Ce qui manque est un mécanisme de PRÉSENCE, et c'est un autre lot.
--
-- ── LA GARDE « LE TOUR COURANT EST RÉVÉLÉ » EST AUSSI L'IDEMPOTENCE ──
--
-- Elle n'est pas seulement une règle de jeu. Le tour qu'on vient de créer est
-- `ouverte`, donc un SECOND appel la trouve ouverte et refuse : il est
-- impossible de sauter une question en cliquant deux fois. Une garde de plus —
-- un compteur, un jeton d'idempotence — aurait dit la même chose deux fois.
--
-- ── LE RÉCAPITULATIF FERME LA SALLE, DANS LA MÊME TRANSACTION (arbitrage 6) ──
--
-- `least(clock_timestamp(), expires_at)` — motif `close_player_lobby_as_org` et
-- `duo_choose` : fermer ne PROLONGE jamais, et `clock_timestamp()` plutôt que
-- `now()` pour qu'une salle créée puis close dans une même transaction ne viole
-- pas `expires_at > created_at`. Ce qui reste à lire se lit par `bande_state` et
-- `bande_recap`, qui n'exigent ni salle vivante ni salle ouverte.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_next(
  p_lobby_id uuid,
  p_creator_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_partie public.bande_parties%rowtype;
  v_tour public.bande_tours%rowtype;
  v_suivante integer;
  v_presents integer;
  v_cles text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found
     or v_lobby.kind <> 'bande'
     or v_lobby.status <> 'locked'
     or v_lobby.expires_at <= pg_catalog.now()
     or v_lobby.creator_token_hash <> p_creator_token_hash then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;
  if not found or v_partie.status <> 'en_cours' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA GARDE QUI EST AUSSI L'IDEMPOTENCE — voir l'en-tête.
  select t.* into v_tour
    from public.bande_tours t
   where t.partie_id = v_partie.id
     and t.position = v_partie.position;
  if not found or v_tour.status <> 'revelee' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if v_partie.position >= v_partie.nb_questions then
    -- LA FIN. Le récapitulatif, et la salle qui ferme avec lui.
    update public.bande_parties p
       set status = 'recap'
     where p.id = v_partie.id;

    -- `least` NON qualifié : ce n'est pas une fonction du catalogue, la
    -- qualifier casserait à l'exécution (garde `npm run sql:check`).
    update public.player_lobbies l
       set status = 'closed',
           expires_at = least(pg_catalog.clock_timestamp(), l.expires_at)
     where l.id = v_lobby.id;

    return pg_catalog.jsonb_build_object(
      'state', 'ok',
      'position', v_partie.position,
      'status', 'recap'
    );
  end if;

  v_suivante := v_partie.position + 1;

  -- LE MÊME PROGRAMME, RECALCULÉ À L'IDENTIQUE. La dérivation ne dépend que de
  -- trois valeurs figées dans `bande_parties` (§8) : la question `v_suivante`
  -- est celle que `bande_start` aurait choisie.
  v_cles := public.bande_questions_tirees(
    v_partie.pack, v_partie.lobby_id, v_partie.nb_questions);
  if coalesce(pg_catalog.array_length(v_cles, 1), 0) < v_suivante then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE DÉNOMINATEUR RE-FIGÉ. C'est ICI que les départs se résolvent, et nulle
  -- part ailleurs (arbitrage 8).
  select pg_catalog.count(*)::integer into v_presents
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;

  -- UNE SALLE VIDE N'OUVRE PAS DE QUESTION (revue L18, I-1). Le `check
  -- (denominateur between 1 and 12)` lèverait ici une 23514 BRUTE, que l'action
  -- appelante ne saurait traduire qu'en panne — là où « la salle n'est plus
  -- jouable » est exactement ce que `unavailable` dit déjà partout dans ce
  -- fichier. Le cas est INATTEIGNABLE aujourd'hui : rien ne retire un membre
  -- d'une partie commencée (voir l'en-tête). C'est précisément pour cela que la
  -- garde s'écrit MAINTENANT — le lot « présence » qui ajoutera ce retrait
  -- n'aura aucune raison de rouvrir ce fichier.
  if v_presents < 1 then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  insert into public.bande_tours
    (partie_id, organization_id, position, question_cle, denominateur)
  values (v_partie.id, v_partie.organization_id, v_suivante,
          v_cles[v_suivante], v_presents);

  update public.bande_parties p
     set position = v_suivante
   where p.id = v_partie.id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'position', v_suivante,
    'status', 'en_cours'
  );
end;
$$;

comment on function public.bande_next(uuid, text) is
  'L''hôte passe à la question suivante de Portrait de la Bande (L18), ou clôt '
  'la partie. C''EST ICI, ET NULLE PART AILLEURS, QUE LES DÉPARTS SE RÉSOLVENT '
  '(arbitrage 8, lettre du cahier) : le tour suivant reçoit un dénominateur '
  'RE-FIGÉ, compté à cet instant — la question 3 garde son « sur 5 », la '
  'question 4 dira « sur 4 ». La garde « le tour courant est révélé » EST aussi '
  'l''idempotence : le tour qu''on vient de créer est ouverte, donc un second '
  'appel refuse, et il est impossible de sauter une question en cliquant deux '
  'fois. À la dernière question, la partie passe recap ET LA SALLE FERME dans '
  'la MÊME TRANSACTION (arbitrage 6), expires_at ramené par '
  'least(clock_timestamp(), expires_at) — fermer ne prolonge jamais. Le '
  'programme est RECALCULÉ à l''identique par bande_questions_tirees, dont la '
  'dérivation ne dépend que de trois valeurs figées dans bande_parties. UNE '
  'SALLE VIDE rend unavailable plutôt que la 23514 brute du check sur '
  'denominateur (revue L18, I-1) : inatteignable aujourd''hui, écrit pour le lot '
  '« présence » qui ne relira pas ce fichier. Hôte reconnu par '
  'creator_token_hash, refus générique pour tout le reste. Rendue à '
  'service_role.';

revoke all on function public.bande_next(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bande_next(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. `bande_state` — LE CŒUR : AUCUN RÉSULTAT AVANT LA RÉVÉLATION
--
-- CONTRAT — SEPT CLÉS, TOUJOURS LES MÊMES :
--   {"state":"ok",
--    "partie":{"pack":text,"position":int,"nb_questions":int,"status":text},
--    "tour":{"position":int,"question_cle":text,"status":text,
--            "denominateur":int,"votes_exprimes":int|null},  ← NULL SI JE N'AI
--                                                              PAS RÉPONDU
--    "mon_vote":{"cible_member_id":uuid|null,"cible_pseudo":text|null}|null,
--    "participants":[{"member_id":uuid,"pseudo":text,
--                     "rang":int,"est_moi":bool}],
--    "resultats":[{"cible_member_id":uuid|null,"cible_pseudo":text,
--                  "voix":int,"pourcentage":int}]|null,  ← NULL AVANT RÉVÉLATION
--    "salle_close":bool}
--   {"state":"unavailable"}  — non-membre, lobby inconnu, partie absente
--
-- ── LA RPC FILTRE, JAMAIS L'ÉCRAN (motif `event_etat_partage`, `duo_state`) ──
--
-- Tant que la question est `ouverte`, LES RÉSULTATS NE SONT PAS DANS LE
-- DOCUMENT. Pas masqués par le client, pas chiffrés, pas « rendus en compte » :
-- ABSENTS. `resultats` est calculé SOUS UN `if`, et non écarté par un `case`
-- qui aurait quand même cherché la valeur avant de la jeter — la garde tient
-- par la STRUCTURE, il n'y a rien à accorder.
--
-- Un document JSON qui transite est un document que l'on peut ouvrir : un
-- `curl`, un onglet « réseau », et le joueur qui triche connaît le résultat
-- avant d'avoir voté. Tout le jeu repose sur le fait que les votes sont
-- scellés ; s'ils ne le sont que par politesse du client, il n'y a plus de jeu.
--
-- ── ET QUI A VOTÉ QUOI N'Y EST JAMAIS, MÊME APRÈS ──
--
-- C'est la différence avec L17, où la révélation MONTRE les deux choix côte à
-- côte. Ici, la révélation montre un DÉCOMPTE PAR CIBLE et rien d'autre :
-- `voter_token_hash` ne sort d'aucune RPC de ce fichier, à aucun moment de la
-- partie. `resultats` agrège, et une agrégation sur une tablée de cinq reste
-- une agrégation — il n'y a pas de ligne à recouper.
--
-- `mon_vote` EST LA SEULE EXCEPTION, et ce n'en est pas une : c'est le mien, il
-- m'est rendu à moi, lu sur MA ligne par mon propre jeton. Personne d'autre ne
-- peut demander cette ligne — la RPC ne prend pas de paramètre pour désigner
-- un autre votant.
--
-- ── `votes_exprimes` EST UN COMPTE, ET IL NE VA QU'À QUI A RÉPONDU ──
--
-- « Trois ont répondu, on attend deux personnes » est l'attente invisible : un
-- fait sur le NOMBRE de gestes, jamais sur leur auteur ni sur leur contenu. Les
-- passes y comptent — ils verrouillent la question comme un vote (arbitrage 1),
-- et c'est le MÊME compte que celui qui déclenche la révélation, ce qui est la
-- raison pour laquelle l'écran peut afficher une barre de progression honnête.
--
-- MAIS IL EST NUL POUR QUI N'A PAS ENCORE SCELLÉ LE SIEN (revue L18, E-1). Un
-- non-votant qui regarde le compte monter apprend QUAND les autres répondent :
-- assis à la même table, il voit qui vient de poser son téléphone, et le compte
-- lui dit que c'était un vote. C'est le même renseignement que celui dont le
-- plancher de `bande_reveal` prive l'hôte — l'y laisser entrer par la porte de
-- la lecture aurait rendu le plancher décoratif. Le prix est nul : celui qui n'a
-- pas répondu n'a rien à attendre, il a à répondre.
--
-- IL EST NUL, ET NON ABSENT. La clé reste dans le document, motif `resultats` :
-- une forme STABLE se type une fois côté application. Et comme `resultats`, il
-- n'est pas écarté à l'écriture — il n'est PAS CHERCHÉ.
--
-- ── LES SEPT CLÉS SONT TOUJOURS PRÉSENTES ──
--
-- `resultats` vaut `null` avant la révélation plutôt que de disparaître. Motif
-- `lobby_state` / `duo_state` : un document de forme STABLE se type une fois
-- côté application, là où une clé qui apparaît et disparaît se teste à chaque
-- lecture — et une clé qu'on oublie de tester est une clé qu'on affiche.
--
-- ── `member_id` SORT, ET IL LE FAUT ──
--
-- `lobby_state` (L16) ne rend que pseudo et rang. Ici l'écran doit pouvoir
-- DÉSIGNER quelqu'un, donc `bande_vote` prend un `cible_member_id`, donc
-- `participants` le porte. Ce n'est pas un jeton : c'est l'identifiant d'une
-- ligne, il ne vaut que dans cette salle, il n'ouvre aucune porte, et seul un
-- membre de la salle peut l'obtenir. Le pseudo l'accompagne parce qu'il est
-- déjà saisi pour être vu.
--
-- ── NI SALLE VIVANTE, NI SALLE OUVERTE ──
--
-- Contrairement à `bande_vote`, cette RPC ne fait de `status` ni d'`expires_at`
-- une CONDITION D'ACCÈS : le récapitulatif FERME la salle, donc toute exigence
-- de ce genre rendrait `unavailable` exactement à l'écran de fin. Ce qui est
-- exigé, et qui suffit : ÊTRE MEMBRE, et que la partie existe. `salle_close`
-- RAPPORTE l'état de la salle — le fait voyage sur le sondage qui tourne
-- encore, motif R-2 de la contre-revue L17 — sans jamais servir à refuser.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_partie public.bande_parties%rowtype;
  v_tour public.bande_tours%rowtype;
  -- SANS VALEUR TANT QUE JE N'AI PAS RÉPONDU, et pour la même raison que
  -- `v_resultats` ci-dessous : ce `null` initial EST la garde.
  v_exprimes integer := null;
  v_mon_vote jsonb := null;
  -- SANS VALEUR TANT QUE LA QUESTION N'EST PAS RÉVÉLÉE. Ce `null` initial est
  -- la garde : il n'est pas écarté à l'écriture du document, il n'a jamais été
  -- cherché.
  v_resultats jsonb := null;
  v_salle_close boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'bande' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'APPARTENANCE EST LA SEULE GARDE, ET ELLE SUFFIT. Le refus est INDISTINCT
  -- de celui d'un lobby inconnu : sans cela, un identifiant de salle volé
  -- suffirait à lire une partie où l'on n'a pas été invité.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA SALLE A-T-ELLE CESSÉ D'ACCUEILLIR. Les deux moitiés sont nécessaires :
  -- l'expiration se CONSTATE et ne s'écrit pas (ADR-111), donc une salle
  -- dépassée porte encore `locked` dans sa colonne.
  v_salle_close := v_lobby.status in ('closed', 'expired')
                   or v_lobby.expires_at <= pg_catalog.now();

  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select t.* into v_tour
    from public.bande_tours t
   where t.partie_id = v_partie.id
     and t.position = v_partie.position;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- MON vote : toujours lisible, c'est le mien, et il est lu sur MA ligne par
  -- mon propre jeton. IL EST LU EN PREMIER parce que c'est lui qui décide si le
  -- compte a le droit de sortir.
  select pg_catalog.jsonb_build_object(
           'cible_member_id', v.cible_member_id,
           'cible_pseudo', v.cible_pseudo)
    into v_mon_vote
    from public.bande_votes v
   where v.tour_id = v_tour.id
     and v.voter_token_hash = p_token_hash;

  -- LE COMPTE, ET RIEN QUE LE COMPTE — voir l'en-tête. Les passes y sont, parce
  -- qu'ils verrouillent la question comme un vote.
  --
  -- ET SEULEMENT POUR QUI A DÉJÀ SCELLÉ LE SIEN (revue L18, E-1). Comme
  -- `resultats`, il n'est pas écarté à l'écriture du document : il n'est PAS
  -- CHERCHÉ, et la garde tient par la STRUCTURE.
  if v_mon_vote is not null then
    select pg_catalog.count(*)::integer into v_exprimes
      from public.bande_votes v
     where v.tour_id = v_tour.id;
  end if;

  -- ── LA BRANCHE RÉVÉLÉE, ET ELLE SEULE ──────────────────────
  if v_tour.status = 'revelee' then
    -- LE DÉCOMPTE PAR CIBLE. `cible_pseudo is not null` écarte les PASSES : ils
    -- comptent au dénominateur (arbitrage 1) et ne donnent leur voix à
    -- personne, donc ils n'ont pas de ligne de résultat.
    --
    -- LE POURCENTAGE EST CALCULÉ ICI, sur le dénominateur FIGÉ, et rendu
    -- ENTIER : l'écran affiche ce que le serveur a calculé, il ne refait pas la
    -- division. Deux arrondis, celui du serveur et celui du navigateur,
    -- finiraient par différer d'un point sur une tablée de sept.
    --
    -- L'ORDRE EST TOTAL — voix décroissantes, puis pseudo — et SANS BORNE :
    -- tous les ex æquo sortent (arbitrage 3). Nommer un gagnant unique aurait
    -- demandé de trancher au hasard entre deux personnes réelles.
    --
    -- LE REGROUPEMENT PORTE SUR (identité, nom gravé). Deux cibles disparues
    -- qui portaient le MÊME pseudo se confondraient donc en une ligne : c'est
    -- accepté, parce que les pseudos d'une salle ne sont pas uniques et que le
    -- cas suppose deux départs et deux homonymes dans la même partie.
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'cible_member_id', x.cible_member_id,
                 'cible_pseudo', x.cible_pseudo,
                 'voix', x.voix,
                 'pourcentage', x.pourcentage)
               order by x.voix desc, x.cible_pseudo),
             '[]'::jsonb)
      into v_resultats
      from (
        select v.cible_member_id,
               v.cible_pseudo,
               pg_catalog.count(*)::integer as voix,
               pg_catalog.round(
                 100.0 * pg_catalog.count(*) / v_tour.denominateur
               )::integer as pourcentage
          from public.bande_votes v
         where v.tour_id = v_tour.id
           and v.cible_pseudo is not null
         group by v.cible_member_id, v.cible_pseudo
      ) x;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'partie', pg_catalog.jsonb_build_object(
      'pack', v_partie.pack,
      'position', v_partie.position,
      'nb_questions', v_partie.nb_questions,
      'status', v_partie.status
    ),
    'tour', pg_catalog.jsonb_build_object(
      'position', v_tour.position,
      'question_cle', v_tour.question_cle,
      'status', v_tour.status,
      'denominateur', v_tour.denominateur,
      'votes_exprimes', v_exprimes
    ),
    'mon_vote', v_mon_vote,
    -- LES PARTICIPANTS, par le rang de L16 : `player_lobby_rang` est LA formule
    -- du rang, écrite une fois (motif `queue_entry_position`). Deux formules
    -- montreraient deux rangs différents de la même personne sur deux écrans
    -- ouverts en même temps.
    'participants', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'member_id', m.id,
                 'pseudo', m.pseudo,
                 'rang', public.player_lobby_rang(
                           m.lobby_id, m.joined_at, m.id),
                 'est_moi', m.token_hash = p_token_hash)
               order by public.player_lobby_rang(
                          m.lobby_id, m.joined_at, m.id))
        from public.player_lobby_members m
       where m.lobby_id = v_lobby.id
    ), '[]'::jsonb),
    'resultats', v_resultats,
    'salle_close', v_salle_close
  );
end;
$$;

comment on function public.bande_state(uuid, text) is
  'Ce que voit un joueur de Portrait de la Bande (L18), et LE CŒUR DU LOT — '
  'motif event_etat_partage / duo_state : LA RPC FILTRE, JAMAIS L''ÉCRAN. Tant '
  'que la question est ouverte, LES RÉSULTATS NE SONT PAS DANS LE DOCUMENT : ni '
  'masqués, ni chiffrés, ni « rendus en compte » — ABSENTS. resultats est '
  'calculé SOUS UN `if` et non écarté par un `case` : la garde tient par la '
  'STRUCTURE. ET QUI A VOTÉ QUOI N''Y EST JAMAIS, MÊME APRÈS — c''est la '
  'différence avec L17, où la révélation montre les deux choix côte à côte : '
  'ici elle montre un DÉCOMPTE PAR CIBLE, et voter_token_hash ne sort d''aucune '
  'RPC de ce fichier à aucun moment. mon_vote n''est pas une exception : c''est '
  'le mien, lu sur MA ligne par mon propre jeton, et la RPC ne prend aucun '
  'paramètre pour désigner un autre votant. votes_exprimes est un COMPTE — '
  '« trois ont répondu », jamais qui ni pour qui — et c''est l''attente '
  'invisible que le cahier autorise ; les passes y comptent, c''est le MÊME '
  'compte que celui qui déclenche la révélation. MAIS IL EST NUL POUR QUI N''A '
  'PAS ENCORE SCELLÉ LE SIEN (revue L18, E-1) : à la même table, voir le compte '
  'monter apprend QUAND le voisin répond, donc que ce qu''il vient de faire '
  'était un vote — c''est le renseignement même dont le plancher de '
  'bande_reveal prive l''hôte, et l''y laisser entrer par la lecture aurait '
  'rendu ce plancher décoratif. NUL et non ABSENT : la clé reste, la forme est '
  'stable, et le compte n''est pas écarté à l''écriture — il n''est pas '
  'CHERCHÉ. Le POURCENTAGE est calculé ici '
  'sur le dénominateur FIGÉ et rendu ENTIER : deux arrondis, serveur et '
  'navigateur, finiraient par différer d''un point. Tous les EX ÆQUO sortent, '
  'sans borne. member_id SORT, contrairement à lobby_state, parce que l''écran '
  'doit pouvoir DÉSIGNER quelqu''un : ce n''est pas un jeton mais un '
  'identifiant de ligne, valable dans cette salle seule, obtenable par ses '
  'seuls membres. Les SEPT clés sont toujours présentes (resultats à null '
  'plutôt qu''absente). N''exige NI salle vivante NI salle ouverte, '
  'contrairement à bande_vote : le récapitulatif ferme la salle, donc l''exiger '
  'rendrait unavailable à l''écran de fin ; salle_close RAPPORTE l''état sans '
  'jamais servir à refuser. Appartenance exigée, refus indistinct. Rendue à '
  'service_role.';

revoke all on function public.bande_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bande_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 13. `bande_recap` — LE PORTRAIT DE SESSION, ET RIEN DE PLUS
--
-- CONTRAT :
--   {"state":"ok",
--    "portrait":[{"cible_member_id":uuid|null,"cible_pseudo":text,
--                 "fois_nomme":int,"questions":[text]}]}
--   {"state":"unavailable"}  — non-membre, lobby inconnu, partie absente
--
-- ── CE QU'IL EST, ET CE QU'IL N'EST PAS (arbitrage 4) ──
--
-- « Qui a été nommé, sur quelles questions » — pour CETTE partie, et pour elle
-- seule. Il n'existe nulle part ailleurs : il se calcule à la lecture sur les
-- votes de la salle, et il disparaît avec elle (cascade depuis
-- `player_lobbies`, donc `purge_expired_lobbies`). Ce n'est pas un profil, ce
-- n'est pas un palmarès, et il ne se compare à aucune autre soirée.
--
-- ── SEULS LES TOURS RÉVÉLÉS Y ENTRENT ──
--
-- C'est la garde qui empêche cette RPC de devenir une porte dérobée sur la
-- question EN COURS. Sans elle, il aurait suffi d'appeler `bande_recap` pendant
-- qu'on vote pour lire ce que `bande_state` refuse de dire. La règle « aucun
-- résultat avant révélation » vaut pour les DEUX lectures, ou elle ne vaut pour
-- aucune.
--
-- ── SEULS LES NOMMÉS APPARAISSENT ──
--
-- Quelqu'un que personne n'a nommé n'a pas de ligne. Lister tout le monde avec
-- un zéro aurait fabriqué exactement le classement que le cahier exclut : un
-- tableau où chacun lit son rang par le bas. Le portrait dit qui a été nommé,
-- pas qui ne l'a pas été.
--
-- ── AUCUNE EXIGENCE DE FIN DE PARTIE ──
--
-- La RPC ne demande pas `status = 'recap'`. Elle n'a pas à le faire : la garde
-- utile est celle des tours révélés, et l'exiger aurait rendu `unavailable` à
-- un écran de fin rechargé après la fermeture de la salle — le même piège
-- qu'évite `bande_state`.
--
-- `voter_token_hash` NE SORT PAS D'ICI NON PLUS. Le portrait ne dit QUE des
-- cibles ; le chemin qui mène d'un votant à son vote n'existe dans aucun
-- document de ce fichier.
-- ────────────────────────────────────────────────────────────

create or replace function public.bande_recap(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_partie public.bande_parties%rowtype;
  v_portrait jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found or v_lobby.kind <> 'bande' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_partie
    from public.bande_parties p
   where p.lobby_id = v_lobby.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- `nommes` porte UNE LIGNE PAR VOTE reçu, sur les tours RÉVÉLÉS seulement.
  -- `fois_nomme` compte ces lignes ; `questions` compte les tours DISTINCTS,
  -- parce que deux personnes peuvent nommer la même cible sur la même question.
  with nommes as (
    select v.cible_member_id,
           v.cible_pseudo,
           t.position,
           t.question_cle
      from public.bande_votes v
      join public.bande_tours t
        on t.id = v.tour_id
       and t.organization_id = v.organization_id
     where t.partie_id = v_partie.id
       and t.status = 'revelee'
       and v.cible_pseudo is not null
  ),
  compte as (
    select n.cible_member_id,
           n.cible_pseudo,
           pg_catalog.count(*)::integer as fois_nomme
      from nommes n
     group by n.cible_member_id, n.cible_pseudo
  ),
  questions as (
    select d.cible_member_id,
           d.cible_pseudo,
           pg_catalog.array_agg(d.question_cle order by d.position) as cles
      from (select distinct n.cible_member_id, n.cible_pseudo,
                   n.position, n.question_cle
              from nommes n) d
     group by d.cible_member_id, d.cible_pseudo
  )
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'cible_member_id', c.cible_member_id,
               'cible_pseudo', c.cible_pseudo,
               'fois_nomme', c.fois_nomme,
               'questions', pg_catalog.to_jsonb(q.cles))
             order by c.fois_nomme desc, c.cible_pseudo),
           '[]'::jsonb)
    into v_portrait
    from compte c
    join questions q
      on q.cible_pseudo = c.cible_pseudo
     -- `is not distinct from` : les cibles DISPARUES portent un identifiant
     -- nul, et `=` ne les aurait jamais jointes.
     and q.cible_member_id is not distinct from c.cible_member_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'portrait', coalesce(v_portrait, '[]'::jsonb)
  );
end;
$$;

comment on function public.bande_recap(uuid, text) is
  'Le portrait de SESSION d''une partie de Portrait de la Bande (L18) : qui a '
  'été nommé, combien de fois, et sur quelles questions — pour CETTE partie et '
  'pour elle seule. Il n''existe nulle part ailleurs, se calcule à la lecture, '
  'et disparaît avec la salle (cascade depuis player_lobbies, donc '
  'purge_expired_lobbies) : ce n''est ni un profil, ni un palmarès, et il ne se '
  'compare à aucune autre soirée (arbitrage 4). SEULS LES TOURS RÉVÉLÉS Y '
  'ENTRENT, et c''est la garde qui empêche cette RPC de devenir une porte '
  'dérobée sur la question EN COURS — « aucun résultat avant révélation » vaut '
  'pour les DEUX lectures ou pour aucune. SEULS LES NOMMÉS APPARAISSENT : '
  'lister tout le monde avec un zéro aurait fabriqué le classement que le '
  'cahier exclut, un tableau où chacun lit son rang par le bas. N''exige PAS '
  'status = recap, pour la même raison que bande_state n''exige pas une salle '
  'vivante : un écran de fin rechargé doit encore lire. fois_nomme compte les '
  'VOTES reçus, questions compte les TOURS distincts — deux personnes peuvent '
  'nommer la même cible sur la même question. voter_token_hash ne sort pas '
  'd''ici non plus. Appartenance exigée, refus indistinct. Rendue à '
  'service_role.';

revoke all on function public.bande_recap(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bande_recap(uuid, text)
  to service_role;
