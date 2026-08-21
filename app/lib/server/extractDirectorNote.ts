import 'server-only';

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  DIRECTOR_NOTE_MAX_CHARS,
  GLOSSARY_MODEL,
  GLOSSARY_THINKING_LEVEL,
  type GlossaryProvider,
} from '../../config/constants';
import type { MovieInfo } from '../../types/translation';
import { resolveTargetLang } from '../../config/languages';
import { parseSrtBlocks } from '../srt';
import { loadDirectorNotePrompt } from '../prompts/loader';
import { renderPromptTemplate } from '../prompts/renderer';
import { buildUserTurn, fetchCastAnchors } from './extractCastSheet';

/**
 * 연출 메모 프리패스 — 글로사리 표를 대체한다(2026-08-21).
 *
 * 앞단(TMDB 배역 앵커, 블록 발췌, 사용자 턴 조립)은 `extractCastSheet`의 것을
 * **그대로 재사용**한다. 두 기능은 "파일당 한 번 전체를 읽는다"는 같은 일을
 * 하고, 발췌 규칙이 갈라지면 한쪽에서 고친 버그가 다른 쪽에 안 옮는다.
 * 다른 것은 스키마와 시스템 프롬프트뿐이다.
 *
 * 산출물이 표가 아니라 짧은 산문인 것이 요점이다. 표는 강제 규칙으로 렌더돼
 * 번역 지침을 이겼고, 메모는 `<user_notes>`(신뢰 경계 안쪽의 데이터)로 들어가
 * 그럴 권한이 없다 — `GLOSSARY_ENABLED` 주석 참조.
 */

const NOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: { note: { type: Type.STRING } },
  required: ['note'],
};

/** OpenAI 쪽 JSON 스키마. Gemini의 `Type.*` 표기와 형태만 다르고 뜻은 같다. */
const NOTE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { note: { type: 'string' } },
  required: ['note'],
  additionalProperties: false,
};

interface RawNote {
  note?: unknown;
}

/** Read at call time so harnesses can flip provider after module load. */
function resolveProvider(): GlossaryProvider {
  return process.env.GLOSSARY_PROVIDER === 'gemini' ? 'gemini' : 'openai';
}

/**
 * 모델이 흘린 형식을 걷어낸다. 프롬프트가 이미 금지한 것들이지만, 분량과
 * 마크다운은 모델이 가장 자주 어기는 두 가지라 코드에서 한 번 더 막는다.
 *
 * 자르기는 **줄 단위**다. 문자 수로 뚝 자르면 마지막 문장이 중간에서 끊겨
 * "Aldo Moro → 알도 모"처럼 틀린 지시가 남는다 — 잘린 메모보다 나쁘다.
 */
export function sanitizeDirectorNote(raw: unknown): string {
  const value =
    typeof raw === 'object' && raw !== null
      ? (raw as RawNote).note
      : undefined;
  if (typeof value !== 'string') return '';

  const lines = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        // 글머리표·제목 마커만 떼고 문장은 남긴다.
        .replace(/^\s*(?:[-*+•]|#{1,6}|\d+[.)])\s+/, '')
        // **강조**·`코드` 같은 인라인 마크업.
        .replace(/[*_`]/g, '')
        .trim(),
    )
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    const next = [...kept, line].join('\n');
    if (next.length > DIRECTOR_NOTE_MAX_CHARS) break;
    kept.push(line);
  }

  // 첫 줄부터 캡을 넘으면 위 루프가 통째로 빈 배열을 남긴다. 그때만 문자
  // 단위로 자른다 — 아무것도 없는 것보다는 낫다.
  if (kept.length === 0 && lines.length > 0) {
    return lines[0].slice(0, DIRECTOR_NOTE_MAX_CHARS).trim();
  }
  return kept.join('\n');
}

export async function buildNoteSystemInstruction(
  targetLang: string,
  hasCastAnchors: boolean,
): Promise<string> {
  const lang = resolveTargetLang(targetLang);
  const template = await loadDirectorNotePrompt();
  return renderPromptTemplate(template, {
    targetLanguage: lang.promptLabel,
    maxChars: String(DIRECTOR_NOTE_MAX_CHARS),
    // 앵커가 없는 요청에 "아래 표를 보라"고 적으면 없는 것을 가리키는 문장이
    // 된다 — composer가 glossaryDirective를 다루는 방식과 같은 이유다.
    castAnchorHint: hasCastAnchors
      ? '<tmdb_cast>에 배역 이름이 주어졌다면 표기를 고를 때 참고하되, 그 목록을 그대로 옮겨 적지는 마.'
      : '',
  });
}

async function generateViaOpenAi(
  system: string,
  user: string,
): Promise<RawNote> {
  const { openaiGenerateJson } = await import('../providers/openai');
  const { json, usage } = await openaiGenerateJson({
    model: GLOSSARY_MODEL,
    system,
    user,
    jsonSchema: NOTE_JSON_SCHEMA,
    schemaName: 'director_note',
  });
  console.log(
    `[note] provider=openai model=${GLOSSARY_MODEL} prompt=${usage.inputTokens} output=${usage.outputTokens}`,
  );
  return json as RawNote;
}

async function generateViaGemini(
  apiKey: string,
  system: string,
  user: string,
): Promise<RawNote> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GLOSSARY_MODEL,
    contents: user,
    config: {
      systemInstruction: system,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel[GLOSSARY_THINKING_LEVEL],
      },
      responseMimeType: 'application/json',
      responseSchema: NOTE_SCHEMA,
    },
  });
  const usage = response.usageMetadata;
  console.log(
    `[note] provider=gemini model=${GLOSSARY_MODEL} thinking=${GLOSSARY_THINKING_LEVEL} prompt=${usage?.promptTokenCount} thoughts=${usage?.thoughtsTokenCount ?? 0} output=${usage?.candidatesTokenCount}`,
  );
  return JSON.parse(response.text ?? '{}') as RawNote;
}

/**
 * 파일당 한 번. 어떤 실패든 빈 문자열로 떨어진다 — 이 프리패스는 번역을 막지
 * 않고, 메모가 없는 것은 이 기능이 없던 때와 같은 상태일 뿐이다.
 */
export async function extractDirectorNote(
  subtitleContent: string,
  movieInfo: Pick<
    MovieInfo,
    'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'
  >,
  targetLang: string,
): Promise<string> {
  const blockCount = parseSrtBlocks(subtitleContent).length;
  if (blockCount === 0) return '';

  const provider = resolveProvider();
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[note] OPENAI_API_KEY not configured — returning no note');
      return '';
    }
  } else if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.warn(
      '[note] GOOGLE_GENAI_API_KEY not configured — returning no note',
    );
    return '';
  }

  try {
    const cast = await fetchCastAnchors(movieInfo.title, movieInfo.year);
    const system = await buildNoteSystemInstruction(
      targetLang,
      cast.length > 0,
    );
    const user = buildUserTurn(movieInfo, cast, subtitleContent, blockCount);

    const parsed =
      provider === 'openai'
        ? await generateViaOpenAi(system, user)
        : await generateViaGemini(
            process.env.GOOGLE_GENAI_API_KEY!,
            system,
            user,
          );

    return sanitizeDirectorNote(parsed);
  } catch (error) {
    console.error('[note] director note extraction failed', error);
    return '';
  }
}
