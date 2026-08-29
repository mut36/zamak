// ============================================
// Centralized configuration constants
// ============================================

import {
  resolveSubtitleShape,
  TARGET_LANGS,
  type ContentProfileKey,
} from './languages';

/**
 * Build version, shown in the footer. Kept here rather than in page.tsx so the
 * one hardcoded copy sits next to every other constant — a test pins it to
 * package.json.
 */
export const APP_VERSION = '1.9.3';

/**
 * How long a finished translation stays downloadable. The beta ships without
 * automatic cleanup, so this is what the UI promises and what the history
 * screen enforces by disabling the button — not what a cron job deletes.
 */
export const RESULT_RETENTION_DAYS = 30;

/**
 * 글로사리·존대관계 프리패스(§2-9)의 **비상 차단기** — 2026-08-21부터 꺼져 있다.
 *
 * 끈 이유: 표 자체가 아니라 표에 붙은 **권한**이 품질을 깎았다.
 * `glossary_directive.txt`가 "표기·말투는 위 규칙보다 이 표가 우선"이라고
 * 선언했고, 그 문장이 시스템 프롬프트의 **마지막 줄**로 렌더됐다. 모델은
 * `<translation_philosophy>`(감정·리듬·의역)를 한 단계 밑으로 내리고 표 맞추기를
 * 최우선 과제로 삼았다 — 정확한데 밋밋한 자막이 나왔다. 말투 표는 한술 더 떠
 * "대사만 보고 달리 판단하지 마"로 장면별 말투 변주까지 금지했다.
 *
 * 대체재는 `DIRECTOR_NOTE_ENABLED` — 같은 프리패스가 표 대신 짧은 연출 메모를
 * 써서 `movieInfo.notes`에 넣는다. 메모는 `<user_notes>`로 들어가므로 신뢰 경계
 * **안쪽의 데이터**다. 규칙을 이길 권한이 애초에 없다는 것이 요점이다.
 *
 * 코드는 통째로 남겨둔다(추출·편집 UI·프롬프트 전부). 이 값만 true로 되돌리면
 * 그대로 되살아난다.
 *
 * 아래는 켜져 있던 시절의 설명이다:
 *
 * 이 값이 켜져 있을 때 글로사리가 도는지는 모델이 정한다 — 프로면 항상 돌고
 * 라이트면 안 돈다(`app/lib/glossaryGate.ts`). 사용자가 켜고 끄는 토글은 없다:
 * `COPY.settings.proDesc`가 이미 "인물명 일관성"을 프로의 약속으로 팔고 있고,
 * 프로 손익분기(3,299원/편, `cost-per-block.md`)에 글로사리 원가가 이미 들어가
 * 있다 — 말과 값이 둘 다 "프로에 포함"을 가리킨다.
 *
 * 여기 남은 이유는 하나뿐이다: 추출 프로바이더(기본 OpenAI)가 죽었을 때
 * 재배포 없이 경로 전체를 끄는 것. 옛 이름은 `GLOSSARY_UI_ENABLED`였는데,
 * 끌 UI가 없어진 지금은 이름의 "UI"가 거짓말이다.
 *
 * Typed `boolean` (not inferred) so flipping it needs no other edit.
 */
export const GLOSSARY_ENABLED: boolean = false;

/**
 * 연출 메모 프리패스의 차단기. 글로사리를 대체한 경로다(2026-08-21).
 *
 * 같은 프리패스, 같은 프로바이더·모델·발췌 로직을 쓰지만 산출물이 다르다:
 * 40항목짜리 표가 아니라 사람이 30초에 읽는 짧은 산문 메모 한 덩이다. 그 메모는
 * `movieInfo.notes`에 들어가 화면에 뜨고, 사용자가 고친 그대로
 * `<user_notes>`로 프롬프트에 실린다.
 *
 * 표를 메모로 바꾼 것이 왜 품질 조치인가 — `GLOSSARY_ENABLED`의 주석 참조.
 * 요약하면 메모는 **규칙을 이길 권한이 없는 자리**에 놓인다.
 */
export const DIRECTOR_NOTE_ENABLED: boolean = true;

/**
 * Version of the notice the user agrees to before their first translation.
 * Bump this when the wording changes materially and everyone is asked again —
 * an agreement to old wording is not an agreement to new wording.
 *
 * 2026-08-02: the gate now covers the terms and the privacy policy as well as
 * the copyright notice (COPY.copyright), so every account that agreed to the
 * 07-29 wording is asked once more. That re-ask is the point, not a side
 * effect: it is what turns the redesign's dropped always-on notices into a
 * recorded, versioned consent.
 */
export const COPYRIGHT_NOTICE_VERSION = '2026-08-02';

/**
 * Funnel steps worth their own beta_events row (0009_beta_metrics.sql) —
 * only what translation_jobs cannot already answer. Anything derivable from
 * a finished job (format, model, block count) is deliberately not here; a
 * second, weaker copy of a fact we already have is how counts start
 * disagreeing with each other.
 */
export const BETA_EVENTS = [
  /** Upload rejected before it ever became a job — detail: { reason, format }. */
  'upload_rejected',
  /** "번역 시작" pressed on the settings screen — detail: { contentType, model, glossaryEnabled, targetLang }. */
  'settings_confirmed',
  /** A download button clicked on the done screen — detail: { extension }. */
  'download_clicked',
  /** The credit-exhausted screen was shown — detail: { kind }. */
  'credits_exhausted_shown',
] as const;

export type BetaEvent = (typeof BETA_EVENTS)[number];

/**
 * SRT chunking & concurrency — the two knobs for parallel translation, split
 * per tier. Set a very large chunk size to force a single request (no
 * chunking). All four overridable via env for quick tuning.
 */
function readPositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[config] Invalid env value "${raw}", using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/**
 * Translation tier. `server` = our server key, no user-visible rate ceiling —
 * everyone runs here today. `free` keeps the smaller knobs that Gemini's
 * free-tier rate limits require; it is unused until the Phase 3 login gate
 * introduces a signed-in-but-uncredited tier.
 */
export type Tier = 'free' | 'server';

/**
 * Free tier — CURRENTLY UNUSED. resolveTier() always returns 'server' now that
 * BYOK is gone, so nothing reaches these. Kept because the values are still
 * correct for a Gemini free-tier key, and a signed-in-but-uncredited tier would
 * want them back (docs/tuning/chunk-size-model.md §6).
 *
 * 150 is the wall-clock optimum under free-tier limits: free RPM caps
 * concurrency at roughly D/4, cancelling the head start smaller chunks would
 * otherwise get. 6 keeps ~15% headroom under the 15 RPM ceiling (7 would sit
 * exactly on it) — Gemini sends no Retry-After and we never retry, so a 429
 * costs untranslated subtitles.
 */
export const FREE_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FREE_CHUNK_SIZE,
  150,
);
export const FREE_CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FREE_CONCURRENCY,
  6,
);

/**
 * Server key knobs — what every request uses today.
 *
 * B=100 IS AN EMPIRICAL SAFETY LIMIT, not a derived optimum — arithmetic
 * cannot pick B at all (docs/tuning/chunk-size-model.md §5: cost varies only
 * 6.5% across the whole usable range, wall clock is not a constraint, and
 * expected blast radius from a whole-chunk API failure is B-invariant).
 *
 * What arithmetic missed is a failure mode observed directly, not modelled:
 * at B=2000 the model started renumbering mid-chunk — splitting one subtitle
 * into two and shifting every following sequence number by one. Because
 * reassembleTranslatedChunk() (srt.ts) only checks that a number is expected,
 * unused, and increasing, a renumbered block passes all three checks and the
 * translation lands on the wrong timecode for the rest of the chunk — silent,
 * not caught by the matched/unmatched counters. Observed to start past ~600
 * lines in one chunk; B=500 avoided it in early testing. B=100 sits further
 * under that ceiling with a smaller blast radius pending either a recurrence
 * or the detection/repair logic sketched in docs/decisions.md §2-3.
 *
 * B=100 is also where a second, separate failure mode (a marker corrupted by
 * a stray token bleeding in from elsewhere in the same chunk — the model's
 * generation, not a parsing bug) stopped reproducing in harness runs at
 * THINKING_LEVEL=LOW. Single-run evidence, not a derived threshold; see
 * docs/decisions.md §2-3-3.
 *
 * The output cap (B ≤ 3,276) and 300s route timeout (B ≤ 4,097) are the only
 * hard walls; constants.test.ts asserts those two and nothing else, so any
 * B up to those walls here is a deliberate choice, not a constraint violation.
 *
 * K=16 was sized for B=2000 (⌈2000/2000⌉=1 chunk, K unused) and comfortably
 * covered B=200 in one wave (⌈2000/200⌉=10 ≪ 16). At B=100 a credit-cap-sized
 * file needs ⌈2000/100⌉=20 chunks, which is now *more* than K — two waves, not
 * one (a 1,874-block film crosses this: 19 chunks > 16). The
 * one-wave rule was already abandoned as a K-derivation basis (2026-07-22,
 * below), so this isn't a regression against any live constraint — just worth
 * knowing before assuming "K is always oversized" from the B=200-era comment.
 * Raise K toward ⌈N_max/B⌉ if 1-wave latency on the largest files matters.
 *
 * History, so nobody re-derives a phantom: K=14 arrived in the initial commit
 * with no derivation, B=125 was then fitted to it via ⌈1500/14⌉, and the 1,500
 * cap it referenced is gone. The one-wave rule that briefly re-justified K was
 * dropped 2026-07-22, then B was pushed to 2000 (no chunking) the same day,
 * reverted to 500 after the renumbering bug above, then tuned through 400/300
 * to 200, then (undocumented at the time) to 150, then to 100 (2026-07-25,
 * marker-corruption harness runs). Override via env to experiment (the
 * harness reads these).
 */
export const SERVER_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_SIZE,
  100,
);
export const SERVER_CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CONCURRENCY,
  16,
);

/**
 * Pro-only chunk size (docs/decisions.md §2-15). SERVER_CHUNK_SIZE=100 above
 * was tuned down for flash to shrink the renumbering-drift/marker-corruption
 * blast radius — a safety ceiling, not a cost lever for that model. Pro's B
 * moves for a different reason: at PRO_THINKING_LEVEL=HIGH, thinking tokens
 * per chunk fall sharply as B grows (measured ~113/block at B≈120 down to
 * ~40/block at B=250-500 on a 461-block sample) because per-chunk "who are
 * these characters, what's the register" orientation cost amortizes over more
 * blocks. 250 was the harness winner: same thinking/cost as B=500 within 2%,
 * but ~half the wall-clock chunk time and 5 chunks per credit's worth of
 * blocks (BLOCKS_PER_CREDIT/250 = 1200/250) still fits one wave under
 * SERVER_CONCURRENCY=16 — with far more headroom than the 8 chunks the old
 * 2,000-block credit cap implied.
 *
 * Measured at feature-length scale 2026-07-31 (decisions.md §2-16): a
 * 1,124-block film at B=250/HIGH ran its slowest chunk in 141.5s against the
 * 300s per-chunk timeout, with thinking holding at 44 tok/block (the 461-block
 * drama gave 40). File length does not move this — chunkSrtBlocksAtGaps caps a
 * chunk at targetSize + 20% = 300 blocks, so longer files add chunks, not
 * bigger ones.
 */
export const PRO_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_PRO_CHUNK_SIZE,
  250,
);

/** Resolve chunk size for a translation model — Pro and flash tune B for
 *  unrelated reasons (see PRO_CHUNK_SIZE above), so they don't share a knob. */
