import { describe, it, expect } from 'vitest';
import {
  normalizeCouponCode,
  isCouponRedeemStatus,
} from './coupon';

describe('normalizeCouponCode', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(normalizeCouponCode('  세르지오 ')).toBe('세르지오');
  });

  it('가운데 공백도 지운다 — 모바일 IME가 흘리는 공백을 흡수한다', () => {
    expect(normalizeCouponCode('세 르지오')).toBe('세르지오');
  });

  it('탭과 개행도 공백으로 본다', () => {
    expect(normalizeCouponCode('세르\t지오\n')).toBe('세르지오');
  });

  it('영문은 대문자로 올린다', () => {
    expect(normalizeCouponCode('zamak2026')).toBe('ZAMAK2026');
  });

  it('한글은 대문자 규칙에 영향받지 않는다', () => {
    expect(normalizeCouponCode('세르지오')).toBe('세르지오');
  });

  it('NFD로 들어온 한글을 NFC로 합친다 — macOS 붙여넣기 경로', () => {
    const nfd = '세르지오'.normalize('NFD');
    expect(nfd).not.toBe('세르지오');
    expect(normalizeCouponCode(nfd)).toBe('세르지오');
  });

  it('빈 문자열은 빈 문자열이다', () => {
    expect(normalizeCouponCode('   ')).toBe('');
  });
});

describe('isCouponRedeemStatus', () => {
  it('세 가지 상태만 통과시킨다', () => {
    expect(isCouponRedeemStatus('ok')).toBe(true);
    expect(isCouponRedeemStatus('already_redeemed')).toBe(true);
    expect(isCouponRedeemStatus('invalid')).toBe(true);
  });

  it('모르는 값은 거른다 — DB가 새 상태를 뱉어도 화면이 깨지지 않는다', () => {
    expect(isCouponRedeemStatus('expired')).toBe(false);
    expect(isCouponRedeemStatus(null)).toBe(false);
    expect(isCouponRedeemStatus(3)).toBe(false);
  });
});
