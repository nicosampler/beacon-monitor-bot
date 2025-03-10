import { Router } from "express";
import { healthRouter } from "./health/index.js";
import { userRouter } from "./user/index.js";
import { tokenRouter } from "./token/index.js";
import { pricingRouter } from "./pricing/index.js";
import { billingRouter } from "./billing/index.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/user", userRouter);
apiRouter.use("/token", tokenRouter);
apiRouter.use("/pricing", pricingRouter);
apiRouter.use("/billing", billingRouter);
