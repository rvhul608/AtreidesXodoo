# UI Study Sheet — Brightloop Subscription Management System

> Study guide for the Q&A round (Odoo x Make-A-Ton 9.0). Sources: `03-UI.md` (brief) and
> `brightloop-ui-theme.md` (design system). Skim the one-liners, drill the long answers.

---

## 1. Project context (your opener)

- Hackathon: **Odoo x Make-A-Ton 9.0**, virtual round.
- Product: **Subscription Management System** for fictional **Brightloop Software**.
- Frontend owns `frontend/`; backend agents build the API in parallel.
- **Judges grade: UI, UX, frontend quality, live behaviour.**

One-liner: *"I built the React frontend for Brightloop's subscription management system — real API data, live updates over SSE, three role-based portals, and a loop-themed design system."*

---

## 2. Stack and architecture

| Decision | Answer |
|---|---|
| Framework | **React + Vite + TypeScript** |
| Styling | Plain CSS / Tailwind or a small component library |
| Real-time | **Server-Sent Events (`EventSource`)** from the backend |
| Fonts / Icons | Self-hosted or system fonts (no CDN-only, must work offline); **Lucide** icons, 20px, 1.75 stroke |
| Charts | One colour (`--loop`) + `--border` gridlines; status colours only when the chart is *about* status |

**Mock strategy (key talking point):**
- Backend is built in parallel, so until endpoints exist we build against a **mock layer (e.g. MSW)** whose data matches `docs/api-contract.md` **exactly**.
- Every API call goes through **one API client module** → switching a mock off is a **one-line change per endpoint**.
- `docs/api-contract.md` is the **single source of truth**. Never invent endpoints.
- If a contract shape blocks us: tell the human + Lead Codex. **Never edit backend folders.**

---

## 3. The five hard rules (memorize these)

1. **Real data only** — every list/dashboard comes from the API; no hard-coded JSON; mock switched off before the end.
2. **Live updates visible** — dashboard counters, invoice list, Ops Monitor update **without a page refresh**; handle disconnects and reconnects gracefully.
3. **Performance** — **paginate and filter server-side**; loading skeletons; responsive at **10,000+ rows**.
4. **Client security** — tokens **never in localStorage** (auth = **httpOnly cookie**); hide actions the role can't use, but the **backend enforces permissions**; customers see **only their own data**.
5. **No unfinished features** — remove dead buttons and placeholder screens; never claim what doesn't work.

---

## 4. Roles and portals

**Three experiences from one login**, with route guards per role:

- **Admin** — everything: staff creation, discount rules, admin-only settings.
- **Staff** — day-to-day: customers, subscriptions, invoices, payments. No admin settings.
- **Customer** — portal: only *their own* subscriptions and invoices + plan-permitted actions (pause, renew, close).

---

## 5. Screens

### Phase 1 — core (functional first, simple but clean)
1. **Auth** — signup with **live password checklist** (>8 chars, uppercase, lowercase, special), login, forgot/reset; clear validation + server errors.
2. **Layout** — sidebar by role, top bar with user menu, notification area for live events, page headers + breadcrumbs.
3. **Catalog (admin/staff)** — products table + form with variants (brand "Odoo" adds **+560**), taxes.
4. **Plans & templates** — plan form (period, min quantity, availability dates, flags: auto-close, early close, pause, renew); quotation template builder (plan + lines, validity days).
5. **Subscriptions** — status chips + filters, create from template, detail page with lines, **status timeline**: Draft → Quotation → Confirmed → Active → Closed (only transitions the plan allows).
6. **Invoices** — chips (Draft, Confirmed, Paid, Overdue badge), detail with lines/taxes/discounts/totals; actions: confirm, cancel, send, **print view** (clean print stylesheet).
7. **Payments** — record dialog (method, amount, date, note), payments per invoice, outstanding balance.
8. **Finance dashboard** — active subs, revenue, outstanding, overdue, payments; filters (date range, customer, status); summary cards + charts; **live-updating**.
9. **Customer portal** — my subscriptions, my invoices, allowed actions only.
10. **Admin** — staff management, discount rules (fixed/percent, minimums, dates, usage limit, scope), **outbox viewer** (sent reset links and invoices).

