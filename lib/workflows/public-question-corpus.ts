import {
  getQuestions,
  type QuestionBankRecord,
  type QuestionListOptions,
} from "@/lib/db/questions";

export interface PublicQuestion {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: string | null;
  isActive: boolean;
  createdAt: string | null;
}

export interface PublicQuestionCorpus {
  questions: PublicQuestion[];
  total: number;
}

type QuestionListReader = (
  options: QuestionListOptions
) => Promise<{ questions: QuestionBankRecord[]; total: number }>;

export async function loadPublicQuestionCorpus(
  options: Omit<QuestionListOptions, "activeOnly"> = {},
  readQuestions: QuestionListReader = getQuestions
): Promise<PublicQuestionCorpus> {
  const result = await readQuestions({
    ...options,
    activeOnly: true,
  });

  if (
    !options.roundType &&
    !options.search &&
    (options.offset ?? 0) === 0 &&
    result.total === 0
  ) {
    throw new Error("question_bank_unavailable");
  }

  return {
    total: result.total,
    questions: result.questions.map(serializePublicQuestion),
  };
}

function serializePublicQuestion(question: QuestionBankRecord): PublicQuestion {
  return {
    ...question,
    askedAt: question.askedAt?.toISOString() ?? null,
    createdAt: question.createdAt?.toISOString() ?? null,
  };
}
