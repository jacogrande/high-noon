# Realtime Multiplayer Game Networking: Architecture and Best Practices

Research document for High Noon -- a fast-paced top-down action roguelite.

---

## Table of Contents

1. [Network Models](#1-network-models)
2. [Tick Rate and Update Rate](#2-tick-rate-and-update-rate)
3. [Snapshot Compression](#3-snapshot-compression)
4. [Bandwidth Optimization](#4-bandwidth-optimization)
5. [Jitter and Packet Loss Handling](#5-jitter-and-packet-loss-handling)
6. [Anti-Cheat Considerations](#6-anti-cheat-considerations)
7. [Deterministic Lockstep and Rollback Netcode](#7-deterministic-lockstep-and-rollback-netcode)
8. [Scaling](#8-scaling)
9. [Sources](#9-sources)

---

## 1. Network Models

### Authoritative Server

The authoritative server model is the industry standard for competitive and action multiplayer games. The server is the single source of truth for all game state. Clients send inputs (not positions or state changes), and the server simulates the game, validates those inputs, and broadcasts results back to all clients.

**How it works:**

1. Client captures input (move direction, shoot, dodge) and sends it to the server with a sequence number.
2. Server receives inputs from all clients, simulates the next tick, and produces an authoritative game state.
3. Server broadcasts state snapshots (or deltas) to all clients.
4. Clients render the authoritative state, using prediction and interpolation to mask latency.

**Why it is standard for action games:**

- **Cheat resistance.** The server validates everything. A client claiming "I moved 500 units" gets rejected. The client never has authority over game state.
- **Consistency.** All players see the same resolved outcomes -- who got hit, who died, who picked up the item. There are no split-brain states that need reconciliation.
- **Simplicity of conflict resolution.** One simulation, one timeline. No need for consensus protocols or host migration.

**Tradeoffs:**

- Requires hosting dedicated servers (cost, ops burden).
- Adds one-way latency to every input (RTT/2 before the server even processes it).
- Requires client-side prediction to feel responsive (see section on prediction below).

### Peer-to-Peer (P2P)

Each client communicates directly with every other client. One client may be designated as the "host" (host-authoritative P2P), or all clients run the same deterministic simulation (lockstep P2P).

**Tradeoffs:**

- No server cost.
- NAT traversal is hard and unreliable. Requires STUN/TURN servers or relay fallback.
- Host-authoritative P2P gives the host zero latency and full cheating power.
- Lockstep P2P requires full determinism and is sensitive to the slowest player's connection.
- Host migration on disconnect is complex and error-prone.
- Does not scale past ~8-16 players due to the O(n^2) connection mesh.

P2P is appropriate for fighting games (2 players, lockstep), co-op games with trusted friends, and LAN play. It is not appropriate for competitive action games with untrusted players.

### Relay Server

A lightweight server that forwards packets between clients without simulating game state. One client is the logical host.

**Tradeoffs:**

- Avoids NAT traversal problems (all clients connect to a known server).
- Lower server cost than full authority (no game logic on server).
- Still has the "host advantage" problem.
- Useful as a middle ground when you cannot afford authoritative servers but need reliable connectivity.

### Recommendation for High Noon

Authoritative server is the correct choice. The game is competitive, fast-paced, and involves combat where cheating would ruin the experience. The project already uses Colyseus for room-based server architecture, which fits naturally.

---

## 2. Tick Rate and Update Rate

There are three distinct rates in a multiplayer game, and they are intentionally decoupled:

### Simulation Tick Rate (Server and Client)

The simulation advances in fixed discrete steps. This is the "physics clock."

| Game | Sim Tick Rate |
|------|---------------|
| Valorant | 128 Hz (7.8ms per tick) |
| CS:GO (official) | 64 Hz |
| Team Fortress 2 / Source Engine | 66 Hz |
| Overwatch | 63 Hz |
| Fortnite | 30 Hz |
| Call of Duty: Warzone | 20 Hz |
| Apex Legends | 20 Hz |
| **High Noon (planned)** | **60 Hz (16.67ms per tick)** |

**Why 60 Hz for a top-down action game:**

- 16.67ms granularity is fine for top-down aim-and-shoot gameplay (not precision tactical FPS).
- Each tick costs CPU time on the server. At 128 Hz, Valorant's server frame budget is only 2.34ms (they run 3+ game instances per core). At 60 Hz, the budget is 16.67ms -- much more room for AI, collision, and game logic.
- Deterministic simulation at 60 Hz is straightforward with fixed-point or quantized math.

### Network Send Rate (Server to Client)

The server does NOT send a snapshot every tick. It would be wasteful. Instead, snapshots are sent at a lower cadence, typically 10-20 Hz for action games.

| Send Rate | Interval | Use Case |
|-----------|----------|----------|
| 10 Hz | 100ms | Mobile games, bandwidth-constrained |
| 20 Hz | 50ms | Standard for most action games |
| 30 Hz | 33ms | Higher fidelity, higher bandwidth |
| 60 Hz | 16.67ms | Premium competitive (Overwatch high-bandwidth mode) |
| 128 Hz | 7.8ms | Extreme (Valorant, very expensive) |

**For High Noon: 20 Hz is the sweet spot.** This gives 50ms between snapshots, which is well within the interpolation buffer. Going higher than 20 Hz increases bandwidth linearly with diminishing perceptual returns for a top-down game.

Clients interpolate between received snapshots to produce smooth motion at their render frame rate. The interpolation delay is typically one snapshot interval (50ms at 20 Hz), meaning remote entities are rendered 50ms in the past.

### Client Input Send Rate

Clients send their inputs at the simulation tick rate (60 Hz). Each input packet is small (typically 8-20 bytes: sequence number, movement vector, buttons pressed, aim angle). At 60 Hz with 20-byte packets:

```
60 packets/s * 20 bytes = 1,200 bytes/s = 9.6 kbps upstream
```

This is negligible bandwidth. Some implementations batch inputs (send 3 ticks of input per packet at 20 Hz), which reduces packet overhead but adds up to one batch interval of latency.

### Client Render Rate

The render loop runs at the monitor's refresh rate (typically 60-144+ FPS) and is completely decoupled from the simulation tick. Between simulation ticks, the renderer interpolates entity positions:

```
renderPosition = previousPosition + (currentPosition - previousPosition) * alpha
```

Where `alpha` is the fraction of time elapsed since the last sim tick divided by the tick interval.

### Bandwidth Budget

A rough bandwidth budget for a 2-8 player top-down action game at 20 Hz send rate:

| Component | Per Player (Server to Client) |
|-----------|-------------------------------|
| Snapshot header (seq, ack, timestamp) | ~12 bytes |
| Per-entity state (position, rotation, health, state) | ~16-24 bytes/entity |
| 8 players * 20 bytes each | ~160 bytes |
| 20 enemies * 16 bytes each | ~320 bytes |
| Events (damage, spawn, death) | ~0-100 bytes (bursty) |
| **Total per snapshot** | **~500-600 bytes** |
| **At 20 Hz** | **~10-12 KB/s = 80-96 kbps downstream** |

For comparison, Overwatch uses approximately 60-100 kbps bidirectional at 20 Hz, tripling to ~180-300 kbps at 63 Hz. These are well within consumer internet capabilities (even mobile 4G typically provides 1+ Mbps).

---

## 3. Snapshot Compression

Raw snapshots are wasteful. A naive approach of sending full state for every entity every snapshot will quickly exceed bandwidth budgets. The following techniques are applied in layers, each building on the previous.

### 3.1 Delta Compression (Only Send What Changed)

Instead of sending the full world state every snapshot, the server tracks which snapshot each client has most recently acknowledged, and encodes the new snapshot as a delta against that baseline.

**How it works:**

1. Server maintains a ring buffer of recent snapshots (e.g., last 32).
2. Client sends ack packets: "I have received snapshot #142."
3. Server encodes snapshot #150 relative to baseline #142.
4. For each entity: if state is identical to baseline, encode as 1 bit (unchanged flag = 0).
5. For changed entities, encode only the changed fields.

**Compression ratio:** In Glenn Fiedler's experiments with 901 physics objects, delta compression alone reduces bandwidth from ~2.1 MB/s (full snapshots at 60 Hz) to under 100 KB/s during steady state, because most objects do not change every frame. When all objects are stationary, the entire delta snapshot compresses to approximately 15 kbps (just headers).

**Handling lost deltas:** If the client's ack indicates it never received the baseline snapshot, the server must fall back to encoding against an older acknowledged baseline or sending a full snapshot. This is why the server keeps a ring buffer of recent snapshots.

### 3.2 Quantization (Reducing Float Precision)

Game state often uses 32-bit floats, but network transmission rarely needs that precision. Quantization maps continuous values to a fixed number of discrete levels.

**Common quantizations:**

| Data Type | Raw Size | Quantized Size | Method |
|-----------|----------|----------------|--------|
| Position (x, y) | 64 bits (2x float32) | 34 bits (2x 17-bit) | Bound to arena size, 17 bits per axis = 131072 units at 1-unit precision |
| Position (x, y) high-precision | 64 bits | 42 bits (2x 21-bit) | 2M units at sub-unit precision |
| Rotation angle | 32 bits | 8-10 bits | 256-1024 discrete angles (1.4-0.35 degree precision) |
| Health (0-100) | 32 bits | 7 bits | 128 discrete values |
| Velocity (x, y) | 64 bits | 20 bits (2x 10-bit) | Bound to max speed, 1024 levels per axis |
| Quaternion (3D rotation) | 128 bits (4x float32) | 29 bits | Smallest-three encoding: 2-bit index + 3x 9-bit components |

**Critical rule:** Quantize on both sides. The server must quantize its state to the same precision as the network encoding before comparing for delta compression. Otherwise, tiny floating-point drift causes spurious "changed" flags, defeating delta compression.

### 3.3 Bit-Packing

Rather than aligning data to byte boundaries, write the exact number of bits needed for each field. A position component that needs 17 bits should use 17 bits, not 32.

**Implementation:** Use a `BitWriter`/`BitReader` class that maintains a bit offset and writes values using masking and shifting:

```typescript
class BitWriter {
  private buffer: Uint8Array;
  private bitOffset: number = 0;

  writeBits(value: number, numBits: number): void {
    // Write value using exactly numBits bits
    for (let i = 0; i < numBits; i++) {
      const byteIndex = this.bitOffset >> 3;
      const bitIndex = this.bitOffset & 7;
      if (value & (1 << i)) {
        this.buffer[byteIndex] |= (1 << bitIndex);
      }
      this.bitOffset++;
    }
  }
}
```

**Savings:** Bit-packing typically reduces packet size by 30-50% compared to byte-aligned encoding.

### 3.4 Variable-Length Encoding for Deltas

Delta values (the difference between current and baseline state) tend to cluster near zero. Use variable-length encoding to exploit this:

- **Delta is zero:** 1 bit (the unchanged flag).
- **Small delta (fits in 4-8 bits):** 1-bit flag + 4-8 bits of delta.
- **Large delta:** 1-bit flag + full value.

This further reduces bandwidth by approximately 4x for slowly-changing state compared to fixed-width fields.

### 3.5 Protocol Buffers vs Custom Binary Formats

| Approach | Pros | Cons |
|----------|------|------|
| **Protocol Buffers / FlatBuffers** | Schema evolution, code generation, cross-language | Overhead from field tags, varint encoding. Not bit-level efficient. Cannot do sub-byte packing. |
| **Custom binary format** | Maximum compression, bit-level control, delta-aware | More code to maintain, schema changes require migration, harder to debug |
| **MessagePack / CBOR** | Self-describing, reasonable size | Still byte-aligned, no delta support, overhead for small messages |

**Recommendation for High Noon:** Use a custom binary format for the hot path (snapshot encoding). The entity count is manageable (8 players + 20-50 enemies + projectiles), and the savings from bit-packing and delta compression are significant. Use a simple schema/codec approach where each component type has a serialize/deserialize pair. For low-frequency messages (chat, lobby state, match results), JSON or MessagePack is fine.

---

## 4. Bandwidth Optimization

### 4.1 Area of Interest / Relevance Filtering

For large game worlds, not every entity is relevant to every player. The server only sends state for entities within a player's "area of interest."

**Techniques:**

- **Distance-based:** Only send entities within a radius of the player. Simple, effective for open worlds. For a top-down game with a fixed camera view, the relevant area is the screen bounds plus a margin (e.g., 2x screen size to handle fast movement and projectiles arriving from off-screen).
- **Grid/cell-based:** Divide the world into cells. Subscribe players to their cell and adjacent cells. Entities are bucketed by cell. This is O(1) per entity for relevance checks.
- **Visibility-based:** Only send entities the player can see (accounting for walls, fog of war). More complex but reduces bandwidth by up to 6x compared to distance-based in environments with obstacles.

**For High Noon:** The arena is small enough (a single screen or a few screens) that relevance filtering may not be necessary for the initial implementation. All entities are likely relevant to all players. If enemy counts grow large (50+), consider filtering distant enemies to a lower update priority.

### 4.2 Priority Accumulator System

When bandwidth is limited, not all entities can be updated every snapshot. A priority accumulator ensures all entities eventually get synchronized while prioritizing the most important ones.

**Algorithm (from Glenn Fiedler's State Synchronization):**

1. Each entity has a priority accumulator (a float, persisted across frames).
2. Each frame, add the entity's current priority to its accumulator. Priority factors include:
   - Distance to player (closer = higher priority)
   - Whether the entity recently changed state (state change = priority boost)
   - Entity type (players > enemies > projectiles > environment)
   - Whether the entity is in the player's field of view
3. Sort entities by accumulator value (descending).
4. Walk the sorted list, serializing entities into the packet until the bandwidth budget is reached.
5. For entities that fit in the packet: reset their accumulator to zero.
6. For entities that did NOT fit: leave their accumulator value. They will have even higher priority next frame.

**Bandwidth budget:** Target a maximum packet size. For a 20 Hz send rate at 100 kbps:

```
100,000 bits/s / 20 packets/s = 5,000 bits = 625 bytes per packet
```

Subtract packet headers (~40 bytes for UDP/IP + your protocol header), leaving approximately 580 bytes of payload per snapshot.

### 4.3 Unreliable vs Reliable Channels

| Channel Type | Use For | Why |
|--------------|---------|-----|
| **Unreliable unordered** | Snapshots, position updates | If a snapshot is lost, the next one supersedes it. Retransmitting old state is worse than dropping it. |
| **Reliable ordered** | Events (player died, item picked up, round ended), RPC calls | These must arrive and in order. Missing a death event breaks game state. |
| **Reliable unordered** | Asset loading, configuration | Must arrive but order does not matter. |

**In a WebSocket environment (High Noon's current transport):** WebSocket is TCP-based, meaning all messages are reliable and ordered. This introduces head-of-line blocking: if one packet is delayed, all subsequent packets are held up. For a browser game, this is an acceptable tradeoff because:

- WebRTC DataChannels can provide unreliable delivery but add significant setup complexity (SDP exchange, STUN/TURN).
- At 20 Hz send rate with small packets, TCP head-of-line blocking is rarely noticeable in practice (a retransmission delays by ~RTT, which at typical internet latency is 20-60ms -- less than the interpolation buffer).
- For truly competitive play, WebRTC unreliable channels are worth the complexity, but TCP/WebSocket is a valid starting point.

### 4.4 MTU Considerations

- **Ethernet MTU:** 1500 bytes. After IP (20 bytes) and UDP (8 bytes) headers, 1472 bytes of payload.
- **WebRTC DataChannel:** Initial Path MTU should not exceed ~1200 bytes.
- **WebSocket over TCP:** No MTU concern at the application level (TCP handles segmentation), but smaller messages reduce latency because they are less likely to span multiple TCP segments.
- **Target packet size:** Keep snapshot packets under 1200 bytes to avoid fragmentation on any transport. For High Noon's player counts, this should be easily achievable.

### 4.5 Event-Driven Replication (Critical for High Noon)

Instead of replicating every bullet as a separate entity in snapshots, replicate the spawn event:

```
BulletSpawnEvent {
  bulletId: u16,
  ownerId: u16,
  positionX: i16,   // quantized
  positionY: i16,   // quantized
  angle: u8,        // 256 discrete angles
  weaponType: u8,
  seed: u32          // for deterministic simulation on client
}
```

Total: ~14 bytes per bullet spawn. Clients simulate the bullet trajectory locally from the spawn event. This means 50 bullets in flight cost 0 bytes per snapshot (they are not entities in the network state). Only the spawn events (~14 bytes each) and hit/destroy events (~6 bytes each) are replicated.

This is the approach already planned for High Noon and is the standard technique for bullet-heavy games.

---

## 5. Jitter and Packet Loss Handling

### 5.1 Jitter Buffers

Network packets do not arrive at uniform intervals. Even at a steady 20 Hz send rate (50ms interval), actual arrival times vary due to:

- Router queuing delays
- WiFi contention and retransmission
- ISP traffic shaping
- OS scheduling jitter

A **jitter buffer** (also called interpolation buffer) holds received snapshots for a configurable delay before consuming them, ensuring that the next snapshot is statistically almost certainly available when needed.

**Buffer sizing:**

- **Minimum viable buffer:** 1 snapshot interval (50ms at 20 Hz). This means you are always interpolating between snapshot N and snapshot N+1, rendering at the time of snapshot N. Works on perfect connections.
- **Practical buffer:** 2 snapshot intervals (100ms at 20 Hz). Tolerates one lost/late packet without any visual artifacts.
- **Conservative buffer:** 3 snapshot intervals (150ms at 20 Hz). Tolerates two consecutive lost packets. Good default for WiFi players.

**For High Noon (planned): 100-150ms buffer.** This matches the architecture document's specification and provides good WiFi tolerance.

### 5.2 Adaptive Interpolation Delay

Rather than using a fixed buffer, dynamically adjust the interpolation delay based on observed network conditions:

1. Track the arrival time jitter (standard deviation of inter-packet intervals) over a sliding window (e.g., last 100 packets).
2. Set the interpolation delay to: `delay = snapshotInterval + k * jitterStdDev`, where `k` is typically 2-3 (covering 95-99.7% of arrivals).
3. When conditions improve, slowly reduce the delay (e.g., 1ms per second). When a late packet is detected, immediately increase the delay.
4. Clamp the delay to a minimum of 1 snapshot interval and a maximum of ~200ms (beyond which the game feels unresponsive).

**Asymmetric adjustment:** Increase delay quickly (within 1-2 snapshots) but decrease slowly (over seconds). This prevents oscillation on unstable connections.

### 5.3 Redundant State in Packets

For unreliable transports (UDP/WebRTC), include redundant information to survive packet loss:

- **Input redundancy:** Each client input packet includes the last N inputs (e.g., last 3 ticks). If packet K is lost, packet K+1 still contains input K. The server deduplicates by sequence number.
- **Ack redundancy:** Each ack packet includes a bitmask of the last 32 received snapshot sequence numbers. Even if an ack packet is lost, the next one carries the same information. Glenn Fiedler notes this gives each ack effectively 32 chances to arrive.
- **State redundancy (for critical data):** Include slowly-changing critical state (health, alive/dead, score) in every snapshot, not just when it changes. The cost is small (a few bytes) and it self-heals from any single lost packet.

**For WebSocket (TCP):** Input and ack redundancy are unnecessary because TCP guarantees delivery. However, if High Noon ever migrates to WebRTC DataChannels, these patterns become essential.

### 5.4 Dealing with WiFi Jitter Spikes

WiFi is the worst-case network for realtime games. Typical WiFi characteristics:

- **Base latency:** 1-5ms to the router (negligible).
- **Jitter:** Periodic spikes of 50-200ms caused by beacon intervals, channel contention, and power management.
- **Packet loss:** 1-5% typical, can spike to 10-20% during contention.
- **Bufferbloat:** Home routers may buffer hundreds of ms of data, causing sudden latency spikes.

**Mitigation strategies:**

- **Larger interpolation buffer** (150ms instead of 100ms) absorbs most WiFi spikes.
- **Extrapolation fallback:** When the jitter buffer runs dry (no snapshot available to interpolate toward), briefly extrapolate the last known velocity. Cap extrapolation at 200-300ms to avoid entities flying off-screen. Snap back to interpolation as soon as new data arrives.
- **Time-warp correction:** After a stall, rather than jumping entities to their correct position, smoothly "warp" them over 100-200ms. This avoids jarring teleportation.
- **Disconnect detection:** If no snapshots arrive for 2-3 seconds, show a "reconnecting" indicator. After 10-15 seconds, consider the connection lost.

---

## 6. Anti-Cheat Considerations

### 6.1 Server Authority (The Foundation)

The single most effective anti-cheat measure is never trusting the client. The server is the sole authority on:

- **Position and movement.** The server simulates movement from inputs. It never accepts position updates from clients.
- **Damage and health.** The server calculates hit detection and applies damage. Clients cannot claim "I dealt 100 damage."
- **Game events.** Item pickups, kills, ability usage -- all validated server-side.
- **Timing.** The server maintains the game clock. Clients cannot advance or slow time.

### 6.2 Input Validation

Even with server authority, clients send inputs that must be validated:

**Movement inputs:**

- Clamp movement magnitude to maximum allowed speed.
- Reject inputs that arrive faster than the tick rate (speed hack via input flooding).
- Track cumulative distance moved per second; flag if it exceeds `maxSpeed * 1.15` (15% tolerance for network timing variance).

**Action inputs:**

- Validate cooldowns server-side. If a client sends "shoot" while the weapon is on cooldown, ignore it.
- Validate action preconditions (cannot shoot while dead, cannot use ability without resources).
- Rate-limit inputs: cap at simulation tick rate + small margin. Discard excess.

### 6.3 Speed Hack Detection

Speed hacks work by making the client's local clock run faster, generating more inputs per real-time second. Detection approaches:

1. **Input rate monitoring:** Track the rate of inputs received from each client. Expected: ~60 inputs/second (at 60 Hz tick). Flag if consistently above 66/s (10% tolerance).
2. **Timestamp validation:** Clients include their local tick number in inputs. Compare the rate of client tick advancement against server wall-clock time. If a client's ticks advance 20% faster than real time, flag them.
3. **Position verification:** Even though the server simulates movement, periodically verify that the client's predicted position (sent in input packets for reconciliation) does not deviate more than expected from the server's authoritative position. Large deviations indicate either extreme latency or manipulation.

**Tolerance:** Allow 10-15% variance to account for:
- Network timing jitter
- Clock drift between client and server
- Burst of queued inputs after a WiFi stall

### 6.4 Additional Anti-Cheat Measures

- **Fog of war / information hiding:** Do not send positions of enemies the player cannot see. This prevents wallhacks. For a top-down game with full visibility, this is less relevant but matters if you add fog of war mechanics.
- **Replay validation:** Log all inputs and periodically replay segments server-side to verify consistency.
- **Statistical anomaly detection:** Track metrics like accuracy, reaction time, and damage dealt over time. Flag statistical outliers for review.
- **Client integrity (limited in browser):** In a browser game, you cannot run kernel-level anti-cheat. Obfuscate client code and use server authority as the primary defense. Accept that client-side hacks (aimbots, wallhacks for visible entities) are harder to prevent in browsers.

---

## 7. Deterministic Lockstep and Rollback Netcode

### 7.1 Deterministic Lockstep

In lockstep, all clients run the same deterministic simulation. Only inputs are transmitted. The simulation does not advance until all players' inputs for the current frame are received.

**How it works:**

1. Each player sends their input for frame N to all other players.
2. No player advances past frame N until all inputs for frame N are received.
3. Since the simulation is deterministic (same inputs produce identical state), all clients have identical game state without transmitting state.

**Bandwidth:** Extremely efficient -- only inputs are sent. For a 4-player RTS, this might be 50-200 bytes/s total.

**Latency:** Input delay = RTT/2 to the slowest player. If the slowest player has 200ms RTT, all players experience 100ms of input delay. This is acceptable for RTS games (StarCraft, Age of Empires) where units have movement animations that mask the delay, but unacceptable for action games.

**Determinism requirement:** The simulation must be bit-identical across all clients. This means:
- No floating-point non-determinism (use fixed-point math or quantize after every operation).
- Same iteration order for all operations.
- Seeded RNG with identical seeds.
- No dependency on frame rate, OS, or hardware.

**When it is appropriate:**
- RTS games (StarCraft, Age of Empires) -- hundreds of units but only occasional player inputs.
- Turn-based games.
- Games where input delay of 50-150ms is acceptable.

**When it is NOT appropriate:**
- Fast-paced action games where input delay is unacceptable.
- Games that cannot guarantee determinism (floating-point physics, third-party libraries).

### 7.2 Rollback Netcode (GGPO-Style)

Rollback extends lockstep by removing the input delay. Instead of waiting for remote inputs, the client predicts them (typically: "the other player pressed the same buttons as last frame") and advances immediately.

**How it works:**

1. Client sends input for frame N and immediately simulates frame N using predicted inputs for remote players.
2. When the actual remote input for frame N arrives (typically 1-4 frames later):
   - If the prediction was correct: no action needed.
   - If the prediction was wrong: **roll back** to the last confirmed state, **re-simulate** all frames from there to the current frame with the corrected inputs.
3. The visual result may "snap" when a misprediction occurs (an opponent's character briefly teleports to a corrected position).

**Performance constraints:**

- The simulation must be fast enough to re-simulate multiple frames in a single frame's time budget. At 60 Hz with 16.67ms per frame, and up to 8 frames of rollback (133ms of latency), the simulation must re-run 8 times in 16.67ms -- roughly 2ms per frame.
- State must be efficiently snapshotable (save/restore the entire game state).

**When it is appropriate:**
- Fighting games (2 players, small state, critical input responsiveness). GGPO was designed specifically for this.
- Small-scale competitive games (1v1, 2v2).

**When it is NOT appropriate:**
- Games with large state (many entities, complex world). Snapshot/restore cost is prohibitive.
- Games with more than ~4 players. Each additional player increases misprediction frequency.
- Games with non-reversible effects (particle systems, audio, complex animations).

### 7.3 Comparison

| Aspect | Lockstep | Rollback | Snapshot Interpolation |
|--------|----------|----------|----------------------|
| **Input delay** | RTT/2 to slowest player | None (predicted) | None (predicted for local player) |
| **Remote player rendering** | Immediate (same frame) | Immediate (may snap on misprediction) | Interpolated, delayed by buffer (50-150ms) |
| **Bandwidth** | Very low (inputs only) | Low (inputs + state checksums) | Medium (state snapshots) |
| **Determinism required** | Strict | Strict | Not required |
| **Player count** | Any (but latency scales with worst connection) | 2-4 practical | Any |
| **Complexity** | Low | High (save/restore/resim) | Medium |
| **Best for** | RTS, turn-based | Fighting games | FPS, action, large player counts |

### 7.4 Recommendation for High Noon

**Snapshot interpolation with client-side prediction** (the current plan) is the correct choice. The game has:
- More than 2 players (rollback misprediction would be frequent).
- Many entities (enemies, bullets) making state snapshot/restore expensive.
- A non-deterministic simulation (using PixiJS renderer, floating-point math in physics).
- A WebSocket transport where lockstep input delay would be noticeable (50-150ms RTT typical).

The local player is predicted (inputs applied immediately, reconciled against server state). Remote players are interpolated between snapshots. Transient entities (bullets) are spawned from events and simulated locally.

---

## 8. Scaling

### 8.1 Room-Based Isolation

Each match (room) is an independent simulation with its own game state, entity IDs, tick counter, and connected players. Rooms share nothing with each other at the game logic level.

**Benefits:**
- A crash or slow tick in one room does not affect others.
- Each room can be placed on a different CPU core or machine.
- Memory is bounded per room (only the entities in that match).
- Player disconnect in one room is isolated.

**Colyseus architecture:** Colyseus natively supports room-based isolation. Each `Room` instance is a separate game loop. Multiple rooms run on a single Node.js process, but rooms can be distributed across processes.

### 8.2 Vertical Scaling (Single Machine)

Before going horizontal, maximize what a single machine can handle:

- **Node.js process per core:** Use Colyseus's built-in clustering or PM2 to run one process per CPU core. A 16-core machine runs 16 processes.
- **Rooms per process:** Each process can handle many rooms. The limit is CPU time per tick. For a 60 Hz simulation with 8 players + 50 enemies, a single room might use 2-5ms per tick. A single Node.js process could handle 3-8 concurrent rooms on a single core.
- **Memory:** Each room's state is small (a few hundred KB for entity data). Memory is rarely the bottleneck; CPU is.

**Rough estimate for High Noon:**
- 60 Hz tick, 5ms per tick per room = 12 rooms per core (with 40% headroom for GC, I/O, OS).
- 8-core machine = ~96 concurrent rooms.
- 4 players per room = ~384 concurrent players per machine.
- This is conservative; optimized ECS simulations can be significantly faster.

### 8.3 Horizontal Scaling (Multiple Machines)

When a single machine is not enough, distribute rooms across multiple machines:

**Architecture:**

```
                    ┌─────────────────┐
                    │   Load Balancer  │
                    │   (NGINX/HAProxy)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │  Game      │ │  Game      │ │  Game      │
        │  Server 1  │ │  Server 2  │ │  Server 3  │
        │  (N rooms) │ │  (N rooms) │ │  (N rooms) │
        └─────┬─────┘ └─────┬─────┘ └─────┴─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────┴────────┐
                    │     Redis       │
                    │  (Presence +    │
                    │   Matchmaking)  │
                    └─────────────────┘
```

**Key components:**

- **Load balancer:** Routes initial connection to a game server. Uses sticky sessions so that after matchmaking assigns a player to a room on Server 2, the WebSocket connection goes directly to Server 2.
- **Redis (Presence):** Shared state for matchmaking. All game servers register their available rooms and capacity. The matchmaking service queries Redis to find a suitable room, then directs the client to the correct server.
- **Colyseus-specific:** Colyseus uses `RedisPresence` and `RedisDriver` for cross-process room discovery. Room creation and joining involves two steps: (1) reserve a seat (any process can handle via Redis), (2) establish WebSocket to the specific process hosting the room.

### 8.4 Stateful vs Stateless

| Layer | Stateful or Stateless | Why |
|-------|----------------------|-----|
| **Game rooms** | Stateful | Game state must be in-memory for 60 Hz simulation. Cannot fetch from Redis 60 times/second. |
| **Matchmaking** | Stateless | Query Redis for room list, pick best room, return server address. Any process can handle this. |
| **Authentication** | Stateless | Validate JWT/session token against a database or auth service. |
| **Leaderboards / progression** | Stateless | Read/write to database. No in-memory state required. |
| **Chat / social** | Either | Can be stateless (pub/sub through Redis) or stateful (persistent connection to a chat server). |

**The fundamental insight:** The game simulation is inherently stateful. You cannot make it stateless. What you can do is:
- Keep the stateful boundary small (just the room).
- Make everything around it stateless (matchmaking, auth, progression).
- Use Redis as the coordination layer between stateful processes.

### 8.5 Database Sync for Persistent State

Game rooms are ephemeral (they exist for the duration of a match). Persistent state (player profiles, progression, unlocks, leaderboards) must be saved to a database.

**Patterns:**

- **Write on match end:** When a room closes, write the match results (XP, progression, unlocks) to the database. This is a single write per player per match.
- **Periodic checkpoint:** For long-running games, checkpoint player state every N minutes to survive crashes.
- **Event sourcing:** Log all match events. Results can be re-derived from the event log. Useful for replays and auditing.
- **Async writes:** Database writes should never block the game loop. Use a queue (Redis, in-process queue) to buffer writes and process them asynchronously.

### 8.6 Multi-Region Deployment

For a competitive game, player latency to the server matters more than almost anything else. Acceptable latency ranges:

| Latency (one-way) | Experience |
|--------------------|------------|
| < 30ms | Excellent. Local region, wired connection. |
| 30-60ms | Good. Same continent, or WiFi to nearby server. |
| 60-100ms | Acceptable. Cross-continent or poor WiFi. Prediction and interpolation mask the latency. |
| 100-150ms | Noticeable. Client-side prediction helps, but hit registration feels slightly off. |
| 150-250ms | Poor. Frequent mispredictions, visible rubber-banding. |
| > 250ms | Unplayable for fast-paced action. |

**Strategy:** Deploy game servers in 2-3 regions (e.g., US-East, EU-West, Asia-East). Matchmaking considers player latency to each region and assigns rooms to the closest region with acceptable ping for all players in the match.

---

## 9. Sources

### Primary References

- [Client-Server Game Architecture -- Gabriel Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html) -- Canonical series on prediction, reconciliation, and interpolation
- [Client-Side Prediction and Server Reconciliation -- Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) -- Detailed rewind-replay algorithm
- [Snapshot Compression -- Gaffer On Games](https://gafferongames.com/post/snapshot_compression/) -- Quantization, bit-packing, delta compression with specific bandwidth numbers
- [Snapshot Interpolation -- Gaffer On Games](https://gafferongames.com/post/snapshot_interpolation/) -- Jitter buffer, interpolation, and extrapolation
- [State Synchronization -- Gaffer On Games](https://gafferongames.com/post/state_synchronization/) -- Priority accumulator, bandwidth budgeting, delta encoding
- [Reliability and Congestion Avoidance over UDP -- Gaffer On Games](https://gafferongames.com/post/reliability_ordering_and_congestion_avoidance_over_udp/) -- Ack redundancy, reliable messaging over UDP
- [Reading and Writing Packets -- Gaffer On Games](https://gafferongames.com/post/reading_and_writing_packets/) -- Bit-packing implementation details
- [Why Can't I Send UDP Packets from a Browser? -- Gaffer On Games](https://gafferongames.com/post/why_cant_i_send_udp_packets_from_a_browser/) -- Browser networking constraints

### Game-Specific References

- [VALORANT's 128-Tick Servers -- Riot Games Technology](https://technology.riotgames.com/news/valorants-128-tick-servers) -- 128 Hz server frame budgets (2.34ms target), 3+ game instances per core
- [Overwatch Gameplay Architecture and Netcode -- GDC Vault](https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and) -- ECS architecture, 63 Hz simulation, adaptive client update rate
- [Source Multiplayer Networking -- Valve Developer Community](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) -- Interpolation, cl_interp, tick rate, lag compensation
- [Server Tick Rates for Popular Games Compared -- Diamond Lobby](https://diamondlobby.com/server-tick-rates/) -- Tick rate comparison table across games

### Architecture and Scaling

- [Colyseus Documentation -- Scalability](https://docs.colyseus.io/deployment/scalability) -- Redis-based horizontal scaling, room distribution
- [Building a Scalable Multiplayer Game Architecture -- Rune](https://developers.rune.ai/blog/building-a-scalable-multiplayer-game-architecture) -- Room-based isolation, stateful servers, load balancing
- [Stateful vs Stateless Design for Game Developers -- Metaplay](https://www.metaplay.io/blog/stateful-vs-stateless-design-key-considerations-for-game-developers) -- When to use each approach

### Netcode Architectures

- [Netcode Architectures Part 2: Rollback -- SnapNet](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/) -- GGPO-style rollback explained
- [Netcode Architectures Part 3: Snapshot Interpolation -- SnapNet](https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/) -- Snapshot interpolation details
- [GGPO -- Rollback Networking SDK](https://www.ggpo.net/) -- Rollback netcode for peer-to-peer games
- [Preparing Your Game for Deterministic Netcode -- yal.cc](https://yal.cc/preparing-your-game-for-deterministic-netcode/) -- Fixed-point math, determinism pitfalls

### Anti-Cheat

- [Why Game Developers Should Incorporate Server-Side Anti-Cheat -- i3D.net](https://www.i3d.net/ban-or-not-comparing-server-client-side-anti-cheat-solutions/) -- Client vs server-side anti-cheat comparison
- [Cheats and Anticheats -- Mirror Networking](https://mirror-networking.gitbook.io/docs/security/cheating) -- Practical anti-cheat patterns

### Transport and Protocol

- [WebRTC vs WebSockets for Multiplayer Games -- Rune](https://developers.rune.ai/blog/webrtc-vs-websockets-for-multiplayer-games) -- Tradeoffs for browser games
- [WebRTC Data Channels -- MDN](https://developer.mozilla.org/en-US/docs/Games/Techniques/WebRTC_data_channels) -- Unreliable channels for games
- [Game Networking Fundamentals -- Generalist Programmer](https://generalistprogrammer.com/tutorials/game-networking-fundamentals-complete-multiplayer-guide-2025/) -- Overview of networking models and patterns

### Community Resources

- [Awesome Game Networking -- GitHub](https://github.com/rumaniel/Awesome-Game-Networking) -- Curated list of game networking resources
- [Game Networking Demystified -- Ruoyu Sun](https://ruoyusun.com/2019/03/28/game-networking-1.html) -- State vs input replication
- [Making Fast-Paced Multiplayer Networked Games is Hard -- Game Developer](https://www.gamedeveloper.com/programming/making-fast-paced-multiplayer-networked-games-is-hard) -- Practical challenges and bandwidth numbers
