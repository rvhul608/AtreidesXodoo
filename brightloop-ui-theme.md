# Brightloop UI Theme and Chatbot Design Guide

Design system for the Subscription Management System (Odoo hackathon).
Roles covered: Admin / finance lead, Staff, Customer.

---

## 1. Design idea: "Loop"

A subscription business earns money in cycles, so the whole interface is built around **the loop**: a renewal that repeats every period.

- **Signature element:** the **renewal ring**, a thin circular progress ring showing how far a subscription is through its current billing period (for example "18 of 30 days"). It appears on subscription cards, the customer portal and the chatbot launcher. This is the one memorable thing; everything else stays quiet.
- **Personality:** calm, exact, trustworthy. This is a money product, so numbers must be easy to read and statuses must be unmistakable.
- **Feel:** cool paper-white surfaces, deep navy ink, one confident blue, and status colours used only for meaning.

Spend boldness in one place (the ring and the loop mark). Keep tables, forms and dashboards plain and fast.

---

## 2. Colour tokens

### Light theme (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F6F8FB` | Page background |
| `--surface` | `#FFFFFF` | Cards, tables, panels |
| `--surface-2` | `#EEF2F8` | Table header, hover rows, inputs on focus-less state |
| `--border` | `#DCE3EE` | Dividers, input borders |
| `--ink` | `#14213D` | Primary text, headings |
| `--ink-muted` | `#5B6785` | Secondary text, captions |
| `--loop` | `#2F5BEA` | Primary buttons, links, active nav, the renewal ring |
| `--loop-strong` | `#1E3FA8` | Button hover, link hover |
| `--loop-tint` | `#E3EBFF` | Selected row, chat customer bubble background |

### Status colours (meaning only, never decoration)

Always pair the colour with a text label. Never rely on colour alone.

| Status | Pill background | Pill text | Used for |
|---|---|---|---|
| Neutral | `#E8ECF2` | `#4A5568` | Draft, Closed |
| In progress | `#E3EBFF` | `#1E3FA8` | Quotation, Confirmed (invoice) |
| Good | `#DDF4EA` | `#0F6B4E` | Active, Paid |
| Warning | `#FFF1D6` | `#8A5200` | Due soon, Paused, Expiring discount |
| Danger | `#FBE3E3` | `#A12A2A` | Overdue, Failed payment, Cancelled |

### Dark theme (optional, same tokens)

| Token | Hex |
|---|---|
| `--bg` | `#0E1424` |
| `--surface` | `#161D33` |
| `--surface-2` | `#1E2744` |
| `--border` | `#26304D` |
| `--ink` | `#E7ECF8` |
| `--ink-muted` | `#9AA6C4` |
| `--loop` | `#6B8CFF` |
| `--loop-tint` | `#22305E` |

### CSS variables

```css
:root {
  --bg: #F6F8FB;
  --surface: #FFFFFF;
  --surface-2: #EEF2F8;
  --border: #DCE3EE;
  --ink: #14213D;
  --ink-muted: #5B6785;
  --loop: #2F5BEA;
  --loop-strong: #1E3FA8;
  --loop-tint: #E3EBFF;

  --good-bg: #DDF4EA;    --good-fg: #0F6B4E;
  --warn-bg: #FFF1D6;    --warn-fg: #8A5200;
  --bad-bg:  #FBE3E3;    --bad-fg:  #A12A2A;
  --info-bg: #E3EBFF;    --info-fg: #1E3FA8;
  --neutral-bg: #E8ECF2; --neutral-fg: #4A5568;

  --radius-control: 6px;   /* buttons, inputs */
  --radius-card: 10px;     /* cards, tables */
  --radius-panel: 16px;    /* chat panel, modals */
  --radius-pill: 999px;    /* status pills, chips */

  --shadow-card: 0 1px 2px rgba(20, 33, 61, 0.06);
  --shadow-panel: 0 12px 32px rgba(20, 33, 61, 0.18);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0E1424;
    --surface: #161D33;
    --surface-2: #1E2744;
    --border: #26304D;
    --ink: #E7ECF8;
    --ink-muted: #9AA6C4;
    --loop: #6B8CFF;
    --loop-tint: #22305E;
  }
}
```

