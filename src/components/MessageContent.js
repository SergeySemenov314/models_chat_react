import React from 'react';

const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function renderInline(text) {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    }
    return part;
  });
}

const isBlockStart = (line) => /^\s*(```|#{1,6}\s|[-*]\s|\d+\.\s)/.test(line);

export default function MessageContent({ content }) {
  const lines = String(content || '').replace(/\$\\rightarrow\$/g, '→').split(/\r?\n/);
  const blocks = [];

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={blocks.length}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      blocks.push(React.createElement(`h${level}`, { key: blocks.length }, renderInline(heading[2])));
      i++;
      continue;
    }

    const listType = /^\s*[-*]\s+/.test(line) ? 'ul' : /^\s*\d+\.\s+/.test(line) ? 'ol' : null;
    if (listType) {
      const items = [];
      const pattern = listType === 'ul' ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={items.length}>{renderInline(lines[i].match(pattern)[1])}</li>);
        i++;
      }
      blocks.push(React.createElement(listType, { key: blocks.length }, items));
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !isBlockStart(lines[i]))) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push(<p key={blocks.length}>{renderInline(paragraph.join(' '))}</p>);
  }

  return <div className="message-markdown">{blocks}</div>;
}
