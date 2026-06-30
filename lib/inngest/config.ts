import type { Inngest } from "inngest";

export type InngestEnv = {
  NODE_ENV?: string;
  INNGEST_EVENT_KEY?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
};

type InngestClientOptions = ConstructorParameters<typeof Inngest>[0];

export function getInngestClientOptions(
  env: InngestEnv = process.env
): InngestClientOptions {
  const options: InngestClientOptions = {
    id: "meelni",
  };

  if (env.NODE_ENV !== "production") {
    return {
      ...options,
      isDev: true,
    };
  }

  const eventKey = env.INNGEST_EVENT_KEY?.trim();
  if (eventKey) {
    return {
      ...options,
      eventKey,
    };
  }

  return options;
}