export function chunkSizeForModel(model: string): number {
  return model === PRO_MODEL ? PRO_CHUNK_SIZE : SERVER_CHUNK_SIZE;
}

export interface TierLimits {
  /** Subtitle blocks per translation request. */
  chunkSize: number;
  /** Max concurrent chunk translations. */
  concurrency: number;
}

export function getTierLimits(tier: Tier): TierLimits {
  return tier === 'server'
    ? { chunkSize: SERVER_CHUNK_SIZE, concurrency: SERVER_CONCURRENCY }
    : { chunkSize: FREE_CHUNK_SIZE, concurrency: FREE_CONCURRENCY };
}

/**
 * The single place that decides a request's tier. Every call now runs on the
 * server key, so this is unconditionally 'server'. Phase 3 swaps the body for a
 * session/credit lookup — nothing else needs to change.
 *
 * The 'free' tier's smaller knobs are kept because they are what Gemini's
 * free-tier rate limits require, and a signed-in-but-uncredited tier will want
 * them again.
 */
export function resolveTier(): Tier {
  return 'server';
}

/**
 * Blocks one credit covers — a **divisor, not a ceiling**.
 *
 * This used to be MAX_BLOCKS_PER_CREDIT (2,000): one credit bought "one
 * title", and anything longer was refused with a 413. That made a credit's
 * cost swing 4.6x for the same price and put pro's margin at 6% on a
 * feature-length file (decisions.md §1-17). Since 2026-08-21 a longer file
 * spends more credits instead of being refused — `creditsForBlocks` rounds up
 * — so this is the size of one credit's slice, and there is no upper bound on
 * a translatable file at all.
 *
 * Why 1,200 rather than 2,000:
 *
 *  - Margin. Cost is linear in blocks (docs/tuning/cost-per-block.md: lite
 *    0.39, pro 1.45 KRW/block including glossary). At 1,200 per credit and the
 *    prices in app/config/pricing.ts, margin never falls below 40% at any file
 *    length — the worst case is a file that lands exactly on a multiple of
 *    1,200. Raising this number lowers that floor proportionally.
 *  - One wave. SERVER_CONCURRENCY=16 x SERVER_CHUNK_SIZE=100 = 1,600 blocks
 *    per wave, so at 1,200 a one-credit file is *always* a single wave
 *    (12 chunks <= 16). At 2,000 the 1,601-2,000 band was a one-credit file
 *    that silently took two waves, which is why the landing page's "15 seconds"
 *    needed a hedge ("드라마 한 편") pinned by simpleCopy.test.ts. A two-credit
 *    file takes two waves, but the user already knows it is double-length.
 *
 * Lite and pro share this number on purpose. Two different limits would make
 * the rule take two sentences to explain; the cost difference between the
 * tiers is absorbed by *price*, not by a different slice size.
 */
export const BLOCKS_PER_CREDIT = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_BLOCKS_PER_CREDIT,
  1200,
);

/**
 * Credits a file of `blockCount` blocks spends. Rounds up: 1,874 blocks is
 * 2 credits.
 *
 * The client (upload screen), the server route and `begin_translation_job` in
 * Postgres all have to agree on this number or the screen promises one figure
 * and the ledger charges another. This is the single definition for the two
 * JavaScript callers; the SQL function repeats the arithmetic as a literal
 * (supabase/migrations/0015_credit_by_lines.sql) because it cannot import, and
 * that copy — not this one — is the billing authority.
 */
export function creditsForBlocks(blockCount: number): number {
  return Math.ceil(blockCount / BLOCKS_PER_CREDIT);
}

/**
 * Blocks `/api/polish` accepts in one file.
 *
 * Deliberately its own number rather than BLOCKS_PER_CREDIT, which it used to
 * borrow back when that constant was a 2,000-block ceiling. Polish spends no
 * credits, so its only cost defence is the rate limit; letting it follow the
 * credit divisor down to 1,200 would have shrunk what the free page accepts as
 * a side effect of a pricing decision.
 *
 * Raised 2,000 → 3,000 (2026-08-26): 2,000 turned away long films and multi-hour
 * talks that the page handles fine. The ceiling is a cost defence, and the cost
 * it defends is per-chunk model calls — but this page calls the model only for
 * the lines that actually overflow (and, with the merge toggle on, for the
 * candidate pairs), so a bigger file is not proportionally more expensive. The
 * rate limit (RATE_LIMITS.polish) is still the real wall.
 */
export const POLISH_MAX_BLOCKS = readPositiveIntEnv(
  process.env.POLISH_MAX_BLOCKS,
  3000,
);

/**
 * 무제한 테스터(`public.unlimited_testers`, 0013)의 잔액 칩에 띄울 숫자.
 *
 * 그 계정은 차감이 DB에서 면제되므로 실제 잔액은 0에 머문다. 그대로 두면 UI가
 * "0장 남음"을 빨갛게 띄우고(TranslateSettingsStep), 번역은 되는데 화면은
 * 소진됐다고 말하는 상태가 된다. 표시용 값일 뿐 어떤 한도도 아니다 — 이 숫자를
 * 다 쓴다고 무언가 막히지 않는다.
 */
/**
 * `/api/polish`가 한 번에 모델에 보내는 블록 수.
 *
 * 번역(`SERVER_CHUNK_SIZE`)보다 작게 잡는다: 입력이 이미 한국어라 블록당 토큰이
 * 무겁고 출력도 한국어다. 대부분의 파일은 상한 초과가 3.8%뿐이라 청크 하나로
 * 끝나지만, 줄바꿈이 아예 없는 자막(자동 생성물에 흔하다)은 전 블록이 초과라
 * 여기서 갈린다.
 */
export const POLISH_CHUNK_SIZE = 150;

export const UNLIMITED_CREDIT_DISPLAY = 999;

