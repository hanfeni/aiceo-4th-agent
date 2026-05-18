// 함정 9: Next.js 16 에서 next lint 제거됨. eslint-config-next 16 은 flat
// config 를 직접 export 한다. FlatCompat 사용 금지 (circular structure JSON).
import { globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTs,
  // docs/design-ref/ 는 외부 핸드오프 프로토타입(우리 코드 아님 — lint 비대상).
  globalIgnores([
    ".next/",
    "out/",
    "node_modules/",
    "coverage/",
    "tests/e2e/",
    "docs/",
    "scripts/",
  ]),
];

export default config;
