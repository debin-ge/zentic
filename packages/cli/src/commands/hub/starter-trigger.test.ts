import { describe, expect, it } from "vitest";
import { availableStarterTriggerConnections } from "./starter-trigger.js";

describe("starter trigger connections", () => {
  it("returns only concrete connections that can back the generated trigger", () => {
    expect(
      availableStarterTriggerConnections(
        {
          github: [
            {
              slug: "github-debin-ge",
              accountLogin: "debin-ge",
              accountType: "Organization",
              repositories: ["debin-ge/zentic"],
            },
          ],
          slack: [{ slug: "zentic", teamName: "Zentic" }],
          discord: [{ slug: "zentic-discord", guildName: "Zentic Discord" }],
          daemons: [],
          linear: [],
        },
        "debin-ge/zentic",
      ),
    ).toEqual([
      {
        id: "github:debin-ge/zentic",
        label: "GitHub — debin-ge/zentic",
        provider: "github",
        filters: { connection: "github-debin-ge", repo: "debin-ge/zentic" },
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
              slug: "github-debin-ge",
              accountLogin: "debin-ge",
              accountType: "Organization",
              repositories: ["debin-ge/zentic-hub"],
            },
          ],
          slack: [],
          discord: [],
          daemons: [],
          linear: [],
        },
        "debin-ge/zentic",
      ),
    ).toEqual([]);
  });
});
