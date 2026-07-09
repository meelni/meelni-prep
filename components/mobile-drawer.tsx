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

export function MobileDrawer() {
  const { user, isLoading } = useAuth();

  return (
    <Drawer>
      <DrawerTrigger aria-label="Open navigation menu">
        <Menu className="h-6 w-6" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="px-6">
          <Link
            href="/"
            title="brand-logo"
            className="relative mr-6 flex items-center space-x-2"
          >
            <Icons.logo className="h-10 w-auto" />
            <DrawerTitle>{siteConfig.name}</DrawerTitle>
          </Link>
          <DrawerDescription>{siteConfig.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="space-y-3">
          {isLoading ? (
            // Loading state
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-primary h-6 w-6 animate-spin" />
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
                  "text-primary-foreground rounded-lg"
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
                  "rounded-lg"
                )}
              >
                Log In
              </Link>
              <Link
                href="/dashboard/new-interview"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "text-primary-foreground rounded-lg"
                )}
              >
                {siteConfig.cta}
              </Link>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
