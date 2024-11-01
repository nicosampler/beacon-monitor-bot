import { CommandContext, Context } from "grammy";

export async function help(ctx: CommandContext<Context>) {
  const message = `Welcome to the GBC validators stats Bot!
  
This bot allows you to track the performance of your validators and receive notifications for any issues. Here's how it works:

1. Use the /load_validators command to add your validators using a withdrawal address.
2. The bot will automatically keep you updated on the stats of your validators.

You will receive notifications in the following scenarios:
- Any of your validators goes offline.
- The average performance of your validators drops below 90% within the last 100 attestations.
- Any of your active validators misses 5 consecutive attestations.

Available commands:
Use the menu button to see all available commands.

If you have any questions or need assistance, feel free to reach us at https://t.me/+It8jmqe4k6s4ODAx.`;

  try {
    await ctx.reply(message);
  } catch (error) {
    console.error(error);
  }
}
