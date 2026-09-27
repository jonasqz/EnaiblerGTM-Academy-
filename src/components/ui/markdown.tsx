import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Lesson Markdown. Raw HTML is not rendered (react-markdown escapes it), and
 * images only load from our own origin: a third-party image would leak
 * learner IP addresses (brief §9, self-hosting). Text written by learners is
 * rendered with `untrusted`: no images at all, so a submission cannot make a
 * reviewer's browser request anything, and links do not pass a referrer.
 */
export function Markdown(props: { source: string; untrusted?: boolean }) {
  return (
    <div className="prose-lesson">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const external = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...(external || props.untrusted
                  ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                  : {})}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) =>
            !props.untrusted &&
            typeof src === "string" &&
            src.startsWith("/") &&
            !src.startsWith("//") ? (
              // eslint-disable-next-line @next/next/no-img-element -- lesson images are author content of any size
              <img src={src} alt={alt ?? ""} loading="lazy" />
            ) : (
              <span className="text-muted">[{alt || "image"}]</span>
            ),
        }}
      >
        {props.source}
      </ReactMarkdown>
    </div>
  );
}
