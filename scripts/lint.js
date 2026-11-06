const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const root = path.resolve(__dirname, "..");
const tmpDir = path.join(root, ".tmp");

function extractScript(htmlFile, outFile) {
  const html = fs.readFileSync(path.join(root, htmlFile), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`No se encontró un bloque <script> en ${htmlFile}`);
  }
  fs.writeFileSync(outFile, match[1]);
}

(async () => {
  fs.mkdirSync(tmpDir, { recursive: true });

  // Backend: Code.gs es JS válido, solo cambia la extensión.
  fs.copyFileSync(path.join(root, "Code.gs"), path.join(tmpDir, "Code.js"));

  // Frontend: extraer el contenido del bloque <script>.
  extractScript("javascript.html", path.join(tmpDir, "javascript.js"));

  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles([
    path.join(tmpDir, "Code.js"),
    path.join(tmpDir, "javascript.js")
  ]);

  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  if (output) {
    console.log(output);
  }

  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCount = results.reduce((total, result) => total + result.warningCount, 0);
  console.log(`\n${errorCount} error(es), ${warningCount} aviso(s).`);

  process.exitCode = errorCount > 0 ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
