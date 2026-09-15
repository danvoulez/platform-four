import { useSyncExternalStore } from 'react'

/**
 * Tracks a CSS media query in React state.
 *
 * The Workbench uses this to render one surface instead of rendering both and letting CSS hide
 * one: a hidden `GraphCanvas` still mounts its ResizeObserver, still attaches pointer handlers,
 * and still writes to the shared viewport store, so a `hidden md:block` pair quietly runs the
 * canvas twice.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` so the first paint already has the
 * right answer; the server snapshot returns false because there is no viewport to measure.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Tailwind's `xl` breakpoint: at or above it, the Workbench shows the full spatial layout. */
export const XL_QUERY = '(min-width: 1280px)'
