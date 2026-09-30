import { theme } from '../theme.js'

import {
  BAY_HALF_WIDTH,
  BEND_Y,
  CUP_TOP,
  FACE,
  FIN_BACK_Z,
  FIN_FRONT_Z,
  FIN_HEIGHT,
  FIN_RADIUS,
  FIN_TOP,
  FLOOR,
  INNER_FIN,
  JOIN_Y,
  OUTER_FIN,
  SADDLE_Y,
  SLOTS,
  bend,
  clamp01,
  finLean,
  finX,
  sideInset,
  sideX,
  taper,
} from './geometry.js'

const smooth = (t) => t * t * (3 - 2 * t)
const FIN_REAR_Z = FACE + 0.02

// The fin's front face follows this depth: forward at the top, back to the tray floor.
const frontZ = (y) => FIN_BACK_Z + (FIN_FRONT_Z - FIN_BACK_Z) * smooth(clamp01((y - CUP_TOP + 0.2) / 0.8))

// Full depth back to the pane between compartments; above the shelf the back edge
// sweeps forward into a shallow blade.
const rearZ = (y) => FIN_REAR_Z + (frontZ(y) - 0.16 - FIN_REAR_Z) * smooth(clamp01((y - SADDLE_Y + 0.3) / 0.45))

// Raked glass blades between the compartments, and the side plates that carry the
// outline from the tray up into the pane edge.
export function buildFins(kit) {
  const { T, scene } = kit
  const flat = [0, 0]
  const glow = (slot) => new T.Color(theme.cupBand(Math.min(SLOTS - 1, Math.max(0, slot)), SLOTS).glow)

  for (let fin = 0; fin <= SLOTS; fin++) {
    let x
    let blade
    if (fin === 0) {
      x = -BAY_HALF_WIDTH + 0.005
      blade = bladeGeometry(kit, flat, OUTER_FIN, FIN_HEIGHT, sideInset)
    } else if (fin === SLOTS) {
      x = BAY_HALF_WIDTH - 0.005
      blade = bladeGeometry(kit, OUTER_FIN, flat, FIN_HEIGHT, (y, z) => -sideInset(y, z))
    } else {
      x = finX(fin)
      blade = bladeGeometry(kit, INNER_FIN, INNER_FIN, FIN_TOP, (y) => finLean(fin, y))
    }
    const tint = glow(fin - 1).lerp(glow(fin), 0.5).getHex()

    const walls = new T.Mesh(blade.walls, bladeMaterial(T, WALL_SHADERS, tint))
    walls.position.x = x
    walls.renderOrder = 16
    scene.add(walls)

    const face = new T.Mesh(blade.face, bladeMaterial(T, FACE_SHADERS, tint))
    face.position.x = x
    face.renderOrder = 17
    scene.add(face)

    const shift = (points) => points.map((p) => new T.Vector3(p.x + x, p.y, p.z))
    kit.highlight(shift(blade.edge), 0.01, 0.9)
    kit.highlight(shift(blade.ridge), 0.006, 0.25)
    kit.highlight(shift(blade.back), 0.006, 0.3)

    const tip = kit.glowSprite(0xe6f2ff, 0.12, 0.2)
    tip.position.copy(blade.tip).add(new T.Vector3(x, -0.04, -0.04))
    tip.renderOrder = 22
    scene.add(tip)
  }

  addSidePlates(kit)
}

// Counter-clockwise outline of a blade. `left` and `right` are [base, tip] half-widths;
// [0, 0] is a straight wall, used where an outer fin meets the side plate.
function bladeOutline(left, right, top) {
  const radius = (left[1] + right[1]) / 2
  const centreX = (right[1] - left[1]) / 2
  const tipY = top - radius
  const footRise = 0.07
  const footFlare = 0.035

  const run = (side, widths) => {
    if (!widths[0]) {
      return [
        [0, FLOOR],
        [0, tipY],
      ]
    }
    const points = []
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      const y = FLOOR + t * t * footRise
      points.push([side * (taper(widths[0], widths[1], y, tipY) + (1 - t) ** 2 * footFlare), y])
    }
    for (let i = 1; i <= 40; i++) {
      const y = FLOOR + footRise + ((tipY - FLOOR - footRise) * i) / 40
      points.push([side * taper(widths[0], widths[1], y, tipY), y])
    }
    return points
  }

  const tip = []
  for (let i = 1; i < 20; i++) {
    const a = (Math.PI * i) / 20
    tip.push([centreX + radius * Math.cos(a), tipY + radius * Math.sin(a)])
  }

  return { points: [...run(1, right), ...tip, ...run(-1, left).reverse()], tipY, centreX, radius }
}

