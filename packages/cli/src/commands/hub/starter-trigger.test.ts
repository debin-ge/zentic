import { describe, expect, it } from "vitest";
import { availableStarterTriggerConnections } from "./starter-trigger.js";

describe("starter trigger connections", () => {
  it("returns only concrete connections that can back the generated trigger", () => {
    expect(
      availableStarterTriggerConnections(
        {
          github: [
            {
              slug: "github-getzentic",
              accountLogin: "getzentic",
              accountType: "Organization",
              repositories: ["getzentic/zentic"],
            },
          ],
          slack: [{ slug: "zentic", teamName: "Zentic" }],
          discord: [{ slug: "zentic-discord", guildName: "Zentic Discord" }],
          daemons: [],
          linear: [],
        },
        "getzentic/zentic",
      ),
    ).toEqual([
      {
        id: "github:getzentic/zentic",
        label: "GitHub — getzentic/zentic",
        provider: "github",
        filters: { connection: "github-getzentic", repo: "getzentic/zentic" },
      },
      {
        id: "slack:zentic",
        label: "Slack — Zentic",
        provider: "slack",
        filters: { connection: "zentic" },
      },
      {
        id: "discord:zentic-discord",
        label: "Discord — Zentic Discord",
        provider: "discord",
        filters: { connection: "zentic-discord" },
      },
    ]);
  });

  it("does not offer GitHub when the current repository is not connected", () => {
    expect(
      availableStarterTriggerConnections(
        {
          github: [
            {
              slug: "github-getzentic",
              accountLogin: "getzentic",
              accountType: "Organization",
              repositories: ["getzentic/hub"],
            },
          ],
          slack: [],
          discord: [],
          daemons: [],
          linear: [],
        },
        "getzentic/zentic",
      ),
    ).toEqual([]);
  });
});
