/**
 * Unit Tests for Permissions Service
 *
 * Tests tier-based access control for interview types.
 */

import { describe, it, expect } from "vitest";
import {
  canAccessInterviewType,
  getAllowedInterviewTypes,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
  ALL_INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type SubscriptionTier,
  type RoundType,
} from "../permissions-service";

describe("Permissions Service", () => {
  describe("canAccessInterviewType", () => {
    it("should allow free tier to access product_sense", () => {
      expect(canAccessInterviewType("free", "product_sense")).toBe(true);
    });

    it("should deny free tier access to behavioral", () => {
      expect(canAccessInterviewType("free", "behavioral")).toBe(false);
    });

    it("should deny free tier access to execution", () => {
      expect(canAccessInterviewType("free", "execution")).toBe(false);
    });

    it("should deny free tier access to strategy", () => {
      expect(canAccessInterviewType("free", "strategy")).toBe(false);
    });

    it("should allow pro tier to access all interview types", () => {
      const allTypes: RoundType[] = [
        "product_sense",
        "behavioral",
        "execution",
        "strategy",
      ];

      allTypes.forEach((type) => {
        expect(canAccessInterviewType("pro", type)).toBe(true);
      });
    });

    it("should allow premium tier to access all interview types", () => {
      const allTypes: RoundType[] = [
        "product_sense",
        "behavioral",
        "execution",
        "strategy",
      ];

      allTypes.forEach((type) => {
        expect(canAccessInterviewType("premium", type)).toBe(true);
      });
    });
  });

  describe("getAllowedInterviewTypes", () => {
    it("should return only product_sense for free tier", () => {
      const allowed = getAllowedInterviewTypes("free");
      expect(allowed).toEqual(["product_sense"]);
    });

    it("should return all interview types for pro tier", () => {
      const allowed = getAllowedInterviewTypes("pro");
      expect(allowed).toEqual(ALL_INTERVIEW_TYPES);
      expect(allowed).toHaveLength(4);
    });

    it("should return all interview types for premium tier", () => {
      const allowed = getAllowedInterviewTypes("premium");
      expect(allowed).toEqual(ALL_INTERVIEW_TYPES);
      expect(allowed).toHaveLength(4);
    });
  });

  describe("getLockedInterviewTypes", () => {
    it("should return 3 locked types for free tier", () => {
      const locked = getLockedInterviewTypes("free");
      expect(locked).toEqual(["behavioral", "execution", "strategy"]);
      expect(locked).toHaveLength(3);
    });

    it("should return no locked types for pro tier", () => {
      const locked = getLockedInterviewTypes("pro");
      expect(locked).toEqual([]);
    });

    it("should return no locked types for premium tier", () => {
      const locked = getLockedInterviewTypes("premium");
      expect(locked).toEqual([]);
    });
  });

  describe("getRequiredTier", () => {
    it("should return 'free' for product_sense", () => {
      expect(getRequiredTier("product_sense")).toBe("free");
    });

    it("should return 'pro' for behavioral", () => {
      expect(getRequiredTier("behavioral")).toBe("pro");
    });

    it("should return 'pro' for execution", () => {
      expect(getRequiredTier("execution")).toBe("pro");
    });

    it("should return 'pro' for strategy", () => {
      expect(getRequiredTier("strategy")).toBe("pro");
    });
  });

  describe("getRequiredTierBadge", () => {
    it("should return empty string for product_sense (free tier)", () => {
      expect(getRequiredTierBadge("product_sense")).toBe("");
    });

    it("should return 'Pro' for behavioral", () => {
      expect(getRequiredTierBadge("behavioral")).toBe("Pro");
    });

    it("should return 'Pro' for execution", () => {
      expect(getRequiredTierBadge("execution")).toBe("Pro");
    });

    it("should return 'Pro' for strategy", () => {
      expect(getRequiredTierBadge("strategy")).toBe("Pro");
    });
  });

  describe("INTERVIEW_TYPE_LABELS", () => {
    it("should have labels for all interview types", () => {
      expect(INTERVIEW_TYPE_LABELS).toEqual({
        product_sense: "Product Sense",
        behavioral: "Behavioral",
        execution: "Execution",
        strategy: "Strategy",
      });
    });

    it("should have a label for every interview type in ALL_INTERVIEW_TYPES", () => {
      ALL_INTERVIEW_TYPES.forEach((type) => {
        expect(INTERVIEW_TYPE_LABELS[type]).toBeDefined();
        expect(INTERVIEW_TYPE_LABELS[type]).not.toBe("");
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle tier comparison correctly", () => {
      // Free tier restrictions
      const freeTier: SubscriptionTier = "free";
      expect(canAccessInterviewType(freeTier, "product_sense")).toBe(true);
      expect(canAccessInterviewType(freeTier, "behavioral")).toBe(false);

      // Pro tier permissions
      const proTier: SubscriptionTier = "pro";
      expect(canAccessInterviewType(proTier, "product_sense")).toBe(true);
      expect(canAccessInterviewType(proTier, "behavioral")).toBe(true);
      expect(canAccessInterviewType(proTier, "execution")).toBe(true);
      expect(canAccessInterviewType(proTier, "strategy")).toBe(true);

      // Premium tier permissions (same as Pro for interview types)
      const premiumTier: SubscriptionTier = "premium";
      expect(canAccessInterviewType(premiumTier, "product_sense")).toBe(true);
      expect(canAccessInterviewType(premiumTier, "behavioral")).toBe(true);
      expect(canAccessInterviewType(premiumTier, "execution")).toBe(true);
      expect(canAccessInterviewType(premiumTier, "strategy")).toBe(true);
    });
  });

  describe("Consistency Checks", () => {
    it("should have consistent allowed + locked types = all types", () => {
      const tiers: SubscriptionTier[] = ["free", "pro", "premium"];

      tiers.forEach((tier) => {
        const allowed = getAllowedInterviewTypes(tier);
        const locked = getLockedInterviewTypes(tier);
        const combined = [...allowed, ...locked].sort();

        expect(combined).toEqual([...ALL_INTERVIEW_TYPES].sort());
      });
    });

    it("should have no overlap between allowed and locked types", () => {
      const tiers: SubscriptionTier[] = ["free", "pro", "premium"];

      tiers.forEach((tier) => {
        const allowed = getAllowedInterviewTypes(tier);
        const locked = getLockedInterviewTypes(tier);

        const overlap = allowed.filter((type) => locked.includes(type));
        expect(overlap).toEqual([]);
      });
    });
  });
});