---

## 3. Typography

One family keeps the product coherent and fast to load.

- **Typeface:** Manrope (Google Fonts), weights 400, 500, 600, 700. Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.
- **Numbers:** always `font-variant-numeric: tabular-nums` on prices, invoice totals, quantities and dates so columns line up. Right-align money columns.
- **Currency:** show the symbol and two decimals, for example `₹1,560.00`.

| Role | Size / line height | Weight |
|---|---|---|
| Page title | 28 / 36 | 700 |
| Section heading | 20 / 28 | 600 |
| Card title | 16 / 24 | 600 |
| Body | 15 / 24 | 400 |
| Table text | 14 / 20 | 400 |
| Caption, helper text | 13 / 18 | 500, `--ink-muted` |
| Big dashboard number | 32 / 40 | 700, tabular |

Rules: sentence case everywhere, no all-caps labels, line length under 75 characters in prose, minimum body size 14px.

---

## 4. Layout

Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. Page max width 1280px. Use a 12-column grid on desktop, single column on mobile.

### Admin / finance lead dashboard

```
+---------------------------------------------------------------+
| Brightloop (loop mark)        search            [Admin v]     |
+-----------+---------------------------------------------------+
| Dashboard | Active subs   Revenue (month)   Outstanding   Overdue |
| Products  |   1,248         ₹8,42,000        ₹1,96,500      37    |
| Plans     +---------------------------------------------------+
| Discounts | Filters: [Date range] [Plan] [Status]   [Export]  |
| Taxes     +----------------------------+----------------------+
| Staff     | Revenue by month (chart)   | Overdue invoices     |
| Reports   |                            | (list, oldest first) |
+-----------+----------------------------+----------------------+
```

- KPI strip first: four numbers with a one-line label. Overdue uses the danger colour only on the number's pill, not the whole card.
- One summary chart and one worklist. No decorative charts.

### Staff worklist

```
+-----------+---------------------------------------------------+
| Today     | Tabs: Subscriptions | Invoices | Payments | Tickets|
| Customers +---------------------------------------------------+
| Quotes    | [Search]  [Status v]  [+ New subscription]        |
| Support   | No.      Customer     Plan     Status    Next bill|
| Content   | SUB-0412 Acme Ltd     Pro/yr   (Active)  12 Nov   |
+-----------+---------------------------------------------------+
```

- Row actions on the right: Confirm, Send, Print, Record payment. Disable (not hide) actions that the current status does not allow, with a tooltip explaining why.
- A "Support content" entry in the sidebar leads to the chatbot knowledge base editor (section 7).

### Customer portal

```
+---------------------------------------------------------------+
| Brightloop          My subscriptions  Invoices  Account  [Me] |
+---------------------------------------------------------------+
|  (ring)  Pro plan, yearly              (Active)               |
|  18/30   Renews 12 Nov   ₹12,000.00                           |
|          [Add seats] [Pause] [Close]  <- only if plan allows  |
+---------------------------------------------------------------+
| Recent invoices                                               |
| INV-1042   1 Oct   ₹12,000.00   (Paid)         [Download]     |
| INV-1051   1 Nov   ₹12,000.00   (Due 12 Nov)   [Pay now]      |
+---------------------------------------------------------------+
                                                       (chat)  <- launcher
```

- Customers see only their own data. No admin-style tables, no jargon.
- Self-service buttons appear only when the plan's flags allow them.

---

## 5. Components

### Buttons
- **Primary:** `--loop` background, white text, 6px radius, 40px height, 16px horizontal padding. One primary per view.
- **Secondary:** white surface, `--border` outline, `--ink` text.
- **Destructive:** `--bad-fg` text on `--bad-bg`; confirm with a dialog.
- Label with the exact action: "Record payment", "Send invoice", "Save plan". The success message reuses the same verb: "Payment recorded".

### Status pill
Rounded pill, 12px text weight 600, 4px 10px padding, a 6px dot in the text colour before the label. Use the status table in section 2.

