"use client";

import { FeatureSelector } from "@/components/feature-selector";
import { Section } from "@/components/section";
import { codeToHtml } from "shiki";
import { useEffect, useState } from "react";
import { useDemoModal } from "@/components/home-wrapper";

interface FeatureOption {
  id: number;
  title: string;
  description: string;
  code: string;
}

const featureOptions: FeatureOption[] = [
  {
    id: 1,
    title: "Product Sense",
    description: "Practice designing products that solve real user problems using structured frameworks.",
    code: `🎯 Interviewer: "Design a feature to help Spotify users discover new music that matches their evolving taste."

👤 You: "Let me start by clarifying a few assumptions. Are we focusing on the main Spotify app, and should I assume we're looking at the US market?"

🎯 Interviewer: "Yes to both. Go ahead."

👤 You: "Great. So from a product motivation standpoint, I see this as addressing a core challenge—users often get stuck in listening loops. They want to discover new artists but don't know where to start beyond algorithmic playlists."

[Framework checkpoint: ✓ Assumptions clarified]
[Framework checkpoint: → Building product motivation]

👤 You: "The mission would be: To help music explorers discover artists that match their evolving taste by surfacing contextual recommendations at the right moments."

👤 You: "Let me think about our target users. I'd segment them into a few groups..."

👤 You: "The 'Mood Shifters' - people whose music taste changes based on context, time of day, or activity. They're high reach and underserved because current playlists feel static."

[Framework checkpoint: → Identifying target segments]

👤 You: "For their journey, discovery often happens when they're bored of their current playlist. The problem is—the 'Browse' section feels overwhelming with too many generic categories."

[Framework checkpoint: → Mapping user journey and problems]

👤 You: "So for solutions, I'm thinking about contextual discovery moments. What if we introduced 'Musical Stepping Stones'—showing you artists one degree away from what you're currently listening to, with a quick preview snippet?"

[Framework checkpoint: → Generating solutions]

🎯 Interviewer: "Interesting. How would you prioritize this against other features?"

👤 You: "I'd evaluate based on Impact and Effort. This is high impact because it directly addresses discovery friction, and medium effort—we already have the relationship data. I'd compare it against..."`,
  },
  {
    id: 2,
    title: "Product Execution",
    description: "Master goal-setting, metrics, and execution strategy for shipping great products.",
    code: `🎯 Interviewer: "You're the PM for Instagram Reels. Set a goal for your team for the next quarter."

👤 You: "Let me start by clarifying the current state. Can I assume Instagram Reels is in growth phase and we're focused on increasing daily active usage?"

🎯 Interviewer: "Yes, that's right. Continue."

👤 You: "Okay. Let me first think about our ecosystem. We have four main players: Creators who make Reels, Viewers who watch them, Instagram as the platform, and Advertisers who monetize. I want to focus on Viewers for this goal."

[Framework checkpoint: ✓ Ecosystem mapping]

👤 You: "For our North Star Metric, I'd choose 'Daily Reels Watched per DAU'. This captures both engagement depth and user value. The strength is it's simple and directly tied to our business goal of increasing time spent. The drawback is it doesn't capture creator health."

[Framework checkpoint: → Defining North Star Metric]

🎯 Interviewer: "What about guardrails?"

👤 You: "Great question. I'd track three guardrails: 7-day retention rate to ensure we're not burning users out, creator upload frequency to protect supply health, and revenue per impression to ensure monetization doesn't degrade."

[Framework checkpoint: → Setting guardrails]

👤 You: "Now for the team goal. Looking at the viewer journey: they discover Reels on the Explore tab, watch the first one, then swipe to the next. The biggest drop-off is between watching one Reel and swiping to the second."

👤 You: "So my goal would be: Increase the swipe-to-second-Reel rate from 45% to 60% in Q2. This has high impact on our NSM and we have medium-to-high influence through better recommendations and UI improvements."

[Framework checkpoint: → Setting measurable team goal]

🎯 Interviewer: "How would you approach improving that metric?"

👤 You: "I'd start with a hypothesis: users don't swipe because the next Reel preview isn't compelling enough. We could test showing a preview thumbnail, improving our recommendation algorithm, or..."`,
  },
  {
    id: 3,
    title: "Product Strategy",
    description: "Navigate complex business decisions, competitive positioning, and long-term vision.",
    code: `🎯 Interviewer: "You're the CEO of Notion. Should you build a native mobile app or continue focusing on the web experience?"

👤 You: "This is a classic build-versus-optimize tradeoff. Let me think through the strategic context first."

👤 You: "Notion's core value prop is being an all-in-one workspace. Right now, the web app is powerful but the mobile experience is clunky—slow load times, limited offline support, awkward navigation on small screens."

[Strategic context: Current state analysis]

👤 You: "From a competitive standpoint, our main rivals—Coda, Airtable, even Google Docs—all have native mobile apps. We're losing deals to teams that are mobile-first. I've heard from sales that 'mobile experience' comes up in 30% of lost deals."

[Strategic context: Competitive pressure]

👤 You: "But here's the strategic question: does a native app unlock a new customer segment, or just serve existing users better?"

🎯 Interviewer: "Good question. What do you think?"

👤 You: "I think both, but let me prioritize. Short-term, it's table stakes for enterprise deals—we need it to compete. Long-term, it could unlock a new segment: mobile-first teams who would never consider Notion today."

👤 You: "The business model implications: building native apps is expensive—probably 6-9 months for iOS and Android combined, pulling engineering resources from core product work. But if it helps us close even 10% more enterprise deals, the ROI is massive."

[Strategic analysis: Investment vs. return]

👤 You: "My recommendation: Build a lightweight native app focused on three core use cases—quick capture, reading docs on the go, and commenting. Not trying to replicate the full web experience, which would take forever. Ship iOS first since 70% of our enterprise users are on iOS."

[Strategic decision: Phased approach]

🎯 Interviewer: "What would make you change your mind?"

👤 You: "Two things. One, if we see mobile web usage improving significantly with PWA improvements—that would buy us time. Two, if our sales team reports that mobile apps stop being a deal-blocker after we improve the mobile web experience. Then I'd deprioritize native."`,
  },
  {
    id: 4,
    title: "Behavioral",
    description: "Demonstrate leadership, collaboration, and impact through structured storytelling.",
    code: `🎯 Interviewer: "Tell me about a time you had to influence a team without having direct authority."

👤 You: "Sure. So this was at my last company where I was a PM working on our checkout experience. The design team was three time zones away and didn't report to me, but we needed to redesign the entire checkout flow for mobile."

[STAR: Situation - Setting context]

👤 You: "The challenge was—the design team was underwater with requests from other product teams. Our project kept getting deprioritized, and we had a hard deadline: Black Friday was 8 weeks away."

[STAR: Task - What needed to be accomplished]

🎯 Interviewer: "How did you approach this?"

👤 You: "First, I tried to understand their constraints. I set up a 1:1 with their design lead to learn what was blocking them. Turns out, they felt our requirements were too vague and kept changing. Fair point."

[STAR: Action - Specific steps taken]

👤 You: "So I did three things. One, I created a detailed design brief with user research insights, wireframes, and success metrics. Made it easy for them to just execute. Two, I got our Head of Product to write an email clarifying this was a company priority—not to strong-arm them, but to give them air cover with their manager. Three, I offered to be their user research partner—I ran all the usability tests so they could focus on design work."

[STAR: Action - Multiple strategies]

👤 You: "The result: they delivered the designs in 3 weeks, we shipped the new checkout flow 10 days before Black Friday, and we saw a 12% increase in mobile conversion rate. The design lead actually thanked me afterwards and said it was one of the smoothest cross-functional projects they'd worked on."

[STAR: Result - Quantified impact and relationship outcome]

🎯 Interviewer: "What did you learn from this?"

👤 You: "Two things. One, influence without authority starts with understanding the other person's constraints—not just pushing your agenda. Two, reducing friction for other teams is often more effective than escalating. The brief and research support probably saved them 10 hours of work."`,
  },
];

export function Examples() {
  const setIsDemoModalOpen = useDemoModal();
  const [features, setFeatures] = useState<Array<FeatureOption & { code: string }>>([]);

  useEffect(() => {
    const loadFeatures = async () => {
      const loadedFeatures = await Promise.all(
        featureOptions.map(async (feature) => ({
          ...feature,
          code: await codeToHtml(feature.code, {
            lang: "text",
            theme: "github-dark",
          }),
        }))
      );
      setFeatures(loadedFeatures);
    };
    loadFeatures();
  }, []);

  return (
    <Section id="examples">
      <div className="pt-16 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* Header with inline voice preview button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Practice with Meelni
            </h2>
            <button
              onClick={() => setIsDemoModalOpen(true)}
              className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <svg
                className="w-4 h-4 text-primary transition-transform duration-300 group-hover:scale-110"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <span className="text-xs font-medium text-primary/80 group-hover:text-primary transition-colors">
                Preview voice
              </span>
            </button>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Experience AI-powered coaching across different PM interview types
          </p>
        </div>
      </div>

      {/* Feature Selector - no outer borders */}
      <div className="px-4 sm:px-6 lg:px-8">
        <FeatureSelector features={features} />
      </div>
    </Section>
  );
}
