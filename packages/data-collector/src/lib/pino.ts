import * as Pino from "pino";

export const logger = Pino.pino({
  level: "info",
  transport: {
    target: "pino-pretty",
  },
});
