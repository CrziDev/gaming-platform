// The night-city backdrop, drawn in the scene so the tinted back panel can sample the
// same pixels behind the board. Cover-fitting the photo on a phone showed about a
// fifth of its width, which upscaled it past its resolution; a narrow screen now shows
// at least MIN_SPAN of the width and every screen ZOOM beyond cover. The photo's band
// is centred on the board (bandY, 0 at the bottom) and its edges fade into the ground.
export const BACKGROUND_GLSL = `
uniform sampler2D map;
uniform float has, imageAspect, viewAspect, bandY;
const float ZOOM = 1.15, MIN_SPAN = .4;

float band(float t) {
  if (t < .22) return mix(.92, .12, t / .22);
  if (t < .42) return mix(.12, 0., (t - .18) / .24);
  if (t < .66) return mix(0., .45, (t - .42) / .24);
  if (t < .84) return mix(.45, .88, (t - .66) / .18);
  return mix(.88, .6, (t - .84) / .16);
}

vec3 backgroundAt(vec2 q) {
  vec3 c = vec3(.004, .006, .01);
  if (has > .5) {
    float r = viewAspect / imageAspect;
    if (r > 1.) {
      c = texture2D(map, vec2(q.x, (q.y - .5) / r + .5)).rgb;
    } else {
      float span = min(1., max(r * ZOOM, MIN_SPAN)), height = r / span;
      vec2 uv = vec2((q.x - .5) * span + .5, (q.y - bandY) / height + .5);
      float beyond = max(-uv.y, uv.y - 1.) * height;
      c = texture2D(map, clamp(uv, 0., 1.)).rgb * (1. - smoothstep(0., .08, beyond));
    }
  }
  c *= 1. - band(1. - q.y);
  vec2 p = (q - vec2(.5, .58)) / vec2(.55, .6);
  c *= 1. - smoothstep(.45, 1., length(p)) * .55;
  return c;
}
`

export function createBackground(kit, url, onLoad) {
  const { T, scene } = kit
  const uniforms = {
    map: { value: null },
    has: { value: 0 },
    imageAspect: { value: 1916 / 821 },
    viewAspect: { value: 1 },
    bandY: { value: 0.5 },
  }

  const material = new T.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * .5 + .5;
        gl_Position = vec4(position.xy, .9999, 1.);
      }`,
    fragmentShader: `
      ${BACKGROUND_GLSL}
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(backgroundAt(vUv), 1.);
        #include <colorspace_fragment>
      }`,
  })
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  quad.renderOrder = -1000
  scene.add(quad)

  new T.TextureLoader().load(url, (texture) => {
    texture.colorSpace = T.SRGBColorSpace
    texture.minFilter = T.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    uniforms.map.value = texture
    uniforms.has.value = 1
    uniforms.imageAspect.value = texture.image.width / texture.image.height
    onLoad()
  })

  return {
    uniforms,

    resize(width, height, stage) {
      uniforms.viewAspect.value = width / height
      uniforms.bandY.value = 1 - (stage.y + stage.height * 0.42) / height
    },
  }
}
