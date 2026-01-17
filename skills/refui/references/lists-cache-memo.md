# Lists, Identity, Caching, Memoization

Use this file when implementing: lists/grids, reorder/insert/remove, virtualization, heavy subtrees, or performance tuning.

## 1) Lists: start with `<For>`

Prefer `<For>` when:
- You have an array (often held in a signal) and want efficient incremental updates.

Key concepts:
- **Keyed identity**: use `track="id"` (or equivalent) when items have stable IDs.
- **Indexed**: use `indexed` when you need the index as a reactive value (index changes should propagate without rebuilding items).
- **No `fallback` prop**: `For` does not accept `fallback`. Use `If` to render empty states.

In-place mutations:
- If you mutate an array inside a signal (push/splice/sort), call `items.trigger()` so dependents rerun.
- If you replace the array with a new array, assignment triggers automatically.

## 1.1) Selection at scale: `onCondition`

Use `onCondition` when many rows/components need to answer “am I selected?” (or any “equals X?” match) against one shared signal.

Why:
- Avoids “global boolean fan-out” patterns that cause wide recomputation.
- Produces per-row boolean signals that update efficiently as the source changes.

Pattern:
- `const isSelected = onCondition(selectedId)`
- In each row: `const active = isSelected(rowId)` and bind `class:active={active}` (or render branches via `<If condition={active}>`).

Prefer it over repeating `computed(() => selectedId.value === rowId)` in every row.

Empty state pattern (single-child branches):
- `<If condition={$(() => items.value.length)}><For entries={items} track=\"id\">{({ item }) => <Row item={item} />}</For><Empty /></If>`

## 2) When to use `UnKeyed` (extras)

Prefer unkeyed lists only when you have a measured reason, such as:
- reorder-heavy scenarios where keyed identity causes too much node churn for your specific UI shape
- perf experiments or highly specialized list semantics

If you’re unsure, start keyed.

## 3) Reduce fan-out: `extract` / `derivedExtract`

Use extraction helpers when:
- A big object signal causes too many subscribers to rerun.

Guidance:
- Extract only the fields a subtree needs.
- For nullable sources, use tolerant extraction helpers (or a “safe” computed object) to avoid guard boilerplate.

## 4) Caching heavy subtrees

Prefer caching primitives when:
- You have a heavy subtree that is expensive to construct and is shown/hidden or swapped repeatedly.

Common tools (names vary by version; confirm with MCP):
- `createCache` / `Cached` (extras) for reusing built fragments
- `memo` / `useMemo` (components) for reusing component results across parents (not for everyday fine-grained updates)

Rule of thumb:
- Do not reach for memoization as the first performance tool. rEFui already updates surgically via signals.
- Reach for caching/memo only when you’ve identified repeated construction of the same large subtree.

## 5) Virtualization (fallback path)

If the project needs virtualization and rEFui doesn’t ship a dedicated primitive in your version:
- Implement a small virtualization component using signals + scroll position + a windowed slice.
- Keep DOM measurements scheduled (use `nextTick` or browser `requestAnimationFrame` as appropriate).
- Prefer macros for scroll listeners and measurement hooks if reused.

## Common pitfalls

- Using `.value` inside JSX and expecting it to update (see `reactivity-pitfalls.md`).
- Mutating list items in place without `trigger()` (no downstream updates).
- Using memoization to “fix” a reactivity bug (usually hides the real issue).
- Computing selection booleans globally for all rows instead of using `onCondition` locally.

## When unsure

Use MCP to confirm list APIs for your rEFui version:
- Context7: query “onCondition”, “For track indexed expose”, “UnKeyed extras”, “createCache Cached”, “memo useMemo”.
