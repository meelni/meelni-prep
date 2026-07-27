"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  type DashboardActiveSection,
  DASHBOARD_NAVIGATION_ITEMS,
  getDashboardSectionLabel,
} from "./dashboard-navigation";

interface DashboardMobileNavigationProps {
  activeSection: DashboardActiveSection;
}

export const DASHBOARD_MOBILE_NAV_CLASS_NAME =
  "border-dashboard-panel-border bg-dashboard-canvas flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 md:hidden";

export function DashboardMobileNavigation({
  activeSection,
}: DashboardMobileNavigationProps) {
  const currentLabel = getDashboardSectionLabel(activeSection);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationDialogId = "dashboard-mobile-navigation";

  return (
    <nav aria-label="Workspace" className={DASHBOARD_MOBILE_NAV_CLASS_NAME}>
      <div className="flex min-w-0 items-center gap-2">
        <Drawer open={navigationOpen} onOpenChange={setNavigationOpen}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground h-10 w-10 shrink-0"
            aria-label="Open workspace navigation"
            aria-haspopup="dialog"
            aria-expanded={navigationOpen}
            aria-controls={navigationOpen ? navigationDialogId : undefined}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
          <DrawerContent
            id={navigationDialogId}
            className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground max-h-[min(82dvh,680px)]"
          >
            <DrawerHeader className="px-5 pb-2 text-left">
              <DrawerTitle>Workspace</DrawerTitle>
              <DrawerDescription className="text-dashboard-muted">
                Choose a dashboard destination.
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <div className="space-y-1">
                {DASHBOARD_NAVIGATION_ITEMS.map((item) => {
                  const selected = activeSection === item.id;

                  return (
                    <DrawerClose key={item.id} asChild>
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
                    </DrawerClose>
                  );
                })}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
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
        size="sm"
        className="bg-dashboard-accent text-dashboard-accent-foreground hover:bg-dashboard-accent/90 h-10 shrink-0 gap-2 px-3"
      >
        <Link
          href="/dashboard/new-interview"
          aria-current={activeSection === "new-interview" ? "page" : undefined}
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          <span>New interview</span>
        </Link>
      </Button>
    </nav>
  );
}
