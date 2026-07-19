import { redirect } from "next/navigation";

import CheckoutSuccessClient from "./checkout-success-client";

export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (Object.keys(query).length > 0) {
    redirect("/pricing/success");
  }
  return <CheckoutSuccessClient />;
}
