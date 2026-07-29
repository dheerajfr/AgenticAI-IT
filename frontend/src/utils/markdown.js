export function renderMarkdown(md) {
  if (!md) return '';
  
  // Escape HTML to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
     
  // Headers:
  html = html.replace(/^###\s+(.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*?)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#\s+(.*?)$/gm, '<h5>$1</h5>');
  
  // Bold: **text** or __text__ -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_ -> <em>text</em>
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Lists: * item or - item -> <li>item</li>
  let lines = html.split('\n');
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (line.startsWith('* ') || line.startsWith('- ')) {
      let content = line.substring(2);
      if (!inList) {
        lines[i] = '<ul>\n<li>' + content + '</li>';
        inList = true;
      } else {
        lines[i] = '<li>' + content + '</li>';
      }
    } else {
      if (inList) {
        lines[i] = '</ul>\n' + lines[i];
        inList = false;
      }
    }
  }
  if (inList) {
    lines.push('</ul>');
  }
  html = lines.join('\n');
  
  // Paragraphs / line breaks
  let blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    let trimmed = block.trim();
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') || trimmed.startsWith('</ul')) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  
  return html;
}
