import { ExploreClient } from "./explore-client";
import {
  loadPublicQuestionCorpus,
  type PublicQuestion,
} from "@/lib/workflows/public-question-corpus";

export const dynamic = "force-dynamic";

const INITIAL_QUESTION_LIMIT = 20;
const PUBLIC_QUESTION_LOAD_ERROR =
  "We couldn't load the question bank. Check your connection and try again.";

export default async function ExplorePage() {
  let initialQuestions: PublicQuestion[] = [];
  let initialTotal = 0;
  let initialLoadError: string | null = null;

  try {
    const corpus = await loadPublicQuestionCorpus({
      limit: INITIAL_QUESTION_LIMIT,
      offset: 0,
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
