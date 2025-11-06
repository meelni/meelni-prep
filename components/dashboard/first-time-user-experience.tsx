"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mic, BarChart3, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface FirstTimeUserExperienceProps {
  onStartInterview?: () => void;
}

export function FirstTimeUserExperience({ onStartInterview }: FirstTimeUserExperienceProps) {
  const router = useRouter();
  const { user } = useAuth();

  // Extract first name from user metadata or email
  const firstName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  const valuePropCards = [
    {
      icon: <Mic className="w-8 h-8" />,
      title: "Voice Interview",
      description: "20-minute realistic mock interview with AI",
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: "Instant Scores",
      description: "Get scored on 5 key PM competencies",
    },
    {
      icon: <Lightbulb className="w-8 h-8" />,
      title: "AI Coaching",
      description: "Personalized feedback and improvement tips",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col">
      {/* Hero Section */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 p-12 mb-12"
      >
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.h1
            variants={fadeInUp}
            className="font-display text-5xl md:text-6xl font-light text-foreground mb-4"
          >
            Welcome back, {firstName}! 👋
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="text-xl text-muted-foreground mb-8"
          >
            Let's practice your first PM interview
          </motion.p>

          <motion.div variants={fadeInUp}>
            <Button
              onClick={onStartInterview || (() => router.push("/setup"))}
              size="lg"
              className="text-lg px-8 py-6 h-auto bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300"
            >
              Start Your First Mock Interview 🎯
            </Button>
          </motion.div>
        </div>

        {/* Gradient background overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
      </motion.div>

      {/* What You'll Get Section */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="flex-1"
      >
        <motion.h2
          variants={fadeInUp}
          className="text-2xl font-semibold text-foreground mb-8 text-center"
        >
          What you'll get
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {valuePropCards.map((card, index) => (
            <motion.div
              key={index}
              variants={fadeInUp}
              className="group relative overflow-hidden rounded-lg border border-border bg-card p-8 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors duration-300">
                  {card.icon}
                </div>

                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {card.title}
                </h3>

                <p className="text-sm text-muted-foreground">
                  {card.description}
                </p>
              </div>

              {/* Subtle gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
