/**
 * Bayer-dithered reveal filter for building roof overlays.
 *
 * Applied to the roof container. Creates a circular dithered cutout
 * around the player so they can see themselves behind buildings.
 */

import { Filter, GlProgram } from 'pixi.js'

const VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreenCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vScreenCoord = aPosition * uOutputFrame.zw + uOutputFrame.xy;
}
`

const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vTextureCoord;
in vec2 vScreenCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform float uPlayerX;
uniform float uPlayerY;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uDitherScale;

// 4x4 Bayer dithering threshold
float bayerThreshold(vec2 pos) {
    ivec2 p = ivec2(mod(pos, 4.0));
    int idx = p.x + p.y * 4;
    // Bayer 4x4 matrix normalized to 0..1
    float t[16] = float[16](
         0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
         3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    return t[idx];
}

void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a < 0.01) {
        finalColor = color;
        return;
    }

    vec2 playerPos = vec2(uPlayerX, uPlayerY);
    float dist = distance(vScreenCoord, playerPos);

    // 0 = fully transparent (inside inner), 1 = fully opaque (outside outer)
    float opacity = clamp(
        (dist - uInnerRadius) / max(uOuterRadius - uInnerRadius, 0.001),
        0.0, 1.0
    );

    // Bayer dithering at game-pixel scale
    vec2 ditherPos = floor(vScreenCoord / uDitherScale);
    float threshold = bayerThreshold(ditherPos);

    if (opacity <= threshold) {
        discard;
    }

    finalColor = color;
}
`

/** Inner radius in world units — fully transparent inside */
const INNER_RADIUS_WORLD = 32
/** Outer radius in world units — fully opaque outside */
const OUTER_RADIUS_WORLD = 64

export class RoofDitherFilter {
  readonly filter: Filter
  private readonly gameZoom: number

  constructor(gameZoom: number) {
    this.gameZoom = gameZoom

    this.filter = new Filter({
      glProgram: GlProgram.from({
        vertex: VERTEX,
        fragment: FRAGMENT,
      }),
      resources: {
        ditherUniforms: {
          uPlayerX: { value: 0, type: 'f32' },
          uPlayerY: { value: 0, type: 'f32' },
          uInnerRadius: { value: INNER_RADIUS_WORLD * gameZoom, type: 'f32' },
          uOuterRadius: { value: OUTER_RADIUS_WORLD * gameZoom, type: 'f32' },
          uDitherScale: { value: gameZoom, type: 'f32' },
        },
      },
      padding: OUTER_RADIUS_WORLD * gameZoom,
    })
  }

  /**
   * Update player position each frame.
   * @param screenX Player screen X in CSS pixels (from worldContainer.toGlobal)
   * @param screenY Player screen Y in CSS pixels (from worldContainer.toGlobal)
   */
  update(screenX: number, screenY: number): void {
    const u = this.filter.resources.ditherUniforms.uniforms
    u.uPlayerX = screenX
    u.uPlayerY = screenY
  }
}
