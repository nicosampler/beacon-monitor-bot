import axios, { AxiosError } from 'axios';
import memoizee from 'memoizee';
import ms from 'ms';
import pLimit from 'p-limit';
import pRetry from 'p-retry';

import { env } from '@/src/lib/env.js';
import {
  AttestationRewards,
  BlockRewards,
  GetAttestations,
  GetCommittees,
  GetValidators,
  GetValidatorsBalances,
  SyncCommitteeRewards,
  GetSyncCommittees,
  Block,
} from '@/src/services/consensus/types.js';
import { instance } from '@/src/services/consensus/utils/instance.js';
import { getEpochSlots } from '@/src/services/consensus/utils/misc.js';
import { getSlotNumberFromTimestamp } from '@/src/services/consensus/utils/time.js';

/**
 * Enhanced BeaconClient class that manages all beacon chain endpoints
 * with concurrency control, exponential backoff, and fallback strategies
 */
export class BeaconClient {
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly baseDelay: number;
  private readonly primaryUrl: string;
  private readonly secondaryUrl: string;

  constructor() {
    this.limit = pLimit(env.BEACON_API_REQUEST_PER_SECOND);
    this.baseDelay = ms('1s');
    this.primaryUrl = env.BEACON_API_URL;
    this.secondaryUrl = env.BEACON_API_BKP_URL;
  }

  /**
   * Helper function to check for missed slot errors
   */
  private isSlotMissedError(error: unknown): boolean {
    const axiosError = error as AxiosError<{ message: string }>;
    return (
      axiosError.response?.status === 404 &&
      axiosError.response?.data.message.includes('NOT_FOUND: beacon block')
    );
  }

  /**
   * Extract error information for logging
   */
  private extractError(error: unknown) {
    if (error instanceof AxiosError) {
      return {
        message: error.message.slice(0, 100),
        code: error.code,
        status: error.response?.status,
      };
    }
    return error;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    return this.baseDelay * Math.pow(2, attempt);
  }

  /**
   * Check if indexer is delayed for priority selection
   */
  private isIndexerDelayed({ value, type }: { value: number; type: 'slot' | 'epoch' }): boolean {
    let slot: number;

    if (type === 'epoch') {
      const { startSlot } = getEpochSlots(value);
      slot = startSlot;
    } else {
      slot = value;
    }

    const currentSlot = getSlotNumberFromTimestamp(Date.now());
    return currentSlot - slot > 250;
  }

