"use client";

import { memo, useState, useEffect } from "react";
import {
  DashboardActionCard,
  DashboardSectionCard,
} from "@/components/dashboard/dashboard-surface";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  User,
  Palette,
  Save,
  Trash2,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { BillingSection } from "./billing";

interface SettingsState {
  // Account
  displayName: string;
  email: string;

  // Appearance
  theme: string;
}

export const SettingsSection = memo(function SettingsSection() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<SettingsState>({
    displayName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
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
            setSettings((prev) => ({ ...prev, ...data.settings }));
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
            setSettings((prev) => ({ ...prev, ...parsed }));
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
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
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

  const [isDeleting, setIsDeleting] = useState(false);

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
          setIsDeleting(true);
          try {
            const response = await fetch("/api/user/delete", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ confirmation: "DELETE" }),
            });

            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || "Failed to delete account");
            }

            // Account deleted - redirect to home
            alert(
              "Your account has been deleted. You will be redirected to the home page."
            );
            window.location.href = "/";
          } catch (error) {
            console.error("Failed to delete account:", error);
            alert(
              error instanceof Error
                ? error.message
                : "Failed to delete account. Please contact support at support@meelni.com"
            );
          } finally {
            setIsDeleting(false);
          }
        }
      }
    }
  };

  return (
    <div className="max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="font-display text-foreground text-2xl font-light">
          Settings
        </h2>
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
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
        {saveSuccess && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-success text-sm"
          >
            Settings saved successfully!
          </motion.span>
        )}
      </div>

      {/* Account Settings */}
      <DashboardSectionCard
        title={
          <span className="flex items-center gap-2">
            <User className="text-primary h-5 w-5" />
            Account
          </span>
        }
        description="Manage your personal information and account details."
        contentClassName="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={settings.displayName}
            onChange={(e) =>
              setSettings({ ...settings, displayName: e.target.value })
            }
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
            className="cursor-not-allowed opacity-60"
          />
          <p className="text-muted-foreground text-xs">
            Email cannot be changed. Managed by Google OAuth.
          </p>
        </div>
      </DashboardSectionCard>

      {/* Billing Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="text-primary h-5 w-5" />
          <h3 className="font-display text-foreground text-xl font-light">
            Billing & Subscription
          </h3>
        </div>
        <BillingSection />
      </div>

      {/* Appearance */}
      <DashboardSectionCard
        title={
          <span className="flex items-center gap-2">
            <Palette className="text-primary h-5 w-5" />
            Appearance
          </span>
        }
        description="Customize how Meelni looks and feels."
        contentClassName="space-y-4"
      >
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
              fetch("/api/user/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newSettings),
              }).catch((err) => console.error("Failed to save theme:", err));
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
          <p className="text-muted-foreground text-xs">
            Choose your preferred color scheme. System will match your device
            settings.
          </p>
        </div>
      </DashboardSectionCard>

      {/* Danger Zone */}
      <DashboardActionCard
        icon={<AlertTriangle className="text-destructive h-5 w-5" />}
        title="Danger Zone"
        description="Irreversible actions that affect your account."
        className="border-destructive/20 bg-destructive/5 hover:border-destructive/30"
        action={
          <Button
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete Account"}
          </Button>
        }
      >
        <p className="text-muted-foreground text-xs">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>
      </DashboardActionCard>

      {/* Bottom Save Button */}
      <div className="border-border flex items-center gap-3 border-t pt-4">
        <Button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
        {saveSuccess && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-success text-sm"
          >
            Settings saved successfully!
          </motion.span>
        )}
      </div>
    </div>
  );
});
