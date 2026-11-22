"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api, ApiError } from "./api";
import { useLocale } from "@/i18n/provider";
import { errorMessage } from "@/i18n/errors";

// In-flight request deduplication prevents duplicate identical GET requests from sibling components.
const inflightRequests = new Map<string, Promise<unknown>>();

function fetchDeduplicated<T>(path: string, bypassInflight = false): Promise<T> {
  if (!bypassInflight) {
    const existing = inflightRequests.get(path);
    if (existing) return existing as Promise<T>;
  }
  const promise = api<T>(path).finally(() => {
    if (inflightRequests.get(path) === promise) {
      inflightRequests.delete(path);
    }
  });
  inflightRequests.set(path, promise);
  return promise;
}

export function useResource<T>(path: string, options?: { revalidateOnFocus?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await fetchDeduplicated<T>(path, true);
      if (mountedRef.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof ApiError ? e : new ApiError("NETWORK", 503));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    fetchDeduplicated<T>(path)
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof ApiError ? e : new ApiError("NETWORK", 503));
          setLoading(false);
        }
      });

    const onVisibility = () => {
      if (options?.revalidateOnFocus && document.visibilityState === "visible") {
        void reload();
      }
    };
    if (options?.revalidateOnFocus) {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      active = false;
      mountedRef.current = false;
      if (options?.revalidateOnFocus) {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [path, options?.revalidateOnFocus, reload]);

  return { data, error, loading, reload };
}

export function useAction() {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  async function run<T>(action: () => Promise<T>, success?: string) {
    setBusy(true);
    setNotice("");
    setFailed(false);
    try {
      const result = await action();
      if (success) setNotice(success);
      return result;
    } catch (e) {
      setFailed(true);
      setNotice(e instanceof ApiError ? errorMessage(e.code, locale) : t("networkError"));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, notice, failed, run };
}
