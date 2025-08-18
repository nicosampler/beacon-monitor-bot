import { getCreateEpochActor } from './xstate/epoch/index.js';

console.log('Testing Actor Logger...');

// Create the actor
const actor = getCreateEpochActor();

// Start the actor
actor.start();

// Let it run for a few seconds to see the logging
setTimeout(() => {
  console.log('\nStopping actor...');
  actor.stop();
  console.log('Test completed!');
}, 10000);
