export interface ExactListFilterSpec<P> {
  key: string;
  value: string | number | boolean | null | undefined;
  clear(params: P): P;
}

export interface AppliedExactListFilter {
  key: string;
  value: string;
}

export interface RelaxedExactListFilterMatch<T> extends AppliedExactListFilter {
  matchCount: number;
  sample: T[];
}

export interface ListQueryDiagnostics<T> {
  textQuery: string | null;
  exactFilters: AppliedExactListFilter[];
  relaxedExactFilters: RelaxedExactListFilterMatch<T>[];
  broaderMatchCount: number;
}

export interface AnalyzedListQuery<T> {
  items: T[];
  broaderMatches: T[];
  diagnostics: ListQueryDiagnostics<T>;
}

export interface RenderAnalyzedListQueryOptions<T> {
  emptyText: string;
  renderItem(item: T): string;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeFilterValue(value: string | number | boolean | null | undefined): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export async function analyzeListQuery<T, P extends object>(
  params: P,
  runQuery: (params: P) => Promise<T[]>,
  options: {
    text?: string | null | undefined;
    exactFilters?: readonly ExactListFilterSpec<P>[];
    fallbackLimit?: number;
  } = {},
): Promise<AnalyzedListQuery<T>> {
  const items = await runQuery(params);
  const textQuery = normalizeOptionalString(options.text);
  const exactFilters = (options.exactFilters ?? [])
    .map((filter) => ({ ...filter, value: normalizeFilterValue(filter.value) }))
    .filter((filter) => filter.value.length > 0);

  if (items.length > 0 || exactFilters.length === 0) {
    return {
      items,
      broaderMatches: [],
      diagnostics: {
        textQuery,
        exactFilters: exactFilters.map(({ key, value }) => ({ key, value })),
        relaxedExactFilters: [],
        broaderMatchCount: 0,
      },
    };
  }

  const fallbackLimit = Math.max(1, options.fallbackLimit ?? 5);
  const clearExactFilters = exactFilters.reduce((current, filter) => filter.clear(current), params);
  const broaderMatches = await runQuery(clearExactFilters);
  const relaxedExactFilters = await Promise.all(
    exactFilters.map(async (filter) => {
      const matches = await runQuery(filter.clear(params));
      return {
        key: filter.key,
        value: filter.value,
        matchCount: matches.length,
        sample: matches.slice(0, fallbackLimit),
      };
    }),
  );

  return {
    items,
    broaderMatches: broaderMatches.slice(0, fallbackLimit),
    diagnostics: {
      textQuery,
      exactFilters: exactFilters.map(({ key, value }) => ({ key, value })),
      relaxedExactFilters,
      broaderMatchCount: broaderMatches.length,
    },
  };
}

export function renderAnalyzedListQuery<T>(
  result: AnalyzedListQuery<T>,
  options: RenderAnalyzedListQueryOptions<T>,
): string {
  if (result.items.length > 0) {
    return result.items.map((item) => options.renderItem(item)).join("\n");
  }

  const lines = [options.emptyText];
  const { diagnostics } = result;
  if (diagnostics.exactFilters.length > 0) {
    lines.push(
      `Applied exact filters: ${diagnostics.exactFilters.map((filter) => `${filter.key}=${filter.value}`).join(", ")}`,
    );

    const helpfulRelaxations = diagnostics.relaxedExactFilters.filter((filter) => filter.matchCount > 0);
    if (helpfulRelaxations.length > 0) {
      lines.push("Removing one exact filter would surface matches:");
      for (const filter of helpfulRelaxations) {
        lines.push(`- omit ${filter.key}=${filter.value} -> ${filter.matchCount} match(es)`);
      }
    }

    if (diagnostics.broaderMatchCount > 0) {
      lines.push(
        diagnostics.textQuery
          ? "Broader text-only matches without exact filters:"
          : "Broader matches without exact filters:",
      );
      for (const item of result.broaderMatches) {
        lines.push(`- ${options.renderItem(item)}`);
      }
    } else if (diagnostics.textQuery) {
      lines.push(`No matches for text query "${diagnostics.textQuery}" even without exact filters.`);
    } else {
      lines.push("No matches remain even after removing the exact filters.");
    }
    return lines.join("\n");
  }

  if (diagnostics.textQuery) {
    lines.push(`No matches for text query "${diagnostics.textQuery}".`);
  }
  return lines.join("\n");
}
