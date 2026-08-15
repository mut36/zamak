'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { COPY } from '../../i18n/simpleCopy';

const L = COPY.landing;
const D = L.howDemo;
const PLANS = COPY.plans;

/** 진행 바가 도는 시간. 실제 번역(약 15초)의 축약이지 실측값이 아니다. */
const RUN_MS = 1600;
/** 이 거리를 넘게 움직이면 탭이 아니라 드래그로 친다. */
const DRAG_SLOP_PX = 6;

/**
 * `how.steps`의 4단계와 1:1로 맞물리는 상태. 'running'은 4단계(다운로드)의
 * 앞부분이라 스테퍼에서는 마지막 단계로 함께 묶인다.
 */
type Stage = 'drop' | 'work' | 'quality' | 'running' | 'done';

const STAGE_STEP: Record<Stage, number> = {
  drop: 0,
  work: 1,
  quality: 2,
  running: 3,
  done: 3,
};

/**
 * 비교 섹션이 파는 ZAMAK 번역을 데모 결과로 다시 쓴다. 여기서 따로 지어내면
 * 같은 페이지가 서로 다른 "우리 번역"을 두 번 파는 꼴이 되고, CPS 숫자가
 * 조용히 갈라진다(`simpleCopy.test.ts`가 이 재사용을 대조한다). 두 카드 모두
 * 연속 2줄짜리 예시인데 데모 화면은 한 줄만 보여주므로 첫 줄만 가져온다.
 */
const ZAMAK_ENGINE = L.compare.engines[L.compare.engines.length - 1]!;
const RESULT_SRC = L.compare.sourceLine.split('\n')[0]!;
const RESULT_KO = ZAMAK_ENGINE.out.split('\n')[0]!;
const RESULT_TAG = ZAMAK_ENGINE.tags[0]!.label;

