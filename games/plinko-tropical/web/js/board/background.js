// The tropical terrace, drawn in the scene behind the board. Two photos of one view: a
// wide one and a tall one, and the frame shows whichever is nearer its own shape. The
// photo covers the frame, ZOOM beyond cover, centred unless that would crop the
// signboard on its right, whose edge (keepRight) stays on screen. Where the frame is
// wider than the photo, the photo's anchor height (0 at the bottom) sits on the board's
// band (bandY). The photo is softened by a slight blur, BLUR of the frame's height, so the
// ball reads against it. The top darkens a little under the title and the foot under the
// bet panel.
const BACKGROUND_GLSL = `
uniform sampler2D map;
uniform float has, imageAspect, viewAspect, bandY, anchor, keepRight;
const float ZOOM = 1.03, SATURATION = 1.05, BLUR = .003;
const int TAPS = 12;

vec3 backgroundAt(vec2 q) {
  vec3 c = vec3(.03, .08, .12);
  if (has > .5) {
    float r = viewAspect / imageAspect;
    float span = min(1., r) / ZOOM;
    float shown = min(1., 1. / r) / ZOOM;
    float left = clamp(max((1. - span) / 2., keepRight - span), 0., 1. - span);
    float start = clamp(anchor - bandY * shown, 0., 1. - shown);
    vec2 uv = vec2(left + q.x * span, start + q.y * shown);
    vec2 reach = BLUR * vec2(span / viewAspect, shown);
    c = vec3(0.);
    for (int i = 0; i < TAPS; i++) {
      float angle = float(i) * 2.39996;
      float radius = sqrt((float(i) + .5) / float(TAPS));
      c += texture2D(map, uv + reach * radius * vec2(cos(angle), sin(angle)), .5).rgb;
    }
    c /= float(TAPS);
    c = max(mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, SATURATION), 0.);
  }
  c *= 1. - .3 * smoothstep(.72, 1., q.y);
  c *= 1. - .25 * (1. - smoothstep(0., .24, q.y));
  return c;
}
`

// Each photo's signboard carries the right-hand brand line, a word a plank. `planks` are
// the lettering's boxes, [centre x, centre y, width, height, tilt in degrees] in the
// photo's own pixels: the whole plank on the wide photo, and on the tall one the right
// end of each plank, the part a phone's board leaves in view. `keepRight` is the
// signboard's right edge as a fraction of the photo's width.
const PHOTOS = {
  wide: {
    url: 'img/terrace.jpg',
    anchor: 0.42,
    keepRight: 0.99,
    planks: [
      [1764, 359, 200, 78, -8.3],
      [1770, 431, 196, 62, -6],
      [1775, 494, 192, 60, -5.3],
      [1782, 560, 190, 66, -5.5],
    ],
  },
  tall: {
    url: 'img/terrace-portrait.jpg',
    anchor: 0.4,
    keepRight: 0.998,
    planks: [
      [866, 871, 128, 64, -8],
      [872, 936, 116, 62, -5.3],
      [880, 1000, 104, 60, -4.8],
      [888, 1056, 86, 48, -4.7],
    ],
  },
}

const SIGN_WORDS = ['SAME', 'GAME', 'BIGGER', 'VIEWS']
const signFont = (size) => `${size}px "Caveat Brush", cursive`

export function createBackground(kit, onLoad) {
  const { T, scene } = kit
  const uniforms = {
    map: { value: null },
    has: { value: 0 },
    imageAspect: { value: 1 },
    viewAspect: { value: 1 },
    bandY: { value: 0.5 },
    anchor: { value: 0.5 },
    keepRight: { value: 1 },
  }
  const loaded = {}

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

  // The tall photo suits frames narrower than the geometric mean of the two aspects.
  function pick() {
    const { wide, tall } = loaded
    const choice =
      wide && tall
        ? uniforms.viewAspect.value < Math.sqrt(wide.aspect * tall.aspect)
          ? tall
          : wide
        : (wide ?? tall ?? null)
    if (!choice) return
    uniforms.map.value = choice.texture
    uniforms.imageAspect.value = choice.aspect
    uniforms.anchor.value = choice.anchor
    uniforms.keepRight.value = choice.keepRight
    uniforms.has.value = 1
  }

  for (const [name, photo] of Object.entries(PHOTOS)) {
    new T.ImageLoader().load(photo.url, (image) => {
      const texture = new T.CanvasTexture(paintedPhoto(image, photo.planks))
      texture.colorSpace = T.SRGBColorSpace
      texture.minFilter = T.LinearMipmapLinearFilter
      texture.generateMipmaps = true
      loaded[name] = { ...photo, texture, aspect: image.width / image.height }
      pick()
      onLoad()
    })
  }

  return {
    resize(width, height, stage) {
      uniforms.viewAspect.value = width / height
      uniforms.bandY.value = 1 - (stage.y + stage.height * 0.42) / height
      pick()
    },
  }
}

// The photo on a canvas with the brand line painted down its signboard in cream brush
// lettering, one size for every word, the largest that fits each box, following each
// plank's tilt.
function paintedPhoto(image, planks) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const g = canvas.getContext('2d')
  g.drawImage(image, 0, 0)
  g.font = signFont(100)
  g.letterSpacing = '5px'
  const size = Math.min(
    ...planks.map(([, , width, height], i) => Math.min(height * 0.66, (width * 86) / g.measureText(SIGN_WORDS[i]).width)),
  )
  planks.forEach(([x, y, , , tilt], i) => {
    g.save()
    g.translate(x, y)
    g.rotate((tilt * Math.PI) / 180)
    g.font = signFont(size)
    g.letterSpacing = `${size * 0.05}px`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = 'rgba(40,20,5,.6)'
    g.shadowBlur = size * 0.08
    g.shadowOffsetY = size * 0.05
    g.fillStyle = 'rgba(255,245,226,.95)'
    g.fillText(SIGN_WORDS[i], 0, size * 0.05)
    g.restore()
  })
  return canvas
}
