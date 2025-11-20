import { notFound } from "next/navigation";
import { getBlogPostById, blogPosts } from "@/lib/blog-data";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default async function BlogPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = getBlogPostById(id);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/5 to-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-primary transition-colors duration-200 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            <span className="font-medium">Back to blog</span>
          </Link>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-6 py-20">
        {/* Category Badge */}
        <div className="mb-8">
          <span className="inline-block px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 text-primary text-[12px] font-semibold tracking-wide uppercase border border-primary/20">
            {post.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-[40px] sm:text-[52px] font-display font-bold tracking-tight mb-8 leading-[1.1] bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex items-center gap-6 text-[14px] text-muted-foreground mb-12 pb-10 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <span className="text-[11px] font-bold text-primary-foreground">M</span>
            </div>
            <span className="font-semibold text-foreground">{post.author}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>{post.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            <span>{post.readTime}</span>
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-[36px] font-display font-bold mt-16 mb-6 leading-tight text-foreground">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-[28px] font-display font-bold mt-14 mb-5 leading-tight text-foreground border-b border-border/20 pb-3">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[22px] font-display font-semibold mt-10 mb-4 leading-tight text-foreground">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-[18px] font-semibold mt-8 mb-3 text-foreground/90">{children}</h4>
              ),
              p: ({ children }) => {
                const text = typeof children === "string" ? children : "";
                // Special styling for good/bad examples
                if (text.startsWith("❌")) {
                  return (
                    <p className="bg-red-500/5 border-l-4 border-red-500/40 rounded-r-lg px-5 py-4 my-6 text-[16px] leading-relaxed text-foreground/90">
                      {children}
                    </p>
                  );
                }
                if (text.startsWith("✅")) {
                  return (
                    <p className="bg-green-500/5 border-l-4 border-green-500/40 rounded-r-lg px-5 py-4 my-6 text-[16px] leading-relaxed text-foreground/90">
                      {children}
                    </p>
                  );
                }
                return <p className="text-[18px] leading-[1.8] mb-6 text-foreground/85">{children}</p>;
              },
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-foreground/90">{children}</em>
              ),
              ul: ({ children }) => (
                <ul className="space-y-3 my-6 text-[17px] text-foreground/85">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-3 my-6 text-[17px] text-foreground/85">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="ml-6 leading-[1.7] marker:text-primary/60">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary/40 bg-primary/5 pl-6 pr-4 py-4 italic text-foreground/80 my-8 rounded-r-lg text-[17px] leading-[1.7]">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-primary font-medium hover:text-primary/80 underline decoration-primary/30 hover:decoration-primary/60 transition-colors duration-200">
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="px-2 py-0.5 rounded bg-muted text-[15px] font-mono text-foreground/90 border border-border/30">
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
                  <table className="w-full text-[15px]">{children}</table>
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
        </div>

        {/* CTA */}
        <div className="mt-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl" />
          <div className="relative p-10 rounded-3xl border border-primary/20 backdrop-blur-sm">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                <span className="text-[18px] font-bold text-primary-foreground">M</span>
              </div>
              <div className="flex-1">
                <h3 className="text-[26px] font-display font-bold mb-2 text-foreground">
                  Ready to practice with AI?
                </h3>
                <p className="text-[17px] text-foreground/70 leading-relaxed mb-6">
                  Put these frameworks into action with Meelni's AI interview coach. Get real-time feedback and improve faster than solo practice.
                </p>
                <Link
                  href="/setup"
                  className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-semibold text-[16px] hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] transition-all duration-200"
                >
                  Start practicing now
                  <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Related Posts Section (placeholder for future) */}
        <div className="mt-20 pt-12 border-t border-border/30">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[15px] text-muted-foreground hover:text-primary transition-colors duration-200 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            <span className="font-medium">View all posts</span>
          </Link>
        </div>
      </article>
    </div>
  );
}
