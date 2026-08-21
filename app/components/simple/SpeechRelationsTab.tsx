'use client';

import type { CastSheet, SpeechRelation } from '../../types/glossary';
import { SPEECH_FORMALITIES } from '../../types/glossary';
import type { FormalityAxis } from '../../config/languages';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.info.castSheet;

interface SpeechRelationsTabProps {
  sheet: CastSheet;
  onChangeSheet: (sheet: CastSheet) => void;
  /** 도착어의 존대 축 — 이 탭은 축이 있는 언어에서만 렌더된다. */
  axis: FormalityAxis;
  /** 총 블록 수 — 관계 구간이 넘어설 수 없는 상한 (Task 9에서 편집에 사용). */
  blockCount: number;
}

/**
 * 말투 관계표 편집.
 *
 * **번역 AI는 여기 적힌 대로 따른다** — 대사만 보고 달리 판단하지 않는다
 * (`prompts/common/glossary_directive.txt`, 스펙 §2-4-1). 그래서 이 화면은
 * 편의 기능이 아니라 그 설계가 서기 위한 전제다: 추출이 틀렸을 때 바로잡을 수
 * 있는 유일한 지점이 여기다. 첫 실측에서 추출은 "당수 ↔ 경호대장"을 양방향
 * 존댓말로 판정했는데, 자막에서는 한쪽만 존댓말이었다.
 */
export function SpeechRelationsTab({
  sheet,
  onChangeSheet,
  axis,
}: SpeechRelationsTabProps) {
  const updateRelation = (index: number, patch: Partial<SpeechRelation>) => {
    const relations = sheet.relations.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    onChangeSheet({ ...sheet, relations });
  };

  const removeRelation = (index: number) => {
    onChangeSheet({
      ...sheet,
      relations: sheet.relations.filter((_, i) => i !== index),
    });
  };

  return (
    <div>
      {sheet.relations.length === 0 && (
        <p className='text-fineprint text-secondary mb-2'>{c.emptyRelations}</p>
      )}
      {sheet.relations.map((rel, i) => (
        <div key={i} className='flex items-center gap-2 mb-2 flex-wrap'>
          <select
            className='input !py-1.5 !w-auto'
            value={rel.from}
            onChange={(e) => updateRelation(i, { from: e.target.value })}
          >
            {/* key가 표기 문자열이면 같은 표기를 가진 항목 둘에서 React key가
                충돌한다 — 실측 파일에서 "알도 모로"·"붉은 여단" 등 6종이 실제로
                중복돼 렌더마다 경고가 쏟아졌다. 인덱스를 쓴다. */}
            {sheet.terms.map((t, ti) => (
              <option key={ti} value={t.target}>
                {t.target}
              </option>
            ))}
          </select>
          <span className='text-secondary'>→</span>
          <select
            className='input !py-1.5 !w-auto'
            value={rel.to}
            onChange={(e) => updateRelation(i, { to: e.target.value })}
          >
            {sheet.terms.map((t, ti) => (
              <option key={ti} value={t.target}>
                {t.target}
              </option>
            ))}
          </select>
          <div className='flex gap-1'>
            {SPEECH_FORMALITIES.map((option) => (
              <button
                key={option}
                type='button'
                className='btn btn-ghost !py-1 !px-2 !text-fineprint'
                style={
                  rel.speech === option
                    ? { background: 'var(--ink-strong)', color: 'white' }
                    : undefined
                }
                onClick={() => updateRelation(i, { speech: option })}
              >
                {axis[option]}
              </button>
            ))}
          </div>
          <span className='text-mono-step text-secondary'>
            {c.relationRange(rel.fromBlock, rel.toBlock)}
          </span>
          <button
            type='button'
            className='btn btn-ghost !py-1.5 !px-2 !text-fineprint ml-auto'
            aria-label={c.removeRow}
            onClick={() => removeRelation(i)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
