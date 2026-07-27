import Link from 'next/link';
import { COPY } from '../../i18n/simpleCopy';
import { Contents, KeyPoint, LegalShell, Section } from '../parts';

export const metadata = {
  title: '개인정보처리방침 | ZAMAK',
  description:
    'ZAMAK이 수집하는 개인정보, 이용 목적, 보관 기간, 처리위탁과 국외 이전 안내',
};

/**
 * Legally mandatory, not a nicety: 개인정보보호법 제30조 requires any service
 * that collects personal data to publish a processing policy, and Google OAuth
 * means an email address is collected from the first sign-in. 제28조의8 then
 * requires the overseas-transfer disclosure, because every processor below is
 * US-based.
 *
 * OFFICER is unfilled for the same reason SELLER_INFO in ../page.tsx is — the
 * law wants a named human, which is a business fact, not a code decision.
 */
const OFFICER: { label: string; value: string }[] = [
  { label: '개인정보 보호책임자', value: 'TODO — 성명' },
  { label: '직책', value: 'TODO' },
  { label: '문의', value: COPY.footer.feedbackEmail },
];

/** Every processor is US-based, which is what makes 제28조의8 apply. */
const PROCESSORS: { name: string; country: string; purpose: string }[] = [
  {
    name: 'Supabase Inc.',
    country: '미국',
    purpose: '계정 인증, 번역권·결제 기록 보관',
  },
  { name: 'Vercel Inc.', country: '미국', purpose: '서비스 호스팅' },
  {
    name: 'Google LLC',
    country: '미국',
    purpose: '로그인 인증, 자막 번역(Gemini API)',
  },
  {
    name: '토스페이먼츠(주)',
    country: '대한민국',
    purpose: '번역권 결제 처리',
  },
];

const COLLECTED: { kind: string; items: string; how: string }[] = [
  {
    kind: '계정',
    items: '이메일 주소, 이름, 프로필 이미지',
    how: 'Google 계정으로 로그인할 때 Google로부터 전달받음',
  },
  {
    kind: '이용 기록',
    items: '번역한 자막의 줄 수, 번역 시각',
    how: '번역권을 사용할 때 자동 기록',
  },
  {
    kind: '결제',
    items: '주문번호, 상품명, 결제 금액, 결제수단, 결제 시각, 영수증 링크',
    how: '번역권을 구매할 때 기록',
  },
];