/**
 * 쿠폰 코드 입력 상한. 코드는 사람이 외워서 치는 짧은 말이고, 이 길이를
 * 넘는 입력은 코드가 아니라 쓰레기다 — 정규화 전에 잘라 버린다.
 */
export const COUPON_CODE_MAX_LENGTH = 64;

/**
 * How long a paid-for job stays usable, in minutes.
 *
 * A job is opened once per file and every chunk request is checked against it.
 * The window only has to outlast one translation (tens of seconds) — it exists
 * so a job id cannot be replayed indefinitely as a free pass.
 */
export const JOB_VALIDITY_MINUTES = readPositiveIntEnv(
  process.env.JOB_VALIDITY_MINUTES,
  60,
);

/**
 * Per-user call ceilings for the routes that spend the server key **without
 * charging a credit** — enrich (TMDB + grounded search), analyze, summarize,
 * glossary. Credits gate translation; these four were gated by nothing but a
 * login, so one signed-in script could run them forever on our bill.
 *
 * What this is NOT for: total load. `docs/tuning/gemini-limits.md` §7-2 puts
 * concurrent capacity at 38-68 users against Gemini's own quota, well past a
 * 30-person beta. The risk being closed here is a *single* user looping, which
 * a total-capacity number says nothing about.
 *
 * The numbers are deliberately loose. One file's normal path is: analyze ×1,
 * enrich ×1-3 (search, then maybe a candidate pick or two), summarize ×1,
 * glossary ×1. A user translating back-to-back files never comes near 20/min,
 * so a real user should never see a 429 — that is the design target, because a
 * limit that fires on legitimate use gets raised until it means nothing.
 *
 * Glossary is lower because it is the expensive one (a full-file scan through
 * an OpenAI call, `extractCastSheet.ts`) and is opt-in at one call per file.
 *
 * Buckets are shared per key: the three cheap routes are one bucket, so 20/min
 * is the combined budget rather than 20 each. Keys must match the `p_bucket`
 * values in `supabase/migrations/0011_rate_limits_and_errors.sql`.
 */
export const RATE_LIMITS = {
  /** /api/analyze, /api/summarize, /api/enrich — flash-lite and TMDB. */
  aux: { limit: 20, windowSeconds: 60 },
  /** /api/glossary — full-file scan, opt-in, once per file. */
  glossary: { limit: 5, windowSeconds: 60 },
  /**
   * /api/polish — 규칙 적용. 크레딧을 안 쓰므로 **이 한도가 유일한 천장이다**
   * (/api/translate는 job의 크레딧 검사가 그 역할을 한다).
   *
   * 창이 하루인 것은 단위가 "호출"이 아니라 "파일"이기 때문이다 — 클라이언트가
   * 초과 줄을 **한 요청에** 담아 보내고 청크 분할은 서버가 안에서 한다. 청크마다
   * 요청을 쪼갰다면 하루 5회가 파일 한두 개로 줄었을 것이다.
   */
  polish: { limit: 5, windowSeconds: 86_400 },
  // ⚠️ 무제한 테스터(`unlimited_testers`)는 이 표의 어느 값에도 안 걸린다 —
  //    면제는 `consume_rate_limit`(마이그레이션 0018) 안에서 일어나므로 여기
  //    숫자를 아무리 바꿔도 그 계정에는 아무 일도 안 생긴다.
  /**
   * /api/coupons/redeem — 비밀코드 교환. 지인 배포용이라 코드가 짧고 사람이
   * 기억할 수 있는 말이므로, 무차별 대입이 실제로 가능한 유일한 입구다.
   * 정상 사용자는 평생 한두 번 부르는 경로라 한도를 아주 낮게 잡는다.
   */
  coupon: { limit: 5, windowSeconds: 3_600 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Auxiliary model for lightweight tasks (title/year analysis, web-search
 * enrichment, non-movie summarization). Kept as a single constant so a
 * model bump is a one-line change; overridable via env.
 */
export const AUX_MODEL = process.env.AUX_MODEL || 'gemini-3.5-flash-lite';

/**
 * Translation models offered in the UI (빠른번역 / 고급번역). Kept as an
 * array so request validation still works and adding a model later is one line.
 */
export const FLASH_MODEL = 'gemini-3.6-flash' as const;
export const PRO_MODEL = 'gemini-3.1-pro-preview' as const;

export const ALLOWED_MODELS = [FLASH_MODEL, PRO_MODEL] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = FLASH_MODEL;

/**
 * Default model for harness / env override. The UI picks explicitly via
 * 고급번역 (PRO_MODEL) / 빠른번역 (FLASH_MODEL).
 */
export const TRANSLATION_MODEL =
  process.env.NEXT_PUBLIC_TRANSLATION_MODEL || DEFAULT_MODEL;

const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

function readThinkingLevelEnv(
  envName: string,
  fallback: ThinkingLevelName,
): ThinkingLevelName {
  const raw = process.env[envName]?.trim().toUpperCase();
  if (!raw) return fallback;
  if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as ThinkingLevelName;
  }
  console.warn(`[config] Invalid ${envName} "${raw}", using ${fallback}`);
  return fallback;
}

/**
 * Thinking effort for the flash (빠른번역) path.
 *
 * Gemini bills thinking tokens at the *output* rate — 6× the input rate — and
 * spends them once per request, so this looked like our largest cost lever.
 * Measurement said otherwise: on real 200-block chunks both MINIMAL and LOW
 * report thoughts=0 (docs/tuning/gemini-limits.md §6). LOW therefore costs what
 * MINIMAL costs while deliberating more, which is why it is the default.
 *
 * The model does not allow disabling thinking outright, and thinkingBudget: 0
 * is silently ignored — thinkingLevel is the knob it honours.
 *
 * Env `THINKING_LEVEL` — restart the dev server after changing (read once at
 * module load). Pro uses `PRO_THINKING_LEVEL` instead.
 */
export const THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'THINKING_LEVEL',
  'LOW',
);

