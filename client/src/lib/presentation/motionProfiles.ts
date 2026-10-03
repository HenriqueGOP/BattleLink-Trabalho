import { speciesById } from '../catalog'

export type MotionProfile = 'light' | 'heavy' | 'flying' | 'floating' | 'low'

const floating = new Set(
  'gastly haunter gengar misdreavus mismagius duskull dusclops dusknoir rotom unown solosis duosion reuniclus baltoy claydol bronzor bronzong magnemite magneton magnezone chimecho chingling lunatone solrock cryogonal elgyem beheeyem porygon porygon2 porygonz castform koffing weezing beldum metang metagross mew celebi jirachi victini uxie mesprit azelf hoopa klefki comfey flabebe floette florges spiritomb darkrai miraidon'.split(
    ' '
  )
)
const heavy = new Set(
  'snorlax munchlax slaking wailmer wailord donphan copperajah hippopotas hippowdon rhyhorn rhydon rhyperior tyranitar aggron lairon hariyama avalugg cetitan cetoddle melmetal regirock registeel regice regigigas groudon kyogre zamazenta zacian dialga palkia giratina arceus hariyama slowbro slowking mudsdale mudbray dondozo garganacl bellibolt steelix onix bastiodon torterra venusaur camerupt torkoal golem coalossal excadrill kingambit greattusk irontreads'.split(
    ' '
  )
)
const low = new Set(
  'ekans arbok seviper sandaconda silicobra serperior milotic dratini dragonair gyarados caterpie weedle wurmple venipede scolipede metapod kakuna silcoon cascoon orthworm dunsparce dudunsparce wiglett wugtrio diglett dugtrio staryu starmie shellder cloyster'.split(
    ' '
  )
)

/** Flying é fallback; espécies sem asas podem ter um perfil explícito de flutuação. */
export function motionProfile(speciesId: string): MotionProfile {
  if (!speciesById(speciesId)) return 'light'
  if (floating.has(speciesId)) return 'floating'
  if (heavy.has(speciesId)) return 'heavy'
  if (low.has(speciesId)) return 'low'
  return speciesById(speciesId)?.types.includes('flying') ? 'flying' : 'light'
}
