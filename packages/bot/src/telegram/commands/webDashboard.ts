import { InlineKeyboard } from 'grammy';

import { getDataFromContext } from '../utils/getUserIdFromCtx.js';

import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { env } from '@/src/env.js';
import { handleError } from '@/src/utils/errors/handleError.js';

const prisma = getPrisma();

// Renamed to webDashboard to match the command name
export async function webDashboard(ctx: MyContext) {
  try {
    const { userId } = await getDataFromContext(ctx);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      await ctx.reply('User not found');
      return;
    }

    const loginId = user.loginId;
    const dashboardUrl = `${process.env.NODE_SENTINEL_URL}/${env.NODE_SENTINEL_CHAIN}/dashboard/${loginId}`;

    // Create an inline keyboard with a URL button
    const keyboard = new InlineKeyboard().url('📊 web dashboard', dashboardUrl);

    await ctx.reply('Open extended dashboard', {
      reply_markup: keyboard,
    });
  } catch (error) {
    console.log(error);
    handleError(error, ctx.chat?.id);
  }
}