### Phase 2 — extras (build only once the backend exists)
- **Explain this amount** — drawer on an invoice line: every rule, applied or skipped, why, and the numbers.
- **Billing Time Machine** — pick a future date, simulate; projected invoices, renewals, expirations, discounts; labelled **"simulation, no data changed."**
- **Revenue Leakage dashboard** — missed billings, duplicates, wrong discounts, unreconciled payments, amount at risk; CSV bank-statement upload with match review; one-click recovery with confirmations.
- **Billing Ops Monitor** — live billing runs, throughput, failures, retries, run preview (what would be created or skipped and why).
- **Renewal queue** and **overdue chase list** with reminder stages.
- **MRR/ARR** view with trend chart + next-30-days forecast.

### Phase 3 — best UI/UX
Shared design system (tokens, typography, spacing, buttons, inputs, tables, chips, dialogs, toasts); **empty, loading and error states everywhere**; responsive layouts; keyboard + accessibility basics (labels, focus states, contrast); light/dark optional; consistent number, currency and date formatting; fewer clicks on the demo path.
**Priority screens (they carry the demo):** finance dashboard, invoice explain view, Time Machine, leakage dashboard, live Ops Monitor, customer portal.

---

## 6. Git rules (they WILL ask about commits)

- Branch: `ui/<topic>` (e.g. `ui/design-system`, `ui/dashboard`). Own GitHub identity — verify `git config user.name` / `user.email` before first commit.
- **Never:** `--author`, global config, committing for someone else, force-push, rewriting pushed history, `--no-verify`.
- Small commits after each finished piece. Format: **`type(scope): imperative summary`** (15–72 chars).
  - Types: `feat fix refactor test docs perf chore ui`.
  - **Banned:** "update", "fix", "wip", "changes", "misc", "final".
  - Example: `ui(invoices): add explain-amount drawer with rule trace`.
- 1–3 line body for anything non-obvious.
- `git pull --rebase origin main` before pushing; app must build.
- **Merge to `main` at least once per hour** via PR, reviewed by Lead Codex, using **"Rebase and merge"** (keeps authorship).
- Write `docs/walkthroughs/frontend.md`: structure, state management, how live updates work, design decisions.

Be ready to walk through **one specific commit**: what, why, scope, body, and how it was PR-merged.

---

## 7. Design system — "the Loop"

### 7.1 Core idea
- A subscription business earns money **in cycles**, so the UI is built around **the loop**: the repeating renewal period.
- **Signature element: the renewal ring** — thin circular progress showing how far a subscription is through its billing period ("18 of 30 days"). Appears on subscription cards, the customer portal and the chatbot launcher. *The one memorable thing; everything else stays quiet.*
- Personality: **calm, exact, trustworthy** (money product → readable numbers, unmistakable statuses).
- Feel: cool paper-white surfaces, deep navy ink, one confident blue, status colours **for meaning only**.

### 7.2 Colour tokens (light theme)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F6F8FB` | page background |
| `--surface` | `#FFFFFF` | cards, tables, panels |
| `--surface-2` | `#EEF2F8` | table header, hover rows |
| `--border` | `#DCE3EE` | dividers, input borders |
| `--ink` | `#14213D` | primary text |
| `--ink-muted` | `#5B6785` | secondary text |
| `--loop` | `#2F5BEA` | primary buttons, links, active nav, ring |
| `--loop-strong` | `#1E3FA8` | hover states |
| `--loop-tint` | `#E3EBFF` | selected row, chat customer bubbles |

**Status colours — always with a text label, never colour alone:**

