import { ArrowRight, Check, Plus, type LucideIcon } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

/*
 * Building blocks of enaibler's website: sections, headings, screens in
 * frames, lists. enaibler's own theme (DEFAULT_THEME) through the usual
 * tokens; links are plain anchors because the platform pages live behind
 * the proxy's rewrite (src/proxy.ts), not under typed routes.
 */

const join = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export function Container(props: { children: ReactNode; className?: string }) {
  return (
    <div className={join("mx-auto w-full max-w-6xl px-4", props.className)}>{props.children}</div>
  );
}

export type Tone = "plain" | "card" | "dark";

const TONES: Record<Tone, string> = {
  plain: "bg-surface",
  card: "border-y border-line bg-card",
  dark: "bg-ink text-surface",
};

export function Section(props: {
  id?: string;
  tone?: Tone;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={props.id}
      aria-labelledby={props.labelledBy}
      className={join("scroll-mt-20 py-16 sm:py-24", TONES[props.tone ?? "plain"], props.className)}
    >
      <Container>{props.children}</Container>
    </section>
  );
}

export function Eyebrow(props: { children: ReactNode; tone?: Tone }) {
  return (
    <p
      className={join(
        "text-xs font-semibold tracking-[0.12em] uppercase",
        props.tone === "dark" ? "text-accent-1" : "text-primary",
      )}
    >
      {props.children}
    </p>
  );
}

export function SectionHeading(props: {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  tone?: Tone;
  center?: boolean;
}) {
  return (
    <div className={join("max-w-3xl space-y-4", props.center && "mx-auto text-center")}>
      {props.eyebrow && <Eyebrow tone={props.tone}>{props.eyebrow}</Eyebrow>}
      <h2
        id={props.id}
        className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
      >
        {props.title}
      </h2>
      {props.intro && (
        <p
          className={join(
            "text-lg leading-relaxed",
            props.tone === "dark" ? "text-surface/75" : "text-muted",
          )}
        >
          {props.intro}
        </p>
      )}
    </div>
  );
}

export function ButtonLink(props: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "inverse";
  external?: { label: string };
  className?: string;
}) {
  const variant = props.variant ?? "primary";
  return (
    <a
      href={props.href}
      className={join(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "secondary" && "btn-secondary",
        variant === "inverse" && "border-transparent bg-card text-ink",
        props.className,
      )}
      {...(props.external ? { target: "_blank", rel: "noopener" } : {})}
    >
      {props.children}
      {variant === "primary" || variant === "inverse" ? <ArrowRight aria-hidden size={18} /> : null}
      {props.external && <span className="sr-only"> ({props.external.label})</span>}
    </a>
  );
}

/** A screen of the product in a plain browser window. */
export function BrowserFrame(props: {
  image: StaticImageData;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={join(
        "overflow-hidden rounded-card border border-line bg-card shadow-card",
        props.className,
      )}
    >
      <div aria-hidden className="flex gap-1.5 border-b border-line bg-subtle px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-accent-4/70" />
        <span className="size-2.5 rounded-full bg-accent-3/70" />
        <span className="size-2.5 rounded-full bg-accent-2/70" />
      </div>
      <Image
        src={props.image}
        alt={props.alt}
        sizes={props.sizes}
        priority={props.priority}
        placeholder="blur"
        className="block h-auto w-full"
      />
    </figure>
  );
}

/** A screen of the product on a phone. */
export function PhoneFrame(props: {
  image: StaticImageData;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure
      className={join(
        "overflow-hidden rounded-[2.25rem] border-[7px] border-ink bg-ink shadow-card",
        props.className,
      )}
    >
      <Image
        src={props.image}
        alt={props.alt}
        sizes="(min-width: 640px) 280px, 70vw"
        priority={props.priority}
        placeholder="blur"
        className="block h-auto w-full rounded-[1.75rem]"
      />
    </figure>
  );
}

/** The certificate's share image the way a LinkedIn feed shows a link. */
export function LinkPreview(props: {
  image: StaticImageData;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure className={join("card overflow-hidden p-0", props.className)}>
      <Image
        src={props.image}
        alt={props.alt}
        sizes="(min-width: 1024px) 360px, 80vw"
        placeholder="blur"
        className="block h-auto w-full"
      />
      <figcaption className="border-t border-line px-4 py-3 text-sm font-semibold">
        {props.caption}
      </figcaption>
    </figure>
  );
}

export function ScreensNote(props: { children: ReactNode; tone?: Tone }) {
  return (
    <p className={join("text-xs", props.tone === "dark" ? "text-surface/60" : "text-muted")}>
      {props.children}
    </p>
  );
}

/** Icon, title and a short text per item, in a responsive grid. */
export function ItemGrid(props: {
  items: ReadonlyArray<{ title: string; body: string }>;
  icons: readonly LucideIcon[];
  columns?: 2 | 3 | 4;
  tone?: Tone;
}) {
  const columns = props.columns ?? 3;
  return (
    <ul
      className={join(
        "grid gap-x-8 gap-y-10 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
      )}
    >
      {props.items.map((item, index) => {
        const Icon = props.icons[index % props.icons.length]!;
        return (
          <li key={item.title} className="space-y-3">
            <span
              className={join(
                "grid size-11 place-items-center rounded-control",
                props.tone === "dark"
                  ? "bg-surface/10 text-accent-1"
                  : "bg-primary-soft text-primary",
              )}
            >
              <Icon aria-hidden size={22} />
            </span>
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className={props.tone === "dark" ? "text-surface/75" : "text-muted"}>{item.body}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** Numbered steps, in order. */
export function Steps(props: {
  steps: ReadonlyArray<{ title: string; body: string }>;
  columns?: 3 | 4;
}) {
  return (
    <ol
      className={join(
        "grid gap-6 sm:grid-cols-2",
        props.columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      {props.steps.map((step, index) => (
        <li key={step.title} className="card-flat space-y-3 p-6">
          <span className="grid size-9 place-items-center rounded-full bg-primary font-semibold text-on-primary">
            {index + 1}
          </span>
          <h3 className="text-lg font-semibold">{step.title}</h3>
          <p className="text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function CheckList(props: { items: readonly string[]; tone?: Tone }) {
  return (
    <ul className="space-y-3">
      {props.items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check
            aria-hidden
            size={20}
            className={join(
              "mt-0.5 shrink-0",
              props.tone === "dark" ? "text-accent-2" : "text-primary",
            )}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Faq(props: {
  id: string;
  title: string;
  items: ReadonlyArray<{ q: string; a: string }>;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <h2 id={props.id} className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {props.title}
      </h2>
      <div className="divide-y divide-line border-y border-line">
        {props.items.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                aria-hidden
                size={22}
                className="mt-1 shrink-0 text-primary transition-transform group-open:rotate-45"
              />
            </summary>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

/** The closing call to action every page ends with. */
export function CloseCta(props: { title: string; body: string; button: string; href: string }) {
  return (
    <section aria-labelledby="close-heading" className="bg-primary py-16 text-on-primary sm:py-20">
      <Container className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <h2
            id="close-heading"
            className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
          >
            {props.title}
          </h2>
          <p className="text-lg opacity-90">{props.body}</p>
        </div>
        <ButtonLink href={props.href} variant="inverse" className="shrink-0">
          {props.button}
        </ButtonLink>
      </Container>
    </section>
  );
}
