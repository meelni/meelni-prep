import { MetadataRoute } from "next";

import { blogPosts } from "@/lib/blog-data";
import { companies } from "@/lib/data/companies";
import { publicUrl } from "@/lib/seo/public-metadata";
import {
  INTERVIEW_TYPE_ROUTE_SEGMENTS,
  interviewTypePath,
  questionPath,
} from "@/lib/seo/interview-route-content";
import { loadPublicQuestionCorpus } from "@/lib/workflows/public-question-corpus";

const STATIC_PUBLIC_ROUTES = [
  "",
  "/explore",
  "/companies",
  "/pricing",
  "/blog",
  "/privacy",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let questionRoutes: MetadataRoute.Sitemap = [];
  try {
    const corpus = await loadPublicQuestionCorpus({ limit: 500, offset: 0 });
    questionRoutes = corpus.questions.map((question) => ({
      url: publicUrl(questionPath(question.id)),
    }));
  } catch {
    questionRoutes = [];
  }

  return [
    ...STATIC_PUBLIC_ROUTES.map((route) => ({
      url: publicUrl(route || "/"),
    })),
    ...INTERVIEW_TYPE_ROUTE_SEGMENTS.map((roundType) => ({
      url: publicUrl(interviewTypePath(roundType)),
    })),
    ...companies.map((company) => ({
      url: publicUrl(`/companies/${company.slug}`),
    })),
    ...questionRoutes,
    ...blogPosts.map((post) => ({
      url: publicUrl(`/blog/${post.id}`),
    })),
  ];
}
