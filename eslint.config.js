const js = require("@eslint/js");
const globals = require("globals");

// Globals del backend de Apps Script
const appsScriptGlobals = {
  SpreadsheetApp: "readonly",
  Session: "readonly",
  HtmlService: "readonly",
  LockService: "readonly",
  ScriptApp: "readonly",
  PropertiesService: "readonly",
  CacheService: "readonly",
  Utilities: "readonly",
  Logger: "readonly",
  console: "readonly"
};

module.exports = [
  {
    ignores: ["node_modules/**"]
  },
  js.configs.recommended,

  // Backend: Code.gs copiado a .tmp/Code.js
  {
    files: [".tmp/Code.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: appsScriptGlobals
    },
    rules: {
      // Las funciones de nivel superior se invocan desde google.script.run
      "no-unused-vars": ["warn", {
        vars: "local",
        args: "after-used",
        caughtErrors: "none"
      }]
    }
  },

  // Frontend: bloque <script> extraído de javascript.html
  {
    files: [".tmp/javascript.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        google: "readonly"
      }
    },
    rules: {
      // Muchas funciones se llaman desde onclick del HTML
      "no-unused-vars": ["warn", {
        vars: "local",
        args: "after-used",
        caughtErrors: "none"
      }]
    }
  },

  // Herramientas de desarrollo
  {
    files: ["eslint.config.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    }
  }
];
