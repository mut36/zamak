import {
  formatTimingLine,
  parseBlockTiming,
  parseSrtBlocks,
  readBlockIndex,
  renumberBlocks,
  visibleLength,
} from './srt';
import {
  FRAGMENT_RUN_MAX_BLOCKS,
  FRAGMENT_RUN_MAX_GAP_MS,
  SUBTITLE_MAX_DURATION_MS,
} from '../config/constants';

/**
 * 토막 난 자동자막을 문장으로 잇기.
 *
 * 유튜브 자동자막처럼 기계가 만든 자막은 한 문장을 어절 단위로 흩어 놓는다 —
 * `그래서` / `내가` / `거기 갔어`. 읽는 사람은 한 문장을 세 번 읽어야 하고,
 * 번역에 넣으면 문장이 셋으로 쪼개진 채 번역된다.
 *
 * **짧은 대화 합치기(`mergeDialogue.ts`)와는 다른 기능이다.** 저쪽은 두 화자를
 * `- A` / `- B` 두 줄로 모으고, 이쪽은 한 화자의 잘린 한 문장을 한 줄로 잇는다.
 * 산출물도 묶는 개수도 판정 질문도 다르므로 토글을 따로 둔다 — 켤 사람이 다르다.
 *
 * ## 경계를 정하는 것은 문장이지 글자 수가 아니다
 *
 * 이 기능의 설계 하나를 고르라면 이것이다. "줄 상한이 찰 때까지 붙인다"는
 * 그럴듯하지만 자막을 부자연스럽게 만든다 — 글자 수는 문장이 어디서 끝나는지
 * 모른다. 그래서:
 *
 * - **코드는 런(run)만 뽑는다.** 짧은 블록이 촘촘한 간격으로 이어지는 구간.
 *   발화 도중에 잘린 토막은 사이가 거의 없고(`FRAGMENT_RUN_MAX_GAP_MS`),
 *   문장이 끝나면 숨을 쉬며 간격이 벌어진다 — 공짜로 얻는 꽤 정확한 신호다.
 * - **묶음의 경계는 모델이 정한다.** 런 전체를 보여주고 `1-3, 4-5`처럼 문장
 *   단위 묶음을 받는다. 어디가 한 문장인지는 두 줄만 봐서는 알 수 없다.
 * - **상한은 거부권으로만 쓴다.** 모델이 정한 묶음이 한 자막(2줄)이나
 *   `SUBTITLE_MAX_DURATION_MS`를 넘으면 **그 묶음을 버린다** — 상한에 맞춰
 *   잘라 붙이지 않는다. 천장이지 목표가 아니다.
 *
 * ## 줄바꿈은 여기서 안 한다
 *
 * 이은 결과는 **한 줄**로 내보낸다. 상한을 넘으면 파이프라인의 다음 단계
 * (`collectOverLongBlocks` → 줄바꿈 → `enforceTextRules`)가 이미 의미 단위로
 * 두 줄을 만든다. 이 모듈이 줄바꿈을 알 필요가 없다.
 *
 * 읽기 속도는 나빠지지 않는다: 합친 블록의 노출은 첫 시작~마지막 끝이라
 * 글자 수도 시간도 원본 합계 그대로다.
 */
export interface FragmentRun {
  /** 런 번호 — 모델과 주고받는 주소이며 자막 번호와 무관하다. */
  id: number;
  /** 이 런에 든 자막 번호, 파일 순서대로. */
  indices: number[];
  /** 각 블록의 대사 한 줄, `indices`와 같은 순서. */
  lines: string[];
}

