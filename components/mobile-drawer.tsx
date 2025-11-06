"use client";

import { Icons } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { IoMenuSharp } from "react-icons/io5";
import { useAuth } from "@/app/providers/auth-provider";
import { Loader2 } from "lucide-react";

export function MobileDrawer() {
  const { user, isLoading } = useAuth();

  return (
    <Drawer>
      <DrawerTrigger>
        <IoMenuSharp className="text-2xl" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="px-6">
          <Link
            href="/"
            title="brand-logo"
            className="relative mr-6 flex items-center space-x-2"
          >
            <Icons.logo className="w-auto h-[40px]" />
            <DrawerTitle>{siteConfig.name}</DrawerTitle>
          </Link>
          <DrawerDescription>{siteConfig.description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="space-y-3">
          {isLoading ? (
            // Loading state
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : user ? (
            // Logged in: Show greeting + Dashboard button
            <>
              <div className="text-center pb-2">
                <p className="text-sm text-muted-foreground">Welcome back,</p>
                <p className="text-lg font-semibold text-foreground">
                  {user.user_metadata?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "User"}
                </p>
              </div>
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "text-white rounded-full"
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
                  "rounded-full"
                )}
              >
                Log In
              </Link>
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "text-white rounded-full"
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
