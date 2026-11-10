import ProjectFrame from '@/components/ProjectFrame';

/**
 * The workspace and its seven tools stand in one frame (roadmap 3.0.21, points
 * 1 and 13): a signed-out reader goes to the sign-in and comes back, an account
 * without access reads one sentence, and an invited reader sees one strip.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return <ProjectFrame>{children}</ProjectFrame>;
}
