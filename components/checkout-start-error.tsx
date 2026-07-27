import { cn } from "@/lib/utils";

export const CHECKOUT_START_ERROR_MESSAGE =
  "Checkout couldn’t start. Please try again. If the problem continues, contact support.";

export function CheckoutStartError({
  message,
  className,
}: {
  message: string | null;
  className?: string;
}) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className={cn(
        "border-destructive/20 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm",
        className
      )}
    >
      {message}
    </p>
  );
}
