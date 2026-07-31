-- ============================================================
-- Lastchance — le libellé d'un lot ÉMIS ne change plus
-- ============================================================
--
-- ── Ce qui se perdait ──
--
-- `upsert_reward_issuance` recopiait le libellé de la table parente à CHAQUE
-- synchronisation du miroir : `label = excluded.label`. Le commerçant qui
-- renommait sa récompense — geste banal entre deux opérations — réécrivait donc
-- le libellé de tous les lots DÉJÀ GAGNÉS et pas encore retirés.
--
-- Le client se présente avec un email qui annonce « Café offert », la caisse
-- affiche « Croissant offert », et rien à l'écran ne dit lequel fait foi. Le
-- caissier tranche au comptoir ; dans les deux cas quelqu'un a tort.
--
-- Le libellé d'origine était alors PERDU : aucune copie nulle part. C'est ce
-- qui rend ce correctif urgent — tant qu'il n'est pas posé, chaque renommage
-- détruit la seule trace de ce qui a été promis.
--
-- ── Ce qu'on a mesuré ──
--
-- Sur une participation créée pour l'occasion (base locale semée) :
--
--     libellé au registre à l'émission ......... « Café offert E2E »
--     après renommage du lot, AVEC le gel ...... « Café offert E2E »   ✅
--     après renommage du lot, SANS le gel ...... « RENOMMÉ SANS GEL »  (contrôle négatif)
--
-- Le contrôle négatif compte autant que la preuve : sans lui, un libellé qui
-- ne bouge pas ne dirait rien — peut-être que rien ne le fait bouger.
--
-- ── Ce que cette migration fait, et pas plus ──
--
-- Elle fige le libellé DU REGISTRE. Elle ne change encore rien à ce que la
-- caisse AFFICHE : les huit familles lisent toujours la table parente. Ce
-- second geste viendra ; il est plus large et demande sa propre revue. Mais
-- l'ordre compte : sans la gravure, il n'y aurait bientôt plus rien à afficher.
--
-- ── Pourquoi elle se dérive au lieu de se recopier ──
--
-- `upsert_reward_issuance` est longue et sensible. La recopier pour en changer
-- une ligne créerait une SECONDE SOURCE DE VÉRITÉ, qui divergerait au premier
-- correctif porté à l'originale — la classe de défaut la plus coûteuse de ce
-- projet, et celle qui lui a déjà livré deux escalades de privilège.
--
-- On lit donc la définition VIVANTE (`pg_get_functiondef`), on applique UNE
-- substitution, et on rejoue. Deux gardes encadrent le geste : le motif doit
-- être présent avant, et absent après.
--
-- Ces gardes ont servi dès la première exécution : la migration visait
-- `sync_reward_issuance`, alors que le motif vit dans `upsert_reward_issuance`.
-- Elle a REFUSÉ de s'appliquer au lieu d'agir dans le vide.
-- ============================================================

do $migration$
declare
  v_def text;
  v_mut text;
  v_motif constant text := '    label = excluded.label,';
  v_gel   constant text :=
    '    -- LIBELLÉ GRAVÉ À L''ÉMISSION (20260814120000). Un lot déjà émis garde' || E'\n' ||
    '    -- le nom sous lequel le client l''a gagné, même si le commerçant renomme' || E'\n' ||
    '    -- sa récompense ensuite. Le `case` laisse seulement remplir un libellé' || E'\n' ||
    '    -- resté vide (lignes rétro-alimentées), sans jamais écraser un nom gravé.' || E'\n' ||
    '    label = case' || E'\n' ||
    '      when public.reward_issuances.label = '''' then excluded.label' || E'\n' ||
    '      else public.reward_issuances.label' || E'\n' ||
    '    end,';
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'upsert_reward_issuance';

  if position(v_motif in v_def) = 0 then
    raise exception
      'upsert_reward_issuance ne contient pas le motif attendu : la fonction a changé, cette migration décrirait du code qui n''existe plus';
  end if;

  v_mut := replace(v_def, v_motif, v_gel);

  if position(v_motif in v_mut) > 0 then
    raise exception 'la substitution n''a rien retiré : le libellé resterait recopié';
  end if;

  execute v_mut;
end
$migration$;

-- Contrôle final sur le catalogue : ce qui compte est ce qui est INSTALLÉ,
-- jamais ce que la migration croit avoir fait.
do $verif$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_reward_issuance'
      and p.prosrc like '%LIBELLÉ GRAVÉ À L''ÉMISSION%'
  ) then
    raise exception 'le gel du libellé n''est pas dans le corps installé';
  end if;
end
$verif$;