| Meaning | Pill bg / text | Statuses |
|---|---|---|
| Neutral | `#E8ECF2` / `#4A5568` | Draft, Closed |
| In progress | `#E3EBFF` / `#1E3FA8` | Quotation, Confirmed (invoice) |
| Good | `#DDF4EA` / `#0F6B4E` | Active, Paid |
| Warning | `#FFF1D6` / `#8A5200` | Due soon, Paused, Expiring discount |
| Danger | `#FBE3E3` / `#A12A2A` | Overdue, Failed payment, Cancelled |

- **Dark theme:** same token names, darker values; applied via `@media (prefers-color-scheme: dark)` unless `data-theme="light"` is set.
- **Radii:** controls 6px · cards 10px · panels/modals 16px · pills 999px.

### 7.3 Typography

- Typeface: **Manrope** (400, 500, 600, 700); fallback `system-ui, -apple-system, "Segoe UI", sans-serif`.
- Sentence case everywhere; no all-caps labels; body ≥ 14px; line length < 75 chars.
- **Numbers: `font-variant-numeric: tabular-nums`** on prices, totals, quantities, dates → columns line up.
- **Money columns right-aligned**; text left-aligned. Currency = symbol + two decimals, e.g. `₹1,560.00`.
- Scale: page title 28/36 w700 · section heading 20/28 w600 · card title 16/24 w600 · body 15/24 w400 · table 14/20 · caption 13/18 w500 muted · big dashboard number 32/40 w700 tabular.

### 7.4 Layout

- Spacing scale **(px): 4, 8, 12, 16, 24, 32, 48**. Page max width **1280px**. 12-column grid desktop, single column mobile. Works down to **360px** (tables become stacked cards).
- **Admin dashboard:** KPI strip first (Active subs, Revenue month, Outstanding, Overdue). Danger colour only on the number's pill, **not the whole card**. One summary chart + one worklist. No decorative charts.
- **Staff worklist:** tabs (Subscriptions / Invoices / Payments / Tickets) + search + status filter. Row actions on the right: Confirm, Send, Print, Record payment. **Disable (not hide)** disallowed actions, with a tooltip explaining why. Sidebar entry "Support content" → chatbot knowledge base editor.
- **Customer portal:** subscription card with ring + status pill + renews date + price; self-service buttons **only if plan flags allow**; recent invoices with Download/Pay now; no jargon, only own data.

### 7.5 Components

- **Buttons:**
  - Primary: `--loop` bg, white text, 6px radius, 40px height, 16px horizontal padding. **One primary per view.**
  - Secondary: white surface, `--border` outline, `--ink` text.
  - Destructive: danger colours + **confirmation dialog**.
  - Labels = exact action verb ("Record payment", "Send invoice"); the toast reuses the verb ("Payment recorded").
- **Status pill:** rounded, 12px text w600, 4×10px padding, 6px dot in the text colour before the label.
- **Tables:** header on `--surface-2`, sticky on scroll; row height 48px; 1px `--border` dividers; tabular numbers; **server-side pagination (25 rows)** so pages stay under 2s with thousands of rows; actionable empty states ("No subscriptions yet. Create one from a quotation template.").
- **Forms:** labels above inputs, helper text below, errors in danger colour with an icon **and a fix**; password field shows the live rule checklist.
- **Renewal ring:** 44px SVG circle, 4px stroke; track = `--border`, progress = `--loop`; turns **warn** under 5 days, **danger** when overdue; centre text = days remaining; draws in **once** on first view; respects `prefers-reduced-motion`.
- **Toasts:** bottom-left, 4 seconds, state what changed ("Invoice INV-1051 sent to Acme Ltd").

### 7.6 Motion and accessibility

