import { theme } from '../theme.js'

import { BACKGROUND_GLSL } from './background.js'
import {
  BAY_HALF_WIDTH,
  BEND_Y,
  FACE,
  FILLET_RADIUS,
  FIN_HEIGHT,
  FIN_TOP,
  FLOOR,
  FOOT_HALF_WIDTH,
  FRONT_SHEET_Z,
  GLASS_TINT_OPACITY,
  INNER_FIN,
  MOUTH_COLLAR,
  MOUTH_RX,
  MOUTH_RZ,
  MOUTH_Y,
  MOUTH_Z,
  OUTER_FIN,
  SADDLE_Y,
  SLOTS,
  TRAY_FRONT_Z,
  TUBE_TOP,
  bend,
  clamp01,
  finLean,
  finX,
  mouthRoll,
  mouthX,
  paneX,
  sideX,
  taper,
  wallFace,
} from './geometry.js'

// The payout tray is one moulded blue-tinted acrylic body: a thick base slab with
// ice-blue edges, a navy front sheet across the compartments, a tinted back panel, and
// a dark fade above the openings. `pulses` is the shared per-cup glow uniform the
// landing animation raises.
export function buildTray(kit, background, pulses) {
  addBase(kit)
  addFrontSheet(kit, pulses)
  addBackPanel(kit, background, pulses)
  addOpeningShadow(kit)
}

const cupGlows = (T) => Array.from({ length: SLOTS }, (_, i) => new T.Color(theme.cupBand(i, SLOTS).glow))

