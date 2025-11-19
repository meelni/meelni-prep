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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-4xl mx-auto px-6 py-16">
        {/* Category Badge */}
        <div className="mb-6">
          <span className="inline-block px-3 py-1 rounded-md bg-primary/10 text-primary text-[13px] font-medium">
            {post.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-[48px] sm:text-[56px] font-display font-bold tracking-tight mb-6 leading-tight">
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex items-center gap-6 text-[14px] text-muted-foreground mb-12 pb-8 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{post.author}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{post.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>{post.readTime}</span>
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none text-foreground/80 leading-relaxed space-y-6">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-[40px] font-display font-bold mt-12 mb-6 leading-tight">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-[32px] font-display font-semibold mt-10 mb-4 leading-tight">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-[24px] font-display font-semibold mt-8 mb-3 leading-tight">{children}</h3>
              ),
              p: ({ children }) => {
                const text = typeof children === "string" ? children : "";
                // Special styling for good/bad examples
                if (text.startsWith("❌")) {
                  return (
                    <p className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 my-3 text-[15px]">
                      {children}
                    </p>
                  );
                }
                if (text.startsWith("✅")) {
                  return (
                    <p className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 my-3 text-[15px]">
                      {children}
                    </p>
                  );
                }
                return <p className="text-[17px] leading-relaxed mb-4">{children}</p>;
              },
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              li: ({ children }) => <li className="ml-6 mb-2">{children}</li>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary/30 pl-6 italic text-muted-foreground my-6">
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a href={href} className="text-primary hover:underline">
                  {children}
                </a>
              ),
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 rounded-2xl bg-primary/5 border border-primary/20">
          <h3 className="text-[24px] font-display font-semibold mb-3">
            Ready to practice with AI?
          </h3>
          <p className="text-[16px] text-muted-foreground mb-6">
            Put these frameworks into action with Meelni's AI interview coach. Get real-time feedback and improve faster.
          </p>
          <Link
            href="/setup"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-[15px] hover:bg-primary/90 transition-colors duration-200"
          >
            Start practicing now
          </Link>
        </div>
      </article>
    </div>
  );
}
