# MeetMind AI — Design System

**The Intelligent Meeting & Lecture Assistant**
Version 1.0 · Dark‑mode first · Enterprise SaaS

Audience: Companies, Universities, Schools, Teams, Training Centers.
This document defines the visual language, tokens, and component rules used across every MeetMind AI surface. It is the single source of truth — implementation (React, Tailwind, CSS) must derive from it, never redefine it.

---

## 1. Design Principles

1. **Calm intelligence.** The product handles dense information (transcripts, timelines, AI output). The UI must feel quiet so the content can speak.
2. **Signal over decoration.** Every color, shadow, and motion cue must communicate state, hierarchy, or causality. No ornamental gradients.
3. **Dark first, light equal.** Dark is the canonical experience (long sessions, low‑light lecture halls). Light theme is a first‑class mirror, not an afterthought.
4. **Glass with restraint.** Glassmorphism is reserved for floating layers (command palette, AI drawer, notifications). Base surfaces stay solid for readability.
5. **Density is a setting, not a default.** Comfortable spacing by default; Compact mode for power users.
6. **AI is a citizen, not a costume.** AI‑generated content has its own token family (Iris) so users can always tell what a model produced.
7. **Accessible by construction.** WCAG 2.2 AA minimum; AAA for body copy in both themes.
8. **Motion is meaning.** Animation clarifies transitions of state or place. Never entertains.

---

## 2. Brand Foundation

**Product name:** MeetMind AI
**Wordmark:** `MeetMind` in Display, `AI` in Iris accent, tracking ‑1.5%.
**Symbol:** Rounded square glyph containing a waveform that resolves into a node graph. Corner radius = `radius.lg`.
**Voice:** Precise, warm, never cute. Prefers verbs over adjectives.
**Signature gradient (Iris):** `#7C5CFF → #4EA8FF → #22D3EE` at 135°. Used only for AI moments and the wordmark accent.

---

## 3. Color System

All colors are defined in **OKLCH** for perceptual uniformity across themes. Every token exists in both `dark` and `light`. Never use raw hex in components — always reference a token.

### 3.1 Palette families

| Family      | Role                          | Hue anchor        |
| ----------- | ----------------------------- | ----------------- |
| **Ink**     | Neutrals, text, surfaces      | 260° (cool slate) |
| **Iris**    | Primary / AI / brand          | 275°              |
| **Sky**     | Secondary / links / info      | 230°              |
| **Mint**    | Success                       | 165°              |
| **Amber**   | Warning                       | 75°               |
| **Coral**   | Danger / destructive          | 25°               |
| **Cyan**    | Information / live indicators | 210°              |
| **Violet**  | AI‑generated content marker   | 295°              |
| **Teal**    | Meeting entity color          | 190°              |
| **Fuchsia** | Lecture entity color          | 320°              |
| **Lime**    | Task entity color             | 130°              |

Each family ships 12 steps (`50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000`). 500 is the pure family hue; steps below 500 are lighter, above are darker.

### 3.2 Semantic tokens

Semantic tokens are what components consume. Palette steps are internal.

**Backgrounds & surfaces**

