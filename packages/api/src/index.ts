import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./env.js";
import { getPrisma } from "./lib/prisma.js";
import { apiRouter } from "./routes/index.js";

const app = express();

// Security middleware
// Add Helmet to enhance API security with various HTTP headers
app.use(helmet());

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiter to all requests
app.use(limiter);

// CORS configuration - allow all origins but protect routes with authentication
app.use(cors());

app.use(express.json());

// Middleware to verify Bearer token
const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized - Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  // Compare with your expected token
  if (token !== env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }

  next();
};

// API Routes with authentication
app.use("/api", authMiddleware, apiRouter);

// Initialize Prisma
getPrisma();

const port = env.PORT;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
