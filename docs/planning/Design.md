# Design.md — UI rulebook

This is the single source of truth for the frontend look. Follow it exactly. The product is a **dashboard application, not a landing page**. It must look human-made, calm and professional, not like a generated template.

## 1. Direction

- Minimal and quiet on a **dimmed off-white (alabaster)** background. It must not be bright white.
- **Glassmorphism across the entire app**: cards, panels, modals, inputs, buttons and the navbar. Keep it subtle: soft blur, thin borders, low-contrast shadows.
- **Liquid-glass top navbar** (floating, rounded, translucent, slight blur).
- Do NOT use aurora backgrounds, purple or neon gradients, glowing orbs, emoji, stock illustrations or lorem ipsum. The earlier "aurora glass" look was rejected.
- The deck uses deep green and mint. Reuse that as the accent so the product and the pitch feel like one brand.

## 2. Design tokens

### Colors

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#E8E4DB` | App background (dimmed alabaster) |
| `--bg-soft` | `#EFEBE3` | Page sections |
| `--ink` | `#042A29` | Primary text (deep green-black) |
| `--ink-muted` | `#4A5F5D` | Secondary text |
| `--accent` | `#0F766E` | Primary buttons, links, active states |
| `--accent-mint` | `#5FD4BD` | Highlights, chips, focus glow |
| `--glass` | `rgba(255,255,255,0.45)` | Glass fill |
| `--glass-strong` | `rgba(255,255,255,0.65)` | Modals, navbar |
| `--glass-border` | `rgba(4,42,41,0.10)` | 1px borders |
| `--risk-low` | `#2E9E6B` | LOW |
| `--risk-medium` | `#B8860B` | MEDIUM |
| `--risk-high` | `#D9731F` | HIGH |
| `--risk-critical` | `#C73A35` | CRITICAL |

Risk colors are always paired with a text label and an icon. Never rely on color alone.

### Glass recipe

```css
.glass {
  background: var(--glass);
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px rgba(4,42,41,0.06);
}
.glass-strong { background: var(--glass-strong); backdrop-filter: blur(22px) saturate(1.15); }
```

Fallback: if `backdrop-filter` is unsupported, use `--glass-strong` as a solid fill.

### Typography

- UI and headings: **Inter** (variable). Weights 400, 500, 600. No decorative fonts.
- Code, hashes, tokens, scores: **JetBrains Mono**.
- Scale: 12, 14 (body), 16, 20, 24, 32. Line height 1.5 for body, 1.2 for headings.
- Tabular numbers (`font-variant-numeric: tabular-nums`) for all scores and tables.

### Spacing, radius, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48. Page padding 24 on desktop, 16 on mobile.
- Radius: 12 for inputs and chips, 16 for cards, 999 for pills and the navbar.
- Elevation: only the glass shadow above. No heavy drop shadows.

### Motion

- 150 to 250 ms ease-out for hover, focus and panel transitions.
- Progress and heatmap reveal may animate once. No looping decorative animation.
- Respect `prefers-reduced-motion`: disable all non-essential motion.

## 3. Layout

- Top: floating liquid-glass navbar with logo, five main links (Dashboard, Garak Bridge, Audit, Shield, Compare) and a user menu. Mobile: collapses to a menu button.
- Content: centered column, max width 1200. Cards in a 12-column grid.
- Every page has: title, one-line purpose, primary action on the right, content below.
- A persistent small **Privacy badge** in the corner: "Nothing is stored" with a link to the Privacy page.

## 4. Screens

| Route | Purpose | Key components |
|-------|---------|----------------|
| `/login` | Demo login | Glass card, three demo account buttons |
| `/dashboard` | Start here | Three step cards (Garak, Audit, Fix), garak-gap summary, privacy badge. No fake stats |
| `/bridge` | F1 | Endpoint form, generated command with copy button, report dropzone, Gap Map table |
| `/audit/new` | F2 setup | Model pickers, record upload, canary toggle, mode selector, Start button |
| `/audit/run` | Progress | Step list, progress bar, live counters, elapsed time |
| `/report` | F2/F3/F6 | Risk gauge with band and CI, calibration card, ranked record list, token heatmap, blind-spots panel, Download PDF, Clear data |
| `/shield` | F4 | Build index card, test prompt box, side-by-side raw reply vs Shielded reply |
| `/compare` | F5 | Before and after gauges, delta table, "what changed" notes |
| `/privacy` | Trust | Plain-language list of what is and is not stored, receipt example |
| `/settings` | Basics | Reference model path, limits, theme-free (no dark mode in MVP) |

## 5. Component rules

- **Buttons:** primary = solid `--accent` with white text. Secondary = glass with ink text. Destructive = outlined `--risk-critical`. Min height 40, min touch target 44.
- **Risk gauge:** semicircle or horizontal four-segment bar. Show number, band label, and 95 percent CI text.
- **Heatmap:** monospace text, each token on a background from transparent to `--risk-critical` at 30 to 70 percent opacity. Legend below. Tooltip shows token and score. Text must stay AA contrast on the darkest cell.
- **Tables:** sticky header, row hover, tabular numbers, no zebra stripes.
- **Gap Map table:** columns Limitation, What garak does, MemGuard module, Status chip (Covered, Partial, Out of scope). "Out of scope" must be visible, not hidden.
- **Empty states:** one sentence plus one action. No illustrations.
- **Errors:** inline, plain language, with the fix ("Reference model path not found. Check MG_REF_MODEL_PATH.").
- **Forms:** labels above inputs, helper text below, never placeholder-only labels.

## 6. Tone of copy

- Plain, short, specific. No hype ("revolutionary", "next-gen", "AI-powered").
- Never write "safe" or "secure model". Write "No leak found by these tests."
- Always show limits next to results.
- Numbers come from real data. No invented statistics anywhere in the UI.

## 7. Accessibility checklist (must pass)

- Text contrast AA on glass over `--bg`. Test with the glass at its most transparent.
- Visible focus ring: 2px `--accent-mint` outline plus 2px offset on every interactive element.
- Full keyboard path through login, audit, report and download.
- Heatmap has a text-table alternative (top 10 tokens with scores).
- Risk bands have text and icon, not color only.
- Form errors announced with `aria-live="polite"`.

## 8. Do and don't

| Do | Don't |
|----|-------|
| Use the tokens above | Add new colors ad hoc |
| Keep one primary action per screen | Put three bright buttons side by side |
| Show real or fixture data that looks real | Show lorem ipsum or "Stat 1" |
| Keep cards aligned to the grid | Rotate, tilt or scatter cards |
| Use icons from one set (Lucide) | Mix icon sets or use emoji |

## 9. Definition of done for any screen

Matches tokens. Keyboard path works. Mobile at 375 px has no horizontal scroll. Loading, empty and error states exist. No console errors. Screenshot reviewed against this file.
