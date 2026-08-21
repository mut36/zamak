import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  PRICING_TIERS,
  formatKRW,
  pricePerCredit,
  type PricingTier,
} from '../config/pricing';
import { COPY } from '../i18n/simpleCopy';

// 브랜드명은 붙이지 않는다 — 루트 layout의 `title.template`이 이미 붙인다.
export const metadata = {
  title: '가격',
  description: 'ZAMAK 번역권 가격. 라이트·프로 번역권, 유효기간 없음.',
  // Self-referencing — §6-16.
  alternates: { canonical: '/pricing' },
};

const P = COPY.pricing;

/**
 * 가격 안내.
 *
 * **파는 화면이 아니라 알리는 화면이다.** 결제 일체는 `feature/payments`에
 * 있고(§6-2), 여기엔 구매 버튼이 없다. 그런데도 main에 두는 이유는 PG 가맹점
 * 심사 때문이다 — 심사자가 상품·가격을 못 보면 심사가 진행되지 않는다
 * (§6-19 반려 후속). 결제를 열 때 `preparing` 자리에 구매 CTA가 들어온다.
 *
 * 정적 서버 컴포넌트다. 로그인 없이 읽혀야 하는 건 `/legal`과 같은 이유고,
 * 색인에도 들어가야 한다.
 */
export default function PricingPage() {
  return (
    <div>
      <div className='page-fold'>
        <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
          <Link href='/'>
            <BrandMark />
          </Link>
        </header>

        <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14 flex-1'>
          <div className='head'>
            <h1>{P.title}</h1>
            <p>{P.sub}</p>
          </div>

          {PRICING_TIERS.map((tier) => (
            <TierBlock key={tier.id} tier={tier} />
          ))}

          <div className='card p-5 mt-10 text-caption text-nav leading-relaxed'>
            <p className='m-0 text-ink-strong font-bold'>{P.preparing}</p>
            <p className='mt-2'>{P.preparingNote}</p>
          </div>

          <p className='mt-6 text-caption text-secondary'>{P.betaNote}</p>

          <p className='mt-2 flex items-center gap-2.5 text-caption text-secondary'>
            <span>{P.vatNote}</span>
            <span className='dot-sep' />
            <Link href={`${COPY.legal.termsHref}#payment`} className='underline'>
              {P.refundLink}
            </Link>
          </p>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

/**
 * 티어 하나(라이트/프로) + 팩 3개.
 *
 * 이름·설명은 `COPY.plans`에서 온다 — 랜딩 비교 섹션·설정 화면과 같은 문구를
 * 써야 "같은 상품"으로 읽힌다.
 */
function TierBlock({ tier }: { tier: PricingTier }) {
  const plan = COPY.plans[tier.id];

  return (
    <section className='mt-10'>
      <h2 className='text-body-lg font-bold text-ink-strong mb-1'>
        {plan.name}
      </h2>
      <p className='text-caption text-nav m-0'>{plan.quality}</p>

      <div className='pricing-grid'>
        {tier.packs.map((pack) => (
          <div key={pack.id} className='card pricing-pack'>
            {pack.badge && <span className='pricing-badge'>{pack.badge}</span>}
            <p className='pricing-pack-credits'>{P.creditUnit(pack.credits)}</p>
            <p className='pricing-pack-amount'>{P.won(formatKRW(pack.amount))}</p>
            <p className='pricing-pack-unit'>
              {P.perCredit(formatKRW(pricePerCredit(pack)))}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
