import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadHuntRecallContext, loadHuntStepContext } from "@/lib/hunt-context";
import { HuntJourney } from "@/components/hunts/hunt-journey";
import { PageOpenBeacon } from "@/components/page-open-beacon";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique d'une étape de chasse au trésor — DA « Kermesse », même
 * famille visuelle que le parcours pronostics. Le joueur arrive ici en
 * scannant le QR d'une étape ; chaque page correspond à une étape.
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (progression
 * personnelle). Le tampon N'EST PAS posé au chargement (anti-prefetch) —
 * il se fait au POST du bouton « Valider mon passage » (voir HuntJourney).
 */
export const dynamic = "force-dynamic";

/**
 * Un seul chargement par requête, partagé entre generateMetadata et la page.
 *
 * Le repli en deux temps vit ICI plutôt que dans le corps de la page, parce
 * que le statut HTTP se décide maintenant en amont (voir `generateMetadata`) :
 * les deux endroits doivent trancher sur le MÊME contexte, sinon la métadonnée
 * 404erait un joueur que le corps aurait servi.
 *
 * La chasse est close (archivée, ou `ends_at` passée) : on NE ROUVRE PAS le
 * jeu — `loadHuntStepContext` reste le seul chargeur de `stampHuntStep` et il
 * vient de refuser. On tente seulement de RESTITUER un code déjà gagné sur cet
 * appareil. Sans complétion au cookie, le repli refuse à son tour et la page
 * rend le même 404 générique qu'avant.
 *
 * Sans ce repli, le joueur qui terminait le dernier jour sans laisser son
 * e-mail perdait l'accès à un code que la caisse honore pourtant toujours
 * (`redeem_hunt_completion` ne teste ni statut ni fenêtre) — et l'ADR-024
 * fonde le caractère facultatif de l'e-mail sur « le code reste affiché ».
 */
const loadContext = cache(async (token: string) => {
  const played = await loadHuntStepContext(token);
  return played.ok ? played : await loadHuntRecallContext(token);
});

/**
 * LE 404 SE DÉCIDE ICI, ET PAS SEULEMENT DANS LE CORPS.
 *
 * Depuis que le groupe `(player)` porte un `loading.tsx`, le rendu est STREAMÉ :
 * Next envoie l'en-tête HTTP — donc le STATUT — dès que la coquille est prête,
 * et le `notFound()` du corps n'arrive que dans un chunk ultérieur. Un jeton
 * d'étape inconnu rendait alors **200** avec un digest 404 dans le flux.
 * `generateMetadata` s'exécute AVANT le premier octet ; c'est le dernier
 * endroit où le statut est encore négociable. Le `notFound()` du corps reste
 * en filet, et `loadContext` est mémoïsé par `cache()`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const ctx = await loadContext(token);
  if (!ctx.ok) notFound();
  return { title: "Chasse au QR", robots: { index: false } };
}

export default async function HuntStepPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadContext(token);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (chasse inconnue, fermée, hors fenêtre, module coupé…).
  if (!ctx.ok) notFound();

  const { hunt, step, organization, progress } = ctx;
  // L'indice n'est envoyé au client que si CETTE étape est déjà tamponnée
  // (le joueur l'a donc déjà méritée) — jamais présent dans le HTML sinon.
  const alreadyStamped = progress.stamped.includes(step.position);
  // ÉPUISEMENT LU AU SERVEUR, et non plus seulement dans la réponse du dernier
  // scan. Sans cela, le joueur qui bouclait la chasse sur stock épuisé voyait
  // « Trésor épuisé » une fois — puis, au moindre rechargement, une carte de
  // victoire VIDE : pas de code, pas de message, plus rien. `huntFull` ne
  // vivait que dans l'état client du scan ; `complete`, lui, est recalculé
  // côté serveur et restait vrai. Les deux colonnes sont déjà sur `hunt`.
  const rewardSoldOut =
    hunt.reward_stock !== null &&
    hunt.reward_claimed_count >= hunt.reward_stock;

  return (
    <Shell>
      {/*
        Compteur d'ouvertures — PAR ÉTAPE, et c'est tout l'intérêt : chaque
        affiche a son jeton, donc sa ligne de compteur. Un compteur de chasse
        dirait « 40 ouvertures » sans dire QUELLE affiche travaille, la seule
        question que pose le commerçant qui a collé l'étape 1 à la boulangerie
        et l'étape 2 chez le fleuriste.

        LE JETON NE DESCEND PLUS EN PROP — ni ici, ni vers le parcours. Une
        prop serveur → client est sérialisée en clair dans le payload RSC, donc
        recopiée dans le HTML, et ce jeton-ci pose le tampon. Les deux
        composants le relisent de `window.location.pathname` au moment de leur
        appel réseau : la page a déjà rendu son 404 pour tout jeton qui ne
        désigne aucune étape, et `step.token` EST le dernier segment de
        l'adresse. Le repli de restitution (chasse close) compte aussi — c'est
        bien un chargement de l'affiche, et les six autres modules comptent de
        même hors de leur fenêtre.
      */}
      <PageOpenBeacon module="hunts" />
      <HuntJourney
        organizationName={organization.name}
        organizationId={organization.id}
        logoUrl={organization.logo_url}
        huntName={hunt.name}
        orderMode={hunt.order_mode}
        step={{ position: step.position, label: step.label }}
        reward={{ label: hunt.reward_label, details: hunt.reward_details }}
        initial={{
          total: progress.total,
          done: progress.done,
          stamped: progress.stamped,
          completedCode: progress.completedCode,
          rewardSoldOut,
        }}
        revealedHint={alreadyStamped ? step.hint_text : null}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Jeu proposé par {organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=hunt&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </div>
  );
}
