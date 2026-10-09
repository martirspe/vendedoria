# Shared system workflow

Use for a reusable component, token, icon or action pattern. The component inventory and numeric values live in `docs/DESIGN-SYSTEM.md`; this reference explains how to extend them.

## Audit before adding

Search the affected responsibility in `packages/ui/index.ts`, its implementation, design tokens, web/store global styles and direct consumers. Check whether the gap is an absent primitive, a composition of primitives, or an existing API that needs a small extension. Avoid repository-wide exploration unless evidence requires it.

Use the architecture from the master brief: Brand → Foundations → Semantic tokens → Primitives → Patterns → Features → Pages. Features consume those layers; they do not redefine them. A component inventory is a planning tool, not an instruction to implement unused controls.

## Component contract

Before implementation, define the smallest useful contract in the DSM:

- Purpose and existing consumer need.
- Typed inputs, supported variants and content projection slots.
- Native semantics, form integration and event ownership.
- Relevant states: disabled, busy, validation, selected, expanded and focus.
- Keyboard behavior, accessible name, focus return and mobile fallback where relevant.
- Semantic tokens consumed and affected web/store surfaces.

Keep business decisions in consumers. A button or bar does not determine permissions, calculate money or decide when an operation is allowed. Preserve native inputs and submits when composing wrappers. Do not add speculative abstractions or dependencies.

## Sticky primary and quick actions

Use `ds-action-bar` for contextual actions and `ds-save-bar` for forms. Consult the DSM's “Sticky CTA corporativo” section and actual component inputs before composing.

The shared visual pattern is an ink surface, readable status/context, secondary actions and one lime primary action. Size, spacing, radius, elevation, offset and layers come from shared action tokens. Reuse the same contract across views while letting consumers supply real labels and behavior.

- Select top or bottom according to the action's position and the view's workflow; do not impose one placement on every surface.
- Keep form actions within their form and preserve button `type`. Avoid ancestors whose overflow or short height prevents sticky positioning.
- Use one primary action per context. Add Cancelar/Descartar only when its result is defined; do not silently lose dirty edits.
- Reflect real dirty/busy/disabled state and recovery after failure. Counts must represent actual data, not decorative progress.
- Check narrow-width wrapping, device safe area, focus visibility, zoom, scroll and overlap with navigation or overlays.

## Integration

Export shared components through `@vendedoria/ui`, follow existing standalone/OnPush conventions, and connect styles to semantic tokens. Adopt the component in the requested consumers; do not expand into a whole-console migration without scope.

Update DSM contracts/examples and remove replaced local styles only when no longer used. Verify the affected consumer behavior and both apps when shared packages change. Document remaining legacy consumers accurately instead of declaring universal adoption.
