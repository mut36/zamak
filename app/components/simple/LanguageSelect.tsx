'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, CheckIcon } from '../icons';
import { TARGET_LANGS, getTargetLang } from '../../config/languages';
import { COPY } from '../../i18n/simpleCopy';

interface LanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const c = COPY.upload;
  const current = getTargetLang(value) ?? TARGET_LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className='lselect' ref={rootRef}>
      <button
        type='button'
        className={`lselect-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label={c.langLabel}
      >
        <span className='lselect-mono'>{current.mono}</span>
        <span className='lselect-label'>{current.label}</span>
        <ChevronDownIcon className='lselect-chev' />
      </button>

      {open && (
        <ul className='lselect-menu' role='listbox'>
          {TARGET_LANGS.map((lang) => (
            <li key={lang.code} role='presentation'>
              <button
                type='button'
                role='option'
                aria-selected={lang.code === value}
                disabled={!lang.enabled}
                onClick={() => {
                  onChange(lang.code);
                  setOpen(false);
                }}
                className={`lselect-opt${lang.code === value ? ' on' : ''}`}
              >
                <span className='lselect-mono'>{lang.mono}</span>
                <span className='lselect-label'>{lang.label}</span>
                {lang.enabled ? (
                  lang.code === value && <CheckIcon className='lselect-check' />
                ) : (
                  <span className='lselect-soon'>{c.comingSoon}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