### Tables
- Header row on `--surface-2`, sticky on scroll. Row height 48px, 1px `--border` dividers.
- Right-align money and quantities, left-align text. Tabular numbers.
- Server-side pagination (25 rows) and filters, so pages stay under two seconds with thousands of rows.
- Empty state says what to do: "No overdue invoices. Nice work." for finance, "No subscriptions yet. Create one from a quotation template." for staff.

### Forms
- Labels above inputs, helper text below, errors in `--bad-fg` with an icon and a fix: "Password needs an uppercase letter, a lowercase letter and a special character."
- Password field shows live checklist of the rules (more than 8 characters, upper, lower, special).

### Renewal ring
- 44px SVG circle, 4px stroke, track `--border`, progress `--loop`, turns `--warn-fg` when under 5 days remain and `--bad-fg` once overdue. Centre text: days remaining.
- One animation only: the ring draws in once on first view. Respect `prefers-reduced-motion`.

### Toasts
Bottom-left, 4 seconds, state what changed: "Invoice INV-1051 sent to Acme Ltd".

---

## 6. Motion and accessibility

- Motion is for responses to actions (a row updating after payment, a panel opening), not decoration. 150 to 200 ms, ease-out.
- Visible 2px focus ring in `--loop` with 2px offset on every interactive element.
- Minimum contrast 4.5:1 for text; status colours always have a text label.
- Touch targets at least 44px on mobile.
- Works down to 360px width. Tables become stacked cards on mobile.
- `prefers-reduced-motion` turns off the ring animation and chat transitions.

---

## 7. Chatbot UI

The chatbot is the **support assistant**: it answers customers from content that staff maintain. Its UI should feel like part of the portal, not a pasted-on widget.

### 7.1 Launcher
- 56px circle, bottom-right, 24px from the edges, `--loop` background, white loop mark inside.
- Tooltip on first visit only: "Questions about your plan or invoices? Ask here."
- Unread dot in `--bad-fg` if the bot or staff replied while closed.

### 7.2 Panel
- Desktop: 380px wide, 560px tall, 16px radius, `--shadow-panel`, anchored above the launcher.
- Mobile: full-screen sheet with a back arrow.
- Header: loop mark, "Brightloop support", a line below: "Answers come from our support articles." Close button on the right.
- Footer: input with send button, and a persistent text link: "Talk to a person".

```
+--------------------------------------+
| (o) Brightloop support          [x]  |
| Answers come from our support articles|
+--------------------------------------+
|  Hi, I can help with plans, billing  |
|  and your invoices.                  |
|                                      |
|  [What's in the Pro plan?]           |
|  [How do I close my subscription?]   |
|  [When is my next invoice?]          |
|                                      |
|              How do I add seats? (you)|
|                                      |
|  You can add seats from My           |
|  subscriptions > Add seats.          |
|  Source: Seat changes                |
|  [helpful] [not helpful]             |
+--------------------------------------+
| Ask a question...            [send]  |
| Talk to a person                     |
+--------------------------------------+
```

### 7.3 Messages
- **Customer bubble:** right aligned, `--loop-tint` background, `--ink` text, 12px radius with a 4px corner toward the sender.
- **Bot message:** left aligned, `--surface-2` background, `--ink` text, same radius rules.
- Max bubble width 85%. Body text 15px.
- **Source chip** under each bot answer: small pill with the knowledge base article title ("Source: Seat changes"). Clicking it expands the article text. This builds trust and shows judges the answer is grounded.
- **Thumbs** (helpful / not helpful) under each bot answer. A "not helpful" opens a one-line optional reason.
- **Typing state:** three dots while waiting, then stream the answer word by word so it feels fast.

### 7.4 Special cards inside the chat

