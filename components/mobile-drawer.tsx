"use client";

import { Icons } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAuth } from "@/app/providers/auth-provider";
import { Loader2, Menu } from "lucide-react";
import { PublicActivationButton } from "@/components/public-activation-action";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";
import { useId, useState } from "react";

const publicNavigation = [
  { label: "Questions", href: "/explore" },
  { label: "Companies", href: "/companies" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
] as const;

export function MobileDrawer() {
  const { user, isLoading } = useAuth();
  const activation = usePublicActivationDecision();
  const [open, setOpen] = useState(false);
  const drawerContentId = `mobile-navigation-${useId().replaceAll(":", "")}`;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        aria-label="Open navigation menu"
        aria-controls={open ? drawerContentId : undefined}
        className="focus-visible:ring-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent id={drawerContentId}>
        <DrawerHeader className="px-6">
          <Link
            href="/"
            title="brand-logo"
            className="relative mr-6 flex items-center space-x-2"
          >
            <Icons.logo className="h-10 w-auto" />
            <DrawerTitle>{siteConfig.name}</DrawerTitle>
          </Link>
          <DrawerDescription className="bg-background">
            {siteConfig.description}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="space-y-3">
          <nav
            aria-label="Public navigation"
            className="grid grid-cols-2 gap-2"
          >
            {publicNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "min-h-11 rounded-lg"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {isLoading ? (
            // Loading state
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="flex items-center justify-center py-4"
            >
              <Loader2
                className="text-primary h-6 w-6 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span className="sr-only">Loading navigation</span>
            </div>
          ) : user ? (
            // Logged in: Show greeting + Dashboard button
            <>
              <div className="pb-2 text-center">
                <p className="text-muted-foreground text-sm">Welcome back,</p>
                <p className="text-foreground text-lg font-semibold">
                  {user.user_metadata?.full_name?.split(" ")[0] ||
                    user.email?.split("@")[0] ||
                    "User"}
                </p>
              </div>
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "text-primary-foreground min-h-11 rounded-lg"
                )}
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            // Logged out: Show Log In + Start A Mock
            <>
              <Link
                href="/auth/signin"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "min-h-11 rounded-lg"
                )}
              >
                Log In
              </Link>
              <PublicActivationButton
                href={NEW_INTERVIEW_PATH}
                variant={activation.canActivate ? "default" : "outline"}
                className={cn(
                  "min-h-11 rounded-lg",
                  activation.canActivate && "text-primary-foreground"
                )}
              >
                {siteConfig.cta}
              </PublicActivationButton>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
