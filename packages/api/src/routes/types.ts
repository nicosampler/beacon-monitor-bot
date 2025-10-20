export type ErrorResponse = {
  error: string;
};

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
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
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
  attestation_status: 'active' | 'inactive' | 'slashed' | 'exited';
};

export type UserValidatorsInfo = {
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

export type SlotInfoResponse = {
  headSlot: number;
  lastSlotProcessed: number;
  syncing: boolean;
  delay: number;
  maxSafeSlotToQuery: number;
  maxSafeEpochToQuery: number;
};

// Rewards summary endpoint types
export type RewardsByDay = {
  [date: string]: number; // date in YYYY-MM-DD format
};

export type ValidatorRewards = {
  validator_index: number;
  execution_layer_rewards: {
    by_day: RewardsByDay;
    monthly_total: number;
  };
  consensus_layer_rewards: {
    by_day: RewardsByDay;
    monthly_total: number;
  };
};

export type MonthlyTotals = {
  execution_layer: number;
  consensus_layer: number;
};

export type RewardsSummaryResponse = {
  withdrawal_addresses: string[];
  fee_reward_addresses?: string[];
  month: string; // YYYY-MM format
  validators: ValidatorRewards[];
  monthly_totals: MonthlyTotals;
  generated_at: string; // ISO timestamp
};
