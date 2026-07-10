import { notFound } from "next/navigation";

import { getCompanyBySlug } from "@/lib/data/companies";
import {
  toPublicCompanyGuide,
  type PublicCompanyGuide,
} from "@/lib/data/public-company";
import { CompanyDetailClient } from "./company-detail-client";

function CompanyStructuredData({ company }: { company: PublicCompanyGuide }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://meelni.com";
  const url = `${baseUrl}/companies/${company.slug}`;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Company Guides",
        item: `${baseUrl}/companies`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${company.name} Interview Guide`,
        item: url,
      },
    ],
  };
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${company.name} PM Interview Guide`,
    description: `Illustrative PM practice questions associated with ${company.name}.`,
    url,
    inLanguage: "en-US",
    about: { "@type": "Organization", name: company.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
    </>
  );
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = getCompanyBySlug(slug);

  if (!company) {
    notFound();
  }

  const publicCompany = toPublicCompanyGuide(company);

  return (
    <>
      <CompanyStructuredData company={publicCompany} />
      <CompanyDetailClient company={publicCompany} />
    </>
  );
}
