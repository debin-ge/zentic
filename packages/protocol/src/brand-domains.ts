/**
 * Public domains the product talks to by default.
 *
 * Every hard-coded host name for the website, web app, hub, relay and plugin
 * registry lives here so a rebrand or domain move changes one file. Runtime
 * overrides (config, env vars, CLI flags) still take precedence over these.
 */
export const BRAND_ROOT_DOMAIN = "zentic.sh";

export const BRAND_WEBSITE_URL = `https://${BRAND_ROOT_DOMAIN}`;
export const BRAND_APP_URL = `https://app.${BRAND_ROOT_DOMAIN}`;
export const BRAND_HUB_URL = `https://hub.${BRAND_ROOT_DOMAIN}`;
export const BRAND_PLUGINS_URL = `https://plugins.${BRAND_ROOT_DOMAIN}`;

export const BRAND_RELAY_HOST = `relay.${BRAND_ROOT_DOMAIN}`;
export const BRAND_RELAY_ENDPOINT = `${BRAND_RELAY_HOST}:443`;

/** Absolute URL of a page on the website, e.g. `brandWebsiteUrl("/changelog")`. */
export function brandWebsiteUrl(path = ""): string {
  if (!path) return BRAND_WEBSITE_URL;
  return `${BRAND_WEBSITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute URL of a docs page, e.g. `brandDocsUrl("security")`. */
export function brandDocsUrl(path = ""): string {
  const trimmed = path.replace(/^\/+/, "");
  return brandWebsiteUrl(trimmed ? `/docs/${trimmed}` : "/docs");
}
