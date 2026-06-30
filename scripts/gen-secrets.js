#!/usr/bin/env node
/**
 * 生成 src/main/secrets.js（gitignored，不进版本控制）。
 * 优先级：环境变量 > 保留现有本地文件 > 失败退出。
 *   - 设了 LICENSE_SECRET / TRIAL_SECRET → 覆盖写入；
 *   - 未设 env 但 secrets.js 已存在 → no-op（保留开发者本地文件）；
 *   - 都没有 → 打印指引并 exit(1)（构建/启动即失败，避免漏配密钥）。
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'src', 'main', 'secrets.js');
const envLicense = process.env.LICENSE_SECRET;
const envTrial = process.env.TRIAL_SECRET;

if (envLicense || envTrial) {
  const content =
    '// 本文件由 scripts/gen-secrets.js 从环境变量生成，请勿提交。\n' +
    'module.exports = {\n' +
    `  LICENSE_SECRET: ${JSON.stringify(envLicense || '')},\n` +
    `  TRIAL_SECRET: ${JSON.stringify(envTrial || '')}\n` +
    '};\n';
  fs.writeFileSync(TARGET, content);
  console.log('[gen-secrets] 已从环境变量写入 src/main/secrets.js');
  process.exit(0);
}

if (fs.existsSync(TARGET)) {
  // 保留开发者本地文件，静默通过
  process.exit(0);
}

console.error('[gen-secrets] 缺少 src/main/secrets.js，且未设置环境变量。');
console.error('  请参考 src/main/secrets.example.js 创建本地 secrets.js，');
console.error('  或设置环境变量 LICENSE_SECRET / TRIAL_SECRET 后重试。');
process.exit(1);
