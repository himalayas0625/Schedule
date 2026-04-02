import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'assets/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      // 错误级别
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',

      // 代码风格（警告级别）
      'indent': ['warn', 2, { SwitchCase: 1 }],
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'semi': ['warn', 'always'],
      'comma-dangle': ['warn', 'never'],
      'no-trailing-spaces': 'warn',
      'eol-last': ['warn', 'always'],
      'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],

      // 最佳实践
      'eqeqeq': ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'warn',
      'no-var': 'error'
    }
  },
  // 主进程配置（CommonJS）
  {
    files: ['src/main/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  // Preload 配置（CommonJS）
  {
    files: ['src/preload/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  // 渲染进程配置（ESM）
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // 渲染进程可访问 Electron API
      'no-undef': 'off'
    }
  }
];
