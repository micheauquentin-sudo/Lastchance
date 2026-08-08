"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { annoncerToast } from "@/lib/toast-bus";
import type { ActionResult } from "@/lib/utils";

/**
 * Soumission d'un formulaire à une Server Action, avec un état de chargement
 * QUI RETOMBE TOUJOURS.
 *
 * ─── Pourquoi ce hook existe (defaut mesuré le 2026-07-28, docs/bugs.md) ───
 *
 * `useActionState` — et `useTransition` — exposent un `pending` piloté par le
 * rendu. Quand une action serveur qui appelle `revalidatePath` se résout TRÈS
 * VITE, ce `pending` peut ne JAMAIS retomber : le réconciliateur marque la
 * frontière comme suspendue et ne rejoue pas la mise à jour, alors même que la
 * réponse est arrivée (POST 200) et que l'effet est appliqué en base.
 *
 * Conséquence pour l'utilisateur : un écran figé sur « … » après une action
 * qui a POURTANT réussi, sans message. Un commerçant renvoie sa newsletter ; un
 * caissier ne sait pas si le lot est remis, devant un client qui attend.
 * Reproduit environ une fois sur huit sur React 19.2.8 / Next 16.2.12 — les
 * dernières versions publiées. Défaut connu en amont (vercel/next.js
 * discussions #82289 et #88767, issue #58772) : **une montée de version ne le
 * réglera pas.**
 *
 * Ici, l'action est appelée comme une simple fonction asynchrone : sa promesse
 * se résout à la réponse HTTP, indépendamment du rendu, et `pending` retombe
 * dans un `finally`. `router.refresh()` rafraîchit l'écran sans que
 * l'affichage du résultat en dépende.
 *
 * Contrepartie assumée : le formulaire n'est plus soumissible sans JavaScript.
 * Sur les écrans concernés — back-office et caisse — il ne l'était déjà qu'à
 * moitié, les sélecteurs étant des états client.
 *
 * ─── Et `router.refresh()` a son propre défaut (mesuré le 2026-07-30) ───
 *
 * Le hook ci-dessus règle la manifestation (a) — le `pending` figé. Il en
 * reste une (b), de la même famille amont : l'action répond 200, la ligne EST
 * en base, le `GET ?_rsc=` répond 200, ET L'ÉCRAN NE L'APPLIQUE PAS. Mesuré à
 * 5 % puis 5,6 % sur deux gestes de l'éditeur de progression, et à 32 % sur la
 * clôture de saison.
 *
 * Ce n'est PAS grave partout — c'est même inoffensif dans la majorité des cas,
 * et c'est pourquoi le comportement par défaut de ce hook NE CHANGE PAS :
 *   - quand l'action REDIRIGE, la navigation porte déjà le résultat ;
 *   - quand le résultat tient dans `state` (« Enregistré. »), il s'affiche ;
 *   - quand un rafraîchissement périodique existe, le tic suivant rattrape.
 *
 * C'est grave dans un seul cas : quand le rafraîchissement est LE SEUL MOYEN
 * pour l'écran de montrer ce que l'utilisateur vient de faire. Il ne voit
 * rien, il refait le geste, et le geste crée un doublon. D'où `reloadOnSuccess`.
 *
 * POURQUOI C'EST UNE OPTION ET NON LE DÉFAUT : ce hook dessert environ
 * quatre-vingt-dix sites sur une quarantaine de fichiers, et l'audit du
 * 2026-07-30 n'en a ouvert qu'une fraction. Basculer le défaut changerait le
 * comportement de dizaines d'écrans sur une base non vérifiée — exactement le
 * geste que ce projet a payé cher. L'option se pose là où le mal est PROUVÉ.
 * Le revers est connu et assumé : c'est une case à cocher, donc une case
 * qu'on oublie. Le jour où la population entière aura été ouverte, c'est le
 * défaut qu'il faudra inverser, pas la liste des appelants qu'il faudra tenir.
 */
/**
 * Recharge la page, éventuellement en y marquant le geste qui vient d'aboutir.
 *
 * `replace` et non `assign` : l'entrée courante est REMPLACÉE au lieu d'en
 * empiler une seconde, donc l'historique ne garde pas deux entrées pour un seul
 * geste et le bouton « précédent » ramène là où le commerçant était avant.
 *
 * Ce que `replace` NE fait PAS, contrairement à ce qui était écrit ici : il
 * n'empêche pas de revenir sur l'URL marquée. `?remis=1` est l'entrée courante,
 * donc il survit à un F5, et un aller-retour « précédent / suivant » y revient.
 * Le marqueur se relit alors comme une remise qui vient d'avoir lieu. Bénin et
 * assumé — l'écran est derrière l'authentification et le marqueur est borné à
 * 90 secondes — mais la phrase précédente promettait une garantie que ce
 * mécanisme n'apporte pas, et c'est ce genre de promesse qu'on finit par
 * croire.
 */
export function rechargerAvec(params?: Record<string, string>): void {
  if (!params || Object.keys(params).length === 0) {
    window.location.reload();
    return;
  }
  const url = new URL(window.location.href);
  for (const [cle, valeur] of Object.entries(params)) {
    url.searchParams.set(cle, valeur);
  }
  window.location.replace(url.toString());
}

