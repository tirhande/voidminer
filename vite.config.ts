import { defineConfig } from "vite";

/**
 * GitHub Pages 는 `https://<user>.github.io/<repo>/` 하위 경로로 서비스되므로
 * 배포 빌드에서만 base 를 리포지토리 이름으로 잡는다. 로컬 dev 는 루트 그대로다.
 */
const GITHUB_PAGES_BASE = "/voidminer/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? GITHUB_PAGES_BASE : "/",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
  },
}));
