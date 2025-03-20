import { MenuTemplate, createBackMainMenuButtons } from 'grammy-inline-menu';

import { MyContext } from '@/src/config/session.js';
import { deleteUser } from '@/src/telegram/commands/deleteUser.js';

export function createUserMenu() {
  const userSubmenu = new MenuTemplate<MyContext>(() => '👤 User management');
  userSubmenu.interact('deleteAccount', {
    text: '❌ Delete account',
    do: async (context) => {
      await deleteUser(context);
      return true;
    },
  });
  userSubmenu.manualRow(createBackMainMenuButtons());

  return userSubmenu;
}
