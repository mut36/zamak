import { COPY } from '../i18n/simpleCopy';

/**
 * 푸터의 판매자 표시(전자상거래법 제10조).
 *
 * **접지 않는다.** 2026-08-21 이전에는 아코디언(`SellerInfoToggle`)이었는데,
 * PG 가맹점 심사가 "사이트 운영 주체를 확인할 수 없다"로 반려됐다 — 심사자는
 * 토글을 열지 않는다. 상호만 보이고 사업자등록번호·대표자·주소가 숨어 있으면
 * 심사자 눈에는 '표기 없음'이다. 그래서 항상 펼쳐 둔다. 접고 싶어지면
 * `docs/decisions.md`의 이 항목을 먼저 읽을 것.
 *
 * 운영 주체 문장도 같은 이유로 맨 앞에 둔다: 브랜드명(ZAMAK)과 상호(뭍36)가
 * 다른 건 정상이지만, 두 이름을 잇는 문장이 없으면 불일치로 읽힌다.
 *
 * 상태가 없으니 서버 컴포넌트다 — `SiteFooter`가 서버 컴포넌트라는 전제를
 * 이 파일이 깨지 않는다.
 */
export function SellerInfo() {
  const S = COPY.seller;
  const F = COPY.footer;

  return (
    <div className='site-footer-seller-wrap'>
      <p className='site-footer-seller-operator'>{F.operatedBy(S.name)}</p>

      <address className='site-footer-seller'>
        <span>상호 {S.name}</span>
        <span className='dot-sep' />
        <span>대표 {S.ceo}</span>
        <span className='dot-sep' />
        <span>사업자등록번호 {S.bizNo}</span>
        <span className='dot-sep' />
        <span>{S.mailOrderShort}</span>
        <span className='dot-sep' />
        <span>{S.address}</span>
        <span className='dot-sep' />
        <a href={`tel:${S.tel.replace(/-/g, '')}`}>전화 {S.tel}</a>
        <span className='dot-sep' />
        <a href={`mailto:${F.feedbackEmail}`}>{F.feedbackEmail}</a>
      </address>
    </div>
  );
}
