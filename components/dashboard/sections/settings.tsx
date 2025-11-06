"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsSection() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Settings</h2>
        <p className="text-muted-foreground font-sans">
          Manage your account preferences and application settings.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-lg flex items-center justify-center">
              <div className="text-4xl">⚙️</div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-display font-light text-foreground">Coming Soon</h3>
              <p className="text-sm text-muted-foreground font-sans max-w-md mx-auto">
                User settings and preferences are currently in development. Check back soon!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
