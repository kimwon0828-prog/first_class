import { PARENT_LAUNCH_REGION } from "../lib/parent-launch-region"

/** A location label, not a disabled selector or a geolocation action. */
export function ParentLaunchLocation({ className }: { className?: string }) {
  return <span className={className} title={PARENT_LAUNCH_REGION.notice} data-parent-launch-location>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
    <span>{PARENT_LAUNCH_REGION.label}</span>
  </span>
}
