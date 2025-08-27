import { EventObject } from 'xstate';
import { ActorRef } from 'xstate';

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
  slotActor?: ActorRef<any, any> | null;
  currentSlot?: number; // Add currentSlot to track current slot number
}

// Event types
export interface MarkEpochRunningEvent extends EventObject {
  type: 'MARK_EPOCH_RUNNING';
}

export interface MarkEpochDoneEvent extends EventObject {
  type: 'MARK_EPOCH_DONE';
}

export interface CommitteesReadyEvent extends EventObject {
  type: 'COMMITTEES_READY';
}

export interface SlotCompletedEvent extends EventObject {
  type: 'SLOT_COMPLETED';
  slot: number;
  epoch: number;
}

export type ProcessEpochEvents =
  | MarkEpochRunningEvent
  | MarkEpochDoneEvent
  | CommitteesReadyEvent
  | SlotCompletedEvent;

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
  input: {
    epoch: number;
    validatorsInfoFetched: boolean;
    rewardsFetched: boolean;
    committeesFetched: boolean;
    slotsFetched: boolean;
    syncCommitteesFetched?: boolean;
    currentSlot?: number; // Add currentSlot to input type
  };
}
