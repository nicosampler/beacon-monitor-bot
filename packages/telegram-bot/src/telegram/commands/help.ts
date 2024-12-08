import { CommandContext, Context } from "grammy";

export async function help(ctx: CommandContext<Context>) {
  const message = `Welcome to the gnosis.node-sentinel.xyz bot!
  
This bot allows you to track the performance of your validators and receive notifications for any issues. Here's how it works:

1. Use the "/menu/Validators Management/Add withdrawal address" command to add your validators using your withdrawal address.
2. Use the "/menu/Validators Management/Add fee reward address" command to add the fee reward address for your validators.

That's all! The bot will keep you updated on the stats of your validators and notify you in the following scenarios:
- Any of your validators goes offline.
- The average performance of your validators drops below 90% within the last hour.
- Any of your active validators becomes inactive.

Available commands:
Use the menu button to see all available commands.

If you have any questions or need assistance, join the telegram support group at https://t.me/+It8jmqe4k6s4ODAx.`;

  try {
    await ctx.reply(message);
  } catch (error) {
    console.error(error);
  }
}
