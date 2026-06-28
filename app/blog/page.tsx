import { blogPosts } from "@/lib/blog-data";
import { ArrowRight, Calendar, ChevronRight, Clock, Home } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/sections/header";
import {
  MarketingCard,
  MarketingCtaCard,
  MarketingEyebrow,
  MarketingHero,
  MarketingMetaRow,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Blog | Meelni",
  description: "Frameworks, strategies, and insights from our PM coaching practice",
};

// Structured Data for SEO
function BlogStructuredData() {
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
    ],
  };

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Meelni Blog",
    description: "Frameworks, strategies, and insights from our PM coaching practice",
    url: `${baseUrl}/blog`,
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: "Meelni",
      url: baseUrl,
    },
    blogPost: blogPosts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      url: `${baseUrl}/blog/${post.id}`,
      datePublished: post.date,
      author: {
        "@type": "Person",
        name: post.author,
      },
    })),
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "PM Interview Blog Articles",
    numberOfItems: blogPosts.length,
    itemListElement: blogPosts.map((post, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "BlogPosting",
        headline: post.title,
        url: `${baseUrl}/blog/${post.id}`,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
    </>
  );
}

export default function BlogIndex() {
  return (
    <MarketingPage>
      {/* Structured Data for SEO */}
      <BlogStructuredData />

      {/* Site Header */}
      <Header />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="max-w-6xl mx-auto px-6 pt-8">
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
          <li aria-current="page">
            <span className="text-foreground font-medium">Blog</span>
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <MarketingHero
          eyebrow={<MarketingEyebrow mark="M">Meelni Blog</MarketingEyebrow>}
          title="Interview Insights"
          description="Frameworks, strategies, and real interview walkthroughs from our PM coaching practice"
        />

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post) => (
            <MarketingCard key={post.id}>
              <div className="p-6 pb-4">
                <MarketingEyebrow className="px-3 py-1.5 text-xs uppercase tracking-wide">
                  {post.category}
                </MarketingEyebrow>
              </div>

              <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                <div className="space-y-4">
                  <h2 className="font-display min-h-14 text-xl font-bold leading-tight text-foreground transition-colors duration-200 group-hover:text-primary">
                    {post.title}
                  </h2>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                </div>

                <div className="mt-auto space-y-4">
                  <MarketingMetaRow
                    items={[
                      { icon: Calendar, label: post.date },
                      { icon: Clock, label: post.readTime },
                    ]}
                  />
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link href={`/blog/${post.id}`} className="gap-1">
                      Read article
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </MarketingCard>
          ))}
        </div>

        <MarketingCtaCard
          className="mt-20"
          mark="M"
          title="Practice the frameworks you are reading"
          description="Turn interview advice into sharper answers with focused mock interviews and feedback."
          action={
            <Button asChild size="lg" variant="glow">
              <Link href="/setup">
                Start mock interview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />
      </div>
    </MarketingPage>
  );
}
