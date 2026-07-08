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
  description:
    "Frameworks, strategies, and insights from our PM coaching practice",
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
    description:
      "Frameworks, strategies, and insights from our PM coaching practice",
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
      <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-6 pt-8">
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
          <li aria-current="page">
            <span className="text-foreground font-medium">Blog</span>
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <MarketingHero
          eyebrow={<MarketingEyebrow mark="M">Meelni Blog</MarketingEyebrow>}
          title="Interview Insights"
          description="Frameworks, strategies, and real interview walkthroughs from our PM coaching practice"
        />

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <MarketingCard key={post.id}>
              <div className="p-6 pb-4">
                <MarketingEyebrow className="min-h-8 px-3 py-1.5 text-xs">
                  {post.category}
                </MarketingEyebrow>
              </div>

              <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
                <div className="space-y-4">
                  <h2 className="font-display text-foreground group-hover:text-primary min-h-14 text-xl leading-tight font-bold transition-colors duration-200">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
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

        <div className="mt-12">
          <MarketingCtaCard
            mark="M"
            title="Turn the next article into a live rep"
            description="Pick a PM interview question, practice it out loud, and use Meelni feedback to find the next skill to tighten."
            action={
              <Button asChild>
                <Link href="/explore">
                  Browse PM questions
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    </MarketingPage>
  );
}