const CONTENTS = [
  { id: 'collect', label: '수집하는 정보' },
  { id: 'purpose', label: '이용 목적' },
  { id: 'retention', label: '보관 기간' },
  { id: 'processors', label: '처리위탁과 국외 이전' },
  { id: 'rights', label: '이용자의 권리' },
  { id: 'security', label: '안전성 확보 조치' },
  { id: 'officer', label: '보호책임자와 문의' },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title='개인정보처리방침'
      subtitle='ZAMAK이 어떤 정보를 받고, 어디에 쓰고, 얼마나 보관하는지 정리했습니다.'
      effectiveDate='2026년 7월 27일'
      otherDoc={{ href: COPY.legal.termsHref, label: COPY.legal.terms }}
    >
      <Contents items={CONTENTS} />

      <KeyPoint>
        <b className='text-ink'>
          올리신 자막 파일의 내용은 수집하지도, 저장하지도 않습니다.
        </b>{' '}
        파일은 브라우저에서 열려 번역되는 동안에만 서버를 거쳐 가고, 결과물은
        이용자의 브라우저에만 남습니다. 아래에 적힌 것은 계정을 만들고 번역권을
        지급·차감하는 데 필요한 정보입니다.
      </KeyPoint>

      <Section title='수집하는 정보' id='collect'>
        <dl className='grid gap-4 m-0'>
          {COLLECTED.map((row) => (
            <div key={row.kind}>
              <dt className='font-bold text-ink'>{row.kind}</dt>
              <dd className='m-0 mt-0.5'>
                {row.items}
                <span className='block text-ink-3 text-[12.5px] mt-0.5'>
                  {row.how}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-4'>
          카드번호 등 결제수단 정보는 토스페이먼츠(주)가 처리하며 ZAMAK은
          전달받지도, 저장하지도 않습니다.
        </p>
        <p>
          영화·드라마를 번역할 때 작품 정보를 불러오기 위해 이용자가 입력한 작품
          제목이 TMDB와 Google 검색으로 전달됩니다. 이 요청에는 개인정보가 포함되지
          않습니다.
        </p>
      </Section>

      <Section title='이용 목적' id='purpose'>
        <ul className='m-0 pl-4'>
          <li>로그인과 이용자 식별</li>
          <li>번역권 지급, 차감, 잔액 확인</li>
          <li>번역권 구매와 환불 처리</li>
          <li>오류 대응과 고객 문의 응대</li>
        </ul>
        <p className='mt-3'>
          수집한 정보를 광고나 마케팅에 사용하지 않으며, 위 목적 외로 이용하거나
          제3자에게 판매하지 않습니다.
        </p>
      </Section>

      <Section title='보관 기간' id='retention'>
        <ul className='m-0 pl-4'>
          <li>
            <b>자막 파일과 번역 결과물</b> — 저장하지 않음
          </li>
          <li>
            <b>계정 정보</b> — 회원 탈퇴 시까지
          </li>
          <li>
            <b>번역권 사용 기록</b> — 회원 탈퇴 시까지
          </li>
          <li>
            <b>결제·거래 기록</b> — 전자상거래법에 따라 대금 결제 및 재화 공급
            기록은 5년, 소비자 불만 및 분쟁 처리 기록은 3년
          </li>
        </ul>
        <p className='mt-3'>
          보관 기간이 지난 정보는 지체 없이 파기합니다.
        </p>
      </Section>

      <Section title='처리위탁과 국외 이전' id='processors'>
        <p className='m-0'>
          서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁하고 있습니다.
          미국에 소재한 업체로는 서비스를 이용하는 동안 네트워크를 통해 정보가
          이전됩니다.
        </p>
        <dl className='grid gap-3 m-0 mt-4'>
          {PROCESSORS.map((p) => (
            <div key={p.name}>
              <dt className='font-bold text-ink'>
                {p.name}
                <span className='ml-2 font-normal text-ink-3 text-[12.5px]'>
                  {p.country}
                </span>
              </dt>
              <dd className='m-0 mt-0.5'>{p.purpose}</dd>
            </div>
          ))}
        </dl>
        <p className='mt-4'>
          이전되는 항목은 위 &lsquo;수집하는 정보&rsquo;와 같고, 자막의 대사는
          번역을 수행하는 Google LLC로 전송됩니다. ZAMAK이 사용하는 유료 API는
          전송된 내용을 모델 학습에 사용하지 않습니다.
        </p>
        <p>
          국외 이전을 거부하실 수 있으나, 이 경우 로그인과 번역을 포함한 서비스
          이용이 불가능합니다.
        </p>
      </Section>

      <Section title='이용자의 권리' id='rights'>
        <p className='m-0'>
          이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를
          요구할 수 있습니다. 아래 문의처로 알려주시면 지체 없이 처리합니다.
        </p>
        <p>
          회원 탈퇴를 요청하시면 계정 정보와 이용 기록을 삭제합니다. 다만 위
          &lsquo;보관 기간&rsquo;에 적힌 법령상 보관 의무가 있는 결제·거래 기록은
          해당 기간 동안 분리 보관합니다.
        </p>
      </Section>

      <Section title='안전성 확보 조치' id='security'>
        <ul className='m-0 pl-4'>
          <li>모든 통신은 HTTPS로 암호화됩니다.</li>
          <li>
            데이터베이스에 행 수준 보안(RLS)을 적용해, 이용자는 자신의 기록만 조회할
            수 있고 잔액과 결제 기록은 클라이언트에서 수정할 수 없습니다.
          </li>
          <li>
            자막 내용을 아예 보관하지 않아, 유출될 수 있는 정보의 범위 자체를
            줄였습니다.
          </li>
        </ul>
      </Section>

      <Section title='보호책임자와 문의' id='officer'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0'>
          {OFFICER.map((row) => (
            <div key={row.label} className='contents'>
              <dt className='text-ink-3'>{row.label}</dt>
              <dd className='m-0'>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className='mt-4'>
          개인정보 침해로 도움이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr,
          국번없이 118)에 문의하실 수 있습니다.
        </p>
        <p>
          이 방침이 변경되면 시행일 7일 전부터 이 페이지에 공지합니다. 사업자
          정보와 환불 기준은{' '}
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.terms}
          </Link>
          에 있습니다.
        </p>
      </Section>
    </LegalShell>
  );
}
