import pdfParse from "pdf-parse";

export interface TextChunk {
  section_title: string;
  text: string;
  page_range: [number, number];
}

const SECTION_HEADING_RE =
  /^(?:#{1,4}\s+|[A-Z][A-Z\s]{3,}$|(?:Section|SECTION)\s+[\d.]+|(?:\d+\.)+\s+[A-Z])/m;

const MIN_CHUNK_LENGTH = 200;
const MAX_CHUNK_LENGTH = 3000;

export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

/**
 * Splits raw text into section-aware chunks. Prefers splitting at section
 * headings; falls back to paragraph boundaries when sections are too long.
 */
export function chunkText(rawText: string): TextChunk[] {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const sections: { title: string; lines: string[] }[] = [];
  let currentTitle = "Introduction";
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentLines.push("");
      continue;
    }

    if (SECTION_HEADING_RE.test(trimmed) && trimmed.length < 120) {
      if (currentLines.length > 0) {
        sections.push({ title: currentTitle, lines: [...currentLines] });
      }
      currentTitle = trimmed.replace(/^#{1,4}\s+/, "").trim();
      currentLines = [];
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, lines: currentLines });
  }

  const chunks: TextChunk[] = [];
  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (sectionText.length < MIN_CHUNK_LENGTH) continue;

    if (sectionText.length <= MAX_CHUNK_LENGTH) {
      chunks.push({
        section_title: section.title,
        text: sectionText,
        page_range: [1, 1],
      });
    } else {
      const subChunks = splitByParagraphs(sectionText, section.title);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

function splitByParagraphs(text: string, sectionTitle: string): TextChunk[] {
  const paragraphs = text.split(/\n{2,}/);
  const results: TextChunk[] = [];
  let buffer = "";
  let partIndex = 1;

  for (const para of paragraphs) {
    const candidate = buffer ? buffer + "\n\n" + para : para;

    if (candidate.length > MAX_CHUNK_LENGTH && buffer.length >= MIN_CHUNK_LENGTH) {
      results.push({
        section_title: `${sectionTitle} (Part ${partIndex})`,
        text: buffer.trim(),
        page_range: [1, 1],
      });
      partIndex++;
      buffer = para;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim().length >= MIN_CHUNK_LENGTH) {
    results.push({
      section_title:
        results.length > 0
          ? `${sectionTitle} (Part ${partIndex})`
          : sectionTitle,
      text: buffer.trim(),
      page_range: [1, 1],
    });
  } else if (buffer.trim().length > 0 && results.length > 0) {
    const last = results[results.length - 1];
    last.text += "\n\n" + buffer.trim();
  } else if (buffer.trim().length > 0) {
    results.push({
      section_title: sectionTitle,
      text: buffer.trim(),
      page_range: [1, 1],
    });
  }

  return results;
}
