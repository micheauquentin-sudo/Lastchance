"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import type { CampaignWindowState } from "@/lib/campaign-window";
import type { CampaignStatus } from "@/types/database";

interface CampaignStatusContextValue {
  status: CampaignStatus;
  setStatus: (status: CampaignStatus) => void;
}

const CampaignStatusContext = createContext<CampaignStatusContextValue | null>(null);

/**
 * Une publication réussie a déjà sa vérité canonique dans la réponse de la
 * Server Action. La tenir ici évite un rechargement complet de la page et garde
 * le titre et les commandes cohérents jusqu'à la prochaine navigation.
 */
export function CampaignStatusProvider({
  initialStatus,
  children,
}: {
  initialStatus: CampaignStatus;
  children: ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);

  return (
    <CampaignStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </CampaignStatusContext.Provider>
  );
}

export function useCampaignStatus() {
  const context = useContext(CampaignStatusContext);
  if (!context) {
    throw new Error("CampaignStatusControls doit être rendu dans CampaignStatusProvider");
  }
  return context;
}

export function CampaignStatusBadgeLive({ windowState }: { windowState: CampaignWindowState }) {
  const { status } = useCampaignStatus();
  return <CampaignStatusBadge status={status} windowState={windowState} />;
}
