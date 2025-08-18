import { getCreateEpochActor, getProcessEpochActor } from './xstate/epoch/index.js';
import { getMultiMachineLogger } from './lib/multiMachineLogger.js';

console.log('Testing Multi-Machine Logger...\n');

// Create the actors
const createEpochsActor = getCreateEpochActor();
const processEpochsActor = getProcessEpochActor();

// Start both machines
createEpochsActor.start();
processEpochsActor.start();

// Let them run for a while to see the logging
setTimeout(() => {
  console.log('\n🛑 Stopping machines...');
  createEpochsActor.stop();
  processEpochsActor.stop();

  // Stop the logger
  getMultiMachineLogger().done();

  console.log('✅ Test completed!');
}, 15000);
