module.exports = {
  env: {
    node: true,
    es2020: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "sort-destructure-keys", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/typescript",
    "prettier",
    "plugin:prettier/recommended",
  ],
  rules: {
    "import/extensions": "off",
    "import/extensions": 0,
    "import/no-cycle": [0, { ignoreExternal: true }],
    "import/no-unresolved": 0,
    "import/order": [
      "error",
      {
        alphabetize: { order: "asc" },
        groups: [
          ["builtin", "external"],
          ["internal", "parent", "sibling", "index"],
        ],
        "newlines-between": "always",
        pathGroups: [
          { group: "builtin", pattern: "react", position: "before" },
          {
            group: "external",
            pattern:
              "{styled-components,polished,next,next/*,react-dom,sanitize.css}",
            position: "before",
          },
        ],
        pathGroupsExcludedImportTypes: ["builtin"],
      },
    ],
    "no-use-before-define": "off",
    "prettier/prettier": "error",
    "react/jsx-filename-extension": [
      1,
      {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    ],
    "sort-destructure-keys/sort-destructure-keys": 2,
    "sort-imports": [
      "error",
      {
        ignoreDeclarationSort: true,
      },
    ],
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-use-before-define": [
      "error",
      { functions: false, classes: false, variables: true },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "no-constant-binary-expression": "error",
  },
  globals: {
    React: "writable",
  },
};
