"use client";

import { FeatureSelector } from "@/components/feature-selector";
import { Section } from "@/components/section";
import { codeToHtml } from "shiki";
import { useEffect, useState } from "react";

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
    code: `🎯 Interviewer: "Design a product for education at Meta."

👤 You: "Education's interesting - we're at this inflection point where traditional learning models are breaking down. Quick assumptions: I'm building within Meta's ecosystem, focusing on consumer education rather than K-12, U.S. market initially."

[Framework checkpoint: ✓ Assumptions clarified]

👤 You: "Here's what's happening - people are switching careers more frequently, skills are becoming obsolete faster. The pandemic proved people will learn online, but most are stuck between expensive courses and random YouTube videos."

👤 You: "Meta's unique position: We have 3 billion users already sharing knowledge in Groups, creators teaching through Reels, WhatsApp study groups forming organically. We're sitting on the world's largest knowledge-sharing network."

[Framework checkpoint: → Product motivation established]

🎯 Interviewer: "Who would you focus on?"

👤 You: "Let me segment learners... I'm choosing the 'Rabbit Holers' - these are the midnight learners. They start googling bread making at 10pm and emerge at 2am as sourdough experts. High reach, most underserved."

[Framework checkpoint: → Target segment selected]

👤 You: "Their biggest problem? Knowledge Evaporation. Three weeks later, they can't remember which video had that brilliant explanation. All that learning just... disappears."

[Framework checkpoint: → Problem prioritized]

👤 You: "My solution: Knowledge Threads. As you learn about fermentation, your thread grows - saved videos, notes, experiments. Others can follow your learning journey. Six months later, you can instantly retrieve that perfect explanation of wild yeast."`,
  },
  {
    id: 2,
    title: "Product Execution",
    description: "Practice goal-setting, metrics, and execution strategy for shipping great products.",
    code: `🎯 Interviewer: "You're the PM for Instagram Reels. Set goals and success metrics."

👤 You: "So Reels - this is Meta's answer to TikTok, now a core part of Instagram's strategy. Quick assumptions: focusing on Instagram Reels globally, current established state not launch phase."

👤 You: "The reality is, Reels exists because TikTok fundamentally changed content consumption. We went from curated feeds to AI-driven entertainment. Reels is now 40% of time spent on Instagram."

[Framework checkpoint: ✓ Product context established]

👤 You: "Looking at the ecosystem - Viewers want entertainment, Creators want monetization, Instagram needs revenue, Advertisers want performance. The tension: balancing all four."

[Framework checkpoint: → Ecosystem mapped]

🎯 Interviewer: "What's your North Star?"

👤 You: "I'm choosing Weekly Active Creators. This is the number of unique users posting at least one Reel per week. Why? It captures supply-side health - without thriving creators, everything falls apart. TikTok's winning because they made unknown creators famous."

[Framework checkpoint: → North Star defined]

👤 You: "For guardrails: viewer satisfaction through average watch time, content quality via violation rate, and revenue per thousand views to ensure monetization isn't suffering."

[Framework checkpoint: → Guardrails set]

👤 You: "My Q1 goal: Increase first-time creator success rate from 15% to 25%. Success rate equals percentage of first Reels getting over 1000 views. Why? Early success drives habit formation, and we control the algorithm completely."`,
  },
  {
    id: 3,
    title: "Product Strategy",
    description: "Navigate complex business decisions, competitive positioning, and long-term vision.",
    code: `🎯 Interviewer: "You're the CEO of Notion. Should you build a native mobile app or continue focusing on the web?"

👤 You: "This is a classic build-versus-optimize tradeoff. Let me think through the strategic context first."

[Strategic context: Current state analysis]

👤 You: "Notion's core value prop is being an all-in-one workspace. Right now, the web app is powerful but mobile is clunky - slow load times, limited offline support, awkward navigation on small screens."

👤 You: "Competitively, Coda, Airtable, even Google Docs all have native mobile apps. We're losing deals to mobile-first teams. Sales says 'mobile experience' comes up in 30% of lost deals."

[Strategic context: Competitive pressure]

🎯 Interviewer: "Does a native app unlock new customers or just serve existing users better?"

👤 You: "Both, but let me prioritize. Short-term, it's table stakes for enterprise deals. Long-term, it unlocks mobile-first teams who'd never consider Notion today."

👤 You: "Business model implications: native apps are expensive - probably 6-9 months for iOS and Android, pulling resources from core work. But if it helps us close even 10% more enterprise deals, the ROI is massive."

[Strategic analysis: Investment vs. return]

👤 You: "My recommendation: Build a lightweight native app focused on three use cases - quick capture, reading docs, and commenting. Not replicating the full web experience. Ship iOS first since 70% of enterprise users are on iOS."

[Strategic decision: Phased approach]

🎯 Interviewer: "What would change your mind?"

👤 You: "Two things. If mobile web improves significantly with PWA work, that buys us time. Or if sales reports mobile stops being a deal-blocker after we improve mobile web. Then I'd deprioritize native."`,
  },
  {
    id: 4,
    title: "Behavioral",
    description: "Demonstrate leadership, collaboration, and impact through structured storytelling.",
    code: `🎯 Interviewer: "Tell me about a time you failed."

👤 You: "I'll share a significant failure from my time as Senior PM that fundamentally changed how I approach product launches. This was about 18 months ago - I led the launch of an AI-powered recommendation engine that I ultimately mismanaged."

[STAR: Situation - Setting context]

👤 You: "Context: our e-commerce platform was losing ground. CEO made personalization the top priority. I was asked to lead a tiger team - 8 engineers, 2 designers, a data scientist. $3 million budget. Series B funding depended on this."

👤 You: "My mandate: Build a recommendation engine increasing session time by 40% and conversion by 20% within 6 months."

[STAR: Task - What needed to be accomplished]

🎯 Interviewer: "What happened?"

👤 You: "Three critical mistakes. First, I got seduced by technical sophistication. The ML contractors proposed this cutting-edge algorithm. I thought 'This will blow competitors away' - even though our senior engineers expressed concerns."

👤 You: "Second, I managed up but not across. I was focused on impressing the CEO with progress demos. But I wasn't spending time with infrastructure who'd actually deploy this."

👤 You: "Third, I ignored warning signs. QA mentioned 400 millisecond latency - 4x our budget. I said 'we'll optimize later.'"

[STAR: Action - Specific steps and mistakes]

👤 You: "Launch day was a disaster. Within 2 hours, site latency increased 300%. Pages that loaded in 1 second now took 4. The recommendations were wrong - winter coats in July. We rolled back within 6 hours."

👤 You: "Lost 15% of daily users that week. Conversion dropped 8%. Delayed our Series B by 6 months. My credibility took a huge hit."

[STAR: Result - Quantified impact]

🎯 Interviewer: "What did you learn?"

👤 You: "Perfect is the enemy of shipped. Now I ask: 'What's the simplest version that delivers value?' Technical impressiveness means nothing if it doesn't work at scale. And silent stakeholders are dangerous - the infrastructure team I ignored knew where the bodies were buried."`,
  },
];

export function Examples() {
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
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-4">
            Practice with Meelni
          </h2>
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
