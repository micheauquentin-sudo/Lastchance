"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderQr } from "@/lib/qr-render";
import { urlVitrine, type VitrineCarteView } from "@/lib/vitrine";
import { SHARE_QR_STYLE } from "@/components/dashboard/public-share";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

/**
 * LES QR CONTEXTUELS — un code par endroit, une planche à imprimer.
 *
 * ── LE CONTEXTE PASSE PAR L'ANCRE, ET C'EST UNE CONTRAINTE DE CACHE ──
 *
 * `/v/{slug}` est en ISR (`revalidate = 60`, page publique). Un `?carte=…`
 * ferait de cette route une page DYNAMIQUE — Next rend au coup par coup dès
 * qu'un `searchParams` est lu — et le cache disparaîtrait silencieusement : une
 * lecture de base par scan, sur une adresse que n'importe qui peut balayer.
 *
 * D'où le fragment : `#carte-{id}` et `#fiche-{id}` ne sont JAMAIS envoyés au
 * serveur par le navigateur. Le QR pointe sur la même URL mise en cache pour
 * tout le monde, et c'est le composant client (`catalogue-vitrine.tsx`) qui lit
 * le fragment à l'ouverture pour sélectionner la carte et défiler jusqu'à elle.
 * Zéro entrée de cache supplémentaire, zéro rendu dynamique.
 *
 * ── LE NUMÉRO DE TABLE EST UN LIBELLÉ IMPRIMÉ, JAMAIS UNE URL ──
 *
 * Même raison, poussée à son terme : `?table=7` multiplierait les adresses par
 * le nombre de tables — autant d'entrées de cache, autant de rendus — pour une
 * information dont la page publique ne fait STRICTEMENT rien. « Table 7 » est
 * donc écrit sur le papier, à côté du code, et les vingt-quatre exemplaires
 * encodent la même URL. Le jour où une commande à table existera, elle aura
 * besoin d'un jeton signé, pas d'un numéro en clair dans un QR photographiable.
 */

/** Vingt-quatre : six planches A4 de quatre, c'est-à-dire une salle. */
const EXEMPLAIRES_MAX = 24;

type Cible =
  | { kind: "accueil" }
  | { kind: "carte"; id: string; nom: string }
  | { kind: "fiche"; id: string; nom: string; carte: string };

function valeurCible(cible: Cible): string {
  return cible.kind === "accueil" ? "accueil" : `${cible.kind}:${cible.id}`;
}

