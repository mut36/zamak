'use client';

import { useState } from 'react';
import { ChevronDownIcon } from '../icons';
import { COPY } from '../../i18n/simpleCopy';

interface ApiKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const c = COPY.apiKey;

/**
 * Optional BYOK field — a collapsed "advanced" accordion. When a key is set,
 * translation requests bill to it; otherwise the server key is used. The key
 * is held in sessionStorage by the parent and never sent anywhere but the
 * translation request header.
 */
export function ApiKeyField({ value, onChange }: ApiKeyFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className='adv mb-4'>
      <button
        type='button'
        className={`adv-h w-full${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          {c.toggle}
          {value && (
            <span className='ml-2 text-[11px] font-semibold text-accent'>
              · {c.saved}
            </span>
          )}
        </span>
        <ChevronDownIcon className='chev' />
      </button>
      {open && (
        <div className='adv-body'>
          <label className='block text-[13px] font-semibold text-ink-2 mt-3 mb-1.5'>
            {c.label}
          </label>
          <input
            type='password'
            className='input mono'
            placeholder={c.placeholder}
            value={value}
            autoComplete='off'
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className='flex items-start justify-between gap-3 mt-2'>
            <p className='text-[12px] text-ink-3 leading-relaxed'>{c.hint}</p>
            {value && (
              <button
                type='button'
                className='text-[12px] text-ink-3 underline shrink-0 mt-0.5'
                onClick={() => onChange('')}
              >
                {c.clear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
