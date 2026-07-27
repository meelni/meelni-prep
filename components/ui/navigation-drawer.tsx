"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const NavigationDrawer = DialogPrimitive.Root;
const NavigationDrawerTrigger = DialogPrimitive.Trigger;
const NavigationDrawerClose = DialogPrimitive.Close;

const NavigationDrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "bg-overlay/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 duration-200 motion-reduce:animate-none motion-reduce:transition-none",
      className
    )}
    {...props}
  />
));
NavigationDrawerOverlay.displayName = DialogPrimitive.Overlay.displayName;

type NavigationDrawerContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  closeClassName?: string;
  overlayClassName?: string;
};

const NavigationDrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  NavigationDrawerContentProps
>(
  (
    { children, className, closeClassName, overlayClassName, ...props },
    ref
  ) => (
    <DialogPrimitive.Portal>
      <NavigationDrawerOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "bg-background text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-[51] flex h-dvh w-[min(88vw,22rem)] flex-col border-r shadow-2xl duration-200 focus:outline-none motion-reduce:animate-none motion-reduce:transition-none motion-reduce:duration-0",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            closeClassName
          )}
        >
          <X className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Close navigation</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
);
NavigationDrawerContent.displayName = DialogPrimitive.Content.displayName;

const NavigationDrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "border-border flex shrink-0 flex-col gap-5 border-b px-5 pt-[calc(1rem+env(safe-area-inset-top))] pr-16 pb-5 text-left",
      className
    )}
    {...props}
  />
);
NavigationDrawerHeader.displayName = "NavigationDrawerHeader";

const NavigationDrawerBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-4", className)}
    {...props}
  />
);
NavigationDrawerBody.displayName = "NavigationDrawerBody";

const NavigationDrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "border-border mt-auto shrink-0 border-t px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
      className
    )}
    {...props}
  />
);
NavigationDrawerFooter.displayName = "NavigationDrawerFooter";

const NavigationDrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg leading-6 font-semibold tracking-tight", className)}
    {...props}
  />
));
NavigationDrawerTitle.displayName = DialogPrimitive.Title.displayName;

const NavigationDrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground text-sm leading-5", className)}
    {...props}
  />
));
NavigationDrawerDescription.displayName =
  DialogPrimitive.Description.displayName;

export {
  NavigationDrawer,
  NavigationDrawerBody,
  NavigationDrawerClose,
  NavigationDrawerContent,
  NavigationDrawerDescription,
  NavigationDrawerFooter,
  NavigationDrawerHeader,
  NavigationDrawerTitle,
  NavigationDrawerTrigger,
};
