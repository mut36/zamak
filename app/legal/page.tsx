import Link from 'next/link';
import { CREDIT_PACKS } from '../config/packs';
import { MAX_BLOCKS_PER_CREDIT } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';
import { SITE } from '../lib/brand';
import { Contents, KeyPoint, LegalShell, Section } from './parts';

export const metadata = {
  title: '이용약관 · 환불 안내 | ZAMAK',
  description: 'ZAMAK 이용약관, 자막 저작권과 이용자 책임, 번역권 구매·환불 안내',
};

/**
 * Required alongside payments, not optional polish: Korean e-commerce law
 * (전자상거래법) requires the seller's identity and the refund terms to be
 * readable before purchase, and card acquirers check for this page during the
 * Toss Payments merchant review.
 *
 * 사업장 주소는 아직 TODO — 대표가 직접 채울 것. 통신판매업 신고번호는 결제가
 * 붙지 않은 지금은 "결제 미가동" 표기로 대신한다: 그 신고 자체가 통신판매업 신고
 * 면제 대상(직전년도 거래 50회 미만 등)인지 대표가 사업자 유형(간이과세자 여부)을
 * 확인해 판단할 사안이라, 결제를 열 때 신고번호 또는 면제 근거로 교체해야 한다.
 */
const SELLER_INFO: { label: string; value: string }[] = [
  { label: '상호', value: '뭍36 (MUT36)' },
  { label: '대표자', value: '이지안' },
  { label: '사업자등록번호', value: '224-23-65160' },
  { label: '통신판매업 신고번호', value: '결제 미가동 — 결제 오픈 시 신고 또는 면제 근거로 표기' },
  { label: '사업장 주소', value: 'TODO' },
  { label: '홈페이지', value: SITE.url },
  { label: '고객문의', value: COPY.footer.feedbackEmail },
  { label: '호스팅 제공', value: 'Vercel Inc.' },
  { label: '결제대행', value: '토스페이먼츠(주)' },
];

const CONTENTS = [
  { id: 'product', label: '판매하는 것' },
  { id: 'refund', label: '환불' },
  { id: 'copyright', label: '자막 저작권과 이용자 책임' },
  { id: 'data', label: '파일과 데이터 처리' },
  { id: 'liability', label: '책임의 한계' },
  { id: 'report', label: '권리침해 신고' },
  { id: 'seller', label: '사업자 정보' },
  { id: 'misc', label: '약관 변경과 준거법' },
];

