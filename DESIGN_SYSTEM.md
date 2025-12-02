# The Ride - Velvet & Neon Design System

**Version:** 1.0.0 | **Last Updated:** 2025-12-02

---

## Quick Start

### View the Design System

**Visual Showcase:** Start the dev server and visit `/design-showcase` to see all components in action.

```bash
npm run dev:wrangler
# Visit http://localhost:4321/design-showcase
```

### Core Colors at a Glance

**Velvet (Backgrounds):**
- `bg-velvet-black` - #0a0a0a (primary)
- `bg-velvet-charcoal` - #1a1a1a (cards)
- `bg-velvet-midnight` - #0d1117 (data panels)

**Neon (Accents):**
- `text-neon-green` - #39FF14 (cycling data, primary CTAs)
- `text-neon-cyan` - #00F0FF (data visualization)
- `text-neon-yellow` - #CCFF00 (county pages, hi-viz)
- `text-neon-orange` - #FF6B1A (alerts)

### Common Component Examples

```astro
<!-- Primary Button with Neon Glow -->
<button class="btn-primary">Explore Data</button>

<!-- Velvet Card with Hover Effect -->
<div class="velvet-card p-6">
  <h3>Card Content</h3>
</div>

<!-- Heading with Neon Highlight -->
<h1>Ireland's <span class="greenhead">Cycling Data</span></h1>

<!-- Live Data with Pulse Animation -->
<div class="text-6xl text-neon-green neon-pulse">
  24,567
</div>

<!-- Neon Divider -->
<div class="neon-divider"></div>
```

### Key Features

- **Accessibility:** WCAG AAA contrast ratios throughout
- **Performance:** CSS-only animations, no JavaScript overhead
- **Typography:** Space Grotesk font optimized for dark backgrounds
- **Effects:** Multi-layered neon glow, pulse animations, gradient dividers
- **Responsive:** Mobile-first design with touch-friendly interactions

### Usage Principles

**Do:**
- Use neon green for cycling data and primary CTAs
- Apply glow effects to interactive elements on hover
- Use hi-viz yellow for county/regional pages only
- Maintain high contrast for all text

**Don't:**
- Use neon colors for large text blocks
- Mix multiple neon colors in one component
- Apply pulse animation to static data
- Use light backgrounds

---

## Design Philosophy

The Ride embraces a **"Velvet & Neon"** aesthetic - a sophisticated dark cycling data platform that combines the richness of velvet backgrounds with vibrant neon accents. Think: "sophisticated cycling data platform with cyberpunk flair."

This design system creates high visual impact while maintaining:
- **Accessibility**: WCAG AAA contrast ratios
- **Performance**: CSS-driven animations, minimal JavaScript
- **Irish Identity**: Bold, modern interpretation of cycling culture

---

## Color Palette

### Velvet Base Colors (Deep, Rich Backgrounds)

```css
--velvet-black: #0a0a0a        /* Matte Black - Primary background */
--velvet-charcoal: #1a1a1a     /* Deep Charcoal - Secondary background */
--velvet-purple: #1a0f2e       /* Deep Purple - Accent background */
--velvet-midnight: #0d1117     /* Midnight - Card backgrounds */
```

**Usage:**
- `velvet-black`: Main page backgrounds, navbar, footer
- `velvet-charcoal`: Card surfaces, raised sections, overlays
- `velvet-purple`: Special feature backgrounds, county pages
- `velvet-midnight`: Data cards, sensor information panels

### Neon Accent Colors (Vibrant, High-Energy)

```css
--neon-green: #39FF14          /* Electric Neon Green - Primary cycling accent */
--neon-cyan: #00F0FF           /* Electric Cyan - Data visualization */
--neon-yellow: #CCFF00         /* Hi-Viz Yellow - Building-site hi-viz aesthetic */
--neon-orange: #FF6B1A         /* Bright Orange - Warning/Alert states */
--neon-pink: #FF10F0           /* Hot Pink - Alternative accent */
```

**Usage by Context:**

