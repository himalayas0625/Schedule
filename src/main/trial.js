const crypto = require('crypto');

// 签名密钥从 gitignored 的 secrets.js 注入（公开仓库不直接暴露密钥）
const { TRIAL_SECRET: _SECRET } = require('./secrets');
const TRIAL_DAYS = 7;

function _sign(s) {
  return crypto.createHmac('sha256', _SECRET).update(s).digest('hex').slice(0, 16);
}

/**
 * 首次运行时初始化试用期（已初始化则跳过）
 * @param {import('electron-store')} store
 */
function initTrial(store) {
  if (store.get('settings.trialStartDate')) return;
  const now = new Date().toISOString();
  store.set('settings.trialStartDate', now);
  store.set('settings.trialStartHash', _sign(now));
}

/**
 * 检查试用期状态
 * @param {import('electron-store')} store
 * @returns {{ isExpired: boolean, daysRemaining: number }}
 */
function getTrialStatus(store) {
  const startDate = store.get('settings.trialStartDate');
  const hash = store.get('settings.trialStartHash');
  if (!startDate || !hash) return { isExpired: true, daysRemaining: 0 };
  if (hash !== _sign(startDate)) return { isExpired: true, daysRemaining: 0 }; // 签名不匹配→篡改
  const start = new Date(startDate);
  const now = new Date();
  if (now < start) return { isExpired: true, daysRemaining: 0 }; // 时钟回退
  const daysElapsed = Math.floor((now - start) / 86400000);
  const daysRemaining = Math.max(0, TRIAL_DAYS - daysElapsed);
  return { isExpired: daysRemaining === 0, daysRemaining };
}

module.exports = { initTrial, getTrialStatus };
