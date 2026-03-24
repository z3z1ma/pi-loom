import { describe, expect, it } from "vitest";
import { filterAndSortListEntries } from "../list-search.js";

describe("filterAndSortListEntries", () => {
  const entries = [
    {
      item: { id: "alpha-old" },
      id: "alpha-old",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-11T10:00:00.000Z",
      fields: [
        { value: "Alpha old", weight: 5 },
        { value: "storage migration", weight: 3 },
      ],
    },
    {
      item: { id: "alpha-new" },
      id: "alpha-new",
      createdAt: "2026-03-12T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z",
      fields: [
        { value: "Alpha new", weight: 5 },
        { value: "storage migration", weight: 3 },
      ],
    },
    {
      item: { id: "beta" },
      id: "beta",
      createdAt: "2026-03-14T10:00:00.000Z",
      updatedAt: "2026-03-15T10:00:00.000Z",
      fields: [
        { value: "Beta plan", weight: 5 },
        { value: "runtime attachments", weight: 3 },
      ],
    },
  ];

  it("defaults to updated_desc ordering when no text is provided", () => {
    expect(filterAndSortListEntries(entries).map((entry) => entry.id)).toEqual(["beta", "alpha-new", "alpha-old"]);
  });

  it("uses weighted relevance then recency when text is provided", () => {
    expect(filterAndSortListEntries(entries, { text: "alpha" }).map((entry) => entry.id)).toEqual([
      "alpha-new",
      "alpha-old",
    ]);
  });

  it("matches query tokens across fields regardless of order", () => {
    expect(filterAndSortListEntries(entries, { text: "migration storage" }).map((entry) => entry.id)).toEqual([
      "alpha-new",
      "alpha-old",
    ]);
  });

  it("respects explicit id sorting after filtering", () => {
    expect(filterAndSortListEntries(entries, { text: "alpha", sort: "id_asc" }).map((entry) => entry.id)).toEqual([
      "alpha-new",
      "alpha-old",
    ]);
    expect(filterAndSortListEntries(entries, { text: "alpha", sort: "id_desc" }).map((entry) => entry.id)).toEqual([
      "alpha-old",
      "alpha-new",
    ]);
  });
});
