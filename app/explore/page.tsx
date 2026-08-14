import { ExploreClient } from "./explore-client";
import {
  loadPublicQuestionCorpus,
  type PublicQuestion,
} from "@/lib/workflows/public-question-corpus";
import {
  EXPLORE_QUESTIONS_PER_PAGE,
  parseExploreUrlState,
} from "@/lib/explore/explore-url-state";

export const dynamic = "force-dynamic";

const PUBLIC_QUESTION_LOAD_ERROR =
  "We couldn't load the question bank. Check your connection and try again.";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) urlSearchParams.append(key, item);
    } else if (value !== undefined) {
      urlSearchParams.set(key, value);
    }
  }
  const urlState = parseExploreUrlState(urlSearchParams);
  let initialQuestions: PublicQuestion[] = [];
  let initialTotal = 0;
  let initialLoadError: string | null = null;

  try {
    const corpus = await loadPublicQuestionCorpus({
      limit: EXPLORE_QUESTIONS_PER_PAGE,
      offset: (urlState.page - 1) * EXPLORE_QUESTIONS_PER_PAGE,
      search: urlState.search || undefined,
      roundType: urlState.roundType || undefined,
    });
    initialQuestions = corpus.questions;
    initialTotal = corpus.total;
  } catch {
    console.error("Failed to load the initial public question corpus");
    initialLoadError = PUBLIC_QUESTION_LOAD_ERROR;
  }

  return (
    <ExploreClient
      initialQuestions={initialQuestions}
      initialTotal={initialTotal}
      initialLoadError={initialLoadError}
    />
  );
}
