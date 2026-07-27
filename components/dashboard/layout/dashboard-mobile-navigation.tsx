"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { DashboardUser } from "./dashboard-layout";
import {
  type DashboardActiveSection,
  DASHBOARD_NAVIGATION_ITEMS,
  getDashboardSectionLabel,
} from "./dashboard-navigation";

interface DashboardMobileNavigationProps {
  activeSection: DashboardActiveSection;
  user?: DashboardUser | null;
  onSignOut?: () => void;
}

export const DASHBOARD_MOBILE_NAV_CLASS_NAME =
  "border-dashboard-panel-border bg-dashboard-canvas flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 md:hidden";

export function DashboardMobileNavigation({
  activeSection,
  user,
  onSignOut,
}: DashboardMobileNavigationProps) {
  const currentLabel = getDashboardSectionLabel(activeSection);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationDialogId = "dashboard-mobile-navigation";

  return (
    <nav aria-label="Workspace" className={DASHBOARD_MOBILE_NAV_CLASS_NAME}>
      <div className="flex min-w-0 items-center gap-2">
        <NavigationDrawer
          open={navigationOpen}
          onOpenChange={setNavigationOpen}
        >
          <NavigationDrawerTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground h-10 w-10 shrink-0"
              aria-label="Open workspace navigation"
              aria-haspopup="dialog"
              aria-expanded={navigationOpen}
              aria-controls={navigationOpen ? navigationDialogId : undefined}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </NavigationDrawerTrigger>
          <NavigationDrawerContent
            id={navigationDialogId}
            className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground [--accent:#24242a] [--border:var(--dashboard-panel-border)] [--foreground:var(--dashboard-foreground)] [--muted-foreground:var(--dashboard-muted)] [--muted:#2a2a31] [--primary-foreground:var(--dashboard-accent-foreground)] [--primary:var(--dashboard-accent)] [--ring:var(--dashboard-accent)]"
            closeClassName="text-dashboard-muted hover:bg-dashboard-muted/15 hover:text-dashboard-foreground"
            overlayClassName="bg-black/75"
          >
            <NavigationDrawerHeader className="border-dashboard-panel-border">
              <NavigationDrawerTitle>Meelni</NavigationDrawerTitle>
              <NavigationDrawerDescription className="text-dashboard-muted truncate">
                Your PM interview practice workspace.
              </NavigationDrawerDescription>
            </NavigationDrawerHeader>
            <NavigationDrawerBody>
              <p className="text-dashboard-muted px-3 pb-2 text-xs font-semibold tracking-[0.12em] uppercase">
                Workspace
              </p>
              <div className="space-y-1">
                {DASHBOARD_NAVIGATION_ITEMS.map((item) => {
                  const selected = activeSection === item.id;

                  return (
                    <NavigationDrawerClose key={item.id} asChild>
                      <Link
                        href={item.href}
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none",
                          selected
                            ? "bg-dashboard-muted/20 text-dashboard-foreground"
                            : "text-dashboard-muted hover:bg-dashboard-muted/10 hover:text-dashboard-foreground"
                        )}
                      >
                        <item.icon
                          className="h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        {selected && (
                          <span
                            className="bg-dashboard-accent h-2 w-2 rounded-full"
                            aria-hidden="true"
                          />
                        )}
                      </Link>
                    </NavigationDrawerClose>
                  );
                })}
              </div>
            </NavigationDrawerBody>
            <NavigationDrawerFooter className="border-dashboard-panel-border space-y-4">
              <Button
                asChild
                className="bg-dashboard-accent text-dashboard-accent-foreground hover:bg-dashboard-accent/90 min-h-11 w-full gap-2"
              >
                <Link
                  href="/dashboard/new-interview"
                  aria-current={
                    activeSection === "new-interview" ? "page" : undefined
                  }
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  New Mock Interview
                </Link>
              </Button>
              {user && (
                <div className="flex min-w-0 items-center gap-3 px-1">
                  <div className="border-dashboard-accent/30 bg-dashboard-accent/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">
                    <span className="text-dashboard-foreground text-xs font-bold">
                      {(user.user_metadata?.full_name || user.email || "U")
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-dashboard-foreground truncate text-sm font-semibold">
                      {user.user_metadata?.full_name ||
                        user.email?.split("@")[0] ||
                        "User"}
                    </p>
                    <p className="text-dashboard-muted truncate text-xs">
                      {user.email}
                    </p>
                  </div>
                  {onSignOut && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={onSignOut}
                      className="text-dashboard-muted hover:bg-dashboard-muted/15 hover:text-dashboard-foreground h-10 w-10 shrink-0"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </NavigationDrawerFooter>
          </NavigationDrawerContent>
        </NavigationDrawer>
        <Link
          href="/dashboard"
          className="text-dashboard-foreground focus-visible:ring-ring min-w-0 truncate rounded-sm text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="sr-only">Meelni, </span>
          {currentLabel}
        </Link>
      </div>

      <Button
        asChild
        size="icon"
        className="bg-dashboard-accent text-dashboard-accent-foreground hover:bg-dashboard-accent/90 h-10 w-10 shrink-0"
      >
        <Link
          href="/dashboard/new-interview"
          aria-current={activeSection === "new-interview" ? "page" : undefined}
          aria-label="Start a new mock interview"
          title="New Mock Interview"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">New interview</span>
        </Link>
      </Button>
    </nav>
  );
}
