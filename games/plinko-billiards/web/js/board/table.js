import {
  APRON_HEIGHT,
  APRON_INSET,
  BASE_Y,
  CLOTH_HALF_WIDTH,
  CUSHION_HEIGHT,
  CUSHION_NOSE,
  CUSHION_WIDTH,
  FOOT_Y,
  INNER_HALF_WIDTH,
  NOTCH_Y,
  OUTER_HALF_WIDTH,
  POCKET_R,
  POCKET_Y,
  RAIL_BEVEL,
  RAIL_DEPTH,
  RAIL_HEIGHT,
  RAIL_WIDTH,
  SLOTS,
  TILT,
  TOP,
  slotX,
} from './geometry.js'
import { addPockets } from './pockets.js'
import { addCueBall, addRack } from './rack.js'

// The billiard table. The cloth, cushions, rails, pockets, the rack of object balls,
// and the cue ball waiting on the head spot all live in `upper`, the frame of the
// leaning playing surface; the apron under the foot rail stands upright in the scene.
export function buildTable(kit) {
  const { T, scene } = kit
  const upper = new T.Group()
  upper.rotation.x = -TILT
  upper.position.set(0, BASE_Y, 0)
  scene.add(upper)
  upper.updateMatrixWorld(true)

  const cloth = kit.clothTextures()
  const woodMap = kit.woodTexture()
  woodMap.repeat.set(0.25, 1)

  const materials = {
    cloth: new T.MeshPhysicalMaterial({
      map: cloth.map,
      bumpMap: cloth.bump,
      bumpScale: 0.6,
      roughness: 0.94,
      sheen: 1,
      sheenRoughness: 0.6,
      sheenColor: new T.Color(0x3fb877),
      envMapIntensity: 0.3,
    }),
    wood: woodMaterial(T, woodMap),
    brass: new T.MeshStandardMaterial({ color: 0xd8ac55, metalness: 1, roughness: 0.26, envMapIntensity: 1.4 }),
    leather: new T.MeshStandardMaterial({
      color: 0x3b2215,
      roughness: 0.62,
      bumpMap: kit.leatherBump(),
      bumpScale: 0.8,
      envMapIntensity: 0.6,
    }),
  }

  addCloth(kit, upper, materials.cloth)
  addCushions(kit, upper, materials.cloth)
  addRails(kit, upper, materials.wood)
  addSights(kit, upper)
  const apron = addApron(kit, upper, woodMap)
  const pockets = addPockets(kit, upper, apron, materials)
  const pegs = addRack(kit, upper)
  const cue = addCueBall(kit, upper)

  return { upper, apron, pockets, pegs, waitingBall: cue.spot, cueBall: cue.ball, cueMaterial: cue.material }
}

function woodMaterial(T, map) {
  return new T.MeshPhysicalMaterial({
    map,
    roughness: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.9,
  })
}

// The cloth runs under the cushions to the rails, with a round hole for each pocket, a
// faint head string, and the spot the cue ball waits on.
function addCloth(kit, upper, material) {
  const { T } = kit
  const shape = new T.Shape()
  shape.moveTo(-INNER_HALF_WIDTH, -CUSHION_WIDTH)
  shape.lineTo(INNER_HALF_WIDTH, -CUSHION_WIDTH)
  shape.lineTo(INNER_HALF_WIDTH, TOP + CUSHION_WIDTH)
  shape.lineTo(-INNER_HALF_WIDTH, TOP + CUSHION_WIDTH)
  shape.closePath()
  for (let slot = 0; slot < SLOTS; slot++) {
    const hole = new T.Path()
    hole.absarc(slotX(slot), POCKET_Y, POCKET_R, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const mesh = new T.Mesh(new T.ShapeGeometry(shape, 40), material)
  mesh.receiveShadow = true
  upper.add(mesh)

  const chalk = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.16, depthWrite: false })
  const string = new T.Mesh(new T.PlaneGeometry(2 * CLOTH_HALF_WIDTH, 0.014), chalk)
  string.position.set(0, NOTCH_Y, 0.002)
  upper.add(string)
  const spot = new T.Mesh(new T.CircleGeometry(0.06, 24), chalk.clone())
  spot.material.opacity = 0.5
  spot.position.set(0, NOTCH_Y, 0.003)
  upper.add(spot)
}

// Places an extruded cross-section along a straight edge of the table. The section is
// drawn with x pointing out (along `normal`) and y up out of the cloth; it runs along
// the edge from one end to the other.
function alongEdge(T, geometry, normal, centre, length) {
  const along = new T.Vector3(normal.y, -normal.x, 0)
  const start = centre.clone().addScaledVector(along, -length / 2)
  const matrix = new T.Matrix4().makeBasis(normal, new T.Vector3(0, 0, 1), along).setPosition(start)
  geometry.applyMatrix4(matrix)
  return geometry
}

const EDGES = [
  { normal: [0, -1], centre: [0, 0], length: () => 2 * INNER_HALF_WIDTH },
  { normal: [0, 1], centre: [0, TOP], length: () => 2 * INNER_HALF_WIDTH },
  { normal: [-1, 0], centre: [-CLOTH_HALF_WIDTH, TOP / 2], length: () => TOP + 2 * CUSHION_WIDTH },
  { normal: [1, 0], centre: [CLOTH_HALF_WIDTH, TOP / 2], length: () => TOP + 2 * CUSHION_WIDTH },
]

