import { notFound } from "next/navigation";
import { getBlogPostById, blogPosts, BlogPost as BlogPostType } from "@/lib/blog-data";
import { ArrowLeft, ArrowRight, Calendar, ChevronRight, Clock, Home } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Header } from "@/components/sections/header";
import {
  MarketingArticleHeader,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingMetaRow,
  MarketingPage,
  MarketingProse,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";

export async function generateStaticParams() {
  return blogPosts.map((post) => ({
    id: post.id,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getBlogPostById(id);

  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  return {
    title: `${post.title} | Meelni Blog`,
    description: post.excerpt,
  };
}

// Structured Data for SEO
function BlogPostStructuredData({ post }: { post: BlogPostType }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://meelni.com";

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${baseUrl}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `${baseUrl}/blog/${post.id}`,
      },
    ],
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    url: `${baseUrl}/blog/${post.id}`,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: "en-US",
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/blog/${post.id}`,
    },
    articleSection: post.category,
    keywords: ["PM interview", "product management", post.category.toLowerCase()],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </>
  );
}

export default async function BlogPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getBlogPostById(id);

  if (!post) {
    notFound();
  }

  return (
    <MarketingPage>
      {/* Structured Data for SEO */}
      <BlogPostStructuredData post={post} />

      {/* Site Header */}
      <Header />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="max-w-3xl mx-auto px-6 pt-8">
        <ol className="flex items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="w-4 h-4" />
          </li>
          <li>
            <Link
              href="/blog"
              className="hover:text-foreground transition-colors"
            >
              Blog
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="w-4 h-4" />
          </li>
          <li aria-current="page" className="max-w-xs truncate">
            <span className="text-foreground font-medium">{post.title}</span>
          </li>
        </ol>
      </nav>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <MarketingArticleHeader
          className="mb-12 border-b border-border/30 pb-10"
          eyebrow={
            <MarketingEyebrow className="px-3 py-1.5 text-xs uppercase tracking-wide">
              {post.category}
            </MarketingEyebrow>
          }
          title={post.title}
          meta={
            <MarketingMetaRow
              className="border-t-0 pt-0 text-sm"
              items={[
                { icon: Calendar, label: post.date },
                { icon: Clock, label: post.readTime },
              ]}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  M
                </span>
                <span className="font-semibold text-foreground">{post.author}</span>
              </div>
            </MarketingMetaRow>
          }
        />

        {/* Content */}
        <MarketingProse>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="font-display mt-16 mb-6 text-4xl font-bold leading-tight text-foreground">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-display mt-14 mb-5 border-b border-border/20 pb-3 text-3xl font-bold leading-tight text-foreground">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-display mt-10 mb-4 text-2xl font-semibold leading-tight text-foreground">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="mt-8 mb-3 text-lg font-semibold text-foreground/90">{children}</h4>
              ),
              p: ({ children }) => {
                const text = typeof children === "string" ? children : "";
                // Special styling for good/bad examples
                if (text.startsWith("❌")) {
                  return (
                    <p className="my-6 rounded-r-lg border-l-4 border-destructive/40 bg-destructive/5 px-5 py-4 text-base leading-relaxed text-foreground/90">
                      {children}
                    </p>
                  );
                }
                if (text.startsWith("✅")) {
                  return (
                    <p className="my-6 rounded-r-lg border-l-4 border-success/40 bg-success/5 px-5 py-4 text-base leading-relaxed text-foreground/90">
                      {children}
                    </p>
                  );
                }
                return <p className="mb-6 text-lg leading-loose text-foreground/85">{children}</p>;
              },
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-foreground/90">{children}</em>
              ),
              ul: ({ children }) => (
                <ul className="my-6 list-disc space-y-2 pl-6 text-base text-foreground/85">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="my-6 list-decimal space-y-2 pl-6 text-base text-foreground/85">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="leading-[1.7] marker:text-primary/70 pl-2">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-8 rounded-r-lg border-l-4 border-primary/40 bg-primary/5 py-4 pr-4 pl-6 text-base leading-relaxed text-foreground/80 italic">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-primary font-medium hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary/60 transition-colors duration-200">
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="rounded border border-border/30 bg-muted px-2 py-0.5 font-mono text-sm text-foreground/90">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-muted border border-border/30 rounded-lg p-4 overflow-x-auto my-6">
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-8 rounded-lg border border-border/40">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/50 border-b border-border/40">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-4 py-3 text-left font-semibold text-foreground">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-3 border-t border-border/30 text-foreground/80">{children}</td>
              ),
              hr: () => (
                <hr className="my-12 border-border/30" />
              ),
            }}
          >
            {post.content}
          </ReactMarkdown>
        </MarketingProse>

        {/* CTA */}
        <MarketingCtaCard
          className="mt-20 text-left"
          mark="M"
          title="Ready to practice with AI?"
          description="Put these frameworks into action with Meelni's AI interview coach. Get real-time feedback and improve faster than solo practice."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/setup">
                Start practicing now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {/* Related Posts Section (placeholder for future) */}
        <div className="mt-20 pt-12 border-t border-border/30">
          <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
            <Link href="/blog" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              View all posts
            </Link>
          </Button>
        </div>
      </article>
    </MarketingPage>
  );
}
