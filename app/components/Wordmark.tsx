import { COPY } from '../i18n/simpleCopy';

/**
 * 워드마크 — 마지막 마침표만 옐로("문장을 완성한다").
 *
 * 랜딩 nav/푸터와 전역 `SiteFooter`가 함께 쓴다. 서버 컴포넌트로 둔다:
 * `SiteFooter`가 정적 페이지(`/legal/*`)에도 들어가기 때문이다.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      {COPY.landing.wordmark}
      <span style={{ color: 'var(--accent)' }}>.</span>
    </span>
  );
}
