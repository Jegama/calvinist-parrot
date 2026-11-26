import { z } from "zod";
import type { ChatActor } from "@/lib/guest";

// The chat reference prefix is reserved for the hosted MCP service. Its
// isolated guest identity never comes from a browser cookie.
export const MCP_CHAT_PREFIX = "mcp1_";
export const mcpConversationRefSchema = z.string().regex(/^mcp1_[A-Za-z0-9_-]{43}$/);
export const browserGuestIdSchema = z.uuidv4();

function isBrowserGuest(actor: ChatActor) {
  return actor.kind === "guest" && !actor.guestId.startsWith("mcp-guest:");
}

export function browserGuestCannotAccess(actor: ChatActor, chatId?: string | null) {
  return isBrowserGuest(actor) && Boolean(chatId?.startsWith(MCP_CHAT_PREFIX));
}

export function browserGuestChatFilter(actor: ChatActor) {
  return isBrowserGuest(actor) ? { NOT: { id: { startsWith: MCP_CHAT_PREFIX } } } : {};
}
