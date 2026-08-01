'use client';

import { useEffect, useRef } from 'react';

/**
 * 스크롤 리빌 — 반환한 ref를 붙인 컨테이너 안에서 `.reveal` 요소를 찾아,
 * 뷰포트 안으로 들어오면 `.is-visible`을 붙인다. 등장 값(16px 상승 / 0.55s)은
 * 전부 `globals.css`의 `.reveal`이 갖고 있고, 이 훅은 스위치만 담당한다.
 *
 * 한 번 드러난 요소는 관찰을 끊는다 — 스크롤을 되돌릴 때마다 되감기 재생이
 * 일어나면 읽는 데 방해가 된다.
 */
export function useScrollReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));

    // 모션 최소화 설정이거나 IntersectionObserver가 없으면 관찰기를 아예 걸지
    // 않고 즉시 드러낸다 — 어느 쪽이든 콘텐츠가 숨은 채로 남아선 안 된다.
    // (`.reveal`의 opacity:0을 CSS도 되돌리지만, 여기서도 끊어 두면 관찰기가
    //  헛돌지 않는다.)
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      // 비율 threshold 대신 rootMargin으로 "화면 아래 12%까지 들어왔을 때"를
      // 잰다 — 뷰포트보다 큰 블록은 비율 threshold에 영영 도달하지 못할 수 있다.
      { rootMargin: '0px 0px -12% 0px' }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}
