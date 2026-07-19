"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icons } from "@/components/icons";
import { MobileDrawer } from "@/components/mobile-drawer";
import { FeatureFlagDevMenu } from "@/components/feature-flags/feature-flag-dev-menu";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { siteConfig } from "@/lib/config";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";
import { PublicActivationButton } from "@/components/public-activation-action";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";
import { cn } from "@/lib/utils";

const navLinks = [
  { name: "Features", href: "/#features" },
  { name: "Questions", href: "/explore" },
  { name: "Companies", href: "/companies" },
  { name: "Pricing", href: "/pricing" },
  { name: "Blog", href: "/blog" },
];

export function Header() {
  const [activeSection, setActiveSection] = useState("");
  const activation = usePublicActivationDecision();
  const { user } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["features", "blog"];
      const current = sections.find((section) => {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          return rect.top <= 100 && rect.bottom >= 100;
        }
        return false;
      });
      setActiveSection(current || "");
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <motion.header
      className="border-border/70 bg-background/95 sticky top-0 z-50 h-[72px] w-full border-b backdrop-blur-xl"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mx-auto h-full max-w-[1216px] px-6">
        <div className="flex h-full items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {/* Logo */}
            <Link href="/" className="group relative flex items-center gap-3">
              <motion.div
                initial={{ rotate: -180, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <Icons.logo className="text-primary h-7 w-7 transition-transform duration-300 group-hover:scale-105" />
              </motion.div>
              <span className="text-foreground font-sans text-xl font-semibold">
                {siteConfig.name}
              </span>
            </Link>
            <FeatureFlagDevMenu gateEnabled={activation.canActivate} />
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks
              .filter(
                (link) => activation.canActivate || link.name !== "Features"
              )
              .map((link) => {
                const isActive = activeSection === link.href.slice(1);
                const isExternalRoute = link.href.startsWith("/");
                return (
                  <div key={link.name}>
                    {isExternalRoute ? (
                      <Link
                        href={link.href}
                        className="group text-muted-foreground hover:text-foreground relative text-sm font-medium transition-colors duration-200"
                      >
                        {link.name}

                        {/* Underline animation */}
                        <span className="bg-primary absolute -bottom-1 left-1/2 h-0.5 w-0 -translate-x-1/2 transition-all duration-300 ease-out group-hover:w-full" />
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        onClick={(e) => handleSmoothScroll(e, link.href)}
                        className="group text-muted-foreground hover:text-foreground relative text-sm font-medium transition-colors duration-200"
                      >
                        {link.name}

                        {/* Underline animation */}
                        <span
                          className={cn(
                            "bg-primary absolute -bottom-1 left-1/2 h-0.5 transition-all duration-300 ease-out",
                            isActive
                              ? "w-full -translate-x-1/2"
                              : "w-0 -translate-x-1/2 group-hover:w-full"
                          )}
                        />
                      </a>
                    )}
                  </div>
                );
              })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "rounded-lg px-4"
                )}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "rounded-lg px-4"
                  )}
                >
                  Log In
                </Link>
                <PublicActivationButton
                  href={NEW_INTERVIEW_PATH}
                  size="sm"
                  variant={activation.canActivate ? "default" : "outline"}
                  className={cn(
                    "rounded-lg px-4",
                    activation.canActivate && "text-primary-foreground"
                  )}
                >
                  {siteConfig.cta}
                </PublicActivationButton>
              </>
            )}
          </div>

          <div className="flex items-center lg:hidden">
            <MobileDrawer />
          </div>
        </div>
      </div>

      <div className="bg-border/60 absolute right-0 bottom-0 left-0 h-px" />
    </motion.header>
  );
}
