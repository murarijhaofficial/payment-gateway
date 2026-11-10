# Merchant dashboard responsive behavior

The merchant dashboard is designed for the following layout ranges:

| Viewport         | Intended behavior                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Above 1100 px    | Persistent 252 px sidebar, three metric cards, and two integration cards in one row.                        |
| 761–1100 px      | Compact 220 px sidebar; integration cards stack to prevent a horizontal overflow.                           |
| 481–760 px       | Sidebar becomes a header with horizontally scrollable, touch-sized navigation; all dashboard cards stack.   |
| 480 px and below | Header labels truncate safely, action/status rows stack, and the refresh control fills the available width. |

Keyboard focus remains visible, the skip link continues to target the main content, and reduced-motion preferences suppress non-essential motion. The dashboard uses no horizontal page scrolling at these ranges.

On mobile, the navigation behavior is a hamburger button that expands a vertical, touch-sized menu. It supports `aria-expanded`, closes on Escape, and restores focus to the trigger after Escape.
