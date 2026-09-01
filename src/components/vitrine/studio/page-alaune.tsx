"use client";

import Link from "next/link";
import type { ContenuVitrineView, VitrineLiensView } from "@/lib/vitrine";

/**
 * LA PAGE « À LA UNE » DU STUDIO — coquille (VIT-20), remplie par VIT-21.
 *
 * Y viendront les contenus mis en avant, les réseaux sociaux et le lien
 * « Évaluez-nous », chacun avec sa case — c'est ce qui manquait : les trois
 * liens se saisissaient dans les réglages généraux du commerce, et rien ne
 * disait s'ils devaient figurer sur la carte.
 */
export function PageALaUneStudio({
  contenus,
  liens,
  socialVisible,
  onSocialVisible,
  peutEditer,
}: {
  contenus: ContenuVitrineView[];
  liens: VitrineLiensView;
  /** Le bloc « Réseaux et avis » paraît-il ? Masquer, c'est omettre (VIT-3). */
  socialVisible: boolean;
  onSocialVisible: (visible: boolean) => void;
  peutEditer: boolean;
}) {
  void contenus;
  void liens;
  void socialVisible;
  void onSocialVisible;
  void peutEditer;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        À la une
      </h2>
      <p className="text-sm text-k-body">
        Vos mises en avant, vos réseaux et vos avis se règlent encore depuis
        l&apos;atelier. Ils viendront ici, avec leur case.
      </p>
      <Link
        href="/dashboard/vitrine?etape=alaune"
        className="inline-block rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow"
      >
        Régler mes mises en avant
      </Link>
    </div>
  );
}
