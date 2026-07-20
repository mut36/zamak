/**
 * Detects Gemini's "this key is not valid" rejection in a server error string.
 *
 * Worth its own module because the same check drives two very different UI
 * decisions (send the user back to the key field vs. just show the message),
 * and because the common way to hit it is pasting the *wrong* key — a TMDB
 * key, say — which otherwise surfaces as an unrelated "작품을 못 찾았어요".
 *
 * Deliberately unanchored: the message arrives wrapped in Gemini's ApiError
 * JSON, so it is never the whole string.
 */
const INVALID_KEY = /API key not valid|API_KEY_INVALID/;

export function isInvalidKeyError(message: string): boolean {
  return INVALID_KEY.test(message);
}
