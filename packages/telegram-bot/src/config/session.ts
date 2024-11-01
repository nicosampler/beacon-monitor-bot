import { Context, SessionFlavor } from "grammy";
import { type ConversationFlavor } from "@grammyjs/conversations";
export interface SessionData {}

export type MyContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor;

export function getInitialSession(): SessionData {
  return {};
}
