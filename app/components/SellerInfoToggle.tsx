'use client';

import { useState } from 'react';
import { COPY } from '../i18n/simpleCopy';

export function SellerInfoToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const S = COPY.seller;
  const F = COPY.footer;

  return (
    <div className='site-footer-seller-wrap'>
      <div className='site-footer-seller-toggle'>
        <span>{S.name}</span>
        <span className='dot-sep' />
        <button
          type='button'
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className='seller-toggle-btn'
        >
          {F.sellerInfo}
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <polyline points='6 9 12 15 18 9' />
          </svg>
        </button>
      </div>

      {isOpen && (
        <address className='site-footer-seller animate-fade-slide-up'>
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
      )}
    </div>
  );
}
