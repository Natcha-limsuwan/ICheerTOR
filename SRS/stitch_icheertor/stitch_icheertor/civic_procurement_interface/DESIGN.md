---
name: Civic Procurement Interface
colors:
  surface: '#f9f9ff'
  surface-dim: '#d4daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e8eeff'
  surface-container-high: '#e3e8f9'
  surface-container-highest: '#dde2f3'
  on-surface: '#161c27'
  on-surface-variant: '#434653'
  inverse-surface: '#2a303d'
  inverse-on-surface: '#ecf0ff'
  outline: '#737784'
  outline-variant: '#c3c6d5'
  surface-tint: '#2559bd'
  primary: '#00327d'
  on-primary: '#ffffff'
  primary-container: '#0047ab'
  on-primary-container: '#a5bdff'
  inverse-primary: '#b1c5ff'
  secondary: '#41617f'
  on-secondary: '#ffffff'
  secondary-container: '#badbfe'
  on-secondary-container: '#40607e'
  tertiary: '#173953'
  on-tertiary: '#ffffff'
  tertiary-container: '#30506b'
  on-tertiary-container: '#a2c2e2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b1c5ff'
  on-primary-fixed: '#001946'
  on-primary-fixed-variant: '#00419e'
  secondary-fixed: '#cee5ff'
  secondary-fixed-dim: '#a9caec'
  on-secondary-fixed: '#001d33'
  on-secondary-fixed-variant: '#284966'
  tertiary-fixed: '#cde5ff'
  tertiary-fixed-dim: '#aacaea'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#294964'
  background: '#f9f9ff'
  on-background: '#161c27'
  surface-variant: '#dde2f3'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  container-margin: 32px
  gutter: 24px
  sidebar-width: 260px
  card-padding: 20px
---

## Brand & Style
The design system is engineered for transparency, efficiency, and civic accountability. It prioritizes a **Corporate Modern** aesthetic with high information density that remains legible and unencumbered. 

The visual language communicates institutional reliability and technical precision. By utilizing a structured layout with generous whitespace and a restrained color palette, the system transforms complex procurement data into actionable insights for government officials and the public. The emotional tone is authoritative, neutral, and meticulously organized.

## Colors
This design system utilizes a tiered blue palette to establish hierarchy and focus. 

- **Primary (#0047AB):** Reserved for primary actions, active navigation states, and key headers. It represents the "Source of Truth."
- **Secondary (#6F8FAF):** Used for non-critical icons, decorative borders, and secondary UI elements to reduce visual noise.
- **Accent/Tint (#A7C7E7):** Applied at low opacities for card backgrounds and section highlights to create subtle grouping without heavy lines.
- **Surface & Background:** The main workspace uses #F9FAFB to provide a soft contrast against pure white (#FFFFFF) cards.
- **Semantic Palette:** Warnings (Amber) and Red-flags (Soft Red) use slightly desaturated tones to ensure they catch the eye without causing visual fatigue in data-heavy environments.

## Typography
The system relies exclusively on **Inter** to leverage its exceptional legibility in data-dense interfaces. 

- **Headlines:** Use tighter letter-spacing and heavier weights to anchor sections.
- **Tabular Data:** Use `body-md` for standard table rows to maximize information density while maintaining readability.
- **Labels:** Use `label-md` with uppercase styling for table headers and small metadata tags to differentiate them from interactive content.
- **Mobile scaling:** For screens below 768px, `display-lg` should scale down to 28px and `headline-lg` to 24px.

## Layout & Spacing
The design system employs a **Fixed Grid** philosophy for desktop to ensure data consistency across different procurement views.

- **Sidebar:** A persistent 260px left navigation bar provides high-level filtering and module switching.
- **Grid:** A 12-column grid with 24px gutters. Content typically lives within a max-width container of 1440px.
- **Rhythm:** An 8px linear scale is used for most spacing, while 4px increments are used for tight component internals (e.g., icon-to-text).
- **Responsive Behavior:** On tablets, the sidebar collapses into a hamburger menu or icon-only rail. On mobile, cards stack vertically and horizontal padding reduces to 16px.

## Elevation & Depth
Hierarchy is established through **Tonal Layering** and **Ambient Shadows**.

- **Level 0 (Background):** #F9FAFB. The canvas.
- **Level 1 (Cards/Sidebar):** Pure white (#FFFFFF) with a very soft, diffused shadow (0px 2px 4px rgba(26, 32, 44, 0.05)).
- **Level 2 (Dropdowns/Modals):** Pure white with a more pronounced shadow (0px 10px 15px rgba(26, 32, 44, 0.1)) to indicate temporary interaction.
- **Dividers:** Use 1px borders of #6F8FAF at 20% opacity for subtle horizontal separation in lists.

## Shapes
The system uses a **Rounded** shape language to soften the institutional nature of the data.

- **Cards & Sections:** 10px (between `rounded-lg` and `rounded-xl` in standard scales) to create a modern, approachable container.
- **Inputs & Buttons:** 8px (`rounded-lg`) for a precise, professional feel.
- **Badges/Chips:** Always use a **Pill** shape (999px) to clearly distinguish metadata from clickable buttons or input fields.

## Components
- **Buttons:** Primary buttons use the Cobalt Blue (#0047AB) background with white text. Secondary buttons use a #6F8FAF outline. 
- **Pill Badges:** Status indicators (e.g., "In Review", "Approved") use the Pill shape with the Accent Blue (#A7C7E7) background and dark navy text for high legibility.
- **Data Tables:** Row hover states should use a 5% opacity of the Primary color. Headers should be sticky with a subtle bottom border.
- **Input Fields:** Use a 1px border of #6F8FAF. On focus, the border transitions to #0047AB with a 2px outer glow of the Accent color at 30% opacity.
- **Persistent Sidebar:** Icons should be 20px, paired with `body-md` text. The active state uses a 4px left-border "indicator" in Cobalt Blue.
- **Procurement Cards:** Feature a summary header, a progress bar for the procurement stage, and a "Red Flag" icon slot in the top right corner if warnings are present.