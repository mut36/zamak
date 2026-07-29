import { describe, it, expect } from 'vitest';
import { nextScreenAfterUpload } from './useWizard';

describe('nextScreenAfterUpload', () => {
  it('skips the picker when the search resolved to one confident match', () => {
    // A confident match is confirmed inline on the settings screen
    // ("'X'로 인식했어요. 맞나요?") — making the user pick from a list of one
    // is a step that asks nothing.
    expect(nextScreenAfterUpload('found')).toBe('settings');
  });

  it('shows the picker when the search was ambiguous', () => {
    expect(nextScreenAfterUpload('ambiguous')).toBe('workPick');
  });

  it('shows the picker when nothing was found, so the user can search', () => {
    expect(nextScreenAfterUpload('notFound')).toBe('workPick');
  });

  it('does not send a confident match to the picker just because candidates is empty', () => {
    // useEnrich clears `candidates` to [] on 'found'. Branching on the array's
    // length would route every auto-matched film into an empty picker.
    expect(nextScreenAfterUpload('found')).not.toBe('workPick');
  });
});
