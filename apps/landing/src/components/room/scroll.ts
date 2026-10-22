// Where the page is in the room's scroll, shared by the camera rig and the
// page's stop dots. No three.js imports.

/** 0 at the first stop, 1 at the second, and so on, from the sections' layout. */
export function scrollProgress(sections: readonly HTMLElement[]): number {
  if (sections.length < 2) return 0;
  const tops = sections.map(s => s.getBoundingClientRect().top);
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i] <= 0) {
      const next = tops[i + 1] ?? tops[i] + sections[i].offsetHeight;
      return Math.min(i + -tops[i] / (next - tops[i]), tops.length - 1);
    }
  }
  return 0;
}

/** The stops' sections, in scroll order. */
export function stopSections(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-room-stop]')];
}
