import { Bot } from 'grammy';
import { ToadScheduler } from 'toad-scheduler';

import { MyContext } from '@/src/config/session.js';
import { env } from '@/src/env.js';

export const bot = new Bot<MyContext>(env.TG_BOT_TOKEN);
export type BotType = typeof bot;

export const scheduler = new ToadScheduler();
