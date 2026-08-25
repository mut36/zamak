import { buildOutputFilename } from './srt';
import {
  emitInOriginalFormat,
  formatExtension,
  subtitleMime,
  type SubtitleDoc,
} from './subtitles';
import type { DownloadOption } from '../types/translation';

/**
 * 내려받을 파일 목록. 원본 포맷을 되돌릴 수 있으면 그것을 먼저, `.srt`를 뒤에
 * 둔다. 라운드트립이 실패하면 조용히 SRT만 준다 — 다운로드 자체가 막히는 것보다
 * 낫다.
 *
 * `useTranslation`에서 옮겨 왔다(2026-08-19): `/polish`도 같은 것을 쓰는데
 * 훅에서 가져오는 건 방향이 틀렸다. 상태가 없는 순수 함수이므로 라이브러리에 산다.
 */
export function buildDownloads(
  doc: SubtitleDoc | null,
  originalName: string,
  targetLang: string,
  translatedSrt: string,
  /**
   * 블록 수가 원본과 달라졌다는 신호. 원본 포맷 되돌리기는 번역문을 **원본 큐의
   * 자리에** 꽂는 방식이라(`emitInOriginalFormat`), 블록이 사라지면 그 큐에는
   * 옛 대사가 그대로 남는다 — 조용히 원본 대사가 섞인 파일이 나가느니 SRT만
   * 준다. 지금 이 값을 켜는 곳은 `/polish`의 짧은 대화 합치기 하나다.
   */
  blockCountChanged = false,
): DownloadOption[] {
  const asSrt: DownloadOption = {
    extension: 'srt',
    filename: buildOutputFilename(originalName, targetLang, 'srt'),
    content: translatedSrt,
    mime: subtitleMime('srt'),
  };
  if (!doc || doc.format === 'srt' || !doc.roundTrip || blockCountChanged) {
    return [asSrt];
  }

  try {
    const extension = formatExtension(doc.format);
    return [
      {
        extension,
        filename: buildOutputFilename(originalName, targetLang, extension),
        content: emitInOriginalFormat(doc, translatedSrt),
        mime: subtitleMime(doc.format),
      },
      asSrt,
    ];
  } catch (err) {
    console.error('[downloads] round-trip failed, offering SRT only', err);
    return [asSrt];
  }
}
