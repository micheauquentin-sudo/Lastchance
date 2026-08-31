"use client";

import { useEffect, useState } from "react";
import type { QrDistributionKind } from "@/lib/qr-distribution";
import { QrDesigner } from "@/components/dashboard/qr-designer";
import type { QrStyle } from "@/types/database";

type Asset = { id: string; style: QrStyle; poster: Record<string, unknown> };

/**
 * Chargé uniquement après un geste explicite. Les actions QR ne doivent jamais
 * rejoindre le runtime d'un formulaire métier (réservation, vitrine, jeu).
 */
export function QrDistributionControls({
  resource,
  url,
  fileName,
  initialAction,
  onClose,
  onStyleSaved,
}: {
  resource: { kind: QrDistributionKind; id: string };
  url: string;
  fileName: string;
  initialAction: "designer" | "poster" | "metrics";
  onClose: () => void;
  onStyleSaved?: (style: QrStyle) => void;
}) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [rewardCount, setRewardCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (initialAction === "metrics") {
        const params = new URLSearchParams({ kind: resource.kind, id: resource.id });
        const response = await fetch(`/api/dashboard/qr-distribution?${params}`, { cache: "no-store" });
        const result = response.ok
          ? { ok: true as const, data: (await response.json() as { rewardCount: number | null }).rewardCount }
          : { ok: false as const, error: "Lecture des gains impossible" };
        if (active) {
          if (result.ok) setRewardCount(result.data ?? 0);
          else setError(result.error);
        }
        return;
      }
      const response = await fetch("/api/dashboard/qr-distribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: resource.kind, id: resource.id }),
      });
      const result = response.ok
        ? { ok: true as const, data: (await response.json() as { asset: Asset }).asset }
        : { ok: false as const, error: "Création du QR impossible" };
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAsset(result.data);
      if (initialAction === "poster") {
        window.open(`/poster/distribution/${result.data.id}`, "_blank", "noopener,noreferrer");
        onClose();
      }
    }
    void load();
    return () => { active = false; };
  }, [initialAction, onClose, resource.id, resource.kind]);

  if (error) return <p role="alert" className="text-xs font-bold text-red-600">{error}</p>;
  if (initialAction === "metrics") {
    return rewardCount === null ? null : (
      <p className="text-xs text-zinc-500">
        <span className="font-bold text-k-ink">{rewardCount} gain{rewardCount > 1 ? "s" : ""}</span>{" "}
        attribué{rewardCount > 1 ? "s" : ""}
      </p>
    );
  }
  if (initialAction !== "designer" || !asset) return null;
  return (
    <QrDesigner
      id={asset.id}
      slug={fileName}
      url={url}
      initialStyle={asset.style}
      distribution={{ resourceKind: resource.kind, resourceId: resource.id }}
      onClose={onClose}
      onSaved={(style) => {
        onStyleSaved?.(style);
      }}
    />
  );
}
