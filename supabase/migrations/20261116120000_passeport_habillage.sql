-- ============================================================
-- LE PASSEPORT DE FIDÉLITÉ S'HABILLE COMME LES AUTRES JEUX (FID-3a)
--
-- ── CE QUI MANQUE AUJOURD'HUI ──
--
-- Toutes les mécaniques du socle portent un habillage choisi par le
-- commerçant : `wheels.style` (00006) est un jsonb libre relu par
-- `resolveWheelStyle` (`src/lib/wheel-style.ts`), qui y trouve un fond
-- d'écran (`fond`, clé de `FOND_KEYS`), une police, des couleurs. Le
-- passeport, lui, n'a RIEN : ses classes sont en dur, et aucune colonne de
-- `loyalty_programs` ne peut recevoir un choix. Un commerçant qui habille sa
-- roue aux couleurs de Noël voit son passeport rester gris.
--
-- Cette migration pose la colonne qui manque, et RIEN D'AUTRE : le rendu, le
-- schéma zod et l'éditeur sont du ressort du code applicatif.
--
-- ── POURQUOI UN JSONB LIBRE, ET PAS UNE COLONNE PAR RÉGLAGE ──
--
-- La demande d'aujourd'hui tient en un mot : un fond d'écran. Une colonne
-- `fond text` la couvrirait — et c'est précisément le piège. L'habillage
-- d'une roue a grossi en un an de `fond` à une vingtaine de champs (anneau,
-- moyeu, pointeur, police, dégradés, bouton, accroche, animations, puis un
-- sous-objet `games` par mécanique). Chacun de ces champs, en colonnes,
-- aurait été une migration, un grant de colonne, une ligne de plus dans les
-- six listes `select` explicites qui traversent le code — et un oubli
-- possible à chaque étape.
--
-- Le jsonb a tenu ce cycle sans une seule migration : `wheel-style.ts`
-- ajoute un champ optionnel, la base ne bouge pas, et les styles déjà
-- enregistrés restent valides tels quels. C'est le précédent du dépôt, il
-- est explicitement documenté comme tel (voir l'en-tête de
-- `wheelStyleSchema` : « entièrement OPTIONNEL et donc SANS MIGRATION »), et
-- on le reprend ici pour la même raison : le passeport doit pouvoir accueillir
-- une couleur, une police, une accroche, sans revenir en base.
--
-- La contrepartie est connue et assumée : la base ne valide pas le CONTENU.
-- C'est le rôle du schéma zod côté application, à l'écriture comme à la
-- lecture — exactement le partage retenu pour les roues.
--
-- ── LE `CHECK` NE PARLE QUE DE LA FORME, DÉLIBÉRÉMENT ──
--
-- Il exige un OBJET : ni tableau, ni chaîne, ni nombre, ni `'null'::jsonb`.
-- C'est la seule chose dont la base ait besoin pour que `style ->> 'fond'`
-- ait un sens et que le code puisse lire le jsonb sans se défendre contre
-- une structure absurde.
--
-- Il n'énumère PAS les fonds, et ce n'est pas un oubli. Le catalogue vit
-- dans `src/lib/fonds-ecran.ts` (`FOND_KEYS`), et il bouge : dix clés
-- aujourd'hui, une de plus au prochain thème saisonnier. Graver cette liste
-- dans une contrainte ferait payer une MIGRATION à chaque image ajoutée, et
-- — plus grave — un retrait de clé rendrait INVALIDES des lignes déjà
-- enregistrées, donc non modifiables : le commerçant perdrait l'accès à son
-- propre style à cause d'une image qu'on a retirée du catalogue. Le code
-- traite déjà ce cas proprement (`fond` porte un `.catch(undefined)` en
-- LECTURE : une clé disparue rend une page sans fond, jamais une erreur) et
-- refuse une clé inconnue en ÉCRITURE (`wheelStyleWriteSchema`). La
-- validation du contenu appartient à cette couche-là, pas à celle-ci.
--
-- Le plafond de taille, lui, EST une contrainte de forme : il borne un jsonb
-- écrit depuis un formulaire. `wheels.style` porte le même (00006), à la
-- même valeur.
--
-- ── LES DROITS : LA PARTIE QUI A DÉJÀ COÛTÉ SIX LOTS ──
--
-- `loyalty_programs` accorde ses droits COLONNE PAR COLONNE (20260725120000 :
-- le secret du code tournant ne doit jamais sortir, donc aucun grant de
-- table pour `authenticated`). Une colonne ajoutée ensuite n'hérite de RIEN.
--
-- Ce n'est pas une hypothèse : c'est arrivé sur CETTE table.
-- 20261112130000 a posé `jackpot_campaign_id` sans ses grants, et
-- 20261112150000 a dû réparer — son en-tête dit le symptôme exact :
-- « PostgREST refuse la lecture du détail et le dashboard la transforme à
-- tort en page introuvable ». C'est la mécanique qui rend ce défaut si cher :
-- PostgREST refuse le `select` EN ENTIER dès qu'une colonne de la liste n'est
-- pas accordée. L'écran ne se dégrade pas — il DISPARAÎT, et le message ne
-- parle pas de droits. Même histoire six lots durant sur
-- `reservation_activities` (20261112120000).
--
-- Ici, la liste `select` de l'éditeur est explicite et nominative
-- (`src/app/dashboard/loyalty/[id]/page.tsx`, une chaîne de douze colonnes)
-- et la page utilise le client de SESSION (`createClient`, rôle
-- `authenticated`). Ajouter `style` à cette chaîne sans le `grant select`
-- ci-dessous ferait donc exactement disparaître la page de configuration du
-- passeport.
--
-- ── CE QUE CE FICHIER N'ACCORDE PAS, ET POURQUOI ──
--
--   * Pas d'`insert` pour `authenticated`. Un programme NAÎT sans habillage
--     (`style` à null = le rendu par défaut, strictement celui d'aujourd'hui)
--     et le commerçant l'habille ensuite depuis l'éditeur. C'est le
--     raisonnement retenu pour `table_turn_minutes` (20261112120000 §2) et
--     le choix fait pour `jackpot_campaign_id` (20261112150000, `select` +
--     `update` seulement) : accorder l'insertion ouvrirait un champ de
--     formulaire que personne ne rend. La création par modèle
--     (`apply_experience_blueprint_version`) est `security definer` et ne
--     dépend d'aucun grant de colonne.
--
--   * Rien pour `anon`. Le passeport public NE PASSE PAS par `anon` : il est
--     servi par `src/lib/loyalty-context.ts`, qui utilise `createAdminClient`
--     — le rôle `service_role`, lequel détient déjà un `grant select` DE
--     TABLE (20260725120000, fin du bloc de grants) et couvre donc les
--     colonnes futures sans rien ajouter. La garde ci-dessous le VÉRIFIE au
--     lieu de le supposer, dans les deux sens : lisible par `service_role`,
--     fermé à `anon`.
--
--   * Aucune policy. Les policies existantes disent QUELLES LIGNES —
--     `is_org_member` en lecture, `is_org_editor` en écriture — et bornent
--     déjà l'habillage au tenant propriétaire. Les grants disent QUELLES
--     COLONNES. Les deux sont nécessaires ; seul le second manquait.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. La colonne
--
-- NULLABLE, défaut `null`, et c'est le point important : `null` signifie
-- « aucun habillage choisi », donc le rendu par défaut. Les programmes déjà
-- en production gardent ainsi EXACTEMENT leur apparence actuelle, sans
-- réécriture de ligne ni valeur inventée à leur place. C'est le seul écart
-- avec `wheels.style` (`not null default '{}'`), et il est délibéré :
-- l'absence de choix se distingue ici d'un objet vide.
-- ────────────────────────────────────────────────────────────

