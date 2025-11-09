"use client";

import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { getRecentBlogPosts } from "@/lib/blog-data";
import { fadeInUp, staggerContainer } from "@/lib/animations";

export function Blog() {
  const posts = getRecentBlogPosts(3);

  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/50 to-background pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="space-y-16"
        >
          {/* Section Header */}
          <div className="text-center space-y-4">
            <motion.div variants={fadeInUp}>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[13px] font-medium text-primary">
                Interview Insights
              </span>
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="text-[40px] sm:text-[48px] font-display font-bold tracking-tight"
            >
              Learn from the Experts
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-[17px] text-muted-foreground max-w-2xl mx-auto"
            >
              Frameworks, strategies, and insights from our PM coaching practice
            </motion.p>
          </div>

          {/* Blog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {posts.map((post, index) => (
              <motion.div
                key={post.id}
                variants={fadeInUp}
                custom={index}
              >
                <Link href={`/blog/${post.id}`}>
                  <div className="group h-full bg-card/40 backdrop-blur-sm border border-border/60 rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
                    {/* Category Badge */}
                    <div className="p-6 pb-4">
                      <span className="inline-block px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[12px] font-medium">
                        {post.category}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-6 space-y-4">
                      <h3 className="text-[20px] font-display font-semibold leading-tight group-hover:text-primary transition-colors duration-200">
                        {post.title}
                      </h3>
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

                      {/* Read More Link */}
                      <div className="flex items-center gap-2 text-[14px] font-medium text-primary pt-2 group-hover:gap-3 transition-all duration-200">
                        <span>Read article</span>
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* View All Link */}
          <motion.div variants={fadeInUp} className="text-center">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-[15px] font-medium text-primary hover:gap-3 transition-all duration-200"
            >
              View all articles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
