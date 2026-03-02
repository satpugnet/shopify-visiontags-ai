/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  extends: [
    "@remix-run/eslint-config",
    "@remix-run/eslint-config/node",
    "prettier",
  ],
  globals: {
    shopify: "readonly",
  },
  rules: {
    // eslint-comments plugin not installed, disable its rules
    "eslint-comments/disable-enable-pair": "off",
    "eslint-comments/no-unlimited-disable": "off",
  },
  ignorePatterns: ["app/types/admin.generated.d.ts"],
  overrides: [
    {
      // Test files: vi.mock() must come before imports (standard vitest pattern)
      files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx", "test/**"],
      rules: {
        "import/first": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/no-use-before-define": "off",
      },
    },
  ],
};
