const AUDIO_NOISE_FLOOR = 0.015;
const AUDIO_VISUAL_GAIN = 4.5;

/**
 * LiveKit's useTrackVolume already returns a normalized 0-1 RMS value. Remove
 * the low ambient floor and amplify conversational speech for the orb.
 */
export function mapTrackVolumeToVisualIntensity(volume: number): number {
  if (!Number.isFinite(volume)) return 0;

  return Math.min(
    1,
    Math.max(0, (volume - AUDIO_NOISE_FLOOR) * AUDIO_VISUAL_GAIN)
  );
}
