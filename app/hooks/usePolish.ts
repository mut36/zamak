'use client';

import { useCallback, useRef, useState } from 'react';
import {
  applySubtitleRules,
  type PolishSummary,
  type PolishTimingOptions,
} from '../lib/polish';
import { buildDownloads } from '../lib/downloads';
import { parseSrtBlocks } from '../lib/srt';
import { detectSubtitleLanguage } from '../lib/detectLanguage';
import { loadSubtitleFile, type SubtitleDoc } from '../lib/subtitles';
import {
  getPolishTargetLang,
  getTargetLang,
  type TargetLangCode,
} from '../config/languages';
import { POLISH_MAX_BLOCKS } from '../config/constants';
import {
  requestDialogueMerge,
  requestFragmentJoin,
  requestLineSplit,
  PolishRefusedError,
} from '../lib/client/polishApi';
import type { DownloadOption } from '../types/translation';
import { COPY } from '../i18n/simpleCopy';

/**
 * 감지에 실패했을 때 쓰는 언어. 이 화면은 한국어 자막을 위해 만들어졌고 트래픽도
 * 거의 한국어라, "모르겠다"의 가장 그럴듯한 답이 한국어다. 다만 **감지 실패는
 * 화면에 그대로 뜬다**(`languageDetected: false`) — 사용자가 다른 언어로 다시
 * 적용할 수 있어야 하기 때문이다.
 */
const FALLBACK_LANG: TargetLangCode = 'ko';

export type PolishStage = 'idle' | 'working' | 'done' | 'error';

export type { PolishSummary };

/** 완료 화면이 "어느 언어 규칙으로 돌렸나"를 말하기 위해 갖는 것. */
export interface PolishLanguageState {
  code: TargetLangCode;
  label: string;
  /** 코드가 실제로 감지했는가. false면 폴백(한국어)으로 돈 것이다. */
  detected: boolean;
}

/** 다시 적용할 때 되쓰는, 이번 실행을 그대로 재현하는 데 필요한 전부. */
interface LastRun {
  doc: SubtitleDoc;
  fileName: string;
  timing: PolishTimingOptions | null;
  mergeDialogue: boolean;
  joinFragments: boolean;
}

/**
 * `/polish`의 상태. 파이프라인 자체는 `applySubtitleRules`(`app/lib/polish.ts`)에
 * 있고 이 훅은 파일 읽기·언어 감지·거절 처리·화면 상태만 맡는다 — `useWizard`가
 * 판단을 순수 함수로 뽑아 둔 것과 같은 이유로, 렌더 없이 검증되어야 할 것들을
 * 밖에 뒀다.
 *
 * **언어를 묻지 않는다.** 규칙 적용은 언어를 반드시 알아야 하지만(줄 상한·마침표
 * 정책이 언어별이다) 그걸 사용자가 알려줄 필요는 없다 — 자막 본문을 보면
 * `detectSubtitleLanguage`가 코드만으로 판정한다. 대신 결과를 숨기지 않는다:
 * 완료 화면에 감지 결과가 뜨고, 틀렸으면 다른 언어로 다시 적용할 수 있다.
 */