| Token                     | Dark          | Light          | Use                             |
| ------------------------- | ------------- | -------------- | ------------------------------- |
| `bg.canvas`               | Ink 1000      | Ink 50         | App background                  |
| `bg.base`                 | Ink 950       | Ink 0 (#FFF)   | Content column background       |
| `bg.subtle`               | Ink 900       | Ink 100        | Zebra rows, subtle wells        |
| `bg.muted`                | Ink 850       | Ink 150        | Disabled fields, empty state    |
| `surface.card`            | Ink 900 @ 92% | Ink 0          | Card surface                    |
| `surface.raised`          | Ink 850       | Ink 0 + shadow | Elevated card / hovered card    |
| `surface.sunken`          | Ink 1000      | Ink 100        | Inputs, transcript column       |
| `surface.overlay`         | Ink 950 @ 72% | Ink 1000 @ 48% | Modal scrim                     |
| `surface.glass`           | Ink 900 @ 55% | Ink 0 @ 65%    | Glass panels (blur 24, sat 180) |
| `surface.sidebar`         | Ink 975       | Ink 75         | Sidebar background              |
| `surface.topbar`          | Ink 950 @ 80% | Ink 0 @ 85%    | Sticky topbar (blur 16)         |
| `surface.tooltip`         | Ink 100       | Ink 950        | Tooltip background (inverse)    |
| `surface.scrollbar`       | Ink 800       | Ink 300        | Thumb                           |
| `surface.scrollbar.track` | transparent   | transparent    | Track                           |

**Text**

| Token            | Dark       | Light      | Contrast target  |
| ---------------- | ---------- | ---------- | ---------------- |
| `text.primary`   | Ink 50     | Ink 950    | AAA on `bg.base` |
| `text.secondary` | Ink 300    | Ink 700    | AA large         |
| `text.tertiary`  | Ink 400    | Ink 600    | AA UI            |
| `text.disabled`  | Ink 600    | Ink 400    | —                |
| `text.inverse`   | Ink 950    | Ink 50     | AAA              |
| `text.link`      | Sky 400    | Sky 600    | AA               |
| `text.brand`     | Iris 400   | Iris 600   | AA               |
| `text.ai`        | Violet 300 | Violet 700 | AA               |

**Border**

| Token            | Dark         | Light         | Use                   |
| ---------------- | ------------ | ------------- | --------------------- |
| `border.subtle`  | Ink 50 @ 6%  | Ink 950 @ 6%  | Divider lines, cards  |
| `border.default` | Ink 50 @ 10% | Ink 950 @ 10% | Inputs, buttons       |
| `border.strong`  | Ink 50 @ 18% | Ink 950 @ 18% | Hover, focused inputs |
| `border.brand`   | Iris 500     | Iris 500      | Active nav, selected  |
| `border.focus`   | Iris 400     | Iris 500      | Focus ring outer      |

**Interaction states** (applied as overlays on any base surface)

| Token              | Value                                  |
| ------------------ | -------------------------------------- |
| `state.hover`      | +6% luminance                          |
| `state.press`      | ‑4% luminance                          |
| `state.selected`   | Iris @ 12%                             |
| `state.focus.ring` | Iris 400, 2px + `bg.canvas` 2px offset |
| `state.disabled`   | 40% opacity, no shadow                 |

**Status (semantic feedback)**

| Token          | Dark bg / fg                | Light bg / fg         |
| -------------- | --------------------------- | --------------------- |
| `success`      | Mint 500 / Ink 1000         | Mint 600 / Ink 0      |
| `success.soft` | Mint 900 @ 40% / Mint 300   | Mint 100 / Mint 800   |
| `warning`      | Amber 500 / Ink 1000        | Amber 600 / Ink 0     |
| `warning.soft` | Amber 900 @ 40% / Amber 300 | Amber 100 / Amber 800 |
| `danger`       | Coral 500 / Ink 0           | Coral 600 / Ink 0     |
| `danger.soft`  | Coral 900 @ 40% / Coral 300 | Coral 100 / Coral 800 |
| `info`         | Cyan 500 / Ink 1000         | Cyan 600 / Ink 0      |
| `info.soft`    | Cyan 900 @ 40% / Cyan 300   | Cyan 100 / Cyan 800   |

### 3.3 Domain color tokens

**Entities**

| Token              | Hue         | Use                                   |
| ------------------ | ----------- | ------------------------------------- |
| `entity.meeting`   | Teal 500    | Meeting cards, calendar chips, badges |
| `entity.lecture`   | Fuchsia 500 | Lecture cards, chips                  |
| `entity.task`      | Lime 500    | Task chips, checkboxes                |
| `entity.ai`        | Iris 500    | Any AI‑authored content               |
| `entity.flashcard` | Sky 400     | Flashcard front border                |
| `entity.quiz`      | Amber 400   | Quiz badge / progress                 |

**Task priority**

| Priority | Token             | Chip color      |
| -------- | ----------------- | --------------- |
| Urgent   | `priority.urgent` | Coral 500 solid |
| High     | `priority.high`   | Coral 400 soft  |
| Medium   | `priority.medium` | Amber 400 soft  |
| Low      | `priority.low`    | Sky 400 soft    |
| None     | `priority.none`   | Ink 500 soft    |

**Timeline / transcript**

| Token                     | Use                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `transcript.speaker.1..8` | 8‑slot rotating speaker palette (Iris, Cyan, Mint, Amber, Coral, Fuchsia, Teal, Lime — all step 400) |
| `transcript.keyword`      | Iris 400 @ 24% highlight bg                                                                          |
| `transcript.exam-hint`    | Amber 400 @ 24% highlight bg                                                                         |
| `transcript.action-item`  | Mint 400 @ 24% highlight bg                                                                          |
| `transcript.decision`     | Fuchsia 400 @ 24% highlight bg                                                                       |
| `timeline.now`            | Iris 500 vertical rule                                                                               |
| `timeline.past`           | Ink 400                                                                                              |
| `timeline.future`         | Ink 600                                                                                              |

**Calendar**

| Token                    | Use                                         |
| ------------------------ | ------------------------------------------- |
| `calendar.today`         | Iris 500 outline                            |
| `calendar.weekend`       | `bg.subtle`                                 |
| `calendar.event.meeting` | `entity.meeting` @ 20% bg + solid left rule |
| `calendar.event.lecture` | `entity.lecture` @ 20% bg + solid left rule |
| `calendar.event.task`    | `entity.task` @ 20% bg + solid left rule    |

**Notifications**

| Type    | Token            | Icon color                         |
| ------- | ---------------- | ---------------------------------- |
| Info    | `notify.info`    | Cyan 400                           |
| Success | `notify.success` | Mint 400                           |
| Warning | `notify.warning` | Amber 400                          |
| Danger  | `notify.danger`  | Coral 400                          |
| AI      | `notify.ai`      | Iris 400 with Iris gradient border |
| Mention | `notify.mention` | Fuchsia 400                        |

**Export**

| Format | Token         | Accent    |
| ------ | ------------- | --------- |
| PDF    | `export.pdf`  | Coral 500 |
| DOCX   | `export.docx` | Sky 500   |
| MD     | `export.md`   | Ink 400   |
| CSV    | `export.csv`  | Mint 500  |
| ICS    | `export.ics`  | Amber 500 |
| JSON   | `export.json` | Iris 500  |

**Charts & analytics** (categorical, colorblind‑safe, order matters)

`chart.cat.1..8` = Iris 400, Cyan 400, Mint 400, Amber 400, Coral 400, Fuchsia 400, Sky 300, Lime 400.
Sequential: `chart.seq` = Iris 100 → Iris 700 (7 stops).
Diverging: `chart.div` = Coral 500 ↔ Ink 400 ↔ Mint 500.
Heatmap: `chart.heat` = Ink 900 → Iris 500 → Amber 300 (perceptual).
Grid: `chart.grid` = `border.subtle`. Axes: `text.tertiary`. Tooltip: `surface.tooltip`.

### 3.4 Gradients

| Token                | Definition                                          | Use                         |
| -------------------- | --------------------------------------------------- | --------------------------- |
| `gradient.iris`      | 135°, Iris 500 → Sky 500 → Cyan 400                 | Brand, AI CTAs              |
| `gradient.iris.soft` | 135°, Iris 500 @ 16% → Cyan 400 @ 8%                | AI card background wash     |
| `gradient.aurora`    | Radial, Iris 500 @ 20% → transparent 60%            | Hero glow behind dashboards |
| `gradient.mesh.dark` | Multi‑stop mesh over `bg.canvas`                    | Sign‑in, empty states       |
| `gradient.divider`   | Linear, transparent → `border.subtle` → transparent | Section separators          |

Rule: gradients never appear on text longer than 4 words, never on body copy, never on containers > 480px unless at ≤ 8% opacity.

---

## 4. Typography

**Type families**

| Role        | Family                            | Fallback                 |
| ----------- | --------------------------------- | ------------------------ |
| Display     | **Geist Sans** (or Inter Display) | ui‑sans‑serif, system‑ui |
| Body / UI   | **Inter**                         | ui‑sans‑serif, system‑ui |
| Mono / Code | **JetBrains Mono**                | ui‑monospace, Menlo      |
| Transcript  | **iA Writer Quattro** (or Inter)  | ui‑sans‑serif            |
| Numerics    | Inter _tabular‑nums_ variant      | —                        |

All type uses `font-feature-settings: "ss01", "cv11", "tnum"` where applicable for consistent digits and glyphs.

**Scale** (base 16px, 1.125 minor‑third for UI, 1.25 major‑third for display)

| Token        | Size / Line     | Weight | Tracking  | Use                        |
| ------------ | --------------- | ------ | --------- | -------------------------- |
| `display.xl` | 72 / 76         | 600    | ‑2.5%     | Marketing hero             |
| `display.lg` | 60 / 64         | 600    | ‑2.0%     | Section hero               |
| `display.md` | 48 / 52         | 600    | ‑1.5%     | Empty‑state hero           |
| `h1`         | 36 / 44         | 600    | ‑1.2%     | Page title                 |
| `h2`         | 28 / 36         | 600    | ‑1.0%     | Section                    |
| `h3`         | 22 / 30         | 600    | ‑0.6%     | Card title, modal          |
| `h4`         | 18 / 26         | 600    | ‑0.4%     | Widget title               |
| `h5`         | 16 / 24         | 600    | ‑0.2%     | Subhead                    |
| `h6`         | 14 / 20         | 600    | 0         | Group label                |
| `body.lg`    | 17 / 28         | 400    | 0         | Long‑form reading          |
| `body.md`    | 15 / 24         | 400    | 0         | Default UI text            |
| `body.sm`    | 13 / 20         | 400    | +0.5%     | Secondary UI               |
| `caption`    | 12 / 16         | 400    | +1.0%     | Meta, timestamps           |
| `label`      | 12 / 16         | 500    | +4% UPPER | Form labels, table headers |
| `button`     | 14 / 20         | 500    | 0         | Buttons                    |
| `nav`        | 14 / 20         | 500    | 0         | Top nav                    |
| `sidebar`    | 13 / 20         | 500    | 0         | Sidebar items              |
| `code`       | 13 / 20 mono    | 400    | 0         | Inline & block code        |
| `transcript` | 15 / 26         | 400    | 0         | Transcript body            |
| `timeline`   | 12 / 16 tabular | 500    | +2%       | Time stamps                |
| `stat.value` | 32 / 36 tabular | 600    | ‑1.5%     | KPI numbers                |
| `stat.label` | 12 / 16 UPPER   | 500    | +6%       | KPI captions               |

**Rules**

- Max measure for body: 72ch. Transcript: 84ch.
- Never bold body text for emphasis — use `text.primary` weight 500 or an `<mark>` token.
- Numeric values in tables and stats always use `tnum`.
- Uppercase only for `label`, `stat.label`, and 1‑word badges.
- Line length in code blocks: 100 char soft wrap; no horizontal scroll under 640px.

---

## 5. Spacing & Layout

**4px base grid.** Every spatial value snaps to it.

| Token | px  | Common use                      |
| ----- | --- | ------------------------------- |
| `0`   | 0   | —                               |
| `0.5` | 2   | Icon nudge, focus offset        |
| `1`   | 4   | Micro gap                       |
| `1.5` | 6   | Chip padding‑y                  |
| `2`   | 8   | Compact gap, icon+label         |
| `3`   | 12  | Input padding‑y                 |
| `4`   | 16  | Card padding‑sm, list gap       |
| `5`   | 20  | Section inner gap               |
| `6`   | 24  | Card padding default            |
| `8`   | 32  | Card padding‑lg, section gap sm |
| `10`  | 40  | Row height default              |
| `12`  | 48  | Header height, section gap md   |
| `16`  | 64  | Section gap lg                  |
| `20`  | 80  | Hero gap                        |
| `24`  | 96  | Page top padding                |
| `32`  | 128 | Ultra‑wide margins              |

**Layout metrics**

| Element                  | Value                     |
| ------------------------ | ------------------------- |
| Container max            | 1440 (1600 on ultra‑wide) |
| Content column max       | 1200                      |
| Reading column max       | 768                       |
| Sidebar (expanded)       | 264                       |
| Sidebar (collapsed)      | 64                        |
| Sidebar (floating panel) | 320                       |
| Topbar height            | 56 (compact 48)           |
| Footer height            | 64                        |
| Section gap (dashboards) | 32                        |
| Card padding default     | 24                        |
| Card padding compact     | 16                        |
| Modal width sm/md/lg/xl  | 400 / 560 / 720 / 960     |
| Drawer width sm/md/lg    | 400 / 560 / 720           |
| Bottom sheet (mobile)    | 100vw × up to 92dvh       |

**Responsive breakpoints**

| Name  | Min width | Notes                              |
| ----- | --------- | ---------------------------------- |
| `xs`  | 0         | Mobile portrait                    |
| `sm`  | 480       | Mobile landscape                   |
| `md`  | 768       | Tablet portrait                    |
| `lg`  | 1024      | Laptop, sidebar collapses to icons |
| `xl`  | 1280      | Desktop default                    |
| `2xl` | 1536      | Large desktop                      |
| `3xl` | 1920      | Ultra‑wide                         |

**Density modes**

| Mode        | Row height | Card padding | Font base |
| ----------- | ---------- | ------------ | --------- |
| Comfortable | 40         | 24           | 15        |
| Compact     | 32         | 16           | 14        |

---

## 6. Border Radius

| Token  | Value | Use                             |
| ------ | ----- | ------------------------------- |
| `xs`   | 4     | Chips, inline tags, checkbox    |
| `sm`   | 6     | Inputs, small buttons           |
| `md`   | 10    | Buttons, dropdowns, table cells |
| `lg`   | 14    | Cards, modals                   |
| `xl`   | 20    | Feature cards, drawers          |
| `2xl`  | 28    | Hero panels, glass modals       |
| `pill` | 999   | Toggle switches, avatar badges  |
| `full` | 50%   | Avatars, circular icon buttons  |

Rule: nested corners subtract 2px (`outer.lg 14 → inner md 10`) to preserve concentric geometry.

---

## 7. Elevation & Shadow

Shadows are duotone (ambient + key). In dark theme both channels are near‑black at low opacity plus a subtle 1px inset highlight on top edge for glass.

| Token           | Ambient                                        | Key                      | Use             |
| --------------- | ---------------------------------------------- | ------------------------ | --------------- |
| `elev.0`        | none                                           | none                     | Flush           |
| `elev.sm`       | 0 1 2 rgb(0 0 0 / .06)                         | 0 1 1 rgb(0 0 0 / .04)   | Buttons, chips  |
| `elev.md`       | 0 4 8 rgb(0 0 0 / .10)                         | 0 2 4 rgb(0 0 0 / .06)   | Cards           |
| `elev.lg`       | 0 12 24 rgb(0 0 0 / .16)                       | 0 4 8 rgb(0 0 0 / .10)   | Popovers        |
| `elev.xl`       | 0 24 48 rgb(0 0 0 / .22)                       | 0 8 16 rgb(0 0 0 / .14)  | Modals, drawers |
| `elev.float`    | 0 32 64 rgb(0 0 0 / .28)                       | 0 12 24 rgb(0 0 0 / .18) | Command palette |
| `elev.dialog`   | `elev.xl` + backdrop blur 24                   | —                        | Confirm dialogs |
| `elev.glass`    | inset 0 1 0 rgb(255 255 255 / .08) + `elev.lg` | —                        | Glass panels    |
| `elev.sidebar`  | 1 0 0 rgb(0 0 0 / .04) right edge              | —                        | Sidebar divider |
| `elev.dropdown` | `elev.lg`                                      | —                        | Selects, menus  |
| `elev.tooltip`  | `elev.md`                                      | —                        | Tooltips        |
| `elev.ai.glow`  | 0 0 32 Iris 500 @ 20% + `elev.md`              | —                        | AI CTA hover    |

Light theme reduces ambient opacity by 40% and increases key by 20%; adds a 1px top inner light of white @ 60%.

---

## 8. Glassmorphism Rules

Glass is a **layer**, not a theme. Use only on: command palette, AI drawer, notification toasts, topbar, floating action bar, image overlays.

| Property         | Value                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Backdrop filter  | `blur(24px) saturate(180%)`                                                                               |
| Background       | `surface.glass` (see §3.2)                                                                                |
| Border           | 1px `border.subtle` + inset 1px top white @ 8% (dark) / black @ 4% (light)                                |
| Shadow           | `elev.glass`                                                                                              |
| Overlay tint     | `gradient.iris.soft` at 8%                                                                                |
| Hover            | background +4% luminance, blur unchanged                                                                  |
| Pressed          | background ‑4% luminance                                                                                  |
| Content contrast | Text must retain AA over blurred worst‑case background — enforce with tinted background above 40% opacity |
| Fallback         | If `backdrop-filter` unsupported, upgrade background to 92% opacity                                       |

Never stack glass on glass. Never place glass on a solid brand color.

---

## 9. Iconography

**Library:** Lucide. **Stroke:** 1.5. **Corner join:** round. **Optical sizes:** 14 / 16 / 20 / 24 / 32.

| Context             | Size | Stroke | Color                                 |
| ------------------- | ---- | ------ | ------------------------------------- |
| Sidebar item        | 20   | 1.75   | `text.secondary`, active `text.brand` |
| Nav / topbar        | 18   | 1.5    | `text.secondary`                      |
| Inline w/ body      | 16   | 1.5    | inherit                               |
| Button (with label) | 16   | 1.75   | inherit                               |
| Icon button         | 20   | 1.75   | `text.secondary`                      |
| Empty‑state hero    | 48   | 1.25   | `text.tertiary`                       |
| Toast               | 20   | 1.75   | status color                          |
| AI marker           | 16   | 1.75   | Iris gradient (masked)                |

**Domain mapping** (canonical Lucide names)

| Domain           | Icons                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Navigation       | LayoutDashboard, CalendarDays, ListChecks, BarChart3, Users, Settings |
| Meeting          | Video, Mic, MicOff, Radio, Users, Clock                               |
| Lecture          | GraduationCap, BookOpen, Presentation, Highlighter                    |
| Analytics        | BarChart3, LineChart, PieChart, TrendingUp, Activity                  |
| AI               | Sparkles, WandSparkles, Brain, BotMessageSquare                       |
| Task             | ListChecks, CheckCircle2, Circle, Flag, Timer                         |
| Calendar         | CalendarDays, CalendarClock, CalendarPlus                             |
| Profile          | UserCircle2, IdCard, Building2                                        |
| Settings         | Settings, SlidersHorizontal, KeyRound, ShieldCheck                    |
| Notifications    | Bell, BellDot, BellRing                                               |
| Reports / export | FileText, FileDown, Download, Share2                                  |
| Search           | Search, Command, ArrowUpDown                                          |

Rule: no two icons in the same view may share a metaphor for different meanings.

---

## 10. Buttons

**Sizes**

| Size | Height | Padding‑x | Font  | Icon | Radius | Min tap         |
| ---- | ------ | --------- | ----- | ---- | ------ | --------------- |
| `xs` | 24     | 8         | 12/16 | 14   | `sm`   | — (inline only) |
| `sm` | 32     | 12        | 13/20 | 16   | `md`   | 32              |
| `md` | 40     | 16        | 14/20 | 16   | `md`   | 44 (mobile)     |
| `lg` | 48     | 20        | 15/24 | 18   | `md`   | 48              |
| `xl` | 56     | 24        | 16/24 | 20   | `lg`   | 56              |

**Variants**

| Variant        | Rest                                                                                                       | Hover                  | Press      | Focus              | Disabled         |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- | ---------- | ------------------ | ---------------- |
| Primary        | Ink 950 bg, `text.inverse` fg (dark: Ink 50 bg, Ink 1000 fg)                                               | +6% L                  | ‑4% L      | `state.focus.ring` | `state.disabled` |
| Secondary      | `bg.subtle`, `text.primary`, 1px `border.default`                                                          | `border.strong`        | `bg.muted` | ring               | dis              |
| Outline        | transparent, `text.primary`, 1px `border.default`                                                          | `bg.subtle`            | `bg.muted` | ring               | dis              |
| Ghost          | transparent, `text.secondary`                                                                              | `bg.subtle`            | `bg.muted` | ring               | dis              |
| Danger         | Coral 500 bg, Ink 0 fg                                                                                     | Coral 400              | Coral 600  | ring Coral 400     | dis              |
| Success        | Mint 500 bg, Ink 1000 fg                                                                                   | Mint 400               | Mint 600   | ring Mint 400      | dis              |
| Gradient       | `gradient.iris`, Ink 0 fg                                                                                  | +8% L + `elev.ai.glow` | ‑4% L      | ring Iris 400      | dis              |
| Glass          | `surface.glass`, `text.primary`, glass border                                                              | +4% L                  | ‑4% L      | ring               | dis              |
| AI             | `gradient.iris.soft` bg, `text.ai` fg, 1px Iris 500 @ 40% border, leading Sparkles icon with gradient fill | +8% L + AI glow        | ‑4% L      | ring Iris 400      | dis              |
| Icon           | Ghost by default; square, radius `md`                                                                      | `bg.subtle`            | `bg.muted` | ring               | dis              |
| Floating (FAB) | Gradient, `elev.float`, radius `full`                                                                      | `elev.float` + glow    | ‑4% L      | ring               | dis              |
| Loading        | Any variant; label swaps to spinner + optional text                                                        | pointer‑events none    | —          | —                  | —                |

**Rules**

- Only one Primary or Gradient button per view region.
- AI variant is reserved for actions that call a model. Never for navigation.
- Destructive actions require Danger variant and a confirmation modal.
- Icon + label spacing = `2` (8px). Never separate icon from label with a divider.

---

## 11. Inputs & Forms

**Field anatomy:** label → optional helper → control → helper/error.
Vertical rhythm inside a form group = `2` (8px). Between groups = `5` (20px).

**Sizes**

| Size | Height | Font  | Radius |
| ---- | ------ | ----- | ------ |
| sm   | 32     | 13/20 | `sm`   |
| md   | 40     | 14/20 | `md`   |
| lg   | 48     | 15/24 | `md`   |

**Control tokens**

| Element           | Rest bg                                                                                                                  | Border           | Focus                   | Placeholder          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------- | -------------------- |
| Text / textarea   | `surface.sunken`                                                                                                         | `border.default` | `border.focus` + ring   | `text.tertiary`      |
| Search            | `bg.subtle`, pill radius, leading Search icon, ⌘K badge trailing                                                         | —                | ring                    | "Search everything…" |
| AI prompt box     | `surface.card`, Iris gradient 1px border, leading Sparkles, trailing Send + model chip, autoresize 1–8 lines, `elev.md`  | —                | Iris focus ring         | "Ask MeetMind…"      |
| OTP               | 6 boxes, 40×48, mono, auto‑advance                                                                                       | `border.default` | Iris ring on active box | "•"                  |
| Select / combobox | Same as text; trailing ChevronDown; menu uses `elev.dropdown`                                                            | —                | —                       | —                    |
| Checkbox          | 16×16, radius `xs`, check icon in `text.inverse`                                                                         | `border.strong`  | ring                    | —                    |
| Radio             | 16×16, radius `full`, inner dot Iris 500                                                                                 | `border.strong`  | ring                    | —                    |
| Toggle            | 32×20 track, 16 thumb; on = Iris 500, off = Ink 700                                                                      | —                | ring                    | —                    |
| Date/time picker  | Calendar popover on `surface.raised`, `elev.lg`, today = Iris ring                                                       | —                | —                       | —                    |
| Upload / dropzone | Dashed 1.5px `border.strong`, radius `lg`, 40 padding, hover = Iris 500 dashed, drop = Iris 500 @ 12% bg, elevation `md` | —                | —                       | —                    |
| Voice input       | Circular 56 button, gradient bg when recording, pulsing waveform (Cyan 400 → Iris 400), red halt dot                     | —                | ring                    | —                    |

**States**

| State     | Border           | BG               | Helper text     |
| --------- | ---------------- | ---------------- | --------------- |
| Rest      | `border.default` | `surface.sunken` | `text.tertiary` |
| Hover     | `border.strong`  | +4% L            | —               |
| Focus     | `border.focus`   | rest             | —               |
| Filled    | `border.default` | rest             | —               |
| Invalid   | Coral 500        | Coral @ 6%       | Coral 400       |
| Success   | Mint 500         | Mint @ 6%        | Mint 400        |
| Disabled  | `border.subtle`  | `bg.muted`       | `text.disabled` |
| Read‑only | `border.subtle`  | transparent      | —               |

---

## 12. Cards

**Base card**

- Surface: `surface.card`
- Border: 1px `border.subtle`
- Radius: `lg`
- Padding: `6` (24) default, `4` compact
- Shadow: `elev.md`
- Hover: `elev.lg`, border `border.default`, 120ms

**Variants**

| Card         | Signature                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Statistic    | `stat.label` top, `stat.value` middle, delta chip (Mint/Coral) + spark line bottom‑right          |
| Meeting      | Left rule `entity.meeting` 3px, title h4, participants avatar stack, time chip, status badge      |
| Lecture      | Left rule `entity.lecture` 3px, course chip, duration, slide count, instructor row                |
| Task         | Checkbox left, title with strike on complete, priority chip, due date, assignee avatars           |
| Summary      | `Sparkles` badge, `gradient.iris.soft` header, TL;DR bullets, "Regenerate" AI ghost button footer |
| Keyword      | Chip cloud; each keyword = pill, frequency indicated by opacity 40→100%                           |
| AI           | 1px Iris gradient border via mask, `gradient.iris.soft` at 8%, Sparkles avatar, model chip footer |
| Notification | Icon left (status), title, body, timestamp right, unread = 4px Iris dot in top‑left               |
| Timeline     | Time gutter left (`timeline` font), colored node, body right; group by day sticky header          |
| Transcript   | Speaker chip + timestamp + paragraph; hover reveals action row (Copy, Highlight, Ask AI)          |
| Flashcard    | Two‑sided, radius `xl`, 240×160, flip on click, front = Sky 400 rule, back = Iris 400 rule        |
| Quiz         | Question header, radio/checkbox options, progress dots top, submit `Primary` bottom‑right         |
| Chart        | Title + legend inline; body chart; footer: range selector chips + export icon                     |
| Profile      | Avatar 64, name h4, role caption, org chip, action row (Message, Assign)                          |
| Project      | Cover gradient strip 6px `gradient.iris`, title, member stack, progress bar, last activity meta   |
| Report       | File icon by type, filename, size, generated timestamp, download `Ghost` button                   |

Interactive cards have `cursor: pointer`, translate `-1px` on Y at hover, `+0` on press.

---

## 13. Tables

**Structure**

- Header row: 40 tall, `label` font, `bg.subtle`, sticky (`position: sticky; top: 0; z: 10`).
- Body rows: 48 comfortable / 40 compact. Zebra optional via `bg.subtle` on even.
- Row hover: `state.hover`. Selected: `state.selected` + 2px Iris left rule.
- Border: 1px `border.subtle` bottom only. No vertical dividers by default.
- First & last column padding‑x: `6`. Others: `4`.

**Capabilities**

| Feature           | Rule                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Sorting           | Sort icon in header trailing; states: none / asc / desc; tri‑state cycle                  |
| Filtering         | Filter chip row above table; popover per column via funnel icon                           |
| Pagination        | Bottom right: page size select + prev/next + "1–20 of 340" caption                        |
| Search            | Table‑scoped search field top‑left, `sm`, ⌘F focus                                        |
| Selection         | Leading checkbox column, 40 wide; header checkbox = all/indeterminate                     |
| Bulk actions bar  | Floating pill at bottom center on selection, glass surface, `elev.float`, count + actions |
| Resizable columns | 4px grabber on divider hover; min 64, max 100%                                            |
| Status badges     | Use Badge tokens (§14); left‑aligned in cell                                              |
| Row expand        | Chevron leading; expanded content in `bg.subtle` sub‑panel with inset padding             |
| Sticky columns    | First column optionally sticky; shadow right edge fades in on scroll                      |
| Empty state       | See §17                                                                                   |

---

## 14. Badges & Tags

**Sizes:** sm (20 tall, 11/16 font) · md (24 tall, 12/16 font). Radius `pill`. Padding‑x = `2`.

| Badge           | Style                                                    |
| --------------- | -------------------------------------------------------- |
| Success         | `success.soft` bg + fg                                   |
| Pending         | Amber soft                                               |
| Cancelled       | Ink 700 bg, Ink 300 fg, strikethrough label              |
| Completed       | Mint soft + leading Check icon                           |
| AI Generated    | `gradient.iris.soft` bg + Iris 400 fg + leading Sparkles |
| Important       | Coral soft                                               |
| Exam Hint       | Amber 400 outline + Amber fg + leading Highlighter icon  |
| Keyword         | Ink 800 outline chip, dark fg; hover fills Iris @ 12%    |
| Priority Urgent | Coral 500 solid, Ink 0 fg, uppercase                     |
| Priority High   | Coral soft                                               |
| Priority Medium | Amber soft                                               |
| Priority Low    | Sky soft                                                 |
| Meeting         | Teal soft + leading Video                                |
| Lecture         | Fuchsia soft + leading GraduationCap                     |
| Task            | Lime soft + leading ListChecks                           |
| Counter (dot)   | 8×8 Iris 500 circle, absolute top‑right                  |
| Numeric         | Ink 800 pill, `tnum` 11/16, min‑width 20                 |

---

## 15. Modals

- Scrim: `surface.overlay`, backdrop blur 8.
- Container: `surface.raised`, radius `xl`, `elev.xl`, max‑width per size (§5).
- Structure: header (title h3, close ghost icon) → body (padding `8`) → footer (right‑aligned actions, `4` gap).
- Enter: 200ms scale from 0.96 + fade. Exit: 150ms.
- Focus trapped; ESC closes unless `dismissible: false`.
- Only one modal at a time; opening a second replaces the first.

**Variants**

| Modal           | Behavior                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- |
| Confirmation    | Icon (status), title, body, Cancel + Primary                                                |
| Delete          | Coral icon, danger‑worded body, Cancel + Danger; type‑to‑confirm for cascades               |
| AI Result       | Full‑width scroll, Sparkles header, tabbed (Summary / Actions / Q&A), Copy/Export in footer |
| Meeting Details | Header cover strip Teal, tabs (Overview / Transcript / Highlights / Attendees)              |
| Lecture Details | Same shape, Fuchsia cover                                                                   |
| Export          | Format grid (PDF/DOCX/MD/CSV/ICS/JSON) with export tokens, options, Export CTA              |
| Profile         | Avatar upload, form, right‑pane preview                                                     |
| Settings        | Left sub‑nav + right pane; `2xl` size                                                       |

---

## 16. Drawers & Sheets

- Side: right by default; slides in 240ms cubic‑bezier(.2,.8,.2,1).
- Surface: `surface.raised`, left border `border.subtle`, radius `xl` on inner corners.
- Widths per §5. Includes header w/ title + close, scrollable body, sticky footer for actions.
- Mobile: converts to bottom sheet with 24 top radius, drag handle.

**Variants**

| Drawer              | Contents                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Meeting drawer      | Live/past meeting details, transcript preview, quick actions                              |
| Lecture drawer      | Lecture metadata, slide thumbs, highlights                                                |
| Task drawer         | Task edit form, subtasks, activity log                                                    |
| Notification drawer | Grouped by day; unread section at top; "Mark all read" ghost                              |
| AI Assistant drawer | Persistent conversation, model picker, context chip (current page), suggested prompts row |

---

## 17. Empty, Loading, Error, Success States

### 17.1 Loading (skeletons)

- Base: `bg.subtle` with animated `gradient.divider` sweep, 1.4s ease‑in‑out, `prefers-reduced-motion` disables shimmer.
- Radius matches the real element; never round skeletons that will render as pills.

| Skeleton   | Shape                                                        |
| ---------- | ------------------------------------------------------------ |
| Card       | Header bar 60% width + 3 lines 100/80/60% + footer chip      |
| Table      | 6 rows, header slightly darker, cell blocks staggered widths |
| Chart      | Axis grid + rising bars/points with 60% opacity              |
| Transcript | Alternating speaker chips + 2–4 line paragraphs              |
| Timeline   | Time gutter + node + 2 line body, repeat 5                   |
| Dashboard  | 4 stat cards + 2 chart cards + activity list                 |

### 17.2 Empty states

Layout: centered, max‑width 480. Illustration (line‑art, single Iris accent) 96–128, title h4, body `body.md text.secondary`, primary action.

| Case              | Title                       | Primary action          |
| ----------------- | --------------------------- | ----------------------- |
| No Meetings       | "No meetings yet"           | "Schedule a meeting"    |
| No Lectures       | "Your library is empty"     | "Upload a lecture"      |
| No Tasks          | "You're all caught up"      | "New task"              |
| No Reports        | "No reports generated"      | "Generate report"       |
| No Flashcards     | "No flashcards"             | "Generate with AI"      |
| No Questions      | "No quiz questions"         | "Generate quiz"         |
| No Search Results | "Nothing matches ‘{query}’" | "Clear filters"         |
| No Notifications  | "You’re inbox‑zero"         | "Notification settings" |

### 17.3 Error states

| Code / Case      | Visual                                                                          |
| ---------------- | ------------------------------------------------------------------------------- |
| 404              | Large `display.md` "404", body, Home + Search actions                           |
| 403              | ShieldOff icon, "You don't have access", Request access secondary               |
| 500              | Wave illustration, "Something broke on our side", Retry + Status link           |
| Offline          | WifiOff icon, "You're offline", auto‑retry countdown                            |
| Server Error     | Same as 500, includes copy‑error‑id ghost                                       |
| Upload Failed    | Inline in dropzone: Coral border, error text, Retry ghost                       |
| AI Failed        | Inline in AI card: Iris → Coral border, "MeetMind couldn't respond", Regenerate |
| Microphone Error | MicOff icon, permission instructions, Open settings link                        |
| Recording Error  | Radio Coral, "Recording stopped unexpectedly", Recover last chunk               |

All errors log via a hidden Copy Error ID for support.

### 17.4 Success states

Toast (top‑right, glass, `elev.float`, 4s auto‑dismiss) or inline check block. Never a full‑page success — return the user to context.

| Case           | Message                                 |
| -------------- | --------------------------------------- |
| Upload Success | "Uploaded {filename}" + View action     |
| Export Success | "Export ready" + Download               |
| Meeting Saved  | "Meeting saved to {workspace}"          |
| Lecture Saved  | "Lecture added to {course}"             |
| Task Created   | "Task added" + Open                     |
| AI Generated   | "MeetMind generated {n} items" + Review |

---

## 18. Navigation

**Sidebar (primary nav)**

- Width 264 expanded / 64 collapsed / 320 floating.
- Sections: Workspace switcher (top), Nav groups (Overview, Meetings, Lectures, Tasks, Analytics), Pinned items, Bottom row (Help, Settings, Profile).
- Item: 36 tall, radius `md`, icon 20, sidebar font; active = `state.selected` + 2px Iris left rule + `text.brand`.
- Group label: `label` font, `text.tertiary`, padding‑x `4`, margin‑top `4`.
- Floating variant: detaches on hover in collapsed mode, `surface.glass`, `elev.float`.

**Topbar**

- Height 56, sticky, glass.
- Left: breadcrumbs. Center: global search (⌘K trigger). Right: AI Assistant toggle, Notifications, Avatar menu.

**Breadcrumbs**

- `body.sm text.secondary`; separator ChevronRight 14; last item `text.primary`.

**Command Palette (⌘K)**

- Center‑top, 640 wide, glass, `elev.float`.
- Input h `lg`, no border. Result groups: Navigate, Actions, Recent, AI. Keyboard hints (↑↓, ↵, Esc) in footer.

**Quick Navigation**

- Contextual chips below topbar for current section (e.g., filters on Meetings list).

---

## 19. Dashboard Widgets

| Widget               | Rules                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| Statistic card       | See §12. Delta uses Mint/Coral chip w/ arrow.                              |
| Charts               | See §20.                                                                   |
| Recent activity      | List of avatar + subject + verb + object + timestamp; group by day.        |
| AI Insights          | AI card variant; up to 3 insight rows w/ confidence chip; "See all" ghost. |
| Meeting overview     | Horizontal scroll of meeting cards with left rule Teal.                    |
| Lecture overview     | Same, Fuchsia.                                                             |
| Upcoming meetings    | Vertical stack, 5 max; time chip left, title right.                        |
| Upcoming lectures    | Same.                                                                      |
| Notifications widget | Latest 5, click opens drawer.                                              |
| Tasks widget         | 5 tasks; drag‑handle left; priority chip; complete on checkbox.            |
| Calendar widget      | Week strip; today = Iris pill; events as colored dots by entity color.     |

---

## 20. Charts

**Global rules**

- Font: Inter tabular, 12/16 axes, 13/20 tooltip.
- Grid: horizontal only, `chart.grid`, 1px, 4px dash 4px gap on subtle. No vertical grid unless time series with irregular ticks.
- Axes labels: `text.tertiary`. Titles: `h5`.
- Legend: chips, 12/16, always top‑right for cards / bottom for full‑page.
- Tooltips: `surface.tooltip`, radius `md`, `elev.tooltip`, 12/16.
- Empty chart: 40% height, dashed baseline, "No data yet".
- Animation: draw‑in 320ms `ease-out-quart`; bars grow from axis; lines stroke‑dashoffset; pies sweep clockwise.

**Chart‑specific**

| Chart             | Notes                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Bar               | Corner radius 4 top only; group gap 8; series gap 4                   |
| Line              | Stroke 2, points 4 on hover only, smooth cubic                        |
| Area              | Line + gradient fill from color 40% → 0%                              |
| Pie / Donut       | Donut inner 60%; center label uses stat tokens                        |
| Radar             | `chart.cat.*`, axis at 20% opacity, filled polygon at 20% opacity     |
| Heatmap           | `chart.heat`, cell radius `xs`, 2px gap, tooltip shows exact value    |
| Timeline chart    | Horizontal bands per entity, entity color; today marker vertical Iris |
| Speaker analytics | Stacked bar per meeting; speaker slots use `transcript.speaker.*`     |
| Topic analytics   | Bubble chart; radius by frequency; color by category                  |
| Attendance        | Line + confidence band; band = line color @ 12%                       |
| AI analytics      | Composite: bar (usage) + line (accuracy); AI‑branded gradient stroke  |

---

## 21. Motion System

**Library:** Framer Motion. All timings in ms; easings named.

**Easings**

| Name          | Curve                     | Use                 |
| ------------- | ------------------------- | ------------------- |
| `standard`    | cubic‑bezier(.2,.8,.2,1)  | Most UI transitions |
| `entrance`    | cubic‑bezier(.16,1,.3,1)  | Enter               |
| `exit`        | cubic‑bezier(.4,0,1,1)    | Exit                |
| `spring.soft` | stiffness 220, damping 26 | Drawer, sheets      |
| `spring.snap` | stiffness 380, damping 30 | Toggles, chips      |

**Durations**

| Token  | ms  | Use                    |
| ------ | --- | ---------------------- |
| `xxs`  | 80  | Hover color change     |
| `xs`   | 120 | Button press           |
| `sm`   | 160 | Tooltip, small popover |
| `md`   | 200 | Modal, card expand     |
| `lg`   | 240 | Drawer, sidebar        |
| `xl`   | 320 | Chart draw‑in          |
| `page` | 260 | Route transition       |

**Motion recipes**

| Recipe               | Enter                                                                     | Exit                             |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Page transition      | opacity 0→1 + translateY 8→0, `md/entrance`, staggerChildren 20ms         | opacity 1→0 fast                 |
| Modal                | scale .96→1 + opacity, `md/entrance`                                      | scale 1→.98 + opacity, `xs/exit` |
| Drawer               | translateX 100%→0, `lg/spring.soft`                                       | reverse                          |
| Sheet (mobile)       | translateY 100%→0, `lg/spring.soft`                                       | reverse                          |
| Card hover           | translateY 0→‑1 + shadow, `xxs/standard`                                  | reverse                          |
| Card expand          | height auto tween + content fade, `md`                                    | reverse                          |
| Sidebar collapse     | width 264↔64, `lg/spring.soft`; labels fade 80ms                          | —                                |
| Search focus         | scale .98→1 + ring pulse, `sm/entrance`                                   | —                                |
| Notification enter   | translateX 24→0 + opacity, `sm/spring.snap`                               | translateX 24 + fade             |
| Button press         | scale 1→.97, `xs`                                                         | —                                |
| Floating element     | y ‑0.5→0.5 loop 4s, `standard`, hover pauses                              | —                                |
| Chart draw           | see §20                                                                   | —                                |
| AI typing            | 3 Iris dots, bounce 240ms stagger 80ms, loop                              | fades on message land            |
| Transcript highlight | background Iris @ 32% pulse 600ms then settle to 12%                      | —                                |
| Timeline scroll      | nodes fade + scale .9→1 as they enter viewport, IntersectionObserver      | —                                |
| Mind map             | nodes spring in from parent (`spring.snap`), edges stroke‑dash draw 240ms | —                                |

**Motion rules**

- Respect `prefers-reduced-motion`: replace transforms with 80ms fades; disable loops.
- Never animate more than 3 properties at once.
- Never animate `box-shadow` alone above `md` size — use a pseudo‑element with opacity.
- Motion never blocks input; interactive targets remain hittable during animation.

---

## 22. Accessibility

- Keyboard: every interactive control reachable via Tab; visible focus (`state.focus.ring`); Esc closes any overlay; Arrow keys navigate menus/tables; `/` focuses global search; `⌘K` opens palette.
- ARIA: use native elements first; provide `aria-label` on icon‑only controls; live regions for notifications (`polite`) and AI streaming (`polite`), errors (`assertive`).
- Contrast: `text.primary` on `bg.base` ≥ 7:1 (AAA); `text.secondary` ≥ 4.5:1; UI borders/icons ≥ 3:1.
- Focus ring token is mandatory. Never `outline: none` without a replacement.
- Reduced motion: honored across all motion recipes.
- Screen reader: sidebar landmarks (`nav`, `main`, `complementary`); table headers with `scope="col"`; charts include a `role="img"` with descriptive summary and a "View data" alternative table.
- Color is never the only signal — always pair with icon, text, or shape.
- Target size: minimum 44×44 for primary mobile actions.
- Language: `<html lang>` set; content translatable; no baked text in images.

---

## 23. Theme System

- Default: **Dark**.
- Options: `dark`, `light`, `system` (follows OS), `auto` (time‑based with user override).
- Theme toggle stored per‑user; SSR‑safe (no flash of wrong theme) via inline script that sets `data-theme` before hydration.
- Every token in §3 exists in both themes; components consume tokens, never raw values.
- High‑contrast variant (`dark-hc`, `light-hc`) increases border and text steps by one stop and disables glass tints.
- Reduced‑transparency variant swaps glass surfaces to their solid equivalents at 96% opacity.

---

## 24. Responsive Rules

| Component        | Behavior across breakpoints                                                           |
| ---------------- | ------------------------------------------------------------------------------------- |
| Sidebar          | `xl+`: expanded 264. `lg`: collapsed 64 w/ hover‑float. `<md`: hidden, opens as sheet |
| Topbar           | Search collapses to icon at `md`; breadcrumbs truncate with ellipsis                  |
| Cards            | 4‑col grid `xl` → 3 `lg` → 2 `md` → 1 `<md`                                           |
| Tables           | Below `md`: switch to stacked card list per row; keep column labels as inline meta    |
| Charts           | Height 320 desktop → 240 tablet → 200 mobile; legend moves below                      |
| Transcript       | 2‑column (speaker+body) desktop → single column mobile; timestamps float above        |
| Timeline         | Horizontal on desktop, vertical on mobile                                             |
| Modals           | Center desktop → full‑screen sheet under `md`                                         |
| Drawer           | Right side desktop → bottom sheet under `md`                                          |
| Command palette  | 640 wide desktop → full width under `md`, top offset 16                               |
| Ultra‑wide (3xl) | Increase container to 1600; add optional right‑rail widgets                           |

---

## 25. Content & UI Consistency Rules

- Sentence case for everything except `label` and single‑word badges.
- Dates: `MMM D, YYYY` (localized); relative under 24h ("2h ago"); tabular digits in tables.
- Time: 24h in EU/edu contexts, 12h in US — user setting.
- Numbers: thousands separator per locale; `tnum`; percentages one decimal max.
- Truncation: 1‑line ellipsis on titles > column; tooltip reveals full.
- Never mix icon styles (filled + line) in one view.
- Never nest more than 2 modal layers.
- Every destructive action is undoable OR requires typed confirmation.
- AI‑generated content is always labeled with a Sparkles badge + timestamp + model chip.
- Loading > 400ms shows a skeleton; > 4s shows progress; > 15s offers cancel.

---

## 26. Best Practices for Implementers

1. Only consume **semantic tokens** (`text.primary`, `surface.card`, …). Never reach into palette steps directly.
2. Compose components from primitives (Button, Input, Card). Do not restyle primitives ad‑hoc.
3. New color? Add a token first, then use it. If the token doesn't earn a name, don't add it.
4. New motion? Reuse a recipe. Custom motion requires design review.
5. New icon meaning? Extend §9 mapping so meanings stay unique.
6. Ship dark and light in the same PR. A component isn't done until both themes pass contrast.
7. Verify with keyboard only before merging. If you can't complete the flow, neither can a user.
8. Density and reduced‑motion are not features — they are baseline requirements.

---

_End of MeetMind AI Design System v1.0._
