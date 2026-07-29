import { RESULT_RETENTION_DAYS } from '../config/constants';

/** What was switched on for a run. Recorded so the history line can say
 *  "· 용어집" — the one option that changes both the price in time and the
 *  result, and the only one worth remembering per job. */
export interface JobOptions {
  glossary: boolean;
}

/** One past translation, as the history screen renders it. */
export interface HistoryItem {
  jobId: string;
  /** Original uploaded filename. The download is this with `.ko.srt`. */
  filename: string;
  model: string | null;
  totalBlocks: number;
  createdAt: string;
  options: JobOptions | null;
  /** Past the retention window we promised. The button is disabled, whether or
   *  not the bytes are still in the bucket. */
  expired: boolean;
  /** Short-lived signed URL, null when expired or never stored. */
  downloadUrl: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a result is past the retention we promised on screen.
 *
 * The beta ships without automatic cleanup, so this — not a cron job — is what
 * makes the 30-day promise true. An unparseable date counts as expired: better
 * to say the window closed than to offer a link that fails.
 */
export function isExpired(
  createdAt: string,
  now: Date,
  retentionDays: number = RESULT_RETENTION_DAYS,
): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > retentionDays * DAY_MS;
}
