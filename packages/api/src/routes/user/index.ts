import { validateRequest } from "@/src/lib/middleware/validate.js";
import { getActiveUsersValidatorsController } from "@/src/routes/user/getUserValidatorCountsController.js";
import { getUserInfoController } from "@/src/routes/user/getUserInfoController.js";
import { userParamsSchema } from "@/src/routes/user/schema.js";
import { Router } from "express";

export const userRouter = Router();

userRouter.get("/active-users-validators", getActiveUsersValidatorsController);

userRouter.get(
  "/:loginId/info",
  validateRequest({ params: userParamsSchema }),
  getUserInfoController
);
