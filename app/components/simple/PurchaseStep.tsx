'use client';

import { useState } from 'react';
import Link from 'next/link';
import { COPY } from '../../i18n/simpleCopy';
import { CREDIT_PACKS, pricePerCredit } from '../../config/packs';
import { MAX_BLOCKS_PER_CREDIT } from '../../config/constants';
import { startPurchase } from '../../lib/client/payments';

const c = COPY.purchase;

interface PurchaseStepProps {
  /** Current balance, for context above the packs. null while unknown. */
  balance: number | null;
  onClose: () => void;
}

/**
 * Pack selection, and the handoff to the Toss payment window.
 *
 * Nothing here decides a price: pressing a pack calls /api/payments/prepare,
 * which writes the amount into an order row before the window opens. On success
 * the browser leaves for Toss and comes back through /api/payments/confirm, so
 * this component never sees the money — only the failure to open the window.
 */
export function PurchaseStep({ balance, onClose }: PurchaseStepProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleBuy = async (packId: string) => {
    setError('');
    setPending(packId);
    const failure = await startPurchase(packId);
    // A success navigates away; reaching here means it did not happen.
    setPending(null);
    if (failure) {
      setError(
        failure === 'payments_not_configured' ? c.notConfigured : c.failed,
      );
    }
  };

  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>

      {error && (
        <div
          className='card p-4 mb-[14px] text-sm'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {error}
        </div>
      )}

      {balance !== null && (
        <p className='text-center text-[12.5px] text-ink-3 mb-3'>
          {c.balance(balance)}
        </p>
      )}

      <div className='grid gap-3 lg:grid-cols-3'>
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.id} className='card p-5 flex flex-col text-center'>
            {pack.badge && <div className='dbadge mx-auto mb-2'><b />{pack.badge}</div>}
            <div className='text-[15px] font-bold text-ink'>
              {c.creditsUnit(pack.credits)}
            </div>
            <div className='text-[22px] font-bold text-ink mt-1'>
              {c.price(pack.amount)}
            </div>
            <div className='text-[12.5px] text-ink-3 mt-1'>
              {c.perCredit(pricePerCredit(pack))}
            </div>
            <button
              type='button'
              className='btn btn-primary w-full mt-4'
              disabled={pending !== null}
              onClick={() => handleBuy(pack.id)}
            >
              {pending === pack.id ? c.opening : c.cta}
            </button>
          </div>
        ))}
      </div>

      <p className='text-center text-[12.5px] text-ink-3 mt-3'>
        {c.coverage(MAX_BLOCKS_PER_CREDIT)}
      </p>

      <ul className='mt-6 text-[12.5px] text-ink-3 leading-relaxed list-none p-0'>
        {c.notice.map((line) => (
          <li key={line}>· {line}</li>
        ))}
      </ul>

      <div className='flex flex-col items-center gap-3 mt-6'>
        <Link href='/legal' className='text-[12.5px] text-ink-3 underline'>
          {c.terms}
        </Link>
        <button type='button' className='btn w-full' onClick={onClose}>
          {c.close}
        </button>
      </div>
    </div>
  );
}
