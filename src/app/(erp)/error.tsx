"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";

/** Any page in the app that fails to load or crashes shows this instead of a blank screen. */
export default function ErpError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <ErrorScreen
      title={offline ? "You are offline" : "This page could not load"}
      text={offline ? "Check your internet connection, then try again." : "Something went wrong while opening this page. Try again; if it keeps happening, tell the admin."}
      code={error.digest}
      onRetry={reset}
    />
  );
}
