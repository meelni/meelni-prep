import { XCircle } from "lucide-react";
import Link from "next/link";
import {
  MarketingCtaCard,
  MarketingPage,
} from "@/components/marketing/marketing-surface";
import { Button } from "@/components/ui/button";

export default function CheckoutCanceled() {
  return (
    <MarketingPage className="flex items-center justify-center px-4">
      <MarketingCtaCard
        className="w-full max-w-md"
        tone="muted"
        mark={<XCircle className="h-8 w-8" />}
        title="Checkout Canceled"
        description="No credits were added and no payment method was charged."
        action={
          <div className="flex w-full flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/pricing">Back to Pricing</Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/">Return Home</Link>
            </Button>
          </div>
        }
        footer={
          <>
            Need help? Contact us at{" "}
            <a
              href="mailto:contact@meelni.com"
              className="text-primary hover:underline"
            >
              contact@meelni.com
            </a>
          </>
        }
      />
    </MarketingPage>
  );
}
