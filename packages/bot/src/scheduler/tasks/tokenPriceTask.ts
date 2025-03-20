import axios from 'axios';
import { AsyncTask } from 'toad-scheduler';

import { COINGECKO_TOKEN_NAME, COINGECKO_TOKEN_PRICE_API_URL } from '@/src/constants/index.js';

export let tokenPrice = 0;

export function tokenPriceTaskImp(): Promise<number> {
  return axios
    .get<{ [key in string]: { usd: number } }>(
      `${COINGECKO_TOKEN_PRICE_API_URL}?ids=${COINGECKO_TOKEN_NAME}&vs_currencies=usd`,
    )
    .then((res) => {
      tokenPrice = res.data[COINGECKO_TOKEN_NAME]?.usd || 0;
      return tokenPrice;
    })
    .catch((err) => {
      console.log(err);
      return tokenPrice;
    });
}

export const tokenPriceTask = new AsyncTask('tokenPrice', () =>
  tokenPriceTaskImp().catch(console.error),
);
