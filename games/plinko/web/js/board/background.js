// The night-city backdrop, drawn in the scene so the tinted back panel can sample the
// same pixels behind the board. Two photos of one scene: a wide one and a tall one, and
// the view shows whichever is nearer its own shape, with the photo's anchor height (0
// at the bottom) on the board's band (bandY). A view taller than its photo crops it to
// cover; a wider one shows ZOOM beyond cover, and until the tall photo arrives a narrow
// view shows at least MIN_SPAN of the wide one's width, fading its edges into the ground.
export const BACKGROUND_GLSL = `
uniform sampler2D map;
uniform float has, imageAspect, viewAspect, bandY, anchor;
const float ZOOM = 1.15, MIN_SPAN = .4, SATURATION = 1.12;

float shade(float t) {
  return .3 * (1. - smoothstep(0., .2, t)) + .35 * smoothstep(.7, 1., t);
}

vec3 backgroundAt(vec2 q) {
  vec3 c = vec3(.004, .006, .01);
  if (has > .5) {
    float r = viewAspect / imageAspect;
    float span = r > 1. ? 1. : min(1., max(r * ZOOM, MIN_SPAN));
    float shown = span / r;
    float start = anchor - bandY * shown;
    if (shown <= 1.) start = clamp(start, 0., 1. - shown);
    vec2 uv = vec2((q.x - .5) * span + .5, start + q.y * shown);
    float beyond = max(-uv.y, uv.y - 1.) / shown;
    c = texture2D(map, clamp(uv, 0., 1.)).rgb * (1. - smoothstep(0., .08, beyond));
    c = max(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, SATURATION), 0.);
  }
  c *= 1. - shade(1. - q.y);
  vec2 p = (q - vec2(.5, .58)) / vec2(.55, .6);
  c *= 1. - smoothstep(.45, 1., length(p)) * .2;
  return c;
}
`

// The tall photo's tagline is painted on its pillar, so the frame's own left tagline
// stands down while that photo shows.
const PHOTOS = {
  wide: { url: 'img/city.jpg', anchor: 0.5, paintsTagline: false },
  tall: { url: 'img/city-portrait.jpg', anchor: 0.62, paintsTagline: true },
}

export function createBackground(kit, onLoad) {
  const { T, scene } = kit
  const uniforms = {
    map: { value: null },
    has: { value: 0 },
    imageAspect: { value: 1 },
    viewAspect: { value: 1 },
    bandY: { value: 0.5 },
    anchor: { value: 0.5 },
  }
  const loaded = {}
  let shown = null

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

  // The tall photo suits views narrower than the geometric mean of the two aspects.
  function pick() {
    const { wide, tall } = loaded
    const choice =
      wide && tall
        ? uniforms.viewAspect.value < Math.sqrt(wide.aspect * tall.aspect)
          ? tall
          : wide
        : (wide ?? tall ?? null)
    shown = choice
    if (!choice) return
    uniforms.map.value = choice.texture
    uniforms.imageAspect.value = choice.aspect
    uniforms.anchor.value = choice.anchor
    uniforms.has.value = 1
  }

  for (const [name, photo] of Object.entries(PHOTOS)) {
    new T.TextureLoader().load(photo.url, (texture) => {
      texture.colorSpace = T.SRGBColorSpace
      texture.minFilter = T.LinearMipmapLinearFilter
      texture.generateMipmaps = true
      loaded[name] = { ...photo, texture, aspect: texture.image.width / texture.image.height }
      pick()
      onLoad()
    })
  }

  return {
    uniforms,

    get paintsTagline() {
      return shown?.paintsTagline ?? false
    },

    resize(width, height, stage) {
      uniforms.viewAspect.value = width / height
      uniforms.bandY.value = 1 - (stage.y + stage.height * 0.42) / height
      pick()
    },
  }
}
