import { useEffect } from "react";

/** Follow the visible viewport when mobile browser chrome or the keyboard changes. */
export function useViewportHeight() {
  useEffect(() => {
    let frame = 0;
    const viewport = window.visualViewport;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Pinch zoom must remain a zoom, not trigger a smaller game layout.
        if (viewport && viewport.scale > 1.01) return;
        document.documentElement.style.setProperty(
          "--app-height",
          `${viewport?.height ?? window.innerHeight}px`,
        );
      });
    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
  }, []);
}
