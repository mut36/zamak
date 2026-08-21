'use client';

import type {
  CastSheet,
  GlossaryTerm,
  NarrationStyle,
  SpeechRelation,
} from '../../types/glossary';
import { SPEECH_FORMALITIES } from '../../types/glossary';
import type { FormalityAxis } from '../../config/languages';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.info.castSheet;

interface SpeechRelationsTabProps {
  sheet: CastSheet;
  onChangeSheet: (sheet: CastSheet) => void;
  /** 도착어의 존대 축 — 이 탭은 축이 있는 언어에서만 렌더된다. */
  axis: FormalityAxis;
  /** 총 블록 수 — 관계 구간이 넘어설 수 없는 상한. */
  blockCount: number;
}

/**
 * 구간 입력을 항상 유효한 상태로 유지한다 — 서버(`parseSpeechRelation`)가
 * `from > to`인 관계를 통째로 버리므로, 타이핑 도중의 중간 상태가 저장돼
 * 관계가 조용히 사라지는 걸 막는다. 빈 칸·문자는 하한으로 되돌린다.
 */
function clampBlock(raw: string, upper: number, lower: number): number {
  const parsed = Number.parseInt(raw, 10);
  const top = Math.max(lower, upper);
  if (!Number.isFinite(parsed)) return lower;
  return Math.max(lower, Math.min(top, parsed));
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
  blockCount,
}: SpeechRelationsTabProps) {
  // 말을 하는 것은 인물뿐이다. 서버(`sanitizeCastSheet`·`parseCastSheet`)가 같은
  // 규칙으로 관계를 버리므로, 화면이 고를 수 없게 하는 편이 정직하다 — 고른 뒤
  // 말없이 사라지는 것보다 낫다.
  //
  // target으로 한 번 더 접는다: 자막에 축약형과 전체형이 다 나오면 표기 표에는
  // 둘 다 있고(정상 데이터, 둘 다 같은 표기로 고정돼야 하니까) target이 같다.
  // 관계는 target으로만 참조하므로 셀렉트에 같은 이름이 두 번 뜨면 고르는 사람
  // 입장에서는 의미 없는 중복이다.
  const speakers = Array.from(
    new Map(
      sheet.terms.filter((t) => t.kind === 'person').map((t) => [t.target, t]),
    ).values(),
  );
  const maxBlock = Math.max(1, blockCount);

  /** 현재 값이 인물 목록에 없으면(유형이 바뀐 뒤 등) 그 값도 보여준다 —
   *  셀렉트가 빈칸으로 보이면 무엇이 잘못됐는지 알 수 없다. */
  const optionsFor = (current: string): GlossaryTerm[] =>
    speakers.some((t) => t.target === current)
      ? speakers
      : [...speakers, { source: current, target: current, kind: 'person' as const }];

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

  const addRelation = () => {
    if (speakers.length < 2) return;
    onChangeSheet({
      ...sheet,
      relations: [
        ...sheet.relations,
        {
          from: speakers[0].target,
          to: speakers[1].target,
          speech: 'formal',
          fromBlock: 1,
          toBlock: maxBlock,
        },
      ],
    });
  };

  return (
    <div>
      <p className='text-fineprint text-secondary mb-2'>{c.relationsNotice}</p>

      {/* 내레이션 문체는 관계가 아니라 작품 전체의 성질이라 표 위에 홀로 선다.
          번역 AI가 이 값을 그대로 따르므로 관계표와 같은 이유로 고칠 수 있어야
          한다 — 틀린 지정은 파일 전체의 어미를 바꾼다. */}
      <div className='flex items-center gap-2 mb-3'>
        <span className='text-fineprint text-secondary'>{c.narrationLabel}</span>
        <select
          className='input !py-1.5 !w-auto'
          aria-label={c.narrationLabel}
          value={sheet.narration}
          onChange={(e) =>
            onChangeSheet({
              ...sheet,
              narration: e.target.value as NarrationStyle,
            })
          }
        >
          {(Object.keys(c.narrations) as NarrationStyle[]).map((n) => (
            <option key={n} value={n}>
              {c.narrations[n]}
            </option>
          ))}
        </select>
      </div>

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
            {optionsFor(rel.from).map((t, ti) => (
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
            {optionsFor(rel.to).map((t, ti) => (
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

          {/* 구간이 이 기능의 핵심 아이디어다 — 관계가 도중에 바뀌면 항목을 둘로
              쪼개고, 각 청크는 자기 범위와 겹치는 항목만 본다. 표시만 하고 못
              고치면 모델이 경계를 잘못 잡았을 때 손쓸 방법이 없다. */}
          <span className='flex items-center gap-1'>
            <input
              type='number'
              className='input !py-1.5 !w-[68px] text-mono-step'
              aria-label={c.rangeFrom}
              min={1}
              max={rel.toBlock}
              value={rel.fromBlock}
              onChange={(e) =>
                updateRelation(i, {
                  fromBlock: clampBlock(e.target.value, rel.toBlock, 1),
                })
              }
            />
            <span className='text-secondary'>~</span>
            <input
              type='number'
              className='input !py-1.5 !w-[68px] text-mono-step'
              aria-label={c.rangeTo}
              min={rel.fromBlock}
              max={maxBlock}
              value={rel.toBlock}
              onChange={(e) =>
                updateRelation(i, {
                  toBlock: clampBlock(e.target.value, maxBlock, rel.fromBlock),
                })
              }
            />
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

      {speakers.length < 2 ? (
        <p className='text-fineprint text-secondary mt-1'>{c.needTwoPeople}</p>
      ) : (
        <button
          type='button'
          className='btn btn-ghost !py-1.5 !px-3 !text-fineprint mt-1'
          onClick={addRelation}
        >
          {c.addRelation}
        </button>
      )}
    </div>
  );
}
