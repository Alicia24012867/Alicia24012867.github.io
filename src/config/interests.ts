export const interests = [
  {
    id: 'hpc',
    number: '01',
    english: 'HIGH PERFORMANCE',
    title: 'Making computation faster',
    subtitle: 'High-performance computing · GPU programming',
    description:
      'From a single line of code to thousands of parallel threads, exploring how hardware and algorithms work together.',
    tags: ['C / C++', 'CUDA', 'HPC'],
    detail:
      'I am exploring high-performance numerical computing and GPU programming, with a focus on parallelism, data access, and performance. I start by understanding the workload, then learn how to make computing resources work together.',
    topics: [
      'Parallel computing and thread organization',
      'GPU programming and memory access',
      'Performance analysis in numerical computing',
    ],
    links: [
      {
        label: 'CUDA Programming Guide',
        url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/',
      },
      { label: 'OpenMP resources', url: 'https://www.openmp.org/resources/' },
    ],
  },
  {
    id: 'science',
    number: '02',
    english: 'SCIENTIFIC COMPUTING',
    title: 'Understanding through numbers',
    subtitle: 'Scientific computing · Numerical methods',
    description:
      'Connecting equations to the real world, using algorithms to reveal patterns we cannot see.',
    tags: ['Numerical Methods', 'Simulation'],
    detail:
      'I am interested in how mathematical models become computable problems, and how accuracy, stability, and computational cost shape the results.',
    topics: [
      'Numerical methods and error analysis',
      'Scientific computing and simulation',
      'Accuracy and computational efficiency',
    ],
    links: [
      { label: 'Learn NumPy', url: 'https://numpy.org/learn/' },
      { label: 'SciPy documentation', url: 'https://docs.scipy.org/doc/scipy/' },
    ],
  },
  {
    id: 'ml',
    number: '03',
    english: 'MACHINE LEARNING',
    title: 'Exploring intelligent systems',
    subtitle: 'Machine learning systems · AI infrastructure',
    description:
      'Curious about the models, and the systems and infrastructure that make them work.',
    tags: ['Python', 'ML Systems', 'AI Infra'],
    detail:
      'I am learning about ML systems and AI infrastructure: the computing, data, and runtime behind a model. I hope to connect this with high-performance computing to understand the whole system.',
    topics: [
      'Foundations of ML systems',
      'Model computation and runtime efficiency',
      'AI infrastructure and experimental environments',
    ],
    links: [
      { label: 'PyTorch tutorials', url: 'https://pytorch.org/tutorials/' },
      { label: 'Python documentation', url: 'https://docs.python.org/3/' },
    ],
  },
];

export type Interest = (typeof interests)[number];
