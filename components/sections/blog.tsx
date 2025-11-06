import BlogCard from "@/components/blog-card";
import { Section } from "@/components/section";
import { getBlogPosts } from "@/lib/blog";
import BlogHeader from "@/components/blog-header";

export async function Blog() {
  const allPosts = await getBlogPosts();

  const articles = await Promise.all(
    allPosts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  );

  return (
    <Section id="blog">
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <BlogHeader />

          {/* Blog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((data, idx) => (
              <BlogCard key={data.slug} data={data} priority={idx <= 1} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
