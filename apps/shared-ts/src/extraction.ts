import { z } from "zod";

export const ExtractionResultSchema = z.object({
  raw_text: z.string(),
  source_type: z.enum(["pdf", "image", "audio", "text"]),
  metadata: z.record(z.unknown()).default({}),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
