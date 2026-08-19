import Link from 'next/link';
import { RESULT_RETENTION_DAYS } from '../../config/constants';
import { COPY } from '../../i18n/simpleCopy';
import { Contents, KeyPoint, LegalShell, Section } from '../parts';

// 브랜드명은 붙이지 않는다 — 루트 layout의 `title.template`이 이미 붙인다
// (`app/legal/page.tsx`의 같은 주석 참고).
export const metadata = {
  title: '개인정보처리방침',
  description:
    'ZAMAK이 수집하는 개인정보, 이용 목적, 보관 기간, 처리위탁과 국외 이전 안내',
  // Self-referencing — see the note in app/page.tsx.
  alternates: { canonical: '/legal/privacy' },
};

/**
 * Legally mandatory, not a nicety: 개인정보보호법 제30조 requires any service
 * that collects personal data to publish a processing policy, and Google OAuth
 * means an email address is collected from the first sign-in. 제28조의8 then
 * requires the overseas-transfer disclosure, because every processor below is
 * US-based.
 */
const OFFICER: { label: string; value: string }[] = [
  { label: '개인정보 보호책임자', value: '이지안' },
  { label: '직책', value: '대표' },
  { label: '문의', value: COPY.footer.feedbackEmail },
];

/** Every processor is US-based, which is what makes 제28조의8 apply. */
const PROCESSORS: { name: string; country: string; purpose: string }[] = [
  {
    name: 'Supabase Inc.',
    country: '미국',
    purpose: '계정 인증, 번역권 기록 보관, 번역 결과물 보관',
  },
  { name: 'Vercel Inc.', country: '미국', purpose: '서비스 호스팅' },
  {
    name: 'Google LLC',
    country: '미국',
    purpose: '로그인 인증, 자막 번역(Gemini API)',
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
    items: '번역한 자막의 줄 수, 번역 시각, 올린 파일의 이름, 사용한 번역 모델과 설정(글로사리 등)',
    how: '번역권을 사용할 때 자동 기록',
  },
  {
    kind: '번역 결과물',
    items: '완성된 번역 자막 파일',
    how: '번역이 끝날 때 저장 — 원본 자막은 저장하지 않습니다',
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
      effectiveDate='2026년 8월 1일'
      otherDoc={{ href: COPY.legal.termsHref, label: COPY.legal.terms }}
    >
      <Contents items={CONTENTS} />

      <KeyPoint>
        <b className='text-ink-strong'>올리신 자막 원본은 저장하지 않습니다.</b> 원본의 내용은
        브라우저에서 열려 번역되는 동안에만 서버를 거쳐 가고, 어디에도 기록되지
        않습니다. 다만 <b className='text-ink-strong'>완성된 번역 결과물</b>은 나중에 다시
        받으실 수 있도록, 본인만 접근할 수 있는 비공개 저장소에 {RESULT_RETENTION_DAYS}
        일간 보관합니다.
      </KeyPoint>

      <Section title='수집하는 정보' id='collect'>
        <dl className='grid gap-4 m-0'>
          {COLLECTED.map((row) => (
            <div key={row.kind}>
              <dt className='font-bold text-ink-strong'>{row.kind}</dt>
              <dd className='m-0 mt-0.5'>
                {row.items}
                <span className='block text-secondary text-caption-sm mt-0.5'>
                  {row.how}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-4'>
          영화·드라마를 번역할 때 작품 정보를 불러오기 위해 이용자가 입력한 작품
          제목이 TMDB와 Google 검색으로 전달됩니다. 이 요청에는 개인정보가 포함되지
          않습니다.
        </p>
      </Section>

      <Section title='이용 목적' id='purpose'>
        <ul className='m-0 pl-4'>
          <li>로그인과 이용자 식별</li>
          <li>번역권 지급, 차감, 잔액 확인</li>
          <li>번역 기록 표시와 완성된 결과물 다시 받기</li>
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
            <b>업로드한 자막 원본</b> — 저장하지 않음
          </li>
          <li>
            <b>번역 결과물</b> — {RESULT_RETENTION_DAYS}일. 기간이 지나면 다시
            받으실 수 없습니다.
          </li>
          <li>
            <b>계정 정보</b> — 회원 탈퇴 시까지
          </li>
          <li>
            <b>번역권 사용 기록</b> — 회원 탈퇴 시까지
          </li>
        </ul>
        <p className='mt-3'>
          번역 결과물은 이용자별로 분리된 <b>비공개 저장소</b>에 보관됩니다. 검색
          엔진에 노출되지 않고, 다시 받으실 때마다 유효기간이 5분인 한시적 주소가
          발급되며, 본인 외에는 열람하지 않습니다.
        </p>
        <p>
          결과물의 삭제를 원하시면 아래 문의처로 요청해주세요. 요청하시거나 회원
          탈퇴하시면 지체 없이 삭제합니다. 번역 결과물을 제외한 나머지 정보는
          보관 기간이 지나면 지체 없이 파기합니다.
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
              <dt className='font-bold text-ink-strong'>
                {p.name}
                <span className='ml-2 font-normal text-secondary text-caption-sm'>
                  {p.country}
                </span>
              </dt>
              <dd className='m-0 mt-0.5'>{p.purpose}</dd>
            </div>
          ))}
        </dl>
        <p className='mt-4'>
          이전되는 항목은 위 &lsquo;수집하는 정보&rsquo;와 같습니다. 번역 결과물은
          Supabase Inc.가 운영하는 저장소에 보관되고, 자막의 대사는
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
          회원 탈퇴를 요청하시면 계정 정보와 이용 기록, 보관 중인 번역 결과물을
          모두 삭제합니다. 결과물만 먼저 지우고 싶으시면 그것도 요청하실 수
          있습니다.
        </p>
      </Section>

      <Section title='안전성 확보 조치' id='security'>
        <ul className='m-0 pl-4'>
          <li>모든 통신은 HTTPS로 암호화됩니다.</li>
          <li>
            데이터베이스에 행 수준 보안(RLS)을 적용해, 이용자는 자신의 기록만 조회할
            수 있고 잔액은 클라이언트에서 수정할 수 없습니다.
          </li>
          <li>
            번역 결과물을 담는 저장소는 비공개이며, 같은 행 수준 보안이 적용됩니다.
            파일 경로는 요청이 아니라 로그인 세션에서 만들어지므로, 다른 이용자의
            결과물을 가리키는 요청은 애초에 만들어지지 않습니다.
          </li>
          <li>
            보관 범위를 결과물 하나로 좁혔습니다. 업로드한 자막 원본은 저장하지
            않아, 유출될 수 있는 정보의 범위 자체를 줄였습니다.
          </li>
        </ul>
      </Section>

      <Section title='보호책임자와 문의' id='officer'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0'>
          {OFFICER.map((row) => (
            <div key={row.label} className='contents'>
              <dt className='text-secondary'>{row.label}</dt>
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
          정보는{' '}
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.terms}
          </Link>
          에 있습니다.
        </p>
      </Section>
    </LegalShell>
  );
}
