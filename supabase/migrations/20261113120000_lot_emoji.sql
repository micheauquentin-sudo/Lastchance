-- ============================================================
-- UN LOT PORTE UN EMOJI (EMOJI-1)
--
-- ── CE QUE LA COLONNE STOCKE, ET CE QU'ELLE NE STOCKE PAS ──
--
-- L'emoji CHOISI par le commerçant, ou `null`. Les suggestions, elles, vivent
-- entièrement côté TypeScript (`src/lib/emoji-lexique.ts`) : la base ne
-- devine rien, ne complète rien, et n'écrit jamais un emoji que personne n'a
-- cliqué. C'est l'arbitrage du chantier — suggéré, jamais imposé — et il
-- explique pourquoi la colonne est nullable sans valeur par défaut : `null`
-- veut dire « le commerçant n'en a pas voulu », pas « on n'a pas encore
-- calculé ».
--
-- ── LA CONTRAINTE, ET POURQUOI 8 ──
--
-- `char_length` compte les points de code, pas les octets. Un emoji simple en
-- vaut 1, un emoji + sélecteur de variation 2, un drapeau régional 2, une
-- famille ZWJ jusqu'à 7. Huit laisse passer tout ce qu'un sélecteur d'emoji
-- peut légitimement produire et refuse qu'on détourne la colonne en second
-- champ de libellé. Le minimum de 1 refuse la chaîne vide : elle se lirait à
-- l'écran comme `null` tout en s'en distinguant en base, et deux
-- représentations du même « rien » finissent toujours par diverger.
--
-- ── LES GRANTS, ET LA LEÇON DE 20261112120000 ──
--
-- Ce dépôt vient de perdre six lots de travail sur une colonne livrée sans son
-- grant : `reservation_activities.booking_mode` (RDV-1) était insérée par une
-- server action qui échouait sur « permission denied for column », et tout un
-- module reposait dessus.
--
-- `public.prizes` n'a PAS ce défaut par construction — 00018 y accorde
-- `insert` et `update` AU NIVEAU TABLE, donc une colonne neuve en hérite. On
-- accorde quand même explicitement, et surtout on VÉRIFIE : le coût est nul,
-- et la garde ci-dessous transforme « je crois que la table est en grant
-- global » en fait constaté à l'application. Si quelqu'un resserre un jour
-- `prizes` en grants nominatifs — c'est le sens de l'histoire ici —, cette
-- migration ne se laissera pas oublier en silence.
-- ============================================================


alter table public.prizes
  add column if not exists emoji text
    check (emoji is null or char_length(emoji) between 1 and 8);


grant insert (emoji) on public.prizes to authenticated;
grant update (emoji) on public.prizes to authenticated;


-- ────────────────────────────────────────────────────────────
-- GARDE D'APPLICATION
--
-- Elle échoue ICI, à la migration, et non trois écrans plus loin sous la forme
-- d'un « Mise à jour impossible » que personne ne sait relier à un droit.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.prizes', 'emoji', 'INSERT')
  then
    raise exception
      'prizes.emoji n est pas insérable : un lot créé depuis le tableau de bord naitrait sans son icone';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.prizes', 'emoji', 'UPDATE')
  then
    raise exception
      'prizes.emoji n est pas modifiable : le commercant ne pourrait jamais changer ni retirer l icone d un lot';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.prizes', 'emoji', 'SELECT')
  then
    raise exception
      'prizes.emoji ne se lit pas : l editeur de lots ne pourrait pas montrer le choix deja fait';
  end if;

  -- CONTRÔLE NÉGATIF — ET IL A CORRIGÉ MA PRÉMISSE, À L'APPLICATION.
  --
  -- J'avais écrit ici « organization_id ne doit pas être modifiable », par
  -- analogie avec 20261112120000. La migration a REFUSÉ de s'appliquer : sur
  -- `prizes`, 00018 accorde `update` AU NIVEAU TABLE, donc TOUTES les colonnes
  -- le sont, `organization_id` comprise. Ce n'est pas un défaut et ce n'est
  -- pas à réparer ici : ce qui empêche un éditeur de déplacer un lot chez le
  -- voisin, c'est la policy RLS (`with check` sur l'organisation de session),
  -- pas le grant. Le grant dit QUELLES COLONNES, la policy QUELLES LIGNES.
  --
  -- Le contrôle utile est donc l'autre bout : `anon` — le rôle du joueur, qui
  -- LIT la roue publique — ne doit toucher à rien.
  if pg_catalog.has_column_privilege('anon', 'public.prizes', 'emoji', 'UPDATE')
  then
    raise exception
      'prizes.emoji est modifiable par anon : un joueur pourrait rehabiller les lots de la roue';
  end if;
end
$migration$;


comment on column public.prizes.emoji is
  'Icône CHOISIE par le commerçant pour ce lot (null = aucune). Les '
  'suggestions sont calculées côté application à partir du libellé '
  '(src/lib/emoji-lexique.ts) : rien n''est écrit ici sans un clic. Rendue '
  'côté joueur dans un élément aria-hidden à part, JAMAIS concaténée au '
  'libellé — un sélecteur de variation dans un nom accessible casse les '
  'locators Playwright.';
