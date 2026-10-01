import {
  BAY_HALF_WIDTH,
  BEND_LENGTH,
  BEND_RADIUS,
  BEND_Y,
  BEVEL,
  CORNER_RADIUS,
  FACE,
  JOIN_Y,
  NOTCH_RADIUS,
  NOTCH_Y,
  PANE_DEPTH,
  PANE_TOP_HALF_WIDTH,
  PEG_RADIUS,
  PEG_SPACING,
  ROWS,
  ROW_BOTTOM,
  ROW_HEIGHT,
  ROW_TOP,
  TILT,
  TOP,
  bend,
  paneX,
} from './geometry.js'

// The bent acrylic pane with its pegs and the ball waiting in the top notch. Pegs and
// the waiting ball live in `upper`, a frame aligned with the leaning part of the pane.
export function buildPane(kit, chromeEnvironment) {
  const { T, scene } = kit
  const shape = paneOutline(T)
  const upper = leaningFrame(T)
  scene.add(upper)

  scene.add(new T.Mesh(bentGlass(kit, shape), kit.glass({ roughness: 0, thickness: 0, envMapIntensity: 1.1 })))
  addSheen(kit, shape)
  addRim(kit, shape)

  const chrome = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.17, envMap: chromeEnvironment, envMapIntensity: 1 })
  const pegs = addPegs(kit, upper, chrome)
  const waitingBall = addWaitingBall(kit, upper, chrome)

  return { upper, pegs, waitingBall, chrome }
}

function leaningFrame(T) {
  const sin = Math.sin(TILT)
  const cos = Math.cos(TILT)
  const upper = new T.Group()
  upper.rotation.x = -TILT
  upper.position.set(
    0,
    BEND_Y + BEND_RADIUS * sin - (BEND_Y + BEND_LENGTH) * cos,
    -BEND_RADIUS * (1 - cos) + (BEND_Y + BEND_LENGTH) * sin,
  )
  return upper
}

// The sides follow the side curve up to rounded top corners; the top edge carries an
// undercut round recess, wider than its opening, that cradles the waiting ball.
function paneOutline(T) {
  const notchRadius = 0.64
  const notchY = TOP - 0.38
  const filletRadius = 0.06
  const filletY = TOP - filletRadius
  const filletX = Math.sqrt((notchRadius + filletRadius) ** 2 - (filletY - notchY) ** 2)
  const filletEnd = Math.atan2(notchY - filletY, -filletX) + (notchY < filletY ? 2 * Math.PI : 0)
  const notchStart = Math.atan2(filletY - notchY, filletX)
  const footX = paneX(0.3)
  const r = CORNER_RADIUS

  const side = []
  for (let i = 1; i <= 48; i++) {
    const y = 0.3 + ((TOP - r - 0.3) * i) / 48
    side.push([paneX(y), y])
  }
  // The corner leaves along the side's own tangent, so the curve carries on unbroken.
  const cornerX = PANE_TOP_HALF_WIDTH + ((paneX(TOP - r) - paneX(TOP - r - 0.01)) / 0.01) * r

  const notch = []
  const filletAngle = (i) => Math.PI / 2 + ((filletEnd - Math.PI / 2) * i) / 12
  for (let i = 0; i <= 12; i++) {
    notch.push([filletX + filletRadius * Math.cos(filletAngle(i)), filletY + filletRadius * Math.sin(filletAngle(i))])
  }
  for (let i = 1; i < 48; i++) {
    const t = notchStart - ((Math.PI + 2 * notchStart) * i) / 48
    notch.push([notchRadius * Math.cos(t), notchY + notchRadius * Math.sin(t)])
  }
  for (let i = 12; i >= 0; i--) {
    notch.push([-filletX - filletRadius * Math.cos(filletAngle(i)), filletY + filletRadius * Math.sin(filletAngle(i))])
  }

  const shape = new T.Shape()
  shape.moveTo(-footX + 0.3, 0)
  shape.lineTo(footX - 0.3, 0)
  shape.quadraticCurveTo(footX, 0, footX, 0.3)
  for (const [x, y] of side) shape.lineTo(x, y)
  shape.quadraticCurveTo(cornerX, TOP, cornerX - r, TOP)
  // Stretched about the top edge so the lean-back foreshortening still reads round.
  for (const [x, y] of notch) shape.lineTo(x, TOP + (y - TOP) * 1.05)
  shape.lineTo(-cornerX + r, TOP)
  shape.quadraticCurveTo(-cornerX, TOP, -PANE_TOP_HALF_WIDTH, TOP - r)
  for (const [x, y] of side.slice(0, -1).reverse()) shape.lineTo(-x, y)
  shape.lineTo(-footX, 0.3)
  shape.quadraticCurveTo(-footX, 0, -footX + 0.3, 0)
  return shape
}

