"use client";

import Link from "next/link";

const guideCards = [
  {
    category: "Product Sense",
    title: "How to choose a user segment without sounding generic",
    description:
      "A short tactical guide that should point directly into a matching practice rep.",
  },
  {
    category: "Execution",
    title: "What strong metric answers do before listing KPIs",
    description:
      "Turn metric questions into diagnosis, tradeoff, and decision-making practice.",
  },
  {
    category: "Behavioral",
    title: "The difference between a story and an interview answer",
    description:
      "Make STAR answers tighter, more quantified, and easier for interviewers to trust.",
  },
];

export function Blog() {
  return (
    <section
      id="prep-library"
      className="bg-background px-4 py-24 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-9 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="text-section-eyebrow text-primary mb-3">
              Prep Library
            </div>
            <h2 className="text-display-section text-foreground">
              Learn the move, then practice it out loud.
            </h2>
          </div>
          <Link
            href="/blog"
            className="border-border bg-background text-foreground hover:bg-accent inline-flex h-11 w-fit items-center rounded-full border px-4 text-sm font-bold transition-colors"
          >
            Read all guides
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3 md:gap-[18px]">
          {guideCards.map((guide) => (
            <article
              key={guide.category}
              className="border-foreground/80 flex flex-col gap-5 border-t pt-6"
            >
              <div className="text-section-eyebrow text-muted-foreground dark:text-slate-400">
                {guide.category}
              </div>
              <h3 className="text-display-card text-foreground">
                {guide.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-6 dark:text-slate-400">
                {guide.description}
              </p>
              <Link
                href="/blog"
                className="text-primary mt-auto text-sm leading-5 font-bold"
              >
                Read guide
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
