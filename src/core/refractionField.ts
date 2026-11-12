import { getSurfaceDerivative, type SurfaceProfile } from './surfaceProfiles';

export function calculateDisplacementField(
  profile: SurfaceProfile,
  bezelWidth: number,
  refractiveIndex: number,
  samples: number,
): Float64Array {
  const displacements = new Float64Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);

    const derivative = getSurfaceDerivative(profile, t);

    const normalLen = Math.sqrt(derivative * derivative + 1);
    const sinTheta1 = Math.abs(derivative) / normalLen;

    const sinTheta2 = sinTheta1 / refractiveIndex;

    if (sinTheta2 >= 1) {
      displacements[i] = 0;
      continue;
    }

    const displacement = sinTheta1 - sinTheta2;

    displacements[i] = derivative < 0 ? -displacement : displacement;
  }

  const amplify = 6;

  for (let i = 0; i < samples; i++) {
    displacements[i] *= amplify;
    displacements[i] = Math.max(-1, Math.min(1, displacements[i]));
  }

  return displacements;
}
