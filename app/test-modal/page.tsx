"use client";

import { useState, useEffect } from "react";
import { SetupModal, InterviewConfig } from "@/components/dashboard/setup-modal";
import { useSetupModal } from "@/lib/hooks/use-setup-modal";
import { Button } from "@/components/ui/button";

export default function TestModalPage() {
  const setupModal = useSetupModal();
  const [lastConfig, setLastConfig] = useState<InterviewConfig | null>(null);

  // Track when config changes
  useEffect(() => {
    if (!setupModal.isOpen && setupModal.config.roundType && setupModal.config.mode) {
      setLastConfig(setupModal.config);
    }
  }, [setupModal.isOpen, setupModal.config]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Setup Modal Test</h1>
          <p className="text-muted-foreground">
            Click the button below to test the interview setup modal
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <Button onClick={setupModal.open} size="lg" variant="glow">
            Open Setup Modal
          </Button>
          <Button onClick={setupModal.resetConfig} size="lg" variant="outline">
            Reset Config
          </Button>
        </div>

        {lastConfig && (
          <div className="p-6 bg-card border border-border rounded-lg space-y-4">
            <h2 className="text-xl font-semibold">Last Configuration</h2>
            <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto">
              {JSON.stringify(lastConfig, null, 2)}
            </pre>
            <Button onClick={() => setLastConfig(null)} variant="outline">
              Clear
            </Button>
          </div>
        )}

        <SetupModal
          isOpen={setupModal.isOpen}
          onClose={setupModal.close}
          config={setupModal.config}
          updateConfig={setupModal.updateConfig}
          canProceedToNextStep={setupModal.canProceedToNextStep}
          onSubmit={setupModal.submitConfig}
          onUseSmartDefaults={setupModal.useSmartDefaults}
        />
      </div>
    </div>
  );
}
