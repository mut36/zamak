'use client';

import { useEffect, useRef, useState } from 'react';
import { catchupValue, easeToward } from '../lib/easing';

/** done 스냅의 이징 시간 — τ≈150ms가 되도록 3τ로 준다. */
const SNAP_MS = 450;

/** 스냅이 이 위로 오면 100으로 붙인다. 이징은 천장에 닿지 못하므로,
 *  바가 실제로 가득 차려면 마지막 한 뼘은 명시적으로 채워야 한다. */
const SNAP_CLAMP_AT = 99.5;

/** floor가 뛸 때 따라붙는 시간. 점프를 눈에 보이는 이동으로 바꾼다. */
const CATCHUP_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 진행 바가 그릴 퍼센트.
 *
 *   값 = max( floor를 향한 캐치업, 밴드 끝을 향한 이징 )
 *
 * 이징이 없으면 바는 계단으로 튄다. Pro는 특히 나쁘다 — 청크 5개가 한 웨이브로
 * 동시 실행돼서 142초 동안 착지 이벤트가 0건이고, 바가 밴드 바닥에 멈춰 있다.
 * 반대로 이징만 쓰면 실제 진행을 앞질러 거짓말이 된다. 둘의 max가 답이다:
 * 이징은 밴드 끝에 **도달하지 못하므로** 앞지를 수 없고, 실제 착지는 언제든
 * 바닥을 밀어올릴 수 있다.
 *
 * floor를 **즉시** 반영하지 않는 게 v2에서 바뀐 점이다. 착지가 한 웨이브로
 * 몰리면 floor가 한 번에 뛰는데, 그대로 그리면 바가 점프한다. `catchupValue`가
 * CATCHUP_MS에 걸쳐 미끄러뜨린다.
 *
 * 값은 단조 증가한다 — 밴드가 바뀌어도 뒤로 가지 않는다.
 */
export function useEasedProgress(input: {
  /** 실제 진행에서 온 바닥 (overallPercent). */
  floor: number;
  /** 점근 천장 — 현재 활성 밴드의 끝. */
  bandEnd: number;
  /** 이 밴드를 지나는 데 걸릴 추정 시간. */
  expectedMs: number;
  /** 번역이 끝났다 — 100%까지 빠르게 당긴다. */
  snap?: boolean;
}): number {
  const { floor, bandEnd, expectedMs, snap = false } = input;
  const [value, setValue] = useState(floor);
  /** 단조성 보장용. 렌더 사이에 살아남아야 해서 ref다. */
  const highWater = useRef(floor);
  /** 이징의 기준점. */
  const anchor = useRef<{ at: number; from: number }>({ at: 0, from: floor });
  /** floor 캐치업의 기준점. */
  const catchup = useRef<{ at: number; from: number; to: number }>({
    at: 0,
    from: floor,
    to: floor,
  });

  // expectedMs는 일부러 뺐다 — 실측 보정으로 남은 시간 추정이 바뀔 때마다
  // (useTranslation의 onCompleted) 이징 속도만 바뀌어야지, 위치가 되감기며
  // 버벅이면 안 된다. eslint-plugin-react-hooks의 exhaustive-deps 자동수정이
  // 이 줄을 "고치면" 그 버벅임이 조용히 되살아난다.
  useEffect(() => {
    // from에 floor를 섞지 않는다 — 섞으면 floor 점프가 이징 기준점을 통해
    // 그대로 튀어 올라와 캐치업이 무의미해진다. highWater는 이미 그려진
    // 값이라 여기가 정확한 출발점이다.
    anchor.current = { at: performance.now(), from: highWater.current };
  }, [floor, bandEnd, snap]);

  useEffect(() => {
    catchup.current = {
      at: performance.now(),
      from: highWater.current,
      to: floor,
    };
  }, [floor]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // 모션을 줄여달라고 한 사용자에겐 계단이 정답이다 — 실제 값만 그린다.
      const next = Math.max(highWater.current, snap ? 100 : floor);
      highWater.current = next;
      setValue(next);
      return;
    }

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const { at, from } = anchor.current;
      const c = catchup.current;
      let next = Math.max(
        highWater.current,
        catchupValue(c.from, c.to, now - c.at, CATCHUP_MS),
        easeToward(
          from,
          snap ? 100 : bandEnd,
          now - at,
          snap ? SNAP_MS : expectedMs,
        ),
      );
      if (snap && next > SNAP_CLAMP_AT) next = 100;
      highWater.current = next;
      setValue(next);
      if (!(snap && next >= 100)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floor, bandEnd, expectedMs, snap]);

  return value;
}
