import type { FishSpecies } from '../../core/fish.ts'

// Сила — доля разрывного натяжения стартовой лески у самой крупной особи.
export const ROACH: FishSpecies = { id: 'roach', name: 'Плотва', minWeightKg: 0.05, maxWeightKg: 0.5, pricePerKg: 25, strength: 0.15 }
export const CRUCIAN: FishSpecies = { id: 'crucian', name: 'Карась', minWeightKg: 0.1, maxWeightKg: 0.6, pricePerKg: 20, strength: 0.2 }
export const PERCH: FishSpecies = { id: 'perch', name: 'Окунь', minWeightKg: 0.1, maxWeightKg: 1.2, pricePerKg: 30, strength: 0.3 }
export const BREAM: FishSpecies = { id: 'bream', name: 'Лещ', minWeightKg: 0.5, maxWeightKg: 3, pricePerKg: 25, strength: 0.45 }
export const ZANDER: FishSpecies = { id: 'zander', name: 'Судак', minWeightKg: 0.8, maxWeightKg: 6, pricePerKg: 50, strength: 0.75 }
export const PIKE: FishSpecies = { id: 'pike', name: 'Щука', minWeightKg: 1, maxWeightKg: 8, pricePerKg: 40, strength: 0.8 }
export const CATFISH: FishSpecies = { id: 'catfish', name: 'Сом', minWeightKg: 5, maxWeightKg: 40, pricePerKg: 30, strength: 1.2 }

export const ALL_FISH: readonly FishSpecies[] = [ROACH, CRUCIAN, PERCH, BREAM, ZANDER, PIKE, CATFISH]
