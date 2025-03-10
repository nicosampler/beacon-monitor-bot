import { Router } from "express";
import { healthCheck } from "./controller.js";

export const healthRouter = Router();

healthRouter.get("/", healthCheck);
