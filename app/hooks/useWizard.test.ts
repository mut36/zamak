import { describe, it, expect } from 'vitest';
import {
  countBlocks,
  creditsForUpload,
  inspectUpload,
  type WizardMessages,
} from './useWizard';
import { BLOCKS_PER_CREDIT } from '../config/constants';

/** N blocks of valid SRT, so countBlocks parses rather than guesses. */
function srtWithBlocks(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const s = String(i).padStart(2, '0');
    return `${i + 1}\n00:00:${s},000 --> 00:00:${s},500\n대사 ${i + 1}`;
  }).join('\n\n');
}

describe('upload-time credit quote', () => {
  // What the upload screen shows before the user commits. It has to match what
  // begin_translation_job will charge — the quote is the promise, and the
  // ledger is what happens.
  it('quotes one credit for a file at exactly the divisor', () => {
    expect(creditsForUpload(BLOCKS_PER_CREDIT)).toBe(1);
  });

  it('quotes two credits one block past the divisor, instead of refusing', () => {
    // Until 2026-08-21 this was a refusal (`exceedsCreditCap`). A file this
    // size is now translatable and simply costs more — if this ever goes back
    // to being a boolean, the dead end is back with it.
    expect(creditsForUpload(BLOCKS_PER_CREDIT + 1)).toBe(2);
  });

  it('has no upper bound', () => {
    // The point of the change: a professional translator's long file has a
    // price, not a wall.
    expect(creditsForUpload(BLOCKS_PER_CREDIT * 10)).toBe(10);
  });

  it('counts blocks the way the server does', () => {
    // useTranslation sends parseSrtBlocks(doc.srt).length to the begin route,
    // which prices the job from it. If this ever counted cues or lines
    // instead, the quoted charge and the billed one would differ.
    expect(countBlocks(srtWithBlocks(3))).toBe(3);
    expect(countBlocks('')).toBe(0);
  });
});

/**
 * The replace-upload bug: upload a good file A, hit "다른 파일 선택", pick a
 * file B that gets refused — the screen showed **B's name plus "업로드 완료"**
 * with the Next button live, but the content behind it was still A. Pressing
 * translate spent a credit translating A while the user was looking at B.
 *
 * The cause was ordering, not validation: `handleFile` published the file name
 * before running the checks, and none of the three early returns took it back.
 * `inspectUpload` exists so there is nothing to take back — it decides without
 * writing, and `handleFile` cannot publish a name until it returns ok.
 *
 * These tests pin the two halves of that contract: every refusal path is
 * reachable and reports itself, and an accepted file comes back with the parsed
 * document and its block count (the only things that may then be published).
 */
