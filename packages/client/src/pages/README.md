# pages/

React page components for the client application.

## Current Pages

- `Home.tsx` - Landing page with main menu (links to single-player and multiplayer)
- `Game.tsx` - Single-player game page — asset loading, character select, creates GameApp/GameLoop, delegates to `CoreGameScene` (singleplayer mode)
- `MultiplayerGame.tsx` - Multiplayer game page — asset loading, room join, lobby (character select + ready), then gameplay scene startup (multiplayer mode)

## Future Pages

- `Signup.tsx` - User registration
- `Login.tsx` - User authentication
- `Profile.tsx` - User profile and settings
- `Lobby.tsx` - Dedicated multiplayer lobby route (not currently used; lobby is embedded in `MultiplayerGame.tsx`)
- `Payment.tsx` - Subscription/payment handling
- `Messages.tsx` - In-app messaging

## Design Guidelines

- Each page is a self-contained React component
- Pages handle their own layout and styling
- Game-related pages integrate with PixiJS via refs
- Non-game pages are standard React components

## Page vs Component

- **Pages** live here - top-level routes
- **Components** live in `../ui/` - reusable UI elements used within pages
