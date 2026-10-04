import { TRAINERS } from '../../../server/src/contracts/trainers'
const paths = new Map(TRAINERS.map(trainer => [trainer.id, { art: `/trainers/${trainer.id}/art.webp`, portrait: `/trainers/${trainer.id}/portrait.webp`, atlas: `/trainers/${trainer.id}/atlas.webp`, splash: `/trainers/${trainer.id}/splash.webp`, motion: `/trainers/${trainer.id}/motion.webp` }]))
export const TRAINER_POSES = ['idle', 'prepare', 'throw', 'follow', 'celebrate', 'defeated'] as const
export type TrainerPose = typeof TRAINER_POSES[number]
export const TRAINER_FRAME = { width: 160, height: 200, columns: 6, rows: 2, anchor: { x: 80, y: 194 } } as const
export function trainerAssets(id: string | null | undefined) { return id ? paths.get(id) : undefined }
