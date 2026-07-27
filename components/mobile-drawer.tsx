"use client";

import { Icons } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  NavigationDrawer,
  NavigationDrawerBody,
  NavigationDrawerClose,
  NavigationDrawerContent,
  NavigationDrawerDescription,
  NavigationDrawerFooter,
  NavigationDrawerHeader,
  NavigationDrawerTitle,
  NavigationDrawerTrigger,
} from "@/components/ui/navigation-drawer";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAuth } from "@/app/providers/auth-provider";
import {
  BookOpen,
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  Loader2,
  LogIn,
  Menu,
  MessageCircleQuestion,
  Mic,
  Newspaper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PublicActivationButton } from "@/components/public-activation-action";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";
import { useId, useState } from "react";

interface PublicNavigationItem {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  requiresActivation?: boolean;
}

const publicNavigation: readonly PublicNavigationItem[] = [
  {
    label: "How it works",
    description: "See the practice and feedback experience",
    href: "/#features",
    icon: Sparkles,
    requiresActivation: true,
  },
  {
    label: "Questions",
    description: "Browse real PM interview prompts",
    href: "/explore",
    icon: BookOpen,
  },
  {
    label: "Companies",
    description: "Prepare for specific interview loops",
    href: "/companies",
    icon: Building2,
  },
  {
    label: "Pricing",
    description: "Compare interview practice options",
    href: "/pricing",
    icon: CircleDollarSign,
  },
  {
    label: "Blog",
    description: "Read practical PM interview guidance",
    href: "/blog",
    icon: Newspaper,
  },
  {
    label: "Contact",
    description: "Get help from the Meelni team",
    href: "/contact",
    icon: MessageCircleQuestion,
  },
];

export function MobileDrawer() {
  const { user, isLoading } = useAuth();
  const activation = usePublicActivationDecision();
  const [open, setOpen] = useState(false);
  const drawerContentId = `mobile-navigation-${useId().replaceAll(":", "")}`;

  return (
    <NavigationDrawer open={open} onOpenChange={setOpen}>
      <NavigationDrawerTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          aria-controls={open ? drawerContentId : undefined}
          aria-expanded={open}
          className="min-h-11 min-w-11 rounded-lg"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </Button>
      </NavigationDrawerTrigger>
      <NavigationDrawerContent id={drawerContentId}>
        <NavigationDrawerHeader>
          <NavigationDrawerClose asChild>
            <Link
              href="/"
              title="Meelni home"
              className="focus-visible:ring-ring flex w-fit items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:outline-none"
            >
              <Icons.logo className="text-primary h-7 w-7" />
              <NavigationDrawerTitle>{siteConfig.name}</NavigationDrawerTitle>
            </Link>
          </NavigationDrawerClose>
          <NavigationDrawerDescription className="truncate">
            Live PM interview practice, from question to feedback.
          </NavigationDrawerDescription>
        </NavigationDrawerHeader>

        <NavigationDrawerBody>
          <p className="text-muted-foreground px-3 pb-2 text-xs font-semibold tracking-[0.12em] uppercase">
            Explore
          </p>
          <nav aria-label="Public navigation" className="space-y-1">
            {publicNavigation
              .filter(
                (item) => activation.canActivate || !item.requiresActivation
              )
              .map((item) => (
                <NavigationDrawerClose key={item.href} asChild>
                  <Link
                    href={item.href}
                    className="hover:bg-accent focus-visible:ring-ring group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="bg-muted text-muted-foreground group-hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-foreground block text-sm font-semibold">
                        {item.label}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs leading-4">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </NavigationDrawerClose>
              ))}
          </nav>
        </NavigationDrawerBody>

        <NavigationDrawerFooter className="space-y-3">
          {isLoading ? (
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
            <>
              <div className="px-1">
                <p className="text-muted-foreground text-xs">Signed in as</p>
                <p className="text-foreground truncate text-sm font-semibold">
                  {user.user_metadata?.full_name?.split(" ")[0] ||
                    user.email?.split("@")[0] ||
                    "User"}
                </p>
              </div>
              <NavigationDrawerClose asChild>
                <Link
                  href="/dashboard"
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "text-primary-foreground min-h-11 w-full gap-2 rounded-lg"
                  )}
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Go to Dashboard
                </Link>
              </NavigationDrawerClose>
            </>
          ) : (
            <>
              <PublicActivationButton
                href={NEW_INTERVIEW_PATH}
                variant={activation.canActivate ? "default" : "outline"}
                className={cn(
                  "min-h-11 w-full gap-2 rounded-lg",
                  activation.canActivate && "text-primary-foreground"
                )}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                {siteConfig.cta}
              </PublicActivationButton>
              <NavigationDrawerClose asChild>
                <Link
                  href="/auth/signin"
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "min-h-11 w-full gap-2 rounded-lg"
                  )}
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Log In
                </Link>
              </NavigationDrawerClose>
            </>
          )}
        </NavigationDrawerFooter>
      </NavigationDrawerContent>
    </NavigationDrawer>
  );
}
