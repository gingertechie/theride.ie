# Velvet & Neon Design System

The Ride uses a bold "Velvet & Neon" aesthetic - sophisticated dark cycling data platform that combines rich velvet backgrounds with vibrant neon accents.

## Quick Start

### View the Design System

**Visual Showcase:** Start the dev server and visit `/design-showcase` to see all components in action.

```bash
npm run dev:wrangler
# Visit http://localhost:4321/design-showcase
```

### Core Colors

**Velvet (Backgrounds):**
- `bg-velvet-black` - #0a0a0a (primary)
- `bg-velvet-charcoal` - #1a1a1a (cards)
- `bg-velvet-purple` - #1a0f2e (county pages)
- `bg-velvet-midnight` - #0d1117 (data panels)

**Neon (Accents):**
- `text-neon-green` - #39FF14 (cycling data)
- `text-neon-cyan` - #00F0FF (sensors)
- `text-neon-yellow` - #FFF01F (counties)
- `text-neon-orange` - #FF6B1A (alerts)

### Common Components

```astro
<!-- Primary Button with Neon Glow -->
<button class="btn-primary">Explore Data</button>

<!-- Velvet Card with Hover Effect -->
<div class="velvet-card p-6">
  <h3>Card Content</h3>
</div>

<!-- Heading with Neon Highlight -->
<h1>Ireland's <span class="greenhead">Local Output</span></h1>

<!-- Live Data with Pulse Animation -->
<div class="text-6xl text-neon-green neon-pulse">
  24,567
</div>

<!-- Neon Divider -->
<div class="neon-divider"></div>
```

## Documentation

- **Complete Guide:** [DESIGN_SYSTEM.md](/DESIGN_SYSTEM.md)
- **Implementation Summary:** [VELVET_NEON_TRANSFORMATION.md](/VELVET_NEON_TRANSFORMATION.md)
- **Live Showcase:** `/design-showcase` (in dev/production)

## Key Features

- **Accessibility:** WCAG AAA contrast ratios throughout
- **Performance:** CSS-only animations, no JavaScript overhead
- **Typography:** Space Grotesk font optimized for dark backgrounds
- **Effects:** Multi-layered neon glow, pulse animations, gradient dividers
- **Responsive:** Mobile-first design with touch-friendly interactions

## Usage Principles

**Do:**
- Use neon green for cycling data and primary CTAs
- Apply glow effects to interactive elements
- Use hi-viz yellow for county/regional pages only
- Maintain high contrast for all text

**Don't:**
- Use neon colors for large text blocks
- Mix multiple neon colors in one component
- Apply pulse animation to static data
- Use light backgrounds

---

**Version:** 1.0.0 | **Last Updated:** 2025-11-29
