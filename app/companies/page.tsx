"use client";

import { Header } from "@/components/sections/header";
import { companies } from "@/lib/data/companies";
import { Building2, Clock, Users, ChevronRight, Home, ChevronRight as BreadcrumbArrow } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case "Easy":
      return "bg-green-500/10 text-green-500";
    case "Medium":
      return "bg-yellow-500/10 text-yellow-500";
    case "Hard":
      return "bg-orange-500/10 text-orange-500";
    case "Very Hard":
      return "bg-red-500/10 text-red-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function CompaniesPage() {
  return (
    <>
      <Header />

      <main className="min-h-screen bg-background">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <a
                href="/"
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </a>
            </li>
            <li aria-hidden="true">
              <BreadcrumbArrow className="w-4 h-4" />
            </li>
            <li aria-current="page">
              <span className="text-foreground font-medium">Company Interview Guides</span>
            </li>
          </ol>
        </nav>

        {/* Page Header */}
        <header className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Company Interview Guides
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Detailed interview processes, example questions, and preparation tips for Product Manager
            roles at top tech companies. Learn what to expect and how to prepare.
          </p>
        </header>

        {/* Company Cards */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
          <div className="space-y-4">
            {companies.map((company) => (
              <Link
                key={company.slug}
                href={`/companies/${company.slug}`}
                className="group block"
              >
                <article className={cn(
                  "p-6 rounded-xl border border-border/60",
                  "bg-card hover:bg-muted/30",
                  "transition-all duration-200",
                  "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                )}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Company Name & Industry */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                            {company.name}
                          </h2>
                          <p className="text-sm text-muted-foreground">{company.industry}</p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {company.description}
                      </p>

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-4 mt-4">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{company.interviewDuration}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{company.interviewRounds} rounds</span>
                        </div>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-xs font-medium",
                          getDifficultyColor(company.difficulty)
                        )}>
                          {company.difficulty}
                        </span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0 mt-2">
                      <ChevronRight
                        className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
                      />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {/* Coming Soon Note */}
          {companies.length < 5 && (
            <div className="mt-8 p-6 rounded-xl border border-dashed border-border/60 bg-muted/20 text-center">
              <p className="text-muted-foreground">
                More company guides coming soon! We're adding Google, Meta, Amazon, and more.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