/**
 * Thinking effort for the Pro (고급번역) path.
 * Env `PRO_THINKING_LEVEL` — default HIGH; same restart caveat as flash.
 *
 * Unlike flash, LOW is NOT free here — confirmed 2026-07-26
 * (docs/decisions.md §2-4-1, docs/tuning/gemini-limits.md §6-2). Two things
 * broke the flash-derived assumption:
 *
 * 1. The API rejects `ThinkingLevel.MINIMAL` for gemini-3.1-pro-preview
 *    outright — LOW is the actual floor for this model, not an equal
 *    alternative to MINIMAL like it is for flash.
 * 2. Even LOW reports non-zero `thoughts` most of the time: a 967-block file
 *    (10 chunks) logged thoughts of 0, 1930, 3346, 4107, 4381, 4747, 5245, 0,
 *    0, 4089 — averaging ~2,785/chunk and accounting for ~58% of that file's
 *    translation cost. This is why a theoretical ~320원 estimate came in at
 *    an actual 971원.
 *
 * MEDIUM was the default until 2026-07-28, but a same-file LOW/MEDIUM grid
 * (docs/decisions.md §2-15) found MEDIUM never beat LOW — same or worse
 * alignment-failure rate on every cell, up to 2.3x the cost — so it bought
 * nothing over LOW. Separately, the founder's own quality bar for 고급번역
 * came from an early HIGH-only prototype; a blind full-episode review this
 * session confirmed LOW/MEDIUM read as equivalent to each other and clearly
 * worse than HIGH. HIGH's cost problem (1,405원 on a drama episode at the
 * prototype's B≈120) turned out to be a small-B problem, not a HIGH problem —
 * see PRO_CHUNK_SIZE below, which is what makes HIGH affordable (~575원, same
 * file, B=250).
 *
 * Feature-length behaviour is measured too (2026-07-31, decisions.md §2-16):
 * slowest chunk 141.5s against the 300s timeout, thinking steady at 44
 * tok/block. HIGH at B=250 has ~2x headroom on any file length.
 */
export const PRO_THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'PRO_THINKING_LEVEL',
  'HIGH',
);

/** Resolve thinking level for a translation model. */
export function thinkingLevelForModel(model: string): ThinkingLevelName {
  return model === PRO_MODEL ? PRO_THINKING_LEVEL : THINKING_LEVEL;
}

/**
 * Cast-sheet extraction (glossary + speech-relation prepass, opt-in toggle in
 * InfoStep). Default provider is OpenAI GPT-5.6-luna (`decisions.md` §2-14) —
 * relation-reasoning quality beat Gemini flash-lite on clear dialogue evidence,
 * not merely cost. One call per file; still material — ~₩130 was measured on a
 * 1,100-block file under the previous Gemini flash + MEDIUM setup.
 *
 * `GLOSSARY_PROVIDER=openai|gemini` (default openai). Rollback without a
 * redeploy: set provider to gemini and `GLOSSARY_MODEL` to a Gemini model id.
 * `GLOSSARY_THINKING_LEVEL` applies only to the Gemini path (OpenAI ignores it).
 */
export type GlossaryProvider = 'openai' | 'gemini';
export const GLOSSARY_PROVIDER: GlossaryProvider =
  process.env.GLOSSARY_PROVIDER === 'gemini' ? 'gemini' : 'openai';
/** Read once at module load — set GLOSSARY_PROVIDER / GLOSSARY_MODEL before
 *  importing this module if a harness needs a non-default combo (see
 *  scripts/glossary-ab.mts). */
export const GLOSSARY_MODEL =
  process.env.GLOSSARY_MODEL ||
  (GLOSSARY_PROVIDER === 'gemini' ? FLASH_MODEL : 'gpt-5.6-luna');
/** Gemini path only — unused when `GLOSSARY_PROVIDER=openai`. */
export const GLOSSARY_THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'GLOSSARY_THINKING_LEVEL',
  'MEDIUM',
);

/**
 * Subtitle blocks sampled for cast-sheet extraction. Files under this size
 * are sent whole; larger files are evenly excerpted (names/relations are
 * scattered through a whole file, unlike summarize's leading-sample approach)
 * — see extractCastSheet.ts.
 *
 * **옛 값 3,000은 유도 근거가 없었다**(도입 커밋 779ad6c). 2,000블록 크레딧
 * 상한 위에 있어서 `excerptBlocks()`가 한 번도 안 돌던 죽은 값이었는데,
 * §6-22로 길이 상한이 사라지면서 실제로 도는 경로가 됐다 — 근거 없는 임계값
 * 위에서. 2026-08-21에 아래와 같이 유도해 8,500으로 올렸다.
 *
 * **1) 일반 비용은 상한의 근거가 못 된다.** 추출 입력은 461블록에 7,519토큰
 * ≈ **16토큰/블록**(`token-economics.md` §8). 발췌로 아끼는 입력 비용은 같은
 * 블록의 Pro 번역 원가에 견주면 2% 안쪽이고, **이 비율은 파일 길이와 무관하게
 * 일정하다** — 길수록 둘 다 같은 비율로 커지기 때문이다. 그런데 발췌가 잃는
 * 것은 "파일 전체 일관성"이라는 이 기능의 존재 이유다. 그러니 일반 비용만
 * 보면 상한은 없는 편이 낫다.
 *
 * **2) 진짜 제약은 가격 절벽이다.** gpt-5.6-luna는 컨텍스트가 1,050,000이라
 * 창 자체는 남아돌지만, **입력 272K를 넘는 순간 그 요청 전체가 입력 2배·출력
 * 1.5배로 청구된다**(OpenAI 모델 문서). 이건 비율이 아니라 계단이라 절대
 * 밟으면 안 된다.
 *
 * **3) 그래서 272K의 절반을 예산으로 잡는다**: 136,000 ÷ 16 = **8,500블록**.
 * 절반만 쓰는 이유는 시스템 프롬프트·`<content_metadata>`·`<tmdb_cast>`가 같은
 * 예산을 나눠 쓰고, 블록당 16토큰이 자막 종류에 따라 오르내리기 때문이다.
 * 8,500블록이면 현실의 어떤 자막 파일도 발췌되지 않는다(장편이 2~3천 블록).
 * 발췌는 이제 상시 경로가 아니라 비정상 입력용 안전망이다.
 *
 * 발췌가 실제로 발동하면 `extractCastSheet`가 로그를 남긴다 — 예전에는 완전히
 * 조용해서 육안 검수로도 발췌 여부를 알 수 없었다.
 */
