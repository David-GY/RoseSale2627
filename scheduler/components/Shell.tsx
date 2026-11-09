import Link from "next/link";
import { Flower2, ArrowUpRight } from "lucide-react";
export function Shell({
  children,
  admin = false,
  mode,
}: {
  children: React.ReactNode;
  admin?: boolean;
  mode?: string;
}) {
  return (
    <>
      <header className="site-header">
        <Link className="wordmark" href="/">
          <span className="brand-icon">
            <Flower2 size={24} strokeWidth={1.4} />
          </span>
          <span>
            Rose Sale<span className="wordmark-sub">The shift scheduler</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/" className={!admin ? "current" : ""}>
            My availability
          </Link>
          <Link href="/admin" className={admin ? "current" : ""}>
            Organizers <ArrowUpRight size={14} />
          </Link>
        </nav>
        <span className="header-note">Every helping hand counts.</span>
      </header>
      {mode === "demo" && (
        <div className="demo-banner">
          <span className="dot" />
          Demo with placeholder data{" "}
          <span className="demo-detail">
            · Changes reset when the server restarts. No Google Sheet is
            connected.
          </span>
        </div>
      )}
      <main className={admin ? "page admin-page" : "page"}>{children}</main>
      <footer>
        <span>
          <Flower2 size={15} /> Made for a week of giving.
        </span>
        <span>Rose Sale · People make it happen.</span>
      </footer>
    </>
  );
}
