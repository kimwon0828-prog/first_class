/** Small, decorative icons for application detail; labels carry the meaning. */
export function ApplicationDetailIcon({ name }: { name: "record" | "report" | "registration" | "contact" | "person" | "calendar" | "thought" | "info" | "activity" | "phone" | "message" }) {
  const paths = {
    record: "M8 4H5v17h14V4h-3M8 2h8v5H8zM8 11h8M8 15h5",
    report: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
    registration: "M8 3h8v7a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v5M8 21h8M9 19h6",
    contact: "M21 11a9 8 0 0 1-9 8H7l-4 3v-6a8 8 0 0 1-1-5 9 8 0 0 1 19 0zM7 11h.01M12 11h.01M17 11h.01",
    person: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 6 0 0 1 16 0v3",
    calendar: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2",
    thought: "M21 11a9 8 0 0 1-9 8H7l-4 3v-6a8 8 0 0 1-1-5 9 8 0 0 1 19 0zM8 9h8M8 13h5",
    info: "M6 3h9l4 4v14H6zM14 3v5h5M12 11h.01M12 14v4",
    activity: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
    phone: "M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2",
    message: "M3 4h18v13H8l-5 4zM7 8h10M7 12h6"
  }
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: "-3px", marginRight: 7, color: "var(--brand-700)" }}><path d={paths[name]} /></svg>
}