/** 대사가 아닌 줄의 여는 글자 — 가사·화면 글자·설명·인용·화자 대시. */
const NON_DIALOGUE_OPENER = /^[♪♫[(“"'…-]/;

/**
 * 이어질 자격이 있는 블록의 연속 구간.
 *
 * 블록 자격은 대화 합치기와 거의 같다(한 줄·태그 없음·가사 아님). 다른 것은
 * **쉼표로 끝나는 줄을 빼지 않는다**는 점이다 — 저쪽에서 쉼표는 "안 끝났다"는
 * 배제 신호였지만, 여기서는 안 끝난 것이야말로 이어 붙일 대상이다.
 *
 * 런이 `FRAGMENT_RUN_MAX_BLOCKS`를 넘으면 거기서 끊고 다음 블록부터 새 런을
 * 시작한다. 프롬프트 한 덩어리의 길이를 막는 실무적 상한이지 의미상의
 * 경계가 아니라서, 잘린 자리가 문장 한가운데일 수 있다 — 그 경우 그 문장은
 * 두 런에 걸쳐 절반씩만 이어진다. 놓치는 쪽이지 틀리는 쪽은 아니다.
 */
export function collectFragmentRuns(
  srt: string,
  lineMaxChars: number,
): FragmentRun[] {
  const blocks = parseSrtBlocks(srt).map((raw) => {
    const timing = parseBlockTiming(raw);
    const index = readBlockIndex(raw);
    const body = raw.split('\n').slice(2);
    return { timing, index, body };
  });

  const runs: FragmentRun[] = [];
  let id = 0;
  let current: { indices: number[]; lines: string[]; endMs: number } | null =
    null;

  const flush = () => {
    if (current && current.indices.length >= 2) {
      runs.push({ id: ++id, indices: current.indices, lines: current.lines });
    }
    current = null;
  };

  for (const block of blocks) {
    if (!isJoinableBlock(block, lineMaxChars)) {
      flush();
      continue;
    }

    const line = block.body[0].trim();
    const gap = current ? block.timing!.startMs - current.endMs : Infinity;

    if (
      !current ||
      gap < 0 ||
      gap > FRAGMENT_RUN_MAX_GAP_MS ||
      current.indices.length >= FRAGMENT_RUN_MAX_BLOCKS
    ) {
      flush();
      current = {
        indices: [block.index!],
        lines: [line],
        endMs: block.timing!.endMs,
      };
      continue;
    }

    current.indices.push(block.index!);
    current.lines.push(line);
    current.endMs = block.timing!.endMs;
  }
  flush();

  return runs;
}

interface ParsedBlock {
  timing: { startMs: number; endMs: number } | null;
  index: number | null;
  body: string[];
}

function isJoinableBlock(block: ParsedBlock, lineMaxChars: number): boolean {
  if (!block.timing || block.index === null) return false;
  if (block.body.length !== 1) return false;

  const line = block.body[0].trim();
  if (!line) return false;
  if (line.includes('<')) return false;
  if (NON_DIALOGUE_OPENER.test(line)) return false;
  return visibleLength(line) <= lineMaxChars;
}

/**
 * 런을 모델에게 보이는 형태로. 줄 앞의 번호는 **런 안에서의 자리**(1부터)이지
 * 자막 번호가 아니다 — 모델이 돌려줄 묶음도 같은 좌표계라야 짧고, 자막 번호가
 * 커도 프롬프트가 길어지지 않는다.
 */
export function formatRunsForModel(runs: readonly FragmentRun[]): string {
  return runs
    .map(
      (run) =>
        `[${run.id}]\n` +
        run.lines.map((line, i) => `${i + 1}. ${line}`).join('\n'),
    )
    .join('\n\n');
}

/** `[3] 1-2, 4-6` — 런 번호와 그 안의 묶음들. `-` 하나면 이을 것이 없다는 뜻. */
const GROUP_LINE = /^\[(\d+)[^\]]*\]\s*(.*)$/;
const GROUP_RANGE = /(\d+)\s*-\s*(\d+)/g;

/**
 * 모델의 답에서 **이으라고 한 묶음만** 걷는다. 런 번호 → 묶음들(각 묶음은 런
 * 안의 자리 목록).
 *
 * 걸러내는 것이 많다. 이 값이 곧 "어느 자막을 지울 것인가"라서, 애매한 것은
 * 전부 버리는 쪽이 옳다:
 *
 * - 모르는 런 번호, 범위 밖의 자리
 * - 길이 1짜리 묶음(이을 게 없다)
 * - 한 런 안에서 **겹치는** 묶음 — 한 블록이 두 문장에 들어갈 수는 없다
 * - 답이 없는 런은 자동으로 "안 이음"이다. 침묵을 승인으로 읽으면 모델이
 *   절반만 답했을 때 나머지가 조용히 합쳐진다.
 *
 * 범위는 `1-3`처럼 연속 구간으로만 받는다. 흩어진 자리를 묶으면 이어붙일 때
 * 순서가 뒤집히거나 사이 블록이 사라진다.
 */
export function readJoinGroups(
  modelOutput: string,
  runs: readonly FragmentRun[],
): Map<number, number[][]> {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const result = new Map<number, number[][]>();

  for (const raw of modelOutput.split('\n')) {
    const match = GROUP_LINE.exec(raw.trim());
    if (!match) continue;

    const run = byId.get(Number(match[1]));
    if (!run || result.has(run.id)) continue;

    const groups: number[][] = [];
    const used = new Set<number>();

    for (const range of match[2].matchAll(GROUP_RANGE)) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to > run.indices.length || to <= from) continue;

      const positions: number[] = [];
      for (let p = from; p <= to; p++) positions.push(p);
      if (positions.some((p) => used.has(p))) continue;

      positions.forEach((p) => used.add(p));
      groups.push(positions);
    }

    if (groups.length > 0) result.set(run.id, groups);
  }

  return result;
}