function addBase(kit) {
  const { T, scene } = kit
  const corner = 0.16
  const bevel = 0.06
  const outline = new T.Shape()
  outline.moveTo(-FOOT_HALF_WIDTH + corner, bevel)
  outline.lineTo(FOOT_HALF_WIDTH - corner, bevel)
  outline.quadraticCurveTo(FOOT_HALF_WIDTH - bevel, bevel, FOOT_HALF_WIDTH - bevel, corner)
  outline.lineTo(FOOT_HALF_WIDTH - bevel, FLOOR - bevel)
  outline.lineTo(-FOOT_HALF_WIDTH + bevel, FLOOR - bevel)
  outline.lineTo(-FOOT_HALF_WIDTH + bevel, corner)
  outline.quadraticCurveTo(-FOOT_HALF_WIDTH + bevel, bevel, -FOOT_HALF_WIDTH + corner, bevel)
  const geometry = new T.ExtrudeGeometry(outline, {
    depth: TRAY_FRONT_Z - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 16,
  })

  const slab = new T.Mesh(
    geometry,
    kit.glass({
      color: 0x86b4ec,
      thickness: 0.9,
      roughness: 0.05,
      envMapIntensity: 1.5,
      attenuationColor: 0x1c4a94,
      attenuationDistance: 1.2,
    }),
  )
  slab.position.z = bevel
  scene.add(slab)

  const edges = new T.Mesh(geometry, fresnelMaterial(T))
  edges.position.z = bevel
  edges.renderOrder = 18
  scene.add(edges)

  // Front face: a polished top edge, a faint body, and a softer bottom edge.
  const faceTexture = kit.linearTexture(8, 128, [0, 0], [0, 128], [
    [0, 'rgba(225,242,255,.85)'],
    [0.08, 'rgba(140,200,255,.3)'],
    [0.3, 'rgba(40,90,180,.06)'],
    [0.75, 'rgba(40,90,180,.05)'],
    [0.94, 'rgba(140,200,255,.25)'],
    [1, 'rgba(225,242,255,.45)'],
  ])
  const face = new T.Mesh(
    new T.PlaneGeometry(2 * FOOT_HALF_WIDTH - 0.2, FLOOR - 0.06),
    new T.MeshBasicMaterial({ map: faceTexture, transparent: true, opacity: 0.8, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  face.position.set(0, FLOOR / 2, TRAY_FRONT_Z + 0.004)
  face.renderOrder = 19
  scene.add(face)

  // Top of the base in front of the compartments: clear, brightening toward the edge.
  const topTexture = kit.linearTexture(8, 64, [0, 64], [0, 0], [
    [0, 'rgba(110,170,255,.06)'],
    [0.7, 'rgba(140,195,255,.16)'],
    [1, 'rgba(210,235,255,.5)'],
  ])
  const topGeometry = new T.PlaneGeometry(2 * FOOT_HALF_WIDTH - 0.16, TRAY_FRONT_Z - FRONT_SHEET_Z - 0.04)
  topGeometry.rotateX(-Math.PI / 2)
  const top = new T.Mesh(
    topGeometry,
    new T.MeshBasicMaterial({ map: topTexture, transparent: true, opacity: 0.6, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  top.position.set(0, FLOOR + 0.002, (FRONT_SHEET_Z + TRAY_FRONT_Z) / 2 + 0.01)
  top.renderOrder = 12
  scene.add(top)

  const line = (x, y, z) => [new T.Vector3(-x, y, z), new T.Vector3(x, y, z)]
  const ice = 0xbfe2ff
  kit.highlight(line(FOOT_HALF_WIDTH - 0.12, FLOOR - 0.018, TRAY_FRONT_Z + 0.004), 0.01, 0.95, { color: ice })
  kit.highlight(line(FOOT_HALF_WIDTH - corner, 0.035, TRAY_FRONT_Z + 0.004), 0.008, 0.7, { color: ice })
  kit.highlight(line(FOOT_HALF_WIDTH - 0.1, FLOOR + 0.004, FRONT_SHEET_Z + 0.05), 0.004, 0.35, { color: ice })
}

// Glass that only catches light at grazing angles, added on top so it never occludes.
function fresnelMaterial(T) {
  return new T.ShaderMaterial({
    uniforms: { rim: { value: new T.Color(0x8ccaff) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vView = -mv.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 rim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = clamp(1. - abs(dot(normalize(vNormal), normalize(vView))), 0., 1.);
        gl_FragColor = vec4(rim * (pow(f, 2.4) * .75 + .04), 1.);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
  })
}

// One flat sheet across all eleven compartments. Under each mouth its top edge traces the
// collar's lower front edge as the camera sees it, then sweeps back up to the walls,
// so the sheet reads as the chute's front wall running up into the rim.
function frontSheetEdge() {
  const innerHalf = taper(INNER_FIN[0], INNER_FIN[1], SADDLE_Y, FIN_TOP - INNER_FIN[1])
  const outerHalf = taper(OUTER_FIN[0], OUTER_FIN[1], SADDLE_Y, FIN_HEIGHT - OUTER_FIN[1] / 2)
  const outerWall = sideX(SADDLE_Y, FRONT_SHEET_Z) - 0.005 - outerHalf

  // Blade faces where they cross the edge: [x, side the bay lies on, blade width]. The
  // edge rises into each one on a concave fillet.
  const posts = [
    [-outerWall, 1, outerHalf],
    [outerWall, -1, outerHalf],
  ]
  for (let fin = 1; fin < SLOTS; fin++) {
    const x = finX(fin) + finLean(fin, SADDLE_Y)
    posts.push([x - innerHalf, -1, 2 * innerHalf], [x + innerHalf, 1, 2 * innerHalf])
  }
  const fillet = (x) =>
    posts.reduce((height, [post, side, width]) => {
      const d = (x - post) * side
      if (d > FILLET_RADIUS || d < -width - 1e-3) return height
      const rise = d <= 0 ? FILLET_RADIUS : FILLET_RADIUS - Math.sqrt(Math.max(0, FILLET_RADIUS ** 2 - (FILLET_RADIUS - d) ** 2))
      return Math.max(height, rise)
    }, 0)

  const mouths = Array.from({ length: SLOTS }, (_, slot) => mouthX(slot))
  const rolls = mouths.map((_, slot) => Math.tan(mouthRoll(slot)))
  const lipFront = (v) =>
    MOUTH_Y - MOUTH_COLLAR + (FRONT_SHEET_Z - MOUTH_Z - MOUTH_RZ * Math.sqrt(Math.max(0, 1 - v * v))) * 0.55

  const dip = (x) => {
    let nearest = 0
    mouths.forEach((m, slot) => {
      if (Math.abs(x - m) < Math.abs(x - mouths[nearest])) nearest = slot
    })
    const u = x - mouths[nearest]
    const reach = Math.abs(u)
    if (reach <= MOUTH_RX) return lipFront(reach / MOUTH_RX) + u * rolls[nearest]
    const start = lipFront(1) + Math.sign(u) * MOUTH_RX * rolls[nearest]
    const wall = wallFace(u > 0 ? nearest + 1 : nearest, -Math.sign(u), SADDLE_Y, FRONT_SHEET_Z)
    const gap = Math.abs(wall - mouths[nearest]) - MOUTH_RX - FILLET_RADIUS * 0.5
    const t = clamp01((reach - MOUTH_RX) / Math.max(gap, 0.02))
    return start + (SADDLE_Y - start) * Math.sqrt(1 - (1 - t) ** 2)
  }

  return (x) => dip(x) + fillet(x)
}

function addFrontSheet(kit, pulses) {
  const { T, scene } = kit
  const edgeY = frontSheetEdge()
  const halfWidth = (y) => sideX(y, FRONT_SHEET_Z) - 0.05
  const right = halfWidth(SADDLE_Y)
  const edge = []
  for (let q = 0; q <= 1600; q++) {
    const x = right - (2 * right * q) / 1600
    edge.push(new T.Vector2(x, edgeY(x)))
  }

  const outline = new T.Shape()
  const edgeStartY = edge[0].y
  outline.moveTo(-halfWidth(FLOOR), FLOOR)
  for (let i = 0; i <= 12; i++) {
    const y = FLOOR + ((edgeStartY - FLOOR) * i) / 12
    outline.lineTo(halfWidth(y), y)
  }
  for (const p of edge) outline.lineTo(p.x, p.y)
  for (let i = 12; i >= 0; i--) {
    const y = FLOOR + ((edgeStartY - FLOOR) * i) / 12
    outline.lineTo(-halfWidth(y), y)
  }
  const geometry = new T.ShapeGeometry(outline)
  const uv = geometry.attributes.uv
  const position = geometry.attributes.position
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (position.getX(i) + BAY_HALF_WIDTH) / (2 * BAY_HALF_WIDTH), (position.getY(i) - FLOOR) / (SADDLE_Y - FLOOR))
  }

  const sheet = new T.Mesh(
    geometry,
    new T.MeshBasicMaterial({ map: sheetTexture(kit), transparent: true, opacity: 0.22, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  sheet.position.z = FRONT_SHEET_Z
  sheet.renderOrder = 18
  scene.add(sheet)

  const tint = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: 0x0a1a33, transparent: true, opacity: 0.3, depthWrite: false }))
  tint.position.z = FRONT_SHEET_Z - 0.004
  tint.renderOrder = 17
  scene.add(tint)

  // Each compartment's glass carries its cup's glow, strongest low down and easing off
  // toward the dip.
  const coloured = new T.Mesh(
    geometry,
    new T.ShaderMaterial({
      uniforms: { colours: { value: cupGlows(T) }, pulse: pulses, strength: { value: GLASS_TINT_OPACITY } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }`,
      fragmentShader: `
        uniform vec3 colours[${SLOTS}];
        uniform float pulse[${SLOTS}];
        uniform float strength;
        varying vec2 vUv;
        void main() {
          int i = int(clamp(floor(vUv.x * ${SLOTS}.), 0., ${SLOTS - 1}.));
          float fx = fract(vUv.x * ${SLOTS}.);
          float side = smoothstep(0., .08, fx) * (1. - smoothstep(.92, 1., fx));
          float v = clamp(vUv.y, 0., 1.);
          float a = strength * (.35 + .65 * (1. - smoothstep(.3, 1., v))) * side * (1. + pulse[i] * 1.2);
          gl_FragColor = vec4(colours[i] * a, 1.);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
  )
  coloured.position.z = FRONT_SHEET_Z - 0.002
  coloured.renderOrder = 17
  scene.add(coloured)

  kit.highlight(edge.map((p) => new T.Vector3(p.x, p.y - 0.004, FRONT_SHEET_Z + 0.004)), 0.005, 0.7)
}

// Light banked against both walls of every compartment, faded down the sheet, with
// polished top and bottom edges.
function sheetTexture(kit) {
  return kit.canvasTexture(
    (g, width, height) => {
      const column = width / SLOTS
      for (let i = 0; i < SLOTS; i++) {
        const x = i * column
        const walls = g.createLinearGradient(x, 0, x + column, 0)
        walls.addColorStop(0, 'rgba(170,215,255,0)')
        walls.addColorStop(0.07, 'rgba(170,215,255,.45)')
        walls.addColorStop(0.15, 'rgba(120,180,255,.1)')
        walls.addColorStop(0.8, 'rgba(255,255,255,0)')
        walls.addColorStop(0.92, 'rgba(255,255,255,.1)')
        walls.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = walls
        g.fillRect(x, 0, column, height)
      }

      g.globalCompositeOperation = 'destination-in'
      const fade = g.createLinearGradient(0, 0, 0, height)
      fade.addColorStop(0, 'rgba(0,0,0,.9)')
      fade.addColorStop(0.35, 'rgba(0,0,0,.35)')
      fade.addColorStop(0.7, 'rgba(0,0,0,.2)')
      fade.addColorStop(1, 'rgba(0,0,0,.6)')
      g.fillStyle = fade
      g.fillRect(0, 0, width, height)

      g.globalCompositeOperation = 'source-over'
      const edges = g.createLinearGradient(0, 0, 0, height)
      edges.addColorStop(0, 'rgba(255,255,255,.3)')
      edges.addColorStop(0.03, 'rgba(255,255,255,0)')
      edges.addColorStop(0.95, 'rgba(255,255,255,0)')
      edges.addColorStop(1, 'rgba(255,255,255,.22)')
      g.fillStyle = edges
      g.fillRect(0, 0, width, height)
    },
    1024,
    256,
  )
}

// Behind the upright part of the pane: the city seen through a panel that darkens to
// navy and takes on a little of each compartment's colour toward the floor.
function addBackPanel(kit, background, pulses) {
  const { T, scene } = kit
  const height = BEND_Y - FLOOR
  const outline = new T.Shape()
  outline.moveTo(-sideX(FLOOR, -0.05), FLOOR)
  for (let i = 0; i <= 12; i++) {
    const y = FLOOR + (height * i) / 12
    outline.lineTo(sideX(y, -0.05), y)
  }
  for (let i = 12; i >= 0; i--) {
    const y = FLOOR + (height * i) / 12
    outline.lineTo(-sideX(y, -0.05), y)
  }
  const geometry = new T.ShapeGeometry(outline)
  const uv = geometry.attributes.uv
  const position = geometry.attributes.position
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (position.getX(i) + BAY_HALF_WIDTH) / (2 * BAY_HALF_WIDTH), (position.getY(i) - FLOOR) / height)
  }

  const material = new T.ShaderMaterial({
    uniforms: { ...background.uniforms, colours: { value: cupGlows(T) }, pulse: pulses },
    vertexShader: `
      varying vec2 vUv;
      varying vec4 vClip;
      void main() {
        vUv = uv;
        vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_Position = vClip;
      }`,
    fragmentShader: `
      ${BACKGROUND_GLSL}
      uniform vec3 colours[${SLOTS}];
      uniform float pulse[${SLOTS}];
      varying vec2 vUv;
      varying vec4 vClip;
      void main() {
        vec3 behind = backgroundAt(vClip.xy / vClip.w * .5 + .5);
        int i = int(clamp(floor(vUv.x * ${SLOTS}.), 0., ${SLOTS - 1}.));
        float v = clamp(vUv.y, 0., 1.);
        float a = 1. - smoothstep(.6, 1., v);
        vec3 tint = colours[i] * (.01 + .05 * pow(1. - v, 2.2)) * (1. + pulse[i] * 1.6) + vec3(.008, .02, .045);
        gl_FragColor = vec4(mix(behind, behind * .1 + tint, a), 1.);
        #include <colorspace_fragment>
      }`,
  })
  const panel = new T.Mesh(geometry, material)
  panel.position.z = -0.05
  scene.add(panel)
}

// A dark fade on the pane just above the mouths, so the openings read as holes.
function addOpeningShadow(kit) {
  const { T, scene } = kit
  const from = TUBE_TOP - 0.5
  const to = FIN_HEIGHT + 1.9
  const steps = 10
  const rows = []
  for (let q = 0; q <= steps; q++) {
    const y = from + ((to - from) * q) / steps
    const halfWidth = paneX(y) - 0.02
    const [by, bz] = bend(y, FACE + 0.012)
    rows.push([new T.Vector3(-halfWidth, by, bz), new T.Vector3(halfWidth, by, bz)])
  }
  const texture = kit.linearTexture(8, 128, [0, 128], [0, 0], [
    [0, 'rgba(2,4,8,0)'],
    [0.16, 'rgba(2,4,8,.86)'],
    [0.55, 'rgba(2,4,8,.55)'],
    [1, 'rgba(2,4,8,0)'],
  ])
  const shadow = new T.Mesh(
    kit.ribbon(rows, (i, side) => [side, i / steps]),
    new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  shadow.renderOrder = 6
  scene.add(shadow)
}
