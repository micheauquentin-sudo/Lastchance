-- ════════════════════════════════════════════════════════════
-- LA PORTE DU PASSEPORT PROUVE AUSSI SON LOCATAIRE (VIT-34)
--
-- 20261202120000 a posé la porte publique du passeport de fidélité et TROIS
-- gardes de sortie sur la fonction vivante : le droit
-- (`org_has_module_access(…, 'loyalty')`), la source
-- (`from public.loyalty_programs l`) et la clé publiée (`'loyalty', (`).
-- AUCUNE des trois ne regarde le LOCATAIRE.
--
-- ── CE N'EST PAS UN DÉFAUT, C'EST UN INVARIANT SANS GARDE ──
--
-- Le filtre `l.organization_id = v_settings.organization_id` EST là, et il est
-- correct : ce fichier ne répare rien, il n'exécute aucun `create or replace`,
-- il ajoute la garde qui manquait. Le risque est STRUCTUREL, et il tient au
-- seul mécanisme par lequel cette fonction ait jamais changé : elle n'est pas
-- recopiée, elle est PATCHÉE par `pg_get_functiondef` + `replace` depuis
-- 20261023120000. Une migration qui ré-ancrerait sur
-- `from public.loyalty_programs l` pour réécrire le sous-select perdrait le
-- `where` EN LAISSANT LES TROIS GARDES VERTES — le droit serait toujours lu, la
-- source toujours nommée, la clé toujours publiée. La page publique d'un
-- commerce annoncerait alors les passeports de tous les autres.
--
-- ── L'ANCRE JOINT LA SOURCE À SON FILTRE, ET C'EST TOUT L'INTÉRÊT ──
--
-- La garde ne cherche pas `l.organization_id = v_settings.organization_id`
-- quelque part dans la fonction : elle exige que le filtre SUIVE la ligne
-- `from public.loyalty_programs l`. Chercher les deux moitiés séparément aurait
-- laissé passer un `where` resté ailleurs dans le corps — et c'est précisément
-- la faute qu'on veut voir, puisque le sous-select entier est ce qu'une
-- prochaine migration réécrira.
--
-- L'ALIAS `l` N'APPARTIENT QU'AU PASSEPORT : les cinq autres listes lisent
-- `a` (activités), `q` (files, quiz), `o` (offres) et `c` (calendriers,
-- pronostics). Un texte trouvé ailleurs ne pourrait donc pas rendre cette garde
-- verte par accident.
--
-- ── CE QU'ELLE NE FAIT PAS, ET IL FAUT LE DIRE ──
--
-- Elle est TEXTUELLE et PONCTUELLE, exactement comme les trois de
-- 20261202120000 : elle juge la fonction telle qu'elle est installée À CET
-- ENDROIT DE LA CHAÎNE. Une migration postérieure qui casserait le filtre
-- s'appliquerait APRÈS elle et ne la ferait pas lever.
--
-- Ce qui juge l'état FINAL du schéma, lui, c'est le pgTAP :
-- `droits_par_produit.test.sql` (§5 quater) et `vitrine.test.sql` (§14f) posent
-- désormais des lignes chez un VOISIN et vérifient qu'aucune ne sort. Les deux
-- moitiés sont nécessaires et ne se remplacent pas — le texte NOMME l'invariant
-- à l'endroit où on l'écrit, le comportement le TIENT dans la durée.
--
-- ÉCARTÉ : élargir la même garde textuelle aux cinq autres listes. Elles
-- portent le même filtre et exactement le même risque, mais six blocs quasi
-- identiques auraient coûté plus de fichier que de preuve — §14f les couvre
-- TOUTES par le comportement, et c'est la moitié qui survit à une migration
-- future.
--
-- ÉCARTÉ AUSSI : toucher `vitrine_public_state`. Réécrire une fonction pour y
-- ajouter une garde, ce serait courir le risque qu'on prétend fermer.
-- ════════════════════════════════════════════════════════════

do $verification$
declare
  v_locataire integer;
begin
  select pg_catalog.count(*)::integer into v_locataire
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~
         'from public\.loyalty_programs l\s+where l\.organization_id = v_settings\.organization_id';
  if v_locataire <> 1 then
    raise exception
      'vitrine_public_state ne borne plus la porte du passeport a son locataire : `from public.loyalty_programs l` n''est plus suivi de `where l.organization_id = v_settings.organization_id`, et la page publique d''un commerce annoncerait les programmes de TOUS les autres';
  end if;
end
$verification$;
