module.exports = {
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    es6: true,
    browser: true,
  },
  plugins: ['svelte3'],
  overrides: [
    {
      files: ['*.svelte'],
      processor: 'svelte3/svelte3',
    },
  ],
  rules: {
    '@typescript-eslint/no-non-null-assertion': 'off',
    "node/no-unsupported-features/es-syntax": [
        "error",
        {
          version: ">=8.0.0",
        },
    ],
  },
  settings: {
  },
}
