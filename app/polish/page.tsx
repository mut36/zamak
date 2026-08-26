'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '../components/beta/AppNav';
import { SiteFooter } from '../components/SiteFooter';
import { PolishUploadStep } from '../components/polish/PolishUploadStep';
import { PolishDoneStep } from '../components/polish/PolishDoneStep';
import { usePolish } from '../hooks/usePolish';
import { useAuth } from '../hooks/useAuth';

export default function PolishPage() {
  const router = useRouter();
  const { user, credits, loading: authLoading } = useAuth();
  const {
    stage,
    error,
    summary,
    downloads,
    language,
    handleFile,
    reapply,
    reset,
  } = usePolish();

  // `/`는 비로그인에게 랜딩을 보여주는 것으로 게이트를 대신하지만, 이 라우트는
  // 그 밖에 있다. 서버 키를 쓰는 화면이므로 자체적으로 돌려보낸다.
  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <div className='min-h-screen' aria-busy='true' />;
  }

  return (
    <div>
      <div className='page-fold'>
        <AppNav credits={credits} onHome={() => router.push('/')} />

        <main className='w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-20 flex-1'>
          {stage === 'done' && summary ? (
            <PolishDoneStep
              summary={summary}
              downloads={downloads}
              language={language}
              onReapply={reapply}
              onStartOver={reset}
            />
          ) : (
            <PolishUploadStep
              working={stage === 'working'}
              error={error}
              onFile={handleFile}
            />
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
