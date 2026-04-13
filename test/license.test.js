import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

// license.js 是 CJS 模块（供 Electron 主进程使用），通过 createRequire 引入
const require = createRequire(import.meta.url);
const { validateLicenseKey, generateKey } = require('../src/main/license.js');

describe('generateKey', () => {
  it('生成的 Key 应符合格式 XXXXX-XXXXX-XXXXX-XXXXX', () => {
    const key = generateKey();
    expect(key).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('每次生成的 Key 应不同', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateKey()));
    expect(keys.size).toBe(10);
  });
});

describe('validateLicenseKey', () => {
  it('generateKey 生成的 Key 应通过验证', () => {
    for (let i = 0; i < 5; i++) {
      expect(validateLicenseKey(generateKey())).toBe(true);
    }
  });

  it('带连字符和不带连字符的合法 Key 均应通过', () => {
    const key = generateKey();
    const keyNoHyphens = key.replace(/-/g, '');
    expect(validateLicenseKey(key)).toBe(true);
    expect(validateLicenseKey(keyNoHyphens)).toBe(true);
  });

  it('小写输入应自动转为大写并通过验证', () => {
    const key = generateKey().toLowerCase();
    expect(validateLicenseKey(key)).toBe(true);
  });

  it('错误的 checksum 应被拒绝', () => {
    const key = generateKey().replace(/-/g, '');
    // 修改最后一个字符
    const tampered = key.slice(0, 19) + (key[19] === 'A' ? 'B' : 'A');
    expect(validateLicenseKey(tampered)).toBe(false);
  });

  it('随机字符串应被拒绝', () => {
    expect(validateLicenseKey('AAAAA-AAAAA-AAAAA-AAAAA')).toBe(false);
    expect(validateLicenseKey('HELLO-WORLD-ABCDE-FGHJK')).toBe(false);
  });

  it('长度不对应被拒绝', () => {
    expect(validateLicenseKey('AAAAA-AAAAA-AAAAA')).toBe(false);      // 太短
    expect(validateLicenseKey('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 太长
    expect(validateLicenseKey('')).toBe(false);
  });

  it('含易混淆字符 0/O/1/I/L 应被拒绝', () => {
    expect(validateLicenseKey('0AAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 含 0
    expect(validateLicenseKey('OAAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 含 O
    expect(validateLicenseKey('1AAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 含 1
    expect(validateLicenseKey('IAAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 含 I
    expect(validateLicenseKey('LAAAA-AAAAA-AAAAA-AAAAA')).toBe(false); // 含 L
  });

  it('非字符串类型不应抛出异常，应返回 false', () => {
    expect(validateLicenseKey(null)).toBe(false);
    expect(validateLicenseKey(undefined)).toBe(false);
    expect(validateLicenseKey(12345)).toBe(false);
    expect(validateLicenseKey({})).toBe(false);
    expect(validateLicenseKey([])).toBe(false);
  });

  it('超长字符串（> 100 字符）应被拒绝', () => {
    expect(validateLicenseKey('A'.repeat(101))).toBe(false);
  });
});
