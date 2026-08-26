import {
  formatTimingLine,
  parseBlockTiming,
  parseSrtBlocks,
  readBlockIndex,
  renumberBlocks,
  visibleLength,
} from './srt';
import {
  DIALOGUE_MERGE_MAX_GAP_MS,
  DIALOGUE_MERGE_MAX_SPAN_MS,
} from '../config/constants';

/**
 * 짧은 주고받음을 한 블록으로 합치기 — **블록 수를 바꾸는 유일한 경로**.
 *
 * 기준 문서 §I.6은 한 자막에 두 화자가 오면 `- `로 갈라 한 줄에 한 화자를 두라고
 * 하고, **각 줄이 완결 문장**이며 앞뒤 자막으로 이어지지 않아야 한다고 못박는다.
 * 원본이 `자극제?` / `그래`처럼 두 블록으로 흩어 놓으면 형식만 지킨 셈이라,
 * 이 모듈이 그 둘을 하나로 모은다.
 *
 * **판정은 두 단계다.** 여기(코드)가 하는 것은 산술로 확인되는 것 전부 —
 * 길이·간격·완결성·태그. 남는 질문 하나("이 둘이 정말 서로 다른 화자인가")는
 * 텍스트만으로 못 푼다: `그래서 내가` / `거기 갔었지`는 같은 사람이 이어 말한
 * 것이고 형태만 보면 후보와 구별되지 않는다. 그래서 코드는 **후보만** 뽑고
 * 최종 승인은 모델이 한다(`app/lib/server/dialogueMergeService.ts`).
 * 판정이 실패하거나 모델이 침묵하면 병합하지 않는다 — 원본 유지가 기본값이다.
 *
 * 블록 수가 줄면 원본 포맷(VTT·ASS·SMI) 되돌리기가 불가능해진다. 그 어댑터들은
 * 번역문을 **원본 큐의 자리에 꽂는** 방식이라 사라진 큐의 옛 대사가 그대로
 * 남기 때문이다(`app/lib/subtitles/document.ts`). 그래서 이 기능을 켜면
 * 다운로드는 `.srt` 하나뿐이다(`buildDownloads`).
 */
export interface DialogueCandidate {
  /** 후보 번호 — 모델과 주고받는 주소이며 자막 번호와 무관하다. */
  id: number;
  /** 앞 블록의 자막 번호. 병합 결과는 이 블록의 자리에 들어간다. */
  firstIndex: number;
  /** 뒤 블록의 자막 번호. 병합되면 이 블록은 사라진다. */
  secondIndex: number;
  /** 앞 블록의 대사 한 줄. */
  first: string;
  /** 뒤 블록의 대사 한 줄. */
  second: string;
}