**Account-aware card** (when the bot looks up the customer's own data)
```
+-----------------------------------+
| Invoice INV-1051        (Due 12 Nov)
| ₹12,000.00                         |
| [View invoice]  [Pay now]          |
+-----------------------------------+
```
Uses the same status pill as the portal. Read-only data only.

**Confirmation card** (before any action such as closing a subscription)
```
+-----------------------------------+
| Close Pro plan (yearly)?          |
| Access ends on 12 Nov.            |
| [Close subscription]  [Keep it]   |
+-----------------------------------+
```
The bot never performs an action without this explicit confirmation, and only if the plan allows it.

**Escalation card** (when the bot cannot answer or the customer asks for a person)
```
+-----------------------------------+
| I can't answer this from our      |
| support articles.                 |
| [Create a support ticket]         |
+-----------------------------------+
```
After creating a ticket: "Ticket SUP-088 created. Our team will reply by email."

### 7.5 Chatbot copy rules
- Plain verbs, sentence case, no filler, no emoji in system messages.
- The bot states what it can and cannot do. Errors explain the problem and the next step, and never apologise:
  - No answer: "That isn't covered in our support articles. You can create a ticket and our team will reply."
  - Network error: "Message not sent. Check your connection and try again." with a Retry button.
  - Rate limit: "You're sending messages quickly. Wait a few seconds and try again."
- Never show internal fields (cost price, staff notes).

### 7.6 Staff side of the chatbot

**Support content editor** (sidebar: Support content)
```
+---------------------------------------------------------------+
| Support content            [+ New article]   [Bot settings]   |
+---------------------------------------------------------------+
| Title              Category   Status    Updated     Used by bot|
| Pro plan details   Plan       (Active)  30 Oct      142 times  |
| Refund policy      Billing    (Draft)   28 Oct      0          |
+---------------------------------------------------------------+
```
- Article form: title, category, body (plain text or markdown), active toggle.
- **Bot settings:** a single "Instructions" text area (tone and rules) and an on/off switch.
- Show a live **Test the bot** panel next to the editor so staff can ask a question and see the answer and the source chip before publishing.

**Unanswered questions list** (the loop between staff and customers)
```
+---------------------------------------------------------------+
| Questions the bot couldn't answer                             |
| "Do you offer student pricing?"   3 asks   [Write article]    |
+---------------------------------------------------------------+
```
"Write article" opens the editor with the question prefilled.

**Admin view:** a small card on the dashboard with chats this week, answered without a person (percent), and tickets created from chat.

---

## 8. Alternative themes (if the team prefers a different mood)

Each keeps the same components, spacing and layouts. Only swap the tokens.

### Ledger (bookkeeping feel)
| Token | Hex |
|---|---|
| bg | `#EEF1EE` |
| surface | `#FFFFFF` |
| ink | `#12342B` |
| accent | `#1F6B57` |
| highlight | `#B8892B` |
| Typeface | Source Serif 4 for headings, Manrope for UI |

### Plum (nods to the Odoo ecosystem without copying it)
| Token | Hex |
|---|---|
| bg | `#F7F5F8` |
| surface | `#FFFFFF` |
| ink | `#2A1F33` |
| accent | `#6E3F8A` |
| highlight | `#E4572E` |
| Typeface | Manrope throughout |

---

## 9. Do and don't

Do
- Use status pills with text, tabular numbers and right-aligned money.
- Keep one primary button per screen.
- Show the source for every chatbot answer.
- Disable unavailable actions with an explanation.

Don't
- Don't use gradients, glassmorphism or a different radius on every element.
- Don't colour whole cards red or green; colour the pill.
- Don't animate on scroll or add hover effects to every card.
- Don't let the chatbot take actions without a confirmation card.

---

## 10. Quick build notes

- Tailwind: map the CSS variables in `theme.extend.colors` (`bg`, `surface`, `ink`, `loop`, and so on) so components use semantic names.
- Icons: Lucide, 20px, 1.75 stroke.
- Charts: one colour (`--loop`) plus `--border` gridlines; use status colours only when the chart is about status.
- Loop mark: an open circle (about 300 degrees of arc) with a small arrowhead at the gap. Draw it as a single SVG path and reuse it for the logo, favicon and chat launcher.
- Build order for UI: tokens, layout shell, tables and pills, forms, dashboard, customer portal, then the chatbot panel.
