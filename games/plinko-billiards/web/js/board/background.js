// The pool hall behind the table, drawn in the scene with no photograph: a panelled
// mahogany wall with a chair rail, wainscot, and baseboard over a dark floor, lit by a
// row of hanging lamps whose pools of light fall down it. The brightest hangs over the
// table. Everything is measured in stage heights from the table's centre line, so a
// wider screen shows more of the hall rather than a stretched one. Nothing in it moves.
export function createBackground(kit) {
  const { T, scene } = kit
  const uniforms = {
    size: { value: new T.Vector2(1, 1) },
    origin: { value: new T.Vector2(0, 0) },
    unit: { value: 1 },
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
      uniform vec2 size;
      uniform vec2 origin;
      uniform float unit;
      varying vec2 vUv;

      const float PITCH = .34;
      const float LAMP_SPACING = 1.25;
      const float LAMP_Y = -.1;
      const float RAIL_TOP = .4;
      const float RAIL_BOTTOM = .435;
      const float BASE_TOP = .74;
      const float FLOOR = .79;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
      }

      // A crisp step at edge, one screen pixel wide whatever the scale.
      float edge(float d) {
        float w = max(fwidth(d), 1e-5);
        return clamp(d / (2. * w) + .5, 0., 1.);
      }

      // Long vertical figure in the mahogany, with a few darker streaks.
      float grain(vec2 p) {
        float g = noise(vec2(p.x * 70. + noise(p * vec2(4., 1.5)) * 3., p.y * 2.5));
        g = .6 * g + .4 * noise(vec2(p.x * 190., p.y * 6.));
        return g;
      }

      // A raised panel centred on p within a stile frame: the field, a bevel lit along
      // its top and left edges and shaded along its bottom and right, and a dark groove
      // where the bevel meets the frame.
      vec3 panel(vec2 p, vec2 extent, float bevel, vec3 wood) {
        vec2 q = abs(p) - extent;
        float d = max(q.x, q.y);
        float inBevel = edge(-d) * edge(d + bevel);
        float inField = edge(-(d + bevel));
        bool vertical = q.x > q.y;
        float lit = vertical ? (p.x < 0. ? 1.35 : .55) : (p.y < 0. ? 1.5 : .5);
        vec3 c = wood * .82;
        c = mix(c, wood * lit, inBevel);
        c = mix(c, wood * 1.08, inField);
        float groove = 1. - (1. - edge(abs(d) - fwidth(d) * 1.2)) * .7;
        return c * groove;
      }

      // One hanging lamp's pool on the wall: a cone opening downward from the shade,
      // with a defined edge and a bright scallop just under it.
      float pool(vec2 p, float cx) {
        vec2 d = vec2(p.x - cx, p.y - LAMP_Y);
        float spread = .14 + max(d.y, 0.) * .42;
        float x = abs(d.x) / spread;
        float cone = (1. - smoothstep(.78, 1., x)) * smoothstep(0., .06, d.y);
        float scallop = exp(-length(d * vec2(1.1, 1.8)) * 6.);
        return cone * exp(-d.y * 1.05) + scallop * .9;
      }

      void main() {
        vec2 px = vec2(vUv.x * size.x, (1. - vUv.y) * size.y);
        vec2 p = (px - origin) / unit;

        float g = grain(p);
        vec3 wood = mix(vec3(.040, .019, .009), vec3(.078, .040, .020), g);

        float cell = floor(p.x / PITCH + .5);
        float lx = p.x - cell * PITCH;
        float upperHalf = .36;
        vec3 upper = panel(vec2(lx, p.y - (RAIL_TOP - .035 - upperHalf)), vec2(PITCH * .5 - .035, upperHalf), .022, wood);
        vec3 lower = panel(vec2(lx, p.y - (RAIL_BOTTOM + BASE_TOP) * .5), vec2(PITCH * .5 - .035, (BASE_TOP - RAIL_BOTTOM) * .5 - .035), .016, wood);

        float t = clamp((p.y - RAIL_TOP) / (RAIL_BOTTOM - RAIL_TOP), 0., 1.);
        vec3 rail = wood * (1.25 - .6 * t);
        rail += vec3(.09, .055, .03) * (1. - edge(abs(p.y - RAIL_TOP - .004) - .0025));
        rail *= 1. - .6 * (1. - edge(RAIL_BOTTOM - p.y - .004));

        vec3 base = wood * .7;
        base += vec3(.05, .03, .016) * (1. - edge(abs(p.y - BASE_TOP - .004) - .002));
        base *= 1. - .5 * (1. - edge(FLOOR - p.y - .004));

        float across = p.x / (1. + max(p.y - FLOOR, 0.) * 3.) / .22;
        vec3 plank = mix(vec3(.022, .012, .007), vec3(.04, .022, .012), hash(vec2(floor(across), 3.)) * .6 + g * .4);
        vec3 floorColour = plank * (1. - (1. - edge(abs(fract(across) - .5) - .485)) * .35);

        vec3 c = upper;
        c = mix(c, rail, edge(p.y - RAIL_TOP));
        c = mix(c, lower, edge(p.y - RAIL_BOTTOM));
        c = mix(c, base, edge(p.y - BASE_TOP));
        c = mix(c, floorColour, edge(p.y - FLOOR));

        vec3 warm = vec3(1., .78, .52);
        float centre = pool(p, 0.);
        float light = .3 + 1.7 * centre;
        for (int i = 1; i <= 3; i++) {
          float f = float(i);
          float side = pool(p, f * LAMP_SPACING) + pool(p, -f * LAMP_SPACING);
          light += side * .85 / (1. + .35 * (f - 1.));
        }
        light *= mix(1., .45, edge(p.y - FLOOR));
        c *= light * warm;

        float haze = noise(vec2(p.x * 2.6, p.y * 3.2) + 3.7) * .6 + noise(vec2(p.x * 5.4, p.y * 6.1)) * .4;
        float cone = pool(p, 0.);
        c += warm * cone * (.02 + .035 * haze);

        float v = length(vec2(p.x * .55, (p.y - .35) * .9));
        c *= 1. - smoothstep(.45, 1.5, v) * .45;
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

    // The hall is measured from the top of the stage, on its centre line.
    resize(width, height, stage) {
      uniforms.size.value.set(width, height)
      uniforms.origin.value.set(stage.x + stage.width / 2, stage.y)
      uniforms.unit.value = stage.height
    },
  }
}
