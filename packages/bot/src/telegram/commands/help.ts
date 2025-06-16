import { CommandContext, Context } from 'grammy';

export async function help(ctx: CommandContext<Context>) {
  const message = `🚀 *Welcome to Node Sentinel!*

*Validators monitoring made simple.*
Get real-time visibility into your validators' performance and health, with instant alerts when something needs your attention.

*📋 Getting Started:*

1️⃣ Add your validators:
   • Go to \`Menu > Validators Management > Add withdrawal address\`
   • Enter your withdrawal address to track your validators

2️⃣ Set up fee rewards:
   • Use \`/menu/Validators Management/Add fee reward address\`
   • Add your fee reward address to track earnings

3️⃣ Monitor your stats:
   • Wait for your dashboard message to come, it will be updated automatically.

*🔔 We'll notify you when:*
• Your validators become inactive
• Your performance drops

*💬 Need help?*
[Join our community](https://t.me/+It8jmqe4k6s4ODAx)`;

  try {
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(error);
  }
}
