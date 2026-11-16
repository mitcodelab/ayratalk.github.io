# TalkBoard AAC changelog

## v1.3.8

- Removed the 1,320px content cap and the tile-grid width caps so tiles expand across the full available page width.
- Restored the original responsive tile artwork sizing (62% width, up to 172px) from the initial render, so images expand with the larger tiles.
- Kept the 3/4/5 standard and 2/3/4 Large Tile column counts across phone, mid-sized, and wide layouts.
- Updated app, package, PWA, documentation, service-worker, and archive version metadata.

## v1.3.7

- Restored the original responsive 3/4/5 standard tile grid across phone, mid-sized, and wide layouts; Large Tiles show fewer, larger choices.
- Centered the Home and Phrases navigation group, kept horizontal board scrolling, and made the message controls stack on narrow phones.
- Made caregiver toolbar and settings rows reflow; adjusted safe-area positioning, landscape sizing, and long text wrapping.
- Updated app, package, PWA, documentation, service-worker, and archive version metadata.

## v1.3.6

- Added a visible Delete Board action for unlocked boards and persistent deletion of built-in boards; Home remains protected as the main navigation board.
- Enabled unlocked caregivers to add, reorder, edit, and delete tiles on built-in boards, with the existing picture, label, color, upload, and recording controls.
- Persisted built-in board edits and deletions in local storage and JSON backups, with import, restore, audio, favorites, and recent-board handling updated.
- Updated app, package, PWA, documentation, service-worker, and archive version metadata.

## v1.3.5

- Moved the Phrases shortcut beside Home in the top navigation while keeping it available when locked.
- Made four sentence tiles display their existing picture tiles as clear “tile + tile” combinations and add both component tiles to the message with one tap.
- Kept the Spotify command tile in Phrases.
- Updated app, package, PWA, documentation, and archive version metadata.

## v1.3.4

- Made the standard tile grid adapt to available space while keeping cards at a readable, bounded size across screen layouts.
- Added a Phrases board with five illustrated sentence tiles that remain available while locked.
- Hid Support while locked, revealed it after unlock, and returned navigation to Home when locking.
- Updated app, package, PWA, documentation, and archive version metadata.

## v1.3.3

- Fixed deferred stylesheet activation for `file://` launches so local copies receive the same artwork sizing and layout styles as hosted copies.
- Reduced board artwork to a consistent compact size, centered the board in a bounded-width layout, and increased columns progressively at wider breakpoints to keep cards manageable.
- Kept tile labels readable and made the message and board navigation images render at 22px.
- Added a file-launch smoke test and updated app, PWA, package, service-worker, and archive version metadata.

## v1.3.2

- Implemented researched performance and quality improvements: critical CSS, large-board batching and off-screen containment, tightened script CSP, artwork generation/check tooling, Playwright smoke tests, and CI workflow.

## v1.3.1

- Modernized the original v1.3 frontend using Modern Web Guidance after scanning and verifying legacy patterns.

## v1.3

- Original TalkBoard AAC release and feature baseline.
