import { PRO_MODEL } from '../config/constants';

/**
 * Which balance a translation spends.
 *
 * Split because the two models' costs are not comparable — pro runs at HIGH
 * thinking, which is billed at the output rate — so one shared balance would
 * let a beta user drain the expensive path with cheap-path credits.
 */
export type CreditKind = 'lite' | 'pro';

export interface CreditBalances {
  lite: number;
  pro: number;
  /**
   * 무제한 계정의 만료 시각(ISO). `null`이면 무기한(운영자), 필드 자체가
   * 없으면 무제한이 아닌 보통 계정이다.
   */
  unlimitedUntil?: string | null;
}

/**
 * Unknown ids resolve to 'lite' deliberately: mis-billing the cheap balance
 * costs us a rounding error, mis-billing the scarce one costs a user their
 * pro translation.
 */
export function creditKindForModel(model: string): CreditKind {
  return model === PRO_MODEL ? 'pro' : 'lite';
}
