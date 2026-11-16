import path from "node:path";

import { resolveZenticHome } from "../../../zentic-home.js";

const OPENCODE_HOME_DIRNAME = "opencode-home";

export function resolveOpenCodeHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveZenticHome(env), OPENCODE_HOME_DIRNAME);
}
