"use client";

import { useEffect, useState } from "react";
import {
  ensureQrDistributionAsset,
  getQrDistributionRewardCount,
  type QrDistributionKind,
} from "@/actions/qr-distribution";
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
        const result = await getQrDistributionRewardCount({
          resourceKind: resource.kind,
          resourceId: resource.id,
        });
        if (active) {
          if (result.ok) setRewardCount(result.data ?? 0);
          else setError(result.error);
        }
        return;
      }
      const result = await ensureQrDistributionAsset({
        resourceKind: resource.kind,
        resourceId: resource.id,
      });
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
