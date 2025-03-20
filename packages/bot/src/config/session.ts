import { type ConversationFlavor } from '@grammyjs/conversations';
import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;

export function getInitialSession(): SessionData {
  return {};
}
