"use client";

import { useState } from "react";
import Link from "next/link";
import { Tilt3D } from "@/components/ui/tilt-3d";
import { prixOffre } from "@/components/marketing/prix";
import { getPlanTier } from "@/lib/plans";

const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

interface TradeScenario {
  id: string;
  trade: string;
  emoji: string;
  headline: string;
  painPoint: string;
  recommendedModules: {
    name: string;
    role: string;
    why: string;
    href: string;
  }[];
  concreteSituation: string;
  /**
   * BÉNÉFICE ATTENDU, ET NON RÉSULTAT MESURÉ.
   *
   * Ce champ portait des pourcentages (+22 %, +35 %, +28 %, « 7 à 5 semaines »,
   * « 0 rendez-vous perdu ») sans aucune source dans le dépôt : ni banc, ni
   * cohorte, ni client cité. Le chapeau, lui, annonçait « les résultats
   * constatés ». Une vitrine ne peut pas annoncer une mesure que personne n'a
   * faite : le champ dit désormais ce que le module change, pas ce qu'il
   * rapporte. La seule valeur chiffrée qui subsiste est la jauge de joueurs
   * simultanés, et elle est DÉRIVÉE de `src/lib/plans.ts`.
   */
  expectedBenefit: string;
  offerTag: string;
}

/** Jauge live réellement vendue — dérivée du catalogue, jamais retapée. */
const JAUGE_LIVE = getPlanTier("live").limits.eventParticipants;

