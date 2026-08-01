import Link from "next/link";
import type {
  PlayerWalletView,
  WalletOrganizationGroup,
  WalletReward,
  WalletRewardStatus,
} from "@/lib/player-wallet";
import { formatDate } from "@/lib/utils";

/**
 * Le portefeuille du client — le RENDU. Le métier est dans
 * `src/lib/player-wallet.ts`, qui porte les trois interdits ; ce fichier ne
 * fait que les respecter, et voici comment.
 *
 * ── AUCUN JETON DANS L'URL ──
 *
 * `PlayerWalletScreen` reçoit une vue DÉJÀ CHARGÉE, et la page qui l'appelle
 * ne prend ni `params` ni `searchParams`. La route est fixe : rien de ce que
 * porte l'adresse ne peut désigner un porte-monnaie. C'est ce qui rend le lien
 * impartageable — et un lien partageable listerait des CODES DE RETRAIT, donc
 * des droits au porteur.
 *
 * ── AUCUNE JOURNALISATION D'UN CODE ──
 *
 * Pas un `console`, pas un `data-*`, pas un compteur. Le code est écrit dans le
 * document rendu au porteur du cookie, et nulle part ailleurs.
 *
 * ── AUCUN COOKIE, ET AUCUN JAVASCRIPT ──
 *
 * Tout ce fichier est un composant SERVEUR : aucun `"use client"`, donc rien de
 * ce qui touche un code ne part dans un paquet JavaScript. C'est aussi la
 * raison pour laquelle le QR de `RedeemQr` n'est PAS repris ici : il est
 * client, il regénérerait le code dans le navigateur, et empiler cinq QR sur un
 * écran de téléphone dessert de toute façon le geste que cette page doit rendre
 * immédiat — montrer LE code.
 *
 * ── L'ORDRE VIENT DU SERVEUR ──
 *
 * Les groupes arrivent triés (nom du commerçant, puis émission décroissante).
 * On ne retrie rien, pas même pour remonter les lots encore valables : deux
 * tris concurrents finissent toujours par diverger, et c'est la RPC qui a
 * raison.
 */

/**
 * Les quatre états, et l'habillage de chacun.
 *
 * `player-wallet-contrast.test.ts` LIT ces classes, résout les jetons `k-*`
 * depuis `globals.css` et recalcule le rapport WCAG de chaque pastille. Ce
 * n'est pas une précaution de principe : ce produit a publié deux fois sur
 * /play un titre à 1,38:1, parce que des couleurs avaient été choisies à l'œil
 * et que rien ne les mesurait. Un état ajouté ici est mesuré d'office.
 */
export const WALLET_STATUS_TONES: Record<
  WalletRewardStatus,
  {
    /** Ce que le client lit sur la pastille. */
    label: string;
    /** Ce qu'il doit comprendre, en une ligne. */
    hint: string;
    /** Pastille : un `bg-*` et un `text-*`, tous deux mesurés. */
    className: string;
    /** Le code est-il encore un droit ? Décide de sa mise en avant. */
    presentable: boolean;
  }
> = {
  active: {
    label: "À retirer",
    hint: "Montrez ce code en caisse.",
    className: "bg-k-green text-white",
    presentable: true,
  },
  redeemed: {
    label: "Déjà retiré",
    hint: "Ce lot vous a été remis.",
    className: "bg-white text-k-body border-2 border-k-ink",
    presentable: false,
  },
  cancelled: {
    label: "Annulé",
    hint: "Le commerçant a annulé ce lot.",
    className: "bg-red-100 text-red-700 border-2 border-red-700",
    presentable: false,
  },
  expired: {
    label: "Expiré",
    hint: "La date limite est passée.",
    className: "bg-white text-k-muted border-2 border-k-muted",
    presentable: false,
  },
};

/** Échéance proche : même traitement mesuré que les pastilles d'état. */
export const WALLET_URGENT_BADGE = "bg-k-yellow text-k-ink";

/**
 * Les textes posés sur le blanc des cartouches, déclarés pour la mesure.
 *
 * Cette liste-ci est un miroir tenu à la main — le test le dit aussi. Elle
 * existe parce qu'un `text-k-muted` glissé un jour sur une mention de 11 px
 * passerait sinon sans que rien ne compte.
 */
export const WALLET_SURFACE_TEXTS = {
  fond: "bg-white",
  textes: ["text-k-ink", "text-k-body", "text-k-muted"],
} as const;

/**
 * Fenêtre d'alerte sur l'échéance. Deux jours parce que c'est l'ordre de
 * grandeur d'un « je repasse demain » : en dessous, le client doit savoir qu'il
 * ne peut plus remettre à plus tard.
 */
const ECHEANCE_PROCHE_MS = 48 * 60 * 60 * 1000;

export function expireBientot(reward: WalletReward, maintenant: number): boolean {
  if (!reward.expiresAt) return false;
  const reste = new Date(reward.expiresAt).getTime() - maintenant;
  return reste > 0 && reste <= ECHEANCE_PROCHE_MS;
}

/** Cartouche kermesse : encre épaisse, ombre dure — famille /play. */
const CARTE =
  "rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]";

