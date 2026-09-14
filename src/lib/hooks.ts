"use client";
import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "./api";
import { useLocale } from "@/i18n/provider";
import { errorMessage } from "@/i18n/errors";
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const next = await api<T>(path);
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("NETWORK", 503));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    api<T>(path)
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
    return () => {
      active = false;
    };
  }, [path]);
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
