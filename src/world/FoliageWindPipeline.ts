import Phaser from 'phaser';
import {
  FEATURE_FOLIAGE_WIND_UV_AMPLITUDE,
  GROUND_GRASS_WIND_UV_AMPLITUDE
} from './worldVisualConfig';

export const GROUND_FOLIAGE_WIND_PIPELINE = 'wildbound-ground-foliage-wind';
export const FEATURE_FOLIAGE_WIND_PIPELINE = 'wildbound-feature-foliage-wind';

// Transparent foliage is sampled from a gently offset UV. This animates every blade and canopy
// pixel in one GPU pass per chunk, rather than re-submitting a vector shape for every plant.
const FOLIAGE_WIND_FRAGMENT_SHADER = `
#define SHADER_NAME WILDBOUND_FOLIAGE_WIND_FS
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uWindStrength;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
void main () {
    float gust = sin(uTime * 1.62 + outTexCoord.x * 8.0 + outTexCoord.y * 19.0) * 0.72
        + sin(uTime * 2.73 + outTexCoord.x * 17.0 + outTexCoord.y * 37.0) * 0.28;
    // UV y starts at the image top. The lower edge stays more stable, while foliage above it
    // gets the larger sweep associated with wind through grass and tree canopies.
    float heightWeight = 0.18 + (1.0 - outTexCoord.y) * 0.82;
    vec2 windUv = vec2(gust * uWindStrength * heightWeight, 0.0);
    vec4 texture = texture2D(uMainSampler, outTexCoord - windUv);
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;
    if (outTintEffect == 1.0) {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    } else if (outTintEffect == 2.0) {
        color = texel;
    }
    gl_FragColor = color;
}`;

class FoliageWindPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  constructor(game: Phaser.Game, private readonly windStrength: number) {
    super({ game, fragShader: FOLIAGE_WIND_FRAGMENT_SHADER });
  }

  onBind(gameObject?: Phaser.GameObjects.GameObject): void {
    super.onBind(gameObject);
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set1f('uWindStrength', this.windStrength);
  }
}

export const registerFoliageWindPipelines = (game: Phaser.Game): void => {
  if (!(game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
    return;
  }

  const pipelines = game.renderer.pipelines;
  pipelines.add(
    GROUND_FOLIAGE_WIND_PIPELINE,
    new FoliageWindPipeline(game, GROUND_GRASS_WIND_UV_AMPLITUDE)
  );
  pipelines.add(
    FEATURE_FOLIAGE_WIND_PIPELINE,
    new FoliageWindPipeline(game, FEATURE_FOLIAGE_WIND_UV_AMPLITUDE)
  );
};
