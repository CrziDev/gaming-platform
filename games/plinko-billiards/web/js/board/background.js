// The pool hall behind the table, drawn in the scene with no photograph: dark
// panelled walls, a warm cone from a lamp hanging above the table, a still haze in the
// cone, and a vignette. Nothing in it moves.
export function createBackground(kit) {
  const { T, scene } = kit
  const uniforms = {
    viewAspect: { value: 1 },
    lamp: { value: new T.Vector2(0.5, 1) },
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
      uniform float viewAspect;
      uniform vec2 lamp;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0., a = .5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= .5; }
        return v;
      }

      void main() {
        vec2 q = vUv;
        vec2 p = vec2((q.x - lamp.x) * viewAspect, q.y);

        float px = p.x * 2.4 + .5;
        float seam = abs(fract(px) - .5);
        float grain = fbm(vec2(px * 1.4, q.y * 16.));
        vec3 wall = mix(vec3(.034, .018, .010), vec3(.062, .034, .018), grain);
        wall *= .7 + .3 * smoothstep(.5, .46, seam);
        wall *= mix(.8, 1., step(.32, q.y));

        vec2 d = vec2(p.x, lamp.y - q.y);
        float spread = .16 + max(d.y, 0.) * .55;
        float cone = (1. - smoothstep(.5, 1., abs(d.x) / spread)) * smoothstep(-.02, .1, d.y);
        float haze = fbm(vec2(p.x * 2.6, q.y * 3.2) + 3.7);
        vec3 warm = vec3(1., .76, .48);

        vec3 c = wall * (.5 + 1.6 * cone * exp(-d.y * 1.2));
        c += warm * cone * exp(-d.y * 1.5) * (.035 + .06 * haze);
        c += warm * .2 * exp(-length(d * vec2(1., 1.7)) * 5.5);

        float v = length((q - vec2(lamp.x, .56)) * vec2(1., .9));
        c *= 1. - smoothstep(.3, .95, v) * .75;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  })
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  quad.renderOrder = -1000
  scene.add(quad)

  return {
    uniforms,

    // The lamp hangs over the middle of the stage, a little above its top edge.
    resize(width, height, stage) {
      uniforms.viewAspect.value = width / height
      uniforms.lamp.value.set((stage.x + stage.width / 2) / width, 1 - (stage.y - stage.height * 0.06) / height)
    },
  }
}
