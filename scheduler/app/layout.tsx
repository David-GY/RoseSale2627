import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rose Sale · Shift scheduler",
  description:
    "A little time, a lot of love. Plan your Rose Sale availability and help the week bloom.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