// Cloth-covered cushions with the classic undercut nose at two-thirds of a ball's
// height.
function addCushions(kit, upper, material) {
  const { T } = kit
  const section = new T.Shape()
  section.moveTo(0, CUSHION_NOSE)
  section.lineTo(0.06, CUSHION_HEIGHT)
  section.lineTo(CUSHION_WIDTH + 0.03, CUSHION_HEIGHT)
  section.lineTo(CUSHION_WIDTH + 0.03, 0)
  section.lineTo(0.1, 0)
  section.closePath()

  for (const edge of EDGES) {
    const length = edge.length()
    const geometry = new T.ExtrudeGeometry(section, { depth: length, bevelEnabled: false })
    const normal = new T.Vector3(edge.normal[0], edge.normal[1], 0)
    const mesh = new T.Mesh(alongEdge(T, geometry, normal, new T.Vector3(edge.centre[0], edge.centre[1], 0), length), material)
    mesh.receiveShadow = true
    mesh.castShadow = true
    upper.add(mesh)
  }
}

// Four mitred mahogany boards around the cushions, bevelled and varnished, with the
// grain running along each board.
function addRails(kit, upper, material) {
  const { T } = kit
  for (const edge of EDGES) {
    const normal = new T.Vector3(edge.normal[0], edge.normal[1], 0)
    const inner = edge.length()
    const outer = inner + 2 * RAIL_WIDTH
    const board = new T.Shape()
    board.moveTo(-inner / 2, 0)
    board.lineTo(inner / 2, 0)
    board.lineTo(outer / 2, RAIL_WIDTH)
    board.lineTo(-outer / 2, RAIL_WIDTH)
    board.closePath()
    const geometry = new T.ExtrudeGeometry(board, {
      depth: RAIL_HEIGHT + RAIL_DEPTH - 2 * RAIL_BEVEL,
      bevelEnabled: true,
      bevelThickness: RAIL_BEVEL,
      bevelSize: 0.045,
      bevelSegments: 4,
    })

    const along = new T.Vector3(normal.y, -normal.x, 0)
    const edgeCentre = new T.Vector3(edge.centre[0], edge.centre[1], 0).addScaledVector(normal, CUSHION_WIDTH)
    edgeCentre.z = -RAIL_DEPTH + RAIL_BEVEL
    geometry.applyMatrix4(new T.Matrix4().makeBasis(along, normal, new T.Vector3(0, 0, 1)).setPosition(edgeCentre))

    const mesh = new T.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    upper.add(mesh)
  }
}

// Mother-of-pearl diamonds inlaid along the head and side rails.
function addSights(kit, upper) {
  const { T } = kit
  const geometry = new T.OctahedronGeometry(1, 0)
  geometry.scale(0.085, 0.045, 0.012)
  const pearl = new T.MeshPhysicalMaterial({
    color: 0xf3eee4,
    roughness: 0.18,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.35,
    envMapIntensity: 1.4,
  })
  const z = RAIL_HEIGHT + 0.004
  const across = CUSHION_WIDTH + RAIL_WIDTH / 2
  const add = (x, y, turn) => {
    const sight = new T.Mesh(geometry, pearl)
    sight.position.set(x, y, z)
    sight.rotation.z = turn ? Math.PI / 2 : 0
    upper.add(sight)
  }
  for (let k = -3; k <= 3; k++) add((k * CLOTH_HALF_WIDTH) / 4, TOP + across, false)
  for (let k = 1; k <= 7; k++) {
    const y = (k * TOP) / 8
    add(-CLOTH_HALF_WIDTH - across, y, true)
    add(CLOTH_HALF_WIDTH + across, y, true)
  }
}

// The apron: an upright mahogany skirt tucked under the foot rail's front edge, with a
// rounded moulding along its top and foot.
function addApron(kit, upper, woodMap) {
  const { T, scene } = kit
  const edge = upper.localToWorld(new T.Vector3(0, FOOT_Y - 0.045, -RAIL_DEPTH))
  const halfWidth = OUTER_HALF_WIDTH - APRON_INSET
  const top = edge.y + 0.06
  const bottom = top - APRON_HEIGHT
  const front = edge.z - 0.06
  const depth = 0.5

  const map = woodMap.clone()
  map.repeat.set((2 * halfWidth) / 4, APRON_HEIGHT)
  map.needsUpdate = true
  const wood = woodMaterial(T, map)

  const body = new T.Mesh(new T.BoxGeometry(2 * halfWidth, APRON_HEIGHT, depth), wood)
  body.position.set(0, top - APRON_HEIGHT / 2, front - depth / 2)
  body.receiveShadow = true
  scene.add(body)

  const trim = woodMaterial(T, woodMap)
  for (const [y, radius] of [[top - 0.05, 0.06], [bottom + 0.09, 0.085]]) {
    const bead = new T.Mesh(new T.CylinderGeometry(radius, radius, 2 * halfWidth + 0.04, 20), trim)
    bead.rotation.z = Math.PI / 2
    bead.position.set(0, y, front)
    scene.add(bead)
  }

  return { halfWidth, top, bottom, front }
}
