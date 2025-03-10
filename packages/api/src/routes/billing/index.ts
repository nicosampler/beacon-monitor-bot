import { Router } from "express";
import { billingController } from "./controller.js";

export const billingRouter = Router();

billingRouter.get("/", billingController);
