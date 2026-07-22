import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { CREDIT_PACKS } from '../config/packs';
import { MAX_BLOCKS_PER_CREDIT } from '../config/constants';

export const metadata = {
  title: '이용 · 환불 안내 | ZAMAK',
  description: 'ZAMAK 번역권 구매, 환불, 사업자 정보 안내',
};

/**
 * Required alongside payments, not optional polish: Korean e-commerce law
 * (전자상거래법) requires the seller's identity and the refund terms to be
 * readable before purchase, and card acquirers check for this page during the
 * Toss Payments merchant review.
 *
 * SELLER_INFO is unfilled on purpose — these are facts about the business, not
 * decisions the code can make. Payments must not go live until it is filled in.
 */
const SELLER_INFO: { label: string; value: string }[] = [
  { label: '상호', value: 'TODO — 사업자등록증상 상호' },
  { label: '대표자', value: 'TODO' },
  { label: '사업자등록번호', value: 'TODO' },
  { label: '통신판매업 신고번호', value: 'TODO' },
  { label: '사업장 주소', value: 'TODO' },
  { label: '고객문의', value: 'TODO — 이메일 주소' },
  { label: '호스팅 제공', value: 'Vercel Inc.' },
  { label: '결제대행', value: '토스페이먼츠(주)' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='mt-10'>
      <h2 className='text-[17px] font-bold text-ink mb-3'>{title}</h2>
      <div className='text-[13.5px] text-ink-2 leading-relaxed'>{children}</div>
    </section>
  );
}

export default function LegalPage() {
  return (
    <div className='min-h-screen'>
      <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
        <Link href='/'>
          <BrandMark />
        </Link>
      </header>

      <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
        <div className='head'>
          <h1>이용 · 환불 안내</h1>
          <p>번역권 구매 전에 확인해주세요.</p>
        </div>

        <Section title='판매하는 것'>
          <p className='m-0'>
            ZAMAK은 SRT 자막 파일을 번역해주는 서비스이고, 판매하는 상품은
            선불 번역권입니다. 번역권 1편으로 자막{' '}
            {MAX_BLOCKS_PER_CREDIT.toLocaleString()}줄까지의 파일 하나를
            번역할 수 있습니다.
          </p>
          <ul className='mt-3 pl-4'>
            {CREDIT_PACKS.map((pack) => (
              <li key={pack.id}>
                번역권 {pack.credits}편 — {pack.amount.toLocaleString()}원 (부가세 포함)
              </li>
            ))}
          </ul>
          <p>번역권에는 유효기간이 없습니다.</p>
        </Section>

        <Section title='환불'>
          <p className='m-0'>
            <b>사용하지 않은 번역권은 전액 환불됩니다.</b> 이미 사용한 번역권은
            결과물(번역된 자막 파일)이 즉시 제공되므로 환불되지 않습니다. 예를
            들어 10편을 구매하고 2편을 사용했다면 8편분이 환불 대상입니다.
          </p>
          <p>
            환불은 아래 고객문의로 요청해주세요. 결제하신 수단으로 영업일 기준
            3일 이내에 처리됩니다. 카드 결제의 경우 카드사 사정에 따라 취소
            반영까지 며칠이 더 걸릴 수 있습니다.
          </p>
          <p>
            번역이 서비스 오류로 실패했는데 번역권이 차감된 경우에도 같은
            경로로 알려주세요. 사용 여부와 무관하게 복구해 드립니다.
          </p>
        </Section>

        <Section title='업로드하는 자막에 대해'>
          <p className='m-0'>
            업로드하는 파일에 대한 권리는 이용자에게 있습니다. 권리가 없는
            콘텐츠는 업로드하지 말아주세요. 업로드된 자막은 번역에만 쓰이며,
            번역이 끝나면 서버에 보관하지 않습니다.
          </p>
        </Section>

        <Section title='사업자 정보'>
          <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0'>
            {SELLER_INFO.map((row) => (
              <div key={row.label} className='contents'>
                <dt className='text-ink-3'>{row.label}</dt>
                <dd className='m-0'>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className='mt-10'>
          <Link href='/' className='text-[13px] text-ink-3 underline'>
            돌아가기
          </Link>
        </p>
      </main>
    </div>
  );
}