const TRADES: readonly TradeScenario[] = [
  {
    id: "restaurant",
    trade: "Restaurants & Brasseries",
    emoji: "🍽️",
    headline: "Remplir le midi, animer le soir, faire revenir sans brader",
    painPoint: "Des services calmes le mardi, l'addition réglée sans jamais capter le contact du client, et les commissions exorbitantes des plateformes de réservation.",
    recommendedModules: [
      {
        name: "Vitrine & Carte au QR",
        role: "Carte bilingue toujours à jour + réservation directe sans commission.",
        why: "Économisez les commissions des plateformes et mettez à jour vos plats du jour en 10 secondes.",
        href: "/faire-venir",
      },
      {
        name: "Duo Miroir à table",
        role: "Jeu complice sur smartphone pour 2 convives pendant l'attente des plats.",
        why: "Fait passer le temps d'attente pour un moment de rire et pousse à la consommation de desserts/cafés.",
        href: "/fideliser",
      },
      {
        name: "Carte à gratter ou Roue",
        role: "Un QR code posé sur le porte-addition pour gagner un dessert ou café à la prochaine visite.",
        why: "Collecte l'email du client (RGPD) et lui donne une raison immédiate de réserver à nouveau sous 15 jours.",
        href: "/attirer",
      },
      {
        name: "Ticket d'Or en caisse",
        role: "Offrir un avantage surprise au comptoir en un geste sans passer par un tirage.",
        why: "Fidélise instantanément les bons clients avec un geste élégant tracé en caisse.",
        href: "/attirer",
      },
    ],
    concreteSituation: "Vendredi soir, 22h : l'addition arrive avec un QR code Lastchance. Les convives scannent, découvrent leur dessert offert pour leur prochain déjeuner en semaine. Votre équipe valide le code en une seconde.",
    expectedBenefit: "Une raison concrète de revenir déjeuner en semaine, et une base d'emails clients qualifiés.",
    offerTag: `Formule recommandée : Sur Place (${prixOffre("place")} €/mois)`,
  },
  {
    id: "bar",
    trade: "Bars, Pubs & Cafés",
    emoji: "🍻",
    headline: "Transformer chaque soirée en événement festif et collectif",
    painPoint: "La concurrence des soirs de match, des tables qui restent sur une seule tournée, et l'ambiance difficile à lancer les soirs creux de début de semaine.",
    recommendedModules: [
      {
        name: "Événements Live sur grand écran",
        role: "Quiz et blind tests projetés sur la TV, les clients votent sur leur téléphone.",
        why: "Crée une émulation collective incroyable : les clients restent 1h de plus et consomment davantage.",
        href: "/animer",
      },
      {
        name: "Championnat de Pronostics",
        role: "Pronostics sur la Ligue 1, le rugby ou l'Euro avec classement du bar mis à jour en direct.",
        why: "Donne aux habitués un rendez-vous hebdomadaire immanquable pour défendre leur place au classement.",
        href: "/animer",
      },
      {
        name: "Jackpot collectif",
        role: "Une jauge commune projetée qui monte à chaque tournée jusqu'au tirage du lot.",
        why: "Motive toute la salle à participer ensemble pour déclencher le jackpot de la soirée.",
        href: "/animer",
      },
      {
        name: "Portrait de la Bande",
        role: "Jeu de vote secret entre amis à table (de 2 à 12 personnes).",
        why: "Détend immédiatement les groupes et prolonge les apéritifs.",
        href: "/fideliser",
      },
    ],
    concreteSituation: "Soir de Ligue des champions : vos clients pronostiquent le score à la mi-temps. À la fin du match, le classement s'affiche sur votre téléviseur avec les récompenses aux vainqueurs remises au comptoir.",
    expectedBenefit: `Jusqu'à ${JAUGE_LIVE} joueurs connectés en même temps, et une salle qui joue ensemble toute la soirée.`,
    offerTag: `Formule recommandée : Le Grand Jeu (${prixOffre("live")} €/mois)`,
  },
  {
    id: "boutique",
    trade: "Boutiques, Retail & Prêt-à-porter",
    emoji: "🛍️",
    headline: "Faire entrer les passants, faire circuler dans les rayons et réactiver",
    painPoint: "Des passants qui regardent la vitrine sans entrer, des rayons du fond désertés, et des clients de passage qui ne reviennent jamais après les soldes.",
    recommendedModules: [
      {
        name: "Chasse au QR en boutique",
        role: "3 QR codes dissimulés (vitrine, rayon créateurs, fond de boutique) à scanner pour débloquer -15%.",
        why: "Oblige physiquement le client à explorer l'ensemble de votre boutique et découvrir vos collections.",
        href: "/faire-venir",
      },
      {
        name: "Jeux instantanés au comptoir",
        role: "Machine à sous ou boîte mystère déclenchée lors de l'encaissement.",
        why: "Laisse une impression mémorable et offre un bon d'achat utilisable dès le mois suivant.",
        href: "/attirer",
      },
      {
        name: "Calendrier à surprises",
        role: "Opération spéciale (Noël, anniversaire du magasin, rentrée) avec un cadeau à dévoiler par jour.",
        why: "Crée une habitude de consultation quotidienne et des visites répétées en magasin.",
        href: "/fideliser",
      },
      {
        name: "Parrainage d'amies",
        role: "Partage d'un lien par SMS : -10 € pour l'amie, -10 € pour la cliente marraine dès la visite.",
        why: "Le meilleur levier d'acquisition locale, sans dépenser un euro en publicité sponsorisée.",
        href: "/attirer",
      },
    ],
    concreteSituation: "Une cliente hésite devant la boutique : elle scanne l'affiche vitrine, gagne un petit lot valable immédiatement en caisse et franchit la porte pour l'utiliser.",
    expectedBenefit: "Un parcours qui fait entrer les passants et circuler dans les rayons, et un fichier client conforme RGPD.",
    offerTag: `Formule recommandée : Le Club (${prixOffre("engagement")} €/mois)`,
  },
  {
    id: "salon",
    trade: "Salons de coiffure, Beauté & Services",
    emoji: "✂️",
    headline: "Remplir l'agenda sans no-show et moderniser la fidélité",
    painPoint: "Les cartes de fidélité en carton perdues ou oubliées, les rendez-vous manqués et le temps perdu à rappeler les clients pour reprendre rendez-vous.",
    recommendedModules: [
      {
        name: "Passeport Apple & Google Wallet",
        role: "Votre carte de fidélité installée dans le smartphone du client avec solde de points et notifications.",
        why: "Zéro carte plastique à imprimer, toujours dans la poche du client, image de marque ultra-moderne.",
        href: "/fideliser",
      },
      {
        name: "Réservation d'agenda automatique",
        role: "Vos disponibilités configurées une fois, prise de rendez-vous directe au scan du QR.",
        why: "Vos clients réservent leur prochain créneau 24h/24 sans vous déranger pendant vos prestations.",
        href: "/faire-venir",
      },
      {
        name: "Moments & Ventes Flash",
        role: "Proposer un créneau libre de dernière minute avec un petit avantage pour éviter un trou dans l'agenda.",
        why: "Comble les annulations de dernière minute en prévenant vos habitués en 2 clics.",
        href: "/faire-venir",
      },
      {
        name: "Scénarios de réactivation",
        role: "Relance automatique par email des clients qui n'ont pas repris rendez-vous depuis 6 semaines.",
        why: "Fait revenir automatiquement les clients réguliers sans aucun travail manuel.",
        href: "/fideliser",
      },
    ],
    concreteSituation: "Après son soin, votre client pose son téléphone sur votre borne caisse : son passeport Wallet est tamponné en un bip, et un rappel pour son prochain créneau dans 4 semaines lui est proposé.",
    expectedBenefit: "Un prochain rendez-vous proposé avant que le client quitte le salon, et des relances qui partent sans vous.",
    offerTag: `Formule recommandée : Le Club (${prixOffre("engagement")} €/mois) ou Sur Place (${prixOffre("place")} €/mois)`,
  },
];

