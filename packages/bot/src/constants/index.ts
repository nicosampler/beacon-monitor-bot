import { BigNumber } from 'ethers';

export const PK = process.env.PK as string;
export const BOT_TOKEN = process.env.BOT_TOKEN as string;
export const RPC_URL = process.env.RPC_URL as string;
export const SC_DEPOSIT_ADDRESS = process.env.SC_DEPOSIT_ADDRESS as string;
export const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL as string;
export const FEE_REWARDS_IN_STABLE = process.env.FEE_REWARDS_IN_STABLE == 'true';
export const FEE_REWARDS_SYMBOL = process.env.FEE_REWARDS_SYMBOL as string;
export const EXPLORER_URL = process.env.EXPLORER_URL as string;
export const ALERT_REPEAT_INTERVAL_MINUTES = Number(process.env.ALERT_REPEAT_INTERVAL_MINUTES);

// Third-party APIs
export const BEACONCHA_API_URL = process.env.BEACON_API_URL as string;
export const BEACON_API_KEY = process.env.BEACON_API_KEY as string;
export const BEACON_API_REQUEST_PER_SECOND = Number(process.env.BEACON_API_REQUEST_PER_SECOND);
export const BEACON_API_REQUEST_PER_MINUTE = Number(process.env.BEACON_API_REQUEST_PER_MINUTE);

export const EXPLORER_API_URL = process.env.EXPLORER_API_URL as string;
export const EXPLORER_API_KEY = process.env.EXPLORER_API_KEY as string;
export const EXPLORER_API_REQUEST_PER_SECOND = Number(process.env.EXPLORER_API_REQUEST_PER_SECOND);
export const EXPLORER_API_REQUEST_PER_DAY = Number(process.env.EXPLORER_API_REQUEST_PER_DAY);

export const COINGECKO_TOKEN_PRICE_API_URL = process.env.COINGECKO_TOKEN_PRICE_API_URL as string;
export const COINGECKO_TOKEN_NAME = process.env.COINGECKO_TOKEN_NAME as string;

// Config
export const OLD_DATE = new Date('2020-12-01T00:00:00Z');
export const EFFECTIVE_BALANCE = 32000000000;
export const LAST_DAYS_REWARDS = 1;

export const DAYS_IN_YEAR = 365.25;
export const DAYS_IN_MONTH = 31;

export const CLAIM_COOL_DOWN_DAYS =
  process.env.CLAIM_COOLDOWN_DAYS == undefined ? 7 : Number(process.env.CLAIM_COOLDOWN_DAYS);

export const DEFAULT_ERROR_MESSAGE = '😢 Something went wrong, please try again later!';

export const TG_ERROR_SAME_MESSAGE =
  'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message';

export const TG_ERROR_BOT_BLOCKED = 'Forbidden: bot was blocked by the user';

export const TG_ADMIN_USER_IDS = ((process.env.TG_ADMIN_USER_IDS as string) || '')
  .split(',')
  .map(Number);

export const WITHDRAWABLE_JOB_TIME = Number(process.env.WITHDRAWABLE_JOB_TIME);
export const TOKEN_PRICE_JOB_TIME = Number(process.env.TOKEN_PRICE_JOB_TIME);
export const NOTIFY_USERS_JOB_TIME = Number(process.env.NOTIFY_USERS_JOB_TIME);

export const ZERO_BN = BigNumber.from(0);
