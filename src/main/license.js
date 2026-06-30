const crypto = require('crypto');

// 签名密钥从 gitignored 的 secrets.js 注入（公开仓库不直接暴露密钥）
const { LICENSE_SECRET: _SECRET } = require('./secrets');

// 32 字符集，排除易混淆字符：0(零)/O、1(壹)/I/L
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function _encode(buf, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += CHARSET[buf[i] % CHARSET.length];
  return s;
}

/**
 * 验证 License Key 是否合法（纯本地，无网络）
 * @param {string} raw - 原始输入（允许带连字符）
 * @returns {boolean}
 */
function validateLicenseKey(raw) {
  if (typeof raw !== 'string' || raw.length > 100) return false;
  const key = raw.replace(/-/g, '').toUpperCase();
  if (key.length !== 20) return false;
  if (![...key].every(c => CHARSET.includes(c))) return false;
  const hmac = crypto.createHmac('sha256', _SECRET);
  hmac.update(key.slice(0, 15));
  const expected = _encode(hmac.digest(), 5);
  try {
    return crypto.timingSafeEqual(Buffer.from(key.slice(15)), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * 生成一个合法的 License Key（供开发者工具调用）
 * @returns {string} 格式：XXXXX-XXXXX-XXXXX-XXXXX
 */
function generateKey() {
  const rand = _encode(crypto.randomBytes(15), 15);
  const hmac = crypto.createHmac('sha256', _SECRET);
  hmac.update(rand);
  const check = _encode(hmac.digest(), 5);
  const full = rand + check;
  return `${full.slice(0, 5)}-${full.slice(5, 10)}-${full.slice(10, 15)}-${full.slice(15, 20)}`;
}

module.exports = { validateLicenseKey, generateKey };
