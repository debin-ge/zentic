import { BRAND_HUB_URL } from "@getzentic/protocol/brand-domains";
import type { Command } from "commander";

const resolutionHelp = `\nHub origin precedence: command origin/--hub, ZENTIC_HUB_URL, active stored login, then ${BRAND_HUB_URL}.\nCredential precedence: --api-key, ZENTIC_HUB_API_KEY, then a stored login for the exact resolved origin.\n`;

export function addHubResolutionHelp(command: Command): Command {
  return command.addHelpText("after", resolutionHelp);
}
