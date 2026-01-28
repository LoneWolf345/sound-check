

# Rename Site to "Sound Check"

## Overview
Update all instances of "Soundcheck" to "Sound Check" (with a space) across the application for consistent branding.

---

## Files to Update

| File | Location | Change |
|------|----------|--------|
| `index.html` | Title tag | `Soundcheck` → `Sound Check` |
| `index.html` | og:title meta tag | `Soundcheck` → `Sound Check` |
| `src/components/layout/AppLayout.tsx` | Header logo text | `Soundcheck` → `Sound Check` |
| `supabase/functions/send-completion-email/index.ts` | Email footer text | `Soundcheck` → `Sound Check` |
| `supabase/functions/send-completion-email/index.ts` | Email "from" address | `Soundcheck <noreply@...>` → `Sound Check <noreply@...>` |
| `src/types/index.ts` | Comment header | `Soundcheck` → `Sound Check` |

---

## Notes

- The internal password in `use-auth.ts` contains "soundcheck" but this is a technical identifier, not user-facing branding, so it will remain unchanged
- All user-visible text will be updated to show "Sound Check"