- Motion only to **respond to actions** (row updating after payment, panel opening) — never decoration. 150–200ms, ease-out.
- Visible **2px focus ring** in `--loop`, 2px offset, on every interactive element.
- **Contrast ≥ 4.5:1** for text; status colours always have a text label.
- Touch targets ≥ **44px** on mobile; works to 360px width.
- `prefers-reduced-motion` turns off the ring animation and chat transitions.

### 7.7 Chatbot UI (support assistant)

Concept: answers customers from **content staff maintain**; feels part of the portal, not a pasted-on widget.

- **Launcher:** 56px circle, bottom-right, 24px from edges, `--loop` bg, white loop mark; first-visit tooltip; unread dot in danger colour.
- **Panel:** desktop 380px × 560px, 16px radius, panel shadow, anchored above launcher; mobile = full-screen sheet with back arrow. Header: "Answers come from our support articles." Footer: input + send + persistent **"Talk to a person"** link.
- **Messages:**
  - Customer bubble: right, `--loop-tint` bg, 12px radius with a 4px corner toward the sender.
  - Bot bubble: left, `--surface-2` bg. Max width 85%, body 15px.
  - **Source chip** under each bot answer ("Source: Seat changes") — click expands the article → shows the answer is **grounded**.
  - **Thumbs helpful / not helpful**; "not helpful" opens an optional one-line reason.
  - Typing state: three dots, then **streams the answer word by word**.
- **Special cards:**
  - *Account-aware card*: read-only own data (e.g. invoice with View / Pay now), same status pill as portal.
  - *Confirmation card*: **the bot never performs an action without explicit confirmation**, and only if the plan allows it.
  - *Escalation card*: "I can't answer this from our support articles" → create a ticket ("Ticket SUP-088 created. Our team will reply by email.").
- **Copy rules:** plain verbs, sentence case, no filler, no emoji in system messages. The bot states what it can and can't do. Errors explain the problem + next step and **never apologise**:
  - No answer: "That isn't covered in our support articles. You can create a ticket and our team will reply."
  - Network error: "Message not sent. Check your connection and try again." + Retry.
  - Rate limit: "You're sending messages quickly. Wait a few seconds and try again."
  - **Never show internal fields** (cost price, staff notes).
- **Staff side:**
  - Support content editor: article list (title, category, status, updated, "used by bot" count); article form (title, category, body, active toggle).
  - **Bot settings:** one "Instructions" textarea (tone and rules) + on/off switch.
  - Live **Test the bot** panel beside the editor (ask a question, see answer + source chip before publishing).
  - **Unanswered questions list** — the feedback loop: questions the bot couldn't answer, with ask counts and a **"Write article"** button that prefills the editor.
  - Admin card: chats this week, % answered without a person, tickets created from chat.

### 7.8 Do / Don't (quick-fire answers)

**Do:** pills with text; tabular numbers; right-aligned money; one primary button per screen; show the source of every chat answer; disable unavailable actions with an explanation.

**Don't:** gradients, glassmorphism, a different radius on every element; colouring whole cards red/green (colour the pill); scroll animations or hover effects on every card; chatbot actions without a confirmation card.

---

## 8. Definition of done

Each screen:
- matches the contract,
- works for **each role** it's meant for,
- handles **loading, empty and error states**,
- has **no hard-coded data**,
- is merged to `main`.

Final check: the full demo flow runs against the real backend **from a clean clone**.

---

## 9. Demo flow (know the sequence cold)

1. Sign up and log in as admin, staff, and customer.
2. Admin creates a product with the Odoo variant (+560), a plan and a discount.
3. Staff creates a subscription from a template and activates it.
4. Run billing → invoice shows tax and discount → open **"Explain this amount"** → run billing again with **zero duplicates**.
5. Record a payment → invoice flips to Paid → **dashboard updates live**.
6. Leakage dashboard and the Time Machine.
7. Dashboard filters fast on **10,000 subscriptions**; live Ops Monitor.
8. Customer portal shows **only that customer's data**.

---

## 10. Rapid-fire Q&A drill

