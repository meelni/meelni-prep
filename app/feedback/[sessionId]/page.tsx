"use client";

import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Share2, Calendar } from "lucide-react";
import { ScoreBreakdown } from "@/components/feedback/score-breakdown";
import { RubricSection } from "@/components/feedback/rubric-section";
import { StrengthsList } from "@/components/feedback/strengths-list";
import { ImprovementsList } from "@/components/feedback/improvements-list";
import { DrillList } from "@/components/feedback/drill-list";
import { TranscriptViewer } from "@/components/feedback/transcript-viewer";
import type { FeedbackData, TranscriptTurn } from "@/lib/types/feedback";
import Link from "next/link";

// Mock data for development (will be replaced with real API call)
const MOCK_FEEDBACK: FeedbackData = {
  sessionId: "mock-session-123",
  overallScore: 7.8,
  rubricScores: {
    structure: 8.5,
    clarity: 7.8,
    insight: 7.2,
    communication: 8.0,
    leadership: 7.6,
  },
  strengths: [
    {
      title: "Excellent Framework Application",
      description:
        "You demonstrated strong understanding of the product sense framework by systematically addressing user pain points, market analysis, and solution prioritization.",
      evidence:
        "First, let me identify the core user problem. It seems like the main issue is that users struggle with discovering relevant content because the current algorithm prioritizes engagement over relevance.",
    },
    {
      title: "Clear Communication",
      description:
        "Your responses were well-structured and easy to follow. You used signposting effectively to guide the interviewer through your thought process.",
      evidence:
        "Let me break this down into three parts: first, I'll analyze the current state, then explore potential solutions, and finally recommend a prioritized approach.",
    },
    {
      title: "Data-Driven Thinking",
      description:
        "You consistently referenced metrics and user data to support your recommendations, showing strong analytical thinking.",
      evidence:
        "Based on the user engagement metrics you mentioned, I would prioritize features that increase time-to-value for new users, specifically targeting the 40% drop-off in the first week.",
    },
  ],
  improvements: [
    {
      title: "Deeper Insight Generation",
      description:
        "While your analysis was solid, you could push yourself to generate more creative and non-obvious insights. Try to go beyond surface-level observations.",
      example:
        "Instead of just identifying the problem, explore second-order effects: 'If we solve discovery, how might that impact content creator behavior and platform dynamics?'",
    },
    {
      title: "Faster Decision-Making",
      description:
        "You took significant time to arrive at conclusions. In a real interview, aim to provide a clear recommendation within 2-3 minutes of analysis.",
      example:
        "After laying out 2-3 options, quickly state your recommendation: 'Given X and Y constraints, I would prioritize Z because...' Then elaborate if time permits.",
    },
    {
      title: "Stakeholder Consideration",
      description:
        "You focused primarily on user needs but didn't fully explore how your recommendations would impact other stakeholders like business teams, engineering, or content creators.",
      example:
        "When proposing a new feature, consider: 'This would require engineering effort for A, might create concerns for legal team around B, but would unlock C revenue opportunity.'",
    },
  ],
  drills: [
    {
      title: "Insight Generation Practice",
      description:
        "Practice identifying non-obvious insights from product scenarios. Focus on second-order effects and creative problem-solving.",
      duration: "20 min",
    },
    {
      title: "Timed Decision-Making",
      description:
        "Work on making clear, well-reasoned recommendations under time pressure. Set a 3-minute timer for decision points.",
      duration: "15 min",
    },
    {
      title: "Stakeholder Mapping",
      description:
        "Practice identifying all stakeholders affected by product decisions and articulating their concerns.",
      duration: "15 min",
    },
  ],
  summary:
    "Strong performance overall with excellent framework application and clear communication. Focus on deepening your insights and making faster decisions to move from good to great. Your analytical foundation is solid—now push yourself to think more creatively and holistically about product problems.",
};

