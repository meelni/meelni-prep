"use client";

import { useState } from "react";
import { SetupModal, InterviewConfig } from "@/components/dashboard/setup-modal";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function TestModalAnimationsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<InterviewConfig>({
    roundType: null,
    mode: null,
    voiceSettings: {
      voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
      speed: 1.0,
      emotion: "confident",
    },
  });

  const updateConfig = (partial: Partial<InterviewConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...partial,
      voiceSettings: {
        ...prev.voiceSettings,
        ...(partial.voiceSettings || {}),
      },
    }));
  };

  const canProceedToNextStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return config.roundType !== null;
      case 2:
        return config.mode !== null;
      case 3:
        return true; // Voice settings are optional
      default:
        return false;
    }
  };

  const handleSubmit = () => {
    console.log("Interview Config:", config);
    setIsOpen(false);
    alert("Interview started! Check console for config.");
  };

  const handleSmartDefaults = () => {
    updateConfig({
      roundType: "product_sense",
      mode: "mock_interview",
      voiceSettings: {
        voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
        speed: 1.0,
        emotion: "confident",
      },
    });
    // Automatically proceed to interview after a brief moment
    setTimeout(() => {
      handleSubmit();
    }, 800);
  };

  const resetConfig = () => {
    setConfig({
      roundType: null,
      mode: null,
      voiceSettings: {
        voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
        speed: 1.0,
        emotion: "confident",
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
            Setup Modal Animation Test
          </h1>
          <p className="text-muted-foreground">
            Test all animation features of the Setup Modal
          </p>
        </div>

        {/* Test Controls */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Test Controls</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={() => setIsOpen(true)} variant="glow" className="w-full">
              Open Modal
            </Button>
            <Button onClick={resetConfig} variant="outline" className="w-full">
              Reset Config
            </Button>
          </div>

          {/* Current Config Display */}
          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border/50">
            <h3 className="text-sm font-semibold mb-2">Current Configuration</h3>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interview Type:</span>
                <span className="text-foreground">
                  {config.roundType || "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode:</span>
                <span className="text-foreground">{config.mode || "Not selected"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Speed:</span>
                <span className="text-foreground">
                  {config.voiceSettings.speed.toFixed(1)}x
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Emotion:</span>
                <span className="text-foreground">{config.voiceSettings.emotion}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Animation Features Checklist */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Animation Features to Test</h2>

          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Step Transitions:</strong> Navigate forward and backward to see
                directional slide animations
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Smart Defaults Card:</strong> Hover to see breathing pulse and
                gradient shimmer
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Interview Type Cards:</strong> Hover for lift effect, click to see
                selection glow
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Mode Selection Cards:</strong> Hover for subtle lift, watch radio
                button animation
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Step Indicator:</strong> Hover dots for tooltips, watch checkmarks
                appear
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Advanced Settings:</strong> Toggle to see chevron rotation and mic
                wiggle
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>
                <strong>Icon Animations:</strong> Icons scale on hover throughout the modal
              </span>
            </div>
          </div>
        </div>

        {/* Performance Notes */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Performance Verification</h2>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              All animations use <code className="text-foreground">transform</code> and{" "}
              <code className="text-foreground">opacity</code> properties for 60fps
              performance.
            </p>
            <p>
              Spring physics with <code className="text-foreground">stiffness: 400</code>{" "}
              and <code className="text-foreground">damping: 25-30</code> provide natural
              feel.
            </p>
            <p>
              Duration of 300-500ms for interactions, 2-2.5s for ambient breathing
              effects.
            </p>
          </div>
        </div>

        {/* Accessibility Notes */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Accessibility Considerations</h2>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              ✓ ESC key closes modal
            </p>
            <p>
              ✓ Focus trap keeps keyboard navigation within modal
            </p>
            <p>
              ✓ Proper ARIA labels and roles
            </p>
            <p>
              ✓ All animations respect{" "}
              <code className="text-foreground">prefers-reduced-motion</code> (native
              Framer Motion support)
            </p>
            <p>
              ✓ Keyboard navigation preserves smooth focus transitions
            </p>
          </div>
        </div>
      </motion.div>

      {/* Setup Modal */}
      <SetupModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        config={config}
        updateConfig={updateConfig}
        canProceedToNextStep={canProceedToNextStep}
        onSubmit={handleSubmit}
        onUseSmartDefaults={handleSmartDefaults}
      />
    </div>
  );
}
