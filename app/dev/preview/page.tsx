import { notFound } from 'next/navigation';
import { PreviewHarness } from './PreviewHarness';

/**
 * Development-only screen gallery — the counterpart to the prototype's
 * bottom-right screen picker (`design_handoff_zamak_brand`).
 *
 * Every wizard screen sits behind Google sign-in plus a file upload plus a
 * translation run, which makes visual review of the middle of the flow
 * impossible without driving the whole thing. This route mounts each screen
 * directly with fixed mock data so layout and styling can be checked in
 * isolation, against the prototype, at any viewport.
 *
 * It renders the REAL components — never a copy. A divergence seen here is a
 * divergence in production.
 *
 * 404s in a production build: this is a review tool, not a feature, and the
 * mock data would be nonsense to a real visitor.
 */
export default function DevPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewHarness />;
}
