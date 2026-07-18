import { forwardRef } from "react";

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
};

function toHref(href: LinkProps["href"]): string {
  if (typeof href === "string") return href;
  const params = new URLSearchParams(href.query ?? {});
  return `${href.pathname ?? "/"}${params.size ? `?${params}` : ""}`;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, ...props },
  ref
) {
  return (
    <a
      {...props}
      ref={ref}
      role="link"
      tabIndex={0}
      data-browser-qa-href={toHref(href)}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  );
});

export default Link;
