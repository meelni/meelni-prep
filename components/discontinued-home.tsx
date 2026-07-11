import Link from "next/link";
import { DiscontinuedBanner } from "@/components/discontinued-banner";
import { Header } from "@/components/sections/header";

export function DiscontinuedHome() {
  return (
    <>
      <DiscontinuedBanner />
      <Header />
      <section className="border-border/60 flex min-h-[62vh] items-center border-b px-6 py-20">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="text-muted-foreground text-sm font-semibold tracking-[0.18em] uppercase">
            Service update
          </p>
          <h1 className="font-display text-foreground mt-4 text-4xl font-light sm:text-5xl">
            Meelni is currently paused
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-base leading-7 sm:text-lg">
            We are not accepting new PM interview practice sessions or
            subscriptions right now. Thank you to everyone who has used and
            supported Meelni.
          </p>
        </div>
      </section>
      <footer className="border-border/60 border-t px-6 py-8">
        <div className="text-muted-foreground mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 text-sm sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Meelni</span>
          <div className="flex items-center gap-5">
            <Link className="hover:text-foreground" href="/terms">
              Terms draft
            </Link>
            <Link className="hover:text-foreground" href="/privacy">
              Privacy draft
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
