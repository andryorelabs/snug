/**
 * Per-component exceptions to `shadcn/no-restyle`, each encoding one real,
 * bounded design decision rather than disabling the rule outright. Shared by
 * `eslint.config.mjs` and `oxlint.config.ts`.
 *
 * - `Input`: the popup/dialog UI has no responsive breakpoints, so every
 *   `Input` locks in the `md:` text-sm size instead of also carrying the
 *   mobile-only text-base. A few inputs also overlay a leading icon and
 *   need matching start padding to keep typed text clear of it.
 * - `Label`: the time-picker's Hours/Minutes/Period captions intentionally
 *   use a smaller, muted treatment instead of Label's default typography —
 *   there is no dedicated caption variant for this yet.
 * - `CardTitle`/`CardDescription`: the settings and auto-export pages render a
 *   deliberately compact title/description scale (bolder + smaller than
 *   Card's own defaults).
 * - `Button`, `DropdownMenuRadioItem`, `AccordionTrigger`: the light-theme
 *   focus ring must reach 3:1, so the site's `focus-ring-solid` utility
 *   replaces the registry's translucent `ring-ring/50`. The FAQ trigger also
 *   takes `accordion-icon-sync` so its icon turns on the panel's 200ms curve.
 */
export const shadcnNoRestyleContracts = [
  {
    pattern: '^Input$',
    allow: ['layout', 'text-sm', 'pl-8'],
  },
  {
    pattern: '^Label$',
    allow: ['layout', 'text-xs', 'text-muted-foreground'],
  },
  {
    pattern: '^Card$',
    allow: ['layout', 'ring-primary/50', 'ring-destructive/40'],
  },
  {
    pattern: '^CardTitle$',
    allow: [
      'layout',
      'text-sm',
      'font-semibold',
      'text-2xl',
      'leading-tight',
      'hyphens-auto',
    ],
  },
  {
    pattern: '^Badge$',
    allow: ['layout', 'font-mono'],
  },
  {
    pattern: '^Button$',
    allow: ['layout', 'focus-ring-solid'],
  },
  {
    pattern: '^DropdownMenuRadioItem$',
    allow: ['layout', 'focus-ring-solid'],
  },
  {
    pattern: '^AccordionTrigger$',
    allow: ['layout', 'focus-ring-solid', 'accordion-icon-sync'],
  },
  {
    pattern: '^CardFooter$',
    allow: ['layout', 'border-t-0', 'bg-transparent', 'pt-0'],
  },
  {
    pattern: '^CardDescription$',
    allow: ['layout', 'text-xs', 'text-base'],
  },
]
