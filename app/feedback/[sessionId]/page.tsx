"use client";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { FeedbackDisplay } from "@/components/feedback/feedback-display";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface Session {
  id: string;
  roundType: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  config?: any;
}

interface TranscriptTurn {
  id: string;
  speaker: "user" | "interviewer";
  text: string;
  startedAt: string;
  endedAt: string;
}

const roundTypeLabels: Record<string, string> = {
  product_sense: "Product Sense",
  analytical_thinking: "Analytical Thinking",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

export default function FeedbackPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [feedback, setFeedback] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/signin");
      return;
    }

    if (!user || !sessionId) return;

    const fetchSessionData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch session details
        const sessionRes = await fetch(`/api/session/${sessionId}`);
        if (!sessionRes.ok) {
          throw new Error("Failed to fetch session");
        }
        const sessionData = await sessionRes.json();
        setSession(sessionData.session);

        // Fetch transcript
        const transcriptRes = await fetch(`/api/session/${sessionId}/transcript`);
        if (transcriptRes.ok) {
          const transcriptData = await transcriptRes.json();
          setTranscript(transcriptData.turns || []);
        }

        // Fetch feedback if it exists
        const feedbackRes = await fetch(`/api/feedback/${sessionId}`);
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          setFeedback(feedbackData.feedback);
        }
      } catch (err) {
        console.error("Error fetching session:", err);
        setError("Failed to load session data");
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [user, authLoading, sessionId, router]);

  const handleGenerateFeedback = async () => {
    try {
      setGenerating(true);
      const res = await fetch("/api/feedback/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate feedback");
      }

      const data = await res.json();
      setFeedback(data.feedback);
    } catch (error) {
      console.error("Error generating feedback:", error);
      alert("Failed to generate feedback. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

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
          <p className="text-sm text-muted-foreground">Loading session...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium text-foreground">
              {error || "Session not found"}
            </p>
            <Link href="/dashboard">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const startDate = new Date(session.startedAt);
  const duration = session.endedAt
    ? Math.round(
        (new Date(session.endedAt).getTime() - startDate.getTime()) / 60000
      )
    : null;

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
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Session Header */}
          <motion.div variants={fadeInUp} className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/10 text-primary border-primary/20">
                {roundTypeLabels[session.roundType] || session.roundType}
              </Badge>
              {!session.endedAt && (
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                  In Progress
                </Badge>
              )}
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              Interview Session
            </h1>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {startDate.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {duration !== null && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{duration} minutes</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span>{transcript.length} messages</span>
              </div>
            </div>
          </motion.div>

          {/* Feedback Section */}
          <motion.div variants={fadeInUp}>
            <FeedbackDisplay
              feedback={feedback}
              onGenerate={handleGenerateFeedback}
              generating={generating}
            />
          </motion.div>

          {/* Transcript */}
          {transcript.length > 0 && (
            <motion.div variants={fadeInUp} className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                Conversation Transcript
              </h2>
              <Card className="p-6 bg-surface/50 border-border/50">
                <div className="space-y-4">
                  {transcript.map((turn, index) => (
                    <div
                      key={turn.id}
                      className={`flex gap-3 ${
                        turn.speaker === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                          turn.speaker === "user"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {turn.speaker === "user" ? "U" : "AI"}
                      </div>
                      <div
                        className={`flex-1 p-4 rounded-lg ${
                          turn.speaker === "user"
                            ? "bg-primary/5 border border-primary/10"
                            : "bg-muted/30 border border-border/30"
                        }`}
                      >
                        <p className="text-sm text-foreground">{turn.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
