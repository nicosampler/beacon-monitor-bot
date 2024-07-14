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
