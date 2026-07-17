/** Références minimales utilisées pour vérifier les frontières de tenant. */
interface TenantResource {
  id: string;
  organization_id: string;
}

type CampaignResource = TenantResource;

interface WheelResource extends TenantResource {
  campaign_id: string;
}

interface PrizeResource extends TenantResource {
  wheel_id: string;
}

interface QrResource extends TenantResource {
  campaign_id: string;
}

interface SpinResource extends TenantResource {
  campaign_id: string;
  wheel_id: string;
  prize_id: string | null;
}

/**
 * La service-role contourne la RLS : chaque relation du contexte public doit
 * donc être reliée au même tenant, même si les FK simples sont valides.
 */
export function isConsistentPlayResourceChain(input: {
  qr: QrResource;
  campaign: CampaignResource;
  wheel: WheelResource;
  prizes: PrizeResource[];
}): boolean {
  const { qr, campaign, wheel, prizes } = input;
  return (
    qr.organization_id === campaign.organization_id &&
    qr.campaign_id === campaign.id &&
    wheel.organization_id === campaign.organization_id &&
    wheel.campaign_id === campaign.id &&
    prizes.every(
      (prize) =>
        prize.organization_id === campaign.organization_id &&
        prize.wheel_id === wheel.id,
    )
  );
}

/** Vérifie la chaîne complète avant de matérialiser un gain public. */
export function isConsistentClaimResourceChain(input: {
  spin: SpinResource;
  campaign: CampaignResource;
  wheel: WheelResource;
  prize: PrizeResource;
}): boolean {
  const { spin, campaign, wheel, prize } = input;
  return (
    spin.prize_id === prize.id &&
    spin.organization_id === campaign.organization_id &&
    spin.campaign_id === campaign.id &&
    spin.organization_id === wheel.organization_id &&
    spin.campaign_id === wheel.campaign_id &&
    spin.wheel_id === wheel.id &&
    spin.organization_id === prize.organization_id &&
    spin.wheel_id === prize.wheel_id
  );
}
