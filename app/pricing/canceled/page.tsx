import { XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CheckoutCanceled() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
            <XCircle className="w-10 h-10 text-muted-foreground" />
          </div>
        </div>

        <h1 className="text-2xl font-display font-semibold text-foreground mb-2">
          Checkout Canceled
        </h1>

        <p className="text-muted-foreground mb-6">
          No worries! You can try again anytime you're ready.
        </p>

        <div className="space-y-3">
          <Link href="/pricing" className="block">
            <Button size="lg" className="w-full">
              Back to Pricing
            </Button>
          </Link>

          <Link href="/" className="block">
            <Button size="lg" variant="outline" className="w-full">
              Return Home
            </Button>
          </Link>
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          Need help? Contact us at{" "}
          <a href="mailto:support@meelni.com" className="text-primary hover:underline">
            support@meelni.com
          </a>
        </p>
      </Card>
    </div>
  );
}
