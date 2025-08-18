import { EventObject } from 'xstate';

// Context types
export interface EpochOrchestratorContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
  validatorsInfoFetched: boolean;
  rewardsFetched: boolean;
  committeesFetched: boolean;
  slotsFetched: boolean;
  syncCommitteesFetched: boolean;
}

// Event types
export interface MarkEpochRunningEvent extends EventObject {
  type: 'MARK_EPOCH_RUNNING';
}

export interface MarkEpochDoneEvent extends EventObject {
  type: 'MARK_EPOCH_DONE';
}

export type EpochOrchestratorEvents = MarkEpochRunningEvent | MarkEpochDoneEvent;

// Actor output types
export interface PickNextEpochOutput extends EpochOrchestratorContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
}

export type PickNextEpochResult = PickNextEpochOutput | null;

export interface HasNextEpochParams {
  output: PickNextEpochResult;
}

// Machine setup types
export interface EpochOrchestratorSetup {
  context: EpochOrchestratorContext;
  events: EpochOrchestratorEvents;
}
