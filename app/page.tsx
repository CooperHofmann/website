import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="hero">
      <h1>Cooper Hofmann</h1>
      <p>
        Photography that captures light, emotion, and the stories in between.
        Explore selected work below.
      </p>
      <p style={{ marginTop: '2rem' }}>
        <Link
          href="/cases"
          style={{
            fontWeight: 600,
            borderBottom: '2px solid currentColor',
            paddingBottom: '0.25rem',
          }}
        >
          View Selected Work &rarr;
        </Link>
      </p>
    </section>
  );
}
