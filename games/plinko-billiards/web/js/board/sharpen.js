// A contrast-adaptive sharpen over the finished, display-space frame: each pixel is
// pushed away from its four neighbours in proportion to how much headroom it has, and
// never past the darkest or brightest of them, so edges firm up without halos or
// black specks.
export function sharpenShader(T) {
  return {
    name: 'SharpenShader',
    uniforms: {
      tDiffuse: { value: null },
      texel: { value: new T.Vector2(1, 1) },
      amount: { value: 0.35 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 texel;
      uniform float amount;
      varying vec2 vUv;

      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec3 n = texture2D(tDiffuse, vUv + vec2(0., texel.y)).rgb;
        vec3 s = texture2D(tDiffuse, vUv - vec2(0., texel.y)).rgb;
        vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.)).rgb;
        vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.)).rgb;
        vec3 lo = min(c, min(min(n, s), min(e, w)));
        vec3 hi = max(c, max(max(n, s), max(e, w)));
        vec3 headroom = sqrt(clamp(min(lo, 1. - hi) / max(hi, vec3(1e-4)), 0., 1.));
        vec3 weight = headroom * (-1. / mix(8., 5., amount));
        vec3 sharp = (c + (n + s + e + w) * weight) / (1. + 4. * weight);
        gl_FragColor = vec4(clamp(sharp, lo, hi), 1.);
      }`,
  }
}
