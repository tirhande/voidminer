/**
 * dist/ 빌드 결과를 파일 하나짜리 HTML 조각으로 합친다.
 *
 * 외부 요청이 전부 차단된 환경(엄격한 CSP, iframe 샌드박스)에서도 그대로
 * 열리도록, 스크립트를 인라인으로 넣고 doctype/html/head/body 래퍼는 뺀다.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(projectRoot, "dist");
const outputPath = join(projectRoot, "dist-standalone", "voidminer.html");

const distIndex = await readFile(join(distDir, "index.html"), "utf8");

const scriptMatch = distIndex.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
if (scriptMatch === null) {
  throw new Error("dist/index.html 에서 스크립트 태그를 찾지 못했다.");
}

const bundlePath = join(distDir, scriptMatch[1].replace(/^\//, ""));
const bundleSource = await readFile(bundlePath, "utf8");

const styleMatch = distIndex.match(/<style>[\s\S]*?<\/style>/);
if (styleMatch === null) {
  throw new Error("dist/index.html 에서 스타일 블록을 찾지 못했다.");
}

const bodyMatch = distIndex.match(/<body>([\s\S]*?)<\/body>/);
if (bodyMatch === null) {
  throw new Error("dist/index.html 에서 body 를 찾지 못했다.");
}

const bodyContent = bodyMatch[1].replace(scriptMatch[0], "").trim();

const page = [
  "<title>VOIDMINER</title>",
  styleMatch[0],
  bodyContent,
  `<script type="module">\n${bundleSource}\n</script>`,
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, page, "utf8");

const sizeKb = (Buffer.byteLength(page, "utf8") / 1024).toFixed(1);
console.log(`standalone 빌드 완료: ${outputPath} (${sizeKb} kB)`);