export const GLOSSARY_MAX_BLOCKS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_BLOCKS,
  8500,
);

/** Hard caps on the extracted sheet — keeps the per-chunk prompt tax bounded. */
export const GLOSSARY_MAX_TERMS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_TERMS,
  40,
);
export const GLOSSARY_MAX_RELATIONS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_RELATIONS,
  16,
);
/**
 * 렌더된 태그 길이 캡, 문자 수. **태그마다 따로** 둔다.
 *
 * 예전에는 둘의 합계 캡(`GLOSSARY_MAX_CHARS` = 1200) 하나였고, 넘치면
 * relations를 먼저 전부 버렸다. 그런데 `GLOSSARY_MAX_TERMS`가 40이고 한 줄이
 * 30자 안팎이라 terms만으로 합계 캡을 다 쓴다 — 항목이 많은 작품에서 관계표가
 * 통째로, 그리고 **조용히** 사라졌다. 조용한 실패가 문제의 본질이라 캡 자체를
 * 갈랐다(2026-08-21). 이제 한쪽이 넘쳐도 다른 쪽 예산을 잡아먹지 않는다.
 */
export const GLOSSARY_MAX_TERM_CHARS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_TERM_CHARS,
  1200,
);
export const GLOSSARY_MAX_RELATION_CHARS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_RELATION_CHARS,
  600,
);

/**
 * 연출 메모 길이 캡, 문자 수. **짧은 것이 이 기능의 핵심이다.**
 *
 * 글로사리가 실패한 방식이 정확히 "길어져서 규칙이 된 것"이었다: 표기 40항목 +
 * 관계 16항목이면 모델의 주의가 그 표를 만족시키는 데 쏠린다. 메모가 같은
 * 길이로 자라면 이름만 바뀐 같은 실패다.
 *
 * 600자면 "가족 간 대화는 반말", "내레이션은 ~다체", 오용 위험 용어 서너 개가
 * 들어가고 그 이상은 안 들어간다 — 의도한 천장이다. 추출 프롬프트도 같은 수를
 * 보고 쓰고(`{{maxChars}}`), 서버가 넘치면 잘라낸다. 두 겹인 이유는 모델이
 * 분량 지시를 자주 흘리기 때문이다.
 */
export const DIRECTOR_NOTE_MAX_CHARS = readPositiveIntEnv(
  process.env.DIRECTOR_NOTE_MAX_CHARS,
  600,
);

/**
 * How long the translate button waits for a still-running extraction before
 * giving up and proceeding with an empty sheet. Never blocks translation —
 * only delays the first chunk request.
 */
export const GLOSSARY_WAIT_MS = readPositiveIntEnv(
  process.env.GLOSSARY_WAIT_MS,
  15000,
);

/**
 * TMDB (The Movie Database) — movie/drama metadata + posters. Server-only key
 * (never exposed to the client; the /api/tmdb route proxies all calls).
 * Get the value from TMDB → Settings → API → "API Key (v3 auth)".
 */
export const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
export const TMDB_API_BASE = 'https://api.themoviedb.org/3';
/** Poster CDN base — append a poster_path like `/abc.jpg`. w500 ≈ card size. */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
/** Preferred metadata language; overview falls back to en-US when empty. */
export const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'ko-KR';

/**
 * How many TMDB search candidates to surface for user disambiguation when a
 * title/year matches more than one work (remakes, common titles). A single
 * match always skips the picker regardless of this cap.
 */
export const MAX_ENRICH_CANDIDATES = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MAX_ENRICH_CANDIDATES,
  5,
);

/**
 * Number of leading subtitle lines sampled to summarize non-movie content.
 * Developer-tweakable via env for quick tuning.
 */
export const SUMMARY_SAMPLE_LINES = (() => {
  const raw = process.env.SUMMARY_SAMPLE_LINES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
})();

export const TRANSLATION_ESTIMATE_MS: Record<AllowedModel, number> = {
  [FLASH_MODEL]: 20_000,
  [PRO_MODEL]: 165_000,
};

/**
 * 모델별 벽시계 추정 — **블록 수를 모를 때의 폴백 전용**이다.
 *
 * 블록 수를 알면 `app/lib/progressEstimate.ts`의
 * `estimateRunMsFromBlocks()` / `estimateRunMsFromChunks()`를 쓴다. 그쪽이
 * `docs/tuning/chunk-size-model.md` §1의 실측 파라미터로 파일 크기를 반영한다.
 *
 * pro 165초는 2026-07-31 실측(1,124블록 B=250 HIGH, 총 161.4초 —
 * `docs/tuning/experiment-log.md`)을 올림한 값이다. 이전 180초는
 * `decisions.md` §2-7이 "미측정 자리표시자"라고 명시해 둔 값이었고, 그 주의사항은
 * 이 측정으로 해소됐다. flash 20초는 실측 최악값 17.8초를 덮는 값 그대로다.
 */
export function estimateTranslationMs(model: string): number {
  return model === PRO_MODEL
    ? TRANSLATION_ESTIMATE_MS[PRO_MODEL]
    : TRANSLATION_ESTIMATE_MS[FLASH_MODEL];
}

