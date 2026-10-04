// Builders shared by every part of the board: canvas-drawn textures, additive glow
// sprites, polished highlight lines, and the glass material recipe.
export function createKit(T, scene) {
  // Adds colour on top of what is behind without darkening it, so glints and washes
  // never occlude the glass or the city.
  const additive = {
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  }

  function canvasTexture(draw, width, height = width) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    draw(canvas.getContext('2d'), width, height)
    const texture = new T.CanvasTexture(canvas)
    texture.colorSpace = T.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }

  function radialTexture(stops) {
    return canvasTexture((g, size) => {
      const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      for (const [offset, color] of stops) gradient.addColorStop(offset, color)
      g.fillStyle = gradient
      g.fillRect(0, 0, size, size)
    }, 128)
  }

  function linearTexture(width, height, from, to, stops) {
    return canvasTexture(
      (g) => {
        const gradient = g.createLinearGradient(...from, ...to)
        for (const [offset, color] of stops) gradient.addColorStop(offset, color)
        g.fillStyle = gradient
        g.fillRect(0, 0, width, height)
      },
      width,
      height,
    )
  }

  const glowTexture = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,.55)'],
    [0.6, 'rgba(255,255,255,.12)'],
    [1, 'rgba(255,255,255,0)'],
  ])

  const shadowTexture = radialTexture([
    [0, 'rgba(0,0,0,.85)'],
    [0.5, 'rgba(0,0,0,.35)'],
    [1, 'rgba(0,0,0,0)'],
  ])

  function glowSprite(color, opacity, width, height = width) {
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity,
        ...additive,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    sprite.scale.set(width, height, 1)
    return sprite
  }

  // A thin bright tube along a polished edge.
  function highlight(points, radius, opacity, { closed = false, parent = scene, color = 0xf2f8ff } = {}) {
    const curve = new T.CatmullRomCurve3(points, closed, 'centripetal')
    const segments = Math.min(1800, Math.max(8, points.length * 2))
    const mesh = new T.Mesh(
      new T.TubeGeometry(curve, segments, radius, 5, closed),
      new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }),
    )
    mesh.renderOrder = 20
    parent.add(mesh)
    return mesh
  }

  function glass(options) {
    return new T.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.12,
      ior: 1.5,
      envMapIntensity: 1.3,
      specularIntensity: 1,
      ...options,
    })
  }

  // Splits every triangle until no edge is longer than maxEdge, so a shape can be bent
  // smoothly vertex by vertex. Triangles share their corners and the midpoints of the
  // edges they split, so each vertex is stored, and bent by the caller, once.
  function subdivide(source, maxEdge) {
    const positions = source.attributes.position.array
    const normals = source.attributes.normal?.array ?? null
    const uvs = source.attributes.uv?.array ?? null
    const position = []
    const normal = []
    const uv = []
    const index = []
    const limit = maxEdge * maxEdge

    // A corner of the source is stored once, however many triangles meet at it; an
    // unindexed source repeats a corner per triangle, so those are matched by value.
    const corners = new Map()
    const corner = (i) => {
      const values = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
      if (normals) values.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
      if (uvs) values.push(uvs[i * 2], uvs[i * 2 + 1])
      const key = source.index ? i : values.join()
      let stored = corners.get(key)
      if (stored === undefined) {
        stored = position.length / 3
        corners.set(key, stored)
        position.push(values[0], values[1], values[2])
        if (normals) normal.push(values[3], values[4], values[5])
        if (uvs) uv.push(values[values.length - 2], values[values.length - 1])
      }
      return stored
    }

    const midpoints = new Map()
    const midpoint = (a, b) => {
      const key = a < b ? a * 0x4000000 + b : b * 0x4000000 + a
      let m = midpoints.get(key)
      if (m !== undefined) return m
      m = position.length / 3
      midpoints.set(key, m)
      for (let k = 0; k < 3; k++) position.push((position[a * 3 + k] + position[b * 3 + k]) / 2)
      if (normals) {
        const x = normal[a * 3] + normal[b * 3]
        const y = normal[a * 3 + 1] + normal[b * 3 + 1]
        const z = normal[a * 3 + 2] + normal[b * 3 + 2]
        const length = Math.hypot(x, y, z) || 1
        normal.push(x / length, y / length, z / length)
      }
      if (uvs) for (let k = 0; k < 2; k++) uv.push((uv[a * 2 + k] + uv[b * 2 + k]) / 2)
      return m
    }
    const distance2 = (a, b) =>
      (position[a * 3] - position[b * 3]) ** 2 +
      (position[a * 3 + 1] - position[b * 3 + 1]) ** 2 +
      (position[a * 3 + 2] - position[b * 3 + 2]) ** 2

    const sourceIndex = source.index?.array ?? null
    const count = sourceIndex ? sourceIndex.length : positions.length / 3
    const stack = []
    for (let i = 0; i < count; i += 3) {
      stack.push(
        sourceIndex
          ? [corner(sourceIndex[i]), corner(sourceIndex[i + 1]), corner(sourceIndex[i + 2])]
          : [corner(i), corner(i + 1), corner(i + 2)],
      )
    }
    while (stack.length) {
      const [a, b, c] = stack.pop()
      const ab = distance2(a, b)
      const bc = distance2(b, c)
      const ca = distance2(c, a)
      const longest = Math.max(ab, bc, ca)
      if (longest <= limit) {
        index.push(a, b, c)
        continue
      }
      if (longest === ab) {
        const m = midpoint(a, b)
        stack.push([a, m, c], [m, b, c])
      } else if (longest === bc) {
        const m = midpoint(b, c)
        stack.push([a, b, m], [a, m, c])
      } else {
        const m = midpoint(c, a)
        stack.push([a, b, m], [m, b, c])
      }
    }

    const result = new T.BufferGeometry()
    result.setAttribute('position', new T.Float32BufferAttribute(position, 3))
    if (normals) result.setAttribute('normal', new T.Float32BufferAttribute(normal, 3))
    if (uvs) result.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    result.setIndex(index)
    return result
  }

  // A ribbon geometry from pairs of points: rows[i] is [left, right].
  function ribbon(rows, uvFor) {
    const position = []
    const uv = []
    const index = []
    rows.forEach((pair, i) => {
      pair.forEach((point, side) => {
        position.push(point.x, point.y, point.z)
        uv.push(...uvFor(i, side))
      })
      if (i < rows.length - 1) {
        const a = 2 * i
        const c = 2 * (i + 1)
        index.push(a, a + 1, c, a + 1, c + 1, c)
      }
    })
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3))
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geometry.setIndex(index)
    return geometry
  }

  return {
    T,
    scene,
    additive,
    canvasTexture,
    radialTexture,
    linearTexture,
    shadowTexture,
    glowSprite,
    highlight,
    glass,
    subdivide,
    ribbon,
  }
}
