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
  // smoothly vertex by vertex.
  function subdivide(source, maxEdge) {
    const geometry = source.index ? source.toNonIndexed() : source
    const positions = geometry.attributes.position.array
    const normals = geometry.attributes.normal?.array ?? null
    const uvs = geometry.attributes.uv?.array ?? null
    const out = { position: [], normal: [], uv: [] }
    const limit = maxEdge * maxEdge

    const vertex = (i) => ({
      p: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
      n: normals ? [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]] : null,
      u: uvs ? [uvs[i * 2], uvs[i * 2 + 1]] : null,
    })
    const midpoint = (a, b) => {
      let n = null
      if (a.n) {
        n = a.n.map((value, k) => value + b.n[k])
        const length = Math.hypot(...n) || 1
        n = n.map((value) => value / length)
      }
      return {
        p: a.p.map((value, k) => (value + b.p[k]) / 2),
        n,
        u: a.u ? a.u.map((value, k) => (value + b.u[k]) / 2) : null,
      }
    }
    const distance2 = (a, b) => (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2

    const stack = []
    for (let i = 0; i < positions.length / 3; i += 3) stack.push([vertex(i), vertex(i + 1), vertex(i + 2)])
    while (stack.length) {
      const [a, b, c] = stack.pop()
      const ab = distance2(a, b)
      const bc = distance2(b, c)
      const ca = distance2(c, a)
      const longest = Math.max(ab, bc, ca)
      if (longest <= limit) {
        for (const v of [a, b, c]) {
          out.position.push(...v.p)
          if (v.n) out.normal.push(...v.n)
          if (v.u) out.uv.push(...v.u)
        }
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
    result.setAttribute('position', new T.Float32BufferAttribute(out.position, 3))
    if (normals) result.setAttribute('normal', new T.Float32BufferAttribute(out.normal, 3))
    if (uvs) result.setAttribute('uv', new T.Float32BufferAttribute(out.uv, 2))
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
