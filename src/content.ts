// Edit the homepage's personal information and interests here.
export const profile = {
  name: 'Alicia',
  fullName: 'YangBo Huang',
  github: 'https://github.com/Alicia24012867',
  handle: '@Alicia24012867',
  email: 'hyb24@mails.tsinghua.edu.cn',
  intro: '一名对计算与未知保持好奇的学生。',
  description: '关注高性能计算、科学计算与机器学习。喜欢从一个小问题出发，慢慢走向更辽阔的世界。',
  skills: ['C / C++', 'CUDA', 'Python', 'Parallel Computing'],
};

export const interests = [
  {
    id: 'hpc',
    number: '01',
    english: 'HIGH PERFORMANCE',
    title: '让计算，再快一点',
    subtitle: '高性能计算 · GPU 编程',
    description: '从一行代码到成千上万个并行线程，探索硬件与算法之间的默契。',
    tags: ['C / C++', 'CUDA', 'HPC'],
    detail: '我正在探索高性能数值计算与 GPU 编程，关注并行计算、数据访问与性能之间的关系。从理解计算任务开始，逐步学习如何让计算资源更好地协作。',
    topics: ['并行计算与线程组织', 'GPU 编程与内存访问', '数值计算中的性能分析'],
    links: [
      { label: 'CUDA 编程指南', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/' },
      { label: 'OpenMP 官方资源', url: 'https://www.openmp.org/resources/' },
    ],
  },
  {
    id: 'science',
    number: '02',
    english: 'SCIENTIFIC COMPUTING',
    title: '用数值，理解世界',
    subtitle: '科学计算 · 数值方法',
    description: '在公式与现实之间搭一座桥，用算法描绘那些看不见的规律。',
    tags: ['Numerical Methods', 'Simulation'],
    detail: '我对科学计算与数值方法感兴趣，希望理解数学模型如何转化为可计算的问题，以及算法的精度、稳定性和计算成本如何共同影响结果。',
    topics: ['数值方法与误差分析', '科学计算与数值模拟', '算法精度与计算效率'],
    links: [
      { label: 'NumPy 学习资源', url: 'https://numpy.org/learn/' },
      { label: 'SciPy 官方文档', url: 'https://docs.scipy.org/doc/scipy/' },
    ],
  },
  {
    id: 'ml',
    number: '03',
    english: 'MACHINE LEARNING',
    title: '走近，智能的可能',
    subtitle: '机器学习系统 · AI 基础设施',
    description: '不止于模型本身，也好奇支撑智能运行的系统与基础设施。',
    tags: ['Python', 'ML Systems', 'AI Infra'],
    detail: '我正在了解机器学习系统与 AI 基础设施，关注模型背后的计算、数据和运行环境。希望把机器学习与高性能计算的兴趣连接起来，理解完整的系统。',
    topics: ['机器学习系统的基础组成', '模型计算与运行效率', 'AI 基础设施与实验环境'],
    links: [
      { label: 'PyTorch 官方教程', url: 'https://pytorch.org/tutorials/' },
      { label: 'Python 官方文档', url: 'https://docs.python.org/3/' },
    ],
  },
];

export type Interest = (typeof interests)[number];
