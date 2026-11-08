/** Veridian brand mark — inverted-triangle V, colored via CSS tokens. */
export default function VeridianMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M2 3h20L12 21.5 2 3Z" fill="var(--veridian)" />
      <path d="M6.4 5.4h11.2L12 15.8 6.4 5.4Z" fill="var(--veridian-light)" />
      <path d="M9.4 5.4h5.2L12 10.2 9.4 5.4Z" fill="var(--page-bg)" opacity="0.85" />
    </svg>
  );
}
