import { TRAINER_FRAME, TRAINER_POSES, type TrainerPose } from '../trainerAssets'

/** Each row is a state, each column a distinct authored frame. */
export const TRAINER_TIMINGS: Readonly<Record<TrainerPose, number>> = Object.freeze({
  idle: 1080,
  prepare: 960,
  throw: 960,
  follow: 960,
  celebrate: 1200,
  defeated: 1440,
})

export function trainerFramePosition(pose: TrainerPose, frame: number) {
  const index = Math.max(0, Math.min(TRAINER_FRAME.columns - 1, Math.floor(frame)))
  return { x: -TRAINER_FRAME.width * index, y: -TRAINER_FRAME.height * TRAINER_POSES.indexOf(pose) }
}

