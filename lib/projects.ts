export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  coverImage: string;
  images: string[];
  year: string;
}

export const projects: Project[] = [
  {
    id: 'golden-hour-portraits',
    title: 'Golden Hour Portraits',
    description:
      'A series capturing the warmth and beauty of natural light during the golden hour.',
    category: 'Portrait',
    coverImage: '/images/projects/project-1/cover.jpg',
    images: [
      '/images/projects/project-1/1.jpg',
      '/images/projects/project-1/2.jpg',
      '/images/projects/project-1/3.jpg',
    ],
    year: '2025',
  },
  {
    id: 'urban-landscapes',
    title: 'Urban Landscapes',
    description:
      'Exploring the geometry and texture of city architecture through a creative lens.',
    category: 'Landscape',
    coverImage: '/images/projects/project-2/cover.jpg',
    images: [
      '/images/projects/project-2/1.jpg',
      '/images/projects/project-2/2.jpg',
      '/images/projects/project-2/3.jpg',
    ],
    year: '2025',
  },
  {
    id: 'coastal-serenity',
    title: 'Coastal Serenity',
    description:
      'Peaceful moments along the coastline — waves, light, and endless horizons.',
    category: 'Landscape',
    coverImage: '/images/projects/project-3/cover.jpg',
    images: [
      '/images/projects/project-3/1.jpg',
      '/images/projects/project-3/2.jpg',
      '/images/projects/project-3/3.jpg',
    ],
    year: '2024',
  },
  {
    id: 'studio-sessions',
    title: 'Studio Sessions',
    description:
      'Controlled lighting, bold compositions, and striking studio portraits.',
    category: 'Portrait',
    coverImage: '/images/projects/project-4/cover.jpg',
    images: [
      '/images/projects/project-4/1.jpg',
      '/images/projects/project-4/2.jpg',
      '/images/projects/project-4/3.jpg',
    ],
    year: '2024',
  },
  {
    id: 'street-stories',
    title: 'Street Stories',
    description:
      'Candid moments and raw energy from the streets around the world.',
    category: 'Street',
    coverImage: '/images/projects/project-5/cover.jpg',
    images: [
      '/images/projects/project-5/1.jpg',
      '/images/projects/project-5/2.jpg',
      '/images/projects/project-5/3.jpg',
    ],
    year: '2024',
  },
  {
    id: 'commercial-work',
    title: 'Commercial Work',
    description:
      'Selected brand and editorial photography for commercial clients.',
    category: 'Commercial',
    coverImage: '/images/projects/project-6/cover.jpg',
    images: [
      '/images/projects/project-6/1.jpg',
      '/images/projects/project-6/2.jpg',
      '/images/projects/project-6/3.jpg',
    ],
    year: '2023',
  },
];

export function getProjectById(id: string): Project | undefined {
  return projects.find((project) => project.id === id);
}
