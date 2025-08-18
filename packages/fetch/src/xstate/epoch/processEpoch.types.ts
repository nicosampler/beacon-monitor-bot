import { EventObject } from 'xstate';

// Context types
export interface ProcessEpochContext {
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

export type ProcessEpochEvents = MarkEpochRunningEvent | MarkEpochDoneEvent;

// Actor output types
export interface PickNextEpochOutput extends ProcessEpochContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
}

export type PickNextEpochResult = PickNextEpochOutput | null;

export interface HasNextEpochParams {
  output: PickNextEpochResult;
}

// Machine setup types
export interface ProcessEpochSetup {
  context: ProcessEpochContext;
  events: ProcessEpochEvents;
}