/**
 * 타임코드 검증 단계의 **최소 노출 시간**.
 *
 * 검증 자체(`enforceTextRules` → `adjustSubtitleTiming` → `buildDownloads`)는
 * 수십 ms에 끝나서, 완료 화면으로 넘어가기 전에 한 프레임도 그려지지 않았다.
 * 사용자에게는 "타임코드 검증을 건너뛴 것"으로 보인다. 고정 대기가 아니라
 * **최소** 보장이다 — 다만 회수 스윕은 이 타이머가 시작되기 *전에* 이미
 * 끝나 있으므로(useTranslation.ts의 verifyStartedAt 참고), 스윕 시간이 이
 * 값을 깎지는 않는다. 실사용에선 매 런마다 걸리는 고정 ~2초로 보면 된다.
 */
export const MIN_VERIFY_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_VERIFY_MS,
  2_000,
);

/**
 * Reading-speed post-processing thresholds (characters per second). After a
 * file is translated and reassembled, adjustSubtitleTiming() (app/lib/srt.ts)
 * widens any block that reads faster than CPS_HARD_MAX, pulling it down toward
 * CPS_TARGET, borrowing only from the silent gaps its neighbours leave free so
 * nothing can overlap.
 *
 * The live values come from the target language × content profile
 * (languages.ts `shapes`, resolved by getReadingSpeed below) — Korean film is
 * 12 target / 14 ceiling, documentary 10 / 12, and so on. The two constants
 * here are the **global env override**: set either one and it applies to every
 * language and every profile at once, which is what an escape hatch is for.
 * Their defaults (12/10) are the pre-profile Korean band, kept so an
 * unconfigured deployment behaves the way it always did.
 *
 * Whatever the source, the pair means the same thing:
 *  - hard max: the ceiling — only blocks reading faster than this are touched.
 *  - target: where a fixed block should land. When a block can't reach it, it
 *    still gets as close as the free gaps allow.
 *  - There is no lower edge constant: we never extend past target, so nothing
 *    is ever pushed below it and no code has to know it.
 *
 * MIN_SUBTITLE_GAP_MS keeps a ~2-frame (24fps) silence between adjacent
 * subtitles so a widened line never visually touches the next.
 *
 * MIN_SUBTITLE_DURATION_MS (800ms) is a separate, independent floor: even a
 * block that reads comfortably slow (or has no text at all) gets widened up
 * to this minimum on-screen duration, using the same neighbour-borrowing pass.
 *
 * All env-tunable.
 */
export const CPS_HARD_MAX = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CPS_HARD_MAX,
  12,
);
export const CPS_TARGET = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CPS_TARGET,
  10,
);
export const MIN_SUBTITLE_GAP_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_GAP_MS,
  84,
);
export const MIN_SUBTITLE_DURATION_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_DURATION_MS,
  800,
);

/**
 * 짧은 주고받음 합치기(`app/lib/mergeDialogue.ts`)의 두 시간 게이트.
 *
 * MAX_GAP은 "같은 주고받음인가"를 가르는 선이다. 1초를 넘게 벌어지면 대답이
 * 아니라 다음 장면일 수 있다 — 청킹이 장면 경계로 보는 2초(`chunkSrtBlocksAtGaps`)
 * 보다 **좁게** 잡는다. 여기서는 놓치는 쪽이 잘못 합치는 쪽보다 낫다.
 *
 * MAX_SPAN은 합친 결과의 노출 길이다. 합치면 두 대사가 앞 블록의 시작부터 뒤
 * 블록의 끝까지 함께 떠 있으므로, 원본에서 각자 짧았어도 합계는 길어질 수 있다.
 * 5초는 방송 자막의 통상 상한(7초)보다 보수적으로 잡은 값이다 — 짧은 대사
 * 둘을 합치는 기능이 긴 자막을 만들면 안 된다.
 */
export const DIALOGUE_MERGE_MAX_GAP_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_DIALOGUE_MERGE_MAX_GAP_MS,
  1000,
);
export const DIALOGUE_MERGE_MAX_SPAN_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_DIALOGUE_MERGE_MAX_SPAN_MS,
  5000,
);

/**
 * 토막 난 자동자막 잇기(`app/lib/joinFragments.ts`)의 세 게이트.
 *
 * RUN_MAX_GAP은 **런을 끊는 선**이다. 자동자막의 토막은 발화 도중에 잘리므로
 * 사이가 거의 없고, 문장이 끝나면 숨을 쉬며 간격이 벌어진다. 0.4초는 대화
 * 합치기의 1초보다 훨씬 좁다 — 저건 "대답이 이어졌나"를 보고 이건 "한 호흡이
 * 계속되나"를 본다.
 *
 * RUN_MAX_BLOCKS는 한 번에 모델에게 보여줄 런의 길이 상한이다. 넘으면 거기서
 * 끊고 다음 블록부터 새 런을 시작한다 — 프롬프트 한 덩어리가 무한정 길어지는
 * 것을 막는 실무적 상한이지 의미상의 경계가 아니다.
 *
 * SUBTITLE_MAX_DURATION_MS는 합친 자막의 노출 상한(방송 자막 통상치 7초).
 * 글자 수 천장(`lineMaxChars` × 2줄)과 함께 **거부권으로만** 쓴다: 모델이 정한
 * 문장 묶음이 이걸 넘으면 그 묶음을 버리지, 상한에 맞춰 잘라 붙이지 않는다.
 * 경계를 정하는 것은 문장이고 상한은 천장이라는 것이 이 기능의 설계다.
 */
export const FRAGMENT_RUN_MAX_GAP_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FRAGMENT_RUN_MAX_GAP_MS,
  400,
);
export const FRAGMENT_RUN_MAX_BLOCKS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FRAGMENT_RUN_MAX_BLOCKS,
  8,
);
export const SUBTITLE_MAX_DURATION_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_SUBTITLE_MAX_DURATION_MS,
  7000,
);

