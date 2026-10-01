import {
  BALL_RADIUS,
  NOTCH_Y,
  PEG_RADIUS,
  PEG_SPACING,
  ROWS,
  ROW_HEIGHT,
  ROW_TOP,
  seeded,
} from './geometry.js'

// The rack: fifty-two numbered balls on the peg positions, the 8-ball on top and the
// rest cycling through 1–15. Each is turned a little so the numbers face the eye at
// different angles, and each casts a real shadow over a soft contact patch.
export function addRack(kit, upper) {
  const { T } = kit
  const geometry = new T.SphereGeometry(PEG_RADIUS, 40, 28)
  const materials = Array.from(
    { length: 15 },
    (_, i) =>
      new T.MeshPhysicalMaterial({
        map: kit.ballTexture(i + 1),
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.1,
      }),
  )
  const random = seeded(19)
  const pegs = new Map()
  let n = 0
  for (let row = 0; row < ROWS; row++) {
    const count = row + 3
    for (let index = 0; index < count; index++) {
      const x = (index - (count - 1) / 2) * PEG_SPACING
      const y = ROW_TOP - row * ROW_HEIGHT
      const number = ((n + 6) % 15) + 1
      n++

      const mesh = new T.Mesh(geometry, materials[number - 1])
      mesh.position.set(x, y, PEG_RADIUS)
      mesh.rotation.set(0.6 + (random() - 0.5) * 0.7, (random() - 0.5) * 0.9, (random() - 0.5) * 1.1)
      mesh.castShadow = true
      upper.add(mesh)

      const shadow = kit.contactShadow(PEG_RADIUS * 3.2, 0.7)
      shadow.position.set(x + 0.015, y - 0.03, 0.004)
      upper.add(shadow)

      const glow = kit.glowSprite(0xffdcaa, 0, PEG_RADIUS * 4.4)
      glow.position.set(x, y, PEG_RADIUS + 0.05)
      glow.renderOrder = 9
      upper.add(glow)

      pegs.set(`${row}-${index}`, { mesh, base: mesh.position.clone(), dir: new T.Vector3(), glow, level: 0 })
    }
  }
  return pegs
}

export function addCueBall(kit, upper) {
  const { T } = kit
  const material = new T.MeshPhysicalMaterial({
    map: kit.cueTexture(),
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.1,
  })
  // The ball and its shadow grow back together from the spot after each drop.
  const spot = new T.Group()
  spot.position.set(0, NOTCH_Y, 0)
  upper.add(spot)

  const ball = new T.Mesh(new T.SphereGeometry(BALL_RADIUS, 48, 32), material)
  ball.position.z = BALL_RADIUS
  ball.rotation.set(0.5, 0.3, 0)
  ball.castShadow = true
  spot.add(ball)

  const shadow = kit.contactShadow(BALL_RADIUS * 3.2, 0.7)
  shadow.position.set(0.015, -0.03, 0.004)
  spot.add(shadow)
  return { spot, ball, material }
}
