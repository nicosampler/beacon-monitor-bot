export type UserValidators = {
  username: string;
  validatorStatuses: {
    activeIds: number[];
    inactiveIds: number[];
    slashedIds: number[];
    exitedIds: number[];
  };
};

export type ActiveUsersValidators = {
  username: string;
  activeValidators: number;
};

// New types for health endpoint
export type HealthResponse = {
  status: "healthy" | "unhealthy";
  database: "connected" | "disconnected";
  timestamp: string;
};

// Token price endpoint
export type TokenPriceResponse = {
  price: number;
  timestamp: string;
};

// Pricing endpoints
export type PricingTierResponse = {
  minValidators: number;
  maxValidators: number;
  pricePerValidator: number;
  subscriptionPercentage: number;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount: number;
  yearlySavings: number;
};

export type PricingResponse = {
  tiers: PricingTierResponse[];
  tokenPrice: number;
  timestamp: string;
};

export type SpecificPricingResponse = PricingTierResponse & {
  tokenPrice: number;
  timestamp: string;
};

// Error responses
export type ErrorResponse = {
  error: string;
  timestamp: string;
};

export type UserBilling = {
  username: string;
  validatorCount: number;
  monthlyPrice: number;
  yearlyPrice: number;
};

export type UserBillingDetail = {
  userId: number;
  username: string;
  validatorCount: number;
  monthlyPrice: number;
};

export type NodeBillingResponse = {
  users: UserBillingDetail[];
  totalMonthly: number;
  timestamp: string;
};

export type ValidatorStatuses = {
  activeIds: number[];
  inactiveIds: number[];
  slashedIds: number[];
  exitedIds: number[];
};

export type ValidatorStatusesByWithdrawal = {
  [withdrawalAddress: string]: ValidatorStatuses;
};

export type ValidatorInfo = {
  withdrawal_address: string | null;
  validator_id: number;
  attestation_status: "active" | "inactive" | "slashed" | "exited";
};

export type UserInfo = {
  username: string;
  validatorsByWithdrawal: ValidatorStatusesByWithdrawal;
  missedAttestations: {
    slot: number;
    timestamp: number;
    index: number;
    attestationDelay: number | null;
    validatorIndex: number;
  }[];
};
