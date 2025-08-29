import { EventObject } from 'xstate';
import { ActorRef } from 'xstate';

// Context types
export interface ProcessEpochContext {
  epoch: number;
  startSlot: number;
  endSlot: number;
  epochDBStatus: {
    validatorsInfoFetched: boolean;
    rewardsFetched: boolean;
    committeesFetched: boolean;
    slotsFetched: boolean;
    syncCommitteesFetched: boolean;
  };
  slotOrchestratorActor?: ActorRef<any, any> | null;
  currentSlot?: number; // Add currentSlot to track current slot number
}

// Event types
export interface MarkEpochRunningEvent extends EventObject {
  type: 'MARK_EPOCH_RUNNING';
}

export interface MarkEpochDoneEvent extends EventObject {
  type: 'MARK_EPOCH_DONE';
}

export interface CommitteesFetchedEvent extends EventObject {
  type: 'COMMITTEES_FETCHED';
}

export interface SlotsCompletedEvent extends EventObject {
  type: 'SLOTS_COMPLETED';
  epoch: number;
}

export type ProcessEpochEvents =
  | MarkEpochRunningEvent
  | MarkEpochDoneEvent
  | CommitteesFetchedEvent
  | SlotsCompletedEvent;

// Actor output types
export interface PickNextEpochOutput {
  epoch: number;
  startSlot: number;
  endSlot: number;
  validatorsInfoFetched: boolean;
  rewardsFetched: boolean;
  committeesFetched: boolean;
  slotsFetched: boolean;
  syncCommitteesFetched: boolean;
}

export type PickNextEpochResult = PickNextEpochOutput | null;

export interface HasNextEpochParams {
  output: PickNextEpochResult;
}

// Machine setup types
export interface ProcessEpochSetup {
  context: ProcessEpochContext;
  events: ProcessEpochEvents;
  input: {
    epoch: number;
    validatorsInfoFetched: boolean;
    rewardsFetched: boolean;
    committeesFetched: boolean;
    slotsFetched: boolean;
    syncCommitteesFetched: boolean;
    currentSlot?: number; // Add currentSlot to input type
  };
}
