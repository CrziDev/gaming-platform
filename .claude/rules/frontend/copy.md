# User-facing copy

Interface text is product copy, not developer documentation. Before a sentence ships,
ask: does the user need it to understand where they are, make a decision, complete an
action, avoid a likely mistake, or recover from a problem? If not, omit it.

## Never shown

- Implementation details, backend behaviour, security mechanisms, internal architecture,
  or the rationale behind a design decision.
- Intentionally absent features — a missing registration link, password reset, or
  "remember me" — unless the user needs that fact to proceed.
- Explanations of a control whose purpose is clear from its label and placement.
- Documentation-style phrasing: "the system allows", "this feature is unavailable",
  lists of what a page does not contain.
- Placeholder descriptions written to fill visual space. A clean surface with less text
  is the better outcome.

## Always kept, plainly

Validation, error recovery, permissions, financial, legal, privacy, and security
messages stay, written in plain language without the internal detail behind them.

## Writing it

- Brief, natural, user-centred, actionable. "Contact an administrator if you need
  access" rather than an account of how accounts are provisioned.
- Remove unnecessary explanatory text; do not reflexively rewrite or replace it.
- Labels and terminology stay consistent across the application.
