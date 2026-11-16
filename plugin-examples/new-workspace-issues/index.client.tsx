import type { PluginClientContext } from "@getzentic/plugin/client";
import { IssueField } from "./client/issue-field";

export default function contribute(client: PluginClientContext) {
  client.addNewWorkspaceItem({ id: "issue", Component: IssueField });
  return () => {};
}
