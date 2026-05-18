// 함정 9: Next.js 16 에서 next lint 제거됨. eslint-config-next 16 은 flat
// config 를 직접 export 한다. FlatCompat 사용 금지 (circular structure JSON).
import { globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTs,
  globalIgnores([".next/", "out/", "node_modules/", "coverage/", "tests/e2e/"]),
];

export default config;
