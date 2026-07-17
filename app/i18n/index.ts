import { ko } from './ko';
import { en } from './en';

export type SiteLang = 'ko' | 'en';
type DeepMutable<T> = {
  -readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T[K] extends object
      ? DeepMutable<T[K]>
      : T[K] extends string ? string : T[K];
};

export type Translations = DeepMutable<typeof ko>;

export const TEXT: Record<SiteLang, Translations> = { ko, en } as Record<SiteLang, Translations>;
