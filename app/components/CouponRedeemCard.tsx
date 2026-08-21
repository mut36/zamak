'use client';

import { useState } from 'react';
import { normalizeCouponCode, isCouponRedeemStatus } from '../lib/coupon';
import { COUPON_CODE_MAX_LENGTH } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';

const c = COPY.coupon;

interface CouponRedeemCardProps {
  /** 교환이 성공했을 때 잔액을 다시 읽게 한다. */
  onRedeemed: () => void;
}

/**
 * 비밀코드 입력 한 칸.
 *
 * 판정은 전부 서버에 있다 — 여기서 하는 일은 입력을 정규화해 보내고, 돌아온
 * 세 가지 결말을 사람 말로 바꾸는 것뿐이다. 실패 사유를 더 캐묻지 않는 것도
 * 의도다(코드 존재 여부를 알려주면 그게 열거 힌트가 된다).
 */
export function CouponRedeemCard({ onRedeemed }: CouponRedeemCardProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const normalized = normalizeCouponCode(code);

  async function submit() {
    if (!normalized || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      if (!res.ok) {
        setMessage(c.failed);
        return;
      }
      const data = (await res.json()) as {
        status?: unknown;
        expiresAt?: string | null;
      };
      const status = isCouponRedeemStatus(data.status) ? data.status : 'invalid';
      if (status === 'ok') {
        setMessage(c.ok(data.expiresAt ?? null));
        setCode('');
        onRedeemed();
      } else if (status === 'already_redeemed') {
        setMessage(c.alreadyRedeemed);
      } else {
        setMessage(c.invalid);
      }
    } catch {
      setMessage(c.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='card p-[22px_24px]'>
      <div className='text-caption text-tertiary'>{c.title}</div>
      <div className='mt-2 flex gap-2'>
        <input
          type='text'
          value={code}
          maxLength={COUPON_CODE_MAX_LENGTH}
          placeholder={c.placeholder}
          className='input flex-1'
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button
          type='button'
          className='btn btn-ghost shrink-0'
          disabled={!normalized || busy}
          onClick={() => void submit()}
        >
          {busy ? c.submitting : c.submit}
        </button>
      </div>
      {message && (
        <p className='text-caption-sm text-secondary mt-2.5'>{message}</p>
      )}
    </div>
  );
}
