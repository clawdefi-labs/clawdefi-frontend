"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

function trackVisit(pathname: string): void {
  const payload = JSON.stringify({ pathname });
  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/visit", blob);
    return;
  }

  void fetch("/api/analytics/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true
  });
}

export default function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || typeof window === "undefined") {
      return;
    }

    const sessionKey = `clawdefi:visit:${pathname}`;
    if (window.sessionStorage.getItem(sessionKey)) {
      return;
    }
    window.sessionStorage.setItem(sessionKey, "1");
    trackVisit(pathname);
  }, [pathname]);

  return null;
}
