"use client";

import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

export function Testimonials() {
  const [showAll, setShowAll] = useState(false);
  const initialDisplayCount = 9;

  return (
    <Section id="testimonials" title="Testimonials">
      <div className="border-t">
        <div className="lg:bg-grid-3 sm:bg-grid-2 bg-grid-1 relative columns-1 gap-0 border-r pb-24 sm:columns-2 lg:columns-3">
          <div className="from-background pointer-events-none absolute bottom-0 left-1/2 h-2/6 w-[calc(100%-2px)] -translate-x-1/2 overflow-hidden bg-gradient-to-t to-transparent"></div>

          <Button
            variant="outline"
            className="absolute bottom-12 left-1/2 z-10 flex h-10 w-fit -translate-x-1/2 items-center justify-center border px-5"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show less" : "See more"}
          </Button>

          {siteConfig.testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className={cn(
                "flex break-inside-avoid flex-col border-b border-l",
                "hover:bg-secondary/20 transition-colors",
                !showAll && index >= initialDisplayCount && "hidden"
              )}
            >
              <div className="flex-grow px-4 py-5 sm:p-6">
                <div className="mb-4 flex items-center gap-4">
                  {testimonial.image && (
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      unoptimized
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <h3 className="text-foreground font-sans text-base leading-6 font-semibold">
                      {testimonial.name}
                    </h3>
                    <p className="text-label text-muted-foreground">
                      {testimonial.company}
                    </p>
                  </div>
                </div>
                <p className="text-body font-sans font-normal">
                  {testimonial.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
