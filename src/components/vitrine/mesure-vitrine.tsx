"use client";

import { useEffect } from "react";
import {
  MESURE_VITRINE_MAX,
  type MesureVitrine as Mesure,
  type TypeMesure,
} from "@/lib/vitrine-mesures";

/**
 * VIT-9 — CE QUI EST REGARDÉ, COMPTÉ UNE FOIS ET ENVOYÉ UNE FOIS.
 *
 * ── « CONSULTÉE » VEUT DIRE « APPARUE À L'ÉCRAN » ──
 *
 * Un `IntersectionObserver` note les rubriques et les fiches qui entrent dans
 * la fenêtre. C'est la seule définition honnête : compter le rendu aurait
 * compté toute la carte à chaque chargement, et compter un clic n'aurait
 * compté que les plats qu'on ouvre — or une carte se LIT, elle ne se clique
 * pas.
 *
 * Le seuil de 50 % et les 700 ms écartent le défilement nerveux : ce qui passe
 * sous le pouce en traversant l'écran n'a pas été lu.
 *
 * ── UN SEUL ENVOI, AU DÉPART ──
 *
 * Les mesures s'accumulent dans un `Set` et partent en une fois par
 * `sendBeacon`, qui survit à la navigation. Un appel par fiche aurait fait
 * soixante requêtes sur le chemin le plus chaud du produit.
 *
 * `visibilitychange` plutôt que `beforeunload` : sur mobile, la page est
 * souvent mise en arrière-plan puis tuée sans jamais recevoir `beforeunload`.
 * `pagehide` complète pour Safari.
 *
 * ── CE QUE CE COMPOSANT NE FAIT PAS ──
 *
 * Il ne lit aucun cookie, n'ouvre aucune session, ne calcule aucune empreinte,
 * et n'envoie ni horodatage ni durée. Ce qui part est une LISTE DE RÉFÉRENCES
 * vues au moins une fois pendant ce chargement de page. Rien de ce qui sort
 * d'ici ne peut être rattaché à une personne.
 */
export function MesureVitrine({
  slug,
  langue,
}: {
  slug: string;
  langue: "fr" | "en";
}) {
  useEffect(() => {
    const vues = new Set<string>();

    const noter = (type: TypeMesure, ref: string) => {
      if (vues.size >= MESURE_VITRINE_MAX) return;
      vues.add(`${type}:${ref}`);
    };

    /** `fiche-{uuid}` / `rubrique-{uuid}` → le type et la référence. */
    const lireCible = (id: string): [TypeMesure, string] | null => {
      const separateur = id.indexOf("-");
      if (separateur < 0) return null;
      const prefixe = id.slice(0, separateur);
      const ref = id.slice(separateur + 1);
      if (prefixe === "fiche" || prefixe === "rubrique") return [prefixe, ref];
      return null;
    };

    const minuteries = new Map<Element, number>();
    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          const cible = lireCible(entree.target.id);
          if (!cible) continue;

          if (!entree.isIntersecting) {
            const minuterie = minuteries.get(entree.target);
            if (minuterie !== undefined) {
              window.clearTimeout(minuterie);
              minuteries.delete(entree.target);
            }
            continue;
          }

          if (minuteries.has(entree.target)) continue;
          minuteries.set(
            entree.target,
            window.setTimeout(() => {
              noter(cible[0], cible[1]);
              observateur.unobserve(entree.target);
              minuteries.delete(entree.target);
            }, 700),
          );
        }
      },
      { threshold: 0.5 },
    );

    for (const noeud of document.querySelectorAll(
      '[id^="fiche-"], [id^="rubrique-"]',
    )) {
      // `fiche-titre-…` porte aussi le préfixe : seuls les conteneurs sont
      // observés, jamais les titres qu'ils contiennent.
      if (noeud.id.startsWith("fiche-titre-")) continue;
      observateur.observe(noeud);
    }

    /**
     * LES PORTES ET LES CARTES SE COMPTENT AU CLIC, pas à l'apparition.
     *
     * Une porte est une INTENTION : elle n'existe que si on la pousse. Un
     * onglet de carte, de même, est un choix — et il est déjà à l'écran.
     * Écouté sur le document, en capture, parce que les deux sont rendus par
     * des composants que ce module ne connaît pas.
     */
    const auClic = (evenement: Event) => {
      const cible = evenement.target;
      if (!(cible instanceof Element)) return;

      // `data-porte` et non le fragment : six portes mènent à trois blocs, et
      // déduire l'action de l'ancre aurait compté « jouer au quiz » comme
      // « expériences » — que le vocabulaire fermé des compteurs refuse.
      const porte = cible.closest("[data-porte]");
      if (porte instanceof HTMLElement && porte.dataset.porte) {
        noter("action", porte.dataset.porte);
        return;
      }

      const onglet = cible.closest("[data-carte-id]");
      if (onglet instanceof HTMLElement && onglet.dataset.carteId) {
        noter("carte", onglet.dataset.carteId);
      }
    };
    document.addEventListener("click", auClic, true);

    let parti = false;
    const envoyer = () => {
      if (parti || vues.size === 0) return;
      parti = true;

      const mesures: Mesure[] = [...vues].map((cle) => {
        const separateur = cle.indexOf(":");
        return {
          type: cle.slice(0, separateur) as TypeMesure,
          ref: cle.slice(separateur + 1),
        };
      });

      const corps = JSON.stringify({ slug, langue, mesures });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/vitrine-mesures",
            new Blob([corps], { type: "application/json" }),
          );
          return;
        }
      } catch {
        // `sendBeacon` refuse parfois un corps trop gros : on retombe.
      }
      void fetch("/api/vitrine-mesures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corps,
        keepalive: true,
      }).catch(() => {});
    };

    const auMasquage = () => {
      if (document.visibilityState === "hidden") envoyer();
    };
    document.addEventListener("visibilitychange", auMasquage);
    window.addEventListener("pagehide", envoyer);

    return () => {
      document.removeEventListener("click", auClic, true);
      document.removeEventListener("visibilitychange", auMasquage);
      window.removeEventListener("pagehide", envoyer);
      for (const minuterie of minuteries.values()) window.clearTimeout(minuterie);
      observateur.disconnect();
      // LE DÉMONTAGE EST AUSSI UN DÉPART : une navigation interne ne déclenche
      // ni `pagehide` ni `visibilitychange`, et ce qui a été lu serait perdu.
      envoyer();
    };
  }, [slug, langue]);

  return null;
}