export function UseCasesByTrade() {
  const [selectedTrade, setSelectedTrade] = useState<string>("restaurant");
  const currentScenario = TRADES.find((t) => t.id === selectedTrade) ?? TRADES[0];

  return (
    <div className="k-card rounded-3xl p-6 sm:p-10 shadow-lg">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-k-muted">
          <span className="h-2 w-2 rounded-full bg-k-orange" />
          Votre commerce en situation réelle
        </span>
        <h3 className="mt-2 text-2xl font-black text-k-ink sm:text-3xl" style={DISPLAY}>
          Comment Lastchance s&apos;adapte à votre métier
        </h3>
        <p className="mx-auto mt-2 max-w-2xl text-xs font-bold text-k-body sm:text-sm">
          Choisissez votre activité pour voir les modules recommandés, la situation concrète d&apos;utilisation et le bénéfice attendu.
        </p>
      </div>

      {/* Sélecteur de typologie */}
      <div className="mt-8 flex flex-wrap justify-center gap-2.5">
        {TRADES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTrade(t.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-black sm:text-sm transition-all duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 ${
              selectedTrade === t.id
                ? "k-border k-hard-sm bg-k-yellow text-k-ink scale-105"
                : "border-2 border-k-ink/15 bg-white/70 text-k-body hover:border-k-ink/30 hover:bg-white"
            }`}
          >
            <span>{t.emoji}</span>
            <span>{t.trade}</span>
          </button>
        ))}
      </div>

      {/* Contenu détaillé du scénario */}
      <div className="mt-10">
        <div className="rounded-2xl bg-k-yellow/30 border-2 border-k-ink/20 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-xl font-black text-k-ink sm:text-2xl" style={DISPLAY}>
              {currentScenario.headline}
            </h4>
            <span className="k-border-thin rounded-full bg-k-ink px-3 py-1 text-xs font-black text-k-bg">
              {currentScenario.offerTag}
            </span>
          </div>
          <p className="mt-2 text-xs sm:text-sm font-bold text-k-body/90">
            <strong>Le défi quotidien :</strong> {currentScenario.painPoint}
          </p>
        </div>

        {/* Grille des 4 modules recommandés */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {currentScenario.recommendedModules.map((mod) => (
            <Tilt3D key={mod.name} intensity={4}>
              <div className="k-card k-card-hover flex h-full flex-col justify-between rounded-2xl p-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-black text-k-ink">{mod.name}</span>
                    <Link
                      href={mod.href}
                      className="text-xs font-black text-k-orange-text hover:underline"
                    >
                      Détails →
                    </Link>
                  </div>
                  <p className="mt-2 text-xs font-bold text-k-body leading-relaxed">
                    {mod.role}
                  </p>
                  <p className="mt-2 rounded-xl bg-white/80 p-2.5 text-[11px] font-black text-k-muted">
                    💡 <strong>Pourquoi le prendre :</strong> {mod.why}
                  </p>
                </div>
              </div>
            </Tilt3D>
          ))}
        </div>

        {/* Cas concret & Résultat */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border-2 border-k-ink/15 bg-white/90 p-5">
            <p className="text-xs font-black uppercase text-k-orange-text">Scénario concret sur place :</p>
            <p className="mt-2 text-xs sm:text-sm font-bold text-k-body leading-relaxed">
              « {currentScenario.concreteSituation} »
            </p>
          </div>
          <div className="k-card-deep rounded-2xl p-5 text-k-bg flex flex-col justify-center">
            <p className="text-xs font-black uppercase text-k-yellow">Ce que ça change au quotidien :</p>
            <p className="mt-1 text-base sm:text-lg font-black text-k-yellow" style={DISPLAY}>
              {currentScenario.expectedBenefit}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