export default function LegalPage() {
  return (
    <LegalShell
      title='이용약관 · 환불 안내'
      subtitle='번역권을 구매하거나 자막을 올리기 전에 확인해주세요.'
      effectiveDate='2026년 7월 27일'
      otherDoc={{ href: COPY.legal.privacyHref, label: COPY.legal.privacy }}
    >
      <Contents items={CONTENTS} />

      <KeyPoint>
        <b className='text-ink'>
          올리신 자막 파일은 서버에 저장하지 않습니다.
        </b>{' '}
        파일은 브라우저에서 열리고, 번역되는 동안에만 서버를 거쳐 갑니다. ZAMAK이
        기록하는 것은 번역한 자막의 줄 수와 시각뿐이며 자막 내용은 포함되지
        않습니다.
      </KeyPoint>

      <Section title='판매하는 것' id='product'>
        <p className='m-0'>
          ZAMAK은 SRT 자막 파일을 번역해주는 서비스이고, 판매하는 상품은 선불
          번역권입니다. 번역권 1편으로 자막{' '}
          {MAX_BLOCKS_PER_CREDIT.toLocaleString()}줄까지의 파일 하나를 번역할 수
          있습니다.
        </p>
        <ul className='mt-3 pl-4'>
          {CREDIT_PACKS.map((pack) => (
            <li key={pack.id}>
              번역권 {pack.credits}편 — {pack.amount.toLocaleString()}원 (부가세
              포함)
            </li>
          ))}
        </ul>
        <p>번역권에는 유효기간이 없습니다.</p>
      </Section>

      <Section title='환불' id='refund'>
        <p className='m-0'>
          <b>사용하지 않은 번역권은 전액 환불됩니다.</b> 이미 사용한 번역권은
          결과물(번역된 자막 파일)이 즉시 제공되므로 환불되지 않습니다. 예를 들어
          10편을 구매하고 2편을 사용했다면 8편분이 환불 대상입니다.
        </p>
        <p>
          환불은 아래 고객문의로 요청해주세요. 결제하신 수단으로 영업일 기준 3일
          이내에 처리됩니다. 카드 결제의 경우 카드사 사정에 따라 취소 반영까지
          며칠이 더 걸릴 수 있습니다.
        </p>
        <p>
          번역이 서비스 오류로 실패했는데 번역권이 차감된 경우에도 같은 경로로
          알려주세요. 사용 여부와 무관하게 복구해 드립니다.
        </p>
      </Section>

      <Section title='자막 저작권과 이용자 책임' id='copyright'>
        <p className='m-0'>
          ZAMAK은 올라온 자막 파일을 지정한 언어로 번역해주는 도구입니다. 자막의
          저작권자가 누구인지, 이용자에게 권리가 있는지는 확인하지 않으며
          보증하지도 않습니다.
        </p>
        <p>이용자는 번역을 요청하는 파일에 대해 다음을 확인한 것으로 봅니다.</p>
        <ul className='mt-3 pl-4'>
          <li>
            해당 파일을 복제·번역할 적법한 권한이 있거나, 개인적으로 이용하려는
            목적입니다.
          </li>
          <li>
            ZAMAK 이용이 제3자의 저작권, 초상권, 그 밖의 권리를 침해하지
            않습니다.
          </li>
        </ul>
        <p className='mt-3'>
          번역 결과물은 원저작물의 2차적저작물에 해당할 수 있습니다. 개인적으로
          보관하고 이용하는 것과 달리,{' '}
          <b>
            권리자의 허락 없이 배포·공유·판매하거나 온라인에 올리는 행위는
            저작권 침해가 될 수 있습니다.
          </b>{' '}
          결과물을 어떻게 사용할지에 대한 책임은 이용자에게 있습니다.
        </p>
      </Section>

      <Section title='파일과 데이터 처리' id='data'>
        <p className='m-0'>
          올리신 자막 파일은 서버에 저장하지 않습니다. 파일은 브라우저에서 열려
          번역할 단위로 나뉘고, 번역이 진행되는 동안에만 서버를 거쳐 갑니다.
          번역이 끝나면 결과물은 이용자의 브라우저에만 남습니다.
        </p>
        <p>
          번역에는 Google의 Gemini API를 사용하므로, 자막의 대사는 번역되는 동안
          Google로 전송됩니다. ZAMAK이 사용하는 유료 API는 전송된 내용을 모델
          학습에 사용하지 않습니다.
        </p>
        <p>
          ZAMAK이 기록하는 것은 번역한 자막의 줄 수와 시각뿐이며, 자막 내용은
          포함되지 않습니다. 계정·결제 정보를 포함한 자세한 내용은{' '}
          <Link href={COPY.legal.privacyHref} className='underline'>
            {COPY.legal.privacy}
          </Link>
          에서 확인하실 수 있습니다.
        </p>
      </Section>

      <Section title='책임의 한계' id='liability'>
        <p className='m-0'>
          번역은 자동으로 이루어지며, 결과물의 정확성이나 특정 용도에 대한
          적합성을 보증하지 않습니다. 번역 결과는 사용하기 전에 직접 확인해주세요.
        </p>
        <p>
          서비스 점검이나 외부 API 장애 등으로 번역이 중단되거나 실패할 수
          있습니다. 이 경우 차감된 번역권은 위 &lsquo;환불&rsquo; 항목에 따라
          복구해 드립니다. 그 밖에 서비스 이용으로 발생한 손해에 대해서는 ZAMAK의
          고의 또는 과실이 있는 범위에서 책임집니다.
        </p>
        <p>
          이용자가 이 약관을 위반하거나 제3자의 권리를 침해하여 ZAMAK에 손해가
          발생한 경우, 이용자는 그 고의 또는 과실의 범위에서 손해를 배상할 책임이
          있습니다.
        </p>
      </Section>

      <Section title='권리침해 신고' id='report'>
        <p className='m-0'>
          자신의 권리가 침해되었다고 판단하는 권리자는 아래로 신고할 수 있습니다.
        </p>
        <ul className='mt-3 pl-4'>
          <li>이메일: {COPY.footer.feedbackEmail}</li>
          <li>
            포함할 내용: 신고인 또는 대리인의 정보와 연락처, 침해되었다고 주장하는
            저작물, 권리 보유를 확인할 수 있는 자료, 구체적인 침해 사유
          </li>
        </ul>
        <p className='mt-3'>
          다만 ZAMAK은 자막 파일이나 번역 결과물을 보관하지 않으므로, 특정 파일을
          내리거나 접근을 차단하는 조치는 할 수 없습니다. 신고 내용을 검토해
          반복적이거나 명백한 침해가 확인되면 해당 계정의 서비스 이용을 제한할 수
          있습니다.
        </p>
      </Section>

      <Section title='사업자 정보' id='seller'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0'>
          {SELLER_INFO.map((row) => (
            <div key={row.label} className='contents'>
              <dt className='text-ink-3'>{row.label}</dt>
              <dd className='m-0'>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title='약관 변경과 준거법' id='misc'>
        <p className='m-0'>
          약관이 바뀌면 시행일 7일 전부터 이 페이지에 공지합니다. 이용자에게
          불리한 변경은 30일 전에 공지합니다.
        </p>
        <p>
          이 약관은 대한민국 법을 따르며, 분쟁은 민사소송법에 따른 관할 법원에
          제기할 수 있습니다.
        </p>
      </Section>
    </LegalShell>
  );
}