export function VitrineQrPlanche({
  slug,
  publiee,
  cartes,
  appUrl,
}: {
  slug: string;
  publiee: boolean;
  /** Les cartes du DASHBOARD — masquées comprises : on n'imprime pas à l'aveugle. */
  cartes: VitrineCarteView[];
  appUrl: string;
}) {
  const cibles = useMemo<Cible[]>(() => {
    const liste: Cible[] = [{ kind: "accueil" }];
    for (const carte of cartes) {
      liste.push({ kind: "carte", id: carte.id, nom: carte.nom });
      for (const rubrique of carte.categories) {
        for (const fiche of rubrique.fiches) {
          liste.push({
            kind: "fiche",
            id: fiche.id,
            nom: fiche.nom,
            carte: carte.nom,
          });
        }
      }
    }
    return liste;
  }, [cartes]);

  const [valeur, setValeur] = useState("accueil");
  const [exemplaires, setExemplaires] = useState(1);
  const [prefixe, setPrefixe] = useState("Table");
  /**
   * FERMÉE PAR DÉFAUT, et les canvas avec elle. Dessiner les QR au montage
   * chargeait le fil principal à CHAQUE visite du dashboard Vitrine — pour un
   * outil qu'on ouvre le jour où l'on imprime. Sur les runners WebKit, ce
   * dessin au montage suffisait à faire dériver les clics du test de création
   * de fiche (« waiting for navigation to finish », CI L12). Le pli est la
   * réponse produit ET la réponse machine : rien ne se dessine avant l'intention.
   */
  const [ouverte, setOuverte] = useState(false);

  const cible = cibles.find((c) => valeurCible(c) === valeur) ?? cibles[0];

  const base = urlVitrine(slug, appUrl);
  const url =
    cible.kind === "accueil" ? base : `${base}#${cible.kind}-${cible.id}`;

  const libelleContexte =
    cible.kind === "accueil"
      ? "Votre vitrine"
      : cible.kind === "carte"
        ? cible.nom
        : `${cible.carte} · ${cible.nom}`;

  const exemplairesListe = Array.from({ length: exemplaires }, (_, i) => i);

  const cartesCandidates = cartes.length > 0;

  return (
    <Card>
      <h2>QR et impression</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Un QR code par endroit : l&apos;accueil de votre vitrine sur la porte,
        une carte précise sur les tables, une fiche sur un chevalet. Le contexte
        voyage dans l&apos;adresse elle-même — aucun réglage à faire côté client.
      </p>

      {!publiee ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border-2 border-amber-500/40 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
        >
          Votre vitrine n&apos;est pas publiée : ces QR codes ne mèneront nulle
          part. Publiez-la ci-dessus avant d&apos;imprimer.
        </p>
      ) : null}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { background: #fff !important; }
          .vitrine-qr-controls { display: none !important; }
          .vitrine-qr-pli > summary { display: none !important; }
          .vitrine-qr-planche {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8mm !important;
          }
          .vitrine-qr-carte {
            break-inside: avoid;
            border: 1px dashed #999 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <details
        onToggle={(e) => setOuverte(e.currentTarget.open)}
        className="vitrine-qr-pli"
      >
        <summary className="cursor-pointer select-none text-sm font-bold text-k-ink">
          Préparer les QR à imprimer
        </summary>

        <div className="vitrine-qr-controls mt-4 space-y-4">
        <div>
          <Label htmlFor="vitrine-qr-cible">Ce que le QR ouvre</Label>
          <select
            id="vitrine-qr-cible"
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            className="w-full max-w-md rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm font-semibold text-k-ink"
          >
            <option value="accueil">Accueil de la vitrine</option>
            {cartes.map((carte) => (
              <optgroup key={carte.id} label={carte.nom}>
                <option value={`carte:${carte.id}`}>
                  Carte « {carte.nom} »
                </option>
                {carte.categories.flatMap((rubrique) =>
                  rubrique.fiches.map((fiche) => (
                    <option key={fiche.id} value={`fiche:${fiche.id}`}>
                      {rubrique.nom} · {fiche.nom}
                    </option>
                  )),
                )}
              </optgroup>
            ))}
          </select>
          {!cartesCandidates ? (
            <p className="mt-1.5 text-xs text-zinc-500">
              Créez une carte pour pouvoir viser une carte ou une fiche précise.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <Label htmlFor="vitrine-qr-exemplaires">Exemplaires</Label>
            <Input
              id="vitrine-qr-exemplaires"
              type="number"
              min={1}
              max={EXEMPLAIRES_MAX}
              value={exemplaires}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setExemplaires(Math.min(EXEMPLAIRES_MAX, Math.max(1, Math.trunc(n))));
              }}
            />
          </div>
          <div className="w-44">
            <Label htmlFor="vitrine-qr-prefixe">Libellé imprimé</Label>
            <Input
              id="vitrine-qr-prefixe"
              value={prefixe}
              onChange={(e) => setPrefixe(e.target.value)}
              maxLength={24}
              placeholder="Table"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Numéroté par exemplaire. Laissez vide pour n&apos;imprimer aucun
              numéro.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              void document.fonts?.ready.then(() => window.print());
            }}
          >
            🖨️ Imprimer la planche
          </Button>
        </div>

        <p className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-sm">
          <span className="font-bold text-k-ink">Adresse encodée :</span>{" "}
          <code className="break-all text-k-body">{url}</code>
        </p>
        </div>

        {/* Les canvas n'existent que le pli ouvert : rien ne se dessine
            avant l'intention (voir le commentaire d'`ouverte`). */}
        {ouverte ? (
          <ul className="vitrine-qr-planche mt-5 grid gap-4 sm:grid-cols-2">
            {exemplairesListe.map((index) => (
              <QrExemplaire
                key={index}
                url={url}
                contexte={libelleContexte}
                libelle={
                  prefixe.trim() && exemplaires > 0
                    ? `${prefixe.trim()} ${index + 1}`
                    : null
                }
                fichier={`vitrine-${slug}-${valeur.replace(":", "-")}-${index + 1}`}
              />
            ))}
          </ul>
        ) : null}
      </details>
    </Card>
  );
}

/**
 * Un exemplaire de la planche. Tous encodent la MÊME url — seul le libellé
 * imprimé change, ce qui est exactement la promesse faite plus haut.
 */
function QrExemplaire({
  url,
  contexte,
  libelle,
  fichier,
}: {
  url: string;
  contexte: string;
  libelle: string | null;
  fichier: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // Aperçu seulement : un échec de rendu ne doit pas casser la page.
      void renderQr(canvas, url, SHARE_QR_STYLE, 512).catch(() => {});
    } catch {
      /* canvas indisponible (environnement de test) */
    }
  }, [url]);

  async function telecharger() {
    const canvas = document.createElement("canvas");
    try {
      await renderQr(canvas, url, SHARE_QR_STYLE, 1024);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${fichier}.png`;
      a.click();
    } catch {
      /* rendu impossible : l'impression reste possible */
    }
  }

  return (
    <li className="vitrine-qr-carte flex flex-col items-center rounded-2xl border-2 border-k-ink bg-white p-4 text-center">
      <p className="text-xs font-black uppercase tracking-wide text-k-body">
        {contexte}
      </p>
      {libelle ? (
        <p className="mt-1 text-lg font-black text-k-ink">{libelle}</p>
      ) : null}
      <canvas
        ref={canvasRef}
        className="mx-auto mt-3 h-auto w-full max-w-[12rem]"
        role="img"
        aria-label={`QR code — ${contexte}${libelle ? ` — ${libelle}` : ""}`}
      />
      <p className="mt-3 text-sm font-bold text-k-body">
        Scannez pour voir notre carte
      </p>
      <button
        type="button"
        onClick={telecharger}
        className="vitrine-qr-controls mt-2 text-sm font-bold text-k-orange-text hover:underline"
      >
        Télécharger ce QR (PNG)
      </button>
    </li>
  );
}