export function useActionForm<T = void>(
  action: (
    prev: ActionResult<T> | null,
    formData: FormData,
  ) => Promise<ActionResult<T>>,
  options: {
    /** Vide le formulaire après un succès. */
    resetOnSuccess?: boolean;
    /** Appelé après un succès, avant le rafraîchissement. */
    onSuccess?: (data: T) => void;
    /** Message affiché si l'appel lui-même échoue (réseau coupé). */
    networkError?: string;
    /**
     * Recharge franchement la page au lieu de la rafraîchir.
     *
     * À poser UNIQUEMENT là où le rafraîchissement est le seul moyen d'afficher
     * le résultat ET où refaire le geste crée un doublon. Ailleurs, le coût
     * (~1 s, position de défilement perdue) n'est pas payé par un gain.
     */
    reloadOnSuccess?: boolean;
    /**
     * Paramètres d'URL ajoutés au rechargement, pour que la page rechargée
     * sache qu'elle vient de CE geste.
     *
     * Sans cela, la page qui suit une action est indistinguable de la même page
     * ouverte par n'importe qui d'autre — c'est ce qui faisait afficher à la
     * caisse « ✓ Remise enregistrée » au second porteur d'un code déjà consommé.
     * Un paramètre d'URL ne survit ni à une nouvelle recherche (le formulaire
     * `GET` repart avec ses seuls champs), ni au lien « Client suivant ».
     *
     * Sans effet si `reloadOnSuccess` n'est pas posé.
     */
    reloadWith?: Record<string, string>;
    /**
     * Message poussé dans le bandeau global (`ToastEnregistrement`) après un
     * succès. Ne remplace PAS `state` : les messages rendus par le composant
     * restent la source de vérité locale, ce toast n'est qu'une annonce.
     *
     * Sa raison d'être est l'enregistrement AUTOMATIQUE, où il n'y a plus de
     * bouton sur lequel lire un résultat. Sur un formulaire à bouton, le
     * « Enregistré. » du composant suffit déjà.
     */
    toastOnSuccess?: string;
  } = {},
) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult<T> | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * ─── POURQUOI UNE FILE, ET POURQUOI UN `ref` PLUTÔT QUE `pending` ───
   *
   * Ce garde-fou jetait purement et simplement toute soumission arrivée
   * pendant qu'une autre volait (`if (pending) return;`). Avec un bouton c'est
   * défendable : le second clic est un doublon. Avec l'enregistrement
   * automatique, c'est un défaut de perte de données — la frappe qui suit le
   * départ d'une sauvegarde est SILENCIEUSEMENT abandonnée, et l'écran affiche
   * « Enregistré. » pour la valeur PRÉCÉDENTE. Le commerçant lit un accusé de
   * réception exact sur un contenu qui n'est pas le sien.
   *
   * D'où une file d'UNE place : la soumission concurrente n'est pas jetée,
   * elle est rejouée à l'atterrissage de la première. Une place suffit —
   * ce qui compte n'est pas de rejouer chaque frappe, mais de finir sur la
   * DERNIÈRE valeur, et la re-soumission relit le formulaire au moment où
   * elle part.
   *
   * Le verrou est un `ref` et non `pending` : `pending` est un état, donc deux
   * soumissions du même tick le lisent toutes les deux à `false` et partent
   * ensemble. Un `ref` bascule dans l'instruction même.
   */
  const enVol = useRef(false);
  const formEnVol = useRef<HTMLFormElement | null>(null);
  const resoumettreApres = useRef(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (enVol.current) {
      formEnVol.current = form;
      resoumettreApres.current = true;
      return;
    }
    enVol.current = true;
    formEnVol.current = form;
    const formData = new FormData(form);
    setPending(true);
    setState(null);
    void (async () => {
      // Le formulaire a-t-il été VIDÉ sur ce tour ? Rejouer par-dessus un
      // `form.reset()` posterait un formulaire vide — et détruirait ce que la
      // soumission en attente cherchait précisément à sauver.
      let reinitialise = false;
      try {
        const result = await action(null, formData);
        setState(result);
        if (result.ok) {
          if (options.resetOnSuccess) {
            form.reset();
            reinitialise = true;
          }
          options.onSuccess?.(result.data);
          if (options.toastOnSuccess) {
            annoncerToast({ message: options.toastOnSuccess, ton: "succes" });
          }
          if (options.reloadOnSuccess) rechargerAvec(options.reloadWith);
          else router.refresh();
        }
      } catch {
        // Réseau coupé ou action injoignable : on le DIT, plutôt que de
        // laisser le bouton tourner sans fin.
        setState({
          ok: false,
          error: options.networkError ?? "Action impossible, réessayez.",
        });
      } finally {
        enVol.current = false;
        setPending(false);
        const aRejouer = resoumettreApres.current;
        resoumettreApres.current = false;
        // `requestSubmit` et non un appel direct : il repasse par le
        // gestionnaire du formulaire, donc par une NOUVELLE lecture de
        // `FormData` — c'est ce qui garantit que le rejeu porte la dernière
        // valeur saisie, et non celle qu'on avait capturée en partant.
        if (aRejouer && !reinitialise) formEnVol.current?.requestSubmit();
      }
    })();
  }

  return { state, pending, onSubmit };
}