/**
 * 규칙 적용(`/polish`) 화면에서 사용자가 **직접** 고를 수 있는 CPS 범위.
 *
 * 위 `shapes`(languages.ts)가 튜닝된 기본값이라면 이쪽은 그 밖으로 나가고 싶은
 * 사람을 위한 난간이다. 4 아래는 한 줄이 몇 초씩 떠 있어 다음 대사를 밀어내고,
 * 20 위는 한국어로는 사실상 못 읽는다(Netflix 한국어 성인 상한 12,
 * `docs/standards/netflix-korean-subtitles.md`). 고른 두 값은 언제나
 * 최소 < 최대여야 한다 — 같거나 뒤집히면 "상한을 넘은 것을 상한 위로
 * 늦춘다"는 모순이 된다.
 */
export const CPS_USER_RANGE = { min: 4, max: 20 } as const;

/**
 * Reading speed depends on two things: the script (a Latin line carries far
 * less meaning per character than a Hangul or Han one) and what is being
 * watched (banter is skimmed, narration is read). Both live in
 * `TargetLang.shapes`, and this resolves the pair. An explicitly set env var
 * still wins — it stays the global escape hatch, applying to every language
 * and profile at once.
 */
export function getReadingSpeed(
  targetLang: string,
  contentProfile?: ContentProfileKey | string,
): {
  cpsHardMax: number;
  cpsTarget: number;
} {
  const shape = resolveSubtitleShape(targetLang, contentProfile);
  return {
    cpsHardMax: process.env.NEXT_PUBLIC_CPS_HARD_MAX
      ? CPS_HARD_MAX
      : shape.hardMax,
    cpsTarget: process.env.NEXT_PUBLIC_CPS_TARGET ? CPS_TARGET : shape.target,
  };
}

/** Timing estimates (milliseconds) */
export const TIMING = {
  /** SSE heartbeat interval to prevent gateway timeout */
  HEARTBEAT_MS: 5_000,
} as const;

/**
 * Per-chunk request timeout on the client (ms). Matches `/api/translate`'s
 * `maxDuration = 300` — without this, a connection that stalls (rather than
 * erroring outright) hangs forever, since fetch has no default timeout.
 */
export const CHUNK_TIMEOUT_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_TIMEOUT_MS,
  300_000,
);

/** API retry configuration */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1_000,
} as const;

/**
 * Recovery sweep: the pass that runs after the main one, re-collecting every
 * block still holding its original text and re-sending them repacked into
 * fresh chunks (see app/lib/client/recoverySweep.ts, docs/decisions.md §2-2).
 *
 * Both knobs exist to keep the 20-minute/₩5,000 incident structurally
 * impossible. Repacking already removes the incident's mechanism — scattered
 * leftovers cost one call per CHUNK, never one per block — and these cap what
 * is left: at most MAX_ROUNDS rounds, and at most BUDGET_RATIO × (main-pass
 * chunk count) calls across all of them. With the retry budget's +20% that
 * puts the worst case for a file at ~1.7× the main pass, fixed.
 *
 * A round that recovers nothing stops the sweep regardless of budget — the
 * blocks that keep failing (safety-filtered lines, say) fail the same way
 * every time, and paying to confirm that twice is waste.
 */
export const RECOVERY = {
  MAX_ROUNDS: 2,
  BUDGET_RATIO: 0.5,
  MIN_BUDGET: 2,
} as const;

/** Target-language code → output file suffix (before `.srt`). */
export const LANG_SUFFIX: Record<string, string> = {
  ...Object.fromEntries(TARGET_LANGS.map((lang) => [lang.code, lang.code])),
  // Legacy long-form values that older clients may still send.
  Korean: 'ko',
  English: 'en',
};

/**
 * Source-language codes that may appear immediately before the subtitle
 * extension in a filename (e.g. `movie.it.srt`, `movie.it.vtt`). When present,
 * `buildOutputFilename` replaces that token with the target language code
 * instead of appending (so `movie.it.vtt` → `movie.ko.srt`, not
 * `movie.it.ko.srt`). ISO 639-1 two-letter codes only — keeps `.hd` / `.tv`
 * from being treated as languages.
 */
export const SOURCE_LANG_CODES = [
  'en',
  'ko',
  'ja',
  'zh',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'nl',
  'sv',
  'no',
  'da',
  'fi',
  'pl',
  'cs',
  'tr',
  'ar',
  'hi',
  'th',
  'vi',
  'id',
  'el',
  'he',
  'ro',
  'hu',
  'bg',
  'hr',
  'sr',
] as const;

const SOURCE_LANG_CODE_SET = new Set<string>(SOURCE_LANG_CODES);

export function isSourceLangCode(token: string): boolean {
  return SOURCE_LANG_CODE_SET.has(token.toLowerCase());
}

/**
 * 피드백 리워드 이벤트(2026-08)의 인앱 지급 코드. `event_grants.event_code`와
 * `grant_event_credit` 호출(`/api/feedback`)이 이 문자열로 일치해야 한다 —
 * 오탈자는 곧 이중 지급이나 무지급 버그다. 카톡·이메일 쪽 코드
 * ('feedback_reward_kakao_email')는 코드에서 안 읽으므로(수동 지급이라
 * `supabase/comp-credit.sql`에만 리터럴로 있음) 여기 두지 않는다.
 */
export const FEEDBACK_EVENT_CODE_INAPP = 'feedback_reward_inapp';

/**
 * 오픈카톡 채널 URL. 채널이 아직 없어 빈 문자열이 기본값이다 — 이 값이
 * 비어 있으면 푸터·피드백 완료 화면 모두 카톡 관련 UI를 렌더링하지 않는다.
 * 채널 생성 후 이 리터럴만 채우면 두 화면에 동시에 반영된다.
 */
export const KAKAO_OPEN_CHAT_URL = 'http://pf.kakao.com/_xlkXBX';
