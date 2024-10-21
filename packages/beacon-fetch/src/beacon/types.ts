export type ValidatorStatus =
  | "pending_initialized"
  | "pending_queued"
  | "active_ongoing"
  | "active_exiting"
  | "active_slashed"
  | "exited_unslashed"
  | "exited_slashed"
  | "withdrawal_possible"
  | "withdrawal_done";

export type GetCommittees = {
  execution_optimistic: boolean;
  finalized: boolean;
  data: {
    index: string;
    slot: string;
    validators: string[];
  }[];
};

export type GetAttestations = {
  execution_optimistic: boolean;
  finalized: boolean;
  data: {
    aggregation_bits: string;
    data: {
      slot: string;
      index: string;
      beacon_block_root: string;
      source: {
        epoch: string;
        root: string;
      };
      target: {
        epoch: string;
        root: string;
      };
    };
    signature: string;
  }[];
};

export type GetValidatorsBalances = {
  execution_optimistic: boolean;
  finalized: boolean;
  data: {
    index: string;
    balance: string;
  }[];
};

export type GetValidators = {
  execution_optimistic: boolean;
  data: {
    index: string;
    balance: string;
    status: ValidatorStatus;
    validator: {
      pubkey: string;
      withdrawal_credentials: string;
      effective_balance: string;
      slashed: string;
      activation_eligibility_epoch: string;
      activation_epoch: string;
      exit_epoch: string;
      withdrawable_epoch: string;
    };
  }[];
};

export type AttestationRewards = {
  execution_optimistic: boolean;
  finalized?: boolean;
  data: {
    ideal_rewards: {
      effective_balance: string;
      head: string;
      target: string;
      source: string;
      inclusion_delay?: string;
      inactivity?: string;
    }[];
    total_rewards: {
      validator_index: string;
      head: string;
      target: string;
      source: string;
      inclusion_delay?: string;
      inactivity?: string;
    }[];
  };
};
