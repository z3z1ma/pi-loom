import { describe, expect, it } from "vitest";
import { analyzeListQuery, renderAnalyzedListQuery } from "../storage/list-query.js";

interface QueryParams {
  text?: string;
  exactSourceKind?: string;
  exactTopic?: string;
}

interface Item {
  id: string;
  title: string;
  sourceKind: string;
  topic: string;
}

const ITEMS: Item[] = [
  {
    id: "production-readiness-rollout-for-first-class-multi-repository-loom-spaces",
    title: "Production-readiness rollout for first-class multi-repository Loom spaces",
    sourceKind: "initiative",
    topic: "multi-repository",
  },
  {
    id: "workspace-package-reliability-scrub-execution",
    title: "Workspace package reliability scrub execution",
    sourceKind: "workspace",
    topic: "reliability",
  },
];

async function runQuery(params: QueryParams): Promise<Item[]> {
  const text = params.text?.trim().toLowerCase() ?? "";
  return ITEMS.filter((item) => {
    if (params.exactSourceKind && item.sourceKind !== params.exactSourceKind) {
      return false;
    }
    if (params.exactTopic && item.topic !== params.exactTopic) {
      return false;
    }
    if (text.length === 0) {
      return true;
    }
    return `${item.id} ${item.title} ${item.sourceKind} ${item.topic}`.toLowerCase().includes(text);
  });
}

describe("analyzeListQuery", () => {
  it("returns direct matches without broader fallback work when exact filters already match", async () => {
    const result = await analyzeListQuery<Item, QueryParams>(
      { text: "reliability", exactSourceKind: "workspace" },
      runQuery,
      {
        text: "reliability",
        exactFilters: [
          {
            key: "exactSourceKind",
            value: "workspace",
            clear: ({ exactSourceKind: _exactSourceKind, ...params }) => params,
          },
        ],
      },
    );

    expect(result.items).toEqual([expect.objectContaining({ id: "workspace-package-reliability-scrub-execution" })]);
    expect(result.broaderMatches).toEqual([]);
    expect(result.diagnostics.exactFilters).toEqual([{ key: "exactSourceKind", value: "workspace" }]);
    expect(result.diagnostics.relaxedExactFilters).toEqual([]);
    expect(result.diagnostics.broaderMatchCount).toBe(0);
  });

  it("surfaces broader matches and exact-filter relaxations after a zero-result overfiltered search", async () => {
    const result = await analyzeListQuery<Item, QueryParams>(
      { text: "multi-repository loom spaces", exactSourceKind: "workspace" },
      runQuery,
      {
        text: "multi-repository loom spaces",
        exactFilters: [
          {
            key: "exactSourceKind",
            value: "workspace",
            clear: ({ exactSourceKind: _exactSourceKind, ...params }) => params,
          },
        ],
      },
    );

    expect(result.items).toEqual([]);
    expect(result.broaderMatches).toEqual([
      expect.objectContaining({ id: "production-readiness-rollout-for-first-class-multi-repository-loom-spaces" }),
    ]);
    expect(result.diagnostics.exactFilters).toEqual([{ key: "exactSourceKind", value: "workspace" }]);
    expect(result.diagnostics.relaxedExactFilters).toEqual([
      expect.objectContaining({ key: "exactSourceKind", value: "workspace", matchCount: 1 }),
    ]);
    expect(result.diagnostics.broaderMatchCount).toBe(1);

    const text = renderAnalyzedListQuery(result, {
      emptyText: "No plans.",
      renderItem: (item) => `${item.id} [${item.sourceKind}] ${item.title}`,
    });
    expect(text).toContain("Applied exact filters: exactSourceKind=workspace");
    expect(text).toContain("- omit exactSourceKind=workspace -> 1 match(es)");
    expect(text).toContain("Broader text-only matches without exact filters:");
    expect(text).toContain("production-readiness-rollout-for-first-class-multi-repository-loom-spaces [initiative]");
  });
});
