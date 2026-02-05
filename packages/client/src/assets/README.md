# assets/

Asset loading and management.

## Responsibilities

- Load sprite atlases and textures
- Load audio files
- Load fonts
- Provide typed access to loaded assets
- Handle loading progress

## Key Files

- `AssetLoader.ts` - Central asset loading orchestration
- `manifest.ts` - Asset manifest (what to load)

## Loading Flow

```
1. Show loading screen
2. Load asset manifest
3. Load all assets in parallel
4. Report progress
5. Initialize game when complete
```

## Asset Types

### Textures
- Sprite atlases (TexturePacker JSON)
- Individual images
- Tilesets

### Audio
- Music tracks (streamed)
- Sound effects (buffered)

### Fonts
- Bitmap fonts for PixiJS text
- Web fonts for HTML UI

## Usage Pattern

```typescript
// During init
await AssetLoader.loadAll()

// During gameplay
const texture = AssetLoader.getTexture('player_idle')
const sound = AssetLoader.getSound('shoot')
```

## Dependencies

- `pixi.js` - Texture loading via Assets API
- `howler` - Audio loading