alter table public.loyalty_programs
  add column if not exists style jsonb;

alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_style_objet_check;

alter table public.loyalty_programs
  add constraint loyalty_programs_style_objet_check
    check (
      style is null
      or (
        pg_catalog.jsonb_typeof(style) = 'object'
        and pg_catalog.pg_column_size(style) <= 8192
      )
    );

comment on column public.loyalty_programs.style is
  'HABILLAGE du passeport, jsonb LIBRE et optionnel — même contrat que '
  'wheels.style : le fond d''écran (clé de FOND_KEYS, src/lib/fonds-ecran.ts), '
  'et plus tard couleurs, police et accroche, s''y ajoutent SANS MIGRATION. '
  'null = aucun choix, donc l''habillage par défaut. Le check ne porte que sur '
  'la FORME (un objet, borné en taille) : le CONTENU est validé par le schéma '
  'zod côté application, à l''écriture comme à la lecture, afin qu''une clé '
  'retirée du catalogue n''invalide jamais une ligne déjà enregistrée. '
  'Lisible et modifiable par une session marchande depuis FID-3a ; le rendu '
  'public du passeport le lit via le service role (src/lib/loyalty-context.ts).';


-- ────────────────────────────────────────────────────────────
-- 2. Les droits — colonne par colonne, comme toute cette table
--
-- `select` : l'éditeur ET la caisse lisent le programme avec le client de
-- session, par listes de colonnes nominatives. Sans ce droit, PostgREST
-- refuse le `select` entier dès que `style` y figure.
--
-- `update` : l'éditeur enregistre l'habillage choisi.
-- ────────────────────────────────────────────────────────────

