"use client";

import { memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  User,
  Bell,
  Shield,
  Palette,
  Mic,
  Save,
  Trash2,
  AlertTriangle,
  CreditCard
} from "lucide-react";
import { BillingSection } from "./billing";

interface SettingsState {
  // Account
  displayName: string;
  email: string;

  // Interview Preferences
  defaultInterviewType: string;
  defaultDifficulty: string;
  questionRecency: string;
  autoSaveTranscripts: boolean;

  // Notifications
  emailNotifications: boolean;
  sessionCompletionEmail: boolean;
  feedbackReadyEmail: boolean;
  weeklyProgressReport: boolean;

  // Privacy
  shareAnonymousData: boolean;
  saveTranscripts: boolean;

  // Appearance
  theme: string;
}

export const SettingsSection = memo(function SettingsSection() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SettingsState>({
    displayName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
    defaultInterviewType: "product_sense",
    defaultDifficulty: "medium",
    questionRecency: "current",
    autoSaveTranscripts: true,
    emailNotifications: true,
    sessionCompletionEmail: true,
    feedbackReadyEmail: true,
    weeklyProgressReport: false,
    shareAnonymousData: true,
    saveTranscripts: true,
    theme: "system",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    // Load settings from database
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/user/settings");
        if (response.ok) {
          const data = await response.json();
          if (data.settings) {
            setSettings(prev => ({ ...prev, ...data.settings }));
            // Apply theme if it exists in settings
            if (data.settings.theme) {
              setTheme(data.settings.theme);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        // Fallback to localStorage if API fails
        const savedSettings = localStorage.getItem("meelni-settings");
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            setSettings(prev => ({ ...prev, ...parsed }));
            if (parsed.theme) {
              setTheme(parsed.theme);
            }
          } catch (e) {
            console.error("Failed to parse saved settings:", e);
          }
        }
      }
    };

    loadSettings();
  }, [setTheme]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Save to database via API
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Also save to localStorage as backup
      localStorage.setItem("meelni-settings", JSON.stringify(settings));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This action cannot be undone. All your interview data, transcripts, and progress will be permanently deleted."
    );

    if (confirmed) {
      const doubleConfirm = window.confirm(
        "This is your final warning. Type DELETE in the next prompt to confirm account deletion."
      );

      if (doubleConfirm) {
        const userInput = window.prompt("Type DELETE to confirm:");
        if (userInput === "DELETE") {
          // TODO: Implement account deletion API
          alert("Account deletion is not yet implemented. Please contact support.");
        }
      }
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Settings</h2>
        <p className="text-muted-foreground font-sans">
          Manage your account preferences and application settings.
        </p>
      </div>

      {/* Save Button - Sticky at top */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
        {saveSuccess && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-green-600 dark:text-green-400"
          >
            Settings saved successfully!
          </motion.span>
        )}
      </div>

      {/* Account Settings */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <CardTitle className="font-display font-light">Account</CardTitle>
          </div>
          <CardDescription>
            Manage your personal information and account details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={settings.displayName}
              onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={settings.email}
              disabled
              className="opacity-60 cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed. Managed by Google OAuth.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Billing Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-xl font-display font-light text-foreground">Billing & Subscription</h3>
        </div>
        <BillingSection />
      </div>

      {/* Interview Preferences */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            <CardTitle className="font-display font-light">Interview Preferences</CardTitle>
          </div>
          <CardDescription>
            Set your default preferences for interview sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interviewType">Default Interview Type</Label>
              <Select
                value={settings.defaultInterviewType}
                onValueChange={(value) => setSettings({ ...settings, defaultInterviewType: value })}
              >
                <SelectTrigger id="interviewType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_sense">Product Sense</SelectItem>
                  <SelectItem value="analytical">Analytical Thinking</SelectItem>
                  <SelectItem value="behavioral">Leadership & Drive</SelectItem>
                  <SelectItem value="strategy">Strategy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="difficulty">Default Difficulty</Label>
              <Select
                value={settings.defaultDifficulty}
                onValueChange={(value) => setSettings({ ...settings, defaultDifficulty: value })}
              >
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="questionRecency">Question Recency Preference</Label>
            <Select
              value={settings.questionRecency}
              onValueChange={(value) => setSettings({ ...settings, questionRecency: value })}
            >
              <SelectTrigger id="questionRecency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Trends (Last 3 months)</SelectItem>
                <SelectItem value="recent">Broader Practice (Last year)</SelectItem>
                <SelectItem value="all">All Questions</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls which questions appear in your mock interviews based on when they were asked in real interviews.
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Auto-save Transcripts</Label>
              <p className="text-sm text-muted-foreground">
                Automatically save conversation transcripts after each session
              </p>
            </div>
            <Switch
              checked={settings.autoSaveTranscripts}
              onCheckedChange={(checked) => setSettings({ ...settings, autoSaveTranscripts: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <CardTitle className="font-display font-light">Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure how and when you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <Switch
              checked={settings.emailNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2 opacity-60">
            <div className="space-y-0.5">
              <Label>Session Completion Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when an interview session is completed
              </p>
            </div>
            <Switch
              checked={settings.sessionCompletionEmail}
              disabled={!settings.emailNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, sessionCompletionEmail: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2 opacity-60">
            <div className="space-y-0.5">
              <Label>Feedback Ready Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified when your interview feedback is ready
              </p>
            </div>
            <Switch
              checked={settings.feedbackReadyEmail}
              disabled={!settings.emailNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, feedbackReadyEmail: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2 opacity-60">
            <div className="space-y-0.5">
              <Label>Weekly Progress Report</Label>
              <p className="text-sm text-muted-foreground">
                Receive a weekly summary of your interview practice progress
              </p>
            </div>
            <Switch
              checked={settings.weeklyProgressReport}
              disabled={!settings.emailNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, weeklyProgressReport: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Data */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="font-display font-light">Privacy & Data</CardTitle>
          </div>
          <CardDescription>
            Control how your data is used and stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Share Anonymous Usage Data</Label>
              <p className="text-sm text-muted-foreground">
                Help improve Meelni by sharing anonymous usage analytics
              </p>
            </div>
            <Switch
              checked={settings.shareAnonymousData}
              onCheckedChange={(checked) => setSettings({ ...settings, shareAnonymousData: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label>Save Interview Transcripts</Label>
              <p className="text-sm text-muted-foreground">
                Store your interview transcripts for review and analysis
              </p>
            </div>
            <Switch
              checked={settings.saveTranscripts}
              onCheckedChange={(checked) => setSettings({ ...settings, saveTranscripts: checked })}
            />
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => {
                // TODO: Implement data export
                alert("Data export feature coming soon!");
              }}
            >
              Export My Data
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Download all your interview data, transcripts, and feedback in JSON format.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <CardTitle className="font-display font-light">Appearance</CardTitle>
          </div>
          <CardDescription>
            Customize how Meelni looks and feels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={theme || settings.theme}
              onValueChange={(value) => {
                // Update both immediately
                setTheme(value);
                const newSettings = { ...settings, theme: value };
                setSettings(newSettings);

                // Save to database immediately
                fetch('/api/user/settings', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newSettings)
                }).catch(err => console.error('Failed to save theme:', err));
              }}
            >
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose your preferred color scheme. System will match your device settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-card border-red-500/20 border-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <CardTitle className="font-display font-light text-red-500">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Irreversible actions that affect your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full md:w-auto border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-600"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Save Button */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
        {saveSuccess && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-green-600 dark:text-green-400"
          >
            Settings saved successfully!
          </motion.span>
        )}
      </div>
    </div>
  );
});
