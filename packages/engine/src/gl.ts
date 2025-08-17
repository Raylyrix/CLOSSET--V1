// GPU UV painting (WebGL2) - soft brush stamping MVP
// Stamps a radial brush footprint into an offscreen UV-space texture with alpha blending.

export type GL = WebGL2RenderingContext;

export interface BrushParams {
  size: number; // diameter in pixels (UV texture space)
  hardness: number; // 0..1 (0 = fully soft edge, 1 = hard)
  opacity: number; // 0..1
  color: [number, number, number]; // 0..1 rgb
  erase?: boolean; // if true, reduce alpha in target (eraser)
}

export interface GLResources {
  gl: GL;
  program: WebGLProgram | null;
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  uvTexture: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  locCenter: WebGLUniformLocation | null;
  locRadius: WebGLUniformLocation | null;
  locHardness: WebGLUniformLocation | null;
  locOpacity: WebGLUniformLocation | null;
  locResolution: WebGLUniformLocation | null;
  locColor: WebGLUniformLocation | null;
  width: number;
  height: number;
}

export class GPUUVPainter {
  res: GLResources | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {}

  init(width: number, height: number) {
    // create offscreen canvas to avoid conflicting with 2D preview canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2') as GL | null;
    if (!gl) return false;
    const res: GLResources = {
      gl, program: null, vao: null, vbo: null, uvTexture: null, fbo: null,
      locCenter: null, locRadius: null, locHardness: null, locOpacity: null, locResolution: null, locColor: null,
      width, height,
    };

    // Create UV texture render target
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    // Clear to transparent once
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Fullscreen quad buffers
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const verts = new Float32Array([
      -1, -1,  1, -1,  -1,  1,
      -1,  1,  1, -1,   1,  1,
    ]);

    // Brush stamping shader
    const vs = `#version 300 es\nlayout(location=0) in vec2 pos; void main(){ gl_Position = vec4(pos,0.0,1.0);} `;
    const fs = `#version 300 es\nprecision highp float; out vec4 frag;\nuniform vec2 uCenterPx;\nuniform float uRadiusPx;\nuniform float uHardness;\nuniform float uOpacity;\nuniform vec2 uResolution;\nuniform vec3 uColor;\nvoid main(){\n  vec2 fragPx = gl_FragCoord.xy;\n  float d = length(fragPx - uCenterPx);\n  float r = max(uRadiusPx, 1.0);\n  float t = clamp(d / r, 0.0, 1.0);\n  // hard core until hardness, then soft falloff to 1
  float edge = smoothstep(uHardness, 1.0, t);\n  float alpha = (1.0 - edge) * uOpacity;\n  frag = vec4(uColor, alpha);\n}`;
    const program = createProgram(gl, vs, fs);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    res.program = program;
    res.vao = vao;
    res.vbo = vbo;
    res.uvTexture = tex;
    res.fbo = fbo;
    res.locCenter = gl.getUniformLocation(program!, 'uCenterPx');
    res.locRadius = gl.getUniformLocation(program!, 'uRadiusPx');
    res.locHardness = gl.getUniformLocation(program!, 'uHardness');
    res.locOpacity = gl.getUniformLocation(program!, 'uOpacity');
    res.locResolution = gl.getUniformLocation(program!, 'uResolution');
    res.locColor = gl.getUniformLocation(program!, 'uColor');
    this.res = res;
    return true;
  }

  // Stamp a soft circle at UV coords (0..1)
  stamp(uv: [number, number], brush: BrushParams) {
    const res = this.res; if (!res) return;
    const gl = res.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.viewport(0, 0, res.width, res.height);
    gl.enable(gl.BLEND);
    if (brush.erase) {
      // Erase alpha: keep RGB, reduce alpha by (1 - srcAlpha)
      gl.blendFuncSeparate(gl.ZERO, gl.ONE, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.useProgram(res.program);
    const cx = uv[0] * res.width;
    const cy = uv[1] * res.height;
    const radius = Math.max(1, brush.size * 0.5);

    gl.uniform2f(res.locCenter, cx, cy);
    gl.uniform1f(res.locRadius, radius);
    gl.uniform1f(res.locHardness, Math.min(1, Math.max(0, brush.hardness)));
    gl.uniform1f(res.locOpacity, Math.min(1, Math.max(0, brush.opacity)));
    gl.uniform2f(res.locResolution, res.width, res.height);
    gl.uniform3f(res.locColor, brush.color[0], brush.color[1], brush.color[2]);

    gl.bindVertexArray(res.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Read back UV texture pixels (RGBA8)
  snapshot(): { width: number; height: number; pixels: Uint8Array } | null {
    const res = this.res; if (!res) return null;
    const gl = res.gl;
    const pixels = new Uint8Array(res.width * res.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.readBuffer?.(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, res.width, res.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { width: res.width, height: res.height, pixels };
  }

  // Expose the internal offscreen canvas for use as a texture source
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  // Replace the current UV texture with provided pixels (RGBA8)
  loadSnapshot(pixels: Uint8Array, width: number, height: number) {
    const res = this.res; if (!res) return;
    const gl = res.gl;
    gl.bindTexture(gl.TEXTURE_2D, res.uvTexture);
    if (width !== res.width || height !== res.height) {
      // Resize texture if dimensions changed
      res.width = width; res.height = height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    }
    // Also draw to FBO once to ensure texture is current
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.uvTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

function createShader(gl: GL, type: number, src: string) {
  const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); }
  return sh;
}

function createProgram(gl: GL, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); }
  return p;
}

