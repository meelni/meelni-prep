"use client";

import { useParams } from "next/navigation";
import { Header } from "@/components/sections/header";
import { getCompanyBySlug } from "@/lib/data/companies";
import { Button } from "@/components/ui/button";
import {
  Home,
  ChevronRight as BreadcrumbArrow,
  Clock,
  Users,
  DollarSign,
  CheckCircle2,
  Lightbulb,
  MessageSquare,
  ArrowRight,
  Building2,
  Briefcase,
  GraduationCap
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case "Easy":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "Medium":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "Hard":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "Very Hard":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function CompanyDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const company = getCompanyBySlug(slug);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  if (!company) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Company not found</h1>
            <p className="text-muted-foreground mb-4">
              We don't have a guide for this company yet.
            </p>
            <Link href="/companies">
              <Button variant="outline">View all companies</Button>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

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
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </a>
            </li>
            <li aria-hidden="true">
              <BreadcrumbArrow className="w-4 h-4" />
            </li>
            <li>
              <Link
                href="/companies"
                className="hover:text-foreground transition-colors"
              >
                Companies
              </Link>
            </li>
            <li aria-hidden="true">
              <BreadcrumbArrow className="w-4 h-4" />
            </li>
            <li aria-current="page">
              <span className="text-foreground font-medium">{company.name}</span>
            </li>
          </ol>
        </nav>

        {/* Page Header */}
        <header className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                {company.name} PM Interview Guide
              </h1>
              <p className="text-muted-foreground mt-1">{company.industry}</p>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl">
            {company.description}
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{company.interviewDuration}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{company.interviewRounds} rounds</span>
            </div>
            <span className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border",
              getDifficultyColor(company.difficulty)
            )}>
              {company.difficulty}
            </span>
          </div>
        </header>

        {/* CTA Banner */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 mb-8">
          <div className="p-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Practice {company.name} Interview Questions
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Get AI-powered feedback on your answers with Meelni
                </p>
              </div>
              <Link href="/setup">
                <Button className="gap-2">
                  Start Mock Interview
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Table of Contents */}
        <nav className="max-w-4xl mx-auto px-4 sm:px-6 mb-8">
          <div className="p-4 rounded-xl bg-muted/30 border border-border/60">
            <h2 className="text-sm font-semibold text-foreground mb-3">On this page</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#role" className="text-muted-foreground hover:text-primary transition-colors">
                  Role Overview & Salary
                </a>
              </li>
              <li>
                <a href="#process" className="text-muted-foreground hover:text-primary transition-colors">
                  Interview Process
                </a>
              </li>
              <li>
                <a href="#questions" className="text-muted-foreground hover:text-primary transition-colors">
                  Example Questions
                </a>
              </li>
              <li>
                <a href="#tips" className="text-muted-foreground hover:text-primary transition-colors">
                  Interview Tips
                </a>
              </li>
              <li>
                <a href="#preparation" className="text-muted-foreground hover:text-primary transition-colors">
                  How to Prepare
                </a>
              </li>
            </ul>
          </div>
        </nav>

        {/* Role Overview & Salary */}
        <section id="role" className="max-w-4xl mx-auto px-4 sm:px-6 mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            Role Overview & Salary
          </h2>

          <div className="prose prose-neutral dark:prose-invert max-w-none mb-6">
            <p className="text-muted-foreground leading-relaxed">
              {company.roleOverview.description}
            </p>
          </div>

          {/* Skills */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-3">Key Skills Required</h3>
            <ul className="grid sm:grid-cols-2 gap-2">
              {company.roleOverview.skills.map((skill, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{skill}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Salary Table */}
          {company.salaryLevels && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border/60">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  {company.name} PM Salary & Compensation
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/20">
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Level</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Base Salary</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Total Compensation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.salaryLevels.map((level, index) => (
                      <tr key={index} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-3 text-sm text-foreground">{level.level}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{level.baseSalary}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{level.totalComp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {company.salaryNote && (
                <div className="px-4 py-3 bg-muted/20 border-t border-border/60">
                  <p className="text-xs text-muted-foreground">{company.salaryNote}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Interview Process */}
        <section id="process" className="max-w-4xl mx-auto px-4 sm:px-6 mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Interview Process
          </h2>

          <div className="space-y-4">
            {company.interviewStages.map((stage, index) => (
              <div
                key={index}
                className="relative pl-8 pb-6 last:pb-0"
              >
                {/* Timeline line */}
                {index !== company.interviewStages.length - 1 && (
                  <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-border" />
                )}

                {/* Timeline dot */}
                <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{index + 1}</span>
                </div>

                {/* Content */}
                <div className="rounded-lg border border-border/60 p-4 bg-card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-foreground">{stage.name}</h3>
                    {stage.duration && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {stage.duration}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Example Questions */}
        <section id="questions" className="max-w-4xl mx-auto px-4 sm:px-6 mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Example Interview Questions
          </h2>

          <div className="space-y-4">
            {company.questionCategories.map((category) => {
              const isExpanded = expandedCategories.has(category.category);
              const displayQuestions = isExpanded
                ? category.questions
                : category.questions.slice(0, 3);

              return (
                <div
                  key={category.category}
                  className="rounded-xl border border-border/60 overflow-hidden"
                >
                  <div className="px-4 py-3 bg-muted/30 border-b border-border/60">
                    <h3 className="font-semibold text-foreground">{category.category}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {category.questions.length} questions
                    </p>
                  </div>
                  <ul className="divide-y divide-border/40">
                    {displayQuestions.map((question, index) => (
                      <li key={index} className="px-4 py-3 text-sm text-foreground hover:bg-muted/20 transition-colors">
                        {question}
                      </li>
                    ))}
                  </ul>
                  {category.questions.length > 3 && (
                    <button
                      onClick={() => toggleCategory(category.category)}
                      className="w-full px-4 py-2 text-sm text-primary hover:bg-muted/30 transition-colors border-t border-border/40"
                    >
                      {isExpanded
                        ? "Show less"
                        : `Show ${category.questions.length - 3} more questions`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-6 p-4 rounded-xl bg-muted/30 border border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Practice these questions with AI feedback
            </p>
            <Link href="/setup">
              <Button variant="outline" size="sm" className="gap-2">
                Start Practicing
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Interview Tips */}
        <section id="tips" className="max-w-4xl mx-auto px-4 sm:px-6 mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-primary" />
            Interview Tips
          </h2>

          <div className="grid gap-4">
            {company.interviewTips.map((tip, index) => (
              <div
                key={index}
                className="p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/20 transition-colors"
              >
                <h3 className="font-semibold text-foreground mb-2">{tip.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tip.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Preparation Steps */}
        <section id="preparation" className="max-w-4xl mx-auto px-4 sm:px-6 mb-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            How to Prepare
          </h2>

          <div className="space-y-3">
            {company.preparationSteps.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card"
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{index + 1}</span>
                </div>
                <p className="text-sm text-foreground">{step}</p>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="mt-8 p-6 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 text-center">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Ready to ace your {company.name} interview?
            </h3>
            <p className="text-muted-foreground mb-4">
              Practice with our AI interviewer and get instant feedback
            </p>
            <Link href="/setup">
              <Button size="lg" className="gap-2">
                Start Mock Interview
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Back to Companies */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BreadcrumbArrow className="w-4 h-4 rotate-180" />
            Back to all companies
          </Link>
        </section>
      </main>
    </>
  );
}
