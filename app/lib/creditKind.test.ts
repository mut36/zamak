import { describe, it, expect } from 'vitest';
import { FLASH_MODEL, PRO_MODEL } from '../config/constants';
import { creditKindForModel } from './creditKind';

describe('creditKindForModel', () => {
  it('charges the pro balance for the pro model', () => {
    expect(creditKindForModel(PRO_MODEL)).toBe('pro');
  });

  it('charges the lite balance for the flash model', () => {
    expect(creditKindForModel(FLASH_MODEL)).toBe('lite');
  });

  it('falls back to lite for an unknown model', () => {
    // A model id we do not recognise must never bill the scarcer balance.
    expect(creditKindForModel('gemini-9-imaginary')).toBe('lite');
  });
});