  /**
   * Enhanced request method with concurrency control, exponential backoff, and fallback
   */
  private async makeBeaconRequest<T>(
    callEndpoint: (url: string) => Promise<T>,
    nodeType: 'full' | 'archive',
    errorHandler?: (error: AxiosError<{ message: string }>) => T | undefined,
  ): Promise<T> {
    let lastError: unknown;

    const minTimeout = 500;

    // Helper function for archive node retries (20 retries)
    const tryArchiveNode = async (): Promise<T> => {
      return this.limit(() =>
        pRetry(() => callEndpoint(this.secondaryUrl), {
          retries: 20,
          minTimeout,
          onFailedAttempt: async (error) => {
            const delay = this.calculateBackoffDelay(error.attemptNumber);
            console.log(
              `Archive node attempt ${error.attemptNumber} failed, retrying in ${delay}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          },
        }),
      );
    };

    // If nodeType is 'full', try with 10 retries first, then fallback to archive logic
    if (nodeType === 'full') {
      try {
        const result = await this.limit(() =>
          pRetry(() => callEndpoint(this.primaryUrl), {
            retries: 10,
            minTimeout,
            onFailedAttempt: async (error) => {
              const delay = this.calculateBackoffDelay(error.attemptNumber);
              console.log(
                `Full node attempt ${error.attemptNumber} failed, retrying in ${delay}ms`,
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
            },
          }),
        );
        return result;
      } catch (error) {
        lastError = error;
        console.log(`Full node failed after 10 retries, attempting archive node`);

        // Fallback to archive node with 20 retries
        try {
          return await tryArchiveNode();
        } catch (archiveError) {
          lastError = archiveError;
          console.log(`Both full and archive nodes failed`);
        }
      }
    } else {
      // If nodeType is 'archive', use archive node directly with 20 retries
      try {
        return await tryArchiveNode();
      } catch (error) {
        lastError = error;
        console.log(`Archive node failed after 20 retries`);
      }
    }

    // Handle special error cases if handler provided
    if (errorHandler) {
      const handled = errorHandler(lastError as AxiosError<{ message: string }>);
      if (handled !== undefined) {
        return handled;
      }
    }

    throw this.extractError(lastError);
  }

  /**
   * Get committees for a specific epoch
   */
  async getCommittees(epoch: number, stateId = 'head'): Promise<GetCommittees['data']> {
    return this.makeBeaconRequest(
      async (url) => {
        const res = await instance.get<GetCommittees>(
          `${url}/eth/v1/beacon/states/${stateId}/committees?epoch=${epoch}`,
        );
        return res.data.data;
      },
      this.isIndexerDelayed({ value: epoch, type: 'epoch' }) ? 'full' : 'archive',
    );
  }

  /**
   * Get sync committees for a specific epoch
   */
  async getSyncCommittees(epoch: number): Promise<GetSyncCommittees['data']> {
    const { startSlot } = getEpochSlots(epoch);

    return this.makeBeaconRequest(async (url) => {
      const res = await instance.get<GetSyncCommittees>(
        `${url}/eth/v1/beacon/states/${startSlot}/sync_committees?epoch=${epoch}`,
      );
      return res.data.data;
    }, 'archive');
  }

  /**
   * Get block data for a specific slot
   */
  async getBlock(slot: number): Promise<Block | 'SLOT MISSED'> {
    return this.makeBeaconRequest<Block | 'SLOT MISSED'>(
      async (url) => {
        const res = await instance.get<Block>(`${url}/eth/v2/beacon/blocks/${slot}`);
        return res.data;
      },
      'archive',
      (error: Error | AxiosError) => {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return 'SLOT MISSED';
        }
        throw error;
      },
    );
  }

  /**
   * Get attestations for a specific slot
   */
  async getAttestations(slot: number): Promise<GetAttestations['data'] | 'SLOT MISSED'> {
    type AttestationsResponse = GetAttestations['data'];

    const currentSlot = getSlotNumberFromTimestamp(Date.now());

    return this.makeBeaconRequest<AttestationsResponse | 'SLOT MISSED'>(
      async (url) => {
        const res = await instance.get<GetAttestations>(
          `${url}/eth/v1/beacon/blocks/${slot}/attestations`,
        );
        return res.data.data;
      },
      currentSlot - slot > 5 ? 'full' : 'archive',
      (error) => (this.isSlotMissedError(error) ? 'SLOT MISSED' : undefined),
    );
  }

  /**
   * Get validator balances for specific validator IDs
   */
  async getValidatorsBalances(
    stateId: string | number,
    validatorIds: string[],
  ): Promise<GetValidatorsBalances['data']> {
    if (validatorIds.length === 0) {
      throw new Error('No validator IDs provided');
    }

    return this.makeBeaconRequest(async (url) => {
      const res = await instance.post<GetValidatorsBalances>(
        `${url}/eth/v1/beacon/states/${stateId}/validator_balances`,
        validatorIds,
      );
      return res.data.data;
    }, 'full');
  }

  /**
   * Get validators information with optional filtering
   */
  async getValidators(
    stateId: string | number,
    validatorIds: string[] | null,
    statuses: string[] | null,
  ): Promise<GetValidators['data']> {
    return this.makeBeaconRequest(async (url) => {
      const res = await instance.post<GetValidators>(
        `${url}/eth/v1/beacon/states/${stateId}/validators`,
        {
          ids: validatorIds,
          statuses,
        },
      );
      return res.data.data;
    }, 'full');
  }

  /**
   * Get attestation rewards for specific validators in an epoch
   */
  async getAttestationRewards(epoch: number, validatorIds: number[]): Promise<AttestationRewards> {
    return this.makeBeaconRequest(async (url) => {
      const res = await instance.post<AttestationRewards>(
        `${url}/eth/v1/beacon/rewards/attestations/${epoch}`,
        validatorIds.map((id) => id.toString()),
      );
      return res.data;
    }, 'full');
  }

  /**
   * Get block rewards for a specific slot (memoized)
   */
  getBlockRewards = memoizee(
    async (slot: number): Promise<BlockRewards | 'SLOT MISSED'> => {
      return this.makeBeaconRequest<BlockRewards | 'SLOT MISSED'>(
        async (url) => {
          const res = await instance.get<BlockRewards>(
            `${url}/eth/v1/beacon/rewards/blocks/${slot}`,
          );
          return res.data;
        },
        this.isIndexerDelayed({ value: slot, type: 'slot' }) ? 'full' : 'archive',
        (error) => {
          if (this.isSlotMissedError(error)) {
            return 'SLOT MISSED';
          }
          return undefined;
        },
      );
    },
    {
      promise: true,
      maxAge: ms('10m'),
      primitive: true,
    },
  );

  /**
   * Get sync committee rewards for specific validators in a slot (memoized)
   */
  getSyncCommitteeRewards = memoizee(
    async (slot: number, validatorIds: string[]): Promise<SyncCommitteeRewards | 'SLOT MISSED'> => {
      return this.makeBeaconRequest<SyncCommitteeRewards | 'SLOT MISSED'>(
        async (url) => {
          const res = await instance.post<SyncCommitteeRewards>(
            `${url}/eth/v1/beacon/rewards/sync_committee/${slot}`,
            validatorIds,
          );
          return res.data;
        },
        this.isIndexerDelayed({ value: slot, type: 'slot' }) ? 'full' : 'archive',
        (error) => {
          if (this.isSlotMissedError(error)) {
            return 'SLOT MISSED';
          }
          return undefined;
        },
      );
    },
    {
      promise: true,
      maxAge: ms('10m'),
      primitive: true,
    },
  );

  /**
   * Get current concurrency statistics
   */
  getConcurrencyStats() {
    return {
      activeCount: this.limit.activeCount,
      pendingCount: this.limit.pendingCount,
      concurrency: this.limit.concurrency,
    };
  }

  /**
   * Clear the request queue
   */
  clearQueue() {
    this.limit.clearQueue();
  }

  /**
   * Update concurrency limit
   */
  setConcurrency(concurrency: number) {
    this.limit.concurrency = concurrency;
  }
}

// Export a default instance for backward compatibility
export const beaconClient = new BeaconClient();

// Export individual functions for backward compatibility
export const beacon_getCommittees = (epoch: number, stateId = 'head') =>
  beaconClient.getCommittees(epoch, stateId);

export const beacon_getSyncCommittees = (epoch: number) => beaconClient.getSyncCommittees(epoch);

export const beacon_blocks = (slot: number) => beaconClient.getBlock(slot);

export const beacon_getAttestations = (slot: number) => beaconClient.getAttestations(slot);

export const beacon_getValidatorsBalances = (stateId: string | number, validatorIds: string[]) =>
  beaconClient.getValidatorsBalances(stateId, validatorIds);

export const beacon_getValidators = (
  stateId: string | number,
  validatorIds: string[] | null,
  statuses: string[] | null,
) => beaconClient.getValidators(stateId, validatorIds, statuses);

export const beacon_getAttestationRewards = (epoch: number, validatorIds: number[]) =>
  beaconClient.getAttestationRewards(epoch, validatorIds);

export const beacon_getBlockRewards = beaconClient.getBlockRewards;
export const beacon_getSyncCommitteeRewards = beaconClient.getSyncCommitteeRewards;
