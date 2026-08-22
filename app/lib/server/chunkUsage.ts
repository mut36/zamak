import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TokenUsage } from '../providers';

/** One measured model call. `ok: false` rows carry zero tokens and an error
 *  code — a failed call still cost latency and still happened, and dropping it
 *  would make the call count disagree with the retry logs. */
export interface ChunkUsageRow {
  /** null이면 job에 매이지 않은 호출 — 연출 메모처럼 크레딧 차감 전에 도는
   *  프리패스다. 붙일 job이 아직 존재하지 않는다 (마이그레이션 0017). */
  jobId: string | null;
  userId: string;
  chunkIndex: number;
  totalChunks: number;
  phase: 'main' | 'sweep' | 'note' | 'polish';
  blocks: number;
  model: string;
  thinkingLevel: string | null;
  usage: TokenUsage;
  latencyMs: number;
  ok: boolean;
  errorCode?: string | null;
}

/**
 * Records what one model call consumed.
 *
 * Never throws and never awaited by the response path: a measurement that can
 * fail a translation is worse than no measurement.
 */
export async function recordChunkUsage(
  supabase: SupabaseClient,
  row: ChunkUsageRow,
): Promise<void> {
  try {
    const { error } = await supabase.from('translation_chunk_usage').insert({
      job_id: row.jobId,
      user_id: row.userId,
      chunk_index: row.chunkIndex,
      total_chunks: row.totalChunks,
      phase: row.phase,
      blocks: row.blocks,
      model: row.model,
      thinking_level: row.thinkingLevel,
      prompt_tokens: row.usage.prompt,
      cached_tokens: row.usage.cached,
      thoughts_tokens: row.usage.thoughts,
      output_tokens: row.usage.output,
      latency_ms: row.latencyMs,
      ok: row.ok,
      error_code: row.errorCode ?? null,
    });
    if (error) {
      console.warn('[usage] chunk usage not recorded:', error.message);
    }
  } catch (err) {
    console.warn('[usage] chunk usage not recorded:', err);
  }
}
