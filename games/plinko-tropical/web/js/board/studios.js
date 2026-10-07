// The lighting the board's metals reflect and the light falling on it. Each studio is a
// small scene baked into an environment map: daylight for the steel and the face, a
// warm cabana for the gold, and a crisp one of its own for the mirror pegs and ball.
export function createStudios(T, renderer) {
  return {
    daylight: daylightStudio(T, renderer),
    warm: lampStudio(T, renderer),
    ball: ballStudio(T, renderer),
  }
}

// Sun from high on the right, open sky above, and warm sand bounce below.
export function addDaylight(T, scene) {
  scene.add(new T.HemisphereLight(0xdcecff, 0x6a5238, 1.1))
  const sun = new T.DirectionalLight(0xfff0d8, 1.6)
  sun.position.set(7, 16, 14)
  scene.add(sun)
}

// A bright terrace for the chrome to reflect: warm sky overhead cooling to blue at the
// horizon, sand below, the sun high on the right, and a soft window either side.
function daylightStudio(T, renderer) {
  const studio = domeStudio(T, `
    vec3 sky = mix(vec3(.5, .72, 1.), vec3(1., .96, .9), smoothstep(.1, .85, d.y));
    vec3 sand = vec3(.42, .33, .24);
    colour = mix(sand, sky, smoothstep(-.12, .08, d.y)) * .8;`)
  addPanel(T, studio, new T.CircleGeometry(4, 32), 20, 30, 24, 0xfff2d8, 14)
  addPanel(T, studio, new T.PlaneGeometry(34, 3), 0, 36, 12, 0xffffff, 4)
  addPanel(T, studio, new T.PlaneGeometry(8, 22), -40, 10, 10, 0xf4f8ff, 3)
  addPanel(T, studio, new T.PlaneGeometry(8, 22), 40, 10, 10, 0xfff4e4, 3)
  return new T.PMREMGenerator(renderer).fromScene(studio, 0.02).texture
}

// The shade under a cabana for the gold: a dim warm canopy and dark floor, so polished
// metal shows contrast, lit by the sun, a bright overhead strip, and a row of lantern
// lights low on each side.
function lampStudio(T, renderer) {
  const studio = domeStudio(T, `
    vec3 canopy = vec3(.66, .56, .42);
    vec3 ground = vec3(.07, .055, .04);
    colour = mix(ground, canopy, smoothstep(-.3, .7, d.y)) * .7;`)
  addPanel(T, studio, new T.CircleGeometry(5, 32), 20, 30, 24, 0xfff0d0, 12)
  addPanel(T, studio, new T.PlaneGeometry(30, 2.4), 0, 38, 10, 0xfff6e6, 6)
  addPanel(T, studio, new T.PlaneGeometry(2.6, 20), -36, 6, 14, 0xffe6c4, 5)
  addPanel(T, studio, new T.PlaneGeometry(2.6, 20), 36, 6, 14, 0xffe6c4, 5)
  addPanel(T, studio, new T.PlaneGeometry(40, 3), 0, -14, 34, 0xffd09a, 2)
  return new T.PMREMGenerator(renderer).fromScene(studio, 0.02).texture
}

// The mirror ball's world, drawn with hard edges so the reflections stay crisp on a small
// ball: a sky deepening to saturated blue in front, a thin bright horizon, a dark steel
// floor streaked with gold that warms toward the sides, and gold light behind so the rim
// catches fire. A round skylight high on the right, feathered at its edge so a small peg
// shows a soft glint rather than a square, lays the big highlight; light strips stand at
// either side, and two amber lamps hang low. Directions are in degrees: `az` round from
// the camera, `el` up from the horizon. Only the skylight's top and the strips' tips pass
// the bloom threshold, and only just, so the ball sparkles without a haze.
function ballStudio(T, renderer) {
  const studio = domeStudio(T, `
#define band(v, lo, hi, soft) (smoothstep((lo) - (soft), (lo), v) * (1. - smoothstep((hi), (hi) + (soft), v)))
#define lamp(at, size) smoothstep(cos(radians((size) + 1.)), cos(radians(size)), dot(d, at))
    d = normalize(d);
    float az = degrees(atan(d.x, d.z));
    float el = degrees(asin(clamp(d.y, -1., 1.)));

    vec3 sky = mix(vec3(.02, .09, .34), vec3(.1, .27, .72), smoothstep(15., 88., el));
    vec3 ground = mix(vec3(.025, .05, .12), vec3(.5, .28, .06), smoothstep(.5, 1., abs(d.x)));
    ground = mix(ground, vec3(.3, .16, .035), (1. - smoothstep(-75., -35., el)) * .4);
    ground += vec3(.8, .48, .14) * band(el, -25., -22., 1.5) * .35;
    colour = mix(ground, sky, smoothstep(-11., -7., el));
    colour += vec3(.62, .78, 1.) * band(el, -9.6, -8.4, .5) * .7;

    float behind = (1. - smoothstep(-.95, -.45, d.z)) * (1. - smoothstep(.6, .95, d.y));
    colour = mix(colour, vec3(.85, .5, .12), behind);
    colour += vec3(1., .8, .45) * smoothstep(.975, .995, -d.z) * (1. - smoothstep(.3, .6, d.y)) * .9;

    vec3 skylightAt = normalize(vec3(.49, .87, .09));
    float skylight = smoothstep(cos(radians(26.)), cos(radians(12.)), dot(d, skylightAt));
    vec3 glass = mix(vec3(.8, .88, 1.), vec3(1.16, 1.19, 1.24), smoothstep(40., 72., el));
    colour = mix(colour, glass, skylight);
    float right = band(az, 46., 60., 1.5) * band(el, -4., 24., 2.);
    colour = mix(colour, mix(vec3(.6, .75, .95), vec3(1.08, 1.12, 1.18), smoothstep(-4., 20., el)), right);
    float left = band(az, -106., -84., 1.5) * band(el, 2., 40., 2.);
    colour = mix(colour, mix(vec3(.85, .72, .5), vec3(1.25, 1.2, 1.1), smoothstep(2., 32., el)), left);

    vec3 lampLeft = normalize(vec3(-.94, -.34, -.02));
    vec3 lampRight = normalize(vec3(.89, -.38, -.23));
    colour += vec3(.9, .45, .1) * (exp(-24. * (1. - dot(d, lampLeft))) + exp(-24. * (1. - dot(d, lampRight)))) * .45;
    colour = mix(colour, vec3(1.25, .78, .3), lamp(lampLeft, 11.));
    colour = mix(colour, vec3(1.25, .78, .3), lamp(lampRight, 11.));`)
  return new T.PMREMGenerator(renderer).fromScene(studio).texture
}

// A studio scene inside a sky dome; `shade` sets `colour` from the view direction `d`.
function domeStudio(T, shade) {
  const studio = new T.Scene()
  studio.add(
    new T.Mesh(
      new T.SphereGeometry(50, 64, 32),
      new T.ShaderMaterial({
        side: T.BackSide,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }`,
        fragmentShader: `
          varying vec3 vDir;
          void main() {
            vec3 d = vDir;
            vec3 colour;
            ${shade}
            gl_FragColor = vec4(colour, 1.);
          }`,
      }),
    ),
  )
  return studio
}

// A light panel in a studio, facing its centre.
function addPanel(T, studio, geometry, x, y, z, color, intensity) {
  const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }))
  mesh.position.set(x, y, z)
  mesh.lookAt(0, 0, 0)
  studio.add(mesh)
}
