import { vi } from 'vitest';

// Global environment setup using vi.hoisted()
vi.hoisted(() => {
  // Set all required environment variables globally
  process.env.ENVIRONMENT = 'development';

  process.env.LOG_OUTPUT = 'console';
  process.env.LOG_LEVEL = 'debug';

  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.TG_ADMIN_USER_IDS = '123456789';
  process.env.TG_BOT_IS_DEV = 'false';

  process.env.NODE_SENTINEL_URL = 'https://sentinel.example.com';
  process.env.NODE_SENTINEL_CHAIN = 'ethereum';
  process.env.NODE_SENTINEL_PRIVATE_KEY = 'test-private-key';
  process.env.NODE_SENTINEL_API_URL = 'https://api.example.com';
  process.env.NODE_SENTINEL_API_PORT = '3005';
  process.env.NODE_SENTINEL_API_SECRET_KEY = 'test-secret';

  process.env.BEACON_GENESIS_TIMESTAMP = '1606824000';
  process.env.BEACON_SLOT_DURATION_IN_SECONDS = '12';
  process.env.BEACON_SLOTS_PER_EPOCH = '32';
  process.env.BEACON_DELAY_SLOTS_TO_HEAD = '2';
  process.env.BEACON_LOOKBACK_SLOT = '0';
  process.env.BEACON_MAX_ATTESTATION_DELAY = '2';
  process.env.BEACON_API_URL = 'https://beacon.example.com';
  process.env.BEACON_API_BKP_URL = 'https://beacon-bkp.example.com';
  process.env.BEACON_API_REQUEST_PER_SECOND = '10';

  process.env.EXECUTION_EXPLORER_URL = 'https://explorer.example.com';
  process.env.EXECUTION_API_URL = 'https://execution.example.com';
  process.env.EXECUTION_API_KEY = 'test-api-key';
  process.env.EXECUTION_API_BKP_URL = 'https://execution-bkp.example.com';
  process.env.EXECUTION_API_BKP_KEY = 'test-bkp-key';
  process.env.EXECUTION_API_REQUEST_PER_SECOND = '10';
  process.env.EXECUTION_RPC_URL = 'https://rpc.example.com';

  process.env.BLOCKCHAIN_CHAIN_ID = '1';
  process.env.BLOCKCHAIN_TOKEN_SYMBOL = 'ETH';
  process.env.BLOCKCHAIN_CL_REWARDS_SYMBOL = 'ETH';
  process.env.BLOCKCHAIN_EL_REWARDS_SYMBOL = 'ETH';
  process.env.BLOCKCHAIN_FEE_REWARDS_IN_STABLE = 'false';
  process.env.BEACON_EPOCHS_PER_SYNC_COMMITTEE_PERIOD = '256';
  process.env.BLOCKCHAIN_FEE_REWARDS_SYMBOL = 'ETH';
  process.env.BLOCKCHAIN_SC_DEPOSIT_ADDRESS = '0x0000000000000000000000000000000000000000';

  process.env.COINGECKO_TOKEN_PRICE_API_URL = 'https://api.coingecko.com';
  process.env.COINGECKO_TOKEN_NAME = 'ethereum';
});
