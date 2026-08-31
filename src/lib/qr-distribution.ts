export const qrDistributionKinds = [
  "quiz", "calendar", "pronostics", "jackpot", "loyalty", "event",
  "reservation", "duo", "portrait", "hunt_step", "vitrine",
] as const;

export type QrDistributionKind = (typeof qrDistributionKinds)[number];
