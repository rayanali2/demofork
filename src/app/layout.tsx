import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemoFork — Steal the format. Not the content.",
  description: "Turn a demo you like into an original launch video for your own product.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
