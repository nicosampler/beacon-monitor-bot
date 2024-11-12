import { env } from "@/src/env.js";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Singleton instance
let instance: RateLimiterMemory | null = null;

// Get or create rate limiter instance
function getRateLimiter(): RateLimiterMemory {
  if (!instance) {
    instance = new RateLimiterMemory({
      points: env.BEACON_API_REQUEST_PER_SECOND,
      duration: 1, // Per second
      keyPrefix: "per-second",
    });
  }
  return instance;
}

// Function to limit requests
export async function limitRequests<T>(): Promise<T> {
  const limiter = getRateLimiter();
  try {
    // Consume a point from rate limiter
    await limiter.consume("per-second-key", 1);
  } catch (err: any) {
    if (err.msBeforeNext) {
      // Delay the request if it exceeds the limit
      await new Promise((resolve) =>
        setTimeout(resolve, err.msBeforeNext + 500)
      );
      return limitRequests();
    }
    throw err;
  }
}