function bentGlass(kit, shape) {
  const { T } = kit
  const extruded = new T.ExtrudeGeometry(shape, {
    depth: PANE_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 36,
  })
  const geometry = kit.subdivide(extruded, 0.4)
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  for (let i = 0; i < position.count; i++) {
    const [y, z, angle] = bend(position.getY(i), position.getZ(i))
    position.setY(i, y)
    position.setZ(i, z)
    const ny = normal.getY(i)
    const nz = normal.getZ(i)
    normal.setY(i, ny * Math.cos(angle) + nz * Math.sin(angle))
    normal.setZ(i, -ny * Math.sin(angle) + nz * Math.cos(angle))
  }
  return geometry
}

// A faint diagonal sheen across the face, over a navy shade behind the peg field that
// keeps the city from competing with the pegs while the rest of the glass shows it clear.
function addSheen(kit, shape) {
  const { T, scene } = kit
  const flat = new T.ShapeGeometry(shape, 24)
  const flatUv = flat.attributes.uv
  const flatPosition = flat.attributes.position
  for (let i = 0; i < flatUv.count; i++) {
    flatUv.setXY(i, (flatPosition.getX(i) + BAY_HALF_WIDTH) / (2 * BAY_HALF_WIDTH), flatPosition.getY(i) / TOP)
  }
  const geometry = kit.subdivide(flat, 0.6)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const [y, z] = bend(position.getY(i), FACE + 0.004)
    position.setY(i, y)
    position.setZ(i, z)
  }

  const texture = kit.linearTexture(256, 256, [0, 0], [256, 256 * 0.7], [
    [0, 'rgba(190,220,255,.3)'],
    [0.2, 'rgba(170,205,255,.08)'],
    [0.36, 'rgba(170,205,255,0)'],
    [0.78, 'rgba(170,205,255,0)'],
    [1, 'rgba(170,205,255,.08)'],
  ])
  const sheen = new T.Mesh(
    geometry,
    new T.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.15, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  sheen.renderOrder = 4
  scene.add(sheen)

  const dim = new T.Mesh(geometry, pegFieldDim(T))
  dim.renderOrder = 3
  scene.add(dim)
}

