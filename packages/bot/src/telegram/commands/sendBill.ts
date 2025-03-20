import { getDataFromContext } from '../utils/getUserIdFromCtx.js';

import { getPrisma } from '@/src/config/prisma.js';
import { MyContext } from '@/src/config/session.js';
import { TG_ADMIN_USER_IDS } from '@/src/constants/index.js';
import { sendMessage } from '@/src/telegram/utils/messaging.js';
import { AppError } from '@/src/utils/errors/AppError.js';

const prisma = getPrisma();

// Renamed to webDashboard to match the command name
export async function sendBill(ctx: MyContext) {
  try {
    const { userId } = getDataFromContext(ctx);

    // Check if the user is authorized
    if (!TG_ADMIN_USER_IDS.includes(userId)) {
      throw new AppError('You are not authorized to use this command.', 'UNAUTHORIZED');
    }

    // Get all users from database
    const users = await prisma.user.findMany({
      where: {
        hasBlockedBot: false,
      },
      include: {
        validators: true,
      },
    });

    for (const user of users) {
      // Get pricing details for this user's validator count
      // const response = await fetch(
      //   `${env.API_URL}/api/pricing/calculate?validators=${user.validators.length}`,
      //   {
      //     headers: {
      //       Authorization: `Bearer ${env.API_SECRET_KEY}`,
      //     },
      //   }
      // );

      // if (!response.ok) {
      //   throw new Error(`Failed to fetch pricing for user ${user.userId}`);
      // }

      // const pricingData: SpecificPricingResponse = await response.json();

      // Create personalized message for each user
      const message = `Hello fellow validator,

For months, we've been providing this tool for free\\. To keep it running and continue improving it, we're inviting you to contribute as a patron with a *one\\-time* donation\\.

*Patron Tiers\\:*
👷‍♂️ Maintainer *$100\\+*
  \\- Keeps it running ⚙️
🦸‍♂️ Sidekick *$300\\+*
  \\- Drives development 🚀
👑 Boss *$500\\+*
  \\- Secures the future 🏛️

These are just guidelines, you're free to contribute based on the value the tool has provided you, considering both past usage and the next few months until we complete all planned features and reach a stable release\\.

*Donate at:*
\`0xDA74B77BA4BE36619b248088214D807A581292C4\`
\\(Gnosis, Ethereum, Optimism, Base, Arbitrum\\)

If you have any questions, feel free to reach out\\!
Thanks, Nico\\!

[🌐 node\\-sentinel\\.xyz](https://node\\-sentinel\\.xyz)`;

      try {
        // Send message to user
        await sendMessage(user.userId.toString(), message, {
          parse_mode: 'MarkdownV2',
        });

        // Add delay between messages to avoid hitting rate limits
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error sending heads_up message to user ${user.userId}:`, error);
      }
    }

    await ctx.reply('Bills sent to all users successfully.');
  } catch (error) {
    console.error('Error in sendBill:', error);
  }
}
