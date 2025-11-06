"use client";

import { useState } from "react";
import { SetupModal, InterviewConfig } from "@/components/dashboard/setup-modal";
import { Button } from "@/components/ui/button";

export default function TestModalPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [submittedConfig, setSubmittedConfig] = useState<InterviewConfig | null>(null);

  const handleSubmit = (config: InterviewConfig) => {
    console.log("Submitted config:", config);
    setSubmittedConfig(config);
    setIsOpen(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Setup Modal Test</h1>
          <p className="text-muted-foreground">
            Click the button below to test the interview setup modal
          </p>
        </div>

        <div className="flex justify-center">
          <Button onClick={() => setIsOpen(true)} size="lg" variant="glow">
            Open Setup Modal
          </Button>
        </div>

        {submittedConfig && (
          <div className="p-6 bg-card border border-border rounded-lg space-y-4">
            <h2 className="text-xl font-semibold">Submitted Configuration</h2>
            <pre className="p-4 bg-muted rounded-lg text-sm overflow-auto">
              {JSON.stringify(submittedConfig, null, 2)}
            </pre>
            <Button onClick={() => setSubmittedConfig(null)} variant="outline">
              Clear
            </Button>
          </div>
        )}

        <SetupModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