// Dark navy over the trapezoid the pegs span, each row from the outer edge of its first
// peg to that of its last, with a narrow feather across that edge; the rest of the pane
// stays clear. The sheen's UVs carry the flat pane position; shader colours are linear.
function pegFieldDim(T) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      const float SPACING = ${PEG_SPACING.toFixed(4)}, ROW_HEIGHT = ${ROW_HEIGHT.toFixed(4)};
      const float ROW_TOP = ${ROW_TOP.toFixed(4)}, ROW_BOTTOM = ${ROW_BOTTOM.toFixed(4)};
      const float BAY = ${BAY_HALF_WIDTH.toFixed(4)}, PANE_TOP = ${TOP.toFixed(4)};
      const float RADIUS = ${PEG_RADIUS.toFixed(4)}, FEATHER = SPACING * .07, DIM = .9;
      varying vec2 vUv;
      void main() {
        float x = abs(vUv.x * 2. - 1.) * BAY;
        float y = vUv.y * PANE_TOP;
        float halfWidth = SPACING * (1. + .5 * (ROW_TOP - y) / ROW_HEIGHT);
        float slope = .5 * SPACING / ROW_HEIGHT;
        float side = (x - halfWidth - RADIUS) / sqrt(1. + slope * slope);
        float d = max(side, max(y - ROW_TOP - RADIUS, ROW_BOTTOM - RADIUS - y));
        float alpha = DIM * (1. - smoothstep(-FEATHER, FEATHER, d));
        vec3 navy = vec3(.0025, .0075, .022);
        gl_FragColor = vec4(navy, alpha);
      }`,
  })
}

// Polished edges along the pane's outline above the tray join; below it the side
// plates carry the outline.
function addRim(kit, shape) {
  const { T, scene } = kit
  const rim = [
    new T.Vector2(paneX(JOIN_Y), JOIN_Y),
    ...shape.getSpacedPoints(1400).filter((p) => p.y > JOIN_Y + 1e-3),
    new T.Vector2(-paneX(JOIN_Y), JOIN_Y),
  ]
  const onPane = (x, y, z) => {
    const [by, bz] = bend(y, z)
    return new T.Vector3(x, by, bz)
  }

  // A thin ice-blue edge with a soft halo just outside it.
  kit.highlight(rim.map((p) => onPane(p.x, p.y, FACE)), 0.0075, 1, { color: 0xd2ebff })
  kit.highlight(rim.filter((_, i) => i % 2 === 0).map((p) => onPane(p.x, p.y, 0)), 0.006, 0.35, { color: 0x8ec2ff })

  // A soft band running inward from the front edge, like light caught in the bevel.
  const width = 0.07
  const inward = rim.map((_, i) => {
    const a = rim[Math.max(0, i - 3)]
    const b = rim[Math.min(rim.length - 1, i + 3)]
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return [-(b.y - a.y) / length, (b.x - a.x) / length]
  })
  const offset = (distance) =>
    rim.map((p, i) => [
      onPane(p.x, p.y, FACE + 0.008),
      onPane(p.x + inward[i][0] * distance, p.y + inward[i][1] * distance, FACE + 0.008),
    ])
  const rows = offset(width)
  const texture = kit.linearTexture(256, 4, [0, 0], [256, 0], [
    [0, 'rgba(200,230,255,.9)'],
    [0.08, 'rgba(140,195,255,.45)'],
    [0.2, 'rgba(110,170,255,.2)'],
    [0.5, 'rgba(100,160,250,.1)'],
    [0.62, 'rgba(170,215,255,.24)'],
    [0.7, 'rgba(110,170,255,.05)'],
    [1, 'rgba(110,170,255,0)'],
  ])
  const band = new T.Mesh(
    kit.ribbon(rows, (i, side) => [side, i / rim.length]),
    new T.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.4,
      ...kit.additive,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
    }),
  )
  band.renderOrder = 19
  scene.add(band)

  const halo = new T.Mesh(
    kit.ribbon(offset(-0.06), (i, side) => [side, i / rim.length]),
    new T.MeshBasicMaterial({
      map: kit.linearTexture(64, 4, [0, 0], [64, 0], [
        [0, 'rgba(120,185,255,.7)'],
        [0.3, 'rgba(90,160,255,.22)'],
        [1, 'rgba(90,160,255,0)'],
      ]),
      transparent: true,
      opacity: 0.55,
      ...kit.additive,
      depthWrite: false,
      toneMapped: false,
      side: T.DoubleSide,
    }),
  )
  halo.renderOrder = 19
  scene.add(halo)

  addStreaks(kit, rim, inward, onPane)
}

// Soft vertical light caught inside each side of the bent glass, fading in below the top
// corner and gone by the middle of the board; the left side catches more of it.
function addStreaks(kit, rim, inward, onPane) {
  const { T, scene } = kit
  const width = 0.9
  for (const [sign, strength] of [[-1, 0.13], [1, 0.04]]) {
    const side = rim
      .map((p, i) => [p, inward[i]])
      .filter(([p]) => p.x * sign > PANE_TOP_HALF_WIDTH - 1 && p.y < TOP - CORNER_RADIUS && p.y > JOIN_Y)
    const rows = side.map(([p, [inX, inY]]) => [
      onPane(p.x, p.y, FACE + 0.006),
      onPane(p.x + inX * width, p.y + inY * width, FACE + 0.006),
    ])
    const streak = new T.Mesh(
      kit.ribbon(rows, (i, s) => [s, side[i][0].y / TOP]),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        ...kit.additive,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          }`,
        fragmentShader: `
          const float END = ${((TOP - CORNER_RADIUS) / TOP).toFixed(4)};
          varying vec2 vUv;
          void main() {
            float across = smoothstep(.02, .16, vUv.x) * (1. - smoothstep(.16, .85, vUv.x));
            float along = smoothstep(.36, .8, vUv.y) * (1. - smoothstep(END - .14, END, vUv.y));
            gl_FragColor = vec4(vec3(.62, .8, 1.), ${strength.toFixed(3)} * across * along);
          }`,
      }),
    )
    streak.renderOrder = 4
    scene.add(streak)
  }
}

