import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "src/api/schema.d.ts", "e2e/.results", "e2e/.report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // Accessibility in JSX (review recommendation 15): what axe finds at runtime, caught where the
  // markup is written. The jsx-a11y fork that supports ESLint 10.
  { files: ["**/*.tsx"], ...jsxA11y.configs.recommended },
  {
    files: ["**/*.tsx"],
    rules: {
      // A scrolling region takes focus so the keyboard can scroll it (WCAG 2.1.1, axe's
      // scrollable-region-focusable); that is the one non-interactive role given a tab stop.
      "jsx-a11y-x/no-noninteractive-tabindex": ["error", { roles: ["region", "tabpanel"] }],
      // Key handlers on a form, panel or dialog catch keys bubbling from the control that has
      // focus (Esc closes, 1 to 9 answer). Only a click or mouse handler would make the element
      // a pseudo-button, so those stay errors.
      "jsx-a11y-x/no-noninteractive-element-interactions": [
        "error",
        { handlers: ["onClick", "onMouseDown", "onMouseUp"] },
      ],
      "jsx-a11y-x/no-static-element-interactions": [
        "error",
        { handlers: ["onClick", "onMouseDown", "onMouseUp"] },
      ],
    },
  },
);
