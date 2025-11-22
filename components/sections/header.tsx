"use client";

import { Icons } from "@/components/icons";
import { MobileDrawer } from "@/components/mobile-drawer";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/auth-provider";

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "Questions", href: "/explore" },
  { name: "Pricing", href: "/pricing" },
  { name: "Blog", href: "/blog" },
];

interface HeaderProps {
  isDemoModalOpen?: boolean;
}

export function Header({ isDemoModalOpen = false }: HeaderProps) {
  const [activeSection, setActiveSection] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, isLoading } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);

      // Determine active section
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

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <AnimatePresence>
      {!isDemoModalOpen && (
        <motion.header
          className={cn(
            "sticky top-0 z-50 w-full transition-all duration-300",
            isScrolled
              ? "h-[60px] bg-background/95 backdrop-blur-xl border-b border-border/60"
              : "h-[72px] bg-background/80 backdrop-blur-lg"
          )}
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
      <div className="container max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-full">
          {/* Logo */}
          <Link
            href="/"
            className="relative flex items-center gap-3 group"
          >
            <motion.div
              initial={{ rotate: -180, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <Icons.logo className="w-7 h-7 text-primary transition-transform duration-300 group-hover:scale-110" />
            </motion.div>
            <span className="font-sans font-semibold text-[20px] text-foreground">
              {siteConfig.name}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link, index) => {
              const isActive = activeSection === link.href.slice(1);
              const isExternalRoute = link.href.startsWith("/");
              return (
                <motion.div
                  key={link.name}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
                >
                  {isExternalRoute ? (
                    <Link
                      href={link.href}
                      className="relative text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                    >
                      {link.name}

                      {/* Underline animation */}
                      <span className="absolute -bottom-1 left-1/2 h-[2px] bg-primary transition-all duration-300 ease-out w-0 -translate-x-1/2 group-hover:w-full" />
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      onClick={(e) => handleSmoothScroll(e, link.href)}
                      className="relative text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                    >
                      {link.name}

                      {/* Underline animation */}
                      <span
                        className={cn(
                          "absolute -bottom-1 left-1/2 h-[2px] bg-primary transition-all duration-300 ease-out",
                          isActive
                            ? "w-full -translate-x-1/2"
                            : "w-0 -translate-x-1/2 group-hover:w-full"
                        )}
                      />
                    </a>
                  )}
                </motion.div>
              );
            })}
          </nav>

          {/* Auth-Aware CTA Buttons (Desktop) */}
          <motion.div
            className="hidden lg:flex items-center gap-3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            {isLoading ? (
              // Loading skeleton
              <div className="w-[180px] h-[36px] bg-muted/50 animate-pulse rounded-lg" />
            ) : user ? (
              // Logged in: Show Dashboard button only
              <Link href="/dashboard">
                <Button
                  size="sm"
                  className="group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold text-[14px] px-5 shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <LayoutDashboard className="mr-1.5 w-4 h-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              // Logged out: Show Log In + Start A Mock
              <>
                <Link href="/auth/signin">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[14px] font-medium hover:text-primary transition-colors duration-200"
                  >
                    Log In
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button
                    size="sm"
                    className="group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold text-[14px] px-5 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    {siteConfig.cta}
                    <ArrowRight className="ml-1.5 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </>
            )}
          </motion.div>

          {/* Mobile Menu */}
          <div className="lg:hidden">
            <MobileDrawer />
          </div>
        </div>
      </div>

      {/* Subtle gradient border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </motion.header>
      )}
    </AnimatePresence>
  );
}
