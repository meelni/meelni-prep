import { blogPosts } from "@/lib/blog-data";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Blog | Meelni",
  description: "Frameworks, strategies, and insights from our PM coaching practice",
};

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>

      {/* Page Header */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-[48px] sm:text-[56px] font-display font-bold tracking-tight">
            Interview Insights
          </h1>
          <p className="text-[18px] text-muted-foreground max-w-2xl mx-auto">
            Frameworks, strategies, and insights from our PM coaching practice
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post) => (
            <Link key={post.id} href={`/blog/${post.id}`}>
              <article className="group h-full bg-card/40 backdrop-blur-sm border border-border/60 rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
                {/* Category Badge */}
                <div className="p-6 pb-4">
                  <span className="inline-block px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[12px] font-medium">
                    {post.category}
                  </span>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 space-y-4">
                  <h2 className="text-[20px] font-display font-semibold leading-tight group-hover:text-primary transition-colors duration-200">
                    {post.title}
                  </h2>
                  <p className="text-[15px] text-muted-foreground line-clamp-3 leading-relaxed">
                    {post.excerpt}
                  </p>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 text-[13px] text-muted-foreground pt-2">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
