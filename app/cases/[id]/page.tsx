import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { projects, getProjectById } from '@/lib/projects';

export function generateStaticParams() {
  return projects.map((project) => ({
    id: project.id,
  }));
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    notFound();
  }

  const currentIndex = projects.findIndex((p) => p.id === id);
  const prevProject = currentIndex > 0 ? projects[currentIndex - 1] : null;
  const nextProject =
    currentIndex < projects.length - 1 ? projects[currentIndex + 1] : null;

  return (
    <main>
      <div className="project-header">
        <Link href="/cases" className="project-back">
          &larr; Back to Work
        </Link>
        <h1>{project.title}</h1>
        <div className="project-meta">
          <span>{project.category}</span>
          <span>{project.year}</span>
        </div>
        <p className="project-description">{project.description}</p>
      </div>

      <div className="project-images">
        {project.images.map((image, index) => (
          <div key={index} className="project-image-wrapper">
            <Image
              src={image}
              alt={`${project.title} — image ${index + 1}`}
              width={1920}
              height={1080}
              sizes="100vw"
            />
          </div>
        ))}
      </div>

      <nav className="project-nav">
        {prevProject ? (
          <Link href={`/cases/${prevProject.id}`}>
            &larr; {prevProject.title}
          </Link>
        ) : (
          <span />
        )}
        {nextProject ? (
          <Link href={`/cases/${nextProject.id}`}>
            {nextProject.title} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
