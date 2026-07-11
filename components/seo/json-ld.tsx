import { serializeJsonLd, type JsonLdValue } from "@/lib/seo/json-ld";

interface JsonLdProps {
  data: JsonLdValue;
  id: string;
}

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
