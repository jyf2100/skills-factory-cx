import { z } from "zod";

export const ingestSearchSchema = z.object({
  query: z.string().min(2)
});

export const ingestImportSchema = z.object({
  source_url: z.string().url(),
  query: z.string().min(2).optional()
});

export const ingestJobClaimSchema = z.object({
  worker_id: z.string().min(1)
});

export const ingestJobCompleteSchema = z.object({
  worker_id: z.string().min(1),
  ingest_id: z.string().min(1)
});

export const ingestJobFailSchema = z.object({
  worker_id: z.string().min(1),
  error: z.string().min(1).max(2000)
});

export const reviewSchema = z.object({
  reviewer: z.string().min(1),
  note: z.string().max(500).optional().default("")
});

export const listSkillsQuerySchema = z.object({
  query: z.string().optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).optional(),
  source: z.string().optional()
});
