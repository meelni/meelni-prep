"use client";

import { Post } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Calendar, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function BlogCard({
  data,
  priority,
  index = 0,
}: {
  data: Post;
  priority?: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        type: "spring",
        bounce: 0.3
      }}
    >
      <Link
        href={`/blog/${data.slug}`}
        className="group relative block h-full rounded-2xl border border-border bg-background/60 backdrop-blur-sm transition-all duration-300 overflow-hidden hover:border-primary/40 hover:bg-background/80 hover:-translate-y-1"
      >
        {/* Image */}
        <div className="relative w-full aspect-[16/9] overflow-hidden bg-muted">
          {data.image ? (
            <Image
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              src={data.image}
              width={1200}
              height={630}
              alt={data.title}
              priority={priority}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 via-primary/5 to-background flex items-center justify-center">
              <span className="text-muted-foreground/50 text-sm">Coming soon</span>
            </div>
          )}

          {/* Arrow icon overlay on hover */}
          <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <ArrowUpRight className="w-4 h-4 text-primary" />
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Date */}
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <time
              dateTime={data.publishedAt}
              className="text-[13px] text-muted-foreground"
            >
              {formatDate(data.publishedAt)}
            </time>
          </div>

          {/* Title */}
          <h3 className="text-[20px] leading-[28px] font-sans font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
            {data.title}
          </h3>

          {/* Summary */}
          <p className="text-[15px] text-muted-foreground leading-relaxed line-clamp-2">
            {data.summary}
          </p>
        </div>

        {/* Bottom border accent */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>
    </motion.div>
  );
}
