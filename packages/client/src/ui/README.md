# ui/

User interface components and overlays.

## Responsibilities

- HUD (health, ammo, ability cooldowns)
- Menus (main menu, pause, settings)
- Lobby interface
- Damage numbers and combat feedback
- Upgrade selection UI

## Key Files

- `Hud.ts` - In-game HUD overlay
- `MainMenu.ts` - Title screen and navigation
- `Lobby.ts` - Multiplayer lobby interface
- `DamageNumbers.ts` - Floating combat text
- `UpgradeSelect.ts` - Roguelike upgrade picker

## Implementation Options

Two approaches supported:

1. **PixiJS UI** - Built with PixiJS containers/text
   - Pros: Single renderer, no DOM overhead
   - Cons: More manual layout work

2. **HTML/CSS overlay** - DOM elements over canvas
   - Pros: Familiar styling, accessibility
   - Cons: Two rendering systems

## HUD Elements

- Health bar
- Ability cooldown indicators
- Ammo/reload status
- Score/currency
- Minimap (optional)
- Status effects

## Design Guidelines

- Keep HUD minimal—don't obscure gameplay
- Use consistent visual language
- Provide clear feedback for player actions
- Support different screen sizes

## Dependencies

- `pixi.js` - For PixiJS-based UI
- `../engine` - Scene integration
- `@high-noon/shared` - Game state types
