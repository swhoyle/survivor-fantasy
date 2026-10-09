# UI Theme — Bracketology-Inspired Dashboard

Redesign my React application's UI to follow the visual design of the provided Bracketology screenshot.

## 1. Overall Aesthetic
- Modern, minimalist, dark-mode sports fantasy dashboard.
- Professional, clean, compact, and data-focused.
- Flat surfaces with subtle contrast instead of heavy shadows.
- Dense information layouts while maintaining consistent spacing.
- Avoid excessive rounded cards, gradients, bright colors, or decorative elements.

## 2. Color Palette

| Element | Color |
|---|---|
| Main background | `#111216` |
| Navigation background | `#1A1A1A` |
| Header background | `#191919` |
| Cards / panels | `#202124` |
| Selected navigation | `#2C2D30` |
| Borders / dividers | `#36383D` |
| Primary text | `#F5F5F5` |
| Secondary text | `#A1A3AA` |
| Accent green | `#00B85A` |
| Hover background | `#303136` |

Use green sparingly for selected tabs, active navigation, important metrics, and interactive highlights.

## 3. Layout & Spacing
- Full-screen dashboard layout.
- Fixed-height top navigation bar (~78px).
- Narrow left icon sidebar (~95px).
- Secondary navigation sidebar (~250px).
- Main content area with clear horizontal alignment.
- Use 8px spacing increments: 8, 16, 24, 32px.
- Compact tables with approximately 48–56px row heights.
- Consistent padding inside all panels.
- Thin 1px borders to separate structural sections.
- Avoid unnecessary whitespace between related elements.

## 4. Typography
- Use Inter or a similar modern sans-serif font.
- Primary text: white, medium weight.
- Secondary text: muted gray.
- Page titles: 20–24px, semibold.
- Section headings: 16–18px, semibold.
- Body text: 14–15px.
- Labels and table headers: 12–13px.
- Favor strong typography hierarchy over oversized text.

## 5. Navigation
- Dark vertical sidebars with icon-and-label navigation.
- Selected navigation items have a slightly lighter charcoal background, rounded corners, and green text/icons.
- Unselected items remain white or muted gray.
- Use subtle hover transitions.
- Keep navigation compact and aligned.

## 6. Components

**Cards and Panels**
- Dark charcoal backgrounds.
- Subtle corner radius (8–12px).
- Minimal borders and no prominent shadows.
- Compact internal padding.

**Tabs**
- Horizontal pill-shaped tab groups.
- Inactive tabs use muted dark backgrounds.
- Selected tabs use a thin green outline.
- Smooth hover transitions.

**Tables / Leaderboards**
- Clean rows with no heavy gridlines.
- Left-aligned labels and consistently aligned numerical columns.
- Highlight the current user's row using a charcoal background.
- Alternate row backgrounds only where useful.
- Circular avatars beside usernames.
- Compact spacing, with clear visual separation.

**Buttons**
- Simple dark buttons with subtle borders.
- Green for active states and primary actions.
- Small border radii.
- No gradients or pronounced shadows.

**Icons**
- Use Lucide React.
- Simple monochrome icons.
- Consistent sizing (16–20px).
- Green icons for active states.

## 7. Interaction & Responsiveness
- Subtle hover feedback (150–200ms).
- No unnecessary animations.
- Preserve clear keyboard focus states.
- Maintain readable contrast.
- Collapse sidebars appropriately on smaller screens.
- Allow tables to scroll horizontally on mobile when needed.

## 8. Implementation
- Apply this visual theme consistently throughout the existing React application.
- Reuse existing components wherever possible.
- Centralize theme colors and spacing using CSS variables or design tokens.
- Preserve all existing functionality, routing, and data logic.
- Prioritize consistent styling across navigation, tables, cards, buttons, and forms.
- Do not introduce unrelated features or redesign the application's information architecture.