grant select (style) on public.loyalty_programs to authenticated;
grant update (style) on public.loyalty_programs to authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. GARDE — échouer ICI plutôt qu'en production
--
-- Un `grant` sans effet (rôle inexistant, colonne mal orthographiée) NE LÈVE
-- PAS : il passe, la migration est marquée appliquée, et la panne n'apparaît
-- qu'au premier écran ouvert. Les deux réparations citées en en-tête ont
-- toutes deux été trouvées de cette façon — en production, par le symptôme.
--
-- Ce bloc transforme ce silence en échec d'application.
-- ────────────────────────────────────────────────────────────

do $migration$
begin
  -- 3a. Ce que la session marchande DOIT pouvoir faire.
  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_programs', 'style', 'SELECT')
  then
    raise exception
      'loyalty_programs.style n est pas lisible par authenticated : PostgREST refuserait le select entier et l ecran de configuration du passeport deviendrait une page introuvable';
  end if;

  if not pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_programs', 'style', 'UPDATE')
  then
    raise exception
      'loyalty_programs.style n est pas modifiable : l editeur enregistrerait un habillage que Postgres refuse, sans message utile pour le commercant';
  end if;

  -- 3b. Le rendu PUBLIC du passeport passe par le service role
  -- (src/lib/loyalty-context.ts, createAdminClient). Le grant de table de
  -- 20260725120000 est censé couvrir toute colonne future — on le vérifie
  -- plutôt que de le supposer, car c est de lui seul que depend la page joueur.
  if not pg_catalog.has_column_privilege(
       'service_role', 'public.loyalty_programs', 'style', 'SELECT')
  then
    raise exception
      'loyalty_programs.style n est pas lisible par service_role : la page publique du passeport ne pourrait pas peindre son habillage';
  end if;

  -- 3c. CONTRÔLES NÉGATIFS — anon n a jamais rien eu sur cette table
  -- (revoke all, 20260725120000) et ne doit rien gagner ici. Le parcours
  -- joueur ne passe pas par lui.
  if pg_catalog.has_column_privilege(
       'anon', 'public.loyalty_programs', 'style', 'SELECT')
  then
    raise exception
      'loyalty_programs.style est devenu lisible par anon : le passeport n expose rien en direct, tout passe par le service role';
  end if;

  if pg_catalog.has_column_privilege(
       'anon', 'public.loyalty_programs', 'style', 'UPDATE')
  then
    raise exception
      'loyalty_programs.style est devenu modifiable par anon : n importe qui rhabillerait le passeport d un commercant';
  end if;

  -- 3d. Le secret du code tournant reste hors de portee. Il n a rien a voir
  -- avec l habillage, et c est justement pourquoi il est verifie ici : ce
  -- fichier touche aux grants de colonnes de cette table, et une liste de
  -- grants se manipule mal. Si `rotating_secret` devenait lisible par une
  -- session marchande, tout code de validation deviendrait falsifiable.
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.loyalty_programs', 'rotating_secret', 'SELECT')
  then
    raise exception
      'loyalty_programs.rotating_secret est devenu lisible par authenticated : les codes de validation du comptoir seraient falsifiables';
  end if;
end
$migration$;
