import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cooperofthecrop - Photography Portfolio',
  description: 'Selected photography work by Cooper Hofmann',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav">
          <Link href="/" className="site-logo">
            Cooperofthecrop
          </Link>
          <ul className="site-nav-links">
            <li>
              <Link href="/cases">Work</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
        {children}
        <footer className="site-footer">
          &copy; {new Date().getFullYear()} Cooperofthecrop. All rights
          reserved.
        </footer>
      </body>
    </html>
  );
}
