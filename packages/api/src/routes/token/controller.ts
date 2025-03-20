import { Request, Response } from 'express';

import { getTokenPrice } from '../../services/tokenPrice.js';
import { TokenPriceResponse, ErrorResponse } from '../types.js';

export async function getTokenPriceController(
  _: Request,
  res: Response<TokenPriceResponse | ErrorResponse>,
) {
  try {
    const price = await getTokenPrice();
    const response: TokenPriceResponse = {
      price,
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (error) {
    console.error('Error in token price controller:', error);
    const response: ErrorResponse = {
      error: 'Failed to fetch token price',
      timestamp: new Date().toISOString(),
    };
    return res.status(500).json(response);
  }
}
