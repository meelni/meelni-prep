import assert from "node:assert/strict";
import test from "node:test";

import { blogPosts, getBlogPostById } from "./blog-data";

const quarantinedIds = [
  "product-sense-volunteering-meta",
  "product-sense-education-meta",
  "analytical-thinking-instagram-reels",
  "leadership-drive-failure-story",
  "big-tech-case-study-interviews",
];

test("one published collection owns listing and direct blog lookup", () => {
  assert.ok(
    blogPosts.length > 0,
    "the public blog should retain useful content"
  );
  assert.equal(
    new Set(blogPosts.map((post) => post.id)).size,
    blogPosts.length
  );

  for (const post of blogPosts) {
    assert.equal(getBlogPostById(post.id), post);
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const id of quarantinedIds) {
    assert.equal(
      blogPosts.some((post) => post.id === id),
      false,
      id
    );
    assert.equal(getBlogPostById(id), undefined, id);
  }
});

test("published articles exclude unsupported claim classes", () => {
  const prohibited = [
    /helped candidates land|land offers at/i,
    /ahead of \d+%|top \d+%|pass rate/i,
    /L\d(?:\+|\b).*roles?|level mapping/i,
    /Meta(?:'s)? (?:leadership principles|culture|values)/i,
    /Meta.*(?:companies).*test in product interviews/i,
    /commonly asked at|real .*question asked at/i,
    /trained on (?:proven )?frameworks/i,
    /adapts? .*real[- ]time|real[- ]time nudges?/i,
    /every .*interview follows this structure/i,
    /world[- ]class.*weeks,? not years/i,
    /best candidates|proven (?:structure|framework)/i,
  ];

  const violations: string[] = [];
  for (const post of blogPosts) {
    const publicText = `${post.title}\n${post.excerpt}\n${post.content}`;
    for (const pattern of prohibited) {
      if (pattern.test(publicText)) {
        violations.push(`${post.id}: ${pattern.source}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
