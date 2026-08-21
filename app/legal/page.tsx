import Link from 'next/link';
import {
  RESULT_RETENTION_DAYS,
} from '../config/constants';
import { COPY } from '../i18n/simpleCopy';
import { SITE } from '../lib/brand';
import { Contents, KeyPoint, LegalShell, Section } from './parts';

// 브랜드명은 붙이지 않는다 — 루트 layout의 `title.template`(`%s · ZAMAK`)이
// 이미 붙인다. 여기에 "| ZAMAK"을 같이 쓰면 "이용약관 | ZAMAK · ZAMAK"이 된다
// (2026-08-03 프로덕션 빌드에서 실제로 그렇게 나가고 있었다).
export const metadata = {
  title: '이용약관',
  description: 'ZAMAK 이용약관, 자막 저작권과 이용자 책임',
  // Self-referencing — see the note in app/page.tsx.
  alternates: { canonical: '/legal' },
};

/**
 * Required alongside payments, not optional polish: Korean e-commerce law
 * (전자상거래법) requires the seller's identity to be readable before purchase.
 *
 * 값 자체는 `COPY.seller`에 있다 — 전 페이지 푸터(`SiteFooter`)가 같은 항목을
 * 표시하므로, 여기 하드코딩하면 한쪽만 고쳐져 갈라진다. 이 배열은 그 값에
 * 이 페이지용 라벨만 붙인다. 호스팅은 법정 표시 항목이 아니라
 * 신뢰 신호라 푸터에는 없고 이 표에만 있다.
 */
const SELLER_INFO: { label: string; value: string }[] = [
  { label: '상호', value: COPY.seller.name },
  { label: '대표자', value: COPY.seller.ceo },
  { label: '사업자등록번호', value: COPY.seller.bizNo },
  { label: '통신판매업 신고번호', value: COPY.seller.mailOrder },
  { label: '사업장 주소', value: COPY.seller.address },
  { label: '전화번호', value: COPY.seller.tel },
  { label: '홈페이지', value: SITE.url },
  { label: '고객문의', value: COPY.footer.feedbackEmail },
  { label: '호스팅 제공', value: COPY.seller.hosting },
];

const CONTENTS = [
  { id: 'copyright', label: '자막 저작권과 이용자 책임' },
  { id: 'data', label: '파일과 데이터 처리' },
  { id: 'payment', label: '번역권 구매와 취소·환불' },
  { id: 'liability', label: '책임의 한계' },
  { id: 'report', label: '권리침해 신고' },
  { id: 'seller', label: '사업자 정보' },
  { id: 'misc', label: '약관 변경과 준거법' },
];

