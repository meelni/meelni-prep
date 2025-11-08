import { Icons } from "@/components/icons";
import { siteConfig } from "@/lib/config";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background/95 backdrop-blur-lg mt-20">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-x-2 mb-4">
              <Icons.logo className="h-6 w-6 text-primary" />
              <h2 className="text-[20px] font-sans font-semibold text-foreground">
                {siteConfig.name}
              </h2>
            </div>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-md">
              {siteConfig.description}
            </p>
          </div>

          {/* Links Column */}
          <div>
            <h3 className="text-[15px] font-sans font-semibold text-foreground mb-4">
              Product
            </h3>
            <ul className="space-y-3">
              <li>
                <a
                  href="#features"
                  className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="/blog"
                  className="text-[15px] text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  Blog
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Column */}
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
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[13px] text-muted-foreground">
              © {currentYear} {siteConfig.name}. All rights reserved.
            </p>
            <div className="flex gap-x-6">
              <a
                href="/privacy"
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
