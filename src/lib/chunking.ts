/** Split text at paragraphs and preserve the active section heading in each chunk. */
export function chunkText(text: string, chunkSize = 220, overlap = 30): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 20 || !Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new Error('Chunk size and overlap are invalid.');
  }
  if (!text?.trim()) return [];
  const paragraphs = text.replace(/\r/g, '\n').split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chunks: string[] = [];
  const seen = new Set<string>();
  let heading = '';
  for (const paragraph of paragraphs) {
    if (/^#{1,6}\s/.test(paragraph)) {
      heading = paragraph.replace(/^#{1,6}\s*/, '').slice(0, 200);
      continue;
    }
    const words = paragraph.split(' ');
    for (let start = 0; start < words.length; start += chunkSize - overlap) {
      const section = heading ? `[Heading: ${heading}] ` : '';
      const content = section + words.slice(start, start + chunkSize).join(' ');
      const key = content.toLocaleLowerCase();
      if (content.trim() && !seen.has(key)) { chunks.push(content); seen.add(key); }
      if (start + chunkSize >= words.length) break;
    }
  }
  return chunks;
}