// A blade is a front face warped to the fin's depth and raked by `lean(y, z)`, plus
// side walls swept from the pane back to that face.
function bladeGeometry(kit, left, right, top, lean) {
  const { T } = kit
  const { points, tipY, centreX, radius } = bladeOutline(left, right, top)
  const outline = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)))
  const depthSlope = (y) => (frontZ(y + 0.005) - frontZ(y - 0.005)) / 0.01

  // Front face. Each vertex carries (u across the blade, distance to the nearer edge,
  // half-width) so the shader can bank light against the edges.
  const face = kit.subdivide(new T.ShapeGeometry(outline), 0.03)
  const position = face.attributes.position
  const normal = face.attributes.normal
  const edgeData = []
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const clampedY = Math.min(y, tipY)
    const leftX = left[0] ? -taper(left[0], left[1], clampedY, tipY) : 0
    const rightX = right[0] ? taper(right[0], right[1], clampedY, tipY) : 0
    const width = Math.max(rightX - leftX, 1e-3)
    const u = clamp01((x - leftX) / width)
    const toEdge = y > tipY ? Math.max(0, radius - Math.hypot(x - centreX, y - tipY)) : Math.min(u, 1 - u) * width
    edgeData.push(u, toEdge, width / 2)

    const slope = depthSlope(y)
    const length = Math.hypot(slope, 1)
    position.setXYZ(i, x + lean(y, frontZ(y)), y, frontZ(y) + 0.004)
    normal.setXYZ(i, 0, -slope / length, 1 / length)
  }
  face.setAttribute('bladeEdge', new T.Float32BufferAttribute(edgeData, 3))

  const spaced = outline.getSpacedPoints(220)
  const tangentAt = (i) => {
    const a = spaced[Math.max(0, i - 1)]
    const b = spaced[Math.min(spaced.length - 1, i + 1)]
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return [(b.x - a.x) / length, (b.y - a.y) / length]
  }

  // Side walls, raked like the face.
  const wallPosition = []
  const wallNormal = []
  const wallIndex = []
  spaced.forEach((p, i) => {
    const [tx, ty] = tangentAt(i)
    for (const z of [rearZ(p.y), frontZ(p.y)]) {
      const leanY = (lean(p.y + 0.005, z) - lean(p.y - 0.005, z)) / 0.01
      const leanZ = (lean(p.y, z + 0.005) - lean(p.y, z - 0.005)) / 0.01
      const nx = ty
      const ny = -tx - leanY * nx
      const nz = -leanZ * nx
      const length = Math.hypot(nx, ny, nz) || 1
      wallPosition.push(p.x + lean(p.y, z), p.y, z)
      wallNormal.push(nx / length, ny / length, nz / length)
    }
    if (i < spaced.length - 1) {
      const a = 2 * i
      wallIndex.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const walls = new T.BufferGeometry()
  walls.setAttribute('position', new T.Float32BufferAttribute(wallPosition, 3))
  walls.setAttribute('normal', new T.Float32BufferAttribute(wallNormal, 3))
  walls.setIndex(wallIndex)

  // Polished edges: the front outline pushed just outside the face, skipping the foot
  // and any straight outer wall; the ridge along the top; and the back edge where the
  // blade sweeps forward out of the compartment wall.
  const edge = []
  spaced.forEach((p, i) => {
    if (p.y < FLOOR + 0.1 || (Math.abs(p.x) < 1e-3 && p.y < tipY - 1e-3)) return
    const [tx, ty] = tangentAt(i)
    edge.push(new T.Vector3(p.x + ty * 0.01 + lean(p.y, frontZ(p.y)), p.y - tx * 0.01, frontZ(p.y) + 0.01))
  })
  const crestY = tipY + radius + 0.004
  const ridge = [
    new T.Vector3(centreX + lean(crestY, rearZ(crestY)), crestY, rearZ(crestY) + 0.01),
    new T.Vector3(centreX + lean(crestY, frontZ(crestY)), crestY, frontZ(crestY)),
  ]
  const back = []
  for (let i = 0; i <= 24; i++) {
    const y = SADDLE_Y - 0.3 + ((tipY - SADDLE_Y + 0.3) * i) / 24
    back.push(new T.Vector3(centreX + lean(y, rearZ(y)), y, rearZ(y) + 0.004))
  }
  const tip = new T.Vector3(centreX + lean(crestY, frontZ(crestY)), crestY, frontZ(crestY))

  return { face, walls, edge, ridge, back, tip }
}

// The front face reads as a thick glass blade: light banked against both edges, a thin
// inset bevel line and one streak over a faint body, with the bay colours washing up
// from the base.
const FACE_SHADERS = {
  vertex: `
    attribute vec3 bladeEdge;
    varying vec3 vEdge;
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vY;
    void main() {
      vEdge = bladeEdge;
      vY = position.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.);
      vView = -mv.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    uniform vec3 rim, tint;
    uniform float y0, y1;
    varying vec3 vEdge;
    varying vec3 vNormal;
    varying vec3 vView;
    varying float vY;
    void main() {
      // Multisampling can shade an edge pixel just outside a thin triangle near the tip,
      // extrapolating these past their range; unclamped, exp(-e / .011) overflows.
      float u = clamp(vEdge.x, 0., 1.), e = max(vEdge.y, 0.), hw = max(vEdge.z, 1e-3);
      float f = clamp(1. - abs(dot(normalize(vNormal), normalize(vView))), 0., 1.);
      float g = .04 + exp(-e / .011) * .32 + exp(-e / (hw * .8)) * .1
        + exp(-pow((e - hw * .38) / .005, 2.)) * .15 + exp(-pow((u - .3) / .09, 2.)) * .08 + pow(f, 2.4) * .3;
      vec3 c = rim * g;
      float t = step(y0, vY) * (1. - smoothstep(y0, y1, vY));
      c += tint * t * t * .22;
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}

// The side walls catch light only at grazing angles and fade toward the back, so the
// depth reads without a milky slab.
const WALL_SHADERS = {
  vertex: `
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.);
      vView = -mv.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    uniform vec3 rim, tint;
    uniform float y0, y1, z0, z1;
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vPosition;
    void main() {
      float f = clamp(1. - abs(dot(normalize(vNormal), normalize(vView))), 0., 1.);
      float d = mix(.25, 1., smoothstep(z0, z1, vPosition.z));
      vec3 c = rim * (.03 + pow(f, 1.8) * .4) * d;
      float t = step(y0, vPosition.y) * (1. - smoothstep(y0, y1, vPosition.y));
      c += tint * t * t * .1 * d;
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}

function bladeMaterial(T, shaders, tint) {
  return new T.ShaderMaterial({
    uniforms: {
      rim: { value: new T.Color(0xd8e6ff) },
      tint: { value: new T.Color(tint) },
      y0: { value: FLOOR },
      y1: { value: CUP_TOP + 0.5 },
      z0: { value: FIN_REAR_Z },
      z1: { value: FIN_FRONT_Z },
    },
    vertexShader: shaders.vertex,
    fragmentShader: shaders.fragment,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  })
}

// Each side plate is the outer fin's profile whose top sweeps back into the pane edge,
// so the outline runs unbroken from the tray to the pane.
function addSidePlates(kit) {
  const { T, scene } = kit
  const thickness = 0.06
  const [joinY, joinZ, joinAngle] = bend(JOIN_Y, FACE)
  const [backY, backZ] = bend(JOIN_Y, 0)

  const traceEdge = (path) => {
    for (let i = 1; i <= 16; i++) {
      const y = CUP_TOP - 0.2 + (0.8 * i) / 16
      path.lineTo(frontZ(y), y)
    }
    path.lineTo(FIN_FRONT_Z, FIN_HEIGHT - FIN_RADIUS)
    path.absarc(FIN_FRONT_Z - FIN_RADIUS, FIN_HEIGHT - FIN_RADIUS, FIN_RADIUS, 0, Math.PI / 2, false)
    path.bezierCurveTo(
      FIN_FRONT_Z - FIN_RADIUS - 0.35,
      FIN_HEIGHT + 0.02,
      joinZ + 0.3 * Math.sin(joinAngle),
      joinY - 0.3 * Math.cos(joinAngle),
      joinZ,
      joinY,
    )
  }

  // The profile is drawn in (z, y) and turned to face sideways.
  const profile = new T.Shape()
  profile.moveTo(0, FLOOR)
  profile.lineTo(FIN_BACK_Z, FLOOR)
  traceEdge(profile)
  profile.lineTo(backZ, backY)
  profile.lineTo(0, BEND_Y)
  profile.lineTo(0, FLOOR)
  const geometry = new T.ExtrudeGeometry(profile, { depth: thickness, bevelEnabled: false, curveSegments: 28 })
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(thickness / 2, 0, 0)

  const edgePath = new T.Path()
  edgePath.moveTo(FIN_BACK_Z, FLOOR)
  traceEdge(edgePath)
  const edgePoints = edgePath.getSpacedPoints(90)

  // Full thickness below the fins, thinning to nothing where the plate meets the pane.
  const thicknessAt = (y) => 1 - smooth(clamp01((y - FIN_HEIGHT) / (backY - FIN_HEIGHT)))
  const material = kit.glass({ side: T.DoubleSide })

  for (const side of [1, -1]) {
    const plate = geometry.clone()
    const position = plate.attributes.position
    const normal = plate.attributes.normal
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i)
      const z = position.getZ(i)
      const slopeY = (-side * (sideInset(y + 0.005, z) - sideInset(y - 0.005, z))) / 0.01
      const slopeZ = (-side * (sideInset(y, z + 0.005) - sideInset(y, z - 0.005))) / 0.01
      const nx = normal.getX(i)
      const ny = normal.getY(i) - slopeY * nx
      const nz = normal.getZ(i) - slopeZ * nx
      const length = Math.hypot(nx, ny, nz) || 1
      const x = (side * thickness) / 2 + (position.getX(i) - (side * thickness) / 2) * thicknessAt(y) - side * sideInset(y, z)
      position.setX(i, x)
      normal.setXYZ(i, nx / length, ny / length, nz / length)
    }
    const mesh = new T.Mesh(plate, material)
    mesh.position.x = side * (BAY_HALF_WIDTH - thickness / 2)
    scene.add(mesh)

    kit.highlight(
      edgePoints.map((q) => new T.Vector3(side * sideX(q.y, q.x), q.y, q.x)),
      0.014,
      0.8,
    )
  }
}
