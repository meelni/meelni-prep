import { notFound } from "next/navigation";
import {
  getBlogPostById,
  blogPosts,
  BlogPost as BlogPostType,
} from "@/lib/blog-data";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  Home,
} from "lucide-react";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    keywords: [
      "PM interview",
      "product management",
      post.category.toLowerCase(),
    ],
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

export default async function BlogPost({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <nav aria-label="Breadcrumb" className="mx-auto max-w-3xl px-6 pt-8">
        <ol className="text-muted-foreground flex items-center gap-2 text-sm">
          <li>
            <Link
              href="/"
              className="hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
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
            <ChevronRight className="h-4 w-4" />
          </li>
          <li aria-current="page" className="max-w-xs truncate">
            <span className="text-foreground font-medium">{post.title}</span>
          </li>
        </ol>
      </nav>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        <MarketingArticleHeader
          className="border-border/30 mb-12 border-b pb-10"
          eyebrow={
            <MarketingEyebrow className="px-3 py-1.5 text-xs tracking-wide uppercase">
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
                <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold">
                  M
                </span>
                <span className="text-foreground font-semibold">
                  {post.author}
                </span>
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
                <h1 className="font-display text-foreground mt-16 mb-6 text-4xl leading-tight font-bold">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-display border-border/20 text-foreground mt-14 mb-5 border-b pb-3 text-3xl leading-tight font-bold">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-display text-foreground mt-10 mb-4 text-2xl leading-tight font-semibold">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-foreground/90 mt-8 mb-3 text-lg font-semibold">
                  {children}
                </h4>
              ),
              p: ({ children }) => {
                const text = typeof children === "string" ? children : "";
                // Special styling for good/bad examples
                if (text.startsWith("❌")) {
                  return (
                    <p className="border-destructive/40 bg-destructive/5 text-foreground/90 my-6 rounded-r-lg border-l-4 px-5 py-4 text-base leading-relaxed">
                      {children}
                    </p>
                  );
                }
                if (text.startsWith("✅")) {
                  return (
                    <p className="border-success/40 bg-success/5 text-foreground/90 my-6 rounded-r-lg border-l-4 px-5 py-4 text-base leading-relaxed">
                      {children}
                    </p>
                  );
                }
                return (
                  <p className="text-foreground/85 mb-6 text-lg leading-loose">
                    {children}
                  </p>
                );
              },
              strong: ({ children }) => (
                <strong className="text-foreground font-semibold">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="text-foreground/90 italic">{children}</em>
              ),
              ul: ({ children }) => (
                <ul className="text-foreground/85 my-6 list-disc space-y-2 pl-6 text-base">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="text-foreground/85 my-6 list-decimal space-y-2 pl-6 text-base">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="marker:text-primary/70 pl-2 leading-[1.7]">
                  {children}
                </li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-primary/40 bg-primary/5 text-foreground/80 my-8 rounded-r-lg border-l-4 py-4 pr-4 pl-6 text-base leading-relaxed italic">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-primary hover:text-primary/80 decoration-primary/30 hover:decoration-primary/60 font-medium underline transition-colors duration-200"
                >
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="border-border/30 bg-muted text-foreground/90 rounded border px-2 py-0.5 font-mono text-sm">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-muted border-border/30 my-6 overflow-x-auto rounded-lg border p-4">
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <div className="border-border/40 my-8 overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/50 border-border/40 border-b">
                  {children}
                </thead>
              ),
              th: ({ children }) => (
                <th className="text-foreground px-4 py-3 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border-border/30 text-foreground/80 border-t px-4 py-3">
                  {children}
                </td>
              ),
              hr: () => <hr className="border-border/30 my-12" />,
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
          description="Put these frameworks into action in a live mock interview, then review feedback from your completed session."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/dashboard/new-interview">
                Start practicing now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {/* Related Posts Section (placeholder for future) */}
        <div className="border-border/30 mt-20 border-t pt-12">
          <Button
            asChild
            variant="link"
            className="text-muted-foreground h-auto p-0"
          >
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
