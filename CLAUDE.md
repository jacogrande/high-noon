# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

High Noon is a twitchy top-down roguelite multiplayer game. The project is currently in the planning phase with comprehensive architecture documentation but no implementation yet.

## Critical Rule: Game Logic in Shared

**ALL game logic MUST be written in `packages/shared`.** This is non-negotiable.

The shared package contains the deterministic simulation that runs identically on:
- Client (for single-player mode)
- Client (for client-side prediction in multiplayer)
- Server (as the authoritative simulation)

If game logic is written in client or server packages, single-player and multiplayer will diverge and break.

**What belongs in shared:**
- All ECS components and systems
- Movement, collision, damage, weapons, AI
- Content definitions (enemies, weapons, items)
- Network protocol types
- RNG implementation

**What does NOT belong in shared:**
- Rendering (client only)
- Input collection (client only)
- Network I/O (client/server specific)
- Audio playback (client only)

## Architecture

The planned architecture (detailed in `docs/architecture-brainstorm.md`) consists of:

- **Pattern:** Authoritative server + client-side prediction + snapshot interpolation for remote players
- **Simulation:** Fixed 60Hz timestep with deterministic physics
- **Networking:** Event-driven (replicate spawn events, not individual bullets)

### Package Structure

```
packages/
  shared/     # Deterministic simulation - THE source of truth for gameplay
    src/
      sim/        # ECS world, systems, game logic
        systems/  # Movement, collision, weapons, AI, etc.
        content/  # Weapon/enemy/item definitions
      net/        # Protocol types, serialization
      math/       # Vector math, quantization
      replay/     # Deterministic replay

  client/     # Browser client - rendering and input only
    src/
      engine/   # PixiJS setup, game loop, scenes
      net/      # Connection, prediction, interpolation
      render/   # Sprite management, effects
      ui/       # HUD, menus
      assets/   # Asset loading

  server/     # Authoritative server - runs shared sim
    src/
      rooms/    # Colyseus room definitions
        schema/ # Synced state (minimal)
      match/    # Tick loop, input handling
      services/ # Matchmaking, persistence

  tools/      # Dev utilities, asset pipeline
```

### Tech Stack

- **Client:** React 19 + PixiJS v8 + Vite + bitECS
- **Server:** Colyseus (room-based) + WebSocket transport
- **Monorepo:** bun workspaces

### Technology Guides

Consult these guides before implementing features:

- `docs/guides/pixijs.md` - Rendering, sprites, game loop, performance
- `docs/guides/pixijs-react.md` - React integration for UI (optional)
- `docs/guides/typescript-game-dev.md` - Type patterns, fixed timestep, RNG, pooling
- `docs/guides/bitecs.md` - ECS components, systems, queries, prefabs

### Design Documents

- `docs/mechanics/player-mechanics.md` - Movement, roll, jump, shooting, abilities
- `docs/research/roguelike-upgrades.md` - Upgrade system design research

### Key Rates

- Simulation: 60 Hz
- Input send: 60 Hz
- Server snapshot: 10-20 Hz
- Interpolation buffer: 100-150ms

## Development Sequence

The recommended implementation order is:
1. Single-player run (shared sim + Pixi renderer)
2. Deterministic seeds + data-driven content
3. Server + thin client renderer
4. Client prediction + reconciliation
5. Event-driven bullet spawning
6. Matchmaking/lobbies

## Commands

```bash
bun install           # Install all dependencies
bun run dev           # Start client dev server at localhost:3000
bun run dev:server    # Build shared + start server at ws://localhost:2567
bun run build         # Build shared + client packages
bun run build:shared  # Build shared package only
bun run build:client  # Build client package only
bun run build:server  # Build server package
bun run typecheck     # Type check all packages
```
