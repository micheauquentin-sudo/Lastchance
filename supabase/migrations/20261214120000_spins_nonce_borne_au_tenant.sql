-- ============================================================
-- LE NONCE DE REJEU EST UNIQUE PAR COMMERCE, PLUS GLOBALEMENT (JOB-9)
--
-- ── L'ÉTAT DES LIEUX, ET LE DÉSACCORD QU'IL FAUT NOMMER ─────
--
-- `spins_idempotency_key_idx` (20260927120000 `:77-79`) est unique sur la
-- SEULE colonne `idempotency_key`, sans `organization_id`. Ce n'était pas un
-- oubli : la migration l'écrit en toutes lettres — « UNICITÉ GLOBALE, et c'est
-- un choix […] un nonce rejoué par quelqu'un d'autre ne peut pas produire un
-- second spin ; il se heurte à cet index (23505) au lieu de passer ».
--
-- La propriété visée est réelle et on la garde. Ce qu'elle emporte avec elle,
-- en revanche, est un COUPLAGE ENTRE LOCATAIRES : deux commerces dont les
-- serveurs choisiraient le même nonce partagent une contrainte. Le second
-- insert lève `unique_violation` et le tirage échoue — chez quelqu'un qui
-- n'a rien fait. Indisponibilité croisée, pas de fuite ; portée faible, le
-- nonce étant généré côté serveur et jamais par le client. Mais c'est
-- exactement le genre de couplage qu'un SaaS multi-locataire n'a aucune raison
-- de conserver quand il peut ne pas l'avoir.
--
-- ── CE QUE LE NOUVEL INDEX GARDE, ET CE QU'IL LÂCHE ─────────
--
-- GARDÉ : au sein d'un commerce, un nonce reste unique. Le rejeu par un AUTRE
-- joueur du même commerce — le seul scénario réaliste, un nonce étant signé
-- pour une roue donnée de ce commerce — se heurte toujours au 23505, et la
-- recherche bornée au joueur (`wheel_id` + `player_key`, 20261210120000
-- `:208-213`) continue de ne rien lui rendre. Ni fuite, ni double tirage : la
-- phrase de 20260927120000 reste vraie.
--
-- LÂCHÉ : la collision entre deux commerces. Un nonce d'un commerce voisin
-- n'est plus un refus, il est simplement inconnu — ce qui est la description
-- exacte de ce qu'il est.
--
-- ── L'ORDRE DES COLONNES EST LE CŒUR DE CE FICHIER ──────────
--
-- `(idempotency_key, organization_id)` et NON `(organization_id,
-- idempotency_key)`. Les deux disent la même unicité ; une seule sert encore
-- de chemin de lecture.
--
-- La recherche de rejeu lit `where s.idempotency_key = … and s.wheel_id = …
-- and s.player_key = …` — SANS `organization_id`. Un index mené par
-- `organization_id` ne peut pas la servir : colonne de tête absente du
-- prédicat, donc parcours séquentiel de `spins`, la plus grosse table du
-- projet, à chaque appel portant un nonce. La migration d'origine disait
-- « Garde ET index de lecture, une seule structure » : mené par
-- `idempotency_key`, l'index reste les deux.
--
-- ── AUCUNE LIGNE EXISTANTE NE PEUT LE VIOLER, ET C'EST DÉMONTRABLE ──
--
-- La contrainte est STRICTEMENT AFFAIBLIE : tout ensemble de lignes unique sur
-- `idempotency_key` l'est aussi sur `(idempotency_key, organization_id)`.
-- Aucune donnée ne peut donc faire échouer cette migration — la vérification
-- n'a pas besoin d'être empirique, elle est structurelle. (Constaté par
-- ailleurs sur la base locale : `spins` y porte 0 nonce.)
--
-- ── L'ORDRE DES DEUX ORDRES ─────────────────────────────────
--
-- Création AVANT suppression : entre les deux, la table reste couverte par une
-- garde d'unicité, et le chemin de lecture ne disparaît jamais. Les migrations
-- s'appliquent dans une transaction, donc la fenêtre n'est de toute façon
-- visible de personne — mais l'inverse serait la mauvaise habitude.
-- ============================================================

create unique index if not exists spins_idempotency_key_org_idx
  on public.spins(idempotency_key, organization_id)
  where idempotency_key is not null;

drop index if exists public.spins_idempotency_key_idx;

comment on index public.spins_idempotency_key_org_idx is
  'Nonce d''idempotence unique PAR COMMERCE (JOB-9, 20261214120000). Remplace '
  '`spins_idempotency_key_idx`, unique globalement, qui faisait échouer le '
  'tirage d''un commerce parce qu''un autre avait tiré le même nonce. '
  'ORDRE DES COLONNES DÉLIBÉRÉ : `idempotency_key` en tête parce que la '
  'recherche de rejeu de `perform_atomic_spin` filtre sur (clé, wheel_id, '
  'player_key) et JAMAIS sur l''organisation — mené par `organization_id`, '
  'cet index cesserait de servir cette lecture et la renverrait en parcours '
  'séquentiel. Partiel : les spins sans nonce, l''immense majorité, n''y '
  'entrent pas.';

comment on column public.spins.idempotency_key is
  'Nonce d''idempotence de l''appel qui a produit ce spin (JOB-8, '
  '20260927120000). Null : appel sans nonce — le cas de tous les spins '
  'antérieurs et de la roue classique. Non null : un second '
  'perform_atomic_spin portant la MÊME clé rend l''issue de celui-ci sans rien '
  'réécrire ni décrémenter. Fourni par le serveur (nonce signé du défi), '
  'jamais par le client. Unique PAR COMMERCE depuis 20261214120000 (JOB-9) et '
  'non plus globalement : deux commerces ne partagent plus une contrainte, un '
  'rejeu au sein d''un même commerce se heurte toujours au 23505.';
