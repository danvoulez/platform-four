/**
 * @powerfarm/project-core — the Project domain.
 *
 * Runtime-neutral by construction: no DOM, no React, no storage. It depends only on `zod`,
 * `crypto.randomUUID()` and `TextEncoder`, so the same engine runs in the browser, in a test, and
 * in a durable server runtime. That property is what lets Platform Four move the source of truth
 * to the server without rewriting its semantics.
 *
 * Note the vocabulary: this is a **Project Graph**, not a Powerfarm **Process**. A Process is a
 * versioned executable software graph and a Run is one execution of a Process revision; both may
 * eventually be drawn on the same canvas, but they do not share this schema.
 */
export * from './contracts'
export * from './engine'
export * from './projection'
export * from './kinds'
export * from './layout'
export * from './humanize'
export * from './templates'
export * from './fixtures'
export * from './migrate'
