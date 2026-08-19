export const CHAT_EMOJI_GROUPS = [
  {
    label: "Smiles",
    emojis: ["😀", "😊", "😂", "🙂", "😉", "😍", "🤗", "😮", "😢", "🤔", "😅", "🥳"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️", "👋", "🫶"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "✨", "⭐", "🎉", "🔥", "☀️", "🌈"],
  },
] as const;

export const CHAT_EMOJIS = CHAT_EMOJI_GROUPS.flatMap((group) => group.emojis);

export function insertIntoTextarea(
  value: string,
  insert: string,
  textarea: HTMLTextAreaElement | null,
  maxLength = 2000,
): string | null {
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insert + value.slice(end);
  if (next.length > maxLength) return null;

  if (textarea) {
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + insert.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  return next;
}
