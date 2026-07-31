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
}

/**
 * Unknown ids resolve to 'lite' deliberately: mis-billing the cheap balance
 * costs us a rounding error, mis-billing the scarce one costs a user their
 * pro translation.
 */
export function creditKindForModel(model: string): CreditKind {
  return model === PRO_MODEL ? 'pro' : 'lite';
}
