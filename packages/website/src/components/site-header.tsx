import { useTranslation } from "react-i18next";
import { PLUGINS_LINKED } from "~/plugins/launch";
import "~/styles.css";
import { GitHubIcon } from "~/components/brand-icons";
import { LanguageSelector } from "~/components/language-selector";
import { useLocalizePath } from "~/i18n";

const NAV_LINK_CLASS = "text-sm text-muted-foreground hover:text-foreground transition-colors";

export function SiteHeader() {
  const { t } = useTranslation();
  const localize = useLocalizePath();
  return (
    <header className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
      <a href={localize("/")} className="flex items-center gap-3">
        <img src="/logo.svg" alt="Zentic" className="w-6 h-6" />
        <span className="text-lg font-medium">Zentic</span>
      </a>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {PLUGINS_LINKED && (
          <a href={localize("/plugins")} className={NAV_LINK_CLASS}>
            {t("nav.plugins")}
          </a>
        )}
        <a href={localize("/blog")} className={NAV_LINK_CLASS}>
          {t("nav.blog")}
        </a>
        <a href={localize("/docs")} className={NAV_LINK_CLASS}>
          {t("nav.docs")}
        </a>
        <a href={localize("/changelog")} className={NAV_LINK_CLASS}>
          {t("nav.changelog")}
        </a>
        <a href={localize("/download")} className={NAV_LINK_CLASS}>
          {t("nav.download")}
        </a>
        <LanguageSelector />
        <a
          href="https://github.com/debin-ge/zentic"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
        >
          <GitHubIcon width="18" height="18" />
        </a>
      </div>
    </header>
  );
}
