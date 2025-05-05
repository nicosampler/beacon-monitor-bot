/**
 * Configuration for beacon URLs
 */
export type BeaconConfig = {
  primaryUrl: string;
  secondaryUrl: string;
};

/**
 * URL priority options
 */
export type UrlPriority = 'primary' | 'secondary';

/**
 * Options for endpoint requests
 */
export type EndpointOptions = {
  /**
   * URL priority to use for the request
   * @default 'primary'
   */
  priority?: UrlPriority;

  /**
   * Whether to attempt fallback to the other URL if the first one fails
   * @default true
   */
  attemptFallback?: boolean;

  /**
   * Number of retries for the request
   * @default 0
   */
  retries?: number;
};

// TODO: analyze when to use each status to do filtering for the beacon API.
// https://docs.blockdaemon.com/docs/eth-validator-statuses
export type ValidatorStatus =
  | 'pending_initialized'
  | 'pending_queued'
  | 'active_ongoing'
  | 'active_exiting'
  | 'active_slashed'
  | 'exited_unslashed'
  | 'exited_slashed'
  | 'withdrawal_possible'
  | 'withdrawal_done';

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
    signature: string;
    committee_bits: string;
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

export type BlockRewards = {
  execution_optimistic: boolean;
  finalized: boolean;
  data: {
    proposer_index: string;
    total: string;
    attestations: string;
    sync_aggregate: string;
    proposer_slashings: string;
    attester_slashings: string;
  };
};

export type SyncCommitteeRewards = {
  execution_optimistic: boolean;
  finalized: boolean;
  data: {
    validator_index: string;
    reward: string;
  }[];
};
