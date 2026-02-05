# net/

Client networking: connection, prediction, and interpolation.

## Responsibilities

- WebSocket connection management
- Send player inputs to server
- Receive and process server snapshots/events
- Client-side prediction for local player
- Interpolation buffer for remote entities
- Clock synchronization with server

## Key Files

- `NetClient.ts` - WebSocket connection, join/reconnect logic
- `ClockSync.ts` - Estimate server tick offset via ping samples
- `Prediction.ts` - Local player prediction and reconciliation
- `Interpolation.ts` - Remote entity smoothing buffer

## Prediction Flow

```
1. Collect input
2. Send InputCmd to server (with sequence number)
3. Immediately apply input to predicted state
4. Store input in unacknowledged buffer
5. On server snapshot:
   a. Find last acknowledged input
   b. Reset to server state
   c. Replay unacknowledged inputs
```

## Interpolation Flow

```
1. Receive snapshot, store in buffer
2. Each render frame:
   a. Find two snapshots bracketing render time
   b. Lerp entity positions between them
   c. Render at interpolated position
```

## Clock Sync

Estimate `serverTick = clientTick + offset`:
- Periodically ping server
- Track RTT samples
- Compute offset with jitter filtering

## Dependencies

- `@high-noon/shared` - Protocol types, serialization
- `../engine` - Integration with game loop
