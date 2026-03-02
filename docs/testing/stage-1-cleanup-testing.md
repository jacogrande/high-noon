# Stage 1 Cleanup — Manual Testing Guide

Phase 4 of the Stage 1 cleanup sprint. No code changes — this documents what
needs manual verification and captures multiplayer parity findings.

## Prerequisites

- `bun install` completed
- Two terminal windows for server + client
- Two browser tabs for multiplayer tests
- All automated tests passing (`bun test packages/shared/`)

## Setup

### Single-Player

```bash
bun run dev
```

Navigate to `http://localhost:5173`. Start a single-player game.

### Multiplayer (2-Player)

```bash
# Terminal 1
bun run dev:server

# Terminal 2
bun run dev
```

Open two tabs at `http://localhost:5173`. Both join the same room.

---

## Part 1: Playtest Validation Checklist (Task 4.1)

Run Stage 1 in single-player. Fill in the "Actual" column.

| # | Metric | Target | Actual | Notes |
|---|--------|--------|--------|-------|
| 1 | Average clear time | 2–3 minutes | ___ | Time from Wave 1 spawn to encounter complete |
| 2 | Deaths (experienced player, first attempt) | 0–1 | ___ | |
| 3 | HP loss (new player, first attempt) | 50–70% | ___ | |
| 4 | Wave 1 clear time | 30–45s | ___ | Drifters + Knife Drifters only |
| 5 | Wave 2 clear time | 45–60s | ___ | Adds Deadeyes as threats |
| 6 | Wave 3 clear time | 60–90s | ___ | Adds boss from pool |
| 7 | Initial spawn delay feels fair | Yes/No | ___ | Player has time to orient |
| 8 | Deadeye telegraph is readable | Yes/No | ___ | Laser sight visible, 1.1s is enough to react |
| 9 | Spitter gaps are navigable | Yes/No | ___ | 6-bullet spread has dodgeable gaps |
| 10 | Dustdevil zones are avoidable | Yes/No | ___ | Zones visible, radius 55 is fair |
| 11 | Cactus contact damage is noticeable | Yes/No | ___ | Player notices health drain on cactus tiles |
| 12 | Cover is useful and accessible | Yes/No | ___ | 14 obstacles, 4-tile spacing feels right |
| 13 | No off-screen deaths | Yes/No | ___ | No enemy attacks from outside camera view |

### What to watch for

- **Wave 1**: Should feel relaxed. Drifters are slow (190 speed projectiles), long telegraph (0.4s). Knife Drifters approach but telegraph their lunge. The player should learn to dodge and shoot without pressure.
- **Wave 2**: Deadeyes introduce sniping. The 1.1s laser telegraph must be clearly visible against the desert background. The player should learn to use cover or dodge the fast (650 speed) bullet.
- **Wave 3**: Boss fight. Verify the boss spawns from the pool (Boomstick Bill, Mad Dog, Dalton Boys). The Dalton Boys spawn 2 entities — this is intentional. The center arena with hitching post landmarks should frame the fight.

### If metrics deviate

| Deviation | Likely Fix |
|-----------|------------|
| Clear time > 3 min | Reduce fodder budget or lower enemy HP |
| Clear time < 2 min | Increase maxFodderAlive or add threats to Wave 1 |
| Too many deaths | Reduce Deadeye damage (currently 9) or increase telegraph |
| Cover not useful | Check obstacle count/placement, may need weighted zones |
| Off-screen deaths | Check spawn distance or camera bounds |

---

## Part 2: Multiplayer Parity Smoke Test (Task 4.2)

### Automated Verification (Code Analysis)

The following has been verified by code review — the shared simulation is
multiplayer-parity-safe:

| Feature | Player-Count Dependent | Scope Gated | Status |
|---------|:---------------------:|:-----------:|:------:|
| Downed/Revive state | Yes (>1 player = Downed) | N/A | Correct |
| Enemy HP scaling | Yes (1.5x at 2 players) | N/A | Correct |
| Wave fodder budget | Yes (1.3x at 2 players) | N/A | Correct |
| Dustdevil zones | No | No | Independent — works for all players |
| Laser telegraphs | No | No | Independent — rendered for all clients |
| Cactus tile damage | No | Yes (local gate) | Correct — applies to local player in prediction |
| Threat positioning | No | No | Same spawn ring for all player counts |
| Fodder spawn rate | No | No | Constant 3/sec |
| Wave clear ratio | No | No | Same threshold regardless of player count |

