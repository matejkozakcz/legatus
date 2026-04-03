

## Plan: OrgChart — default expand & collapse UX fix

### Changes in `src/components/OrgChart.tsx`

**1. Add `depth` prop to `TreeNode`**

Pass a `depth` number (0 = root, 1 = direct children, 2 = grandchildren, etc.) through the recursive tree.

**2. Invert collapse logic — use default-collapsed set**

Instead of starting with an empty `collapsedIds` (everything expanded), compute an initial `collapsedIds` set that contains all nodes at depth ≥ 2 (i.e., grandchildren and deeper). This means:
- Level 0 (current user): always visible
- Level 1 (direct subordinates): expanded by default
- Level 2+ (grandchildren etc.): collapsed by default, expandable via +

Use a `useMemo` to walk the tree from the root and collect IDs of all nodes at depth ≥ 2 that have children, then initialize `collapsedIds` with those IDs.

**3. Move minus button ABOVE the expanded children**

Current layout when expanded:
```text
[Card]
  |
[children...]
  |
[-] button
```

New layout:
```text
[Card]
  |
[-] button
  |
[children...]
```

In the `TreeNode` component, swap the order: render ToggleButton (minus) before the children group, not after. The `+` button (collapsed state) stays in the same position (below the connector after the card).

### Summary of logic changes

- `TreeNode` receives `depth` (default 0 for root)
- Children rendered with `depth + 1`
- Initial `collapsedIds` = all node IDs at depth ≥ 2 that have children
- Expanded state: `[-]` → `connector` → `children` (button above)
- Collapsed state: `connector` → `[+]` (button below card, unchanged)