**Q: Why SSE instead of WebSockets?**
A: We only need server → client one-way events that the UI displays; SSE is simpler, auto-reconnects, works over plain HTTP — no socket library or sticky sessions needed.

**Q: The backend isn't ready — what do you build against?**
A: A mock layer (MSW / fake API module) whose data matches `docs/api-contract.md` exactly; all calls go through one API client module, so going live is a one-line change per endpoint.

**Q: The contract looks wrong. What do you do?**
A: Raise it with the human and Lead Codex; never edit backend folders or invent endpoints.

**Q: How does it handle 10,000 rows?**
A: Server-side pagination (25 rows/page) and filters — the DB does the filtering; loading skeletons keep it feeling fast; pages stay under 2s.

**Q: Where are auth tokens stored?**
A: Never localStorage — httpOnly cookie. The client hides actions the role can't use, but the backend is the real permission enforcer.

**Q: How does the customer portal enforce privacy?**
A: Same login system, but portal views are scoped server-side to the customer's own subscriptions and invoices; route guards by role keep them out of staff/admin screens.

**Q: What's your signature UI element and why?**
A: The renewal ring — a 44px circular progress of the billing period on subscription cards, the portal and the chat launcher. It's the visual metaphor for the product: a business that runs in loops.

**Q: How is `--loop` used across the app?**
A: Primary buttons, links, active nav, the renewal ring, charts, chat launcher, focus rings — one confident accent colour; status colours are reserved strictly for meaning.

**Q: What makes the chatbot trustworthy?**
A: Source chips under every answer (grounded in staff-maintained articles), confirmation cards before any action, escalation to tickets when unsure, and never exposing internal fields.

**Q: What happens when the bot can't answer?**
A: Escalation card → "I can't answer this from our support articles" → create a support ticket. The unanswered question also lands in staff's Unanswered questions list with ask counts, so staff write an article (a "Write article" button prefills the editor).

**Q: How does staff restrict what customers can do in the portal?**
A: Self-service buttons (Pause / Close / Renew) render only when the plan's flags allow them; the backend re-checks every action.

**Q: Status chips: why always a text label?**
A: Accessibility — never rely on colour alone (contrast/colour-blindness); the pill has a dot + label and ≥ 4.5:1 contrast.

**Q: One primary button per view — why?**
A: Clear hierarchy; the eye knows the main action of the screen. Everything else is secondary (outline) or destructive (confirm dialog).

**Q: What does "Explain this amount" do?**
A: A drawer on an invoice line that traces every pricing rule: applied or skipped, why, and the numbers — transparency for finance staff.

**Q: Time Machine safety?**
A: It's a simulation — pick a future date, see projected invoices/renewals/expirations, explicitly labelled "simulation, no data changed."

**Q: Walk me through a commit you made.**
A: Prepare one beforehand, e.g. `ui(invoices): add explain-amount drawer with rule trace` — what/why, the body, how it was rebased on main and PR-merged ("Rebase and merge" to keep authorship).

---

## 11. Night-before checklist

- [ ] Five hard rules recited without notes
- [ ] Three roles + what each can/can't do
- [ ] Subscription status timeline: Draft → Quotation → Confirmed → Active → Closed
- [ ] Password rules: >8 chars, uppercase, lowercase, special
- [ ] Hexes: `--loop #2F5BEA`, `--ink #14213D`, `--bg #F6F8FB`, badge pairs (good/warn/danger)
- [ ] Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48; page 1280px; tables 25/server-side; row 48px
- [ ] Manrope; tabular-nums; right-aligned money; `₹1,560.00` format
- [ ] Chatbot: source chip, confirmation card, escalation card, "never apologise"
- [ ] Live demo sequence (section 9) in order, from memory
- [ ] One real commit story ready (type(scope) format, PR rebase-merge)
- [ ] Build order: tokens → layout shell → tables and pills → forms → dashboard → customer portal → chatbot panel