/**
 * 미디어 쿼리를 구독한다. `useEffect` + `setState`로 읽으면 첫 렌더가 항상
 * 틀린 값으로 한 번 그려지고(그래서 lint가 막는다), 사용자가 도중에 설정을
 * 바꿔도 따라가지 못한다. SSR 스냅샷은 `false` — 서버에는 화면이 없다.
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const mq = window.matchMedia(query);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      },
      [query]
    ),
    () => window.matchMedia(query).matches,
    () => false
  );
}

interface Props {
  onSignIn: () => void;
  configured: boolean;
}

export function HowItWorksDemo({ onSignIn, configured }: Props) {
  const [stage, setStage] = useState<Stage>('drop');
  const [quality, setQuality] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  // 드래그 중인 칩의 이동량. null이면 제자리(스프링백 transition이 붙는다).
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [hot, setHot] = useState(false);

  // 터치 기기에는 "끌어다 놓기" 대신 "눌러서" 안내를 단다 — 안내와 실제로
  // 되는 동작이 어긋나면 데모가 고장 난 것처럼 보인다.
  const coarse = useMediaQuery('(pointer: coarse)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');

  const dropRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  /** 이번 포인터 제스처가 드래그였나 — 뒤따르는 click을 삼킬지 판단한다. */
  const movedRef = useRef(false);

  // 진행 바. 모션 최소화 설정에서는 'running'에 아예 들르지 않으므로
  // (품질 선택이 바로 'done'으로 보낸다) 여기서 따로 분기하지 않는다.
  useEffect(() => {
    if (stage !== 'running') return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / RUN_MS);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setStage('done');
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const isOverDrop = (x: number, y: number) => {
    const r = dropRef.current?.getBoundingClientRect();
    if (!r) return false;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const accept = useCallback(() => setStage('work'), []);

  // 드래그는 HTML5 DnD가 아니라 포인터 이벤트로 만든다 — dragstart/drop은
  // 터치에서 아예 발화하지 않아 모바일에서 데모가 죽는다. 포인터 이벤트는
  // 마우스·터치·펜을 같은 코드로 받는다.
  const onPointerDown = (e: React.PointerEvent) => {
    if (stage !== 'drop') return;
    chipRef.current?.setPointerCapture(e.pointerId);
    originRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    setDrag({ x: 0, y: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const o = originRef.current;
    if (!o) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (Math.hypot(dx, dy) > DRAG_SLOP_PX) movedRef.current = true;
    setDrag({ x: dx, y: dy });
    setHot(isOverDrop(e.clientX, e.clientY));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!originRef.current) return;
    originRef.current = null;
    const over = isOverDrop(e.clientX, e.clientY);
    setDrag(null);
    setHot(false);
    if (over) accept();
    // click은 pointerup 바로 뒤에 따라온다. 드래그였다면 그 click을 삼켜야
    // 하는데, 플래그를 지금 지우면 삼킬 수가 없다 — 한 틱 뒤에 되돌려서
    // 다음 키보드 Enter가 스스로 막히지 않게 한다.
    setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  // 탭과 키보드(Enter/Space)가 도착하는 곳. 드래그의 꼬리 click만 걸러낸다.
  const onChipClick = () => {
    if (movedRef.current || stage !== 'drop') return;
    accept();
  };

  const restart = () => {
    setStage('drop');
    setQuality(null);
    setProgress(0);
    setDrag(null);
    setHot(false);
  };

  const activeStep = STAGE_STEP[stage];
  const runStage =
    D.progress.stages[
      Math.min(
        D.progress.stages.length - 1,
        Math.floor(progress * D.progress.stages.length)
      )
    ];

  return (
    <div className='lp-demo' role='group' aria-label={D.label}>
      {/* 왼쪽: 4단계 설명. 데모를 만지지 않는 방문자에게도 섹션이 읽혀야 하고,
          검색엔진이 보는 것도 이쪽이다. */}
      <ol className='lp-demo-steps'>
        {L.how.steps.map((s, i) => (
          <li
            key={s.num}
            className={`lp-demo-step${i === activeStep ? ' is-on' : ''}${
              i < activeStep ? ' is-done' : ''
            }`}
            aria-current={i === activeStep ? 'step' : undefined}
          >
            <span className='lp-demo-step-num' aria-hidden>
              {s.num}
            </span>
            {/* 여기만 `.lp-fit`을 쓰지 않는다 — 스테퍼 열은 290px 남짓이라
                카피의 한 줄(≈34em)이 들어가는 글자 크기가 아예 없다. 억지로
                맞추면 하한(11.5px)까지 작아지고도 결국 접혀서, 작아지기만
                하고 얻는 게 없다. 이 설명은 보조 문구이므로 그냥 흘린다. */}
            <div>
              <div className='lp-demo-step-title'>{s.title}</div>
              <p className='lp-demo-step-desc'>{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* 오른쪽: 실제로 만지는 화면. 단계마다 내용이 통째로 갈리므로 높이를
          고정해 둔다 — 안 그러면 단계를 넘길 때마다 페이지가 뛴다
          (히어로 카드와 같은 이유, `docs/decisions.md` §1-20). */}
      <div className='lp-demo-stage' aria-live='polite'>
        {stage === 'drop' && (
          <div className='lp-demo-drop-wrap'>
            <button
              ref={chipRef}
              type='button'
              className={`lp-demo-file${drag ? ' is-dragging' : ''}${
                reduced ? '' : ' lp-demo-file-hint'
              }`}
              style={
                drag
                  ? { transform: `translate(${drag.x}px, ${drag.y}px)` }
                  : undefined
              }
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClick={onChipClick}
            >
              <span className='lp-demo-file-name'>{D.file.name}</span>
              <span className='lp-demo-file-meta'>{D.file.meta}</span>
            </button>

            <div
              ref={dropRef}
              className={`lp-demo-drop${hot ? ' is-hot' : ''}`}
              aria-hidden
            >
              <span className='lp-demo-drop-label'>
                {hot ? D.dropActive : D.dropLabel}
              </span>
              <span className='lp-demo-drop-hint'>
                {coarse ? D.tapHint : D.dragHint}
              </span>
            </div>
          </div>
        )}

        {stage === 'work' && (
          <div className='lp-demo-panel'>
            <span className='lp-demo-q'>{D.work.question}</span>
            <div className='lp-demo-work'>
              {/* 포스터 이미지는 두지 않는다 — 외부 자산 없이 도는 랜딩이고,
                  실제 화면의 "포스터 없음" 자리와 같은 모양이다. */}
              <div className='lp-demo-poster' aria-hidden />
              <div>
                <div className='lp-demo-work-title'>{D.work.title}</div>
                <div className='lp-demo-work-meta'>{D.work.meta}</div>
              </div>
            </div>
            <button
              type='button'
              className='lp-demo-action'
              onClick={() => setStage('quality')}
            >
              {D.work.yes}
            </button>
          </div>
        )}

        {stage === 'quality' && (
          <div className='lp-demo-panel'>
            <span className='lp-demo-q'>{D.quality.question}</span>
            {/* 이름·소요 시간은 비교표(`COPY.plans`)에서 그대로 읽는다. */}
            <div className='lp-demo-plans'>
              {[PLANS.lite, PLANS.pro].map((plan, i) => (
                <button
                  key={plan.name}
                  type='button'
                  className={`lp-demo-plan${quality === i ? ' is-on' : ''}`}
                  onClick={() => {
                    setQuality(i);
                    setStage(reduced ? 'done' : 'running');
                  }}
                >
                  <span className='lp-demo-plan-name'>{plan.name}</span>
                  <span className='lp-demo-plan-time'>{plan.time}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === 'running' && (
          <div className='lp-demo-panel lp-demo-run'>
            <span className='lp-demo-q'>{D.progress.label}</span>
            <div className='lp-demo-track'>
              <div
                className='lp-demo-fill'
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className='lp-demo-runstage mono'>{runStage}</span>
          </div>
        )}

        {stage === 'done' && (
          <div className='lp-demo-panel'>
            <span className='lp-demo-q'>{D.done.label}</span>
            <div className='lp-demo-result'>
              <div className='lp-demo-result-tc mono'>{D.done.tc}</div>
              <div className='lp-demo-result-src'>{RESULT_SRC}</div>
              <div className='lp-demo-result-ko'>{RESULT_KO}</div>
              <span className='lp-tag lp-tag-green'>{RESULT_TAG}</span>
            </div>
            <div className='lp-demo-done-actions'>
              <button
                type='button'
                data-cta='how-demo'
                disabled={!configured}
                className='lp-demo-action'
                onClick={onSignIn}
              >
                {D.done.download}
              </button>
              <button
                type='button'
                className='lp-demo-restart'
                onClick={restart}
              >
                {D.done.restart}
              </button>
            </div>
            <p className='lp-demo-note'>{D.done.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
