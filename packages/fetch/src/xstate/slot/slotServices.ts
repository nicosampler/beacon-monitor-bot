import { fetchCommittee } from '../../beacon/feed/fetchCommittee.js';
//import { fetchAttestations } from '../../beacon/feed/fetchAttestations.js';
import { fetchBeaconRewards } from '../../beacon/feed/fetchBeaconRewards.js';
//import { fetchExecutionRewards } from '../../execution/endpoints.js';

export const slotServices = {
  'slot.fetchCommitteeAndUpsert': async (context: any, event: any) => {
    try {
      const { slot } = context;
      const epoch = Math.floor(slot / 32);
      //await fetchCommittee(epoch);
      return { success: true };
    } catch (error) {
      console.error('Error fetching committee for slot:', error);
      throw error;
    }
  },

  'slot.fetchAttestationsAndUpsert': async (context: any, event: any) => {
    try {
      const { slot } = context;
      //await fetchAttestations(slot);
      return { success: true };
    } catch (error) {
      console.error('Error fetching attestations for slot:', error);
      throw error;
    }
  },

  'slot.fetchCLRewardsAndUpsert': async (context: any, event: any) => {
    try {
      const { slot } = context;
      //await fetchBeaconRewards(Math.floor(slot / 32));
      return { success: true };
    } catch (error) {
      console.error('Error fetching CL rewards for slot:', error);
      throw error;
    }
  },

  'slot.fetchELRewardsAndUpsertOrSkip': async (context: any, event: any) => {
    try {
      const { slot } = context;
      // Try to fetch execution rewards, skip if not available
      try {
        //await fetchExecutionRewards(slot);
      } catch (error) {
        // Skip execution rewards if not available for this slot
        console.log(`Skipping execution rewards for slot ${slot}:`, error);
      }
      return { success: true };
    } catch (error) {
      console.error('Error in EL rewards processing for slot:', error);
      throw error;
    }
  },
};
