import { Icons } from "@/components/icons";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background/95 backdrop-blur-lg mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Main Footer Content - matches header justify-between layout */}
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-12">
          {/* Left Side: Brand + Product Links */}
          <div className="flex flex-col md:flex-row gap-12 md:gap-16">
            {/* Brand Column */}
            <div>
              <div className="flex items-center gap-x-2 mb-4">
                <Icons.logo className="h-6 w-6 text-primary" />
                <h2 className="text-[20px] font-sans font-semibold text-foreground">
                  {siteConfig.name}
                </h2>
              </div>
              <p className="text-[15px] text-muted-foreground leading-relaxed max-w-xs">
                {siteConfig.description}
              </p>
            </div>

            {/* Product Links */}
            <nav className="flex flex-col gap-3">
              <a
                href="#features"
                className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Pricing
              </a>
              <Link
                href="/blog"
                className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Blog
              </Link>
              <a
                href="/contact"
                className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Contact
              </a>
            </nav>
          </div>

          {/* Right Side: Connect - aligns with header CTA button */}
          <div>
            <h3 className="text-[15px] font-sans font-semibold text-foreground mb-4">
              Connect
            </h3>
            <div className="flex gap-x-3">
              {siteConfig.footer.socialLinks.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/40 text-muted-foreground transition-all duration-200 hover:text-primary hover:border-primary/60 hover:bg-primary/10"
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border/40">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Copyright + Legal Links */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 text-[13px] text-muted-foreground">
              <span>© {currentYear} {siteConfig.name}. All rights reserved.</span>
              <span className="hidden md:inline">|</span>
              <a
                href="/terms"
                className="hover:text-foreground transition-colors duration-200"
              >
                Terms of Service
              </a>
              <span className="hidden md:inline">|</span>
              <a
                href="/privacy"
                className="hover:text-foreground transition-colors duration-200"
              >
                Privacy Policy
              </a>
            </div>

            {/* Right: Status */}
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[13px] text-muted-foreground uppercase tracking-wider">All systems operational</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
