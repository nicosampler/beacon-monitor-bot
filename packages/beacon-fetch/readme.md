// This function is responsible for pulling the committee data from the beacon node and storing it in the database.
// Each Epoch is composed of slots, each slot has several committees identified by an index.
// For a slot and index there is a list of validators that should attest.

Scheduler:
getAttestationsHead:

// If the process is not running, and getAttestationsHead was not able to get the data
// there is this process that will recover the missing data.
getMissingAttestations:
