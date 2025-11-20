import { blogPosts } from "@/lib/blog-data";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Blog | Meelni",
  description: "Frameworks, strategies, and insights from our PM coaching practice",
};

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/5 to-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-primary transition-colors duration-200 group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
            <span className="font-medium">Back to home</span>
          </Link>
        </div>
      </div>

      {/* Page Header */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center space-y-6 mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 mb-4">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary-foreground">M</span>
            </div>
            <span className="text-[13px] font-semibold text-primary">Meelni Blog</span>
          </div>
          <h1 className="text-[48px] sm:text-[64px] font-display font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent leading-[1.1]">
            Interview Insights
          </h1>
          <p className="text-[19px] text-foreground/70 max-w-2xl mx-auto leading-relaxed">
            Frameworks, strategies, and real interview walkthroughs from our PM coaching practice
          </p>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {blogPosts.map((post) => (
            <Link key={post.id} href={`/blog/${post.id}`}>
              <article className="group h-full bg-card/60 backdrop-blur-sm border border-border/40 rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-2">
                {/* Category Badge */}
                <div className="p-6 pb-4">
                  <span className="inline-block px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 text-primary text-[11px] font-semibold tracking-wide uppercase border border-primary/20">
                    {post.category}
                  </span>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 space-y-4">
                  <h2 className="text-[21px] font-display font-bold leading-tight text-foreground group-hover:text-primary transition-colors duration-200 min-h-[3.5rem]">
                    {post.title}
                  </h2>
                  <p className="text-[15px] text-foreground/70 line-clamp-3 leading-relaxed">
                    {post.excerpt}
                  </p>

                  {/* Meta Info */}
                  <div className="flex items-center gap-4 text-[12px] text-muted-foreground pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1.5 mt-3">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  {/* Read more indicator */}
                  <div className="pt-2">
                    <span className="text-[14px] font-medium text-primary group-hover:gap-2 inline-flex items-center gap-1 transition-all duration-200">
                      Read article
                      <svg className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
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
