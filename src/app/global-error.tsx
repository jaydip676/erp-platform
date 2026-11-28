"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

/** Last line of defence: shown if even the app frame fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-[#f7f7f7]">
        <ErrorScreen title="Niva ERP (Demo) could not load" text="Something went wrong. Try again in a moment." code={error.digest} onRetry={reset} />
      </body>
    </html>
  );
}