function RewardCard({
  reward,
  maintenant,
}: {
  reward: WalletReward;
  maintenant: number;
}) {
  const tone = WALLET_STATUS_TONES[reward.status];
  const urgent = tone.presentable && expireBientot(reward, maintenant);

  return (
    <li className={CARTE}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black leading-tight text-k-ink">
          {reward.label}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${tone.className}`}
        >
          {tone.label}
        </span>
      </div>

      {/* LE GESTE DE LA PAGE. Le code d'un lot encore dû se lit à bout de bras,
          au comptoir, dans la précipitation : il est le plus gros élément de la
          carte. Un lot retiré, annulé ou expiré garde son code — c'est la trace
          de ce que le client a gagné — mais rendu au corps de texte, parce que
          le mettre en avant serait promettre un droit qui n'existe plus. */}
      <p
        className={
          tone.presentable
            ? "mt-3 font-mono text-2xl font-bold tracking-[0.18em] text-k-ink"
            : "mt-3 font-mono text-sm tracking-[0.14em] text-k-muted"
        }
      >
        {reward.code}
      </p>

      <p className="mt-2 text-sm text-k-body">{tone.hint}</p>

      <dl className="mt-3 space-y-1 text-xs text-k-body">
        <div className="flex gap-1.5">
          <dt className="text-k-muted">Gagné le</dt>
          <dd className="font-semibold">{formatDate(reward.issuedAt)}</dd>
        </div>
        {reward.expiresAt && (
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="text-k-muted">
              {tone.presentable ? "Valable jusqu'au" : "Échéance"}
            </dt>
            <dd className="font-semibold">{formatDate(reward.expiresAt)}</dd>
            {urgent && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${WALLET_URGENT_BADGE}`}
              >
                Bientôt fini
              </span>
            )}
          </div>
        )}
      </dl>
    </li>
  );
}

function OrganizationGroup({
  group,
  maintenant,
}: {
  group: WalletOrganizationGroup;
  maintenant: number;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 text-lg font-black text-k-ink">
        {group.organizationName}
      </h2>
      <ul className="space-y-3">
        {group.rewards.map((reward) => (
          // L'organisation et le code font une clé stable : la RPC garantit
          // l'unicité du code par organisation.
          <RewardCard
            key={`${group.organizationId}-${reward.code}`}
            reward={reward}
            maintenant={maintenant}
          />
        ))}
      </ul>
    </section>
  );
}

/** Écran d'état : un titre, une explication, une sortie utile. */
function EtatVide({
  titre,
  texte,
  action,
}: {
  titre: string;
  texte: string;
  action: React.ReactNode;
}) {
  return (
    <div className={`${CARTE} text-center`}>
      <h2 className="text-xl font-black text-k-ink">{titre}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-k-body">{texte}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}

const BOUTON =
  "inline-block rounded-xl border-2 border-k-ink bg-k-yellow px-5 py-3 text-sm font-black uppercase tracking-wide text-k-ink shadow-[4px_4px_0_var(--color-k-ink)]";

export function PlayerWalletScreen({
  wallet,
  maintenant,
}: {
  wallet: PlayerWalletView;
  /** Instant de rendu, injecté pour que l'échéance proche soit testable. */
  maintenant: number;
}) {
  if (wallet.status === "unavailable") {
    return (
      <EtatVide
        titre="Vos récompenses sont momentanément inaccessibles"
        texte="Ce n'est pas vous : nous n'arrivons pas à les relire à l'instant. Rien n'est perdu, réessayez dans quelques secondes."
        // Rechargement par simple lien : aucun JavaScript n'est nécessaire pour
        // sortir de cet état, ce qui est bien le moins quand la cause peut être
        // un réseau de boutique à moitié coupé.
        action={
          <a href="/portefeuille" className={BOUTON}>
            Réessayer
          </a>
        }
      />
    );
  }

  if (wallet.status === "no-device") {
    // PAS UNE ERREUR, et le texte doit l'énoncer avant tout : ce visiteur n'a
    // jamais joué depuis ce téléphone. Lui dire « aucune récompense trouvée »
    // laisserait croire qu'il en avait et qu'il les a perdues.
    return (
      <EtatVide
        titre="Rien à afficher sur ce téléphone"
        texte="Ce portefeuille se remplit tout seul dès votre premier jeu. Scannez le QR code d'un commerce participant : vos gains s'y rangeront automatiquement, sans compte à créer."
        action={
          <Link href="/?utm_source=wallet&utm_medium=empty" className={BOUTON}>
            Comment ça marche
          </Link>
        }
      />
    );
  }

  if (wallet.totalCount === 0) {
    // ÉTAT DISTINCT du précédent : ce téléphone est bien connu, il n'a
    // simplement rien en cours. Promettre « scannez pour commencer » à
    // quelqu'un qui a déjà joué serait faux.
    return (
      <EtatVide
        titre="Aucune récompense en cours"
        texte="Vos gains apparaîtront ici dès votre prochaine partie gagnante."
        action={
          <Link href="/?utm_source=wallet&utm_medium=zero" className={BOUTON}>
            Découvrir Lastchance
          </Link>
        }
      />
    );
  }

  return (
    <>
      <p className="mb-6 text-sm font-bold text-k-body">
        {wallet.activeCount === 0
          ? `${wallet.totalCount} récompense${wallet.totalCount > 1 ? "s" : ""}, aucune à retirer pour le moment.`
          : `${wallet.activeCount} récompense${wallet.activeCount > 1 ? "s" : ""} à retirer sur ${wallet.totalCount}.`}
      </p>
      {wallet.organizations.map((group) => (
        <OrganizationGroup
          key={group.organizationId}
          group={group}
          maintenant={maintenant}
        />
      ))}
    </>
  );
}