export default function LegalPage() {
  return (
    <LegalShell
      title='이용약관'
      subtitle='자막을 올리기 전에 확인해주세요.'
      effectiveDate='2026년 8월 21일'
      otherDoc={{ href: COPY.legal.privacyHref, label: COPY.legal.privacy }}
    >
      <Contents items={CONTENTS} />

      <KeyPoint>
        <b className='text-ink-strong'>올리신 자막 원본은 저장하지 않습니다.</b> 원본은
        브라우저에서 열리고, 번역되는 동안에만 서버를 거쳐 갑니다.{' '}
        <b className='text-ink-strong'>완성된 번역 결과물</b>은 다시 받으실 수 있도록
        본인만 접근할 수 있는 비공개 저장소에 {RESULT_RETENTION_DAYS}일간
        보관합니다.
      </KeyPoint>

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
          올리신 자막 원본은 서버에 저장하지 않습니다. 원본은 브라우저에서 열려
          번역할 단위로 나뉘고, 번역이 진행되는 동안에만 서버를 거쳐 갑니다.
        </p>
        <p>
          번역이 끝나면 <b>결과물</b>은 이용자가 다시 받을 수 있도록{' '}
          {RESULT_RETENTION_DAYS}일간 보관합니다. 이용자별로 분리된 비공개
          저장소에 두며, 검색 엔진에 노출되지 않고 본인 외에는 열람하지 않습니다.{' '}
          {RESULT_RETENTION_DAYS}일이 지나면 다시 받으실 수 없습니다. 그 전에
          삭제를 원하시면 아래 고객문의로 요청해주세요.
        </p>
        <p>
          번역에는 Google의 Gemini API를 사용하므로, 자막의 대사는 번역되는 동안
          Google로 전송됩니다. ZAMAK이 사용하는 유료 API는 전송된 내용을 모델
          학습에 사용하지 않습니다.
        </p>
        <p>
          그 밖에 ZAMAK이 기록하는 것은 번역한 자막의 줄 수와 시각, 올린 파일의
          이름, 사용한 번역 모델과 설정(글로사리 등)뿐입니다. 계정·결제 정보를 포함한 자세한 내용은{' '}
          <Link href={COPY.legal.privacyHref} className='underline'>
            {COPY.legal.privacy}
          </Link>
          에서 확인하실 수 있습니다.
        </p>
      </Section>

      {/*
        전자상거래법 제17조(청약철회)가 요구하는 표시이자, PG 가맹점 심사의
        상시 확인 항목이다 — 2026-08-21 심사 반려 때 이 조항이 아예 없었다.
        번역권은 디지털 재화라 "사용 시작 = 철회 불가"가 기준선이고, 그
        '시작' 시점을 코드가 실제로 차감하는 시점과 같게 적어야 한다:
        번역권은 작업이 열릴 때 차감된다(`translationJob.ts`). 실패 복구가
        아직 수동이라는 것도 그대로 적는다 — 자동화하면 이 문단을 고칠 것.
      */}
      <Section title='번역권 구매와 취소·환불' id='payment'>
        <p className='m-0'>
          ZAMAK은 <b>번역권</b>을 미리 구매해 사용하는 선불 방식입니다. 번역권
          1개로 자막 파일 1개를 번역할 수 있고, 결제가 확인되면 계정에 바로
          적립됩니다. 번역권에는 유효기간이 없습니다.
        </p>
        <p>
          <b>사용하지 않은 번역권</b>은 구매일로부터 7일 이내에 청약철회하실 수
          있으며, 남은 개수만큼 전액 환불해 드립니다. 7일이 지난 뒤라도 사용하지
          않은 번역권은 아래 고객문의로 요청하시면 환불해 드립니다.
        </p>
        <p>
          <b>이미 사용한 번역권</b>은 환불되지 않습니다. 번역권은 번역이 시작되는
          시점에 차감되므로, 그 전까지는 취소하실 수 있고 시작된 뒤에는 결과물을
          받으셨는지와 무관하게 사용한 것으로 봅니다. 자동 번역의 특성상 결과물의
          품질이나 문체가 기대와 다른 것은 환불 사유에 해당하지 않습니다 —
          구매 전에 홈페이지의 번역 예시로 결과를 확인해주세요.
        </p>
        <p>
          <b>ZAMAK의 오류나 장애로 번역이 실패한 경우</b>에는 사용한 것으로 보지
          않습니다. 아래 고객문의로 알려주시면 차감된 번역권을 복구하거나, 원하시면
          환불해 드립니다.
        </p>
        <p>
          환불은 결제하신 수단으로 취소 처리하며, 요청을 확인한 날부터 3영업일
          이내에 진행합니다. 결제 수단에 따라 실제 반영까지는 며칠이 더 걸릴 수
          있습니다. 서비스를 종료하는 경우 남은 번역권은 전액 환불합니다.
        </p>
        <p>
          문의는 <a href={`mailto:${COPY.footer.feedbackEmail}`} className='underline'>
            {COPY.footer.feedbackEmail}
          </a>
          로 보내주세요.
        </p>
      </Section>

      <Section title='책임의 한계' id='liability'>
        <p className='m-0'>
          번역은 자동으로 이루어지며, 결과물의 정확성이나 특정 용도에 대한
          적합성을 보증하지 않습니다. 번역 결과는 사용하기 전에 직접 확인해주세요.
        </p>
        <p>
          서비스 점검이나 외부 API 장애 등으로 번역이 중단되거나 실패할 수
          있습니다. 그 밖에 서비스 이용으로 발생한 손해에 대해서는 ZAMAK의
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
          ZAMAK은 자막 원본을 보관하지 않으므로 원본에 대해서는 내릴 것이
          없습니다. 다만 번역 <b>결과물</b>은 {RESULT_RETENTION_DAYS}일간
          보관하므로, 보관 기간 안이라면 신고된 저작물에 해당하는 결과물을 계정과
          작업 단위로 특정해 삭제하고 접근을 차단할 수 있습니다. 결과물은 처음부터
          공개되지 않으며 올린 이용자 본인만 받을 수 있으므로, 이 조치는 공중에
          대한 유통을 막는 것이 아니라 ZAMAK이 들고 있던 사본을 없애는 것입니다.
        </p>
        <p>
          신고 내용을 검토해 반복적이거나 명백한 침해가 확인되면 해당 계정의
          서비스 이용을 제한할 수 있습니다.
        </p>
      </Section>

      <Section title='사업자 정보' id='seller'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 m-0'>
          {SELLER_INFO.map((row) => (
            <div key={row.label} className='contents'>
              <dt className='text-secondary'>{row.label}</dt>
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
