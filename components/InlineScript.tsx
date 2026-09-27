"use client";

/**
 * Inline script that runs during HTML parsing on a full page load. When React renders it on the client
 * (e.g. the 404/403 boundaries), it becomes inert text/plain, which avoids React's dev warning about
 * script tags. suppressHydrationWarning covers the type difference. Pattern from the Next.js
 * "preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