export interface FragmentJoinResult {
  content: string;
  /** 실제로 사라진 블록 수 — 묶음마다 (블록 수 - 1). */
  joined: number;
}

/**
 * 승인된 묶음을 실제로 잇는다.
 *
 * **물리적 상한은 여기서 본다.** 수집 때가 아니라 지금인 이유는, 묶는 개수를
 * 정하는 것이 모델이기 때문이다 — 수집 단계에서는 무엇이 한 묶음이 될지 모른다.
 * 넘치면 그 묶음만 버리고 나머지 묶음은 그대로 잇는다.
 *
 * 타임코드는 코드가 만든다(불변식 2): 첫 블록의 시작 ~ 마지막 블록의 끝.
 * 본문은 공백 하나로 이은 **한 줄**이고, 줄바꿈은 다음 단계의 몫이다.
 */
export function applyFragmentJoins(
  srt: string,
  runs: readonly FragmentRun[],
  groups: ReadonlyMap<number, number[][]>,
  lineMaxChars: number,
): FragmentJoinResult {
  // 첫 블록의 자막 번호 → 그 묶음이 삼킬 자막 번호 전체.
  const byFirstIndex = new Map<number, number[]>();
  for (const run of runs) {
    for (const positions of groups.get(run.id) ?? []) {
      const indices = positions.map((p) => run.indices[p - 1]);
      byFirstIndex.set(indices[0], indices);
    }
  }
  if (byFirstIndex.size === 0) return { content: srt, joined: 0 };

  const blocks = parseSrtBlocks(srt);
  const rebuilt: string[] = [];
  let joined = 0;

  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i];
    const index = readBlockIndex(raw);
    const wanted = index === null ? undefined : byFirstIndex.get(index);

    if (!wanted) {
      rebuilt.push(raw);
      continue;
    }

    // 묶음이 가리키는 블록들이 지금도 그 순서로 나란히 있는지 다시 확인한다.
    const members = blocks.slice(i, i + wanted.length);
    const intact =
      members.length === wanted.length &&
      members.every((block, n) => readBlockIndex(block) === wanted[n]);
    const timings = members.map(parseBlockTiming);
    if (!intact || timings.some((timing) => timing === null)) {
      rebuilt.push(raw);
      continue;
    }

    const text = members
      .map((block) => block.split('\n').slice(2).join(' ').trim())
      .join(' ');
    const startMs = timings[0]!.startMs;
    const endMs = timings[timings.length - 1]!.endMs;

    // 천장 둘: 한 자막(2줄)에 들어가야 하고, 너무 오래 떠 있으면 안 된다.
    // 넘치면 이 묶음만 포기한다 — 잘라 붙이지 않는다.
    if (
      visibleLength(text) > lineMaxChars * 2 ||
      endMs - startMs > SUBTITLE_MAX_DURATION_MS
    ) {
      rebuilt.push(raw);
      continue;
    }

    rebuilt.push(
      ['0', formatTimingLine({ startMs, endMs }), text].join('\n'),
    );
    joined += members.length - 1;
    i += members.length - 1;
  }

  if (joined === 0) return { content: srt, joined: 0 };

  return { content: renumberBlocks(rebuilt).join('\n\n'), joined };
}
