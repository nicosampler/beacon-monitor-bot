import { BotType } from "@/src/config/index.js";
import { MyContext } from "@/src/config/session.js";
import { deleteUser } from "@/src/telegram/commands/deleteUser.js";
import { MenuTemplate, createBackMainMenuButtons } from "grammy-inline-menu";

export function createUserMenu(bot: BotType) {
  const userSubmenu = new MenuTemplate<MyContext>(() => "👤 User management");
  userSubmenu.interact("deleteAccount", {
    text: "❌ Delete account",
    do: async (context, path) => {
      await deleteUser(context);
      return true;
    },
  });
  userSubmenu.manualRow(createBackMainMenuButtons());

  return userSubmenu;
}
