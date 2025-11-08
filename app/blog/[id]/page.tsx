import { notFound } from "next/navigation";
import { getBlogPostById, blogPosts } from "@/lib/blog-data";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

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
        <div className="prose prose-lg prose-neutral dark:prose-invert max-w-none">
          <div
            className="text-foreground/80 leading-relaxed space-y-6"
            dangerouslySetInnerHTML={{
              __html: post.content
                .split("\n")
                .map((line) => {
                  // First, handle bold text globally (before any other processing)
                  let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');

                  // Handle headings
                  if (line.startsWith("# ")) {
                    return `<h1 class="text-[40px] font-display font-bold mt-12 mb-6 leading-tight">${processedLine.slice(2)}</h1>`;
                  }
                  if (line.startsWith("## ")) {
                    return `<h2 class="text-[32px] font-display font-semibold mt-10 mb-4 leading-tight">${processedLine.slice(3)}</h2>`;
                  }
                  if (line.startsWith("### ")) {
                    return `<h3 class="text-[24px] font-display font-semibold mt-8 mb-3 leading-tight">${processedLine.slice(4)}</h3>`;
                  }

                  // Use processedLine for the rest
                  const boldText = processedLine;

                  // Handle list items
                  if (line.startsWith("- ")) {
                    return `<li class="ml-6 mb-2">${boldText.slice(2)}</li>`;
                  }

                  // Handle blockquotes (example sections)
                  if (line.startsWith("> ")) {
                    return `<blockquote class="border-l-4 border-primary/30 pl-6 italic text-muted-foreground my-6">${line.slice(2)}</blockquote>`;
                  }

                  // Handle example markers
                  if (line.includes("**Example:**")) {
                    return `<p class="font-semibold text-foreground mt-6 mb-3">${boldText}</p>`;
                  }

                  // Handle good/bad examples
                  if (line.startsWith("❌")) {
                    return `<p class="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 my-3 text-[15px]">${line}</p>`;
                  }
                  if (line.startsWith("✅")) {
                    return `<p class="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 my-3 text-[15px]">${line}</p>`;
                  }

                  // Handle links
                  const withLinks = boldText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>');

                  // Regular paragraphs
                  if (line.trim()) {
                    return `<p class="text-[17px] leading-relaxed mb-4">${withLinks}</p>`;
                  }

                  return "";
                })
                .join("\n"),
            }}
          />
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
