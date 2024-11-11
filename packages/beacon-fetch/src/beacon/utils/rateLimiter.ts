import { env } from "@/src/env.js";
import { RateLimiterMemory } from "rate-limiter-flexible";

// Create a rate limiter per second
const limiterPerSecond = new RateLimiterMemory({
  points: env.BEACON_API_REQUEST_PER_SECOND,
  duration: 1, // Per second
  keyPrefix: "per-second",
});

// Function to limit requests
export async function limitRequests<T>(): Promise<T> {
  try {
    // Consume a point from both rate limiters
    await limiterPerSecond.consume("per-second-key", 1);
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
