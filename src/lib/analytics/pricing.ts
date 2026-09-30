/**
 * Dynamic delivery bounty pricing for RouteRelay gigs.
 *
 * Base Bounty =
 *   Base Fee
 *   + (Deviation Distance × Km Rate)
 *   + (Deviation Time × Minute Rate)
 *   + Urgency Multiplier (absolute add-on in INR)
 */

export type PricingRates = {
  /** Flat fee in INR */
  baseFee: number;
  /** INR per extra kilometer of detour */
  kmRate: number;
  /** INR per extra minute of detour */
  minuteRate: number;
  /** Minimum payable bounty in INR */
  minBounty: number;
  /** Maximum bounty cap in INR (safety rail) */
  maxBounty: number;
};

export const DEFAULT_PRICING_RATES: PricingRates = {
  baseFee: 40,
  kmRate: 12,
  minuteRate: 2.5,
  minBounty: 40,
  maxBounty: 2_500,
};

export type UrgencyInput = {
  /** When the buyer needs the item by (ISO string or Date) */
  neededBy?: string | Date | null;
  /** Reference "now" for tests; defaults to current time */
  now?: Date;
};

export type BountyBreakdown = {
  baseFee: number;
  distanceComponent: number;
  timeComponent: number;
  urgencyMultiplier: number;
  /** Final bounty charged to the buyer (INR, 2 dp) */
  bountyFee: number;
  rates: PricingRates;
};

/**
 * Urgency add-on in INR based on how soon `neededBy` is.
 * Returns 0 when no deadline is set.
 */
export function computeUrgencyMultiplier(input: UrgencyInput = {}): number {
  if (!input.neededBy) return 0;

  const neededBy =
    typeof input.neededBy === "string"
      ? new Date(input.neededBy)
      : input.neededBy;
  if (Number.isNaN(neededBy.getTime())) return 0;

  const now = input.now ?? new Date();
  const hoursUntil = (neededBy.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil <= 0) return 120; // overdue / immediate
  if (hoursUntil <= 3) return 80;
  if (hoursUntil <= 6) return 50;
  if (hoursUntil <= 12) return 30;
  if (hoursUntil <= 24) return 15;
  return 0;
}

function roundInr(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate the dynamic delivery bounty for a matched detour.
 */
export function calculateDynamicBounty(
  deviationKm: number,
  deviationMins: number,
  urgency: UrgencyInput = {},
  rates: PricingRates = DEFAULT_PRICING_RATES,
): BountyBreakdown {
  const distanceComponent = Math.max(0, deviationKm) * rates.kmRate;
  const timeComponent = Math.max(0, deviationMins) * rates.minuteRate;
  const urgencyMultiplier = computeUrgencyMultiplier(urgency);

  const raw =
    rates.baseFee + distanceComponent + timeComponent + urgencyMultiplier;

  const bountyFee = roundInr(
    Math.min(rates.maxBounty, Math.max(rates.minBounty, raw)),
  );

  return {
    baseFee: rates.baseFee,
    distanceComponent: roundInr(distanceComponent),
    timeComponent: roundInr(timeComponent),
    urgencyMultiplier,
    bountyFee,
    rates,
  };
}