// Row r holds r + 3 pegs. Each peg keeps a hidden glow that lights when the ball hits it;
// the returned map is keyed "row-index".
function addPegs(kit, upper, chrome) {
  const { T } = kit
  const scale = PEG_RADIUS / 0.17
  const geometry = new T.SphereGeometry(PEG_RADIUS, 32, 20)
  const shadowGeometry = new T.PlaneGeometry(0.46 * scale, 0.46 * scale)
  const shadowMaterial = new T.MeshBasicMaterial({ map: kit.shadowTexture, transparent: true, opacity: 0.6, depthWrite: false })

  const pegs = new Map()
  for (let row = 0; row < ROWS; row++) {
    const count = row + 3
    for (let index = 0; index < count; index++) {
      const x = (index - (count - 1) / 2) * PEG_SPACING
      const y = ROW_TOP - row * ROW_HEIGHT

      const peg = new T.Mesh(geometry, chrome)
      peg.position.set(x, y, FACE + PEG_RADIUS * 0.85)
      upper.add(peg)

      const shadow = new T.Mesh(shadowGeometry, shadowMaterial)
      shadow.position.set(x + 0.06 * scale, y - 0.09 * scale, FACE + 0.006)
      shadow.renderOrder = 5
      upper.add(shadow)

      const rim = kit.glowSprite(0xdfeaff, 0.22, 0.42 * scale)
      rim.position.set(x, y, FACE + PEG_RADIUS * 1.2)
      rim.renderOrder = 9
      upper.add(rim)

      const glint = kit.glowSprite(0xffffff, 0.9, 0.3 * scale)
      glint.position.set(x - 0.045 * scale, y + 0.05 * scale, FACE + PEG_RADIUS * 1.9)
      glint.renderOrder = 10
      upper.add(glint)

      const glow = kit.glowSprite(0xcfe6ff, 0, 0.85 * scale)
      glow.position.copy(peg.position)
      glow.renderOrder = 9
      upper.add(glow)

      pegs.set(`${row}-${index}`, { glow, level: 0 })
    }
  }
  return pegs
}

function addWaitingBall(kit, upper, chrome) {
  const { T } = kit
  const ball = new T.Mesh(new T.SphereGeometry(NOTCH_RADIUS, 48, 32), chrome)
  ball.position.set(0, NOTCH_Y, FACE / 2)
  upper.add(ball)

  const glint = kit.glowSprite(0xffffff, 0.9, 0.34)
  glint.position.set(-0.13, NOTCH_Y + 0.14, FACE / 2 + NOTCH_RADIUS)
  glint.renderOrder = 22
  upper.add(glint)

  const glow = kit.glowSprite(0xdfeaff, 0.25, 1.6)
  glow.position.set(0, NOTCH_Y, FACE / 2 - 0.1)
  glow.renderOrder = 8
  upper.add(glow)

  return ball
}
