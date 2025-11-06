"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { motion } from "framer-motion";
import { ArrowRight, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fadeInUp, staggerContainer } from "@/lib/animations";

export default function DashboardPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();

  // Redirect to signin if not authenticated
  if (!isLoading && !user) {
    router.push("/auth/signin");
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </motion.div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  // Get user's first name or email
  const displayName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <Icons.logo className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <span className="font-sans font-semibold text-lg text-foreground">
                Meelni
              </span>
            </Link>

            {/* Sign Out */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Welcome Section */}
          <motion.div variants={fadeInUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-primary">Welcome back!</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
              Hey {displayName} 👋
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Ready to practice your PM interviews? Start a mock interview session below.
            </p>
          </motion.div>

          {/* Start Mock Card */}
          <motion.div variants={fadeInUp}>
            <Card className="p-8 md:p-10 bg-gradient-to-br from-surface/50 to-surface border-border/50 hover:border-primary/30 transition-all duration-300">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold text-foreground">
                    Start Your Mock Interview
                  </h2>
                  <p className="text-muted-foreground">
                    Choose your interview type, difficulty, and voice settings. Practice product sense,
                    analytical thinking, leadership, or strategy interviews with our AI coach.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/setup" className="flex-1">
                    <Button
                      size="lg"
                      className="w-full group bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg font-semibold shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      Start Mock Interview
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Coming Soon Section */}
          <motion.div variants={fadeInUp} className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Coming Soon</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-6 bg-surface/30 border-border/30">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Interview History</div>
                  <p className="text-sm text-muted-foreground/70">
                    Review your past sessions and track your progress over time
                  </p>
                </div>
              </Card>
              <Card className="p-6 bg-surface/30 border-border/30">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">Performance Analytics</div>
                  <p className="text-sm text-muted-foreground/70">
                    See detailed feedback and scores from your mock interviews
                  </p>
                </div>
              </Card>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
