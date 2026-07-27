import {
  buildQuestionBankSummary,
  formatRoundType,
  type DashboardQuestionInput,
} from "@/lib/dashboard/contracts";

export interface QuestionBankFilterState {
  searchQuery: string;
  roundLabel: string;
  company: string | null;
}

export interface QuestionBankFacetSummary {
  allRoundsCount: number;
  roundCounts: Record<string, number>;
  allCompaniesCount: number;
  companyCounts: Record<string, number>;
  results: DashboardQuestionInput[];
}

export function buildQuestionBankFacets(
  questions: DashboardQuestionInput[],
  filters: QuestionBankFilterState
): QuestionBankFacetSummary {
  const searchMatches = filterQuestionBank(questions, filters, {
    omitRound: true,
    omitCompany: true,
  });
  const roundFacetQuestions = filterQuestionBank(searchMatches, filters, {
    omitRound: true,
  });
  const companyFacetQuestions = filterQuestionBank(searchMatches, filters, {
    omitCompany: true,
  });

  return {
    allRoundsCount: roundFacetQuestions.length,
    roundCounts: buildQuestionBankSummary(roundFacetQuestions).roundCounts,
    allCompaniesCount: companyFacetQuestions.length,
    companyCounts: buildQuestionBankSummary(companyFacetQuestions)
      .companyCounts,
    results: filterQuestionBank(searchMatches, filters),
  };
}

function filterQuestionBank(
  questions: DashboardQuestionInput[],
  filters: QuestionBankFilterState,
  {
    omitRound = false,
    omitCompany = false,
  }: {
    omitRound?: boolean;
    omitCompany?: boolean;
  } = {}
) {
  const query = filters.searchQuery.trim().toLowerCase();

  return questions.filter((question) => {
    const matchesSearch =
      query.length === 0 ||
      question.questionText.toLowerCase().includes(query) ||
      question.company?.toLowerCase().includes(query);
    const matchesRound =
      omitRound ||
      filters.roundLabel === "All rounds" ||
      formatRoundType(question.questionType) === filters.roundLabel;
    const matchesCompany =
      omitCompany || !filters.company || question.company === filters.company;

    return matchesSearch && matchesRound && matchesCompany;
  });
}
