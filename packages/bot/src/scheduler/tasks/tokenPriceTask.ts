import axios from 'axios';
import { AsyncTask } from 'toad-scheduler';

import { env } from '@/src/env.js';

export let tokenPrice = 0;

export function tokenPriceTaskImp(): Promise<number> {
  return axios
    .get<{ [key in string]: { usd: number } }>(
      `${env.COINGECKO_TOKEN_PRICE_API_URL}?ids=${env.COINGECKO_TOKEN_NAME}&vs_currencies=usd`,
    )
    .then((res) => {
      tokenPrice = res.data[env.COINGECKO_TOKEN_NAME]?.usd || 0;
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
