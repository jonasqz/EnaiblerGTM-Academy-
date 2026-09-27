import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Lesson Markdown. Raw HTML is not rendered (react-markdown escapes it), and
 * images and videos only load from our own origin: a third-party image would leak
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
          img: ({ src, alt }) => {
            if (
              props.untrusted ||
              typeof src !== "string" ||
              !src.startsWith("/") ||
              src.startsWith("//")
            ) {
              return <span className="text-muted">[{alt || "image"}]</span>;
            }
            // Uploaded videos are linked like images: ![Title](/files/<id>.mp4)
            if (/^\/files\/[0-9a-f-]{36}\.(mp4|webm)$/i.test(src)) {
              return (
                <video src={src} controls preload="metadata" playsInline aria-label={alt ?? ""} />
              );
            }
            // eslint-disable-next-line @next/next/no-img-element -- lesson images are author content of any size
            return <img src={src} alt={alt ?? ""} loading="lazy" />;
          },
        }}
      >
        {props.source}
      </ReactMarkdown>
    </div>
  );
}
