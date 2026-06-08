"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getForexCurrencies,
  getForexRange,
  getForexSummary,
  getHistoricalForexRate,
  getLatestForexRate,
  type ForexHistoricalParams,
  type ForexQueryParams,
  type ForexRangeParams,
} from "@/services/settingsForexApi";

export function useForexCurrencies() {
  return useQuery({
    queryKey: ["settings-forex", "currencies"],
    queryFn: () => getForexCurrencies(),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useLatestForexRate(params: ForexQueryParams) {
  return useQuery({
    queryKey: ["settings-forex", "latest", params],
    queryFn: () => getLatestForexRate(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHistoricalForexRate(params: ForexHistoricalParams) {
  return useQuery({
    queryKey: ["settings-forex", "historical", params],
    queryFn: () => getHistoricalForexRate(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(params.date),
  });
}

export function useForexRange(params: ForexRangeParams) {
  return useQuery({
    queryKey: ["settings-forex", "range", params],
    queryFn: () => getForexRange(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(params.start_date && params.end_date),
  });
}

export function useForexSummary(params: ForexRangeParams) {
  return useQuery({
    queryKey: ["settings-forex", "summary", params],
    queryFn: () => getForexSummary(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(params.start_date && params.end_date),
  });
}
