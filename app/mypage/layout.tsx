import type { Metadata } from 'next';

/**
 * `page.tsx`는 `'use client'`라 `metadata`를 직접 못 내보낸다. 제목만 주려고
 * 두는 서버 레이아웃 — 없으면 탭에 사이트 기본 제목이 그대로 떠서, 번역 탭과
 * 마이페이지 탭을 같이 열어둔 사람이 둘을 구분할 수 없다.
 *
 * 로그인 뒤 화면이므로 색인 대상이 아니다.
 */
export const metadata: Metadata = {
  title: '마이페이지',
  robots: { index: false, follow: false },
};

export default function MyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
