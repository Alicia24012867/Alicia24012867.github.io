declare module 'virtual:articles' {
  const articles: import('./blog/types').Article[];
  export default articles;
}
