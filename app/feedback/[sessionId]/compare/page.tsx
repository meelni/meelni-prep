"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { AttemptComparison } from "@/components/feedback/attempt-comparison";
import { motion } from "framer-motion";
import { ArrowLeft, GitCompare, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import { SessionAttempt, ComparisonData } from "@/lib/types/comparison";

const roundTypeLabels: Record<string, string> = {
  product_sense: "Product Sense",
  analytical_thinking: "Analytical Thinking",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

export default function ComparePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [attempts, setAttempts] = useState<SessionAttempt[]>([]);
  const [roundType, setRoundType] = useState<string>("");
  const [selectedAttempt1, setSelectedAttempt1] = useState<string | null>(null);
  const [selectedAttempt2, setSelectedAttempt2] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available attempts
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
      return;
    }

    if (!user || !sessionId) return;

    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/feedback/${sessionId}/attempts`);
        if (!res.ok) {
          throw new Error("Failed to fetch attempts");
        }

        const data = await res.json();
        setAttempts(data.attempts || []);
        setRoundType(data.roundType || "");

        // Auto-select current session as attempt 2 (latest)
        setSelectedAttempt2(sessionId);
      } catch (err) {
        console.error("Error fetching attempts:", err);
        setError("Failed to load attempts");
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [user, authLoading, sessionId, router]);

  // Fetch comparison data when both attempts are selected
  useEffect(() => {
    if (!selectedAttempt1 || !selectedAttempt2) {
      setComparisonData(null);
      return;
    }

    const fetchComparison = async () => {
      try {
        setComparing(true);
        setError(null);

        const res = await fetch("/api/feedback/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId1: selectedAttempt1,
            sessionId2: selectedAttempt2,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to fetch comparison");
        }

        const data = await res.json();
        setComparisonData(data.comparison);
      } catch (err) {
        console.error("Error fetching comparison:", err);
        setError("Failed to load comparison data");
      } finally {
        setComparing(false);
      }
    };

    fetchComparison();
  }, [selectedAttempt1, selectedAttempt2]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading attempts...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error && !attempts.length) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="text-lg font-medium text-foreground">{error}</p>
            <Link href={`/feedback/${sessionId}`}>
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Feedback
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // No other attempts available
  if (attempts.length < 2) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
        {/* Header */}
        <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="container max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-full">
              <Link href="/dashboard" className="flex items-center gap-3 group">
                <Icons.logo className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                <span className="font-sans font-semibold text-lg text-foreground">
                  Meelni
                </span>
              </Link>
              <Link href={`/feedback/${sessionId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Feedback
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Empty State */}
        <main className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card className="p-12 text-center">
            <div className="space-y-6">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
                <GitCompare className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">
                  No Other Attempts Yet
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Complete more {roundTypeLabels[roundType]} interviews to compare
                  your progress and track improvements over time.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Link href="/setup">
                  <Button>Start Another Interview</Button>
                </Link>
                <Link href={`/feedback/${sessionId}`}>
                  <Button variant="outline">View Feedback</Button>
                </Link>
              </div>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-full">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <Icons.logo className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <span className="font-sans font-semibold text-lg text-foreground">
                Meelni
              </span>
            </Link>
            <Link href={`/feedback/${sessionId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Feedback
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Page Header */}
          <motion.div variants={fadeInUp} className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-primary/20">
                {roundTypeLabels[roundType] || roundType}
              </Badge>
              <Badge className="bg-muted/50 text-muted-foreground border-border/50">
                <GitCompare className="w-3 h-3 mr-1" />
                Comparison
              </Badge>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Compare Attempts
            </h1>

            <p className="text-muted-foreground">
              Select two attempts to compare your progress and see how you've
              improved.
            </p>
          </motion.div>

          {/* Attempt Selection */}
          <motion.div variants={fadeInUp}>
            <Card className="p-6 bg-surface/50 border-border/50">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Select Attempts to Compare
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Attempt 1 Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Earlier Attempt
                  </label>
                  <div className="space-y-2">
                    {attempts
                      .filter((attempt) => attempt.id !== selectedAttempt2)
                      .map((attempt) => (
                        <button
                          key={attempt.id}
                          onClick={() => setSelectedAttempt1(attempt.id)}
                          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                            selectedAttempt1 === attempt.id
                              ? "border-primary bg-primary/5"
                              : "border-border/50 bg-card hover:border-primary/50"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-foreground">
                              {formatDate(attempt.startedAt)}
                            </span>
                            {attempt.overallScore !== null && (
                              <Badge className="bg-muted/50 text-muted-foreground border-border/50">
                                {attempt.overallScore}/10
                              </Badge>
                            )}
                          </div>
                          {attempt.overallScore === null && (
                            <span className="text-xs text-muted-foreground">
                              No feedback yet
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Attempt 2 Selection (Current) */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">
                    Latest Attempt
                  </label>
                  <div className="space-y-2">
                    {attempts
                      .filter((attempt) => attempt.id === selectedAttempt2)
                      .map((attempt) => (
                        <div
                          key={attempt.id}
                          className="w-full p-4 rounded-lg border-2 border-primary bg-primary/5"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-foreground">
                              {formatDate(attempt.startedAt)}
                            </span>
                            {attempt.overallScore !== null && (
                              <Badge className="bg-primary/10 text-primary border-primary/20">
                                {attempt.overallScore}/10
                              </Badge>
                            )}
                          </div>
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                            Current Session
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Comparison Display */}
          {comparing && (
            <motion.div
              variants={fadeInUp}
              className="flex flex-col items-center gap-4 py-12"
            >
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">
                Loading comparison...
              </p>
            </motion.div>
          )}

          {!comparing && comparisonData && (
            <AttemptComparison comparison={comparisonData} />
          )}

          {!comparing && !comparisonData && selectedAttempt1 && (
            <motion.div variants={fadeInUp}>
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  Select both attempts to view the comparison
                </p>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
