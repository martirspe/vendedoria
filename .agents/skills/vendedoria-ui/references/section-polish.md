# Section polish workflow

Use for a specific view or the next section in an ongoing console pass.

## Select and assess

Use explicit user corrections first. For “next section”, inspect the existing progress document if present (`docs/agent/plans/ui-section-polish.md`) and the affected navigation/routes to select the next unfinished surface. A browser's ambient URL is context, not a user instruction to select that section. Preserve completed work.

Read the feature and one comparable view. Identify the user's task, primary decision, primary action, supporting information and domain constraints. Assess actual rendered UI when available. Distinguish observed defects from concerns inferred from source.

Check the affected DSM rows and the relevant master-brief heading. Avoid treating every heading as a mandatory feature for every page.

## Build a coherent view

- Give the page a clear title, concise context and an action hierarchy. Use metrics only when real data helps a decision.
- Group fields by user task with shared sections and consistent labels, help and validation. Avoid a card around every field or nested cards without a useful boundary.
- Use existing buttons, selects, menus, checkboxes, disclosures, feedback and icons. Read the shared-system reference when a missing responsibility requires a new contract.
- Choose `ds-select` for values and `ds-menu` for actions. Preserve native forms, dirty/touched state, disabled controls and field errors.
- Make lists and tables support actual work: meaningful status, clear values, useful filters and reachable row actions. Preserve information and operations on narrow screens.
- Use FAQs/disclosures for genuine optional explanations. Keep essential instructions and errors visible; do not invent FAQs merely to populate a layout.
- Connect sticky actions to the section's real workflow using the DSM contract. Keep status messages honest and avoid duplicated primary actions.

## States and interaction

Differentiate initial loading, empty data, no filter results and fetch failure. Keep recoverable errors actionable. During saves, prevent duplicate operations and preserve edits on failure. Keep success feedback accurate and return focus when overlays close.

Use production Spanish. Remove technical guidance, unsupported promises and ambiguous action labels from touched UI. For a comprehensive copy audit, use the dedicated copy skill rather than silently expanding this task.

Check labels, help/error associations, keyboard order, accessible names for icon actions, focus and touch targets. Review mobile composition and critical actions. Keep confirmations proportional to the existing operation; do not add approval flows for ordinary visual edits.

## Handoff

Verify using the verification reference. For an ongoing section pass, update its existing progress record with the completed surface, shared components adopted and concrete remaining gaps. Explain the result and evidence without recounting every edit.
