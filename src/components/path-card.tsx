import Link from "next/link";

import { localize, type Locale } from "@/core/i18n/locales";
import type { Translator } from "@/core/i18n/translator";
import { mostReadable } from "@/core/theme/color";
import { pathColor } from "@/core/theme/css";
import type { Theme } from "@/core/theme/schema";
import type { PathRow } from "@/server/catalog";

/** A path to choose: its colour or picture, title and promise. */
export function PathCard(props: {
  path: PathRow;
  index: number;
  theme: Theme;
  t: Translator;
  fallback: Locale[];
  href: string;
  /** Embedded on another site: the academy opens in a new tab. */
  newTab?: boolean;
}) {
  const { path, t } = props;
  const title = localize(path.title, t.locale, props.fallback);
  const background = pathColor(props.theme, props.index, path.color);
  // Paths may be dark or light: the initial takes whichever of ink and white reads better.
  const initialColor = /^#[0-9a-f]{6}$/i.test(background)
    ? mostReadable(background, [props.theme.colors.ink, "#FFFFFF"])
    : undefined;
  return (
    <Link
      href={props.href as never}
      className="card card-interactive flex h-full flex-col overflow-hidden"
      // Embedded: no prefetching of /start from inside someone else's page.
      {...(props.newTab ? { target: "_blank", rel: "noopener", prefetch: false } : {})}
    >
      <span
        className="grid h-24 place-items-center border-b-outline border-line"
        style={{ background }}
      >
        {path.visual?.svg || path.visual?.png ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded path picture
          <img
            src={path.visual.svg ?? path.visual.png}
            alt=""
            className="h-20 w-20 object-contain"
          />
        ) : (
          <span className="font-display text-4xl" style={{ color: initialColor }}>
            {title.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="space-y-1 p-5">
        <span className="block font-display text-xl">{title}</span>
        {path.promise && (
          <span className="block text-sm text-muted">
            {localize(path.promise, t.locale, props.fallback)}
          </span>
        )}
        {props.newTab && <span className="sr-only">{t.t("embed.newTab")}</span>}
      </span>
    </Link>
  );
}
