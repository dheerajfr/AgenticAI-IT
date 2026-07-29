/**
 * Simple markdown-to-HTML renderer.
 * Preserves the business case preview rendering from shell.js renderMarkdown()
 */
export function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h4>$1</h4>')
    .replace(/^# (.+)$/gm, '<h5>$1</h5>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    // Paragraphs: wrap non-tag lines
    .replace(/^(?!<[hul]|<\/[hul])(.+)$/gm, '<p>$1</p>');
  return html;
}