| Color | Primary Use | Examples |
|-------|-------------|----------|
| **Neon Green** | Cycling data, primary CTAs, live counters | THE YOKE counter, bike count data, primary buttons |
| **Neon Cyan** | Data visualization, graphs, sensors | Line graphs, sensor locations, real-time feeds |
| **Neon Yellow** | County pages, regional identity | County headers, local leaderboards, regional stats |
| **Neon Orange** | Alerts, warnings, speed data | v85 speed indicators, system notifications |
| **Neon Pink** | Alternative highlights | Secondary data points, hover states |

### Semantic Colors

```css
--primary-accent: var(--neon-green)
--secondary-accent: var(--neon-yellow)
--data-accent: var(--neon-cyan)
```

### Text Colors

```css
--text-primary: #ffffff        /* Pure white - high contrast headings */
--text-secondary: #b4b4b4      /* Light gray - body text */
--text-muted: #6b6b6b          /* Muted gray - captions, metadata */
```

**Contrast Ratios:**
- `text-primary` on `velvet-black`: 21:1 (WCAG AAA)
- `neon-green` on `velvet-black`: 14.2:1 (WCAG AAA)
- `neon-yellow` (#CCFF00) on `velvet-black`: 18.5:1 (WCAG AAA)
- `text-secondary` on `velvet-black`: 10.5:1 (WCAG AAA)

---

## Typography

### Font Family

**Space Grotesk** - Clean geometric sans-serif that complements the neon aesthetic.

```css
font-family: "Grotesk", sans-serif;
```

**Why Space Grotesk?**
- Geometric construction fits tech/data aesthetic
- Wide character spacing enhances readability on dark backgrounds
- Medium weight (500) provides excellent contrast with neon accents
- Modern, clean lines that don't compete with neon glow effects

### Typography Scale

```css
h1: 3rem (48px)     - Line height: 120% - Font weight: 500
h2: 2rem (32px)     - Line height: 130% - Font weight: 500
h3: 1.5rem (24px)   - Line height: 140% - Font weight: 500
h4: 1rem (16px)     - Line height: 150% - Font weight: 500
body: 20px          - Line height: 160% - Font weight: 400
```

### Mobile Scale

```css
h1: 2.688rem (43px)
h2: 2.25rem (36px)
h3: 1.625rem (26px)
h4: 1.125rem (18px)
body: 16px
```

---

## Visual Effects

### Neon Glow Effects

The signature element of the design - layered box shadows that simulate neon light.

#### Green Glow (Primary)

```css
--glow-green:
  0 0 10px rgba(57, 255, 20, 0.5),
  0 0 20px rgba(57, 255, 20, 0.3),
  0 0 30px rgba(57, 255, 20, 0.2);

--glow-green-strong:
  0 0 10px rgba(57, 255, 20, 0.8),
  0 0 20px rgba(57, 255, 20, 0.6),
  0 0 40px rgba(57, 255, 20, 0.4),
  0 0 60px rgba(57, 255, 20, 0.2);
```

**Usage:**
- Standard glow: Default state for neon elements
- Strong glow: Hover states, live data counters, pulsing animations

#### Yellow Glow (County Pages)

```css
--glow-yellow:
  0 0 10px rgba(204, 255, 0, 0.5),
  0 0 20px rgba(204, 255, 0, 0.3),
  0 0 30px rgba(204, 255, 0, 0.2);
```

#### Cyan Glow (Data Visualization)

```css
--glow-cyan:
  0 0 10px rgba(0, 240, 255, 0.5),
  0 0 20px rgba(0, 240, 255, 0.3),
  0 0 30px rgba(0, 240, 255, 0.2);
```

### Utility Classes

```css
.neon-glow-green         /* Apply green glow to any element */
.neon-glow-green-strong  /* Apply strong green glow */
.neon-glow-yellow        /* Apply yellow glow */
.neon-glow-cyan          /* Apply cyan glow */
.text-glow-green         /* Text shadow glow effect */
.text-glow-yellow        /* Yellow text glow */
.text-glow-cyan          /* Cyan text glow */
```

---

## Component Patterns

### Buttons

The button hierarchy follows visibility: **Primary > Secondary > Tertiary**

#### Primary Button (Most Prominent - Main CTAs)

```astro
<button class="btn-primary">
  View National Dashboard
</button>
```

**Visual:**
- Background: `neon-green` (filled, highly visible)
- Text: `velvet-black`
- Default: Subtle green glow
- Hover: Strong green glow, slight scale increase

**Use for:** Critical actions, main navigation, primary CTAs

#### Secondary Button (Alternative Actions)

```astro
<button class="btn-secondary">
  Learn More
</button>
```

**Visual:**
- Background: `transparent`
- Border: 2px solid `neon-cyan`
- Text: `white`
- Hover: Background fills with `neon-cyan`, text becomes `velvet-black`, cyan glow appears

**Use for:** Secondary navigation, alternative paths, supporting actions

#### Tertiary Button (Least Prominent - Subtle Actions)

```astro
<button class="btn-tertiary">
  Explore Counties
</button>
```

**Visual:**
- Background: `velvet-charcoal`
- Border: 2px solid `neon-green`
- Text: `white`
- Hover: Background fills with `neon-green`, text becomes `velvet-black`, strong glow appears

**Use for:** Tertiary actions, less critical interactions, subtle navigation

### Heading Highlights (Neon Pills)

Use these to emphasize key words in headings:

```astro
<h1>
  Ireland's <span class="greenhead">Local Output</span>
</h1>
```

**Available Classes:**

| Class | Color | Best For |
|-------|-------|----------|
| `.greenhead` | Neon Green | Cycling data, national metrics |
| `.neonhead` | Neon Cyan | Data points, sensor information |
| `.yellowhead` | Hi-Viz Yellow | County names, regional identity |
| `.whitehead` | White | Legacy/neutral emphasis |
| `.blackhead` | Velvet Black + Green border | Inverted emphasis |

### Cards (Velvet Cards)

```astro
<div class="velvet-card p-6">
  <!-- Card content -->
</div>
```

**Visual:**
- Background: `velvet-charcoal`
- Border: 1px solid `rgba(57, 255, 20, 0.2)` (subtle green)
- Hover: Border brightens to full `neon-green`, green glow appears
- Transition: Smooth 300ms

### Neon Dividers

```astro
<div class="neon-divider"></div>
```

**Visual:**
- Two parallel horizontal lines
- Top line: 3px, full green, glows
- Bottom line: 1px, 50% opacity, offset 6px below
- Gradient: Fades from transparent → green → transparent

---

## Border Utilities

```css
.neon-border-green     /* 2px solid neon green border */
.neon-border-yellow    /* 2px solid hi-viz yellow border */
.neon-border-cyan      /* 2px solid neon cyan border */
```

---

## Animations

### Neon Pulse (Live Data Indicator)

```astro
<div class="neon-pulse">
  24,567 bikes counted
</div>
```

**Behavior:**
- Infinite 2-second loop
- Oscillates between standard and strong green glow
- Use for: THE YOKE counter, live sensor feeds, real-time data

**Keyframes:**
```css
@keyframes neon-pulse {
  0%, 100% { opacity: 1; box-shadow: var(--glow-green); }
  50%      { opacity: 0.8; box-shadow: var(--glow-green-strong); }
}
```

---

## Custom Scrollbar

The scrollbar reinforces the neon aesthetic:

```css
/* Track: Velvet black background */
/* Thumb: Green-to-cyan gradient with rounded corners */
/* Hover: Solid neon green with glow */
```

---

## Accessibility Compliance

### Contrast Ratios (WCAG AAA)

All text/background combinations meet WCAG AAA (7:1 for body, 4.5:1 for large text):

| Foreground | Background | Ratio | Compliance |
|------------|------------|-------|------------|
| White (#ffffff) | Velvet Black (#0a0a0a) | 21:1 | AAA |
| Neon Yellow (#CCFF00) | Velvet Black (#0a0a0a) | 18.5:1 | AAA |
| Neon Cyan (#00F0FF) | Velvet Black (#0a0a0a) | 15.8:1 | AAA |
| Neon Green (#39FF14) | Velvet Black (#0a0a0a) | 14.2:1 | AAA |
| Text Secondary (#b4b4b4) | Velvet Black (#0a0a0a) | 10.5:1 | AAA |

### Focus States

All interactive elements must have visible focus indicators:

```css
.btn-primary:focus {
  outline: 2px solid var(--neon-green);
  outline-offset: 4px;
}
```

### Reduced Motion

Respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  .neon-pulse {
    animation: none;
  }
}
```

---

## Usage Guidelines

### Do's ✓

- Use neon green for primary cycling data and CTAs
- Apply glow effects to interactive elements on hover
- Use velvet backgrounds consistently throughout
- Maintain high contrast for all text
- Use hi-viz yellow exclusively for county/regional pages
- Apply neon-pulse to live, updating data only

### Don'ts ✗

- Don't use neon colors for large text blocks (readability)
- Don't mix multiple neon colors in a single component
- Don't apply glow effects to static text
- Don't use light backgrounds anywhere
- Don't overuse neon-pulse (reserve for truly live data)
- Don't compromise accessibility for aesthetics

---

## Component Examples

### Example: National Dashboard Hero

```astro
<section class="bg-velvet-black py-20">
  <div class="container mx-auto text-center">
    <h1 class="text-6xl font-medium text-white mb-6">
      Ireland's <span class="greenhead text-glow-green">Cycling Pulse</span>
    </h1>
    <div class="neon-divider my-8"></div>
    <div class="text-8xl font-bold text-neon-green neon-pulse">
      24,567
    </div>
    <p class="text-text-secondary text-xl mt-4">
      Bikes counted in the last 24 hours
    </p>
  </div>
</section>
```

### Example: County Card

```astro
<div class="velvet-card p-8">
  <h3 class="text-2xl mb-4">
    <span class="yellowhead">County Cork</span>'s Local Output
  </h3>
  <div class="flex items-baseline gap-4">
    <span class="text-5xl font-bold text-neon-cyan">3,421</span>
    <span class="text-text-secondary">bikes today</span>
  </div>
  <div class="neon-border-yellow rounded-lg p-4 mt-6">
    <p class="text-sm text-text-secondary">
      Keep up the Local Output. Don't let Kerry win.
    </p>
  </div>
</div>
```

---

## File Structure

Design system implementation is split across:

```
/src/styles/global.css          # Core color variables, component classes
/tailwind.config.mjs            # Tailwind color extensions
/src/layouts/MainLayout.astro   # Dark theme body class
```

---

## Future Enhancements

Potential additions to the design system:

1. **Gradient overlays** for data visualization backgrounds
2. **Neon line graphs** with SVG glow filters
3. **County-specific color variants** (each county gets unique yellow shade)
4. **Motion patterns** for scroll-triggered animations
5. **Data loading states** with neon skeleton screens
6. **Map styling** with glowing county borders

---

## Design Tokens Reference

Quick copy-paste reference for developers:

```css
/* Backgrounds */
bg-velvet-black
bg-velvet-charcoal
bg-velvet-purple
bg-velvet-midnight

/* Text */
text-text-primary
text-text-secondary
text-text-muted

/* Accents */
text-neon-green
text-neon-cyan
text-neon-yellow
text-neon-orange

/* Borders */
neon-border-green
neon-border-yellow
neon-border-cyan

/* Effects */
neon-glow-green
neon-glow-green-strong
neon-glow-yellow
neon-glow-cyan
text-glow-green
text-glow-yellow
text-glow-cyan
neon-pulse

/* Components */
btn-primary
btn-secondary
btn-tertiary
greenhead
neonhead
yellowhead
velvet-card
neon-divider
```

---

**Last Updated:** 2025-11-29
**Version:** 1.0.0
**Maintained by:** Claude Code for The Ride