/** 대사가 아닌 줄의 여는 글자 — 가사·화면 글자·설명·인용. */
const NON_DIALOGUE_OPENER = /^[♪♫[(“"'…-]/;

/**
 * 합쳐질 자격이 있는 인접 두 블록.
 *
 * 게이트는 전부 "아니면 안 합친다" 쪽으로 기운다. 병합은 되돌릴 수 없고(원본
 * 블록 경계가 사라진다), 틀린 병합은 남의 대사를 내 대사로 만든다.
 *
 * - **각 블록이 한 줄**이고, 대시(`- `) 두 글자를 붙이고도 `lineMaxChars` 안에
 *   들어간다 — 이것이 곧 "짧은 대사"의 조작적 정의다.
 * - **이어지는 말이라고 스스로 말하는 줄은 뺀다** — 쉼표로 끝나거나 `…`로
 *   끝나거나 시작하는 줄. §I.6은 "각 줄이 완결 문장"을 요구하지만 그 판정을
 *   코드가 하지는 않는다: 한국어 반말 대사는 `그래`·`가자`처럼 마침표도 없고
 *   `endsASentence`가 아는 어미도 아닌 채로 문장을 끝낸다. 완결성 검사를 코드가
 *   맡으면 이 기능이 잡아야 할 사례가 통째로 빠진다. 그래서 명시적 미완결 신호만
 *   코드가 걸러 내고, "한 문장이 둘로 나뉜 것인가"는 두 줄을 다 읽는 모델이
 *   판정한다(프롬프트의 N 조항).
 * - **간격 ≤ `DIALOGUE_MERGE_MAX_GAP_MS`**: 그보다 벌어지면 주고받음이 아니라
 *   다른 장면일 수 있다. 겹치거나 순서가 뒤집힌 블록도 뺀다.
 * - **합친 노출 구간 ≤ `DIALOGUE_MERGE_MAX_SPAN_MS`**: 합치면 두 대사가 앞
 *   블록의 시작부터 뒤 블록의 끝까지 **함께** 떠 있는다. 너무 길면 첫 대사가
 *   화면에 박제된다.
 * - **태그가 있으면 뺀다**(`<i>` 등). 태그 범위를 두 화자에 걸치게 옮기는 것은
 *   이 기능의 몫이 아니다.
 * - **가사·화면 글자·인용으로 시작하는 줄은 뺀다** — 대사가 아니면 화자도 없다.
 *
 * 한 블록은 최대 한 번만 후보가 된다. `A / B / C`가 연달아 짧아도 `A+B`만
 * 보고 `C`는 다음 블록과 다시 본다 — 세 화자를 두 줄에 우겨넣을 수는 없다.
 */
export function collectDialogueCandidates(
  srt: string,
  lineMaxChars: number,
): DialogueCandidate[] {
  const blocks = parseSrtBlocks(srt).map((raw) => {
    const timing = parseBlockTiming(raw);
    const index = readBlockIndex(raw);
    const body = raw.split('\n').slice(2);
    return { timing, index, body };
  });

  const candidates: DialogueCandidate[] = [];
  let id = 0;

  for (let i = 0; i + 1 < blocks.length; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    if (!isMergeableBlock(a, lineMaxChars) || !isMergeableBlock(b, lineMaxChars)) {
      continue;
    }

    const gap = b.timing!.startMs - a.timing!.endMs;
    if (gap < 0 || gap > DIALOGUE_MERGE_MAX_GAP_MS) continue;
    if (b.timing!.endMs - a.timing!.startMs > DIALOGUE_MERGE_MAX_SPAN_MS) {
      continue;
    }

    candidates.push({
      id: ++id,
      firstIndex: a.index!,
      secondIndex: b.index!,
      first: a.body[0].trim(),
      second: b.body[0].trim(),
    });
    // 이 쌍이 쓴 뒤 블록은 다음 쌍의 앞 블록이 될 수 없다.
    i++;
  }

  return candidates;
}

interface ParsedBlock {
  timing: { startMs: number; endMs: number } | null;
  index: number | null;
  body: string[];
}

function isMergeableBlock(block: ParsedBlock, lineMaxChars: number): boolean {
  if (!block.timing || block.index === null) return false;
  if (block.body.length !== 1) return false;

  const line = block.body[0].trim();
  if (!line) return false;
  if (line.includes('<')) return false;
  if (NON_DIALOGUE_OPENER.test(line)) return false;
  if (line.endsWith('…') || line.endsWith(',')) return false;
  // 대시 두 글자를 붙이고도 한 줄 상한 안에 들어와야 한다.
  return visibleLength(line) + 2 <= lineMaxChars;
}

/**
 * 후보를 모델에게 보이는 형태로.
 *
 * `formatBlocksForModel`과 달리 자막 번호를 쓰지 않는다 — 모델이 답해야 하는
 * 것은 "이 **쌍**이 대화인가"이므로 주소도 쌍 단위여야 한다. 자막 번호를 그대로
 * 쓰면 모델이 번호를 하나만 적었을 때 어느 쪽 뜻인지 알 수 없다.
 */
export function formatCandidatesForModel(
  candidates: readonly DialogueCandidate[],
): string {
  return candidates
    .map((c) => `[${c.id}]\nA: ${c.first}\nB: ${c.second}`)
    .join('\n\n');
}

/** `[3] Y` 한 줄. 뒤에 사족이 붙어도 앞의 판정만 읽는다. */
const VERDICT_LINE = /^\[(\d+)[^\]]*\]\s*([YyNn])/;

/**
 * 모델의 판정에서 **합치라고 한 후보 번호만** 걷는다.
 *
 * 모르는 번호는 버리고, 답이 없는 후보는 자동으로 `N`이다 — 침묵을 승인으로
 * 읽으면 모델이 절반만 답했을 때 나머지가 조용히 합쳐진다.
 */
export function readMergeVerdicts(
  modelOutput: string,
  expected: ReadonlySet<number>,
): Set<number> {
  const approved = new Set<number>();
  for (const line of modelOutput.split('\n')) {
    const match = VERDICT_LINE.exec(line.trim());
    if (!match) continue;
    const id = Number(match[1]);
    if (!expected.has(id)) continue;
    if (match[2].toUpperCase() === 'Y') approved.add(id);
  }
  return approved;
}

export interface DialogueMergeResult {
  content: string;
  /** 실제로 사라진 블록 수 = 합쳐진 쌍의 수. */
  merged: number;
}

/**
 * 승인된 쌍을 실제로 합친다.
 *
 * 타임코드는 **코드가 만든다**(불변식 2): 앞 블록의 시작부터 뒤 블록의 끝까지.
 * 본문은 `- 앞` / `- 뒤` 두 줄이고, 대시는 여기서 붙인다 — `enforceTextRules`의
 * 짝 채우기에 기대지 않는다. 이 함수가 만드는 블록은 처음부터 완성형이어야
 * 뒤 단계(2줄 접기 예외 등)가 화자 줄로 알아본다.
 *
 * 병합이 한 건이라도 있으면 **전체를 1부터 다시 번호 매긴다** — 번호가 비면
 * 그 SRT를 읽는 다른 도구가 블록을 잃는다. 한 건도 없으면 원본을 그대로 준다.
 */
export function applyDialogueMerges(
  srt: string,
  candidates: readonly DialogueCandidate[],
  approvedIds: ReadonlySet<number>,
): DialogueMergeResult {
  const byFirstIndex = new Map<number, DialogueCandidate>();
  for (const candidate of candidates) {
    if (approvedIds.has(candidate.id)) {
      byFirstIndex.set(candidate.firstIndex, candidate);
    }
  }
  if (byFirstIndex.size === 0) return { content: srt, merged: 0 };

  const blocks = parseSrtBlocks(srt);
  const rebuilt: string[] = [];
  let merged = 0;

  for (let i = 0; i < blocks.length; i++) {
    const raw = blocks[i];
    const index = readBlockIndex(raw);
    const candidate = index === null ? undefined : byFirstIndex.get(index);
    const next = blocks[i + 1];

    // 후보가 가리키는 뒤 블록이 실제로 바로 다음에 있는지 다시 확인한다 —
    // 후보를 뽑은 뒤 내용이 바뀌었을 수 있고, 엉뚱한 블록을 삼키느니 거른다.
    if (!candidate || !next || readBlockIndex(next) !== candidate.secondIndex) {
      rebuilt.push(raw);
      continue;
    }

    const start = parseBlockTiming(raw);
    const end = parseBlockTiming(next);
    if (!start || !end) {
      rebuilt.push(raw);
      continue;
    }

    rebuilt.push(
      [
        '0', // 아래에서 다시 매긴다.
        formatTimingLine({ startMs: start.startMs, endMs: end.endMs }),
        `- ${candidate.first}`,
        `- ${candidate.second}`,
      ].join('\n'),
    );
    merged++;
    i++; // 뒤 블록은 소비됐다.
  }

  if (merged === 0) return { content: srt, merged: 0 };

  return { content: renumberBlocks(rebuilt).join('\n\n'), merged };
}
