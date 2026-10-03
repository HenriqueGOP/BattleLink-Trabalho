import { simulatorDamage, simulatorEffectiveness } from "./adapters/showdown";
import { DAMAGE_ROLLS } from "./types";
import type { DamageContext, DamageRequest, DamageResult, PokemonTypes, TypeId } from "./types";
import { integer, validateDamageContext, validateType, validateTypes } from "./validation";

export function effectiveness(type: TypeId, defenderTypes: PokemonTypes): number {
  validateType(type);
  validateTypes(defenderTypes);
  return simulatorEffectiveness(type, defenderTypes);
}

export function calculateDamage(request: DamageRequest): DamageResult {
  validateDamageContext(request);
  integer(request.roll, 85, 100, "Roll");
  return simulatorDamage(request, [request.roll])[0];
}

/** Ordem crescente de roll: índice 0 = 85%, índice 15 = 100%. */
export function calculateDamageRange(context: DamageContext): readonly DamageResult[] {
  validateDamageContext(context);
  return simulatorDamage(context, DAMAGE_ROLLS);
}
