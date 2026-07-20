import { describe, expect, it } from 'vitest';
import { isInvalidKeyError } from './apiKeyError';

describe('isInvalidKeyError', () => {
  it('matches the message inside Gemini ApiError JSON', () => {
    const message =
      'ApiError: {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}';
    expect(isInvalidKeyError(message)).toBe(true);
  });

  it('matches when the payload spans multiple lines', () => {
    expect(isInvalidKeyError('ApiError:\n{\n"reason": "API_KEY_INVALID"\n}')).toBe(
      true,
    );
  });

  it('does not match unrelated failures', () => {
    expect(isInvalidKeyError('Server error (500)')).toBe(false);
    expect(isInvalidKeyError('RESOURCE_EXHAUSTED: quota exceeded')).toBe(false);
    expect(isInvalidKeyError('')).toBe(false);
  });
});
