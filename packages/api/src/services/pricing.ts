import { getTokenPrice } from "./tokenPrice.js";

const YEARLY_DISCOUNT_PERCENTAGE = 20;
const tokensPerValidator = 1;

export interface PricingTier {
  minValidators: number;
  maxValidators: number;
  priceUSD: number;
}

export const PRICING_TIERS: PricingTier[] = [
  { minValidators: 1, maxValidators: 20, priceUSD: 0 },
  { minValidators: 20, maxValidators: 30, priceUSD: 2 },
  { minValidators: 30, maxValidators: 50, priceUSD: 3 },
  { minValidators: 50, maxValidators: 100, priceUSD: 5 },
  { minValidators: 100, maxValidators: 200, priceUSD: 9 },
  { minValidators: 200, maxValidators: 300, priceUSD: 13 },
  { minValidators: 300, maxValidators: 400, priceUSD: 14 },
  { minValidators: 400, maxValidators: 500, priceUSD: 15 },
  { minValidators: 500, maxValidators: 600, priceUSD: 16 },
  { minValidators: 600, maxValidators: 700, priceUSD: 18.5 },
  { minValidators: 700, maxValidators: 800, priceUSD: 21 },
  { minValidators: 800, maxValidators: 900, priceUSD: 23.5 },
  { minValidators: 900, maxValidators: 1000, priceUSD: 25.5 },
  { minValidators: 1000, maxValidators: 1200, priceUSD: 26 },
  { minValidators: 1200, maxValidators: 1500, priceUSD: 26.5 },
  { minValidators: 1500, maxValidators: 2000, priceUSD: 27 },
  { minValidators: 2000, maxValidators: 2500, priceUSD: 32 },
  { minValidators: 2500, maxValidators: 5000, priceUSD: 55 },
  { minValidators: 5000, maxValidators: 10000, priceUSD: 100 },
  { minValidators: 10000, maxValidators: 25000, priceUSD: 250 },
];

export interface PricingDetails {
  minValidators: number;
  maxValidators: number;
  pricePerValidator: number;
  subscriptionPercentage: number;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount: number;
  yearlySavings: number;
}

function calculateYearlyPrice(monthlyPrice: number): {
  yearlyPrice: number;
  yearlySavings: number;
} {
  const yearlyPriceWithoutDiscount = monthlyPrice * 12;
  const discount =
    (yearlyPriceWithoutDiscount * YEARLY_DISCOUNT_PERCENTAGE) / 100;
  return {
    yearlyPrice: yearlyPriceWithoutDiscount - discount,
    yearlySavings: discount,
  };
}

export async function calculatePricingDetails(
  validatorCount: number
): Promise<PricingDetails | null> {
  const tier = PRICING_TIERS.find(
    (t) =>
      validatorCount >= t.minValidators && validatorCount <= t.maxValidators
  );

  if (!tier) return null;

  const tokenPrice = await getTokenPrice();

  // Calculate price per validator
  const pricePerValidator = tier.priceUSD / tier.maxValidators;

  // Calculate total value staked and subscription percentage
  const totalStakedValue = tier.maxValidators * tokenPrice * tokensPerValidator;
  const subscriptionPercentage = (tier.priceUSD / totalStakedValue) * 100;

  // Calculate monthly price
  const monthlyPrice = tier.priceUSD;

  // Calculate yearly price with discount
  const { yearlyPrice, yearlySavings } = calculateYearlyPrice(monthlyPrice);

  return {
    minValidators: tier.minValidators,
    maxValidators: tier.maxValidators,
    pricePerValidator,
    subscriptionPercentage,
    monthlyPrice,
    yearlyPrice,
    yearlyDiscount: YEARLY_DISCOUNT_PERCENTAGE,
    yearlySavings,
  };
}

export async function getAllPricingTiers(): Promise<PricingDetails[]> {
  const tokenPrice = await getTokenPrice();

  return Promise.all(
    PRICING_TIERS.map(async (tier) => {
      const pricePerValidator = tier.priceUSD / tier.maxValidators;

      // Calculate total value staked and subscription percentage
      const totalStakedValue =
        tier.maxValidators * tokenPrice * tokensPerValidator;
      const subscriptionPercentage = (tier.priceUSD / totalStakedValue) * 100;

      // Calculate monthly price
      const monthlyPrice = tier.priceUSD;

      // Calculate yearly price with discount
      const { yearlyPrice, yearlySavings } = calculateYearlyPrice(monthlyPrice);

      return {
        minValidators: tier.minValidators,
        maxValidators: tier.maxValidators,
        pricePerValidator,
        subscriptionPercentage,
        monthlyPrice,
        yearlyPrice,
        yearlyDiscount: YEARLY_DISCOUNT_PERCENTAGE,
        yearlySavings,
      };
    })
  );
}
