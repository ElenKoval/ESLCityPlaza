export const CHAT_UNREAD_REFRESH_EVENT = "plaza-chat-unread-refresh";
export const CHAT_READS_STORAGE_PREFIX = "plaza-chat-last-read:";

export function dispatchChatUnreadRefresh() {
  window.dispatchEvent(new Event(CHAT_UNREAD_REFRESH_EVENT));
}

export function chatReadsTableMissing(message: string) {
  return /chat_reads|schema cache|does not exist/i.test(message);
}

export function chatLastReadStorageKey(userId: string) {
  return `${CHAT_READS_STORAGE_PREFIX}${userId}`;
}
