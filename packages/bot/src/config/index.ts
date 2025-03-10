import { MyContext } from "@/src/config/session.js";
import { BOT_TOKEN } from "@/src/constants/index.js";
import { Bot } from "grammy";
import { ToadScheduler } from "toad-scheduler";

export const bot = new Bot<MyContext>(BOT_TOKEN);
export type BotType = typeof bot;

export const scheduler = new ToadScheduler();