const MOCK_TRANSCRIPT: TranscriptTurn[] = [
  {
    id: "turn-1",
    speaker: "interviewer",
    text: "Let's start with a product sense question. Imagine you're a PM at Spotify. Users have been complaining that they spend too much time searching for music but still can't find songs they like. How would you approach this problem?",
    timestamp: "2025-11-06T10:00:00.000Z",
    highlighted: false,
  },
  {
    id: "turn-2",
    speaker: "user",
    text: "First, let me identify the core user problem. It seems like the main issue is that users struggle with discovering relevant content because the current algorithm prioritizes engagement over relevance. I'd want to dig deeper into whether this affects all users equally or specific segments.",
    timestamp: "2025-11-06T10:00:15.000Z",
    highlighted: true,
  },
  {
    id: "turn-3",
    speaker: "interviewer",
    text: "Good start. What data would you want to look at to validate this hypothesis?",
    timestamp: "2025-11-06T10:00:45.000Z",
    highlighted: false,
  },
  {
    id: "turn-4",
    speaker: "user",
    text: "Let me break this down into three parts: first, I'll analyze the current state, then explore potential solutions, and finally recommend a prioritized approach. For data, I'd want to see: 1) Search abandonment rates, 2) Time spent searching vs listening, 3) User satisfaction scores for discovered content, and 4) Segmentation by user tenure and listening habits.",
    timestamp: "2025-11-06T10:01:00.000Z",
    highlighted: true,
  },
  {
    id: "turn-5",
    speaker: "interviewer",
    text: "Let's say the data shows that 40% of new users drop off in the first week, primarily citing difficulty finding music they like. What would you do?",
    timestamp: "2025-11-06T10:01:30.000Z",
    highlighted: false,
  },
  {
    id: "turn-6",
    speaker: "user",
    text: "Based on the user engagement metrics you mentioned, I would prioritize features that increase time-to-value for new users, specifically targeting the 40% drop-off in the first week. I'd explore three solution spaces: improving onboarding to better capture music preferences, enhancing the recommendation algorithm for cold-start users, and creating more intuitive discovery interfaces.",
    timestamp: "2025-11-06T10:01:50.000Z",
    highlighted: true,
  },
  {
    id: "turn-7",
    speaker: "interviewer",
    text: "How would you prioritize between these options?",
    timestamp: "2025-11-06T10:02:20.000Z",
    highlighted: false,
  },
  {
    id: "turn-8",
    speaker: "user",
    text: "I would prioritize the onboarding improvement first because it's the lowest effort and highest impact. We could add a more comprehensive music taste questionnaire during signup, perhaps gamified to increase completion rates. This would give the algorithm better data to work with from day one, addressing the root cause of poor recommendations for new users.",
    timestamp: "2025-11-06T10:02:35.000Z",
    highlighted: false,
  },
];

export default function FeedbackPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  // TODO: Replace with real API call when WS #1 is complete
  // const { data, isLoading, error } = useFeedback(sessionId);
  const feedback = MOCK_FEEDBACK;
  const transcript = MOCK_TRANSCRIPT;

  const handleDownload = () => {
    alert("Download PDF feature coming soon!");
  };

  const handleShare = () => {
    alert("Share feedback feature coming soon!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="space-y-1">
                <h1 className="text-xl font-display font-light text-foreground">
                  Interview Feedback
                </h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Session {sessionId}</span>
                  <Badge variant="secondary" className="ml-2">
                    Product Sense
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Summary Card */}
          <Card className="bg-gradient-to-br from-card via-card to-card/80 border-primary/20">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                      Overall Assessment
                    </h2>
                    <p className="text-sm text-foreground leading-relaxed">
                      {feedback.summary}
                    </p>
                  </div>
                  <div className="text-right ml-8">
                    <div className="text-5xl font-display font-light text-primary mb-1">
                      {feedback.overallScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      out of 10
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <ScoreBreakdown
            rubricScores={feedback.rubricScores}
            overallScore={feedback.overallScore}
          />

          {/* Rubric Cards */}
          <div className="space-y-3">
            <h2 className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Detailed Scores
            </h2>
            <RubricSection rubricScores={feedback.rubricScores} />
          </div>

          {/* Strengths and Improvements Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StrengthsList strengths={feedback.strengths} />
            <ImprovementsList improvements={feedback.improvements} />
          </div>

          {/* Practice Drills */}
          <DrillList drills={feedback.drills} />

          {/* Transcript */}
          <TranscriptViewer transcript={transcript} />
        </div>
      </div>
    </div>
  );
}
