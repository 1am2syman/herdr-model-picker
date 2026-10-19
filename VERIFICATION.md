# Verification

Tested with Pi 1.3.0, Herdr 0.9.3 and Node 26.7.0 on Linux. Node 22 is declared as the minimum but was not separately exercised.

- Type checking and all 27 automated tests pass: `npm run verify`.
- Independent Sol 6.1 review at high effort reported no remaining actionable code findings for the registry-to-CLI forwarding contract.
- Final code was exercised in disposable live Herdr tabs and panes: picker search/effort/destination, back/cancel, multiline Unicode cursor insertion, single undo, normal Ctrl+L, remembered destinations, narrow/short terminal state, and directional navigation.
- The block is two exact Herdr commands (about 770 characters) rather than an embedded Node program; a live tab launch from the rendered commands produced an interactive Sol/high child with focus untouched, and was cleaned up.
- Earlier real parent submissions launched children in a new tab, right split and down split with the block executed unchanged. No task was sent to child agents. All test resources were cleaned up.

A new-tab snapshot showed the child focused after launch; causality was not isolated. Both split layouts retained parent focus. Physical desktop keyboard routing and screenshot-based visual verification remain unproven. Live nonreasoning navigation and the complete two-provider persistence matrix were not exercised.

The extension forwards selected provider/model/effort CLI values. Pi owns authentication, provider routing, fallback, sampling and extension behavior. Readiness means Herdr reports the interactive Pi agent ready; it does not verify a provider’s eventual wire request.
