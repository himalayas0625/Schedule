// 签名密钥模板（占位符）。真实值在 gitignored 的 src/main/secrets.js 中。
// 两种方式生成 secrets.js：
//   1. 设置环境变量 LICENSE_SECRET / TRIAL_SECRET，由 scripts/gen-secrets.js 注入；
//   2. 直接复制本文件为 secrets.js 并填入真实值。
// 注意：secrets.js 会被打进 asar（仅"防普通用户转发"，非防逆向）。
module.exports = {
  LICENSE_SECRET: 'replace-me',
  TRIAL_SECRET: 'replace-me'
};
