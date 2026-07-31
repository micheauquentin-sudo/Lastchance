-- ============================================================
-- Lastchance — la prévision du solde de chasse (hunt_settlement_preview)
-- ============================================================
--
-- Cette migration ajoute UNE fonction et n'en redéfinit AUCUNE. Vérification :
--
--     grep -l "function public.hunt_settlement_preview" supabase/migrations/*.sql
--
-- doit rendre CE fichier, et lui seul.
--
--
-- ── CE QU'ELLE FERME ────────────────────────────────────────
--
-- `deleteHuntStep` (src/actions/hunts.ts) refuse une suppression tant que le
-- commerçant n'a pas confirmé, et son refus NOMME le nombre de joueurs en
-- cours (`hunt_players_in_progress`). Ce chiffre-là se lit comme une mesure
-- d'audience : « 800 joueurs en cours » ne dit rien du COÛT du clic. Le nombre
-- qui coûte est l'autre — combien d'entre eux franchiront le seuil du seul
-- fait de la suppression et recevront à l'instant un code CHASSE- réel, à
-- honorer en caisse, décompté du stock.
--
-- L'action l'appelait déjà ; la fonction n'existait pas. Le chemin dégradé
-- tenait (« n'a pas pu être calculé » plutôt qu'un « 0 » rassurant sorti d'une
-- RPC absente), mais le commerçant cochait toujours sans savoir.
--
-- POURQUOI EN BASE ET NON DANS L'ACTION : la prévision demande un comptage de
-- tampons PAR JOUEUR en excluant l'étape visée. PostgREST ne sait pas agréger
-- ainsi ; rapatrier les scans signifierait lire toute la table de la chasse,
-- donc buter en silence sur la limite de lignes de l'API et ANNONCER UN
-- CHIFFRE FAUX précisément sur les grosses chasses — le défaut qu'on répare.
--
--
-- ── LA PARITÉ AVEC settle_hunt_completions EST LE FOND DU SUJET ──
--
-- Une prévision n'a de valeur que si elle annonce ce que le solde fera
-- VRAIMENT. `settle_hunt_completions` (20260815120000) a précisément payé le
-- prix inverse : sa première version affirmait à trois endroits « elle accorde
-- exactement ce que le prochain scan aurait accordé » sans porter AUCUNE des
-- quatre gardes de contexte de `record_hunt_scan` (20260724120000:296-306) —
-- addon, statut, `starts_at`, `ends_at`. On relit une affirmation, pas une
-- absence.
--
-- Les mêmes quatre gardes sont donc écrites ici, dans le même ordre, ainsi que
-- la cinquième (`v_total < 1`) et la garde d'autorisation. Conséquence
-- délibérée et vérifiée par pgTAP : sur une chasse en BROUILLON, hors fenêtre,
-- archivée ou dont le module est coupé, la prévision rend **0** — parce que le
-- solde n'accordera rien. Une prévision qui annoncerait 780 là où le solde en
-- accordera 0 serait pire qu'une absence de prévision : elle ferait renoncer
-- le commerçant à un geste inoffensif.
--
-- Toute divergence future entre les deux listes de gardes est un défaut.
--
--
-- ── CE QUE « SI CETTE ÉTAPE ÉTAIT SUPPRIMÉE » VEUT DIRE ─────
--
-- `hunt_scans.step_id` est en `on delete cascade` (20260724120000:130-131) et
-- c'est le SEUL descendant de `hunt_steps`. Retirer l'étape retire donc ses
-- tampons à elle, et rien d'autre : les tampons des autres étapes survivent.
-- La simulation tient en deux exclusions symétriques —
--
--     total  := count(steps) - 1                 (l'étape visée en moins)
--     done   := count(scans hors p_removed_step_id)
--
-- et la condition de solde reste `done >= total`. C'est exactement la boucle
-- de `settle_hunt_completions` lue après la suppression.
--
-- La borne de stock reproduit la sienne à l'unité près : elle sort de boucle
-- dès que `reward_claimed_count + accordés >= reward_stock`, ce qui accorde
-- `min(éligibles, reward_stock - reward_claimed_count)`. Un `reward_stock` nul
-- vaut ILLIMITÉ (le défaut du champ) : la prévision rend alors le nombre
-- d'éligibles, sans plafond — et c'est bien le chiffre qui doit alarmer.
--
-- `p_removed_step_id` n'est PAS vérifiée comme appartenant à la chasse : un
-- identifiant étranger ou inconnu ne correspond simplement à aucune étape ni à
-- aucun tampon, et la prévision se comporte comme si rien n'était retiré —
-- c'est-à-dire comme le solde d'aujourd'hui. Aucun oracle n'est ouvert : le
-- résultat est identique à celui d'un `null`, il ne distingue donc pas une
-- étape d'autrui d'une étape inexistante.
-- ============================================================

-- Combien de complétions `settle_hunt_completions(p_hunt_id)` accorderait si
-- l'étape `p_removed_step_id` était supprimée ? Lu par le dashboard AVANT la
-- suppression, pour que le refus puisse chiffrer ce que le geste engage.
--
-- Fonction de LECTURE (`stable`) : elle n'émet aucun code, ne touche à aucun
-- stock, n'écrit rien. C'est son seul écart avec le solde — tout le reste,
-- gardes comprises, est identique.
create or replace function public.hunt_settlement_preview(
  p_hunt_id uuid,
  p_removed_step_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_hunt public.hunts%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_total integer;
  v_eligibles integer;
  v_restant integer;
begin
  select h.* into v_hunt
    from public.hunts h where h.id = p_hunt_id;
  if not found then
    return 0;
  end if;
  -- `return 0` et non `raise` : uniforme avec `hunt_players_in_progress` et
  -- `settle_hunt_completions` (20260815120000), qui l'uniformisent elles-mêmes
  -- sur la doctrine que `record_hunt_scan` s'impose en toutes lettres — « pas
  -- d'oracle sur l'état interne » (20260724120000:294). Lever ici
  -- distinguerait « cette chasse n'existe pas » de « elle existe, chez
  -- quelqu'un d'autre ».
  if not public.is_org_editor(v_hunt.organization_id) then
    return 0;
  end if;

  -- ── LES QUATRE GARDES DE CONTEXTE, À L'IDENTIQUE ────────────
  -- Recopiées de settle_hunt_completions (20260815120000:234-242), dans le
  -- même ordre. Sans elles, la prévision annoncerait des centaines de codes là
  -- où le solde n'en émettra aucun : le commerçant renoncerait à un geste
  -- inoffensif — l'erreur inverse de celle que la fonction répare, et tout
  -- aussi coûteuse.
  if v_hunt.status <> 'active'
     or (v_hunt.starts_at is not null and v_hunt.starts_at > v_now)
     or (v_hunt.ends_at is not null and v_hunt.ends_at <= v_now)
     or not exists (
       select 1 from public.organizations o
        where o.id = v_hunt.organization_id and o.addon_hunts
     ) then
    return 0;
  end if;

  -- Le total APRÈS la suppression simulée.
  select count(*)::integer into v_total
    from public.hunt_steps s
   where s.hunt_id = v_hunt.id
     and (p_removed_step_id is null or s.id <> p_removed_step_id);
  -- Chasse qui n'aurait plus AUCUNE étape : `done >= total` serait vrai pour un
  -- joueur à zéro tampon. Le solde rend 0 dans ce cas (v_total < 1), la
  -- prévision aussi.
  if v_total < 1 then
    return 0;
  end if;

  select count(*)::integer into v_eligibles
    from public.hunt_players p
   where p.hunt_id = v_hunt.id
     and not exists (
       select 1 from public.hunt_completions c
        where c.player_id = p.id and c.hunt_id = v_hunt.id
     )
     and (
       select count(*) from public.hunt_scans sc
        where sc.player_id = p.id
          and (p_removed_step_id is null or sc.step_id <> p_removed_step_id)
     ) >= v_total;

  -- `reward_stock` nul = illimité : aucun plafond à appliquer.
  if v_hunt.reward_stock is null then
    return v_eligibles;
  end if;
  -- La boucle du solde sort dès que `reward_claimed_count + accordés >=
  -- reward_stock` : elle accorde donc au plus le reliquat. Un reliquat négatif
  -- (stock abaissé sous le nombre déjà émis) vaut zéro, comme la boucle qui
  -- sortirait au premier tour.
  v_restant := v_hunt.reward_stock - v_hunt.reward_claimed_count;
  if v_restant < 0 then
    v_restant := 0;
  end if;
  -- `least` reste NON qualifié : c'est un nœud du parseur (MinMaxExpr), sans
  -- entrée dans pg_proc. Le préfixer du schéma catalogue applique la migration
  -- sans broncher puis casse au PREMIER APPEL RÉEL. Garde mécanique :
  -- scripts/check-sql-parser-constructs.mjs, qui inspecte aussi l'intérieur
  -- des corps de fonction (une chaîne, pour son analyseur) — le motif interdit
  -- ne peut donc même pas être cité ici en exemple.
  return least(v_eligibles, v_restant);
end;
$$;

comment on function public.hunt_settlement_preview(uuid, uuid) is
  'Nombre de complétions que settle_hunt_completions accorderait si l''étape indiquée était supprimée : joueurs sans complétion dont les tampons restants couvrent les étapes restantes, borné par le stock disponible. Mêmes gardes de contexte (addon, statut, fenêtre), même autorisation et même borne de stock que le solde ; rend 0 dès que l''une d''elles ferme, parce que le solde n''accordera rien.';

-- `authenticated` seulement, comme les deux fonctions de chasse de
-- 20260815120000 : la RPC est appelée depuis une server action avec le client
-- de SESSION du commerçant, c'est ce qui donne un `auth.uid()` à
-- `is_org_editor`. Sous `service_role` ce prédicat est structurellement faux et
-- la fonction rendrait toujours 0 — un grant qui ne peut rien exécuter laisse
-- croire à un chemin d'appel qui n'existe pas.
--
-- ⚠ Le revoke sur `service_role` doit être ÉCRIT : `revoke … from public,
-- anon` ne le retire pas. Supabase pose `alter default privileges in schema
-- public grant all on functions to postgres, anon, authenticated,
-- service_role`, donc toute fonction née dans `public` porte EXECUTE pour
-- service_role sans qu'aucune migration ne le lui accorde. Voir la note
-- détaillée dans 20260815120000.
revoke all on function public.hunt_settlement_preview(uuid, uuid) from public, anon;
revoke execute on function public.hunt_settlement_preview(uuid, uuid) from service_role;
grant execute on function public.hunt_settlement_preview(uuid, uuid) to authenticated;
