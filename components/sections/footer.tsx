import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import Link from "next/link";
import { PublicActivationButton } from "@/components/public-activation-action";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";

const footerLinks = [
  { label: "Questions", href: "/explore" },
  { label: "Companies", href: "/companies" },
  { label: "Pricing", href: "/pricing" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="bg-footer border-t border-white/10 px-4 pt-[72px] pb-20 text-white sm:px-6 sm:pb-9 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-14">
        <div className="flex flex-col justify-between gap-10 border-b border-white/15 pb-14 lg:flex-row lg:items-end">
          <div className="max-w-[690px]">
            <h2 className="text-display-footer text-balance">
              Your next answer should be better than the last one.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-7 text-slate-300">
              Start with a real prompt, practice it out loud, and leave with the
              next move.
            </p>
          </div>

          <div className="flex flex-col gap-3 pb-1 sm:flex-row">
            <PublicActivationButton
              href={NEW_INTERVIEW_PATH}
              size="lg"
              variant="secondary"
              className="text-footer-button h-12 rounded-full bg-white px-6 font-bold hover:bg-white/90"
            >
              Start practice
            </PublicActivationButton>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-white/30 bg-transparent px-6 font-bold text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/explore">Explore questions</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="text-footer-button flex h-6 w-6 items-center justify-center rounded-md bg-white">
              <Icons.logo className="h-4 w-4" />
            </span>
            <span className="text-sm text-slate-400">{siteConfig.name}</span>
          </Link>

          <nav className="flex flex-wrap gap-x-6 gap-y-3">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-slate-400 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
