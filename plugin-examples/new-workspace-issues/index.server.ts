import type { PluginServerContext } from "@getzentic/plugin/server";
import { searchIssues } from "./server/issues";
import { searchIssuesRpc } from "./shared/issues";

export default function contribute(server: PluginServerContext) {
  server.handle(searchIssuesRpc, searchIssues);
  return () => {};
}
