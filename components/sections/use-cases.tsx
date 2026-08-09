"use client";

import { Section } from "@/components/section";
import OrbitingCircles from "@/components/ui/orbiting-circles";
import { cubicBezier, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangleIcon,
  BrainCircuitIcon,
  DatabaseIcon,
  GitForkIcon,
  HeadsetIcon,
  InfoIcon,
  MessageSquareIcon,
  SearchIcon,
  SquareTerminal,
  UserSearch,
  XCircleIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IntegrationIconTone =
  | "info"
  | "success"
  | "primary"
  | "warning"
  | "danger";

const integrationIconToneClasses: Record<IntegrationIconTone, string> = {
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

const mockLineClass = "h-2 rounded-full bg-muted";
const mockLineStrongClass =
  "h-2 rounded-full bg-foreground/40 dark:bg-foreground/70";

function IntegrationIconBadge({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon;
  tone: IntegrationIconTone;
}) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full",
        integrationIconToneClasses[tone]
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

const containerVariants = {
  initial: {},
  whileHover: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export function Card1() {
  const variant1 = {
    initial: {
      scale: 0.87,
      transition: {
        delay: 0.05,
        duration: 0.2,
        ease: "linear" as const,
      },
    },
    whileHover: {
      scale: 0.8,
      boxShadow:
        "rgba(245,40,145,0.35) 0px 20px 70px -10px, rgba(36,42,66,0.04) 0px 10px 24px -8px, rgba(36,42,66,0.06) 0px 1px 4px -1px",
      transition: {
        delay: 0.05,
        duration: 0.2,
        ease: "linear" as const,
      },
    },
  };
  const variant2 = {
    initial: {
      y: -27,
      scale: 0.95,
      transition: {
        delay: 0,
        duration: 0.2,
        ease: "linear" as const,
      },
    },
    whileHover: {
      y: -55,
      scale: 0.87,
      boxShadow:
        "rgba(39,127,245,0.15) 0px 20px 70px -10px, rgba(36,42,66,0.04) 0px 10px 24px -8px, rgba(36,42,66,0.06) 0px 1px 4px -1px",
      transition: {
        delay: 0,
        duration: 0.2,
        ease: "linear" as const,
      },
    },
  };
  const variant3 = {
    initial: {
      y: -25,
      opacity: 0,
      scale: 1,
      transition: {
        delay: 0.05,
        duration: 0.2,
        ease: "linear" as const,
      },
    },
    whileHover: {
      y: -45,
      opacity: 1,
      scale: 1,
      boxShadow:
        "rgba(39,245,76,0.15) 10px 20px 70px -20px, rgba(36,42,66,0.04) 0px 10px 24px -8px, rgba(36,42,66,0.06) 0px 1px 4px -1px",
      transition: {
        delay: 0.05,
        duration: 0.2,
        ease: "easeInOut" as const,
      },
    },
  };

  const containerVariants = {
    initial: {},
    whileHover: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <div className="h-full overflow-hidden border-b p-0 lg:border-r lg:border-b-0">
      <motion.div
        variants={containerVariants}
        initial="initial"
        whileHover="whileHover"
        className="flex h-full w-full cursor-pointer flex-col items-center justify-between gap-y-5"
      >
        <div className="flex h-full w-full items-center justify-center rounded-t-xl border-b">
          <div className="relative flex flex-col items-center justify-center gap-y-2 p-10">
            <motion.div
              variants={variant1}
              className="bg-background z-[1] flex h-full w-full items-center justify-between gap-x-2 rounded-md border p-5 px-2.5"
            >
              <IntegrationIconBadge icon={SearchIcon} tone="info" />
              <div className="flex flex-col gap-y-2">
                <div className={`${mockLineStrongClass} w-32`}></div>
                <div className={`${mockLineClass} w-48`}></div>
                <div className="text-muted-foreground text-xs">
                  Google Search API integration
                </div>
              </div>
            </motion.div>
            <motion.div
              variants={variant2}
              className="bg-background z-[2] flex h-full w-full items-center justify-between gap-x-2 rounded-md border p-5 px-2.5"
            >
              <IntegrationIconBadge icon={DatabaseIcon} tone="success" />
              <div className="flex flex-col gap-y-2">
                <div className={`${mockLineStrongClass} w-32`}></div>
                <div className={`${mockLineClass} w-48`}></div>
                <div className={`${mockLineClass} w-20`}></div>
                <div className="text-muted-foreground text-xs">
                  PostgreSQL database connection
                </div>
              </div>
            </motion.div>
            <motion.div
              variants={variant3}
              className="bg-background absolute bottom-0 z-[3] m-auto flex h-fit w-fit items-center justify-between gap-x-2 rounded-md border p-5 px-2.5"
            >
              <IntegrationIconBadge icon={MessageSquareIcon} tone="primary" />
              <div className="flex flex-col gap-y-2">
                <div className={`${mockLineStrongClass} w-32`}></div>
                <div className={`${mockLineClass} w-48`}></div>
                <div className={`${mockLineClass} w-20`}></div>
                <div className={`${mockLineClass} w-48`}></div>
                <div className="text-muted-foreground text-xs">
                  OpenAI GPT-3.5 API integration
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-y-1 px-5 pb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Tool Integration
          </h2>
          <p className="text-muted-foreground text-sm">
            Seamlessly integrate external APIs and tools into agent workflows.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const Card2 = () => {
  const logs = [
    {
      id: 1,
      type: "info",
      timestamp: "2023-12-15 14:23:45",
      message: "Agent initialized. Starting task execution.",
      icon: InfoIcon,
      tone: "info" as const,
    },
    {
      id: 2,
      type: "action",
      timestamp: "2023-12-15 14:23:47",
      message: "Retrieving data from external API...",
      icon: DatabaseIcon,
      tone: "success" as const,
    },
    {
      id: 3,
      type: "decision",
      timestamp: "2023-12-15 14:23:50",
      message: "Analyzing data. Confidence: 85%",
      icon: BrainCircuitIcon,
      tone: "primary" as const,
    },
    {
      id: 4,
      type: "warning",
      timestamp: "2023-12-15 14:23:52",
      message: "Potential anomaly detected in dataset.",
      icon: AlertTriangleIcon,
      tone: "warning" as const,
    },
    {
      id: 5,
      type: "error",
      timestamp: "2023-12-15 14:23:55",
      message: "Failed to connect to secondary database.",
      icon: XCircleIcon,
      tone: "danger" as const,
    },
  ];
  return (
    <div className="h-full overflow-hidden border-b p-0 lg:border-r lg:border-b-0">
      <motion.div
        variants={containerVariants}
        initial="initial"
        whileHover="whileHover"
        className="flex h-full w-full cursor-pointer flex-col items-center justify-between gap-y-5"
      >
        <div className="flex h-4/5 w-full items-center justify-center overflow-hidden rounded-t-xl border-b bg-transparent">
          <motion.div className="flex h-[270px] w-full cursor-pointer flex-col gap-y-3.5 overflow-hidden rounded-t-md p-5">
            {logs.map((log, index) => (
              <motion.div
                key={log.id}
                className="shadow-border/50 border-border flex w-full origin-right items-center rounded-md border bg-transparent p-4 shadow-sm backdrop-blur-md"
                custom={index}
                variants={{
                  initial: (index: number) => ({
                    y: 0,
                    scale: index === 4 ? 0.9 : 1,
                    opacity: 1,
                    transition: {
                      delay: 0.05,
                      duration: 0.2,
                      ease: cubicBezier(0.22, 1, 0.36, 1),
                    },
                  }),
                  whileHover: (index: number) => ({
                    y: -85,
                    opacity: index === 4 ? 1 : 0.6,
                    scale: index === 0 ? 0.85 : index === 4 ? 1.1 : 1,
                    transition: {
                      delay: 0.05,
                      duration: 0.2,
                      ease: cubicBezier(0.22, 1, 0.36, 1),
                    },
                  }),
                }}
                transition={{
                  type: "spring",
                  damping: 40,
                  stiffness: 600,
                }}
              >
                <div className="mr-3">
                  <IntegrationIconBadge icon={log.icon} tone={log.tone} />
                </div>
                <div className="flex-grow">
                  <p className="text-foreground text-xs font-medium">
                    [{log.timestamp}] {log.type.toUpperCase()}
                  </p>
                  <p className="text-muted-foreground text-xs">{log.message}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
        <div className="flex w-full flex-col items-start gap-y-1 px-5 pb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Monitor agent activity
          </h2>
          <p className="text-muted-foreground text-sm">
            Track and analyze your AI agent performance with detailed activity
            logs.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const Card3 = () => {
  return (
    <div className="-z-0 min-h-[500px] overflow-hidden border-b p-0 lg:min-h-fit lg:border-b-0">
      <div className="relative flex h-full w-full flex-col items-center justify-between gap-y-5">
        <div className="flex h-4/5 w-full items-center justify-center overflow-hidden rounded-t-xl border-b">
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="bg-[radial-gradient(circle,color-mix(in oklab, var(--accent) 30%, transparent)_0%,transparent_100%)] absolute top-0 right-0 bottom-0 left-0"></div>
            <OrbitingCircles duration={15} delay={0} radius={40} reverse>
              <IntegrationIconBadge icon={HeadsetIcon} tone="info" />
            </OrbitingCircles>
            <OrbitingCircles duration={15} delay={20} radius={80}>
              <IntegrationIconBadge icon={SquareTerminal} tone="success" />
            </OrbitingCircles>
            <OrbitingCircles radius={120} duration={20} delay={20}>
              <IntegrationIconBadge icon={UserSearch} tone="primary" />
            </OrbitingCircles>
            <OrbitingCircles radius={160} duration={40} delay={20}>
              <IntegrationIconBadge icon={MessageSquareIcon} tone="warning" />
            </OrbitingCircles>
            <OrbitingCircles radius={200} duration={30}>
              <IntegrationIconBadge icon={GitForkIcon} tone="danger" />
            </OrbitingCircles>
          </div>
        </div>
        <div className="flex w-full flex-col items-start gap-y-1 px-5 pb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Build once, run anywhere
          </h2>
          <p className="text-muted-foreground text-sm">
            Create AI agents that work seamlessly across different platforms.
          </p>
        </div>
      </div>
    </div>
  );
};

export function UseCases() {
  return (
    <Section id="use-cases" title="Use Cases">
      <div className="grid h-full border border-b-0 lg:grid-cols-3">
        <Card1 />
        <Card2 />
        <Card3 />
      </div>
    </Section>
  );
}
