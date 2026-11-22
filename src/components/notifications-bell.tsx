"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";
import { api } from "@/lib/api";

interface NotificationRow {
  id: string;
  kind: string;
  titleKey: string;
  bodyParams: Record<string, string | number> | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell({
  initialUnread = 0,
  onChanged,
}: {
  initialUnread?: number;
  onChanged?: () => void;
}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadOverride, setUnreadOverride] = useState<number | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const unread = unreadOverride ?? initialUnread;

  // Lightweight SSE subscription for real-time unread count updates with clean teardown.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let closed = false;
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("notifications", (event) => {
      if (closed) return;
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as { unreadCount?: number };
        if (typeof parsed.unreadCount === "number") {
          setUnreadOverride(parsed.unreadCount);
          setLiveConnected(true);
        }
      } catch {
        // ignore malformed event
      }
    });
    es.onerror = () => {
      if (!closed) setLiveConnected(false);
    };
    return () => {
      closed = true;
      es.close();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await api<{
          notifications: NotificationRow[];
          unreadCount: number;
          nextCursor?: string | null;
        }>("/notifications?limit=15");
        setItems(res.notifications);
        setNextCursor(res.nextCursor ?? null);
        setUnreadOverride(res.unreadCount);
      } catch {
        // Keep current state silently if offline
      } finally {
        setLoading(false);
      }
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const res = await api<{
        notifications: NotificationRow[];
        unreadCount: number;
        nextCursor?: string | null;
      }>(`/notifications?limit=15&cursor=${encodeURIComponent(nextCursor)}`);
      setItems((prev) => [...prev, ...res.notifications]);
      setNextCursor(res.nextCursor ?? null);
      setUnreadOverride(res.unreadCount);
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      const res = await api<{ unreadCount: number }>("/notifications/read", {});
      setUnreadOverride(res.unreadCount);
      setItems((prev) =>
        prev.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })),
      );
      onChanged?.();
    } catch {
      // ignore
    }
  }

  function renderSubtitle(params: Record<string, string | number> | null) {
    if (!params) return null;
    const parts = Object.entries(params)
      .filter(([, val]) => val !== "" && val !== undefined && val !== null)
      .map(([, val]) => String(val));
    return parts.length ? parts.join(" · ") : null;
  }

  return (
    <div className="notif-wrapper" ref={boxRef}>
      <button
        type="button"
        className="icon-button notif-trigger"
        aria-label={t("p4NotificationsTitle")}
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        <Bell size={17} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-drawer" role="region" aria-label={t("p4NotificationsTitle")}>
          <div className="notif-header">
            <div>
              <strong>{t("p4NotificationsTitle")}</strong>
              {liveConnected && (
                <span className="sse-pill" style={{ marginLeft: 8 }}>
                  <span className="sse-dot" aria-hidden="true" />
                  {t("p5NotificationsLive")}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                className="text-link notif-mark-all"
                onClick={() => void markAllRead()}
              >
                <CheckCheck size={14} />
                {t("p4NotificationsMarkAll")}
              </button>
            )}
          </div>
          {loading ? (
            <p className="notif-empty">{t("loading")}</p>
          ) : !items.length ? (
            <p className="notif-empty">{t("p4NotificationsEmpty")}</p>
          ) : (
            <>
              <ul className="notif-list">
                {items.map((item) => {
                  const subtitle = renderSubtitle(item.bodyParams);
                  const label = t(item.titleKey as MessageKey) || item.kind;
                  const inner = (
                    <>
                      <div className="notif-item-top">
                        <strong>{label}</strong>
                        {!item.readAt && <span className="notif-dot" aria-hidden="true" />}
                      </div>
                      {subtitle && <small className="notif-sub">{subtitle}</small>}
                      <small className="notif-time">
                        {new Date(item.createdAt).toLocaleDateString(locale)}
                      </small>
                    </>
                  );
                  return (
                    <li key={item.id} className={item.readAt ? "notif-item" : "notif-item unread"}>
                      {item.href ? (
                        <Link href={item.href} onClick={() => setOpen(false)}>
                          {inner}
                        </Link>
                      ) : (
                        <div>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nextCursor && (
                <div style={{ padding: "8px 12px" }}>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => void loadMore()}
                  >
                    {t("p5LoadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
