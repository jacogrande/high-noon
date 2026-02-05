# pages/

React page components for the client application.

## Current Pages

- `Home.tsx` - Landing page with main menu
- `Game.tsx` - Game page that hosts the PixiJS canvas

## Future Pages

- `Signup.tsx` - User registration
- `Login.tsx` - User authentication
- `Profile.tsx` - User profile and settings
- `Lobby.tsx` - Multiplayer lobby
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
