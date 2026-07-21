"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, style, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    {...props}
    className={cn("fixed inset-x-0 top-0 z-40 bg-black/80", className)}
    style={{
      bottom: "var(--meelni-drawer-content-height, 0px)",
      ...style,
    }}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const contentRef =
    React.useRef<React.ElementRef<typeof DrawerPrimitive.Content>>(null);

  const setContentRef = React.useCallback(
    (node: React.ElementRef<typeof DrawerPrimitive.Content> | null) => {
      contentRef.current = node;
      setRef(ref, node);
    },
    [ref]
  );

  React.useLayoutEffect(() => {
    let frameId = 0;
    let resizeObserver: ResizeObserver | undefined;
    let observedElement: HTMLElement | null = null;

    const updateOverlayBoundary = () => {
      const element =
        contentRef.current ??
        document.querySelector<HTMLElement>("[data-meelni-drawer-content]");
      if (!element) {
        frameId = window.requestAnimationFrame(updateOverlayBoundary);
        return;
      }

      document.documentElement.style.setProperty(
        "--meelni-drawer-content-height",
        `${element.getBoundingClientRect().height}px`
      );

      if (observedElement !== element) {
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(updateOverlayBoundary);
        resizeObserver.observe(element);
        observedElement = element;
      }
    };

    frameId = window.requestAnimationFrame(updateOverlayBoundary);
    window.addEventListener("resize", updateOverlayBoundary);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverlayBoundary);
      document.documentElement.style.removeProperty(
        "--meelni-drawer-content-height"
      );
    };
  }, []);

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={setContentRef}
        className={cn(
          "bg-background fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border",
          className
        )}
        data-meelni-drawer-content=""
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 h-2 w-[100px] rounded-full" />
        {children}
      </DrawerPrimitive.Content>
      <div
        aria-hidden="true"
        data-meelni-drawer-overscroll-fill=""
        className="bg-background pointer-events-none fixed inset-x-0 top-full z-40 h-[200vh]"
      />
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg leading-none font-semibold tracking-tight",
      className
    )}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