describe('inspectUpload: 거절은 아무것도 남기지 않는다', () => {
  const messages: WizardMessages['upload'] = {
    bilingualSmi: 'BILINGUAL',
    unreadableFile: 'UNREADABLE',
    invalidFile: 'INVALID',
    noBlocks: 'NO_BLOCKS',
  };

  const file = (name: string, body: string) =>
    new File([body], name, { type: 'text/plain' });

  it('확장자가 아니면 파싱조차 하지 않고 돌려보낸다', async () => {
    // 자막이 아닌 파일에 디코드 비용을 쓰지 않는다 — 순서가 근거다.
    const result = await inspectUpload(file('movie.mp4', 'not a subtitle'), messages);
    expect(result).toEqual({
      ok: false,
      reason: 'invalidFile',
      message: 'INVALID',
    });
  });

  it('파싱이 실패하면 unreadable로 돌려보낸다', async () => {
    // 자막이 하나도 없는 파일(EmptySubtitleError)이 이 경로의 대표 사례다.
    const result = await inspectUpload(file('empty.srt', '   '), messages);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unreadable');
    expect(result.message).toBe('UNREADABLE');
  });

  it('파싱은 되지만 블록이 0개면 noBlocks로 돌려보낸다', async () => {
    // .srt 확장자인데 본문이 자막이 아닌 경우(유튜브 자막을 .srt로 저장한
    // VTT 등) — 파서는 예외를 던지지 않고 그냥 0블록 문서를 돌려준다.
    // EmptySubtitleError(위 테스트)는 완전히 빈 파일만 잡으므로 이건 별도
    // 경로다. 2026-08-03에 이 테스트를 쓰다가 놓친 걸 발견했다.
    const result = await inspectUpload(
      file('not-actually-subtitles.srt', 'This is just prose, not a subtitle file.'),
      messages,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noBlocks');
    expect(result.message).toBe('NO_BLOCKS');
  });

  it('블록 하나만 진짜 타임코드를 가져도 통과한다', async () => {
    // 실제 자막 파일에도 깨진 큐 하나쯤은 섞여 있을 수 있다 — noBlocks는
    // "이 파일이 통째로 자막이 아니다"를 잡는 것이지, 완벽함을 요구하지 않는다.
    const mixed = `nonsense header line\n\n${srtWithBlocks(1)}`;
    const result = await inspectUpload(file('mixed.srt', mixed), messages);
    expect(result.ok).toBe(true);
  });

  it('상한을 넘던 크기도 이제는 통과하고, 블록 수를 들고 온다', async () => {
    // 이 크기는 2026-08-21까지 'tooLarge'로 거절되던 자리다(§6-22). 통과
    // 자체가 이 변경의 요지이고, blockCount는 업로드 화면이 차감 장수를
    // 계산하는 근거다 — 화면이 doc을 다시 파싱하면 두 숫자가 갈라진다.
    const over = BLOCKS_PER_CREDIT + 1;
    const result = await inspectUpload(
      file('huge.srt', srtWithBlocks(over)),
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blockCount).toBe(over);
    expect(creditsForUpload(result.blockCount)).toBe(2);
  });

  it('통과한 파일은 파싱된 문서를 들고 돌아온다', async () => {
    const result = await inspectUpload(
      file('good.srt', srtWithBlocks(3)),
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // handleFile이 loadedFileName을 세우는 유일한 근거가 이 doc이다.
    expect(countBlocks(result.doc.srt)).toBe(3);
  });

  it('경계(정확히 1장 분량)는 1장으로 통과한다', async () => {
    const result = await inspectUpload(
      file('exact.srt', srtWithBlocks(BLOCKS_PER_CREDIT)),
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(creditsForUpload(result.blockCount)).toBe(1);
  });

  it('거절된 검사는 문서를 들고 오지 않는다', async () => {
    // 이게 버그의 핵심이었다 — 거절 경로가 "쓸 수 있는 것"을 만들어 내면
    // handleFile이 그걸 발행할 여지가 다시 생긴다. 타입으로도 막혀 있지만,
    // 셋 다 실제로 doc이 없는지 값으로도 고정한다. (넷째였던 '상한 초과'는
    // 더 이상 거절 경로가 아니다 — §6-22.)
    const rejected = await Promise.all([
      inspectUpload(file('movie.mp4', 'x'), messages),
      inspectUpload(file('empty.srt', '   '), messages),
      inspectUpload(file('not-actually-subtitles.srt', 'just prose'), messages),
    ]);
    for (const result of rejected) {
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty('doc');
    }
  });
});

// runEnrich's auto-pick-first-candidate behavior (ambiguous search → resolve
// candidates[0] → same confirm banner as a confident match, full list only
// on "이 작품이 아니에요") lives in useWizard.ts and depends on the async
// /api/enrich round-trip, so it isn't covered by a pure-function test here —
// see runEnrich's doc comment for the routing rules it implements.

/**
 * 폰에서 자막 파일이 아예 안 골라지던 버그(`decisions.md` §1-22)의 회귀 방지.
 *
 * 드롭존의 `<input type=file>`에 `accept`가 있으면 iOS가 그 확장자를 UTI로
 * 바꿔서 거는데 `.srt`·`.smi`·`.ass`는 등록된 UTI가 없어서, 파일 앱이 **모든
 * 파일을 회색으로** 만든다. 걸러지는 게 아니라 업로드가 통째로 막힌다.
 *
 * "지원 포맷을 미리 걸러 주자"는 직관이 워낙 자연스러워서 언젠가 반드시 다시
 * 붙는다. 그때 여기서 깨지라고 소스를 직접 읽어 고정한다 — 거르는 일은 위
 * `inspectUpload` 테스트들이 지키고 있는 몫이다.
 */
describe('업로드 input은 accept를 걸지 않는다', () => {
  it('UploadStep의 file input에 accept 속성이 없다', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../components/simple/UploadStep.tsx', import.meta.url),
      'utf8',
    );
    const fileInput = source.slice(source.indexOf("type='file'"));
    expect(fileInput).not.toMatch(/\baccept=/);
  });
});
