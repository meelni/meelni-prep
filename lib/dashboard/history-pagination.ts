export interface HistoryPaginationInput {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface HistoryPaginationView {
  rangeLabel: string;
  pageLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  previousOffset: number;
  nextOffset: number;
}

export function buildHistoryPaginationView({
  pagination,
  pageRowCount,
  filteredRowCount,
  filterActive,
}: {
  pagination: HistoryPaginationInput;
  pageRowCount: number;
  filteredRowCount: number;
  filterActive: boolean;
}): HistoryPaginationView {
  const pageStart = pageRowCount > 0 ? pagination.offset + 1 : 0;
  const pageEnd = Math.min(pagination.offset + pageRowCount, pagination.total);
  const pageNumber =
    pagination.limit > 0
      ? Math.floor(pagination.offset / pagination.limit) + 1
      : 1;
  const pageCount =
    pagination.total > 0 && pagination.limit > 0
      ? Math.ceil(pagination.total / pagination.limit)
      : 1;
  const range =
    pageRowCount > 0
      ? `${pageStart}–${pageEnd} of ${pagination.total} interviews`
      : `0 of ${pagination.total} interviews`;

  return {
    rangeLabel: filterActive
      ? `Showing ${filteredRowCount} ${
          filteredRowCount === 1 ? "match" : "matches"
        } on this page (${range})`
      : `Showing ${range}`,
    pageLabel: `Page ${pageNumber} of ${pageCount}`,
    hasPrevious: pagination.offset > 0,
    hasNext: pagination.hasMore,
    previousOffset: Math.max(0, pagination.offset - pagination.limit),
    nextOffset: pagination.offset + pagination.limit,
  };
}
