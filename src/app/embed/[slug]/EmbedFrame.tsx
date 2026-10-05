"use client";

// Comunica l'altezza al sito ospite (auto-resize dell'iframe).
import { useEffect } from "react";

export function EmbedFrame({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const post = () => window.parent !== window && window.parent.postMessage({ type: "ma:height", height: document.documentElement.scrollHeight }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);
  return <div className="p-1">{children}</div>;
}
