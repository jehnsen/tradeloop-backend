import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'storage/**', 'src/ops/domain/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { sourceType: 'module' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-extraneous-class': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
);
