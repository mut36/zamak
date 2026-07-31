import Link from 'next/link';
import { APP_VERSION } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';
import { Wordmark } from './Wordmark';

const F = COPY.footer;
const S = COPY.seller;

/**
 * 전 페이지 공용 푸터.
 *
 * 판매자 표시(전자상거래법 제10조)는 "초기 화면"에 있어야 하고, 어느 페이지로
 * 바로 들어오든 그 표시에 닿아야 한다 — 그래서 랜딩·앱 셸·마이페이지·약관
 * 페이지가 전부 이 하나를 쓴다. 변형(variant)을 두지 않는 것도 같은 이유다:
 * 페이지마다 다른 푸터를 쓰면 어느 하나가 표시 의무에서 빠진다.
 *
 * 서버 컴포넌트다 — 훅도, 세션 의존도 없다. 그래서 `/legal/*` 같은 정적
 * 페이지에 넣어도 클라이언트 번들이 늘지 않는다. 로그인 여부를 모르므로
 * 마이페이지 링크는 항상 노출되고, 비로그인 방문자는 `/mypage`가 알아서
 * 홈으로 돌려보낸다.
 */
export function SiteFooter() {
  return (
    <footer className='site-footer'>
      <div className='site-footer-top'>
        <div>
          <Wordmark className='lp-wordmark' />
          <p className='site-footer-tagline'>{F.tagline}</p>
        </div>

        <nav className='site-footer-links'>
          <div>
            <p className='site-footer-group'>{F.serviceGroup}</p>
            <Link href='/'>{F.home}</Link>
            <Link href='/mypage'>{F.mypage}</Link>
            <a href={`mailto:${F.feedbackEmail}`}>{F.feedback}</a>
          </div>
          <div>
            <p className='site-footer-group'>{F.policyGroup}</p>
            <Link href={COPY.legal.termsHref}>{COPY.legal.terms}</Link>
            <Link href={COPY.legal.privacyHref}>{COPY.legal.privacy}</Link>
          </div>
        </nav>
      </div>

      {/* 판매자 표시. `·`로 이어 붙여 좁은 화면에서 자연스럽게 접히게 둔다. */}
      <address className='site-footer-seller'>
        <span>{S.name}</span>
        <span className='dot-sep' />
        <span>대표 {S.ceo}</span>
        <span className='dot-sep' />
        <span>{S.address}</span>
        <span className='dot-sep' />
        <span>사업자등록번호 {S.bizNo}</span>
        <span className='dot-sep' />
        <span>{S.mailOrderShort}</span>
        <span className='dot-sep' />
        <a href={`tel:${S.tel.replace(/-/g, '')}`}>전화 {S.tel}</a>
        <span className='dot-sep' />
        <a href={`mailto:${F.feedbackEmail}`}>{F.feedbackEmail}</a>
      </address>

      <div className='site-footer-bottom'>
        <span>{F.copyright}</span>
        <span className='mono'>v{APP_VERSION} · Beta</span>
      </div>
    </footer>
  );
}
