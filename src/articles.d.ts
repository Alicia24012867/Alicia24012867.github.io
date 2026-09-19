declare module 'virtual:articles' {
  const articles: import('./blog/types').Article[];
  export default articles;
}

declare module 'virtual:notes' {
  const notes: import('./blog/types').Article[];
  export default notes;
}
