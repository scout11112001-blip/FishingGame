/**
 * Реклама за награду. Пока SDK Яндекса не подключён, она выключена: кнопки «за рекламу» видны, но не нажимаются,
 * чтобы награды не раздавались даром. На этапе SDK — REWARDED_ADS = true и здесь ysdk.adv.showRewardedVideo
 * (награду выдавать только в onRewarded), остальная игра не изменится.
 */
export const REWARDED_ADS = false

/** true — игрок досмотрел, награду можно выдавать. */
export async function showRewardedAd(): Promise<boolean> {
  return REWARDED_ADS
}
