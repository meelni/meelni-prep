import type { Company } from "./companies";

export interface PublicCompanyGuide {
  slug: string;
  name: string;
  industry: string;
  questionCategories: Array<{
    category: string;
    questions: string[];
  }>;
}

/** Project legacy company records onto the only fields safe for public delivery. */
export function toPublicCompanyGuide(company: Company): PublicCompanyGuide {
  return {
    slug: company.slug,
    name: company.name,
    industry: company.industry,
    questionCategories: company.questionCategories.map((category) => ({
      category: category.category,
      questions: [...category.questions],
    })),
  };
}
