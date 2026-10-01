import { redirect } from 'next/navigation';

/**
 * Where the 3.0 "My workspace" grew (roadmap 1.8). It is one page now, at
 * `/dashboard`, where every sign-in lands — see `app/(app)/dashboard/layout.tsx`.
 * This address is kept so bookmarks and older links still arrive.
 */
export default function AdminWorkspacePage() {
  redirect('/dashboard');
}
