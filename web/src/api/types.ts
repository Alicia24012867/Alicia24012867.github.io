// What the blog API answers with, as docs/api/openapi.yaml describes it.

export interface User {
  id: string;
  name: string;
  groups: string[];
  admin: boolean;
}

export interface Author {
  name: string;
  signedIn: boolean;
}

export type CommentStatus = 'pending' | 'published' | 'hidden';

export interface Comment {
  id: string;
  /** A page path, or `guestbook`. */
  thread: string;
  /** The top-level comment this replies to. */
  parentId: string | null;
  author: Author;
  html: string;
  createdAt: string;
}

export interface AdminComment extends Comment {
  status: CommentStatus;
  email: string | null;
}

export interface PageStats {
  views: number;
  likes: number;
  liked: boolean;
}

export interface AdminStats {
  days: { date: string; views: number }[];
  pages: { path: string; views: number; likes: number; comments: number }[];
}

export interface Picture {
  url: string;
  width: number;
  height: number;
}

export interface Photo extends Picture {
  alt: string;
  thumbnail: Picture;
}

export interface Moment {
  id: string;
  /** The Markdown as written. */
  text: string;
  html: string;
  audience: string;
  photos: Photo[];
  createdAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  status: 'pending' | 'confirmed';
  createdAt: string;
  confirmedAt: string | null;
}

export interface Newsletter {
  id: string;
  subject: string;
  path: string | null;
  status: 'sending' | 'sent';
  recipients: number;
  sent: number;
  failed: number;
  createdAt: string;
}
