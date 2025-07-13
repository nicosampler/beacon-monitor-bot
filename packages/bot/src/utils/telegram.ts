// Function to escape special characters for MarkdownV2
export function escapeMarkdown(text: string): string {
  // First escape all special characters
  let escaped = text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

  // Then unescape the parts we want to keep as Markdown
  // Unescape backticks for code blocks
  escaped = escaped.replace(/\\`/g, '`');
  // Unescape brackets for links
  escaped = escaped.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
  escaped = escaped.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
  // Unescape asterisks for bold text
  escaped = escaped.replace(/\\\*/g, '*');
  // Unescape emojis and special characters
  escaped = escaped
    .replace(/\\📊/g, '📊')
    .replace(/\\💎/g, '💎')
    .replace(/\\🕒/g, '🕒')
    .replace(/\\━/g, '━');

  return escaped;
}
