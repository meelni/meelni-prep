import { forwardRef } from "react";

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  alt: string;
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
};

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { alt, src, fill: _fill, priority: _priority, ...props },
  ref
) {
  return (
    // The fixture preserves the production Image contract without a Next server.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={ref}
      alt={alt}
      src={typeof src === "string" ? src : src.src}
    />
  );
});

export default Image;
