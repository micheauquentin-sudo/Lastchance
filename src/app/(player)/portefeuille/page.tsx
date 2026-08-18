import type { Metadata } from "next";
import Link from "next/link";
import { loadPlayerWallet } from "@/lib/player-wallet";
import { PlayerWalletScreen } from "@/components/wallet/player-wallet-screen";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Le portefeuille du client — page publique, route FIXE.
 *
 * ── LA SIGNATURE EST LA GARANTIE ──
 *
 * Cette fonction ne prend AUCUN argument : ni `params` (la route n'a pas de
 * segment dynamique), ni `searchParams`. Ce n'est pas une simplification, c'est
 * l'interdit n°1 de `src/lib/player-wallet.ts` rendu impossible à contourner :
 * tant que rien n'entre par l'adresse, aucun lien ne peut désigner le
 * portefeuille de quelqu'un d'autre. Un tel lien serait une fuite sérieuse — il
 * porterait des codes de retrait, c'est-à-dire des droits au porteur.
 *
 * ── AUCUN COOKIE POSÉ ICI ──
 *
 * `loadPlayerWallet()` lit le cookie sans jamais l'écrire (`peek…`). Une page
 * de consultation n'a pas à fabriquer une identité de joueur à un visiteur qui
 * passait par là.
 *
 * ── RENDU DYNAMIQUE, ET NON INDEXÉ ──
 *
 * Le contenu dépend du cookie : aucune mise en cache partagée n'aurait de sens,
 * et une page de codes n'a rien à faire dans un index public.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes récompenses",
  robots: { index: false, follow: false },
};

/**
 * L'instant du rendu, lu UNE fois et hors du corps du composant.
 *
 * Deux raisons, la seconde n'étant que la conséquence de la première : une
 * horloge relue à chaque évaluation ferait juger sur deux instants différents
 * deux lots dont l'échéance encadre la limite des 48 h ; et `react-hooks/purity`
 * refuse — à raison — un appel impur dans le corps d'un composant.
 */
async function instantDeRendu(): Promise<number> {
  return Date.now();
}

export default async function PortefeuillePage() {
  const [wallet, maintenant] = await Promise.all([
    loadPlayerWallet(),
    instantDeRendu(),
  ]);

  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse : signature du parcours joueur (passeport,
          chasse, /play). Le client doit reconnaître la même famille. */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <div className="mx-auto max-w-md px-4 pb-10 pt-8">
          <h1 className="text-2xl font-black text-k-ink">Mes récompenses</h1>
          <p className="mt-1 mb-6 text-sm text-k-body">
            Les lots gagnés depuis ce téléphone. Présentez le code en caisse.
          </p>

          <PlayerWalletScreen wallet={wallet} maintenant={maintenant} />

          <footer className="mt-10 text-center text-xs text-k-body">
            Ce portefeuille est lié à ce téléphone, sans compte ni mot de
            passe · propulsé par{" "}
            <Link
              href="/?utm_source=wallet&utm_medium=footer"
              className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
            >
              Lastchance
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
