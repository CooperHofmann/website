'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { projects } from '@/lib/projects';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

export default function CasesPage() {
  return (
    <main>
      <section className="hero">
        <h1>Selected Work</h1>
        <p>
          A curated collection of photography projects — portraits, landscapes,
          street, and commercial work.
        </p>
      </section>

      <section className="project-grid">
        {projects.map((project, i) => (
          <motion.div
            key={project.id}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={fadeUp}
          >
            <Link href={`/cases/${project.id}`}>
              <div className="project-card">
                <Image
                  src={project.coverImage}
                  alt={project.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="project-card-image"
                />
                <div className="project-card-overlay">
                  <span className="project-card-category">
                    {project.category}
                  </span>
                  <h2 className="project-card-title">{project.title}</h2>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