**Key implementation details:**
- `applyCoopHpScale()` in `waveSpawner.ts` scales enemy HP per `activePlayerCount`
- `getCoopScalars()` in `coopScaling.ts` provides breakpoints: 2p=1.5x HP, 4p=2.5x, 8p=4.0x
- Wave budget multiplier is ~60% of HP scale rate (2p=1.3x budget)
- `health.ts` lines 42-56: `activePlayerCount > 1` → Downed state instead of Dead
- `hazardTile.ts` line 31: `simulationScope` gate skips non-local players (correct for client prediction)

### Manual Verification Steps

These require a running 2-player session:

**Test M1: Enemy Spawn Sync**
1. Start a 2-player game, both in Stage 1
2. Observe Wave 1 spawns
3. **Verify**: Both players see the same enemies spawn at the same positions
4. **Verify**: Enemy count matches on both screens

**Test M2: Dustdevil Zone Sync**
1. Play until a Dustdevil attacks (Wave 2-3 fodder pool)
2. **Verify**: Zone appears at the same position on both screens
3. **Verify**: Both players take damage if standing in the zone
4. **Verify**: Zone disappears at the same time on both screens

**Test M3: Deadeye Telegraph Sync**
1. Play until Wave 2 (Deadeyes spawn as threats)
2. **Verify**: Laser telegraph renders on both screens
3. **Verify**: Telegraph aims at the correct target on each screen
4. **Verify**: Bullet fires in the direction the laser pointed

**Test M4: Cactus Damage Sync**
1. Both players walk onto cactus tiles
2. **Verify**: Both take damage at the same rate
3. **Verify**: Health bars update on both screens

**Test M5: Wave Progression**
1. Play through all 3 waves cooperatively
2. **Verify**: Wave transitions happen at the same time for both players
3. **Verify**: Boss spawns at the same position
4. **Verify**: Encounter completion triggers for both players

**Test M6: Downed State**
1. One player takes lethal damage
2. **Verify**: Player enters Downed state (not Dead)
3. **Verify**: Other player sees downed indicator
4. **Verify**: Revive interaction works (hold INTERACT within 48px)
5. **Verify**: Bleed timer (10s) ticks correctly

**Test M7: Co-op HP Scaling**
1. In a 2-player game, note how many shots to kill a Drifter
2. Compare to single-player (should require ~50% more shots in co-op)

**Test M8: Enemy Death Sync**
1. One player kills an enemy
2. **Verify**: Enemy disappears on both screens simultaneously
3. **Verify**: No ghost enemies lingering on one client

---

## Part 3: Enemy Visual Identity Verification

Verify the Phase 1 visual changes in-game:

| Enemy | Shape | Color | Facing Indicator | Distinct at Glance? |
|-------|-------|-------|-------------------|:-------------------:|
| Drifter | Circle + hat brim | `0xd4a574` warm tan | Eye dot | ___ |
| Knife Drifter | Circle + blade wedge | `0xdd6633` orange-red | Blade direction | ___ |
| Deadeye | Diamond + scope line | `0xcc2222` crimson | Scope line | ___ |
| Spitter | Fat oval + nubs | `0x44dd55` toxic green | Body facing | ___ |
| Dustdevil | Circle + spiral | `0xddaa22` amber | Spiral rotation | ___ |

### Readability checks

- [ ] All 5 types distinguishable against desert background at default zoom
- [ ] Knife Drifter blade animates during TELEGRAPH/ATTACK states
- [ ] Deadeye diamond shape stands out from circular fodder
- [ ] Spitter is visually the largest enemy (widest silhouette)
- [ ] Dustdevil spiral rotates continuously

---

## Part 4: Town Layout Verification

Verify Phase 2 layout changes:

- [ ] Porches (half-wall rows) visible on Saloon, General Store, Sheriff, Bank
- [ ] Porches are walkable — player can stand on them
- [ ] Porches block bullets — provides actual cover
- [ ] Hitching posts placed at north/south edges of center clear zone
- [ ] 14+ obstacles scattered through town (noticeably more than before)
- [ ] Main Street gaps between buildings are wide enough to dodge through
- [ ] Saloon and General Store are on opposite sides of the back row
- [ ] Sheriff and Bank are adjacent in the same strip
- [ ] No building overlaps the center clear zone
- [ ] Cactus floor tiles visible near buildings/obstacles
