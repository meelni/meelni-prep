"use client";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

interface TabsProps {
  activeTab: string;
  setActiveTab: (tab: "yearly" | "monthly") => void;
  className?: string;
  children: (activeTab: string) => React.ReactNode;
}

interface TabsListProps {
  children: React.ReactNode;
}

interface TabsTriggerProps {
  value: string;
  onClick: () => void;
  children: React.ReactNode;
  isActive: boolean;
}

const Tabs = ({ activeTab, setActiveTab, className, children }: TabsProps) => {
  return (
    <div
      className={cn(
        "mx-auto flex w-full items-center justify-center",
        className
      )}
    >
      {children(activeTab)}
    </div>
  );
};

const TabsList = ({ children }: TabsListProps) => {
  return (
    <div className="relative flex w-fit items-center rounded-full border border-border bg-background/50 backdrop-blur-sm p-1.5 shadow-sm">
      {children}
    </div>
  );
};

const TabsTrigger = ({
  value,
  onClick,
  children,
  isActive,
}: TabsTriggerProps) => {
  return (
    <button
      onClick={onClick}
      className={cn("relative z-[1] px-6 py-2.5 rounded-full transition-all duration-200", { "z-0": isActive })}
    >
      {isActive && (
        <motion.div
          layoutId="active-tab"
          className="absolute inset-0 rounded-full bg-primary shadow-sm"
          transition={{
            duration: 0.2,
            type: "spring",
            stiffness: 300,
            damping: 25,
            velocity: 2,
          }}
        />
      )}
      <span
        className={cn(
          "relative block text-[15px] font-sans font-medium duration-200 transition-colors",
          isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {children}
      </span>
    </button>
  );
};

function PricingTier({
  tier,
  billingCycle,
  index,
}: {
  tier: (typeof siteConfig.pricing)[0];
  billingCycle: "monthly" | "yearly";
  index: number;
}) {
  const isPopular = tier.popular;

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
      className={cn(
        "group relative w-full h-full rounded-2xl border transition-all duration-300 backdrop-blur-md",
        isPopular
          ? "border-primary/60 bg-primary/10 hover:border-primary/80 hover:-translate-y-1 shadow-lg shadow-primary/10"
          : "border-border/60 bg-card/50 hover:border-primary/50 hover:bg-card/70 hover:-translate-y-1"
      )}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <Badge
            variant="secondary"
            className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0 px-4 py-1 shadow-lg"
          >
            <Sparkles className="w-3 h-3 mr-1.5" />
            Most Popular
          </Badge>
        </div>
      )}

      <div className="flex flex-col h-full p-8">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-[24px] font-sans font-semibold text-foreground mb-2">
            {tier.name}
          </h3>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            {tier.description}
          </p>
        </div>

        {/* Price */}
        <div className="mb-6">
          <motion.div
            key={tier.price[billingCycle]}
            initial={{
              opacity: 0,
              x: billingCycle === "yearly" ? -10 : 10,
              filter: "blur(5px)",
            }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="flex items-baseline gap-2"
          >
            <span className="text-5xl font-display font-light text-foreground">
              {tier.price[billingCycle]}
            </span>
            <span className="text-[15px] font-sans font-medium text-muted-foreground">
              / {tier.frequency[billingCycle]}
            </span>
          </motion.div>

          {/* Usage info */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-[15px] font-sans font-semibold text-foreground mb-1">
              {tier.usage}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {tier.usageDetail}
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="flex-grow mb-6">
          <ul className="space-y-3">
            {tier.features.map((feature, featureIndex) => (
              <li key={featureIndex} className="flex items-start gap-3">
                <div className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5",
                  isPopular ? "bg-primary/20" : "bg-muted"
                )}>
                  <Check className={cn(
                    "w-3 h-3",
                    isPopular ? "text-primary" : "text-foreground"
                  )} />
                </div>
                <span className="text-[15px] font-sans text-foreground leading-relaxed">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA Button */}
        <Button
          size="lg"
          className={cn(
            "w-full rounded-xl font-semibold text-[15px] transition-all duration-200",
            isPopular
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-foreground hover:bg-primary/10 hover:border-primary/50"
          )}
        >
          {tier.cta}
        </Button>
      </div>
    </motion.div>
  );
}

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly"
  );

  const handleTabChange = (tab: "yearly" | "monthly") => {
    setBillingCycle(tab);
  };

  return (
    <Section id="pricing">
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-12">
            <motion.h2
              className="text-display-lg font-display font-light text-foreground mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              Simple, transparent pricing
            </motion.h2>
            <motion.p
              className="text-body text-muted-foreground max-w-2xl mx-auto mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Choose the plan that fits your interview prep needs. All plans include access to all features.
            </motion.p>

            {/* Billing Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Tabs
                activeTab={billingCycle}
                setActiveTab={handleTabChange}
                className="mx-auto w-full max-w-md"
              >
                {(activeTab) => (
                  <TabsList>
                    {["monthly", "yearly"].map((tab) => (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        onClick={() => handleTabChange(tab as "yearly" | "monthly")}
                        isActive={activeTab === tab}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tab === "yearly" && (
                          <span className="ml-2 text-[13px] font-semibold text-green-500">
                            Save 20%
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                )}
              </Tabs>
            </motion.div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            {siteConfig.pricing.map((tier, index) => (
              <PricingTier key={index} tier={tier} billingCycle={billingCycle} index={index} />
            ))}
          </div>

        </div>
      </div>
    </Section>
  );
}
