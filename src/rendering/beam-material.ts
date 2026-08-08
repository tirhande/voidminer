import * as THREE from "three";

/**
 * 축을 따라 무늬가 흐르는 빔 껍질 재질.
 *
 * 굵기가 일정한 단색 원기둥은 막대기로 보인다. 빛으로 읽히려면 두 가지가
 * 필요하다 — 가장자리가 흐려지는 것과, 안에서 무언가 흐르는 것.
 *
 * 가장자리는 원기둥을 옆에서 볼 때 시선과 표면이 이루는 각으로 만든다. 정면을
 * 보는 면은 진하고 옆으로 돌아간 면은 옅어져서 둥근 빛기둥으로 보인다. 흐름은
 * 축 좌표에 시간을 더해 밝고 어두운 띠를 굴린다.
 *
 * 텍스처를 쓰지 않는다. 에셋 없이 수식으로만 만들면 색과 속도를 코드에서 바로
 * 바꿀 수 있고, 받을 파일이 하나 줄어든다.
 */
export function createBeamShellMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      beamColor: { value: new THREE.Color(color) },
      elapsed: { value: 0 },
      flowSpeed: { value: 1.8 },
      strength: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewDirection;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDirection = normalize(-viewPosition.xyz);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 beamColor;
      uniform float elapsed;
      uniform float flowSpeed;
      uniform float strength;

      varying vec2 vUv;
      varying vec3 vViewDirection;
      varying vec3 vNormal;

      void main() {
        // 시선과 표면이 이루는 각. 옆으로 돌아간 면일수록 옅어져 둥글게 보인다.
        float facing = abs(dot(normalize(vNormal), normalize(vViewDirection)));
        float rim = pow(1.0 - facing, 1.6);

        // 축을 따라 흐르는 띠. 밝고 어두운 마디가 지나가면 정지한 막대기가
        // 아니라 무언가 지나가는 통로로 읽힌다.
        float flow = sin((vUv.y * 9.0 - elapsed * flowSpeed) * 6.28318) * 0.5 + 0.5;

        // 나가는 쪽을 진하게, 닿는 쪽을 옅게. 어느 방향으로 쏘는지가 보인다.
        float taper = mix(1.0, 0.45, vUv.y);

        float alpha = (0.18 + rim * 0.62) * (0.55 + flow * 0.45) * taper * strength;
        gl_FragColor = vec4(beamColor, alpha);
      }
    `,
  });
}
