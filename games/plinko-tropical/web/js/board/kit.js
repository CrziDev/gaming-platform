// Builders shared by every part of the board: canvas-drawn textures, additive glow
// sprites, and polished highlight lines.
export function createKit(T, scene) {
  // Adds colour on top of what is behind without darkening it, so glints and washes
  // never occlude the board or the terrace.
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

  // A thin tube along an edge: a polished glint, or a soft shadow line in black.
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

  return { T, scene, additive, canvasTexture, radialTexture, glowTexture, shadowTexture, glowSprite, highlight }
}
