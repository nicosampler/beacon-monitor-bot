import { Request, Response } from "express";
import {
  calculatePricingDetails,
  getAllPricingTiers,
} from "../../services/pricing.js";
import { getTokenPrice } from "../../services/tokenPrice.js";
import {
  PricingResponse,
  SpecificPricingResponse,
  ErrorResponse,
} from "../types.js";

export async function getPricingController(
  _: Request,
  res: Response<PricingResponse | ErrorResponse>
) {
  try {
    const tiers = await getAllPricingTiers();
    const tokenPrice = await getTokenPrice();

    const response: PricingResponse = {
      tiers,
      tokenPrice,
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (error) {
    console.error("Error in pricing controller:", error);
    const response: ErrorResponse = {
      error: "Failed to fetch pricing information",
      timestamp: new Date().toISOString(),
    };
    return res.status(500).json(response);
  }
}

export async function getSpecificPricingController(
  req: Request<any, any, any, { validators?: string }>,
  res: Response<SpecificPricingResponse | ErrorResponse>
) {
  try {
    const validatorCount = parseInt(req.query.validators || "0");

    if (isNaN(validatorCount) || validatorCount <= 0) {
      const response: ErrorResponse = {
        error: "Invalid validator count",
        timestamp: new Date().toISOString(),
      };
      return res.status(400).json(response);
    }

    const pricingDetails = await calculatePricingDetails(validatorCount);
    const tokenPrice = await getTokenPrice();

    if (!pricingDetails) {
      const response: ErrorResponse = {
        error: "No pricing tier found for this validator count",
        timestamp: new Date().toISOString(),
      };
      return res.status(404).json(response);
    }

    const response: SpecificPricingResponse = {
      ...pricingDetails,
      tokenPrice,
      timestamp: new Date().toISOString(),
    };
    return res.json(response);
  } catch (error) {
    console.error("Error in specific pricing controller:", error);
    const response: ErrorResponse = {
      error: "Failed to calculate pricing",
      timestamp: new Date().toISOString(),
    };
    return res.status(500).json(response);
  }
}