export function usePolish() {
  const [stage, setStage] = useState<PolishStage>('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [downloads, setDownloads] = useState<DownloadOption[]>([]);
  const [language, setLanguage] = useState<PolishLanguageState | null>(null);
  // 다시 적용은 파일을 다시 읽지 않는다 — 이미 파싱된 문서를 그대로 쓴다.
  const lastRun = useRef<LastRun | null>(null);

  const reset = useCallback(() => {
    setStage('idle');
    setError('');
    setSummary(null);
    setDownloads([]);
    setLanguage(null);
    lastRun.current = null;
  }, []);

  const run = useCallback(
    async (input: LastRun, code: TargetLangCode, detected: boolean) => {
      const lang = getPolishTargetLang(code);
      if (!lang) {
        setError(COPY.polish.languageUnsupported(labelOf(code)));
        setStage('error');
        return;
      }

      setStage('working');
      setError('');
      lastRun.current = input;
      setLanguage({ code, label: lang.label, detected });

      const { doc, fileName, timing, mergeDialogue, joinFragments } = input;

      try {
        const outcome = await applySubtitleRules(
          doc.srt,
          lang,
          async (subset) => {
            const response = await requestLineSplit(subset, code);
            return response.content;
          },
          timing,
          mergeDialogue
            ? async (candidates) => {
                const response = await requestDialogueMerge(candidates, code);
                return response.approved;
              }
            : null,
          joinFragments
            ? async (runs) => {
                const response = await requestFragmentJoin(runs, code);
                // JSON은 키를 문자열로 돌려준다 — 런 번호로 되돌린다.
                return new Map(
                  Object.entries(response.groups).map(([id, groups]) => [
                    Number(id),
                    groups,
                  ]),
                );
              }
            : null,
        );

        setSummary(outcome.summary);
        setDownloads(
          buildDownloads(
            doc,
            fileName,
            code,
            outcome.content,
            outcome.summary.blocksMerged > 0 ||
              outcome.summary.blocksJoined > 0,
          ),
        );
        setStage('done');
      } catch (err) {
        if (err instanceof PolishRefusedError) {
          setError(
            err.code === 'file_too_large'
              ? COPY.polish.tooLarge
              : err.code === 'unsupported_language'
                ? COPY.polish.languageUnsupported(lang.label)
                : COPY.polish.limitReached,
          );
        } else {
          setError(COPY.polish.failed);
        }
        setStage('error');
      }
    },
    [],
  );

  // `timing`이 null이면 타임코드를 아예 안 건드리고, 블록 수를 바꾸는 토글
  // 둘(`mergeDialogue`·`joinFragments`)이 다 false면 자막 개수도 그대로다 —
  // 전부 업로드 화면의 기본값이자 이 화면의 약속이다.
  const handleFile = useCallback(
    async (
      file: File,
      timing: PolishTimingOptions | null = null,
      mergeDialogue = false,
      joinFragments = false,
    ) => {
      setStage('working');
      setError('');

      // 어떤 포맷이든 정규 SRT로. 파싱 실패는 업로드 화면의 기존 문구를 쓴다.
      let doc: SubtitleDoc;
      try {
        doc = await loadSubtitleFile(file);
      } catch {
        setError(COPY.upload.invalidFile);
        setStage('error');
        return;
      }

      const blockCount = parseSrtBlocks(doc.srt).length;
      if (blockCount === 0) {
        setError(COPY.upload.noBlocks);
        setStage('error');
        return;
      }
      if (blockCount > POLISH_MAX_BLOCKS) {
        setError(COPY.polish.tooLarge);
        setStage('error');
        return;
      }

      // 감지된 언어를 규칙 적용이 아직 모르면 **돌리기 전에** 멈춘다. 영어
      // 자막을 한국어 규칙으로 돌리면 문장 끝 마침표가 전부 사라지므로,
      // 폴백으로 밀고 나가는 것이 아무것도 안 하는 것보다 나쁘다.
      const detected = detectSubtitleLanguage(doc.srt);
      if (detected && !getPolishTargetLang(detected)) {
        setLanguage(null);
        setError(COPY.polish.languageUnsupported(labelOf(detected)));
        setStage('error');
        return;
      }

      await run(
        { doc, fileName: file.name, timing, mergeDialogue, joinFragments },
        detected ?? FALLBACK_LANG,
        detected !== null,
      );
    },
    [run],
  );

  /** 완료 화면에서 다른 언어 규칙으로 다시 적용한다. 파일은 다시 안 읽는다. */
  const reapply = useCallback(
    async (code: TargetLangCode) => {
      const input = lastRun.current;
      if (!input) return;
      await run(input, code, false);
    },
    [run],
  );

  return {
    stage,
    error,
    summary,
    downloads,
    language,
    handleFile,
    reapply,
    reset,
  };
}

/** 표에 없는 코드까지 안전하게 — 감지기는 규칙 적용이 모르는 언어도 답한다. */
function labelOf(code: TargetLangCode): string {
  return getTargetLang(code)?.label ?? code;
}
